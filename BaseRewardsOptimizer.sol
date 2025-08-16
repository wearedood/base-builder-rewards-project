// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title BaseRewardsOptimizer
 * @dev Advanced smart contract for optimizing Base Builder Rewards
 * Features multi-factor reward calculation, dynamic scoring, and gas optimization
 */
contract BaseRewardsOptimizer {
    
    // Events
    event RewardCalculated(address indexed user, uint256 score, uint256 reward);
    event ContributionRecorded(address indexed user, uint256 contributionType, uint256 value);
    event RewardDistributed(address indexed user, uint256 amount);
    event ParametersUpdated(uint256 newMultiplier, uint256 newBonus);

    // Structs
    struct UserProfile {
        uint256 totalContributions;
        uint256 githubScore;
        uint256 contractDeployments;
        uint256 lastUpdateTime;
        uint256 streakDays;
        bool isActive;
    }

    struct RewardParameters {
        uint256 baseMultiplier;
        uint256 streakBonus;
        uint256 diversityBonus;
        uint256 gasOptimizationReward;
        uint256 minimumThreshold;
    }

    // State variables
    mapping(address => UserProfile) public userProfiles;
    mapping(address => mapping(uint256 => uint256)) public dailyContributions;
    mapping(address => uint256) public pendingRewards;
    
    RewardParameters public rewardParams;
    address public owner;
    uint256 public totalRewardsDistributed;
    uint256 public currentWeek;
    
    // Constants
    uint256 private constant WEEK_DURATION = 7 days;
    uint256 private constant MAX_STREAK_BONUS = 500; // 5x multiplier
    uint256 private constant PRECISION = 1e18;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        rewardParams = RewardParameters({
            baseMultiplier: 100,
            streakBonus: 10,
            diversityBonus: 25,
            gasOptimizationReward: 50,
            minimumThreshold: 1000
        });
        currentWeek = block.timestamp / WEEK_DURATION;
    }

    /**
     * @dev Record a contribution from a user
     * @param contributionType Type of contribution (0: GitHub, 1: Contract, 2: Other)
     * @param value Value/score of the contribution
     */
    function recordContribution(uint256 contributionType, uint256 value) external {
        require(value > 0, "Invalid contribution value");
        
        UserProfile storage user = userProfiles[msg.sender];
        uint256 today = block.timestamp / 1 days;
        
        // Update user profile
        user.totalContributions += value;
        user.lastUpdateTime = block.timestamp;
        user.isActive = true;
        
        // Update daily contributions
        dailyContributions[msg.sender][today] += value;
        
        // Update specific contribution types
        if (contributionType == 0) {
            user.githubScore += value;
        } else if (contributionType == 1) {
            user.contractDeployments += 1;
        }
        
        // Update streak
        _updateStreak(msg.sender);
        
        emit ContributionRecorded(msg.sender, contributionType, value);
    }

    /**
     * @dev Calculate optimized reward for a user
     * @param user Address of the user
     * @return Calculated reward amount
     */
    function calculateOptimizedReward(address user) public view returns (uint256) {
        UserProfile memory profile = userProfiles[user];
        
        if (!profile.isActive || profile.totalContributions < rewardParams.minimumThreshold) {
            return 0;
        }

        uint256 baseReward = (profile.totalContributions * rewardParams.baseMultiplier) / 100;
        
        // Apply streak bonus (up to 5x)
        uint256 streakMultiplier = _calculateStreakMultiplier(profile.streakDays);
        baseReward = (baseReward * streakMultiplier) / 100;
        
        // Apply diversity bonus
        uint256 diversityMultiplier = _calculateDiversityBonus(user);
        baseReward = (baseReward * diversityMultiplier) / 100;
        
        // Apply gas optimization bonus
        if (profile.contractDeployments > 0) {
            uint256 gasBonus = profile.contractDeployments * rewardParams.gasOptimizationReward;
            baseReward += gasBonus;
        }
        
        return baseReward;
    }

    function _updateStreak(address user) private {
        UserProfile storage profile = userProfiles[user];
        uint256 today = block.timestamp / 1 days;
        uint256 yesterday = today - 1;
        
        if (dailyContributions[user][yesterday] > 0) {
            profile.streakDays += 1;
        } else {
            profile.streakDays = 1;
        }
    }

    function _calculateStreakMultiplier(uint256 streakDays) private pure returns (uint256) {
        if (streakDays >= 30) return 500;
        if (streakDays >= 14) return 300;
        if (streakDays >= 7) return 200;
        if (streakDays >= 3) return 150;
        return 100;
    }

    function _calculateDiversityBonus(address user) private view returns (uint256) {
        UserProfile memory profile = userProfiles[user];
        uint256 diversityScore = 100;
        
        if (profile.githubScore > 0) {
            diversityScore += rewardParams.diversityBonus;
        }
        
        if (profile.contractDeployments > 0) {
            diversityScore += rewardParams.diversityBonus;
        }
        
        return diversityScore;
    }

    function updateRewardParameters(
        uint256 newMultiplier,
        uint256 newStreakBonus,
        uint256 newDiversityBonus,
        uint256 newGasReward
    ) external onlyOwner {
        rewardParams.baseMultiplier = newMultiplier;
        rewardParams.streakBonus = newStreakBonus;
        rewardParams.diversityBonus = newDiversityBonus;
        rewardParams.gasOptimizationReward = newGasReward;
        
        emit ParametersUpdated(newMultiplier, newStreakBonus);
    }

    function getUserProfile(address user) external view returns (UserProfile memory) {
        return userProfiles[user];
    }

    function getContractStats() external view returns (uint256, uint256, uint256) {
        return (address(this).balance, totalRewardsDistributed, currentWeek);
    }

    function batchRecordContributions(
        uint256[] calldata contributionTypes,
        uint256[] calldata values
    ) external {
        require(contributionTypes.length == values.length, "Array length mismatch");
        
        for (uint256 i = 0; i < contributionTypes.length; i++) {
            recordContribution(contributionTypes[i], values[i]);
        }
    }

    function getTopContributors(address[] calldata users) external view returns (
        address[] memory topUsers,
        uint256[] memory scores
    ) {
        uint256 length = users.length;
        topUsers = new address[](length);
        scores = new uint256[](length);
        
        for (uint256 i = 0; i < length; i++) {
            topUsers[i] = users[i];
            scores[i] = calculateOptimizedReward(users[i]);
        }
        
        return (topUsers, scores);
    }
}
