import { type Dataset, geographies, type MetricId, metrics } from './schema.ts';
export const number = (value: number) =>
  new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(value);
export function series(data: Dataset, geography: string, metric: MetricId) {
  return data.observations
    .filter((o) => o.geography === geography && o.metric === metric)
    .sort((a, b) => a.period.localeCompare(b.period));
}
export function latest(data: Dataset, geography: string, metric: MetricId) {
  const result = series(data, geography, metric).at(-1);
  if (!result) throw new Error('No observation');
  return result;
}
export function compare(data: Dataset, metric: MetricId, period: string) {
  return data.observations
    .filter((o) => o.metric === metric && o.period === period && o.geography !== '141003')
    .sort((a, b) => b.value - a.value);
}
export function fact(data: Dataset, geography: string, metric: MetricId) {
  const observation = latest(data, geography, metric);
  const source = data.snapshots.find((s) => s.id === observation.sourceId);
  const definition = metrics.find((m) => m.id === metric);
  const geo = geographies.find((g) => g.code === geography);
  if (!source || !definition || !geo) throw new Error('Unresolved fact');
  return {
    statement: `${observation.period}時点の${geo.name}の${definition.name}は${number(observation.value)}${definition.unit}。`,
    observation,
    source,
    definition,
  };
}
