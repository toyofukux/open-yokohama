# MCP利用手順

## 公開状態と方針（2026-09-07更新）

ユーザーの費用抑制の指示により、MCPの外部公開を停止しました。APIキーやCloudflare認証が存在しても再公開しません。
公開再開は今回のDWH計画に含めず、ユーザーが対象・費用条件を明示して再開を指示するまで保留します。

以前は `open-yokohama-mcp.toyofukux.workers.dev` で公開されていました。今回、Cloudflareの `enabled` と `previews_enabled` をともにfalseへ変更しました。
追加route・custom domainはありませんでした。変更後に管理APIでfalse、旧 `/health`・`/mcp` で404を確認しました。
設定ファイルも `workers_dev: false`、`preview_urls: false`、`routes: []` に固定し、単体テストで再有効化を検出します。

このMCPは保存済みデータを返し、サーバー内でAIモデルを呼びません。そのためAIのAPIキーなしでも稼働していました。
Cloudflareのデプロイ認証はAIのAPIキーと別で、この端末には既存のOAuth認証がありました。認証情報そのものは記録しません。
外部MCPの動的リクエストに伴う費用と、AIモデルの利用料は別です。MCPの停止はアカウント全体の料金停止を意味しません。

停止設定の根拠: [workers.devの無効化](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/#disabling-workersdev)、[プレビューURLの無効化](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#toggle-preview-urls-enable-or-disable)。

## ローカルでの利用

起動: `pnpm mcp:dev`。ローカル接続先: `http://127.0.0.1:8789/mcp`。`--local --ip 127.0.0.1` で起動します。
以下は実装済みのローカル機能の説明です。公開MCPへの接続案内ではありません。

Streamable HTTP、セッションなし、公開データ読み取りのみです。
MCPのバージョン交渉は公式TypeScript SDKに委ねています。初期構想にある日付を実装済みの仕様としてハードコードしません。

ツール: `search`, `get_metric`, `get_metric_series`, `compare_geographies`, `get_source`。
リソース: `yokohama://city`, `yokohama://wards/kohoku` 等。

例: `get_metric({"geography":"141097","metric":"population"})`。
`compare_geographies({"metric":"population","period":"2026-08-01"})`。
自治体コード・指標は `yokohama://city` で取得できます。

返答の観測値には単位の定義、時点、原典ID、行、列を付けます。原典URL・取得日時はsourcesで解決します。
引用付きの統計取得ができても、AIによる任意の因果分析が検証済みになるわけではありません。

ブラウザOriginは同一originのみ許可。通常のMCPクライアントはOriginなしで接続できます。
入力は8KBまで。外部URLの取得、書き込み、サーバー側LLM呼び出しを持ちません。

## 論点記事の根拠検証

`yokohama://issues/population`、`yokohama://issues/households`、`yokohama://issues/density` は、Webと同じ公開文章・packetHash・確認状態・主張・検証/反証結果・出典を返します。AIによる確認を人間承認と読み替えません。

Wranglerのカスタムビルドが `pnpm data:validate && pnpm factcheck:check` を呼び、未検証の編集・署名不一致・期限切れを拒否します。公開済み版の期限は次の公開ビルドで検査し、Workerの起動時刻で数値API全体を止めません。詳しくは[文章の根拠検証](../FACT-CHECK.md)を参照してください。

## 人口増減の内訳（今回の追加）

既存5ツールに10指標を追加しました。実環境への反映状態は [STATUS](../STATUS.md) を参照してください。

- `get_metric({"geography":"141003","metric":"total_change"})`：最新の暦年。人口残高の `population_change` とは別IDです。
- `get_metric_series({"geography":"141003","metric":"births","frequency":"month"})`：市の月別出生数。
- `compare_geographies({"metric":"social_change","period":"2025"})`：2025年1月〜12月の18区比較。
- `get_source({"id":"取得したsourceId"})`：原典CSV・取得日・版・掲載ページ。

人口動態の `get_metric` は `observations`（最新1件）・`definitions`・`sources`・`unit`・`periodBasis` を返します。
人口残高の既存レスポンス形式は維持します。動態の期間は年 `YYYY` または月 `YYYY-MM`、人口残高の時点は `YYYY-MM-DD` です。
動態の省略時の頻度は年です。区別の月次内訳や存在しない期間は `unavailable: true` と空配列で返し、0人を生成しません。
増減を政策効果とみなすレスポンスは作りません。

## 年齢構成（今回の追加）

- `get_metric({"geography":"141003","metric":"age_unknown"})`：最新の1月1日の年齢不詳人口。
- `get_metric_series({"geography":"141097","metric":"age_65plus"})`：港北区の年別推移。
- `compare_geographies({"metric":"age_under15","period":"2025-01-01"})`：同じ1月1日の18区比較。

年齢指標は `age_total`、`age_under15`、`age_15to64`、`age_65plus`、`age_unknown` の5つです。
`frequency: "month"` は未提供を返します。時点は `YYYY-01-01`、暦年の動態 `YYYY` とは異なります。
集計の根拠は `rows`（複数行）に保持します。割合の分母の説明も返します。3区分の人数を返すもので、就業者数や政策効果は推定しません。

## 内部利用の制限とDWH（2026-09-07追加）

`pnpm mcp:dev` はローカル用の明示enableを渡し、127.0.0.1だけで受け付けます。毎分60回・同時4件・入力8 KB・出力1 MiB・query最大500値。任意SQL・URL取得・書込み・AI呼出しはありません。

新ツールは `warehouse_catalog`、`warehouse_query`、`warehouse_article`。計8ツールです。`warehouse_query` はdataset/geography/metricとfrom/to、limit/offsetで絞ります。releaseIdを省略すると現在の保存版、異なる版を指定すると未提供です。過去版はCLIまたは静的JSONを使用します。

例: `warehouse_query({"dataset":"historical","geography":"141003","metric":"population","from":"1995","to":"2024"})`。記事は `warehouse_article({"id":"population-history/yokohama"})`。

WebとMCPのビルドは `pnpm dwh:check` で正本・互換出力・記事参照を検査します。[DWH利用手順](../DWH-IMPLEMENTATION.md)も参照してください。クラウドでの公開再開は今回の対象ではありません。
