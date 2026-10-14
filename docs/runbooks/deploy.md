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
本番操作（deploy・D1）の認証はdotenvxで管理します。`CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` を暗号化した `.env.deploy.production` をコミットし、復号鍵 `.env.keys` は運営者の端末にだけ置きます（コミット禁止）。紛失時は `.env.deploy.production` の `DOTENV_PUBLIC_KEY_DEPLOY_PRODUCTION` 行と暗号化済みの行を削除してから、トークンを作り直し、`dotenvx set` で `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` を入れ直して新しい鍵対を作ります。古い公開鍵の行が残ったまま `dotenvx set` すると、誰も復号できない値になります。
APIトークンはCloudflareダッシュボードのAPI Tokensで作成します。権限はAccountのWorkers Scripts編集・D1編集・Account Settings読取、Zone（open.yokohama）のWorkers Routes編集を基本とし、不足はwranglerのエラーに従って追加します。値は端末で `read -rs CF_TOKEN` に入力し、`pnpm exec dotenvx set CLOUDFLARE_API_TOKEN "$CF_TOKEN" -f .env.deploy.production && unset CF_TOKEN` で暗号化します。チャット・コマンド履歴・ファイルに平文を残さないでください。
`pnpm run deploy`・`pnpm cf:d1:create`・`pnpm cf:versions`・`pnpm cf:rollback` は `dotenvx run` 経由で実行され、`.env.keys` の無い端末では失敗します。`CLOUDFLARE_API_TOKEN` を設定する前にこれらを実行しないでください。`pnpm cf` は2変数の存在を確認し、不足時はWranglerを実行せず停止します。dotenvxの `--strict` だけでは未定義変数を拒否できないためです。`wrangler login` のOAuthトークンは使いません（2026-09-10にD1 APIで401になりました）。
`wrangler.jsonc` のWorker名を自分のものへ変えれば、独立した複製を公開できます。

## 問い合わせ用のD1（初回のみ）

問い合わせフォームの受信は `apps/inquiries/src/index.ts` のWorkerがD1に保存します。初回だけ次を実行してください。

1. `pnpm cf d1 list` で同名DBの有無を確認し、未作成の場合のみ `pnpm cf:d1:create`。
2. 出力された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に記入し、commitします。
3. 表はWorkerが初回保存時に作るため、移行コマンドは不要です。

`database_id` が仮の値のままだと `wrangler deploy` は失敗します。ローカルの `pnpm preview` は仮の値でも動きます。

## 手順

1. `pnpm install --frozen-lockfile`
2. `pnpm verify`
3. `pnpm exec playwright install chromium` → `pnpm test:e2e`
4. `pnpm exec wrangler deploy --dry-run`
5. `SITE_URL=https://実際の公開ホスト pnpm run deploy`
6. `TEST_BASE_URL=https://実際の公開ホスト pnpm test:e2e`。保存を伴う2件は本番URLでは自動でskipします。
7. 問い合わせ経路の本番確認は、保存されないhoneypot送信で行います。`{"id":null}` が返れば、Origin・Content-Length・解析・検証まで本番Workerを通っています。テスト用の本文を保存させないでください。
   `curl -sS -H 'Accept: application/json' --data-urlencode 'website=check' --data-urlencode 'body=check' https://実際の公開ホスト/api/inquiries`
8. commit、Worker version、検証結果を `docs/STATUS.md` に記録します。

静的ページはStatic Assetsのまま配信し、Workerは `/api/*` だけで動きます（`run_worker_first`）。閲覧にWorker実行・DB読取は発生しません。問い合わせの保存にD1、送信の抑制にRate Limitingを使います。SSR、R2、LLM、ログインは不要です。
MCPは別Workerのため動的リクエストの無料枠が別途適用される（アカウント共有枠に注意）。
MCPを公開しなくてもWebの全機能は動作します。
Cloudflareアカウント全体で有料プランが既に適用されている場合、動的MCPの利用量は同プランで計上されます。

## 戻す

`pnpm cf:versions` で直前の版を確認し、`pnpm cf:rollback <VERSION_ID>`。`--` を挟むと版IDがwranglerに渡らず直前版へ戻るため付けないでください。
MCPの旧版を復元する場合も公開停止の設定を維持します。コードの復元は公開再開の許可にはなりません。
データはGitの公開JSON・不変原本・manifestから復元します。過去原本を削除しません。
