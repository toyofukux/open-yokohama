import type { Story } from "../../../packages/core/region-story";
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
export function storyHtml(story: Story, kind: "movement" | "ages") {
  return `<section class="region-story"><p class="story-kicker">地域の変化を読む</p><h2>${escape(story.title)}</h2>${story.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("")}<h3>この変化を、暮らしの議論につなげる</h3>${story.discussion.map((p) => `<p>${escape(p)}</p>`).join("")}<p class="story-evidence">数値の根拠：<a href="/data/${kind === "movement" ? "dynamics" : "ages"}.json">出典行付きデータ</a>${kind === "movement" ? '・<a href="/data/ages.json">年初の人口</a>' : ""}。本文は複数年のデータを読み合わせています。グラフの対象期間・指標と、表の正確な人数も参照できます。</p><details><summary>読み解きの前提と計算方法</summary><p>${escape(story.method)}</p><p>暮らしに関する段落は議論の問いと確認先を示しています。特定の政策の効果や、施設不足を確認した結果ではありません。</p></details></section>`;
}
