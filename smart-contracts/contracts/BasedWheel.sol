// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BasedWheel - MONEY PRINTER spin game on Base
/// @notice 1 free spin / 24h (text only), paid spins with ETH prizes + capped jackpot
contract BasedWheel {
    // ========= CONFIG =========

    /// @notice Price for a paid spin: 0.00042 ETH
    uint256 public constant SPIN_PRICE = 420000000000000 wei; // 0.00042 ETH

    /// @notice Jackpot cap: max 1.5 ETH, to keep the game +EV for the contract
    uint256 public constant JACKPOT_CAP = 1.5 ether;

    /// @notice Jackpot is 30% of the current pool (before cap)
    uint256 public constant JACKPOT_PERCENT = 30; // 30%

    /// @notice Free spin cooldown
    uint256 public constant FREE_SPIN_COOLDOWN = 1 days;

    address public owner;
    bool public gameStopped;
    uint256 public stopTimestamp;

    // Last free spin time per address
    mapping(address => uint256) public lastFreeSpinAt;

    // Simple nonce for randomness
    uint256 private nonce;

    // ========= EVENTS =========

    /// @param player caller
    /// @param isFree true if free spin
    /// @param tier 0=text,1=0.001,2=0.01,3=0.05,4=jackpot
    /// @param amountWei ETH paid out (0 for text/free)
    /// @param message short result text
    event SpinResult(
        address indexed player,
        bool indexed isFree,
        uint8 tier,
        uint256 amountWei,
        string message
    );

    event Withdraw40(address indexed to, uint256 amount);
    event EmergencyStopped(address indexed by);
    event EmergencyWithdrawAll(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // ========= MODIFIERS =========

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier notStopped() {
        require(!gameStopped, "Game stopped");
        _;
    }

    // ========= CONSTRUCTOR =========

    /// @param _owner initial owner; if zero, deployer becomes owner
    constructor(address _owner) {
        owner = _owner == address(0) ? msg.sender : _owner;
        emit OwnershipTransferred(address(0), owner);
    }

    // ========= VIEW HELPERS =========

    /// @notice Current prize pool = contract balance
    function getPoolBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Check if user can use free spin right now
    function freeSpinAvailable(address user) public view returns (bool) {
        return block.timestamp >= lastFreeSpinAt[user] + FREE_SPIN_COOLDOWN;
    }

    // ========= RANDOMNESS (best-effort, not VRF) =========

    function _rand(uint256 maxExclusive) internal returns (uint256) {
        // NOTE: This is NOT secure VRF, but acceptable for a degen wheel.
        nonce++;
        uint256 random = uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    block.timestamp,
                    msg.sender,
                    nonce
                )
            )
        );
        return random % maxExclusive;
    }

    // ========= FREE SPIN =========

    /// @notice Free spin, once per 24h per wallet, text only (no ETH prizes).
    function spinFree() external notStopped {
        require(freeSpinAvailable(msg.sender), "Free spin used, wait 24h");
        lastFreeSpinAt[msg.sender] = block.timestamp;

        emit SpinResult(msg.sender, true, 0, 0, "Motivational only (free spin)");
    }

    // ========= PAID SPIN =========

    /// @notice Paid spin with full prize table, including jackpot.
    /// @dev Must be called with exactly SPIN_PRICE wei.
    function spinPaid() external payable notStopped {
        require(msg.value == SPIN_PRICE, "Wrong spin price");

        // We'll roll in [0, 100000) to get 3 decimal precision.
        // Probabilities in "milli-percent" (x1000):
        // 95_000 -> text
        // 4_000  -> 0.001
        // 900    -> 0.01
        // 90     -> 0.05
        // 10     -> jackpot
        uint256 roll = _rand(100_000);

        uint8 tier;
        uint256 payout;

        if (roll < 95_000) {
            // 95% -> motivational text only
            tier = 0;
            payout = 0;
        } else if (roll < 95_000 + 4_000) {
            // next 4% -> 0.001 ETH
            tier = 1;
            payout = 0.001 ether;
        } else if (roll < 95_000 + 4_000 + 900) {
            // next 0.9% -> 0.01 ETH
            tier = 2;
            payout = 0.01 ether;
        } else if (roll < 95_000 + 4_000 + 900 + 90) {
            // next 0.09% -> 0.05 ETH
            tier = 3;
            payout = 0.05 ether;
        } else {
            // last 0.01% -> jackpot
            tier = 4;
            payout = _computeJackpot();
        }

        uint256 balanceBefore = address(this).balance;

        // Safety: never pay more than we have
        require(balanceBefore >= payout, "Insufficient balance for prize");

        string memory message;

        if (tier == 0) {
            message = "Motivational only";
        } else if (tier == 1) {
            message = "You won 0.001 ETH!";
        } else if (tier == 2) {
            message = "You won 0.01 ETH!";
        } else if (tier == 3) {
            message = "You won 0.05 ETH!";
        } else {
            message = "JACKPOT!";
        }

        if (payout > 0) {
            (bool ok, ) = msg.sender.call{value: payout}("");
            require(ok, "Transfer failed");
        }

        emit SpinResult(msg.sender, false, tier, payout, message);
    }

    function _computeJackpot() internal view returns (uint256) {
        uint256 pool = address(this).balance;
        uint256 raw = (pool * JACKPOT_PERCENT) / 100; // 30% of pool
        if (raw > JACKPOT_CAP) {
            raw = JACKPOT_CAP;
        }
        return raw;
    }

    // ========= ADMIN =========

    /// @notice Withdraws 40% of current balance to owner
    function withdraw40() external onlyOwner {
        uint256 bal = address(this).balance;
        uint256 amount = (bal * 40) / 100;
        require(amount > 0, "Nothing to withdraw");
        (bool ok, ) = owner.call{value: amount}("");
        require(ok, "Transfer failed");
        emit Withdraw40(owner, amount);
    }

    /// @notice Stops the game permanently (no more spins).
    function stopGame() external onlyOwner {
        require(!gameStopped, "Already stopped");
        gameStopped = true;
        stopTimestamp = block.timestamp;
        emit EmergencyStopped(msg.sender);
    }

    /// @notice After game is stopped, owner can pull all remaining funds.
    function emergencyWithdrawAll() external onlyOwner {
        require(gameStopped, "Game not stopped");

        uint256 bal = address(this).balance;
        require(bal > 0, "No funds");
        (bool ok, ) = owner.call{value: bal}("");
        require(ok, "Transfer failed");
        emit EmergencyWithdrawAll(owner, bal);
    }

    /// @notice Transfer ownership (optional helper)
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Receive ETH (in case someone sends directly)
    receive() external payable {}
}
