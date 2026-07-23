const { createCoin, createCoinCall, CreateConstants } = require('@zoralabs/coins-sdk');
const { createWalletClient, createPublicClient, http } = require('viem');
const { base } = require('viem/chains');
const { mnemonicToAccount } = require('viem/accounts');
const { execSync } = require('child_process');

const METADATA_URI = 'https://shaydz93.github.io/ash-zora-coin/coin-metadata.json';
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const VAULT_CMD = '~/.openclaw/bin/vault-age-cred get-key ash-wallet-plain mnemonic';

async function getMnemonic() {
  try {
    return execSync(VAULT_CMD, { encoding: 'utf8' }).trim();
  } catch (e) {
    throw new Error(`Failed to retrieve wallet seed from age vault: ${e.message}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

  console.log('Ash Zora Creator Coin Deployment');
  console.log('Creator:', '0x0e73e40617b2e79Ba5Cd59a5a4c5a9235EaF590b');
  console.log('Metadata URI:', METADATA_URI);

  // Prepare calldata (do not fetch private key yet)
  const call = await createCoinCall({
    creator: '0x0e73e40617b2e79Ba5Cd59a5a4c5a9235EaF590b',
    name: 'ASH',
    symbol: '$ASH',
    metadata: { type: 'RAW_URI', uri: METADATA_URI },
    currency: CreateConstants.ContentCoinCurrencies.ZORA,
    chainId: base.id,
    startingMarketCap: CreateConstants.StartingMarketCaps.LOW,
    skipMetadataValidation: true,
  });

  console.log('Predicted coin address:', call.predictedCoinAddress);
  console.log('Factory:', call.calls[0].to);
  console.log('Calldata:', call.calls[0].data.slice(0, 64) + '...');

  if (dryRun) {
    console.log('\nDry run complete. Fund the creator address with Base ETH, then run without --dry-run.');
    process.exit(0);
  }

  const mnemonic = await getMnemonic();
  const account = mnemonicToAccount(mnemonic);
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ chain: base, transport: http(RPC_URL), account });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Deployer address:', account.address);
  console.log('Deployer balance:', balance.toString(), 'wei');

  if (balance === 0n) {
    console.error('\nERROR: Deployer balance is zero. Send Base ETH to', account.address, 'to deploy.');
    process.exit(1);
  }

  const result = await createCoin({
    call: {
      creator: account.address,
      name: 'ASH',
      symbol: '$ASH',
      metadata: { type: 'RAW_URI', uri: METADATA_URI },
      currency: CreateConstants.ContentCoinCurrencies.ZORA,
      chainId: base.id,
      startingMarketCap: CreateConstants.StartingMarketCaps.LOW,
      skipMetadataValidation: true,
    },
    walletClient,
    publicClient,
  });

  console.log('\nDeployment successful!');
  console.log('Coin address:', result.coinAddress || call.predictedCoinAddress);
  console.log('Transaction hash:', result.hash);
}

main().catch((e) => {
  console.error('Deployment failed:', e.message);
  process.exit(1);
});
