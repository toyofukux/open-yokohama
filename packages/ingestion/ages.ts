import { parse } from 'csv-parse/sync';
import type { AgeMetric, AgeRecord } from '../core/ages.ts';
import { geographies } from '../core/schema.ts';

export function parseAges(text: string, sourceId: string, revision = 1): AgeRecord[] {
  const rows: string[][] = parse(text, { bom: true });
  if (
    JSON.stringify(rows[0]) !==
    JSON.stringify(['年（和暦）', '年（西暦）', '行政区', '年齢', '性別', '人口'])
  )
    throw new Error('Unexpected age CSV schema');
  const groups = new Map<string, Map<string, { value: number; row: number }>>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.some((cell) => /[\r\n]/.test(cell)))
      throw new Error('Multiline age field changes source row');
    const [, year, name, rawAge, sex, rawValue] = row;
    const age = rawAge.normalize('NFKC');
    if (
      !/^20\d{2}$/.test(year) ||
      !['総数', '男', '女'].includes(sex) ||
      !/^(総数|年齢不詳|100歳以上|[0-9]{1,2}歳)$/.test(age)
    )
      throw new Error('Invalid age dimension');
    if (!/^\d+$/.test(rawValue) || !Number.isSafeInteger(Number(rawValue)))
      throw new Error('Missing or invalid age number');
    const geography = geographies.find((g) => g.name === name);
    if (!geography) throw new Error('Unknown age geography');
    const key = `${year}-01-01:${geography.code}`;
    const group = groups.get(key) ?? new Map();
    const cellKey = `${age}:${sex}`;
    if (group.has(cellKey)) throw new Error('Duplicate age cell');
    group.set(cellKey, { value: Number(rawValue), row: i + 1 });
    groups.set(key, group);
  }
  const result: AgeRecord[] = [];
  const ages = [
    ...Array.from({ length: 100 }, (_, i) => `${i}歳`),
    '100歳以上',
    '年齢不詳',
    '総数',
  ];
  for (const [key, cells] of groups) {
    if (cells.size !== ages.length * 3) throw new Error('Incomplete age cells');
    const get = (age: string, sex: string) => {
      const cell = cells.get(`${age}:${sex}`);
      if (!cell) throw new Error('Missing age cell');
      return cell;
    };
    for (const age of ages)
      if (get(age, '男').value + get(age, '女').value !== get(age, '総数').value)
        throw new Error('Age sex total mismatch');
    for (const sex of ['総数', '男', '女'])
      if (
        ages.filter((a) => a !== '総数').reduce((sum, a) => sum + get(a, sex).value, 0) !==
        get('総数', sex).value
      )
        throw new Error('Age original total mismatch');
    const [period, geography] = key.split(':');
    const record: AgeRecord = {
      geography,
      period,
      values: { age_total: 0, age_under15: 0, age_15to64: 0, age_65plus: 0, age_unknown: 0 },
      sourceRows: {
        age_total: [],
        age_under15: [],
        age_15to64: [],
        age_65plus: [],
        age_unknown: [],
      },
      sourceId,
      column: '人口',
      revision,
      status: 'machine_verified',
    };
    for (const age of ages) {
      const id: AgeMetric =
        age === '総数'
          ? 'age_total'
          : age === '年齢不詳'
            ? 'age_unknown'
            : parseInt(age, 10) < 15
              ? 'age_under15'
              : parseInt(age, 10) < 65
                ? 'age_15to64'
                : 'age_65plus';
      const cell = get(age, '総数');
      record.values[id] += cell.value;
      record.sourceRows[id].push(cell.row);
    }
    result.push(record);
  }
  if (!result.length) throw new Error('Empty age source');
  return result;
}
