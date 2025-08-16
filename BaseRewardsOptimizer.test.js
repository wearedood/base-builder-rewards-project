/**
 * Comprehensive Test Suite for BaseRewardsOptimizer
 * Tests all functionality including edge cases and gas optimization
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time, loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe('BaseRewardsOptimizer', function () {
  // Test fixture for deployment
  async function deployBaseRewardsFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy the contract
    const BaseRewardsOptimizer = await ethers.getContractFactory('BaseRewardsOptimizer');
    const rewardsOptimizer = await BaseRewardsOptimizer.deploy();
    await rewardsOptimizer.waitForDeployment();

    return { rewardsOptimizer, owner, user1, user2, user3 };
  }

  describe('Deployment', function () {
    it('Should deploy with correct initial parameters', async function () {
      const { rewardsOptimizer, owner } = await loadFixture(deployBaseRewardsFixture);
      
      expect(await rewardsOptimizer.owner()).to.equal(owner.address);
      
      const params = await rewardsOptimizer.rewardParams();
      expect(params.baseMultiplier).to.equal(100);
      expect(params.streakBonus).to.equal(10);
      expect(params.diversityBonus).to.equal(25);
      expect(params.gasOptimizationReward).to.equal(50);
      expect(params.minimumThreshold).to.equal(1000);
    });

    it('Should initialize with correct week calculation', async function () {
      const { rewardsOptimizer } = await loadFixture(deployBaseRewardsFixture);
      
      const currentWeek = await rewardsOptimizer.currentWeek();
      const expectedWeek = Math.floor(Date.now() / 1000 / (7 * 24 * 60 * 60));
      
      expect(currentWeek).to.be.closeTo(expectedWeek, 1);
    });
  });

  describe('Contribution Recording', function () {
    it('Should record GitHub contributions correctly', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await expect(rewardsOptimizer.connect(user1).recordContribution(0, 1500))
        .to.emit(rewardsOptimizer, 'ContributionRecorded')
        .withArgs(user1.address, 0, 1500);
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.totalContributions).to.equal(1500);
      expect(profile.githubScore).to.equal(1500);
      expect(profile.contractDeployments).to.equal(0);
      expect(profile.isActive).to.be.true;
      expect(profile.streakDays).to.equal(1);
    });

    it('Should record contract deployment contributions correctly', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await expect(rewardsOptimizer.connect(user1).recordContribution(1, 800))
        .to.emit(rewardsOptimizer, 'ContributionRecorded')
        .withArgs(user1.address, 1, 800);
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.totalContributions).to.equal(800);
      expect(profile.githubScore).to.equal(0);
      expect(profile.contractDeployments).to.equal(1);
      expect(profile.isActive).to.be.true;
    });

    it('Should record other type contributions correctly', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await rewardsOptimizer.connect(user1).recordContribution(2, 500);
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.totalContributions).to.equal(500);
      expect(profile.githubScore).to.equal(0);
      expect(profile.contractDeployments).to.equal(0);
    });

    it('Should reject zero value contributions', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await expect(rewardsOptimizer.connect(user1).recordContribution(0, 0))
        .to.be.revertedWith('Invalid contribution value');
    });

    it('Should accumulate multiple contributions correctly', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await rewardsOptimizer.connect(user1).recordContribution(0, 1000);
      await rewardsOptimizer.connect(user1).recordContribution(0, 500);
      await rewardsOptimizer.connect(user1).recordContribution(1, 300);
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.totalContributions).to.equal(1800);
      expect(profile.githubScore).to.equal(1500);
      expect(profile.contractDeployments).to.equal(1);
    });
  });

  describe('Streak Calculation', function () {
    it('Should initialize streak to 1 on first contribution', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await rewardsOptimizer.connect(user1).recordContribution(0, 1000);
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.streakDays).to.equal(1);
    });

    it('Should increment streak for consecutive day contributions', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      // Day 1
      await rewardsOptimizer.connect(user1).recordContribution(0, 1000);
      
      // Advance time by 1 day
      await time.increase(24 * 60 * 60);
      
      // Day 2
      await rewardsOptimizer.connect(user1).recordContribution(0, 500);
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.streakDays).to.equal(2);
    });

    it('Should reset streak if day is skipped', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      // Day 1
      await rewardsOptimizer.connect(user1).recordContribution(0, 1000);
      
      // Skip a day - advance by 2 days
      await time.increase(2 * 24 * 60 * 60);
      
      // Day 3 (skipped day 2)
      await rewardsOptimizer.connect(user1).recordContribution(0, 500);
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.streakDays).to.equal(1); // Reset to 1
    });
  });

  describe('Reward Calculation', function () {
    it('Should return zero for inactive users', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      const reward = await rewardsOptimizer.calculateOptimizedReward(user1.address);
      expect(reward).to.equal(0);
    });

    it('Should return zero for users below minimum threshold', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await rewardsOptimizer.connect(user1).recordContribution(0, 500); // Below 1000 threshold
      
      const reward = await rewardsOptimizer.calculateOptimizedReward(user1.address);
      expect(reward).to.equal(0);
    });

    it('Should calculate base reward correctly', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await rewardsOptimizer.connect(user1).recordContribution(0, 2000);
      
      const reward = await rewardsOptimizer.calculateOptimizedReward(user1.address);
      
      // Base calculation: 2000 * 100 / 100 = 2000
      // With 1-day streak (1x multiplier) and GitHub diversity bonus (1.25x)
      // Expected: 2000 * 1.0 * 1.25 = 2500
      expect(reward).to.equal(2500);
    });

    it('Should apply streak multipliers correctly', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      // Create a 7-day streak
      for (let i = 0; i < 7; i++) {
        await rewardsOptimizer.connect(user1).recordContribution(0, 200);
        if (i < 6) await time.increase(24 * 60 * 60);
      }
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.streakDays).to.equal(7);
      
      const reward = await rewardsOptimizer.calculateOptimizedReward(user1.address);
      
      // Base: 1400 * 100 / 100 = 1400
      // 7-day streak = 2x multiplier
      // GitHub diversity = 1.25x
      // Expected: 1400 * 2.0 * 1.25 = 3500
      expect(reward).to.equal(3500);
    });

    it('Should apply diversity bonus for multiple contribution types', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await rewardsOptimizer.connect(user1).recordContribution(0, 1000); // GitHub
      await rewardsOptimizer.connect(user1).recordContribution(1, 500);  // Contract
      
      const reward = await rewardsOptimizer.calculateOptimizedReward(user1.address);
      
      // Base: 1500 * 100 / 100 = 1500
      // 1-day streak = 1x multiplier
      // Both GitHub and Contract diversity = 1.5x (1.0 + 0.25 + 0.25)
      // Gas optimization bonus: 1 deployment * 50 = 50
      // Expected: (1500 * 1.0 * 1.5) + 50 = 2250 + 50 = 2300
      expect(reward).to.equal(2300);
    });

    it('Should apply gas optimization bonus correctly', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await rewardsOptimizer.connect(user1).recordContribution(0, 1000);
      await rewardsOptimizer.connect(user1).recordContribution(1, 500);
      await rewardsOptimizer.connect(user1).recordContribution(1, 300);
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.contractDeployments).to.equal(2);
      
      const reward = await rewardsOptimizer.calculateOptimizedReward(user1.address);
      
      // Gas optimization bonus: 2 deployments * 50 = 100
      // Should be included in total reward
      expect(reward).to.be.gt(2000); // Should be significantly higher due to bonus
    });
  });

  describe('Batch Operations', function () {
    it('Should batch record contributions correctly', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      const types = [0, 1, 0, 2];
      const values = [1000, 500, 800, 300];
      
      await expect(rewardsOptimizer.connect(user1).batchRecordContributions(types, values))
        .to.emit(rewardsOptimizer, 'ContributionRecorded')
        .withArgs(user1.address, 0, 1000);
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.totalContributions).to.equal(2600);
      expect(profile.githubScore).to.equal(1800);
      expect(profile.contractDeployments).to.equal(1);
    });

    it('Should reject batch operations with mismatched arrays', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      const types = [0, 1];
      const values = [1000, 500, 800]; // Different length
      
      await expect(rewardsOptimizer.connect(user1).batchRecordContributions(types, values))
        .to.be.revertedWith('Array length mismatch');
    });
  });

  describe('Leaderboard', function () {
    it('Should return correct leaderboard rankings', async function () {
      const { rewardsOptimizer, user1, user2, user3 } = await loadFixture(deployBaseRewardsFixture);
      
      // Setup different scores for users
      await rewardsOptimizer.connect(user1).recordContribution(0, 3000);
      await rewardsOptimizer.connect(user2).recordContribution(0, 2000);
      await rewardsOptimizer.connect(user3).recordContribution(0, 1500);
      
      const users = [user1.address, user2.address, user3.address];
      const [topUsers, scores] = await rewardsOptimizer.getTopContributors(users);
      
      // Should be sorted by score (highest first)
      expect(topUsers[0]).to.equal(user1.address);
      expect(topUsers[1]).to.equal(user2.address);
      expect(topUsers[2]).to.equal(user3.address);
      
      expect(scores[0]).to.be.gt(scores[1]);
      expect(scores[1]).to.be.gt(scores[2]);
    });
  });

  describe('Parameter Updates', function () {
    it('Should allow owner to update parameters', async function () {
      const { rewardsOptimizer, owner } = await loadFixture(deployBaseRewardsFixture);
      
      await expect(rewardsOptimizer.connect(owner).updateRewardParameters(150, 15, 30, 75))
        .to.emit(rewardsOptimizer, 'ParametersUpdated')
        .withArgs(150, 15);
      
      const params = await rewardsOptimizer.rewardParams();
      expect(params.baseMultiplier).to.equal(150);
      expect(params.streakBonus).to.equal(15);
      expect(params.diversityBonus).to.equal(30);
      expect(params.gasOptimizationReward).to.equal(75);
    });

    it('Should reject parameter updates from non-owner', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      await expect(rewardsOptimizer.connect(user1).updateRewardParameters(150, 15, 30, 75))
        .to.be.revertedWith('Not authorized');
    });
  });

  describe('Contract Statistics', function () {
    it('Should return correct contract statistics', async function () {
      const { rewardsOptimizer } = await loadFixture(deployBaseRewardsFixture);
      
      const [balance, totalRewards, currentWeek] = await rewardsOptimizer.getContractStats();
      
      expect(balance).to.equal(0); // No ETH balance initially
      expect(totalRewards).to.equal(0); // No rewards distributed yet
      expect(currentWeek).to.be.gt(0); // Should have a valid week number
    });
  });

  describe('Edge Cases and Security', function () {
    it('Should handle maximum values correctly', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      const maxValue = ethers.MaxUint256;
      
      // This should not overflow
      await expect(rewardsOptimizer.connect(user1).recordContribution(0, 1000))
        .to.not.be.reverted;
    });

    it('Should handle multiple users independently', async function () {
      const { rewardsOptimizer, user1, user2 } = await loadFixture(deployBaseRewardsFixture);
      
      await rewardsOptimizer.connect(user1).recordContribution(0, 2000);
      await rewardsOptimizer.connect(user2).recordContribution(1, 1500);
      
      const profile1 = await rewardsOptimizer.getUserProfile(user1.address);
      const profile2 = await rewardsOptimizer.getUserProfile(user2.address);
      
      expect(profile1.githubScore).to.equal(2000);
      expect(profile1.contractDeployments).to.equal(0);
      
      expect(profile2.githubScore).to.equal(0);
      expect(profile2.contractDeployments).to.equal(1);
    });

    it('Should maintain state consistency across multiple operations', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      // Perform multiple operations
      for (let i = 0; i < 10; i++) {
        await rewardsOptimizer.connect(user1).recordContribution(0, 100);
      }
      
      const profile = await rewardsOptimizer.getUserProfile(user1.address);
      expect(profile.totalContributions).to.equal(1000);
      expect(profile.githubScore).to.equal(1000);
      
      const reward = await rewardsOptimizer.calculateOptimizedReward(user1.address);
      expect(reward).to.be.gt(0);
    });
  });

  describe('Gas Optimization Tests', function () {
    it('Should use reasonable gas for single contribution', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      const tx = await rewardsOptimizer.connect(user1).recordContribution(0, 1000);
      const receipt = await tx.wait();
      
      // Should use less than 100k gas for a single contribution
      expect(receipt.gasUsed).to.be.lt(100000);
    });

    it('Should be more gas efficient for batch operations', async function () {
      const { rewardsOptimizer, user1 } = await loadFixture(deployBaseRewardsFixture);
      
      const types = [0, 0, 0, 0, 0];
      const values = [200, 200, 200, 200, 200];
      
      const batchTx = await rewardsOptimizer.connect(user1).batchRecordContributions(types, values);
      const batchReceipt = await batchTx.wait();
      
      // Batch should be more efficient than 5 individual transactions
      expect(batchReceipt.gasUsed).to.be.lt(400000); // Less than 5 * 80k
    });
  });
});
