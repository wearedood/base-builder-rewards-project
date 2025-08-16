/**
 * Base Builder Rewards Utilities
 * Comprehensive TypeScript utilities for interacting with Base Builder Rewards contracts
 * and optimizing reward calculations
 */

import { ethers } from 'ethers';
import { Contract, Provider } from 'ethers';

// Types and Interfaces
export interface UserProfile {
  totalContributions: bigint;
  githubScore: bigint;
  contractDeployments: bigint;
  lastUpdateTime: bigint;
  streakDays: bigint;
  isActive: boolean;
}

export interface RewardParameters {
  baseMultiplier: bigint;
  streakBonus: bigint;
  diversityBonus: bigint;
  gasOptimizationReward: bigint;
  minimumThreshold: bigint;
}

export interface ContributionData {
  type: number; // 0: GitHub, 1: Contract, 2: Other
  value: bigint;
  timestamp: number;
  description?: string;
}

export interface RewardCalculation {
  baseReward: bigint;
  streakMultiplier: number;
  diversityBonus: number;
  gasOptimizationBonus: bigint;
  totalReward: bigint;
}

// Contract ABI (simplified for key functions)
export const BASE_REWARDS_ABI = [
  'function recordContribution(uint256 contributionType, uint256 value) external',
  'function calculateOptimizedReward(address user) external view returns (uint256)',
  'function getUserProfile(address user) external view returns (tuple(uint256,uint256,uint256,uint256,uint256,bool))',
  'function getContractStats() external view returns (uint256, uint256, uint256)',
  'function batchRecordContributions(uint256[] calldata contributionTypes, uint256[] calldata values) external',
  'function getTopContributors(address[] calldata users) external view returns (address[], uint256[])',
  'event ContributionRecorded(address indexed user, uint256 contributionType, uint256 value)',
  'event RewardDistributed(address indexed user, uint256 amount)'
];

/**
 * BaseRewardsManager - Main utility class for Base Builder Rewards
 */
export class BaseRewardsManager {
  private contract: Contract;
  private provider: Provider;
  private signer?: ethers.Signer;

  constructor(
    contractAddress: string,
    provider: Provider,
    signer?: ethers.Signer
  ) {
    this.provider = provider;
    this.signer = signer;
    this.contract = new ethers.Contract(
      contractAddress,
      BASE_REWARDS_ABI,
      signer || provider
    );
  }

  /**
   * Record a single contribution
   */
  async recordContribution(
    contributionType: number,
    value: bigint,
    description?: string
  ): Promise<ethers.TransactionResponse> {
    if (!this.signer) {
      throw new Error('Signer required for transactions');
    }

    const tx = await this.contract.recordContribution(contributionType, value);
    
    // Log contribution for analytics
    console.log(`Recorded contribution: Type ${contributionType}, Value ${value}, Description: ${description || 'N/A'}`);
    
    return tx;
  }

  /**
   * Record multiple contributions in a single transaction (gas optimization)
   */
  async batchRecordContributions(
    contributions: ContributionData[]
  ): Promise<ethers.TransactionResponse> {
    if (!this.signer) {
      throw new Error('Signer required for transactions');
    }

    const types = contributions.map(c => c.type);
    const values = contributions.map(c => c.value);

    const tx = await this.contract.batchRecordContributions(types, values);
    
    console.log(`Batch recorded ${contributions.length} contributions`);
    
    return tx;
  }

  /**
   * Get user profile information
   */
  async getUserProfile(userAddress: string): Promise<UserProfile> {
    const profile = await this.contract.getUserProfile(userAddress);
    
    return {
      totalContributions: profile[0],
      githubScore: profile[1],
      contractDeployments: profile[2],
      lastUpdateTime: profile[3],
      streakDays: profile[4],
      isActive: profile[5]
    };
  }

  /**
   * Calculate optimized reward for a user
   */
  async calculateReward(userAddress: string): Promise<bigint> {
    return await this.contract.calculateOptimizedReward(userAddress);
  }

  /**
   * Get detailed reward calculation breakdown
   */
  async getRewardBreakdown(userAddress: string): Promise<RewardCalculation> {
    const profile = await this.getUserProfile(userAddress);
    const totalReward = await this.calculateReward(userAddress);

    // Calculate individual components
    const baseReward = (profile.totalContributions * BigInt(100)) / BigInt(100);
    const streakMultiplier = this.calculateStreakMultiplier(Number(profile.streakDays));
    const diversityBonus = this.calculateDiversityBonus(profile);
    const gasOptimizationBonus = profile.contractDeployments * BigInt(50);

    return {
      baseReward,
      streakMultiplier,
      diversityBonus,
      gasOptimizationBonus,
      totalReward
    };
  }

  /**
   * Get contract statistics
   */
  async getContractStats(): Promise<{
    balance: bigint;
    totalRewardsDistributed: bigint;
    currentWeek: bigint;
  }> {
    const stats = await this.contract.getContractStats();
    
    return {
      balance: stats[0],
      totalRewardsDistributed: stats[1],
      currentWeek: stats[2]
    };
  }

  /**
   * Get leaderboard of top contributors
   */
  async getLeaderboard(userAddresses: string[]): Promise<{
    users: string[];
    scores: bigint[];
  }> {
    const result = await this.contract.getTopContributors(userAddresses);
    
    return {
      users: result[0],
      scores: result[1]
    };
  }

  /**
   * Listen for contribution events
   */
  onContributionRecorded(
    callback: (user: string, contributionType: number, value: bigint) => void
  ): void {
    this.contract.on('ContributionRecorded', (user, contributionType, value) => {
      callback(user, contributionType, value);
    });
  }

  /**
   * Listen for reward distribution events
   */
  onRewardDistributed(
    callback: (user: string, amount: bigint) => void
  ): void {
    this.contract.on('RewardDistributed', (user, amount) => {
      callback(user, amount);
    });
  }

  // Private helper methods
  private calculateStreakMultiplier(streakDays: number): number {
    if (streakDays >= 30) return 5.0; // 5x for 30+ days
    if (streakDays >= 14) return 3.0; // 3x for 14+ days
    if (streakDays >= 7) return 2.0;  // 2x for 7+ days
    if (streakDays >= 3) return 1.5;  // 1.5x for 3+ days
    return 1.0; // 1x base
  }

  private calculateDiversityBonus(profile: UserProfile): number {
    let bonus = 1.0; // Base 1x
    
    // Bonus for GitHub contributions
    if (profile.githubScore > 0) {
      bonus += 0.25; // 25% bonus
    }
    
    // Bonus for contract deployments
    if (profile.contractDeployments > 0) {
      bonus += 0.25; // 25% bonus
    }
    
    return bonus;
  }
}

/**
 * GitHub Integration Utilities
 */
export class GitHubRewardsTracker {
  private apiToken: string;
  private baseUrl = 'https://api.github.com';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  /**
   * Get user's GitHub activity for reward calculation
   */
  async getUserActivity(username: string, days: number = 7): Promise<{
    commits: number;
    pullRequests: number;
    issues: number;
    repositories: number;
    totalScore: number;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    try {
      // Get user's events
      const eventsResponse = await fetch(
        `${this.baseUrl}/users/${username}/events?per_page=100`,
        {
          headers: {
            'Authorization': `token ${this.apiToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (!eventsResponse.ok) {
        throw new Error(`GitHub API error: ${eventsResponse.status}`);
      }

      const events = await eventsResponse.json();
      
      // Filter events by date and type
      const recentEvents = events.filter((event: any) => 
        new Date(event.created_at) >= new Date(since)
      );

      // Count different types of contributions
      const commits = recentEvents.filter((e: any) => e.type === 'PushEvent').length;
      const pullRequests = recentEvents.filter((e: any) => e.type === 'PullRequestEvent').length;
      const issues = recentEvents.filter((e: any) => e.type === 'IssuesEvent').length;
      
      // Get repositories count
      const reposResponse = await fetch(
        `${this.baseUrl}/users/${username}/repos?type=public&sort=updated&per_page=100`,
        {
          headers: {
            'Authorization': `token ${this.apiToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      const repos = await reposResponse.json();
      const repositories = repos.length;

      // Calculate total score
      const totalScore = (commits * 10) + (pullRequests * 25) + (issues * 5) + (repositories * 2);

      return {
        commits,
        pullRequests,
        issues,
        repositories,
        totalScore
      };
    } catch (error) {
      console.error('Error fetching GitHub activity:', error);
      throw error;
    }
  }

  /**
   * Check if repositories are crypto-related
   */
  async getCryptoRepositories(username: string): Promise<string[]> {
    const cryptoKeywords = [
      'blockchain', 'crypto', 'defi', 'ethereum', 'base', 'solidity',
      'smart-contract', 'web3', 'dapp', 'nft', 'token', 'dao'
    ];

    try {
      const response = await fetch(
        `${this.baseUrl}/users/${username}/repos?type=public&per_page=100`,
        {
          headers: {
            'Authorization': `token ${this.apiToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      const repos = await response.json();
      
      return repos
        .filter((repo: any) => {
          const name = repo.name.toLowerCase();
          const description = (repo.description || '').toLowerCase();
          
          return cryptoKeywords.some(keyword => 
            name.includes(keyword) || description.includes(keyword)
          );
        })
        .map((repo: any) => repo.name);
    } catch (error) {
      console.error('Error fetching crypto repositories:', error);
      return [];
    }
  }
}

/**
 * Base Network Utilities
 */
export class BaseNetworkUtils {
  static readonly MAINNET_RPC = 'https://mainnet.base.org';
  static readonly TESTNET_RPC = 'https://goerli.base.org';
  static readonly CHAIN_ID = 8453;
  static readonly TESTNET_CHAIN_ID = 84531;

  /**
   * Get Base network provider
   */
  static getProvider(testnet: boolean = false): ethers.JsonRpcProvider {
    const rpcUrl = testnet ? this.TESTNET_RPC : this.MAINNET_RPC;
    return new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Check if connected to Base network
   */
  static async isBaseNetwork(provider: Provider): Promise<boolean> {
    try {
      const network = await provider.getNetwork();
      return network.chainId === BigInt(this.CHAIN_ID) || 
             network.chainId === BigInt(this.TESTNET_CHAIN_ID);
    } catch {
      return false;
    }
  }

  /**
   * Get gas price optimization
   */
  static async getOptimizedGasPrice(provider: Provider): Promise<bigint> {
    const feeData = await provider.getFeeData();
    
    // Use EIP-1559 if available, otherwise fallback to legacy
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      return feeData.maxFeePerGas;
    } else if (feeData.gasPrice) {
      return feeData.gasPrice;
    } else {
      // Fallback gas price
      return ethers.parseUnits('1', 'gwei');
    }
  }
}

// Export utility functions
export const formatReward = (reward: bigint): string => {
  return ethers.formatEther(reward);
};

export const parseReward = (reward: string): bigint => {
  return ethers.parseEther(reward);
};

export const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const isValidAddress = (address: string): boolean => {
  return ethers.isAddress(address);
};

// Default export
export default BaseRewardsManager;
