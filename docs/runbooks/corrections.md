# 訂正と表示保留の運用

報告の受付はGitHub Issuesが正本です。サイト内フォームの操作だけでは受付になりません。GitHubアカウントが必要です。現時点ではアカウント不要の受付窓口は提供していません。

## 報告への対応

1. Issue番号、対象ページ、報告された版・箇所を確認し、原典と照合します。出典が未記載でも受け付けます。公開の返信・連絡は担当者が行います。
2. `data/corrections/records.json` に記録します。`id` は `correction-<Issue番号>`、`page` は `/issues/<slug>/`、`issueUrl` は当該Issue、`status` は `received`（受付）または `investigating`（確認中）です。`reason` は公開可能な要約、`updatedAt` は実際の更新日時、未決の `resolution` と `revision` は空文字です。
3. 重大な疑義がある説明記事は `hold: true` にします。再ビルド・公開で本文の代わりに確認中の案内を表示し、記事一覧・検索・MCPから除外します。今の保留対象は説明記事単位です。数値データ・CSV/JSON自体の取り下げは別途必要です。
4. 訂正は原稿・原典・計算の必要な箇所に行い、変更した説明は再検証します。修正commitを確定させてから、記録を `corrected` にし、`revision` に完全なcommit SHA、`resolution` に変更点と理由を記載します。`hold` はfalseに戻します。
5. 訂正不要などで終了する場合は `closed` と理由を記録します。GitHubのIssueが閉じたことだけでは訂正済みとはしません。元の報告・版はIssueに残し、再調査の経緯も追記します。
6. `pnpm verify` と `pnpm test:e2e` を確認して公開します。サイトの台帳は静的な記録で、GitHubと自動同期しません。公開済み版の状態を確認してから完了と伝えます。

実在する報告のみ登録します。テスト用の報告を本番へ送信しません。応答期限・法的な確認の完了・専門家監修を、実施根拠なしに表示しません。

## 表示上の出典リンク

数字の横の資料アイコンから、横浜市の統計掲載ページへ移動します。CSVの直接ダウンロードは「データと出典」の明示的なリンクから選べます。行・列の情報はデータとして保持し、通常画面には表示しません。検証の詳しい説明は解説記事の「出典・確認状況」から開きます。

アイコンはGoogle Material Iconsの `description` を使用しています。配色対応のためSVGの塗りを `currentColor` に変更しています。Apache License 2.0の全文は [material-design-icons.txt](../licenses/material-design-icons.txt) に収録しています。原図: https://github.com/google/material-design-icons/blob/master/src/action/description/materialicons/24px.svg
