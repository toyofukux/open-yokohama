import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('MCP stays private regardless of available cloud credentials', () => {
  const config = JSON.parse(readFileSync('apps/mcp/wrangler.jsonc', 'utf8'));
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.equal(config.route, undefined);
  assert.equal(config.env, undefined, 'An environment must not bypass the publication hold');
});
