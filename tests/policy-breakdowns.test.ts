import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderPolicyBreakdowns } from '../packages/core/policy-breakdowns';

const data = () => JSON.parse(readFileSync('data/editorial/breakdowns.json', 'utf8'));

test('breakdowns preserve a small component and derive amounts and proportions from integers', () => {
  const input = data();
  const result = renderPolicyBreakdowns(input);
  assert.match(result['cost-funding'], /1,470万円（0.3％）/);
  assert.match(result['cost-funding'], /width:0.299041846%/);
  assert.match(result['plastic-process'], /18,652トン（36.8％）/);
  assert.match(result['plastic-process'], /32,070トン（63.2％）/);
  assert.match(result['plastic-process'], /同じ量の温室効果ガスを削減したという意味ではない/);
  input['plastic-process'].parts[0].value += 1;
  input['plastic-process'].total += 1;
  const updated = renderPolicyBreakdowns(input)['plastic-process'];
  assert.match(updated, /18,653トン/);
  assert.match(updated, /50,723トン/);
  assert.doesNotMatch(updated, /18,652|50,722/);
});

test('breakdowns reject incomplete sums, negative parts and zero denominators', () => {
  const incomplete = data();
  incomplete['plastic-process'].total += 1;
  assert.throws(() => renderPolicyBreakdowns(incomplete));
  const negative = data();
  negative['plastic-process'].parts[0].value = -1;
  negative['plastic-process'].total = 32069;
  assert.throws(() => renderPolicyBreakdowns(negative));
  const empty = data();
  empty['plastic-process'].total = 0;
  empty['plastic-process'].parts.forEach((p: { value: number }) => {
    p.value = 0;
  });
  assert.throws(() => renderPolicyBreakdowns(empty));
});
