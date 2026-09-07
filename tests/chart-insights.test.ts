import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ageComparisonInsights,
  comparisonInsights,
  historyInsights,
} from '../packages/core/chart-insights.ts';

test('comparison explains natural change, all-negative results and tied extremes', () => {
  const text = comparisonInsights(
    [
      { label: 'A区', value: -1 },
      { label: 'B区', value: -1 },
      { label: 'C区', value: -5 },
    ],
    '自然増減',
    true,
  ).join('');
  assert.match(text, /A区・B区/);
  assert.match(text, /プラスは0区、マイナスは3区、0人は0区/);
  assert.match(text, /死亡が出生を上回/);
  assert.match(
    comparisonInsights(
      [
        { label: 'A区', value: 0 },
        { label: 'B区', value: 0 },
      ],
      '人口増減',
      true,
    ).join(''),
    /すべて0人で同じ/,
  );
});
test('counts are not described as gains and comparisons do not infer risk', () => {
  const text = comparisonInsights(
    [
      { label: 'A区', value: 100 },
      { label: 'B区', value: 20 },
    ],
    '死亡',
    false,
  ).join('');
  assert.doesNotMatch(text, /プラス|増加|\+100/);
  assert.match(text, /人口規模が異なる/);
});
test('age rankings use shares rather than counts and exclude the city', () => {
  const text = ageComparisonInsights([
    { label: '横浜市', values: [600, 0, 300, 100], total: 1000 },
    { label: 'A区', values: [20, 40, 30, 10], total: 100 },
    { label: 'B区', values: [100, 600, 200, 100], total: 1000 },
  ]).join('');
  assert.match(text, /0〜14歳の割合が最も高いのはA区（20%）/);
  assert.match(text, /65歳以上の割合が最も高いのはA区（30%）/);
  assert.match(text, /年齢不詳は10%/);
});
test('flow narrative distinguishes offset, insufficient offset and exact balance', () => {
  for (const [total, natural, social, expected] of [
    [164, -18732, 18896, '上回り'],
    [-10, -20, 10, '補い切れず'],
    [0, -10, 10, '相殺'],
  ] as const) {
    const text = historyInsights(
      ['2024', '2025'],
      [
        { name: '人口増減', values: [5, total] },
        { name: '自然増減', values: [-5, natural] },
        { name: '社会増減', values: [10, social] },
      ],
      '人',
    ).join('');
    assert.ok(text.includes(expected));
  }
});
test('percentage changes are points and endpoints are not called continuous trends', () => {
  const text = historyInsights(
    ['2000', '2010', '2025'],
    [
      { name: '65歳以上', values: [10, 40, 30] },
      { name: '0〜14歳', values: [20, 10, 15] },
    ],
    '%',
  ).join('');
  assert.match(text, /20ポイント上が/);
  assert.match(text, /5ポイント下が/);
  assert.match(text, /途中も一貫して変化したという意味ではありません/);
});
