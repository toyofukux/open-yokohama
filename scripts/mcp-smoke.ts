import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = new URL(process.env.MCP_URL ?? 'http://127.0.0.1:8789/mcp');
const client = new Client({ name: 'yokohama-smoke', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 5);
  assert.ok(tools.tools.every((t) => t.annotations?.readOnlyHint));
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
  const resource = await client.readResource({ uri: 'yokohama://wards/kohoku' });
  assert.equal(resource.contents.length, 1);
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
