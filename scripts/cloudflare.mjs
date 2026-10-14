import { spawnSync } from 'node:child_process';

// A missing API token must never fall back to Wrangler's saved OAuth account.
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env.deploy.production.');
  process.exit(1);
}

const result = spawnSync(
  'pnpm',
  ['exec', 'wrangler', ...process.argv.slice(2), '--config', 'wrangler.jsonc'],
  { stdio: 'inherit', env: process.env },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
