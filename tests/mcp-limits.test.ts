import assert from 'node:assert/strict';
import test from 'node:test';
import { budget, localAccess } from '../apps/mcp/src/limits.ts';

test('MCP requires explicit local enablement and loopback with no forwarded caller', () => {
  const req = (url = 'http://127.0.0.1:8789/mcp', headers = {}) => new Request(url, { headers });
  assert.equal(localAccess(req(), true), true);
  assert.equal(localAccess(req(undefined, { 'CF-Connecting-IP': '127.0.0.1' }), true), true);
  assert.equal(localAccess(req(undefined, { 'CF-Connecting-IP': '203.0.113.1' }), true), false);
  assert.equal(localAccess(req(), false), false);
  assert.equal(localAccess(req('https://mcp.example/mcp'), true), false);
  assert.equal(localAccess(req(undefined, { Origin: 'https://example.com' }), true), false);
  assert.equal(localAccess(req(undefined, { 'X-Forwarded-For': '127.0.0.1' }), true), false);
  assert.equal(localAccess(req(undefined, { Host: 'attacker.example' }), true), false);
});
test('local MCP enforces 4 concurrent requests and 60 per minute including repeated calls', () => {
  let now = 0;
  const gate = budget(() => now);
  for (let i = 0; i < 4; i++) assert.equal(gate.enter(), true);
  assert.equal(gate.enter(), false);
  for (let i = 0; i < 4; i++) gate.leave();
  for (let i = 4; i < 60; i++) {
    assert.equal(gate.enter(), true);
    gate.leave();
  }
  assert.equal(gate.enter(), false);
  now = 60000;
  assert.equal(gate.enter(), true);
});
