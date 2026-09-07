import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import agesRaw from '../../../data/published/ages.json';
import dynamicsRaw from '../../../data/published/dynamics.json';
import raw from '../../../data/published/population.json';
import {
  type AgeMetric,
  type AgesDataset,
  ageMetrics,
  queryAges,
} from '../../../packages/core/ages';
import {
  type DynamicsDataset,
  type DynamicsMetric,
  dynamicsMetrics,
  queryDynamics,
} from '../../../packages/core/dynamics';
import {
  editorialSources,
  editorialVerification,
  issueEvidence,
  issues,
} from '../../../packages/core/issues';
import { compare, fact, series } from '../../../packages/core/query';
import { type Dataset, geographies, metrics } from '../../../packages/core/schema';

import {
  articlePacket,
  articles,
  currentCatalog,
  currentFacts,
  releaseId,
} from '../../../packages/warehouse/current';
import { hashSchema, queryFacts, querySchema } from '../../../packages/warehouse/model';
import { budget, localAccess, maxResponseBytes } from './limits';

const localBudget = budget();

// Immutable public release only; no private storage or credentials are bound to this Worker.
const data: Dataset = raw as Dataset;
const dynamics = dynamicsRaw as DynamicsDataset;
const ages = agesRaw as AgesDataset;
const isAge = (id: string): id is AgeMetric => ageMetrics.some((m) => m.id === id);
const isDynamics = (id: string): id is DynamicsMetric => dynamicsMetrics.some((m) => m.id === id);
const geo = z.enum(geographies.map((g) => g.code));
const metric = z.enum([
  ...metrics.map((m) => m.id),
  ...dynamicsMetrics.map((m) => m.id),
  ...ageMetrics.map((m) => m.id),
]);
const frequency = z.enum(['month', 'year']).optional();
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const result = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
});
export function createServer() {
  const server = new McpServer({ name: 'open-yokohama', version: '0.1.0' });
  server.registerTool(
    'get_metric',
    {
      description:
        'Latest public metric with sources. Dynamics default to calendar year; frequency=month is city-only. Age metrics are January 1 estimates, annual only. Unavailable never means zero. Not a causal assessment.',
      inputSchema: { geography: geo, metric, frequency },
      annotations,
    },
    ({ geography, metric, frequency }) => {
      if (isAge(metric)) {
        if (frequency === 'month')
          return result({
            unavailable: true,
            observations: [],
            reason: 'Age metrics are January 1 estimates, annual only.',
          });
        const period = ages.records
          .filter((r) => r.geography === geography)
          .map((r) => r.period)
          .sort()
          .at(-1);
        return result(queryAges(ages, { geography, metric, period }));
      }
      if (!isDynamics(metric)) {
        if (frequency === 'year')
          return result({
            unavailable: true,
            reason: 'Population stock metrics are monthly reference dates.',
          });
        return result(fact(data, geography, metric));
      }
      const series = queryDynamics(dynamics, { geography, metric, frequency: frequency ?? 'year' });
      const period = series.observations
        .map((o) => o.period)
        .sort()
        .at(-1);
      return result(
        period
          ? queryDynamics(dynamics, { geography, metric, frequency: frequency ?? 'year', period })
          : series,
      );
    },
  );
  server.registerTool(
    'get_metric_series',
    {
      description:
        'Published observations with exact sources. Stock metrics use monthly dates; dynamics default to calendar years (month for city only); age metrics are annual January 1 estimates. Census rebasing may cause discontinuities.',
      inputSchema: { geography: geo, metric, frequency },
      annotations,
    },
    ({ geography, metric, frequency }) => {
      if (isAge(metric))
        return result(
          frequency === 'month'
            ? {
                unavailable: true,
                observations: [],
                reason: 'Age metrics are January 1 estimates, annual only.',
              }
            : queryAges(ages, { geography, metric }),
        );
      if (isDynamics(metric))
        return result(
          queryDynamics(dynamics, { geography, metric, frequency: frequency ?? 'year' }),
        );
      if (frequency === 'year')
        return result({
          unavailable: true,
          reason: 'Population stock metrics are monthly reference dates.',
        });
      const observations = series(data, geography, metric);
      return result({
        observations,
        definition: metrics.find((m) => m.id === metric),
        sources: data.snapshots.filter((s) => observations.some((o) => o.sourceId === s.id)),
      });
    },
  );
  server.registerTool(
    'compare_geographies',
    {
      description:
        'Compare 18 wards at the same period. Stock: YYYY-MM-DD; dynamics: YYYY calendar year; age: YYYY-01-01. Ward dynamics have no monthly breakdown. Does not rank quality of life.',
      inputSchema: {
        metric,
        period: z.union([z.iso.date(), z.string().regex(/^20\d{2}(-(0[1-9]|1[0-2]))?$/)]),
      },
      annotations,
    },
    ({ metric, period }) => {
      if (isAge(metric)) {
        const comparison = queryAges(ages, { metric, period });
        return result({
          ...comparison,
          observations: comparison.observations
            .filter((o) => o.geography !== '141003')
            .sort((a, b) => b.value - a.value),
          geographies,
        });
      }
      if (isDynamics(metric)) {
        if (!/^20\d{2}$/.test(period))
          return result({
            unavailable: true,
            observations: [],
            reason: 'Ward dynamics are calendar-year totals; specify YYYY.',
          });
        const comparison = queryDynamics(dynamics, { metric, frequency: 'year', period });
        return result({
          ...comparison,
          observations: comparison.observations
            .filter((o) => o.geography !== '141003')
            .sort((a, b) => b.value - a.value),
          geographies,
        });
      }
      const observations = compare(data, metric, period);
      return result({
        observations,
        geographies,
        definition: metrics.find((m) => m.id === metric),
        sources: data.snapshots.filter((s) => observations.some((o) => o.sourceId === s.id)),
        unavailable: observations.length === 0,
      });
    },
  );
  server.registerTool(
    'get_source',
    {
      description: 'Resolve a SHA-256 source ID to an original public CSV snapshot.',
      inputSchema: { id: z.string().regex(/^[a-f0-9]{64}$/) },
      annotations,
    },
    ({ id }) => {
      const source = currentCatalog.sources.find((s) => s.id === id);
      return source ? result(source) : { ...result({ error: 'Source not found' }), isError: true };
    },
  );
  server.registerTool(
    'search',
    {
      description:
        'Search public wards, metric definitions and issue guides. No LLM, private data or external search.',
      inputSchema: { query: z.string().min(1).max(100) },
      annotations,
    },
    ({ query }) => {
      const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/);
      const entries = [
        ...geographies.map((g) => ({ id: g.code, title: g.name, kind: 'geography' })),
        ...metrics.map((m) => ({ id: m.id, title: `${m.name} ${m.definition}`, kind: 'metric' })),
        ...dynamicsMetrics.map((m) => ({
          id: m.id,
          title: `${m.name} ${m.definition}`,
          kind: 'dynamics_metric',
          url: '/population-movement/',
        })),
        ...ageMetrics.map((m) => ({
          id: m.id,
          title: `${m.name} ${m.definition}`,
          kind: 'age_metric',
          url: '/age-structure/',
        })),
        ...issues.map((i) => ({ id: i.slug, title: `${i.title} ${i.summary}`, kind: 'issue' })),
      ];
      return result(
        entries.filter((e) => terms.every((t) => e.title.toLowerCase().includes(t))).slice(0, 20),
      );
    },
  );
  server.registerResource(
    'issue',
    new ResourceTemplate('yokohama://issues/{slug}', {
      list: async () => ({
        resources: issues.map((i) => ({ uri: `yokohama://issues/${i.slug}`, name: i.title })),
      }),
    }),
    {
      description: 'Published issue text and evidence review. AI review is not human approval.',
      mimeType: 'application/json',
    },
    (uri, { slug }) => {
      const issue = issues.find((i) => i.slug === slug);
      if (!issue) throw new Error('Unknown issue');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              issue,
              verification: editorialVerification,
              sources: editorialSources,
              claims: issueEvidence(issue.slug),
            }),
          },
        ],
      };
    },
  );
  server.registerResource(
    'city',
    'yokohama://city',
    { description: 'City summary and available metric definitions', mimeType: 'application/json' },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            geographies,
            metrics,
            dynamicsMetrics,
            ageMetrics,
            dynamicsCoverage: {
              annual: '2000 onward, city and 18 wards',
              monthly: '2000 onward, city only',
              generatedAt: dynamics.generatedAt,
            },
            editorialVerification,
            latest: fact(data, '141003', 'population'),
            generatedAt: data.generatedAt,
          }),
        },
      ],
    }),
  );
  server.registerResource(
    'ward',
    new ResourceTemplate('yokohama://wards/{slug}', {
      list: async () => ({
        resources: geographies.map((g) => ({ uri: `yokohama://wards/${g.slug}`, name: g.name })),
      }),
    }),
    { mimeType: 'application/json' },
    (uri, { slug }) => {
      const geography = geographies.find((g) => g.slug === slug);
      if (!geography) throw new Error('Unknown geography');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(fact(data, geography.code, 'population')),
          },
        ],
      };
    },
  );
  server.registerTool(
    'warehouse_catalog',
    {
      description:
        'Dataset definitions, coverage, source versions and known quality issues. Local read-only snapshot.',
      inputSchema: {},
      annotations,
    },
    () => result({ releaseId, ...currentCatalog }),
  );
  server.registerTool(
    'warehouse_query',
    {
      description:
        'Read at most 500 warehouse values. Specify dataset, geography, metric and period. releaseId must be the current bundled release; historical releases are available through CLI/static archives. No SQL, URLs or writes.',
      inputSchema: querySchema.extend({ releaseId: hashSchema.optional() }).shape,
      annotations,
    },
    (args) => {
      const { releaseId: requested, ...query } = args;
      if (requested && requested !== releaseId)
        return result({
          unavailable: true,
          reason: 'Release not bundled. Use the archived release via CLI.',
          releaseId: requested,
        });
      const rows = queryFacts(currentFacts(), query);
      return result({
        releaseId,
        ...rows,
        definitions: currentCatalog.definitions.filter((d) =>
          rows.observations.some((f) => f.definitionVersion === d.version),
        ),
        sources: currentCatalog.sources.filter((s) =>
          rows.observations.some((f) => f.sourceId === s.id),
        ),
      });
    },
  );
  server.registerTool(
    'warehouse_article',
    {
      description:
        'Versioned article with exact input facts and calculations. An article is descriptive; not a causal or policy assessment.',
      inputSchema: { id: z.enum(articles.map((a) => a.id)), releaseId: hashSchema.optional() },
      annotations,
    },
    ({ id, releaseId: requested }) =>
      requested && requested !== releaseId
        ? result({ unavailable: true, reason: 'Release not bundled', releaseId: requested })
        : result(articlePacket(id)),
  );
  return server;
}
async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/health') return Response.json({ status: 'ok', release: data.generatedAt });
  if (url.pathname !== '/mcp') return new Response('Not found', { status: 404 });
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return new Response('Forbidden origin', { status: 403 });
  if (request.method !== 'POST')
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!request.headers.get('Content-Type')?.startsWith('application/json'))
    return new Response('Expected application/json', { status: 415 });
  if (!request.body) return new Response('Missing body', { status: 400 });
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      return new Response('Request too large', { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const boundedRequest = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: bytes,
  });
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(boundedRequest);
  } catch {
    return Response.json({ error: 'MCP request failed' }, { status: 500 });
  } finally {
    await server.close();
  }
}
export default {
  async fetch(request: Request, env: Env & { INTERNAL_MCP_ENABLED?: string }): Promise<Response> {
    if (!localAccess(request, env.INTERNAL_MCP_ENABLED === 'true'))
      return new Response('Internal MCP only', { status: 403 });
    if (!localBudget.enter())
      return new Response('Local request budget exceeded', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    try {
      const response = await handle(request);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > maxResponseBytes)
        return Response.json(
          { error: 'Response limit exceeded; narrow the query.' },
          { status: 413 },
        );
      return new Response(bytes, { status: response.status, headers: response.headers });
    } finally {
      localBudget.leave();
    }
  },
} satisfies ExportedHandler<Env & { INTERNAL_MCP_ENABLED?: string }>;
