// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CareGuardEpisode} from "../src/CareGuardEpisode.sol";

/// Deploys to Arc. Reads USDC_ADDRESS, AGENT_ADDRESS and APPROVER_ADDRESS from the environment.
///   forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --account <deployer>
/// Then copy the address and block into config/<network>.json.
contract Deploy is Script {
    function run() external returns (CareGuardEpisode cg) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address agent = vm.envAddress("AGENT_ADDRESS");
        address approver = vm.envAddress("APPROVER_ADDRESS");
        require(agent != approver, "Agent and approver must be different keys");

        vm.startBroadcast();
        cg = new CareGuardEpisode(IERC20(usdc), agent, approver);
        vm.stopBroadcast();

        console.log("CareGuardEpisode", address(cg));
        console.log("chainId", block.chainid);
        console.log("block", block.number);
    }
}
