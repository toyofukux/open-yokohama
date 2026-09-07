import { parse } from 'csv-parse/sync';
import { geographies, metrics, type Observation } from '../core/schema.ts';

export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
  }
}
export function parsePopulation(text: string, sourceId: string, revision = 1): Observation[] {
  const rows: string[][] = parse(text, { bom: true, skip_empty_lines: true });
  const headers = rows[0];
  const required = ['年月日', '全国地方公共団体コード', '市区名', ...metrics.map((m) => m.column)];
  if (
    !headers ||
    headers.length !== required.length ||
    new Set(headers).size !== headers.length ||
    required.some((h) => !headers.includes(h))
  )
    throw new Error('Unexpected CSV schema');
  if (rows.length !== 20) throw new Error('Expected city and 18 wards');
  const result: Observation[] = [];
  const codes = new Set<string>();
  const periods = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const cell = (name: string) => cells[headers.indexOf(name)]?.trim();
    const code = cell('全国地方公共団体コード');
    const geo = geographies.find((g) => g.code === code);
    if (!geo || geo.name !== cell('市区名') || codes.has(code))
      throw new Error('Invalid or duplicate geography');
    codes.add(code);
    const rawDate = cell('年月日');
    if (!/^\d{4}\/\d{1,2}\/0?1$/.test(rawDate)) throw new Error('Invalid reference date');
    const [year, month, day] = rawDate.split('/');
    const period = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    if (Number(month) < 1 || Number(month) > 12) throw new Error('Invalid month');
    periods.add(period);
    for (const metric of metrics) {
      const raw = cell(metric.column);
      if (!/^-?\d+(\.\d+)?$/.test(raw))
        throw new Error(`Missing or invalid numeric cell at row ${i + 1}`);
      result.push({
        id: `${period}:${code}:${metric.id}:${sourceId}`,
        geography: code,
        metric: metric.id,
        period,
        value: Number(raw),
        sourceId,
        row: i + 1,
        column: metric.column,
        revision,
        status: 'machine_verified',
      });
    }
  }
  if (periods.size !== 1) throw new Error('Mixed periods in CSV');
  return result;
}
