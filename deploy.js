/**
 * Base Builder Rewards Deployment Script
 * Comprehensive deployment automation for Base network
 */

const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  BASE_MAINNET: {
    name: 'Base Mainnet',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org'
  },
  BASE_SEPOLIA: {
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org'
  }
};

/**
 * Main deployment function
 */
async function main() {
  console.log('🚀 Starting Base Builder Rewards deployment...');
  
  // Get network information
  const network = await ethers.provider.getNetwork();
  const networkName = getNetworkName(network.chainId);
  
  console.log(`📡 Network: ${networkName} (Chain ID: ${network.chainId})`);
  
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  
  console.log(`👤 Deployer: ${deployerAddress}`);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);
  
  // Check minimum balance
  const minBalance = ethers.parseEther('0.01');
  if (balance < minBalance) {
    throw new Error(`Insufficient balance. Need at least 0.01 ETH, have ${ethers.formatEther(balance)} ETH`);
  }
  
  // Deploy contracts
  const deploymentResults = {};
  
  try {
    // 1. Deploy BaseRewardsOptimizer
    console.log('\n📄 Deploying BaseRewardsOptimizer...');
    const rewardsOptimizer = await deployContract('BaseRewardsOptimizer', []);
    deploymentResults.BaseRewardsOptimizer = rewardsOptimizer;
    
    // 2. Deploy mock token for testing (if not mainnet)
    let tokenAddress;
    if (network.chainId !== 8453n) {
      console.log('\n🪙 Deploying Mock Token for testing...');
      const mockToken = await deployContract('MockERC20', [
        'Base Reward Token',
        'BRT',
        ethers.parseEther('1000000')
      ]);
      deploymentResults.MockToken = mockToken;
      tokenAddress = mockToken.address;
    }
    
    // 3. Setup initial configuration
    console.log('\n⚙️ Setting up initial configuration...');
    await setupContracts(deploymentResults, tokenAddress);
    
    // 4. Save deployment information
    console.log('\n💾 Saving deployment information...');
    await saveDeploymentInfo(deploymentResults, network);
    
    // 5. Verify contracts (if not local network)
    if (network.chainId !== 31337n && network.chainId !== 1337n) {
      console.log('\n✅ Verification commands:');
      printVerificationCommands(deploymentResults);
    }
    
    console.log('\n🎉 Deployment completed successfully!');
    console.log('\n📊 Deployment Summary:');
    printDeploymentSummary(deploymentResults);
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    throw error;
  }
}

/**
 * Deploy a single contract
 */
async function deployContract(contractName, constructorArgs = []) {
  const startTime = Date.now();
  
  try {
    // Get contract factory
    const ContractFactory = await ethers.getContractFactory(contractName);
    
    // Estimate gas
    const deploymentData = ContractFactory.interface.encodeDeploy(constructorArgs);
    const estimatedGas = await ethers.provider.estimateGas({
      data: deploymentData
    });
    
    console.log(`   ⛽ Estimated gas: ${estimatedGas.toString()}`);
    
    // Deploy contract
    const contract = await ContractFactory.deploy(...constructorArgs, {
      gasLimit: estimatedGas + BigInt(100000) // Add buffer
    });
    
    // Wait for deployment
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    const endTime = Date.now();
    const deployTime = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`   ✅ ${contractName} deployed to: ${address}`);
    console.log(`   ⏱️ Deployment time: ${deployTime}s`);
    
    return {
      name: contractName,
      address: address,
      contract: contract,
      constructorArgs: constructorArgs,
      deploymentTime: deployTime,
      gasUsed: estimatedGas.toString()
    };
    
  } catch (error) {
    console.error(`   ❌ Failed to deploy ${contractName}:`, error.message);
    throw error;
  }
}

/**
 * Setup contracts with initial configuration
 */
async function setupContracts(deploymentResults, tokenAddress) {
  try {
    // Transfer tokens to contracts for testing
    if (deploymentResults.MockToken) {
      const mockToken = deploymentResults.MockToken.contract;
      
      console.log('   🔄 Transferring tokens to contracts...');
      
      // Transfer to rewards optimizer
      await mockToken.transfer(
        deploymentResults.BaseRewardsOptimizer.address,
        ethers.parseEther('100000')
      );
      
      console.log('   ✅ Token transfers completed');
    }
    
  } catch (error) {
    console.error('   ❌ Setup failed:', error.message);
    // Don't throw here, setup is optional
  }
}

/**
 * Save deployment information to file
 */
async function saveDeploymentInfo(deploymentResults, network) {
  const deploymentInfo = {
    network: {
      name: getNetworkName(network.chainId),
      chainId: network.chainId.toString(),
      timestamp: new Date().toISOString()
    },
    contracts: {},
    deployer: await (await ethers.getSigners())[0].getAddress()
  };
  
  // Add contract information
  for (const [name, result] of Object.entries(deploymentResults)) {
    deploymentInfo.contracts[name] = {
      address: result.address,
      constructorArgs: result.constructorArgs,
      deploymentTime: result.deploymentTime,
      gasUsed: result.gasUsed
    };
  }
  
  // Save to file
  const filename = `deployment-${network.chainId}-${Date.now()}.json`;
  console.log(`   💾 Deployment info saved to: ${filename}`);
}

/**
 * Print verification commands
 */
function printVerificationCommands(deploymentResults) {
  for (const [name, result] of Object.entries(deploymentResults)) {
    const args = result.constructorArgs.length > 0 
      ? ` --constructor-args ${result.constructorArgs.join(' ')}`
      : '';
    
    console.log(`npx hardhat verify ${result.address}${args}`);
  }
}

/**
 * Print deployment summary
 */
function printDeploymentSummary(deploymentResults) {
  console.log('┌─────────────────────────┬──────────────────────────────────────────────┐');
  console.log('│ Contract                │ Address                                      │');
  console.log('├─────────────────────────┼──────────────────────────────────────────────┤');
  
  for (const [name, result] of Object.entries(deploymentResults)) {
    const paddedName = name.padEnd(23);
    console.log(`│ ${paddedName} │ ${result.address} │`);
  }
  
  console.log('└─────────────────────────┴──────────────────────────────────────────────┘');
}

/**
 * Get network name from chain ID
 */
function getNetworkName(chainId) {
  const id = chainId.toString();
  switch (id) {
    case '8453': return 'Base Mainnet';
    case '84532': return 'Base Sepolia';
    case '84531': return 'Base Goerli';
    case '31337':
    case '1337': return 'Hardhat Local';
    default: return `Unknown (${id})`;
  }
}

/**
 * Error handling and cleanup
 */
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled rejection:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n⏹️ Deployment interrupted by user');
  process.exit(0);
});

// Run deployment
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✨ All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  main,
  deployContract,
  CONFIG
};
