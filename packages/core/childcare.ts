import assert from 'node:assert/strict';
import { wards } from './schema';

export const comparisonBands = {
  low: { label: '市全体より低め', short: '低め', range: '0.8倍未満', color: '#a2c7e1' },
  middle: { label: '市全体に近い', short: '近い', range: '0.8〜1.2倍未満', color: '#e5e3d9' },
  high: { label: '市全体より高め', short: '高め', range: '1.2倍以上', color: '#df9471' },
  missing: { label: 'データなし', short: '未確認', range: '', color: '#f4f4f4' },
} as const;
export type Band = keyof typeof comparisonBands;

export function classifyRelative(value: number | null, reference: number): Band {
  assert.ok(Number.isFinite(reference) && reference > 0, 'Reference must be positive');
  if (value === null) return 'missing';
  assert.ok(Number.isFinite(value) && value >= 0, 'Invalid map value');
  if (value < reference * 0.8) return 'low';
  return value < reference * 1.2 ? 'middle' : 'high';
}

export function parseChildcareWardTable(text: string) {
  assert.ok(text.includes('令和８年度') && text.includes('令和７年４月１日現在'));
  const names = new Set([...wards.map((w) => w.name.slice(0, -1)), '合計']);
  const rows = new Map<string, number[]>();
  for (const line of text.split('\n')) {
    const cells = line.trim().split(/\s+/);
    if (!names.has(cells[0])) continue;
    assert.equal(cells.length, 13, `Unexpected columns: ${cells[0]}`);
    assert.ok(!rows.has(cells[0]), `Duplicate ward: ${cells[0]}`);
    const numbers = cells.slice(1).map((cell) => {
      assert.match(cell, /^\d[\d,]*$/);
      return Number(cell.replaceAll(',', ''));
    });
    rows.set(cells[0], numbers);
  }
  assert.equal(rows.size, 19, '18 wards and city total required');
  const total = rows.get('合計');
  assert.ok(total);
  for (let column = 0; column < 12; column++) {
    assert.equal(
      wards.reduce((sum, w) => sum + (rows.get(w.name.slice(0, -1))?.[column] ?? NaN), 0),
      total[column],
      `City total mismatch at column ${column}`,
    );
  }
  const [preschool, facilities, capacity, enrolled, held, waiting] = total.slice(6);
  const applicants = enrolled + held;
  assert.equal(applicants, 73834);
  assert.equal(held, 2532);
  const rate = (held / applicants) * 100;
  return {
    period: '2026-04-01',
    city: { preschool, facilities, capacity, enrolled, held, waiting, applicants, rate },
    wards: wards.map((ward) => {
      const row = rows.get(ward.name.slice(0, -1));
      assert.ok(row);
      const [preschool, facilities, capacity, enrolled, held, waiting] = row.slice(6);
      const applicants = enrolled + held;
      assert.ok(applicants > 0);
      const rate = (held / applicants) * 100;
      return {
        ...ward,
        preschool,
        facilities,
        capacity,
        enrolled,
        held,
        waiting,
        applicants,
        rate,
        previousHeld: row[4],
        previousRate: (row[4] / (row[3] + row[4])) * 100,
        band: classifyRelative(rate, (total[10] / (total[9] + total[10])) * 100),
      };
    }),
  };
}
export type ChildcareData = ReturnType<typeof parseChildcareWardTable>;
