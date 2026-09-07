import { parse } from 'csv-parse/sync';
import {
  type DynamicsObservation,
  type DynamicsScope,
  dynamicsKey,
  dynamicsMetrics,
} from '../core/dynamics.ts';
import { geographies } from '../core/schema.ts';

export function parseDynamics(
  text: string,
  scope: DynamicsScope,
  sourceId: string,
  revision = 1,
): DynamicsObservation[] {
  // Keep physical lines: provenance must not shift when a blank line is inserted.
  const rows: string[][] = parse(text, { bom: true });
  const expected = [
    '年（和暦）',
    '年（西暦）',
    ...(scope === 'month' ? ['月'] : scope === 'ku' ? ['行政区'] : []),
    '種別',
    '性別',
    '数・率',
  ];
  const headers = rows[0];
  if (JSON.stringify(headers) !== JSON.stringify(expected))
    throw new Error('Unexpected dynamics CSV schema');
  const knownKinds = [
    ...dynamicsMetrics.map((m) => m.column),
    '世帯数増減',
    '人口増減率',
    '社会増減率',
    '自然増減率',
  ];
  const cells = new Map<string, number>();
  const result: DynamicsObservation[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.some((cell) => /[\r\n]/.test(cell)))
      throw new Error('Multiline dynamics field changes source row');
    const get = (name: string) => row[headers.indexOf(name)]?.trim() ?? '';
    const year = get('年（西暦）');
    if (!/^\d{4}$/.test(year) || Number(year) < 1979 || Number(year) > 2099)
      throw new Error('Invalid dynamics year');
    const month = get('月');
    if (scope === 'month' && !/^(?:[1-9]|1[0-2])$/.test(month))
      throw new Error('Invalid dynamics month');
    const geography =
      scope === 'ku'
        ? geographies.find((g) => g.name === get('行政区') && g.code !== '141003')?.code
        : '141003';
    if (!geography) throw new Error('Unknown dynamics geography');
    const kind = get('種別');
    const sex = get('性別');
    const raw = get('数・率');
    if (!knownKinds.includes(kind)) throw new Error('Unknown dynamics kind');
    const metric = dynamicsMetrics.find((m) => m.column === kind);
    if (metric ? !['総数', '男', '女'].includes(sex) : sex !== '')
      throw new Error('Invalid dynamics sex');
    if (
      !/^-?\d+(\.\d+)?$/.test(raw) ||
      !Number.isFinite(Number(raw)) ||
      (!kind.endsWith('率') && !Number.isSafeInteger(Number(raw)))
    )
      throw new Error('Missing or invalid dynamics number');
    const period = scope === 'month' ? `${year}-${month.padStart(2, '0')}` : year;
    const cellKey = `${period}:${geography}:${kind}:${sex}`;
    if (cells.has(cellKey)) throw new Error('Duplicate dynamics cell');
    cells.set(cellKey, Number(raw));
    if (Number(year) < 2000 || !metric || sex !== '総数') continue;
    const observation: DynamicsObservation = {
      id: '',
      geography,
      metric: metric.id,
      frequency: scope === 'month' ? 'month' : 'year',
      period,
      value: Number(raw),
      sourceId,
      row: i + 1,
      column: '数・率',
      revision,
      status: 'machine_verified',
    };
    observation.id = `${dynamicsKey(observation)}:${sourceId}`;
    result.push(observation);
  }
  if (!result.length) throw new Error('Empty dynamics source');
  for (const o of result) {
    const kind = dynamicsMetrics.find((m) => m.id === o.metric)?.column;
    const base = `${o.period}:${o.geography}:${kind}:`;
    const male = cells.get(`${base}男`),
      female = cells.get(`${base}女`);
    if (male === undefined || female === undefined || male + female !== o.value)
      throw new Error('Dynamics sex total mismatch');
  }
  return result;
}
