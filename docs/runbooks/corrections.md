# 問い合わせと訂正の運用

受付はサイト内のフォーム `/corrections/report/` です。送信内容はCloudflare WorkerがD1データベース `open-yokohama-inquiries` の `inquiries` 表に保存します。GitHubアカウントは不要で、個別の返信はしません。対応した内容だけを `/corrections/` の台帳に公開します。
コードや記事づくりへの参加は、フッターのGitHubアイコンからGitHubで受け付けます。市民の問い合わせをGitHub Issueへ誘導しません。

## 受付の仕組み

- 入口は、全ページのフッター「このページについて知らせる」、政策記事末尾の「数字や説明について知らせる」、市長選ページの案内です。フッターと記事末尾はページURLと表示していた版を付けてフォームへ直行します。市長選ページはページURLだけを付けます。`/corrections/` と `/about/` からはパラメータなしで開きます。
- 保存項目は `id`（受付番号）、`created_at`、`kind`（error／question／request）、`page`、`version`、`target`、`body`、`status`（new／read／handled）、`note` です。IPアドレス、連絡先、User-Agentは保存しません。
- 防御は3段です。hidden欄 `website` に入力があれば保存せずに成功応答を返します。保存に至った送信が同一アドレスから1分に10件を超えると429を返します。`Origin` がサイトと異なるPOSTは403です。本文は2,000字（改行はLFに正規化して数えます）、要求全体は64KBまでで、`Content-Length` の無い送信は411で拒否します。本番ホストでRate Limitingの束縛が無い場合は保存せず503を返します。
- JavaScriptが無効でも通常のPOSTで送れ、`/corrections/report/done/` へ303で移動します。
- E2Eのうち保存を伴う2件はローカル配信でだけ実行し、本番URL指定時は自動でskipします。ローカルでも1分内に3回以上E2Eを回すと、レート制限の模擬により429で失敗することがあります。
- 表 `inquiries` はWorkerが初回保存時に `CREATE TABLE IF NOT EXISTS` で作ります。移行ファイルはありません。

## 見る

- Cloudflareダッシュボードの Storage & Databases → D1 → `open-yokohama-inquiries` → Console でSQLを実行します。
- コマンドでは `pnpm inquiries:list`（直近50件）を使います。ローカル配信で保存した分は `pnpm inquiries:list:local` です。
- 状態の更新は次の形です。`pnpm exec wrangler d1 execute open-yokohama-inquiries --remote --command "UPDATE inquiries SET status='handled', note='台帳 correction-12' WHERE id=12"`
- 週1回まとめて確認します。応答期限は、実際に対応できる体制を確かめるまで表示しません。

## 報告への対応

1. 受付番号、対象ページ、報告された版・箇所を確認し、原典と照合します。出典が未記載でも受け付けます。返信はせず、結果は台帳で公開します。
2. `data/corrections/records.json` に記録します。`id` は `correction-<受付番号>`、`inquiryId` は受付番号、`page` は `/issues/<slug>/`、`status` は `received`（受付）または `investigating`（確認中）です。`reason` は公開可能な要約、`updatedAt` は実際の更新日時、未決の `resolution` と `revision` は空文字です。報告の本文をそのまま転記しません。
3. 重大な疑義がある説明記事は `hold: true` にします。再ビルド・公開で本文の代わりに確認中の案内を表示し、記事一覧・検索・MCPから除外します。今の保留対象は説明記事単位です。数値データ・CSV/JSON自体の取り下げは別途必要です。
4. 訂正は原稿・原典・計算の必要な箇所に行い、変更した説明は再検証します。修正commitを確定させてから、記録を `corrected` にし、`revision` に完全なcommit SHA、`resolution` に変更点と理由を記載します。`hold` はfalseに戻します。
5. 訂正不要などで終了する場合は `closed` と理由を記録します。D1の `status` も `handled` にし、`note` に台帳のIDを書きます。
6. `pnpm verify` と `pnpm test:e2e` を確認して公開します。サイトの台帳は静的な記録で、D1と自動同期しません。公開済み版の状態を確認してから完了と伝えます。

実在する報告のみ登録します。テスト用の報告を本番へ送信しません。応答期限・法的な確認の完了・専門家監修を、実施根拠なしに表示しません。

## 表示上の出典リンク

数字の横の資料アイコンから、横浜市の統計掲載ページへ移動します。CSVの直接ダウンロードは「データと出典」の明示的なリンクから選べます。行・列の情報はデータとして保持し、通常画面には表示しません。検証の詳しい説明は解説記事の「出典・確認状況」から開きます。

アイコンはGoogle Material Iconsの `description` を使用しています。配色対応のためSVGの塗りを `currentColor` に変更しています。Apache License 2.0の全文は [material-design-icons.txt](../licenses/material-design-icons.txt) に収録しています。原図: https://github.com/google/material-design-icons/blob/master/src/action/description/materialicons/24px.svg

フッターのGitHubアイコンはGitHubのロゴ（Octicons `mark-github`）です。GitHub上のリポジトリへ案内する用途に限り、[GitHubのロゴ利用指針](https://github.com/logos)に従って使用しています。
