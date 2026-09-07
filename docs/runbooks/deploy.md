# Cloudflareへ公開する

2026-09-07: 以下の公開手順は静的Webを対象にします。MCPは外部公開停止中です。
APIキー・既存認証があってもMCPを再公開せず、ユーザーからの明示的な再開指示があるまでローカル利用に限定します。

## 公開元を一つにする

本番Webは統合済みの `main` から公開します。作業ブランチごとに同じWorkerへ直接公開しません。
2026-09-07、別ブランチからの全体デプロイで7政策記事が404になりました。記事の削除とブランチの上書きを区別してください。
公開前に本番のWorker版とSTATUSを照合し、他セッションの公開処理がないことを確認します。
`pnpm build` の公開契約は、7政策記事・18区地図・19長期記事・44,638件以上のデータ・旧3記事の転送・MCP停止設定を検査します。
`/release-manifest.json` に検査した経路とDWH版を出力します。低水準のCLI直接実行を技術的に禁止するものではありません。
旧3記事の署名は履歴です。通常ビルドでは履歴の改変と現行原稿の版を別々に検査します。
原本を含む履歴の再監査は `pnpm factcheck:archive-originals`。固定HTMLはGit対象外で、公式サイトの更新後は手元の一致する原本が必要です。

## 必要条件

Node.js 24、pnpm、Cloudflareアカウント。ローカル検証や静的ビルドに外部認証は不要です。
`pnpm exec wrangler login` は各運営者が自分のアカウントで実行してください。
`wrangler.jsonc` のWorker名を自分のものへ変えれば、独立した複製を公開できます。

## 手順

1. `pnpm install --frozen-lockfile`
2. `pnpm verify`
3. `pnpm exec playwright install chromium` → `pnpm test:e2e`
4. `pnpm exec wrangler deploy --dry-run`
5. `SITE_URL=https://実際の公開ホスト pnpm run deploy`
6. `TEST_BASE_URL=https://実際の公開ホスト pnpm test:e2e`
7. commit、Worker version、検証結果を `docs/STATUS.md` に記録します。

WebはStatic Assets専用。常時DB、WorkerでのSSR、R2、LLM、ログインは不要です。
MCPは別Workerのため動的リクエストの無料枠が別途適用される（アカウント共有枠に注意）。
MCPを公開しなくてもWebの全機能は動作します。
Cloudflareアカウント全体で有料プランが既に適用されている場合、動的MCPの利用量は同プランで計上されます。

## 戻す

`pnpm exec wrangler versions list` で直前の版を確認し、`pnpm exec wrangler rollback <VERSION_ID>`。
MCPの旧版を復元する場合も公開停止の設定を維持します。コードの復元は公開再開の許可にはなりません。
データはGitの公開JSON・不変原本・manifestから復元します。過去原本を削除しません。
