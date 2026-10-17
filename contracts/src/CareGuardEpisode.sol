// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CareGuardEpisode
/// @notice Holds USDC for medical treatment episodes. Money can only go to the episode's provider
///         (as a paid charge) or back to the payer who sent it (as a refund). There is no admin withdrawal.
contract CareGuardEpisode is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Created,
        Active,
        MarginCall,
        Closed,
        Expired
    }

    /// @dev Order matches `decisions.kind` in the database: size, review, escalate, margin_call, discharge.
    enum DecisionKind {
        Size,
        Review,
        Escalate,
        MarginCall,
        Discharge
    }

    struct Episode {
        address provider;
        address coverer; // pays covered items
        address family; // pays the rest
        uint256 guarantee; // agent's sized amount, USDC (6 decimals)
        uint256 perChargeCap;
        uint64 expiresAt;
        uint256 covererBalance;
        uint256 familyBalance;
        uint256 paidTotal;
        Status status;
    }

    /// @dev Must match app/lib/eip712.ts character for character.
    bytes32 public constant APPROVE_CHARGE_TYPEHASH = keccak256(
        "ApproveCharge(uint256 episodeId,bytes32 chargeHash,uint256 amount,uint256 coveredAmount,uint256 deadline)"
    );

    IERC20 public immutable usdc;
    address public immutable agent;
    address public approver;

    uint256 public nextEpisodeId = 1;
    mapping(uint256 => Episode) public episodes;
    mapping(bytes32 => bool) public chargeUsed; // blocks double payment
    /// @dev Refunds whose transfer failed (e.g. the token froze that payer). Claimable by the payer only.
    mapping(address => uint256) public pendingRefunds;
    uint256 public totalPendingRefunds;

    event EpisodeCreated(
        uint256 indexed episodeId,
        address indexed provider,
        address coverer,
        address family,
        uint256 guarantee,
        uint256 perChargeCap,
        uint64 expiresAt
    );
    event Funded(uint256 indexed episodeId, address indexed payer, uint256 amount);
    event ChargePaid(uint256 indexed episodeId, bytes32 indexed chargeHash, uint256 amount, uint256 coveredAmount);
    event MarginCall(uint256 indexed episodeId, address indexed payer, uint256 amount, bytes32 reasonHash);
    event DecisionLogged(uint256 indexed episodeId, DecisionKind kind, bytes32 decisionHash);
    event Refunded(uint256 indexed episodeId, address indexed payer, uint256 amount);
    event RefundDeferred(uint256 indexed episodeId, address indexed payer, uint256 amount);
    event RefundClaimed(address indexed payer, uint256 amount);
    event EpisodeClosed(uint256 indexed episodeId);
    event EpisodeExpired(uint256 indexed episodeId);
    event ApproverChanged(address indexed previousApprover, address indexed newApprover);

    error NotAgent();
    error NotApprover();
    error NotPayer();
    error ZeroAddress();
    error ZeroAmount();
    error DuplicateParty();
    error ExpiryInPast();
    error CapAboveGuarantee();
    error EpisodeNotFound();
    error EpisodeNotOpen();
    error EpisodeExpiredAlready();
    error NotYetExpired();
    error AboveCap(uint256 amount, uint256 cap);
    error CoveredAboveAmount();
    error ChargeAlreadyUsed();
    error InsufficientCovererBalance(uint256 needed, uint256 available);
    error InsufficientFamilyBalance(uint256 needed, uint256 available);
    error ApprovalExpired();
    error InvalidApproval();
    error NothingToClaim();

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(IERC20 usdc_, address agent_, address approver_) EIP712("CareGuard", "1") {
        if (address(usdc_) == address(0) || agent_ == address(0) || approver_ == address(0)) revert ZeroAddress();
        usdc = usdc_;
        agent = agent_;
        approver = approver_;
        emit ApproverChanged(address(0), approver_);
    }

    // ---------------------------------------------------------------- agent

    function createEpisode(
        address provider,
        address coverer,
        address family,
        uint256 guarantee,
        uint256 perChargeCap,
        uint64 expiresAt
    ) external onlyAgent returns (uint256 episodeId) {
        if (provider == address(0) || coverer == address(0) || family == address(0)) revert ZeroAddress();
        if (provider == coverer || provider == family || coverer == family) revert DuplicateParty();
        if (guarantee == 0 || perChargeCap == 0) revert ZeroAmount();
        if (perChargeCap > guarantee) revert CapAboveGuarantee();
        if (expiresAt <= block.timestamp) revert ExpiryInPast();

        episodeId = nextEpisodeId++;
        Episode storage e = episodes[episodeId];
        e.provider = provider;
        e.coverer = coverer;
        e.family = family;
        e.guarantee = guarantee;
        e.perChargeCap = perChargeCap;
        e.expiresAt = expiresAt;
        e.status = Status.Created;

        emit EpisodeCreated(episodeId, provider, coverer, family, guarantee, perChargeCap, expiresAt);
    }

    function payCharge(uint256 episodeId, bytes32 chargeHash, uint256 amount, uint256 coveredAmount)
        external
        onlyAgent
        nonReentrant
    {
        Episode storage e = _openUnexpired(episodeId);
        if (amount > e.perChargeCap) revert AboveCap(amount, e.perChargeCap);
        _pay(episodeId, e, chargeHash, amount, coveredAmount);
    }

    /// @notice Pays a charge above the per-charge cap, carrying the human approver's EIP-712 signature.
    function payChargeApproved(
        uint256 episodeId,
        bytes32 chargeHash,
        uint256 amount,
        uint256 coveredAmount,
        uint256 deadline,
        bytes calldata signature
    ) external onlyAgent nonReentrant {
        Episode storage e = _openUnexpired(episodeId);
        if (block.timestamp > deadline) revert ApprovalExpired();
        bytes32 digest = approvalDigest(episodeId, chargeHash, amount, coveredAmount, deadline);
        if (!SignatureChecker.isValidSignatureNow(approver, digest, signature)) revert InvalidApproval();
        _pay(episodeId, e, chargeHash, amount, coveredAmount);
    }

    function raiseMarginCall(uint256 episodeId, address payer, uint256 amount, bytes32 reasonHash) external onlyAgent {
        Episode storage e = _openUnexpired(episodeId);
        if (payer != e.coverer && payer != e.family) revert NotPayer();
        if (amount == 0) revert ZeroAmount();
        e.status = Status.MarginCall;
        emit MarginCall(episodeId, payer, amount, reasonHash);
    }

    function logDecision(uint256 episodeId, DecisionKind kind, bytes32 decisionHash) external onlyAgent {
        if (episodes[episodeId].status == Status.None) revert EpisodeNotFound();
        emit DecisionLogged(episodeId, kind, decisionHash);
    }

    /// @notice Ends treatment: everything left returns to each payer. Allowed after expiry too.
    function discharge(uint256 episodeId) external onlyAgent nonReentrant {
        Episode storage e = _open(episodeId);
        e.status = Status.Closed;
        emit EpisodeClosed(episodeId);
        _refundAll(episodeId, e);
    }

    // ---------------------------------------------------------------- payers

    function fund(uint256 episodeId, uint256 amount) external nonReentrant {
        Episode storage e = _openUnexpired(episodeId);
        if (amount == 0) revert ZeroAmount();
        if (msg.sender == e.coverer) {
            e.covererBalance += amount;
        } else if (msg.sender == e.family) {
            e.familyBalance += amount;
        } else {
            revert NotPayer();
        }
        if (e.status == Status.MarginCall) e.status = Status.Active;
        emit Funded(episodeId, msg.sender, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    // ---------------------------------------------------------------- anyone

    /// @notice Safety net if the agent goes silent: after expiry anyone can return the funds to the payers.
    function refundExpired(uint256 episodeId) external nonReentrant {
        Episode storage e = _open(episodeId);
        if (block.timestamp < e.expiresAt) revert NotYetExpired();
        e.status = Status.Expired;
        emit EpisodeExpired(episodeId);
        _refundAll(episodeId, e);
    }

    /// @notice Collects refunds that couldn't be sent automatically. Money only ever goes back to the payer.
    function claimRefund() external nonReentrant {
        uint256 amount = pendingRefunds[msg.sender];
        if (amount == 0) revert NothingToClaim();
        pendingRefunds[msg.sender] = 0;
        totalPendingRefunds -= amount;
        emit RefundClaimed(msg.sender, amount);
        usdc.safeTransfer(msg.sender, amount);
    }

    // ---------------------------------------------------------------- approver

    /// @notice Lets the approver rotate their own key. Nobody else can change it.
    function setApprover(address newApprover) external {
        if (msg.sender != approver) revert NotApprover();
        if (newApprover == address(0)) revert ZeroAddress();
        emit ApproverChanged(approver, newApprover);
        approver = newApprover;
    }

    // ---------------------------------------------------------------- views

    function approvalDigest(uint256 episodeId, bytes32 chargeHash, uint256 amount, uint256 coveredAmount, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(abi.encode(APPROVE_CHARGE_TYPEHASH, episodeId, chargeHash, amount, coveredAmount, deadline))
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getEpisode(uint256 episodeId) external view returns (Episode memory) {
        return episodes[episodeId];
    }

    // ---------------------------------------------------------------- internal

    function _open(uint256 episodeId) private view returns (Episode storage e) {
        e = episodes[episodeId];
        if (e.status == Status.None) revert EpisodeNotFound();
        if (e.status == Status.Closed || e.status == Status.Expired) revert EpisodeNotOpen();
    }

    function _openUnexpired(uint256 episodeId) private view returns (Episode storage e) {
        e = _open(episodeId);
        if (block.timestamp >= e.expiresAt) revert EpisodeExpiredAlready();
    }

    function _pay(uint256 episodeId, Episode storage e, bytes32 chargeHash, uint256 amount, uint256 coveredAmount)
        private
    {
        if (amount == 0) revert ZeroAmount();
        if (coveredAmount > amount) revert CoveredAboveAmount();
        if (chargeUsed[chargeHash]) revert ChargeAlreadyUsed();
        uint256 familyAmount = amount - coveredAmount;
        if (coveredAmount > e.covererBalance) revert InsufficientCovererBalance(coveredAmount, e.covererBalance);
        if (familyAmount > e.familyBalance) revert InsufficientFamilyBalance(familyAmount, e.familyBalance);

        chargeUsed[chargeHash] = true;
        e.covererBalance -= coveredAmount;
        e.familyBalance -= familyAmount;
        e.paidTotal += amount;
        // A margin call stays raised until a payer tops up; only a fresh episode becomes Active here.
        if (e.status == Status.Created) e.status = Status.Active;

        emit ChargePaid(episodeId, chargeHash, amount, coveredAmount);
        usdc.safeTransfer(e.provider, amount);
    }

    function _refundAll(uint256 episodeId, Episode storage e) private {
        uint256 toCoverer = e.covererBalance;
        uint256 toFamily = e.familyBalance;
        e.covererBalance = 0;
        e.familyBalance = 0;
        _refund(episodeId, e.coverer, toCoverer);
        _refund(episodeId, e.family, toFamily);
    }

    /// @dev Sends a refund, or keeps it claimable if the transfer fails, so one payer can never block the other's refund.
    function _refund(uint256 episodeId, address payer, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = address(usdc).call(abi.encodeCall(IERC20.transfer, (payer, amount)));
        if (ok && (ret.length == 0 || abi.decode(ret, (bool)))) {
            emit Refunded(episodeId, payer, amount);
        } else {
            pendingRefunds[payer] += amount;
            totalPendingRefunds += amount;
            emit RefundDeferred(episodeId, payer, amount);
        }
    }
}
