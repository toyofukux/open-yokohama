import catalog from '../../data/catalog/warehouse.json';
import ages from '../../data/published/ages.json';
import dynamics from '../../data/published/dynamics.json';
import history from '../../data/published/history.json';
import population from '../../data/published/population.json';
import bundle from '../../data/published/warehouse-articles.json';
import { type Inputs, normalize } from './adapter.ts';
import type { Article } from './articles.ts';
import type { Fact } from './model.ts';
export const currentCatalog = catalog;
export const releaseId = bundle.releaseId;
export const articles = bundle.articles as Article[];
let cache: Fact[] | undefined;
export function currentFacts() {
  cache ??= normalize({ population, dynamics, ages, history } as Inputs);
  return cache;
}
export function articlePacket(id: string) {
  const article = articles.find((a) => a.id === id);
  if (!article) throw new Error('Unknown article');
  const versions = new Set(article.inputs.map((i) => i.version));
  const observations = currentFacts().filter((f) => versions.has(f.version));
  return {
    releaseId,
    article,
    observations,
    definitions: catalog.definitions.filter((d) =>
      observations.some((f) => f.definitionVersion === d.version),
    ),
    sources: catalog.sources.filter((s) => observations.some((f) => f.sourceId === s.id)),
  };
}
