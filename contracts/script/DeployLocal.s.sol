// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CareGuardEpisode} from "../src/CareGuardEpisode.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/// Local end-to-end only (TESTING.md layer 2): mock USDC + contract on anvil, writes config/local.json.
///   anvil
///   forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
/// Uses anvil's default accounts: #0 deployer, #1 agent, #2 approver, #3-#5 provider/coverer/family (minted mock USDC).
contract DeployLocal is Script {
    uint256 constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function run() external {
        require(block.chainid == 31337, "DeployLocal is for anvil only");
        string memory mnemonic = "test test test test test test test test test test test junk";
        address agent = vm.addr(vm.deriveKey(mnemonic, 1));
        address approver = vm.addr(vm.deriveKey(mnemonic, 2));

        vm.startBroadcast(DEPLOYER_KEY);
        MockUSDC usdc = new MockUSDC();
        CareGuardEpisode cg = new CareGuardEpisode(usdc, agent, approver);
        for (uint32 i = 3; i <= 5; ++i) {
            usdc.mint(vm.addr(vm.deriveKey(mnemonic, i)), 100_000e6);
        }
        vm.stopBroadcast();

        string memory o = "config";
        vm.serializeString(o, "network", "local");
        vm.serializeUint(o, "chainId", 31337);
        vm.serializeString(o, "rpcUrl", "http://127.0.0.1:8545");
        vm.serializeString(o, "explorerUrl", "");
        vm.serializeAddress(o, "usdc", address(usdc));
        vm.serializeAddress(o, "eurc", address(0));
        vm.serializeAddress(o, "contractAddress", address(cg));
        vm.serializeUint(o, "deployBlock", block.number);
        string memory json = vm.serializeBool(o, "isTestnet", true);
        vm.writeJson(json, "../config/local.json");

        console.log("MockUSDC", address(usdc));
        console.log("CareGuardEpisode", address(cg));
    }
}
