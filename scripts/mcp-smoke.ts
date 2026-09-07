import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = new URL(process.env.MCP_URL ?? 'http://127.0.0.1:8789/mcp');
const client = new Client({ name: 'yokohama-smoke', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 8);
  assert.ok(tools.tools.every((t) => t.annotations?.readOnlyHint));
  const warehouse = await client.callTool({
    name: 'warehouse_query',
    arguments: {
      dataset: 'historical',
      geography: '141003',
      metric: 'population',
      from: '1995',
      to: '2024',
      limit: 100,
    },
  });
  const values = JSON.parse((warehouse.content as { text: string }[])[0].text);
  assert.equal(values.observations.length, 30);
  assert.equal(values.observations[0].value, 3307136);
  assert.equal(values.observations.at(-1).value, 3771063);
  const warehouseArticle = await client.callTool({
    name: 'warehouse_article',
    arguments: { id: 'population-history/yokohama' },
  });
  assert.equal(warehouseArticle.isError, undefined);
  assert.ok(
    JSON.parse((warehouseArticle.content as { text: string }[])[0].text).article.calculations
      .length > 0,
  );
  const response = await client.callTool({
    name: 'get_metric',
    arguments: { geography: '141097', metric: 'population' },
  });
  assert.equal(response.isError, undefined);
  const content = response.content as { type: string; text: string }[];
  const fact = JSON.parse(content[0].text);
  assert.ok(fact.observation.value > 0);
  assert.equal(fact.source.id, fact.observation.sourceId);
  const history = await client.callTool({
    name: 'get_metric_series',
    arguments: { geography: '141097', metric: 'population' },
  });
  assert.equal(history.isError, undefined);
  const comparison = await client.callTool({
    name: 'compare_geographies',
    arguments: { metric: 'population', period: fact.observation.period },
  });
  const compared = JSON.parse((comparison.content as { text: string }[])[0].text);
  assert.equal(compared.observations.length, 18);
  const flow = await client.callTool({
    name: 'get_metric',
    arguments: { geography: '141003', metric: 'total_change' },
  });
  assert.equal(flow.isError, undefined);
  const dynamics = JSON.parse((flow.content as { text: string }[])[0].text);
  assert.equal(dynamics.observations.length, 1);
  assert.equal(dynamics.observations[0].frequency, 'year');
  assert.ok(
    dynamics.sources.some((s: { id: string }) => s.id === dynamics.observations[0].sourceId),
  );
  const flowSource = await client.callTool({
    name: 'get_source',
    arguments: { id: dynamics.observations[0].sourceId },
  });
  assert.equal(flowSource.isError, undefined);
  const flowCompare = await client.callTool({
    name: 'compare_geographies',
    arguments: { metric: 'births', period: dynamics.observations[0].period },
  });
  assert.equal(
    JSON.parse((flowCompare.content as { text: string }[])[0].text).observations.length,
    18,
  );
  const unavailable = await client.callTool({
    name: 'get_metric_series',
    arguments: { geography: '141097', metric: 'births', frequency: 'month' },
  });
  assert.equal(JSON.parse((unavailable.content as { text: string }[])[0].text).unavailable, true);
  const monthly = await client.callTool({
    name: 'get_metric_series',
    arguments: { geography: '141003', metric: 'births', frequency: 'month' },
  });
  assert.ok(JSON.parse((monthly.content as { text: string }[])[0].text).observations.length >= 319);
  const age = await client.callTool({
    name: 'get_metric',
    arguments: { geography: '141003', metric: 'age_unknown' },
  });
  const ageData = JSON.parse((age.content as { text: string }[])[0].text);
  assert.equal(ageData.observations.length, 1);
  assert.equal(ageData.observations[0].period, '2025-01-01');
  assert.equal(ageData.observations[0].value, 98789);
  const ageCompare = await client.callTool({
    name: 'compare_geographies',
    arguments: { metric: 'age_under15', period: '2025-01-01' },
  });
  const ageCompared = JSON.parse((ageCompare.content as { text: string }[])[0].text);
  assert.equal(ageCompared.observations.length, 18);
  assert.equal(ageCompared.observations[0].rows.length, 15);
  const ageMonthly = await client.callTool({
    name: 'get_metric',
    arguments: { geography: '141003', metric: 'age_under15', frequency: 'month' },
  });
  assert.equal(JSON.parse((ageMonthly.content as { text: string }[])[0].text).unavailable, true);
  const resource = await client.readResource({ uri: 'yokohama://wards/kohoku' });
  assert.equal(resource.contents.length, 1);
  const article = await client.readResource({ uri: 'yokohama://issues/school-lunch' });
  const reviewed = JSON.parse((article.contents[0] as { text: string }).text);
  assert.equal(reviewed.issue.slug, 'school-lunch');
  assert.equal(reviewed.url, 'https://open.yokohama/issues/school-lunch/');
  await assert.rejects(client.readResource({ uri: 'yokohama://issues/population' }));
  const invalid = await client.callTool({
    name: 'get_metric',
    arguments: { geography: 'invalid', metric: 'population' },
  });
  assert.equal(invalid.isError, true);
  const search = await client.callTool({ name: 'search', arguments: { query: '給食' } });
  const found = JSON.parse((search.content as { text: string }[])[0].text);
  assert.ok(found.some((entry: { id: string }) => entry.id === 'school-lunch'));
  for (const query of [
    '横浜の人口は、どこで変わっている',
    '人口と世帯数は、同じように動く',
    '人口の密度は、区によってどう違う',
  ]) {
    const retired = await client.callTool({ name: 'search', arguments: { query } });
    assert.deepEqual(JSON.parse((retired.content as { text: string }[])[0].text), []);
  }
  const denied = await fetch(url, {
    method: 'POST',
    headers: { Origin: 'https://invalid.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(denied.status, 403);
  const large = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: 'x'.repeat(9000) }),
  });
  assert.equal(large.status, 413);
  console.log(
    'MCP live smoke passed: initialization, tools, citations, history, 18 wards, resources, invalid input, origin and payload limits.',
  );
} finally {
  await client.close();
}
