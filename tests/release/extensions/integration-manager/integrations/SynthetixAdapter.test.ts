import { EthereumTestnetProvider } from '@enzymefinance/hardhat';
import {
  assetTransferArgs,
  ISynthetixAddressResolver,
  ISynthetixExchanger,
  SpendAssetsHandleType,
  StandardToken,
  synthetixTakeOrderArgs,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import {
  createNewFund,
  defaultTestDeployment,
  getAssetBalances,
  synthetixAssignExchangeDelegate,
  synthetixTakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await provider.snapshot(defaultTestDeployment);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: new StandardToken(config.integratees.synthetix.susd, config.deployer),
  });

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
    sbtcCurrencyKey: utils.formatBytes32String('sBTC'),
    susdCurrencyKey: utils.formatBytes32String('sUSD'),
    synthetixExchanger: new ISynthetixExchanger(deployment.synthetix.mockSynthetixIntegratee, provider),
  };
}

xdescribe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { integrationManager, synthetixAdapter, synthetixPriceFeed },
      config: {
        integratees: { synthetix },
      },
    } = await provider.snapshot(snapshot);

    const integrationManagerResult = await synthetixAdapter.getIntegrationManager();
    expect(integrationManagerResult).toMatchAddress(integrationManager);

    const originatorResult = await synthetixAdapter.getOriginator();
    expect(originatorResult).toMatchAddress(synthetix.originator);

    const synthetixPriceFeedResult = await synthetixAdapter.getSynthetixPriceFeed();
    expect(synthetixPriceFeedResult).toMatchAddress(synthetixPriceFeed);

    const synthetixResult = await synthetixAdapter.getSynthetix();
    expect(synthetixResult).toMatchAddress(synthetix.snx);

    const trackingCodeResult = await synthetixAdapter.getTrackingCode();
    expect(trackingCodeResult).toBe(synthetix.trackingCode);
  });
});

xdescribe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { synthetixAdapter },
      config: {
        derivatives: {
          synthetix: { sbtc },
        },
        integratees: {
          synthetix: { susd },
        },
      },
    } = await provider.snapshot(snapshot);

    const args = synthetixTakeOrderArgs({
      incomingAsset: sbtc,
      minIncomingAssetAmount: 1,
      outgoingAsset: susd,
      outgoingAssetAmount: 1,
    });

    await expect(synthetixAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(synthetixAdapter.parseAssetsForMethod(takeOrderSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output', async () => {
    const {
      deployment: { synthetixAdapter },
      config: {
        derivatives: {
          synthetix: { sbtc },
        },
        integratees: {
          synthetix: { susd },
        },
      },
    } = await provider.snapshot(snapshot);

    const incomingAsset = sbtc;
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = susd;
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = synthetixTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
    });

    const result = await synthetixAdapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(synthetixAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.None,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAssetAmount],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });
});

xdescribe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: { synthetixAdapter },
      fund: { vaultProxy },
      config: {
        derivatives: {
          synthetix: { sbtc },
        },
        integratees: {
          synthetix: { susd },
        },
      },
    } = await provider.snapshot(snapshot);

    const incomingAsset = sbtc;
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = susd;
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = synthetixTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
    });

    const transferArgs = await assetTransferArgs({
      adapter: synthetixAdapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    await expect(synthetixAdapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund (synth to synth)', async () => {
    const {
      config: {
        deployer,
        integratees: {
          synthetix: { addressResolver },
        },
        derivatives: {
          synthetix: { sbtc, susd },
        },
      },
      deployment: {
        integrationManager,
        synthetixAdapter,
        synthetix: { mockSynthetixPriceSource },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      sbtcCurrencyKey,
      susdCurrencyKey,
      synthetixExchanger,
    } = await provider.snapshot(snapshot);

    const incomingAsset = new StandardToken(sbtc, deployer);
    const outgoingAsset = new StandardToken(susd, deployer);

    // Necessary to set rates to avoid using chainlink price sources.
    // TODO: Remove when aggregators are disabled
    await mockSynthetixPriceSource.setRate(sbtcCurrencyKey, utils.parseEther('1'));
    await mockSynthetixPriceSource.setRate(susdCurrencyKey, utils.parseEther('1'));

    // Delegate SynthetixAdapter to exchangeOnBehalf of VaultProxy
    await synthetixAssignExchangeDelegate({
      comptrollerProxy,
      addressResolver: new ISynthetixAddressResolver(addressResolver, provider),
      fundOwner,
      delegate: synthetixAdapter.address,
    });

    // Define order params
    const outgoingAssetAmount = utils.parseEther('100');
    const { 0: minIncomingAssetAmount } = await synthetixExchanger.getAmountsForExchange(
      outgoingAssetAmount,
      susdCurrencyKey,
      sbtcCurrencyKey,
    );
    // Get incoming asset balance prior to tx
    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset],
    });

    // Execute Synthetix order
    await synthetixTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      synthetixAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount,
      seedFund: true,
    });

    // Get incoming and outgoing asset balances after the tx
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Assert the expected final token balances of the VaultProxy
    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
    expect(incomingAssetAmount).toEqBigNumber(minIncomingAssetAmount);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });
});
