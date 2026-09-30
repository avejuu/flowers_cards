import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/backup/route';
const deviceId = 'b0b895a3-cfe2-4fe7-9362-0c07b0e813b7';
const request = (body: unknown) => new Request('http://localhost/api/backup', { method: 'POST', body: JSON.stringify(body) });
test('unconfigured backup is optional', async () => {
  const previous = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
  try { const response = await POST(request({ action: 'load', deviceId })); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { enabled: false, cards: [] }); }
  finally { if (previous) process.env.DATABASE_URL = previous; }
});
test('invalid device identifiers are rejected', async () => { assert.equal((await POST(request({ action: 'load', deviceId: 'invalid' }))).status, 400); });
test('database connection failures are safe and do not expose credentials', async () => {
  const previous = process.env.DATABASE_URL; process.env.DATABASE_URL = 'postgresql://private-user:private-password@127.0.0.1:1/unavailable';
  try { const response = await POST(request({ action: 'load', deviceId })); assert.equal(response.status, 503); const data = await response.json(); assert.match(data.error, /lokalen Karten/); assert.doesNotMatch(data.error, /private|stack|ECONN/); }
  finally { if (previous) process.env.DATABASE_URL = previous; else delete process.env.DATABASE_URL; }
});
