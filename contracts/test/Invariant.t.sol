// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CareGuardEpisode} from "../src/CareGuardEpisode.sol";
import {FreezableUSDC} from "./mocks/FreezableUSDC.sol";

/// @dev Drives the contract with random sequences of every money-moving action.
contract Handler is Test {
    CareGuardEpisode internal cg;
    FreezableUSDC internal usdc;
    address internal agent;
    address internal provider = makeAddr("h-provider");
    address internal coverer = makeAddr("h-coverer");
    address internal family = makeAddr("h-family");

    uint256[] public ids;
    uint256 internal nonce;
    uint256 public totalIn;
    uint256 public totalOut;

    constructor(CareGuardEpisode cg_, FreezableUSDC usdc_, address agent_) {
        cg = cg_;
        usdc = usdc_;
        agent = agent_;
        address[2] memory payers = [coverer, family];
        for (uint256 i; i < 2; ++i) {
            usdc.mint(payers[i], type(uint128).max);
            vm.prank(payers[i]);
            usdc.approve(address(cg), type(uint256).max);
        }
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function _pick(uint256 seed) internal view returns (uint256) {
        return ids[seed % ids.length];
    }

    function create(uint256 cap) external {
        cap = bound(cap, 1, 1_000_000e6);
        vm.prank(agent);
        ids.push(cg.createEpisode(provider, coverer, family, 10_000_000e6, cap, uint64(block.timestamp) + 30 days));
    }

    function fund(uint256 seed, bool asFamily, uint256 amount) external {
        if (ids.length == 0) return;
        amount = bound(amount, 1, 1_000_000e6);
        vm.prank(asFamily ? family : coverer);
        try cg.fund(_pick(seed), amount) {
            totalIn += amount;
        } catch {}
    }

    function pay(uint256 seed, uint256 amount, uint256 covered) external {
        if (ids.length == 0) return;
        amount = bound(amount, 1, 1_000_000e6);
        covered = bound(covered, 0, amount);
        vm.prank(agent);
        try cg.payCharge(_pick(seed), keccak256(abi.encode(nonce++)), amount, covered) {
            totalOut += amount;
        } catch {}
    }

    function discharge(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 before = usdc.balanceOf(address(cg));
        vm.prank(agent);
        try cg.discharge(_pick(seed)) {
            totalOut += before - usdc.balanceOf(address(cg));
        } catch {}
    }

    /// Freezes or unfreezes a payer, so refunds sometimes defer.
    function toggleFreeze(bool asFamily, bool value) external {
        usdc.setFrozen(asFamily ? family : coverer, value);
    }

    function claim(bool asFamily) external {
        address who = asFamily ? family : coverer;
        uint256 before = usdc.balanceOf(address(cg));
        vm.prank(who);
        try cg.claimRefund() {
            totalOut += before - usdc.balanceOf(address(cg));
        } catch {}
    }

    function warpAndRefund(uint256 seed, uint256 dt) external {
        if (ids.length == 0) return;
        vm.warp(block.timestamp + bound(dt, 0, 40 days));
        uint256 before = usdc.balanceOf(address(cg));
        try cg.refundExpired(_pick(seed)) {
            totalOut += before - usdc.balanceOf(address(cg));
        } catch {}
    }
}

contract InvariantTest is Test {
    CareGuardEpisode internal cg;
    FreezableUSDC internal usdc;
    Handler internal handler;

    function setUp() public {
        usdc = new FreezableUSDC();
        address agent = makeAddr("agent");
        cg = new CareGuardEpisode(usdc, agent, makeAddr("approver"));
        handler = new Handler(cg, usdc, agent);
        targetContract(address(handler));
    }

    /// USDC balance of contract == sum over open episodes of (covererBalance + familyBalance) + refunds waiting to be claimed.
    function invariant_balanceMatchesOpenEpisodes() public view {
        uint256 sum;
        uint256 n = handler.idCount();
        for (uint256 i; i < n; ++i) {
            CareGuardEpisode.Episode memory e = cg.getEpisode(handler.ids(i));
            if (e.status == CareGuardEpisode.Status.Closed || e.status == CareGuardEpisode.Status.Expired) {
                assertEq(e.covererBalance + e.familyBalance, 0);
            } else {
                sum += e.covererBalance + e.familyBalance;
            }
        }
        assertEq(usdc.balanceOf(address(cg)), sum + cg.totalPendingRefunds());
    }

    /// Money is never created or lost: what came in equals what is held plus what went out.
    function invariant_conservation() public view {
        assertEq(handler.totalIn(), usdc.balanceOf(address(cg)) + handler.totalOut());
    }
}
