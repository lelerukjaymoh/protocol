import { BigNumberish, utils } from 'ethers';
import { AddressLike, BuidlerProvider } from '@crestproject/crestproject';
import { configureTestDeployment } from '../deployment';
import {
  requestShares,
  setupFundWithParams,
  kyberTakeOrderArgs,
  assetTransferArgs,
  takeOrderSelector,
  takeOrderSignature,
} from '../utils';

let tx;

async function snapshot(provider: BuidlerProvider) {
  const deployment = await configureTestDeployment()(provider);
  const {
    system: { kyberAdapter, sharesRequestor, fundFactory },
    config: {
      deployer,
      tokens: { weth },
    },
  } = deployment;

  // Deploy fund
  const fund = await setupFundWithParams({
    adapters: [kyberAdapter],
    factory: fundFactory,
    manager: deployer,
    denominationAsset: weth,
  });

  // Invest in fund (immediately grants shares since it is the first investment)
  await requestShares({
    denominationAsset: weth,
    fundComponents: fund,
    sharesRequestor,
    investmentAmount: utils.parseEther('100'),
  });

  return {
    ...deployment,
    fund,
  };
}

describe('KyberAdapter', () => {
  describe('constructor', () => {
    it('sets exchange', async () => {
      const {
        system: { kyberAdapter },
        config: {
          integratees: { kyber },
        },
      } = await provider.snapshot(snapshot);

      tx = kyberAdapter.EXCHANGE();
      await expect(tx).resolves.toBe(kyber);
    });

    it('sets registry', async () => {
      const {
        system: { kyberAdapter, registry },
      } = await provider.snapshot(snapshot);

      tx = kyberAdapter.REGISTRY();
      await expect(tx).resolves.toBe(registry.address);
    });
  });

  describe('parseAssetsForMethod', () => {
    it('does not allow a bad selector', async () => {
      const {
        system: { kyberAdapter },
        config: {
          tokens: { mln, weth },
        },
      } = await provider.snapshot(snapshot);

      const args = await kyberTakeOrderArgs(mln, 1, weth, 1);
      tx = kyberAdapter.parseAssetsForMethod(utils.randomBytes(4), args);
      await expect(tx).rejects.toBeRevertedWith('_selector invalid');

      tx = kyberAdapter.parseAssetsForMethod(takeOrderSelector, args);
      await expect(tx).resolves.toBeTruthy();
    });

    it('generates expected output', async () => {
      const {
        system: { kyberAdapter },
        config: {
          tokens: { mln, weth },
        },
      } = await provider.snapshot(snapshot);

      const incomingAsset = mln;
      const incomingAmount = utils.parseEther('1');
      const outgoingAsset = weth;
      const outgoingAmount = utils.parseEther('1');

      const takeOrderArgs = await kyberTakeOrderArgs(
        incomingAsset,
        incomingAmount,
        outgoingAsset,
        outgoingAmount,
      );

      const {
        incomingAssets_,
        spendAssets_,
        spendAssetAmounts_,
        minIncomingAssetAmounts_,
      } = await kyberAdapter.parseAssetsForMethod(
        takeOrderSelector,
        takeOrderArgs,
      );

      expect({
        incomingAssets_,
        spendAssets_,
        spendAssetAmounts_,
        minIncomingAssetAmounts_,
      }).toMatchObject({
        incomingAssets_: [incomingAsset.address],
        spendAssets_: [outgoingAsset.address],
        spendAssetAmounts_: [outgoingAmount],
        minIncomingAssetAmounts_: [incomingAmount],
      });
    });
  });

  describe('takeOrder', () => {
    it('can only be called by a valid fund vault', async () => {
      const {
        fund: { vault },
        system: { kyberAdapter },
        config: {
          tokens: { mln, weth },
        },
      } = await provider.snapshot(snapshot);
      const amount = utils.parseEther('1');

      const takeOrderArgs = await kyberTakeOrderArgs(mln, amount, weth, amount);
      const transferArgs = await assetTransferArgs(
        kyberAdapter,
        takeOrderSelector,
        takeOrderArgs,
      );

      // Reverts without a message because __isVault() asks the sender for HUB(), which an EOA doesn't have
      tx = kyberAdapter.takeOrder(takeOrderArgs, transferArgs);
      await expect(tx).rejects.toBeReverted();

      tx = vault.callOnIntegration(
        kyberAdapter,
        takeOrderSignature,
        takeOrderArgs,
      );
      await expect(tx).resolves.toBeReceipt();
    });

    it('reverts if the incoming asset amount is too low', async () => {
      const {
        fund: { vault },
        system: { kyberAdapter },
        config: {
          tokens: { mln, weth },
        },
      } = await provider.snapshot(snapshot);

      const sell = utils.parseEther('1');
      const buy = utils.parseEther('2'); // Expect to buy twice as much as the current rate.
      const takeOrderArgs = await kyberTakeOrderArgs(mln, buy, weth, sell);

      tx = vault.callOnIntegration(
        kyberAdapter,
        takeOrderSignature,
        takeOrderArgs,
      );
      await expect(tx).rejects.toBeRevertedWith(
        'received incoming asset less than expected',
      );
    });

    it('reverts if the incoming and outgoing asset are the same', async () => {
      const {
        fund: { vault },
        system: { kyberAdapter },
        config: {
          tokens: { weth },
        },
      } = await provider.snapshot(snapshot);
      const amount = utils.parseEther('1');
      const takeOrderArgs = await kyberTakeOrderArgs(
        weth,
        amount,
        weth,
        amount,
      );

      tx = vault.callOnIntegration(
        kyberAdapter,
        takeOrderSignature,
        takeOrderArgs,
      );
      await expect(tx).rejects.toBeRevertedWith(
        'takeOrder: incomingAsset and outgoingAsset asset cannot be the same',
      );
    });

    it('can trade between various tokens', async () => {
      let {
        fund: { vault },
        system: { kyberAdapter },
        config: {
          mocks: {
            integratees: { kyber },
          },
          tokens: { weth, mln, dai, rep },
        },
      } = await provider.snapshot(snapshot);

      async function trade(
        incomingAsset: AddressLike,
        incomingAmount: BigNumberish,
        outgoingAsset: AddressLike,
        outgoingAmount: BigNumberish,
      ) {
        const [incomingBefore, outgoingBefore] = await vault.getAssetBalances([
          incomingAsset,
          outgoingAsset,
        ]);

        const takeOrderArgs = await kyberTakeOrderArgs(
          incomingAsset,
          incomingAmount,
          outgoingAsset,
          outgoingAmount,
        );

        const tx = vault.callOnIntegration(
          kyberAdapter,
          takeOrderSignature,
          takeOrderArgs,
        );

        await expect(tx).resolves.toBeReceipt();

        const [incomingAfter, outgoingAfter] = await vault.getAssetBalances([
          incomingAsset,
          outgoingAsset,
        ]);

        expect(incomingAfter).toEqBigNumber(incomingBefore.add(incomingAmount));
        expect(outgoingAfter).toEqBigNumber(outgoingBefore.sub(outgoingAmount));
      }

      // Buy 10 MLN for 10 WETH
      await trade(mln, utils.parseEther('10'), weth, utils.parseEther('10'));
      // Buy 5 DAI for 5 MLN
      await trade(dai, utils.parseEther('5'), mln, utils.parseEther('5'));
      // Buy 3 REP for 3 WETH
      await trade(rep, utils.parseEther('3'), weth, utils.parseEther('3'));
      // Buy 1 REP for 1 DAI
      await trade(rep, utils.parseEther('1'), dai, utils.parseEther('1'));

      // Buy 2 WETH for 4 DAI after rate change
      const kyberEthAddress = await kyber.ETH_ADDRESS();
      await kyber.setRates([dai], [kyberEthAddress], [utils.parseEther('0.5')]);
      await trade(weth, utils.parseEther('2'), dai, utils.parseEther('4'));
    });
  });
});