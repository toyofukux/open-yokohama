import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import raw from '../../../data/published/population.json';
import { policyIssues } from '../../../packages/core/policy-issues';
import { compare, fact, series } from '../../../packages/core/query';
import { type Dataset, geographies, metrics } from '../../../packages/core/schema';

// Immutable public release only; no private storage or credentials are bound to this Worker.
const data: Dataset = raw as Dataset;
const geo = z.enum(geographies.map((g) => g.code));
const metric = z.enum(metrics.map((m) => m.id));
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
        'Latest public metric with exact source row, unit, period and definition. Not a causal assessment.',
      inputSchema: { geography: geo, metric },
      annotations,
    },
    ({ geography, metric }) => result(fact(data, geography, metric)),
  );
  server.registerTool(
    'get_metric_series',
    {
      description:
        'Published monthly observations; sources include original artifact and retrieval time. Census rebasing may cause discontinuities.',
      inputSchema: { geography: geo, metric },
      annotations,
    },
    ({ geography, metric }) => {
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
        'Compare 18 wards using the same reference date and definition. Does not rank quality of life.',
      inputSchema: { metric, period: z.iso.date() },
      annotations,
    },
    ({ metric, period }) => {
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
      const source = data.snapshots.find((s) => s.id === id);
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
        ...policyIssues.map((i) => ({
          id: i.slug,
          title: `${i.title} ${i.summary}`,
          kind: 'issue',
        })),
      ];
      return result(
        entries.filter((e) => terms.every((t) => e.title.toLowerCase().includes(t))).slice(0, 20),
      );
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
  return server;
}
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health')
      return Response.json({ status: 'ok', release: data.generatedAt });
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
  },
} satisfies ExportedHandler<Env>;
