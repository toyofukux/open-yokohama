# 撤去した統計3記事の検証履歴

対象：population / households / density。ユーザーが撤去対象として指定した3記事。
保存元：bluegill `373a18f3913066c02f66fbc07fff10519bded65a`。
当時の検証器と実装根拠のバイト列を保存する。公開ルートを再生成するためのコードではない。

- `data/editorial/{issues,evidence,implementation,review,reviewers,policy}.json` と `data/published/editorial.json` は当時の33主張・署名を維持する。
- `scripts/factcheck-archive.ts` は当時のレビュー時点で署名を検査する。期限を現行記事の公開承認として延長しない。
- 署名の解釈に使う現行engine/schemaも保存済み実装ハッシュと一致させる。
- 通常ビルドでは履歴の署名・実装バイトを検査し、現行7記事は別のpublication契約で検査する。
- `pnpm factcheck:archive-originals` は固定HTML/CSVと抽出本文も照合する。固定HTMLは再配布せずローカルキャッシュで保管する。
- 公式HTMLが更新された場合、旧ハッシュを新しいHTMLで置き換えない。保管済み原本がなければ原本監査は未実施として扱う。

mainに残っていた未commitの旧記事改善は別途退避する。この33主張の保存版へ無断で混ぜない。
