import { type AgesDataset, ageMetrics, validateAges } from '../core/ages.ts';
import { type DynamicsDataset, dynamicsMetrics, validateDynamics } from '../core/dynamics.ts';
import { type Dataset, metrics, validateDataset } from '../core/schema.ts';
import { type HistoryDataset, validateHistory } from './history.ts';
import { type Fact, hash, identity } from './model.ts';

export type Inputs = {
  population: Dataset;
  dynamics: DynamicsDataset;
  ages: AgesDataset;
  history?: HistoryDataset;
};
export function validateInputs(input: Inputs) {
  validateDataset(input.population);
  validateDynamics(input.dynamics);
  validateAges(input.ages);
  if (input.history) validateHistory(input.history);
  return input;
}
export function definitions() {
  return [
    ...['population', 'historical', 'city-series', 'ward-monthly'].flatMap((dataset) =>
      metrics
        .filter((m) => dataset !== 'historical' || ['population', 'households'].includes(m.id))
        .filter(
          (m) =>
            dataset !== 'city-series' ||
            ['population', 'households', 'male', 'female', 'area'].includes(m.id),
        )
        .map((m) => ({
          dataset,
          id: m.id,
          name: m.name,
          unit: m.unit,
          definition:
            dataset === 'historical'
              ? `${m.name}。各年10月1日の国勢調査・推計人口。1995年より前は当時の市区境界。`
              : m.definition,
          periodBasis:
            dataset === 'historical'
              ? '10月1日'
              : dataset === 'city-series'
                ? '1979〜1999年は10月1日、2000年以降は各月1日'
                : '各月1日',
          additive: m.additive,
        })),
    ),
    ...dynamicsMetrics.map((m) => ({
      dataset: 'dynamics',
      id: m.id,
      name: m.name,
      unit: '人',
      definition: m.definition,
      periodBasis: '暦年・暦月の届出による増減',
      additive: true,
    })),
    ...ageMetrics.map((m) => ({
      dataset: 'ages',
      id: m.id,
      name: m.name,
      unit: m.unit,
      definition: m.definition,
      periodBasis: '各年1月1日。構成比の分母には年齢不詳を含む',
      additive: true,
    })),
  ].map((d) => ({ ...d, version: hash(d) }));
}
export function normalize(input: Inputs): Fact[] {
  const defs = definitions();
  const def = (dataset: string, metric: string) => {
    const d = defs.find((d) => d.dataset === dataset && d.id === metric);
    if (!d) throw new Error('Missing metric definition');
    return d;
  };
  const facts: Fact[] = [];
  for (const dataset of ['population', 'dynamics'] as const)
    for (const o of input[dataset].observations) {
      const d = def(dataset, o.metric);
      facts.push(
        identity({
          dataset,
          metric: o.metric,
          definitionVersion: d.version,
          geography: o.geography,
          geographyBasis: '原典掲載時点の市区境界（18区体制）',
          period: o.period,
          frequency: 'frequency' in o ? o.frequency : 'point',
          value: o.value,
          unit: d.unit,
          basis:
            dataset === 'dynamics'
              ? '暦年・暦月の届出による増減'
              : o.period >= '2025-10-01'
                ? '2025年国勢調査速報値に基づく暫定推計'
                : '各時点の国勢調査を基礎とする人口・世帯数',
          provisional: dataset === 'population' && o.period >= '2025-10-01',
          sourceId: o.sourceId,
          rows: [o.row],
          column: o.column,
          revision: o.revision,
          status: o.status,
          legacyId: o.id,
        }),
      );
    }
  for (const r of input.ages.records)
    for (const m of ageMetrics) {
      const d = def('ages', m.id);
      facts.push(
        identity({
          dataset: 'ages',
          metric: m.id,
          definitionVersion: d.version,
          geography: r.geography,
          geographyBasis: '原典掲載時点の市区境界（18区体制）',
          period: r.period,
          frequency: 'year',
          value: r.values[m.id],
          unit: m.unit,
          basis: '各年1月1日の推計人口（年齢不詳を含む）',
          provisional: false,
          sourceId: r.sourceId,
          rows: r.sourceRows[m.id],
          column: r.column,
          revision: r.revision,
          status: r.status,
        }),
      );
    }
  for (const r of input.history?.records ?? []) {
    const d = def(r.dataset, r.metric);
    facts.push(
      identity({
        dataset: r.dataset,
        metric: r.metric,
        definitionVersion: d.version,
        geography: r.geography,
        geographyBasis: r.geographyBasis,
        period: r.period,
        frequency: r.frequency,
        value: r.value,
        unit: d.unit,
        basis: r.basis,
        provisional: r.provisional,
        sourceId: r.sourceId,
        rows: [r.row],
        column: r.column,
        revision: 1,
        status: 'machine_verified',
      }),
    );
  }
  if (new Set(facts.map((f) => f.key)).size !== facts.length)
    throw new Error('Duplicate warehouse keys');
  return facts;
}
function requireLegacyId(f: Fact) {
  if (!f.legacyId) throw new Error('Missing legacy observation ID');
  return f.legacyId;
}
export function restoreLegacy(input: Inputs, facts: Fact[]): Inputs {
  const result: Inputs = {
    population: {
      ...input.population,
      observations: facts
        .filter((f) => f.dataset === 'population')
        .map((f) => ({
          id: requireLegacyId(f),
          geography: f.geography,
          metric: f.metric as Dataset['observations'][number]['metric'],
          period: f.period,
          value: f.value,
          sourceId: f.sourceId,
          row: f.rows[0],
          column: f.column,
          revision: f.revision,
          status: f.status,
        })),
    },
    dynamics: {
      ...input.dynamics,
      observations: facts
        .filter((f) => f.dataset === 'dynamics')
        .map((f) => ({
          id: requireLegacyId(f),
          geography: f.geography,
          metric: f.metric as DynamicsDataset['observations'][number]['metric'],
          frequency: f.frequency as 'month' | 'year',
          period: f.period,
          value: f.value,
          sourceId: f.sourceId,
          row: f.rows[0],
          column: '数・率',
          revision: f.revision,
          status: f.status,
        })),
    },
    ages: { ...input.ages, records: [] },
  };
  const ageIndex = new Map<string, AgesDataset['records'][number]>();
  for (const f of facts.filter((f) => f.dataset === 'ages')) {
    const key = `${f.period}:${f.geography}`;
    let r = ageIndex.get(key);
    if (!r) {
      r = {
        geography: f.geography,
        period: f.period,
        values: {} as AgesDataset['records'][number]['values'],
        sourceId: f.sourceId,
        sourceRows: {} as AgesDataset['records'][number]['sourceRows'],
        column: '人口',
        revision: f.revision,
        status: f.status,
      };
      ageIndex.set(key, r);
      result.ages.records.push(r);
    }
    const metric = f.metric as keyof typeof r.values;
    r.values[metric] = f.value;
    r.sourceRows[metric] = f.rows;
  }
  if (input.history)
    result.history = {
      ...input.history,
      records: facts
        .filter((f) => ['historical', 'city-series', 'ward-monthly'].includes(f.dataset))
        .map((f) => ({
          dataset: f.dataset as HistoryDataset['records'][number]['dataset'],
          geography: f.geography,
          metric: f.metric as HistoryDataset['records'][number]['metric'],
          period: f.period,
          frequency: f.frequency as 'month' | 'year',
          value: f.value,
          sourceId: f.sourceId,
          row: f.rows[0],
          column: f.column,
          basis: f.basis,
          geographyBasis: f.geographyBasis,
          provisional: f.provisional,
        })),
    };
  return {
    population: validateDataset(result.population),
    dynamics: validateDynamics(result.dynamics),
    ages: validateAges(result.ages),
    ...(result.history ? { history: validateHistory(result.history) } : {}),
  };
}
