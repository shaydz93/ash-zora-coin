#!/usr/bin/env node
/**
 * Ash Zora creator-coin deployment script
 * Reads the EVM wallet seed from the age vault, derives the account,
 * and broadcasts the Zora Coins `create/content` calldata via viem.
 * If the wallet has no Base ETH, it prints the prepared transaction and exits.
 */

const { execSync } = require('child_process');
const { mnemonicToAccount } = require('viem/accounts');
const { createPublicClient, createWalletClient, http } = require('viem');
const { base } = require('viem/chains');

const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const ZORA_CREATE_API = 'https://api-sdk.zora.engineering/create/content';
const METADATA_URI = 'https://shaydz93.github.io/ash-zora-coin/coin-metadata.json';
const CREATOR = '0x0e73e40617b2e79Ba5Cd59a5a4c5a9235EaF590b';
const DRY_RUN = process.argv.includes('--dry-run');

function getVaultKey(namespace, key) {
  const cmd = `${require('os').homedir()}/.openclaw/bin/vault-age-cred get-key ${namespace} ${key}`;
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

async function buildCalldata() {
  const payload = {
    creator: CREATOR,
    name: 'ASH',
    symbol: 'ASH',
    metadata: { type: 'RAW_URI', uri: METADATA_URI },
    currency: 'ZORA',
    chainId: base.id,
    startingMarketCap: 'LOW',
    platformReferrer: '0x0000000000000000000000000000000000000000',
    payoutRecipientOverride: CREATOR,
  };
  const res = await fetch(ZORA_CREATE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zora API ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  const mnemonic = getVaultKey('ash-wallet-plain', 'mnemonic');
  const account = mnemonicToAccount(mnemonic);
  const derived = account.address;
  if (derived.toLowerCase() !== CREATOR.toLowerCase()) {
    throw new Error(`Vault mnemonic derives ${derived}, expected ${CREATOR}`);
  }

  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Deployer: ${account.address}`);
  console.log(`Balance:  ${balance} wei (${Number(balance) / 1e18} ETH)`);

  console.log('Building calldata via Zora SDK API...');
  const { calls, predictedCoinAddress } = await buildCalldata();
  console.log(`Predicted coin address: ${predictedCoinAddress}`);

  if (DRY_RUN || balance === 0n) {
    console.log('\nPrepared calls:');
    console.log(JSON.stringify(calls, null, 2));
    console.log(`\nDRY RUN — not broadcasting. Send ~0.0005 ETH Base to ${account.address} and rerun without --dry-run.`);
    process.exit(0);
  }

  const walletClient = createWalletClient({ chain: base, transport: http(RPC_URL), account });
  const txHashes = [];
  for (const call of calls) {
    const hash = await walletClient.sendTransaction({
      to: call.to,
      data: call.data,
      value: BigInt(call.value),
    });
    txHashes.push(hash);
    console.log(`Broadcasted tx: ${hash}`);
  }

  console.log(`\nCoin page (after indexing): https://zora.co/coin/base:${predictedCoinAddress}`);
  console.log(`Transaction hashes: ${txHashes.join(', ')}`);
}

main().catch(err => {
  console.error('Deployment failed:', err.message);
  process.exit(1);
});
