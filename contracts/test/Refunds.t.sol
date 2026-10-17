// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CareGuardEpisode} from "../src/CareGuardEpisode.sol";
import {FreezableUSDC} from "./mocks/FreezableUSDC.sol";

/// One payer's frozen wallet must never block the other payer's refund.
contract DeferredRefundTest is Test {
    FreezableUSDC internal usdc;
    CareGuardEpisode internal cg;
    address internal agent = makeAddr("agent");
    address internal provider = makeAddr("provider");
    address internal coverer = makeAddr("coverer");
    address internal family = makeAddr("family");
    uint256 internal id;

    function setUp() public {
        usdc = new FreezableUSDC();
        cg = new CareGuardEpisode(usdc, agent, makeAddr("approver"));
        address[2] memory payers = [coverer, family];
        for (uint256 i; i < 2; ++i) {
            usdc.mint(payers[i], 1_000e6);
            vm.prank(payers[i]);
            usdc.approve(address(cg), type(uint256).max);
        }
        vm.prank(agent);
        id = cg.createEpisode(provider, coverer, family, 1_000e6, 500e6, uint64(block.timestamp) + 1 days);
        vm.prank(coverer);
        cg.fund(id, 300e6);
        vm.prank(family);
        cg.fund(id, 200e6);
    }

    function test_discharge_frozenFamilyDoesNotBlockCoverer() public {
        usdc.setFrozen(family, true);
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.EpisodeClosed(id);
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.Refunded(id, coverer, 300e6);
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.RefundDeferred(id, family, 200e6);
        vm.prank(agent);
        cg.discharge(id);

        assertEq(usdc.balanceOf(coverer), 1_000e6);
        assertEq(cg.pendingRefunds(family), 200e6);
        assertEq(cg.totalPendingRefunds(), 200e6);
        assertEq(usdc.balanceOf(address(cg)), 200e6);
        assertEq(uint8(cg.getEpisode(id).status), uint8(CareGuardEpisode.Status.Closed));
    }

    function test_refundExpired_frozenCovererDoesNotBlockFamily() public {
        usdc.setFrozen(coverer, true);
        vm.warp(block.timestamp + 1 days);
        cg.refundExpired(id);
        assertEq(usdc.balanceOf(family), 1_000e6);
        assertEq(cg.pendingRefunds(coverer), 300e6);
    }

    function test_claim_afterUnfreeze() public {
        usdc.setFrozen(family, true);
        vm.prank(agent);
        cg.discharge(id);

        vm.prank(family);
        vm.expectRevert(abi.encodeWithSelector(FreezableUSDC.AccountFrozen.selector, family));
        cg.claimRefund();
        assertEq(cg.pendingRefunds(family), 200e6, "a failed claim keeps the balance");

        usdc.setFrozen(family, false);
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.RefundClaimed(family, 200e6);
        vm.prank(family);
        cg.claimRefund();
        assertEq(usdc.balanceOf(family), 1_000e6);
        assertEq(cg.pendingRefunds(family), 0);
        assertEq(cg.totalPendingRefunds(), 0);
        assertEq(usdc.balanceOf(address(cg)), 0);
    }

    function test_claim_onlyOwnBalance() public {
        usdc.setFrozen(family, true);
        vm.prank(agent);
        cg.discharge(id);
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(CareGuardEpisode.NothingToClaim.selector);
        cg.claimRefund();
        vm.prank(coverer);
        vm.expectRevert(CareGuardEpisode.NothingToClaim.selector);
        cg.claimRefund();
    }

    function test_pendingAcrossEpisodesAccumulates() public {
        vm.prank(agent);
        uint256 id2 = cg.createEpisode(provider, coverer, family, 1_000e6, 500e6, uint64(block.timestamp) + 1 days);
        vm.prank(family);
        cg.fund(id2, 100e6);
        usdc.setFrozen(family, true);
        vm.startPrank(agent);
        cg.discharge(id);
        cg.discharge(id2);
        vm.stopPrank();
        assertEq(cg.pendingRefunds(family), 300e6);
    }
}
