# 地図書き出し用フォント

Noto Sans JPを450ウェイトで固定し、地図で用いる文字だけに縮小したフォントです。
PNG生成ではOSのフォントを読み込まず、このファイルと固定版resvgを使用します。
SVGの文字要素は閲覧環境のフォントでも表示されます。画素まで固定した共有にはPNGを使用してください。

- 原本：<https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf>
- 原本SHA-256：`c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f`
- ライセンス：同梱OFL.txt（SIL Open Font License 1.1）。Reserved Font NameはSourceで、派生物の名称に使っていません。
- 原本は `artifacts/ward-map-sources/NotoSansJP.ttf` に保存。通常ビルドでの再取得は不要です。
- 作成：fonttoolsの `varLib.instancer` で `wght=450` に固定し、`pyftsubset` の `--text-file=data/fonts/map-characters.txt` で縮小しました。
- 文字集合は書き出しSVGの全テキストから作成しました。追加時は文字集合・フォント・生成画像を同時に更新し、欠字を点検してください。
