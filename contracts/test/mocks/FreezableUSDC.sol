// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "./MockUSDC.sol";

/// @dev Test-only USDC that can freeze an address, as real USDC can: transfers to a frozen address revert.
contract FreezableUSDC is MockUSDC {
    mapping(address => bool) public frozen;

    error AccountFrozen(address account);

    function setFrozen(address account, bool value) external {
        frozen[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (frozen[to]) revert AccountFrozen(to);
        super._update(from, to, value);
    }
}
