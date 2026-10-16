// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CareGuardEpisode} from "../src/CareGuardEpisode.sol";
import {BaseTest} from "./Base.t.sol";

contract CreateEpisodeTest is BaseTest {
    function test_create_setsFieldsAndEmits() public {
        uint64 exp = uint64(block.timestamp) + TTL;
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.EpisodeCreated(1, provider, coverer, family, GUARANTEE, CAP, exp);
        uint256 id = _create();
        assertEq(id, 1);
        CareGuardEpisode.Episode memory e = cg.getEpisode(id);
        assertEq(e.provider, provider);
        assertEq(e.coverer, coverer);
        assertEq(e.family, family);
        assertEq(e.guarantee, GUARANTEE);
        assertEq(e.perChargeCap, CAP);
        assertEq(e.expiresAt, exp);
        assertEq(uint8(e.status), uint8(CareGuardEpisode.Status.Created));
        assertEq(_create(), 2);
    }

    function test_create_onlyAgent() public {
        vm.prank(stranger);
        vm.expectRevert(CareGuardEpisode.NotAgent.selector);
        cg.createEpisode(provider, coverer, family, GUARANTEE, CAP, uint64(block.timestamp) + TTL);
    }

    function test_create_rejectsBadInputs() public {
        uint64 exp = uint64(block.timestamp) + TTL;
        vm.startPrank(agent);
        vm.expectRevert(CareGuardEpisode.ZeroAddress.selector);
        cg.createEpisode(address(0), coverer, family, GUARANTEE, CAP, exp);
        vm.expectRevert(CareGuardEpisode.DuplicateParty.selector);
        cg.createEpisode(provider, coverer, coverer, GUARANTEE, CAP, exp);
        vm.expectRevert(CareGuardEpisode.DuplicateParty.selector);
        cg.createEpisode(provider, provider, family, GUARANTEE, CAP, exp);
        vm.expectRevert(CareGuardEpisode.ZeroAmount.selector);
        cg.createEpisode(provider, coverer, family, 0, CAP, exp);
        vm.expectRevert(CareGuardEpisode.ZeroAmount.selector);
        cg.createEpisode(provider, coverer, family, GUARANTEE, 0, exp);
        vm.expectRevert(CareGuardEpisode.CapAboveGuarantee.selector);
        cg.createEpisode(provider, coverer, family, CAP, GUARANTEE, exp);
        vm.expectRevert(CareGuardEpisode.ExpiryInPast.selector);
        cg.createEpisode(provider, coverer, family, GUARANTEE, CAP, uint64(block.timestamp));
        vm.stopPrank();
    }
}

contract FundTest is BaseTest {
    function test_fund_byBothPayers() public {
        uint256 id = _create();
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.Funded(id, coverer, 1_200 * USDC);
        _fund(id, coverer, 1_200 * USDC);
        _fund(id, family, 600 * USDC);
        CareGuardEpisode.Episode memory e = cg.getEpisode(id);
        assertEq(e.covererBalance, 1_200 * USDC);
        assertEq(e.familyBalance, 600 * USDC);
        assertEq(usdc.balanceOf(address(cg)), 1_800 * USDC);
    }

    function test_fund_strangerReverts() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert(CareGuardEpisode.NotPayer.selector);
        cg.fund(id, 100 * USDC);
    }

    function test_fund_zeroReverts() public {
        uint256 id = _create();
        vm.prank(coverer);
        vm.expectRevert(CareGuardEpisode.ZeroAmount.selector);
        cg.fund(id, 0);
    }

    function test_fund_unknownEpisodeReverts() public {
        vm.prank(coverer);
        vm.expectRevert(CareGuardEpisode.EpisodeNotFound.selector);
        cg.fund(99, 1);
    }

    function test_fund_closedReverts() public {
        uint256 id = _funded(100 * USDC, 0);
        vm.prank(agent);
        cg.discharge(id);
        vm.prank(coverer);
        vm.expectRevert(CareGuardEpisode.EpisodeNotOpen.selector);
        cg.fund(id, 1);
    }

    function test_fund_expiredReverts() public {
        uint256 id = _create();
        vm.warp(block.timestamp + TTL);
        vm.prank(coverer);
        vm.expectRevert(CareGuardEpisode.EpisodeExpiredAlready.selector);
        cg.fund(id, 1);
        cg.refundExpired(id);
        vm.prank(coverer);
        vm.expectRevert(CareGuardEpisode.EpisodeNotOpen.selector);
        cg.fund(id, 1);
    }

    function test_fund_duringMarginCallSetsActive() public {
        uint256 id = _funded(500 * USDC, 100 * USDC);
        vm.prank(agent);
        cg.raiseMarginCall(id, family, 300 * USDC, keccak256("short"));
        assertEq(uint8(_status(id)), uint8(CareGuardEpisode.Status.MarginCall));
        _fund(id, family, 300 * USDC);
        assertEq(uint8(_status(id)), uint8(CareGuardEpisode.Status.Active));
    }
}

contract ChargeTest is BaseTest {
    function test_pay_underCapSplitsAcrossPayers() public {
        uint256 id = _funded(1_200 * USDC, 600 * USDC);
        bytes32 h = keccak256("charge-1");
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.ChargePaid(id, h, 300 * USDC, 220 * USDC);
        _pay(id, h, 300 * USDC, 220 * USDC);
        CareGuardEpisode.Episode memory e = cg.getEpisode(id);
        assertEq(usdc.balanceOf(provider), 300 * USDC);
        assertEq(e.covererBalance, 980 * USDC);
        assertEq(e.familyBalance, 520 * USDC);
        assertEq(e.paidTotal, 300 * USDC);
        assertEq(uint8(e.status), uint8(CareGuardEpisode.Status.Active));
        assertTrue(cg.chargeUsed(h));
    }

    function test_pay_atCapAllowed() public {
        uint256 id = _funded(CAP, 0);
        _pay(id, keccak256("c"), CAP, CAP);
        assertEq(usdc.balanceOf(provider), CAP);
    }

    function test_pay_onlyAgent() public {
        uint256 id = _funded(1_000 * USDC, 0);
        vm.prank(provider);
        vm.expectRevert(CareGuardEpisode.NotAgent.selector);
        cg.payCharge(id, keccak256("c"), 10 * USDC, 10 * USDC);
    }

    function test_pay_aboveCapRevertsWithoutSignature() public {
        uint256 id = _funded(1_000 * USDC, 1_000 * USDC);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(CareGuardEpisode.AboveCap.selector, CAP + 1, CAP));
        cg.payCharge(id, keccak256("c"), CAP + 1, 0);
    }

    function test_pay_coveredAboveAmountReverts() public {
        uint256 id = _funded(1_000 * USDC, 0);
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.CoveredAboveAmount.selector);
        cg.payCharge(id, keccak256("c"), 10 * USDC, 11 * USDC);
    }

    function test_pay_zeroReverts() public {
        uint256 id = _funded(1_000 * USDC, 0);
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.ZeroAmount.selector);
        cg.payCharge(id, keccak256("c"), 0, 0);
    }

    function test_pay_insufficientCovererMovesNothing() public {
        uint256 id = _funded(100 * USDC, 1_000 * USDC);
        uint256 before = usdc.balanceOf(address(cg));
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(CareGuardEpisode.InsufficientCovererBalance.selector, 150 * USDC, 100 * USDC)
        );
        cg.payCharge(id, keccak256("c"), 200 * USDC, 150 * USDC);
        assertEq(usdc.balanceOf(address(cg)), before);
        assertEq(usdc.balanceOf(provider), 0);
    }

    function test_pay_insufficientFamilyMovesNothing() public {
        uint256 id = _funded(1_000 * USDC, 40 * USDC);
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(CareGuardEpisode.InsufficientFamilyBalance.selector, 80 * USDC, 40 * USDC)
        );
        cg.payCharge(id, keccak256("c"), 200 * USDC, 120 * USDC);
        assertEq(usdc.balanceOf(provider), 0);
    }

    function test_pay_sameHashTwiceReverts() public {
        uint256 id = _funded(1_000 * USDC, 0);
        bytes32 h = keccak256("dup");
        _pay(id, h, 10 * USDC, 10 * USDC);
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.ChargeAlreadyUsed.selector);
        cg.payCharge(id, h, 10 * USDC, 10 * USDC);
    }

    function test_pay_sameHashOnAnotherEpisodeReverts() public {
        uint256 a = _funded(1_000 * USDC, 0);
        uint256 b = _funded(1_000 * USDC, 0);
        bytes32 h = keccak256("dup");
        _pay(a, h, 10 * USDC, 10 * USDC);
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.ChargeAlreadyUsed.selector);
        cg.payCharge(b, h, 10 * USDC, 10 * USDC);
    }

    function test_pay_afterExpiryReverts() public {
        uint256 id = _funded(1_000 * USDC, 0);
        vm.warp(block.timestamp + TTL);
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.EpisodeExpiredAlready.selector);
        cg.payCharge(id, keccak256("c"), 10 * USDC, 10 * USDC);
    }

    function test_pay_duringMarginCallKeepsStatus() public {
        uint256 id = _funded(1_000 * USDC, 0);
        vm.prank(agent);
        cg.raiseMarginCall(id, coverer, 500 * USDC, keccak256("r"));
        _pay(id, keccak256("c"), 10 * USDC, 10 * USDC);
        assertEq(uint8(_status(id)), uint8(CareGuardEpisode.Status.MarginCall));
    }
}

contract ApprovalTest is BaseTest {
    uint256 internal id;
    bytes32 internal h = keccak256("bone-graft");
    uint256 internal amount = 520 * USDC;
    uint256 internal covered = 300 * USDC;
    uint256 internal deadline;

    function setUp() public override {
        super.setUp();
        id = _funded(1_000 * USDC, 1_000 * USDC);
        deadline = block.timestamp + 1 hours;
    }

    function _relay(bytes memory sig) internal {
        vm.prank(agent);
        cg.payChargeApproved(id, h, amount, covered, deadline, sig);
    }

    function test_approved_paysOverCap() public {
        _relay(_sign(approverKey, id, h, amount, covered, deadline));
        assertEq(usdc.balanceOf(provider), amount);
        CareGuardEpisode.Episode memory e = cg.getEpisode(id);
        assertEq(e.covererBalance, 700 * USDC);
        assertEq(e.familyBalance, 780 * USDC);
    }

    function test_approved_onlyAgent() public {
        bytes memory sig = _sign(approverKey, id, h, amount, covered, deadline);
        vm.prank(stranger);
        vm.expectRevert(CareGuardEpisode.NotAgent.selector);
        cg.payChargeApproved(id, h, amount, covered, deadline, sig);
    }

    function test_approved_wrongSignerReverts() public {
        bytes memory sig = _sign(0xBAD, id, h, amount, covered, deadline);
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.InvalidApproval.selector);
        cg.payChargeApproved(id, h, amount, covered, deadline, sig);
    }

    function test_approved_tamperedFieldsRevert() public {
        bytes memory sig = _sign(approverKey, id, h, amount, covered, deadline);
        uint256 other = _funded(1_000 * USDC, 1_000 * USDC);
        vm.startPrank(agent);
        vm.expectRevert(CareGuardEpisode.InvalidApproval.selector);
        cg.payChargeApproved(id, h, amount + 1, covered, deadline, sig);
        vm.expectRevert(CareGuardEpisode.InvalidApproval.selector);
        cg.payChargeApproved(id, h, amount, covered + 1, deadline, sig);
        vm.expectRevert(CareGuardEpisode.InvalidApproval.selector);
        cg.payChargeApproved(id, keccak256("other"), amount, covered, deadline, sig);
        vm.expectRevert(CareGuardEpisode.InvalidApproval.selector);
        cg.payChargeApproved(other, h, amount, covered, deadline, sig);
        vm.expectRevert(CareGuardEpisode.InvalidApproval.selector);
        cg.payChargeApproved(id, h, amount, covered, deadline + 1, sig);
        vm.stopPrank();
    }

    function test_approved_expiredDeadlineReverts() public {
        bytes memory sig = _sign(approverKey, id, h, amount, covered, deadline);
        vm.warp(deadline + 1);
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.ApprovalExpired.selector);
        cg.payChargeApproved(id, h, amount, covered, deadline, sig);
    }

    function test_approved_replayReverts() public {
        bytes memory sig = _sign(approverKey, id, h, amount, covered, deadline);
        _relay(sig);
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.ChargeAlreadyUsed.selector);
        cg.payChargeApproved(id, h, amount, covered, deadline, sig);
    }

    function test_approved_otherChainIdReverts() public {
        bytes memory sig = _sign(approverKey, id, h, amount, covered, deadline);
        vm.chainId(5042);
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.InvalidApproval.selector);
        cg.payChargeApproved(id, h, amount, covered, deadline, sig);
    }

    function test_approved_otherContractReverts() public {
        CareGuardEpisode twin = new CareGuardEpisode(usdc, agent, approver);
        vm.prank(agent);
        uint256 twinId = twin.createEpisode(provider, coverer, family, GUARANTEE, CAP, uint64(block.timestamp) + TTL);
        vm.prank(coverer);
        usdc.approve(address(twin), type(uint256).max);
        vm.prank(coverer);
        twin.fund(twinId, 1_000 * USDC);
        vm.prank(family);
        usdc.approve(address(twin), type(uint256).max);
        vm.prank(family);
        twin.fund(twinId, 1_000 * USDC);
        assertEq(twinId, id);

        bytes memory sig = _sign(approverKey, id, h, amount, covered, deadline); // signed for `cg`
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.InvalidApproval.selector);
        twin.payChargeApproved(twinId, h, amount, covered, deadline, sig);
    }

    function test_typehashMatchesFrontend() public view {
        assertEq(
            cg.APPROVE_CHARGE_TYPEHASH(),
            keccak256(
                "ApproveCharge(uint256 episodeId,bytes32 chargeHash,uint256 amount,uint256 coveredAmount,uint256 deadline)"
            )
        );
    }

    function test_setApprover_onlyApprover() public {
        address next = makeAddr("next");
        vm.prank(stranger);
        vm.expectRevert(CareGuardEpisode.NotApprover.selector);
        cg.setApprover(next);
        vm.prank(approver);
        cg.setApprover(next);
        assertEq(cg.approver(), next);
        // Old key no longer works.
        bytes memory sig = _sign(approverKey, id, h, amount, covered, deadline);
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.InvalidApproval.selector);
        cg.payChargeApproved(id, h, amount, covered, deadline, sig);
    }
}

contract MarginCallAndLogTest is BaseTest {
    function test_marginCall_emitsAndSetsStatus() public {
        uint256 id = _funded(100 * USDC, 100 * USDC);
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.MarginCall(id, family, 250 * USDC, keccak256("r"));
        vm.prank(agent);
        cg.raiseMarginCall(id, family, 250 * USDC, keccak256("r"));
        assertEq(uint8(_status(id)), uint8(CareGuardEpisode.Status.MarginCall));
    }

    function test_marginCall_rejectsNonPayerAndStranger() public {
        uint256 id = _create();
        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.NotPayer.selector);
        cg.raiseMarginCall(id, stranger, 1, bytes32(0));
        vm.prank(stranger);
        vm.expectRevert(CareGuardEpisode.NotAgent.selector);
        cg.raiseMarginCall(id, family, 1, bytes32(0));
    }

    function test_logDecision() public {
        uint256 id = _create();
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.DecisionLogged(id, CareGuardEpisode.DecisionKind.Size, keccak256("d"));
        vm.prank(agent);
        cg.logDecision(id, CareGuardEpisode.DecisionKind.Size, keccak256("d"));

        vm.prank(agent);
        vm.expectRevert(CareGuardEpisode.EpisodeNotFound.selector);
        cg.logDecision(42, CareGuardEpisode.DecisionKind.Size, keccak256("d"));

        vm.prank(stranger);
        vm.expectRevert(CareGuardEpisode.NotAgent.selector);
        cg.logDecision(id, CareGuardEpisode.DecisionKind.Size, keccak256("d"));
    }

    function test_logDecision_allowedAfterClose() public {
        uint256 id = _create();
        vm.startPrank(agent);
        cg.discharge(id);
        cg.logDecision(id, CareGuardEpisode.DecisionKind.Discharge, keccak256("final"));
        vm.stopPrank();
    }
}

contract RefundTest is BaseTest {
    function test_discharge_returnsExactRemainders() public {
        uint256 id = _funded(1_200 * USDC, 600 * USDC);
        _pay(id, keccak256("a"), 300 * USDC, 220 * USDC);
        uint256 cBefore = usdc.balanceOf(coverer);
        uint256 fBefore = usdc.balanceOf(family);

        vm.expectEmit(address(cg));
        emit CareGuardEpisode.EpisodeClosed(id);
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.Refunded(id, coverer, 980 * USDC);
        vm.expectEmit(address(cg));
        emit CareGuardEpisode.Refunded(id, family, 520 * USDC);
        vm.prank(agent);
        cg.discharge(id);

        assertEq(usdc.balanceOf(coverer) - cBefore, 980 * USDC);
        assertEq(usdc.balanceOf(family) - fBefore, 520 * USDC);
        assertEq(usdc.balanceOf(address(cg)), 0);
        assertEq(uint8(_status(id)), uint8(CareGuardEpisode.Status.Closed));
    }

    function test_discharge_onlyAgent() public {
        uint256 id = _funded(100 * USDC, 0);
        vm.prank(provider);
        vm.expectRevert(CareGuardEpisode.NotAgent.selector);
        cg.discharge(id);
    }

    function test_discharge_withNoFunds() public {
        uint256 id = _create();
        vm.prank(agent);
        cg.discharge(id);
        assertEq(uint8(_status(id)), uint8(CareGuardEpisode.Status.Closed));
    }

    function test_discharge_afterExpiryAllowed() public {
        uint256 id = _funded(100 * USDC, 0);
        vm.warp(block.timestamp + TTL + 1);
        vm.prank(agent);
        cg.discharge(id);
        assertEq(usdc.balanceOf(address(cg)), 0);
    }

    function test_refundExpired_oneSecondEarlyReverts() public {
        uint256 id = _funded(100 * USDC, 50 * USDC);
        vm.warp(block.timestamp + TTL - 1);
        vm.prank(stranger);
        vm.expectRevert(CareGuardEpisode.NotYetExpired.selector);
        cg.refundExpired(id);
    }

    function test_refundExpired_atExpiryByStranger() public {
        uint256 id = _funded(100 * USDC, 50 * USDC);
        uint256 cBefore = usdc.balanceOf(coverer);
        uint256 fBefore = usdc.balanceOf(family);
        vm.warp(block.timestamp + TTL);
        vm.prank(stranger);
        cg.refundExpired(id);
        assertEq(usdc.balanceOf(coverer) - cBefore, 100 * USDC);
        assertEq(usdc.balanceOf(family) - fBefore, 50 * USDC);
        assertEq(uint8(_status(id)), uint8(CareGuardEpisode.Status.Expired));
    }

    function test_nothingWorksAfterFinal() public {
        uint256 closed = _funded(100 * USDC, 0);
        vm.prank(agent);
        cg.discharge(closed);
        uint256 expired = _funded(100 * USDC, 0);
        vm.warp(block.timestamp + TTL);
        cg.refundExpired(expired);

        uint256[2] memory ids = [closed, expired];
        for (uint256 i; i < 2; ++i) {
            vm.startPrank(agent);
            vm.expectRevert(CareGuardEpisode.EpisodeNotOpen.selector);
            cg.payCharge(ids[i], keccak256(abi.encode(i)), 1, 1);
            vm.expectRevert(CareGuardEpisode.EpisodeNotOpen.selector);
            cg.discharge(ids[i]);
            vm.expectRevert(CareGuardEpisode.EpisodeNotOpen.selector);
            cg.raiseMarginCall(ids[i], coverer, 1, bytes32(0));
            vm.stopPrank();
            vm.expectRevert(CareGuardEpisode.EpisodeNotOpen.selector);
            cg.refundExpired(ids[i]);
        }
    }
}

contract FuzzTest is BaseTest {
    /// Random funding and charges never pay out more than came in, nor take from one payer more than they funded.
    function testFuzz_chargesNeverExceedFunding(uint96 coverIn, uint96 familyIn, uint96[5] memory amounts, uint96[5] memory covers)
        public
    {
        uint256 c = bound(coverIn, 1, 10_000 * USDC);
        uint256 f = bound(familyIn, 1, 10_000 * USDC);
        vm.prank(agent);
        uint256 id = cg.createEpisode(provider, coverer, family, 1_000_000 * USDC, 1_000_000 * USDC, uint64(block.timestamp) + TTL);
        _fund(id, coverer, c);
        _fund(id, family, f);

        uint256 paidCover;
        uint256 paidFamily;
        for (uint256 i; i < 5; ++i) {
            uint256 amount = bound(amounts[i], 1, 5_000 * USDC);
            uint256 covered = bound(covers[i], 0, amount);
            vm.prank(agent);
            try cg.payCharge(id, keccak256(abi.encode(i)), amount, covered) {
                paidCover += covered;
                paidFamily += amount - covered;
            } catch {}
        }

        CareGuardEpisode.Episode memory e = cg.getEpisode(id);
        assertLe(paidCover, c);
        assertLe(paidFamily, f);
        assertEq(e.covererBalance, c - paidCover);
        assertEq(e.familyBalance, f - paidFamily);
        assertEq(usdc.balanceOf(provider), paidCover + paidFamily);
        assertEq(usdc.balanceOf(address(cg)), e.covererBalance + e.familyBalance);
    }
}

contract ConstructorTest is BaseTest {
    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(CareGuardEpisode.ZeroAddress.selector);
        new CareGuardEpisode(usdc, address(0), approver);
        vm.expectRevert(CareGuardEpisode.ZeroAddress.selector);
        new CareGuardEpisode(usdc, agent, address(0));
    }

    function test_setApprover_rejectsZero() public {
        vm.prank(approver);
        vm.expectRevert(CareGuardEpisode.ZeroAddress.selector);
        cg.setApprover(address(0));
    }

    function test_domainSeparator_bindsChainAndContract() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("CareGuard"),
                keccak256("1"),
                block.chainid,
                address(cg)
            )
        );
        assertEq(cg.domainSeparator(), expected);
    }
}
