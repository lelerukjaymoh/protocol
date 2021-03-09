import { AddressLike, Call, Contract, contract, Send, SignerWithAddress } from '@crestproject/crestproject';
import {
  ComptrollerLib,
  CurveExchangeAdapter,
  CurveLiquidityStethAdapter,
  IntegrationManager,
  IntegrationManagerActionId,
  StandardToken,
  callOnIntegrationArgs,
  curveMinterMintManySelector,
  curveMinterMintSelector,
  curveMinterToggleApproveMintSelector,
  curveStethLendAndStakeArgs,
  curveStethLendArgs,
  curveStethRedeemArgs,
  curveStethStakeArgs,
  curveStethUnstakeAndRedeemArgs,
  curveStethUnstakeArgs,
  curveTakeOrderArgs,
  encodeArgs,
  lendAndStakeSelector,
  lendSelector,
  redeemSelector,
  stakeSelector,
  takeOrderSelector,
  unstakeAndRedeemSelector,
  unstakeSelector,
} from '@enzymefinance/protocol';
import { BigNumber, BigNumberish, constants, utils } from 'ethers';

export interface CurveLiquidityGaugeV2 extends Contract<CurveLiquidityGaugeV2> {
  claim_rewards: Send<(_addr: AddressLike) => void>;
  integrate_fraction: Call<(_for: AddressLike) => BigNumber, Contract<any>>;
}

export const CurveLiquidityGaugeV2 = contract<CurveLiquidityGaugeV2>()`
  function claim_rewards(address)
  function integrate_fraction(address) view returns (uint256)
`;

// prettier-ignore
export interface CurveSwaps extends Contract<CurveSwaps> {
  get_best_rate: Call<(_from: AddressLike, to: AddressLike, amount: BigNumberish) => { bestPool: AddressLike, amountReceived: BigNumber }, CurveSwaps>
}

export const CurveSwaps = contract<CurveSwaps>()`
  function get_best_rate(address _from, address to, uint256 amount) view returns (address bestPool, uint256 amountReceived)
`;

export interface CurveMinter extends Contract<CurveMinter> {
  mint_for: Send<(_gauge_address: AddressLike, _for: AddressLike) => void>;
}

export const CurveMinter = contract<CurveMinter>()`
  function mint_for(address,address)
`;

export function curveMinterMint({
  comptrollerProxy,
  minter,
  gauge,
}: {
  comptrollerProxy: ComptrollerLib;
  minter: AddressLike;
  gauge: AddressLike;
}) {
  return comptrollerProxy.vaultCallOnContract(minter, curveMinterMintSelector, encodeArgs(['address'], [gauge]));
}

export function curveMinterMintMany({
  comptrollerProxy,
  minter,
  gauges,
}: {
  comptrollerProxy: ComptrollerLib;
  minter: AddressLike;
  gauges: AddressLike[];
}) {
  const gaugesFormatted = new Array(8).fill(constants.AddressZero);
  for (const i in gauges) {
    gaugesFormatted[i] = gauges[i];
  }

  return comptrollerProxy.vaultCallOnContract(
    minter,
    curveMinterMintManySelector,
    encodeArgs(['address[8]'], [gaugesFormatted]),
  );
}

export function curveMinterToggleApproveMint({
  comptrollerProxy,
  minter,
  account,
}: {
  comptrollerProxy: ComptrollerLib;
  minter: AddressLike;
  account: AddressLike;
}) {
  return comptrollerProxy.vaultCallOnContract(
    minter,
    curveMinterToggleApproveMintSelector,
    encodeArgs(['address'], [account]),
  );
}

export function curveStethLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingWethAmount,
  outgoingStethAmount,
  minIncomingLPTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingWethAmount: BigNumberish;
  outgoingStethAmount: BigNumberish;
  minIncomingLPTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: lendSelector,
    encodedCallArgs: curveStethLendArgs({
      outgoingWethAmount,
      outgoingStethAmount,
      minIncomingLPTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethLendAndStake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingWethAmount,
  outgoingStethAmount,
  minIncomingLiquidityGaugeTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingWethAmount: BigNumberish;
  outgoingStethAmount: BigNumberish;
  minIncomingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: lendAndStakeSelector,
    encodedCallArgs: curveStethLendAndStakeArgs({
      outgoingWethAmount,
      outgoingStethAmount,
      minIncomingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingLPTokenAmount,
  minIncomingWethAmount,
  minIncomingStethAmount,
  receiveSingleAsset,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingLPTokenAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
  minIncomingStethAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: redeemSelector,
    encodedCallArgs: curveStethRedeemArgs({
      outgoingLPTokenAmount,
      minIncomingWethAmount,
      minIncomingStethAmount,
      receiveSingleAsset,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethStake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingLPTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingLPTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: stakeSelector,
    encodedCallArgs: curveStethStakeArgs({
      outgoingLPTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethUnstakeAndRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingLiquidityGaugeTokenAmount,
  minIncomingWethAmount,
  minIncomingStethAmount,
  receiveSingleAsset,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
  minIncomingStethAmount: BigNumberish;
  receiveSingleAsset: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: unstakeAndRedeemSelector,
    encodedCallArgs: curveStethUnstakeAndRedeemArgs({
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount,
      minIncomingStethAmount,
      receiveSingleAsset,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function curveStethUnstake({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityStethAdapter,
  outgoingLiquidityGaugeTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityStethAdapter: CurveLiquidityStethAdapter;
  outgoingLiquidityGaugeTokenAmount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityStethAdapter,
    selector: unstakeSelector,
    encodedCallArgs: curveStethUnstakeArgs({
      outgoingLiquidityGaugeTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveTakeOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveExchangeAdapter,
  pool,
  outgoingAsset,
  outgoingAssetAmount = utils.parseEther('1'),
  incomingAsset,
  minIncomingAssetAmount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveExchangeAdapter: CurveExchangeAdapter;
  pool: AddressLike;
  outgoingAsset: StandardToken;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: StandardToken;
  minIncomingAssetAmount?: BigNumberish;
}) {
  const takeOrderArgs = curveTakeOrderArgs({
    pool,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount: outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: minIncomingAssetAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: curveExchangeAdapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}