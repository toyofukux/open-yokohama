import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { type AgeYear, ageStory, type FlowYear, flowStory } from '../packages/core/region-story.ts';

const dynamics = JSON.parse(fs.readFileSync('data/published/dynamics.json', 'utf8'));
const ages = JSON.parse(fs.readFileSync('data/published/ages.json', 'utf8'));
type Observation = {
  geography: string;
  frequency: string;
  period: string;
  metric: string;
  value: number;
};
type AgeRecord = {
  geography: string;
  period: string;
  values: { age_total: number; age_under15: number; age_65plus: number; age_unknown: number };
};
const observations: Observation[] = dynamics.observations;
const records: AgeRecord[] = ages.records;
function flow(code: string): FlowYear[] {
  const obs = observations.filter((o) => o.geography === code && o.frequency === 'year');
  return [...new Set(obs.map((o) => o.period))].sort().map((year) => {
    const get = (id: string) => obs.find((o) => o.period === year && o.metric === id)?.value;
    return {
      year: +year,
      total: get('total_change') as number,
      natural: get('natural_change') as number,
      social: get('social_change') as number,
      population: records.find((r) => r.geography === code && r.period === `${year}-01-01`)?.values
        .age_total,
    };
  });
}
function age(code: string): AgeYear[] {
  return records
    .filter((r) => r.geography === code)
    .map((r) => ({
      year: +r.period.slice(0, 4),
      total: r.values.age_total,
      child: r.values.age_under15,
      older: r.values.age_65plus,
      unknown: r.values.age_unknown,
    }));
}
test('city story puts small annual gain against scale and multi-year reversal', () => {
  const story = flowStory('横浜市', flow('141003'), { up: 7, down: 11, zero: 0 });
  const text = story.paragraphs.join('');
  assert.match(story.title, /増減の境目/);
  assert.match(text, /0.01%未満/);
  assert.match(text, /2001〜2005年には年平均約3万人の増加/);
  assert.match(text, /2021〜2025年は年平均約1,300人の減少/);
  assert.match(text, /直近一年の増加と、この5年間の流れは同じではありません/);
  assert.match(text, /2016年から2025年まで/);
  assert.match(text, /7区が増加し、11区が減少/);
  assert.match(story.discussion.join(''), /空き状況、到達時間、維持費/);
});
test('turning point is a sustained run, not first-ever decline', () => {
  const west = flowStory('西区', flow('141038')).paragraphs.join('');
  assert.match(west, /2017年から2025年まで/);
  assert.doesNotMatch(west, /初めて/);
  const central = flowStory('中区', flow('141046')).paragraphs.join('');
  assert.doesNotMatch(central, /2000年から2025年まで.*自然減が続/);
});
test('age story distinguishes population scale, age composition and unknown classification', () => {
  const text = ageStory('横浜市', age('141003')).paragraphs.join('');
  assert.match(text, /総人口は約1.1倍、65歳以上は約2.1倍、0〜14歳は約0.9倍/);
  assert.match(text, /2015〜2020年の約7.1万人の増加/);
  assert.match(text, /2020〜2025年の約1.2万人の増加/);
  assert.match(text, /年齢不詳も約7.6万人/);
  assert.match(text, /高齢化が落ち着いたとは言えません/);
});
test('all published regions and historical flow cutoffs produce finite bounded stories', () => {
  for (const code of new Set(records.map((r) => r.geography))) {
    const years = flow(code);
    for (let i = 1; i <= years.length; i++) {
      const story = flowStory(code, years.slice(0, i));
      assert.doesNotMatch(JSON.stringify(story), /NaN|undefined|Infinity/);
      assert.ok(story.paragraphs.length <= 4);
    }
    assert.doesNotMatch(JSON.stringify(ageStory(code, age(code))), /NaN|undefined|Infinity/);
  }
});
test('gaps cannot silently become a five-year trend', () => {
  assert.throws(
    () =>
      flowStory('区', [
        { year: 2000, total: 1, natural: 0, social: 1 },
        { year: 2002, total: 2, natural: 0, social: 2 },
      ]),
    /consecutive/,
  );
  assert.throws(() => ageStory('区', []), /consecutive/);
});
