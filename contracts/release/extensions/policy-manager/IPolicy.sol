// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./IPolicyManager.sol";

/// @title Policy Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IPolicy {
    function activateForFund(address _comptrollerProxy, address _vaultProxy) external;

    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings) external;

    function identifier() external pure returns (string memory identifier_);

    function implementedHooks()
        external
        view
        returns (IPolicyManager.PolicyHook[] memory implementedHooks_);

    function updateFundSettings(
        address _comptrollerProxy,
        address _vaultProxy,
        bytes calldata _encodedSettings
    ) external;

    function validateRule(
        address _comptrollerProxy,
        address _vaultProxy,
        IPolicyManager.PolicyHook _hook,
        bytes calldata _encodedArgs
    ) external returns (bool isValid_);
}