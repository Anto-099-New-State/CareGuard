// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CareGuardEpisode} from "../src/CareGuardEpisode.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

abstract contract BaseTest is Test {
    uint256 internal constant USDC = 1e6;
    uint256 internal constant GUARANTEE = 1_800 * USDC;
    uint256 internal constant CAP = 450 * USDC;
    uint64 internal constant TTL = 30 days;

    MockUSDC internal usdc;
    CareGuardEpisode internal cg;

    address internal agent = makeAddr("agent");
    address internal provider = makeAddr("provider");
    address internal coverer = makeAddr("coverer");
    address internal family = makeAddr("family");
    address internal stranger = makeAddr("stranger");
    uint256 internal approverKey = 0xA11CE;
    address internal approver;

    function setUp() public virtual {
        approver = vm.addr(approverKey);
        usdc = new MockUSDC();
        cg = new CareGuardEpisode(usdc, agent, approver);
        address[3] memory payers = [coverer, family, stranger];
        for (uint256 i; i < payers.length; ++i) {
            usdc.mint(payers[i], 1_000_000 * USDC);
            vm.prank(payers[i]);
            usdc.approve(address(cg), type(uint256).max);
        }
    }

    function _create() internal returns (uint256 id) {
        vm.prank(agent);
        id = cg.createEpisode(provider, coverer, family, GUARANTEE, CAP, uint64(block.timestamp) + TTL);
    }

    function _fund(uint256 id, address payer, uint256 amount) internal {
        vm.prank(payer);
        cg.fund(id, amount);
    }

    function _funded(uint256 coverAmt, uint256 familyAmt) internal returns (uint256 id) {
        id = _create();
        if (coverAmt > 0) _fund(id, coverer, coverAmt);
        if (familyAmt > 0) _fund(id, family, familyAmt);
    }

    function _pay(uint256 id, bytes32 h, uint256 amount, uint256 covered) internal {
        vm.prank(agent);
        cg.payCharge(id, h, amount, covered);
    }

    function _sign(uint256 key, uint256 id, bytes32 h, uint256 amount, uint256 covered, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, cg.approvalDigest(id, h, amount, covered, deadline));
        return abi.encodePacked(r, s, v);
    }

    function _status(uint256 id) internal view returns (CareGuardEpisode.Status) {
        return cg.getEpisode(id).status;
    }
}
