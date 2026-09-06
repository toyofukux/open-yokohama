# Cloudflareへ公開する

## 必要条件

Node.js 24、pnpm、Cloudflareアカウント。ローカル検証や静的ビルドに外部認証は不要です。
`pnpm exec wrangler login` は各運営者が自分のアカウントで実行してください。
`wrangler.jsonc` のWorker名を自分のものへ変えれば、独立した複製を公開できます。

## 手順

1. `pnpm install --frozen-lockfile`
2. `pnpm verify`
3. `pnpm exec playwright install chromium` → `pnpm test:e2e`
4. `pnpm exec wrangler deploy --dry-run`
5. `SITE_URL=https://実際の公開ホスト pnpm run deploy`（`run`を付け、pnpm自体の同名コマンドと区別します）
6. 必要なら `pnpm exec wrangler deploy --config apps/mcp/wrangler.jsonc`
7. `TEST_BASE_URL=https://実際の公開ホスト pnpm test:e2e`
8. commit、Worker version、検証結果を `docs/STATUS.md` に記録します。

WebはStatic Assets専用。常時DB、WorkerでのSSR、R2、LLM、ログインは不要です。
MCPは別Workerのため動的リクエストの無料枠が別途適用される（アカウント共有枠に注意）。
MCPを公開しなくてもWebの全機能は動作します。
Cloudflareアカウント全体で有料プランが既に適用されている場合、動的MCPの利用量は同プランで計上されます。

## 戻す

`pnpm exec wrangler versions list` で直前の版を確認し、`pnpm exec wrangler rollback <VERSION_ID>`。
MCPは同じコマンドに `--config apps/mcp/wrangler.jsonc` を指定します。
データはGitの公開JSON・不変原本・manifestから復元します。過去原本を削除しません。
