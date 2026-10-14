# Open Yokohama

横浜の暮らしを、身近な数字から。Open Yokohamaは、18区の人口と世帯の変化を、公式統計と原典付きで調べられる市民向けの公共情報基盤です。
Cloudflareの静的配信を中心に、閲覧時のDB・AI実行をなくして運用費を抑えます。

このプロジェクトは、横浜市域の数字・ファクト・出典・改定履歴を蓄積するDWHの整備も目的とします。
open.yokohamaの記事・図表・調査が同じデータを参照する構成を目指します。
人口分野の6系列・44,638値を共通DWHに収録し、市と18区の19記事で入力値・計算・参照版を保存しています。
[実装内容と具体例](docs/DWH-IMPLEMENTATION.md) · [長期の人口と暮らし](https://open.yokohama/population-history/)
[現状監査](docs/DWH-AUDIT.md) · [DWHと記事参照の目標設計](docs/DWH-DESIGN.md)

「既存3系列」の中身と、今のデータ・記事・訂正がどう変わるかは[具体例による全体説明](docs/DWH-EXAMPLES.md)にまとめました。

[公開サイト](https://open.yokohama)

MCPは2026-09-07に外部公開を停止しました。APIキーやクラウド認証があっても再公開しません。内部利用はローカル接続・読取専用・回数と出力量の制限付きです。

現在は**公開β版**です。2024年1月〜2026年8月の32か月について、横浜市と18区の9指標・5,472観測値を収録しています。
人口・世帯・密度の3つの問い、18区ページ、比較・検索、CSV/JSONをご利用いただけます。
この版では、人口増減の内訳10指標・8,130値と、年齢構成5指標・2,470値も収録しています。市と18区の年別データは2000〜2025年、市の月別人口動態は2000年1月〜2026年7月です。
予算・政策の効果・国内都市比較は未提供です。市民利用テストも未実施です。実環境への反映記録は[STATUS](docs/STATUS.md)を参照してください。

[構想](docs/VISION.md) · [開発計画](docs/PLAN.md) · [実装・検証・公開状態](docs/STATUS.md) · [設計判断](docs/adr/0001-static-public-data-core.md)

## 動かす

2026-09-07時点、新規環境のWebビルドは、既存3記事の原典HTML更新による保存版との不一致で停止します。保存済み原典のある環境での検証・公開は完了しています。DWHの検査・照会は同梱原典だけで実行できます。詳細は[検証状態](docs/STATUS.md)を参照してください。

Node.js 24 と pnpm 10.32.1 を使用します。アプリのローカル起動・ビルドに外部アカウントやAIキーは不要です。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`http://127.0.0.1:4321` を開いてください。

```sh
pnpm verify                         # lint・型・データ/検証ゲートのテスト・原本照合・静的ビルド
pnpm exec playwright install chromium
pnpm test:e2e                       # PC/スマホ・アクセシビリティ・出典導線
pnpm preview                        # Cloudflareのローカル配信 :8788
pnpm mcp:dev                        # ローカル限定のデータMCP :8789/mcp
pnpm test:mcp                       # 別ターミナルから実MCP接続を検証
pnpm data:refresh                   # 人口残高CSVを取得・検査。過去値変更では停止
pnpm data:refresh:dynamics          # 出生・死亡・転出入のCSVを取得・検査
pnpm data:refresh:ages              # 各年1月1日の年齢別CSVを取得・集計
pnpm test:dynamics-gates            # 原本改変・年全体の削除が公開検査で止まるか確認
```

## 構造

```text
apps/web/         Astro静的サイト（公開済みデータのみ）
apps/inquiries/   問い合わせ受信Worker。/api/* だけ動き、D1に保存
apps/mcp/         MCP Streamable HTTP。公開データ読取専用の別Worker
packages/core/    指標・地理・データ契約・問い合わせ
packages/factcheck/ 主張・引用・署名・公開条件
packages/ingestion/ 厳格なCSVパーサー
scripts/          取得・原本照合・MCP実接続検査
data/raw/         不変の原本CSV・注記Excel（ハッシュ名）
data/manifests/   取得記録の版
data/published/   検証済み公開データ
```

数値はLLMを通さず原本から抽出します。市と18区の合計・男女計・時点・単位・欠測・重複を検査し、失敗で公開ビルドを止めます。
出典URLだけで主張が正しいとは判定しません。3つの論点記事は、主張抽出・一次資料との照合・別セッションの反証確認を通し、本文・根拠・署名が一致する公開版をWebとMCPで共有します。AI検証は人間の内容承認とは区別します。使い方と範囲は[文章の根拠検証](docs/FACT-CHECK.md)を参照してください。

## 公開と運用

[Cloudflare公開手順](docs/runbooks/deploy.md) · [独自ドメイン設定](docs/runbooks/domain.md) · [データ更新](docs/runbooks/data.md) · [MCP](docs/runbooks/mcp.md)

公開WebはCloudflare Static Assetsで配信し、問い合わせフォームの受信だけWorkerとD1を使います。閲覧ごとのAI料金・DB読取は発生しません。
誤り・質問・要望は各ページのフッターからアカウントなしで送れます。個別の返信はせず、対応した内容を[問い合わせと訂正](https://open.yokohama/corrections/)に記録します。運用は[問い合わせと訂正の運用](docs/runbooks/corrections.md)を参照してください。
MCPには動的Workerの料金・制限が別に適用されます。ドメイン・CI・将来のAIバッチ費用も別途必要です。
料金は[Cloudflare公式](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)を確認してください。

週次Actionsが公式CSVの更新を検査し、更新候補・形式変更・取得失敗を可視化します。候補を自動で本番公開しません。
コード変更のCIは認証なしで再現します。デプロイは運営者のCloudflare認証で実行してください。

## 参加・権利

[参加方法](CONTRIBUTING.md) · [セキュリティ](SECURITY.md) · [MIT（コード）](LICENSE) · [CC BY 4.0（市由来データ）](data/LICENSE.md)

深津貴之さんの[japan-todo](https://github.com/fladdict/japan-todo)の出典付き課題整理から着想を得ました。
非公開の研究プロジェクトからは段階的検証の設計上の知見のみを参照し、コード・業務資料・認証情報を転載していません。
横浜市や同プロジェクトによる公式提供・承認を示すものではありません。
