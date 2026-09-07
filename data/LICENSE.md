# データの利用条件

`raw/` のCSVは横浜市「男女別人口及び世帯数－行政区」のオープンデータ。
提供者: 横浜市。ライセンス: Creative Commons Attribution 4.0 International（CC BY 4.0）。
出典: https://www.city.yokohama.lg.jp/city-info/yokohamashi/tokei-chosa/portal/opendata/suikei01.html
ライセンス: https://creativecommons.org/licenses/by/4.0/

`published/population.json` は上記CSVを構造化・検証して加工したものです。数値・地域・時点と原典の行列を対応付けました。
原本の値を推測で補完していません。横浜市がこの製品を承認したことを示しません。
`manifests/` は各原本の取得日時・URL・SHA-256を記録します。

再利用時は横浜市の出典・ライセンスと加工の事実を明示してください。
リポジトリ全体のMITライセンスは第三者データのライセンスを置き換えません。

## 文章検証の資料

`editorial/evidence.json` は横浜市の統計値・表・定義の確認に用いる抜粋と、各資料のURL・取得日・ハッシュを保持します。原稿、検証結果、内部実装コードと第三者の引用を区別します。各引用の出典は台帳の対応するURLと提供者を参照してください。

公式ページ全体のHTMLは `editorial/raw/` のローカルキャッシュであり、Git管理・静的サイト配信の対象にしません。新しいクローンでは検証用に取得します。横浜市の文章・ページ全体をMITライセンスとして扱いません。[横浜市サイトポリシー](https://www.city.yokohama.lg.jp/aboutweb/sitepolicy.html)と、各オープンデータの個別条件を参照してください。

## 人口動態の原本

人口動態の3つのCSVと注記確認用Excelは、横浜市統計書 第2章 表8のオープンデータです。
掲載ページ: https://www.city.yokohama.lg.jp/city-info/yokohamashi/tokei-chosa/portal/tokeisho/02.html
同ページの「オープンデータの利用について」でCC BY 4.0を確認しています（2026-09-06）。
`published/dynamics.json` は2000年以降の男女計・10指標を抽出し、地域・暦年/暦月・出典行・列と対応付けた加工物です。
注記原本の取得記録は `references/dynamics-notes.json` にあります。

## 年齢構成の原本

年齢別CSVは同じ横浜市統計書 第2章の表5、CC BY 4.0です。
`published/ages.json` は各年1月1日の各歳別人口を0〜14歳、15〜64歳、65歳以上へ集計し、年齢不詳と総数を別に保持します。
推計人口の基準日は [年齢別人口の説明](https://www.city.yokohama.lg.jp/city-info/yokohamashi/tokei-chosa/portal/jinko/nenrei/) を参照しています。
