import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { POST } from '../app/api/images/route';
import { GET } from '../app/api/images/[filename]/route';
import { IMAGE_DIR } from '../lib/image-files';
const url = 'https://cdn.pixabay.com/photo/flower-cards-test-only-87654321.jpg';
const hash = createHash('sha256').update(url).digest('hex');
const filepath = `${IMAGE_DIR}/${hash}.jpg`;
const originalFetch = global.fetch;
test.afterEach(() => { global.fetch = originalFetch; });
test.after(async () => { await rm(filepath, { force: true }); });
test('selected image is downloaded once, stored locally and served after reload', async () => {
  await rm(filepath, { force: true });
  let calls = 0; const jpeg = Buffer.from([255,216,255,224,0,16,74,70,73,70]);
  global.fetch = async () => { calls++; return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } }); };
  const request = () => new Request('http://localhost/api/images', { method: 'POST', body: JSON.stringify({ imageUrl: url }) });
  const first = await POST(request()); assert.equal(first.status, 200); assert.equal((await first.json()).imageUrl, `/api/images/${hash}.jpg`);
  assert.deepEqual(await readFile(filepath), jpeg);
  assert.equal((await POST(request())).status, 200); assert.equal(calls, 1);
  const served = await GET(new Request('http://localhost'), { params: Promise.resolve({ filename: `${hash}.jpg` }) }); assert.equal(served.status, 200); assert.equal(served.headers.get('Content-Type'), 'image/jpeg');
});
test('download rejects foreign hosts and serving rejects traversal', async () => {
  const result = await POST(new Request('http://localhost/api/images', { method: 'POST', body: JSON.stringify({ imageUrl: 'https://evil.example/image.jpg' }) })); assert.equal(result.status, 400);
  const served = await GET(new Request('http://localhost'), { params: Promise.resolve({ filename: '../secret' }) }); assert.equal(served.status, 404);
});
test('download failure is recoverable and does not leak upstream errors', async () => {
  global.fetch = async () => { throw new Error('secret'); };
  const response = await POST(new Request('http://localhost/api/images', { method: 'POST', body: JSON.stringify({ imageUrl: 'https://cdn.pixabay.com/photo/test-failure.jpg' }) })); assert.equal(response.status, 503); assert.doesNotMatch((await response.json()).error, /secret/);
});

for (const host of ['cdn.pixabay.com', 'upload.wikimedia.org']) test(`validated redirects and persisted copy for ${host}`, async () => {
  const source = `https://${host}/flower-cards-redirect-test.png`;
  const filename = createHash('sha256').update(source).digest('hex') + '.png';
  await rm(`${IMAGE_DIR}/${filename}`, { force: true });
  const png = Buffer.from([137,80,78,71,13,10,26,10]);
  const targets: string[] = [];
  global.fetch = async (input, init) => {
    targets.push(String(input)); assert.equal(init?.redirect, 'manual');
    return targets.length === 1 ? new Response(null, { status: 302, headers: { location: `https://${host}/final.png` } }) : new Response(png, { headers: { 'Content-Type': 'image/png' } });
  };
  try {
    const response = await POST(new Request('http://localhost/api/images', { method: 'POST', body: JSON.stringify({ imageUrl: source }) }));
    assert.equal(response.status, 200); assert.equal((await response.json()).imageUrl, `/api/images/${filename}`);
    assert.equal(targets.length, 2);
    const served = await GET(new Request('http://localhost'), { params: Promise.resolve({ filename }) });
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
  } finally { await rm(`${IMAGE_DIR}/${filename}`, { force: true }); }
});
test('redirect to a private or foreign host is never fetched', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }); };
  const response = await POST(new Request('http://localhost/api/images', { method: 'POST', body: JSON.stringify({ imageUrl: 'https://cdn.pixabay.com/unsafe-redirect.jpg' }) }));
  assert.equal(response.status, 503); assert.equal(calls, 1);
});
test('credentials, arbitrary subdomains, query keys and unsupported protocols are rejected before fetch', async () => {
  global.fetch = async () => { assert.fail('Invalid URL was fetched'); };
  for (const imageUrl of ['not a URL', 'http://cdn.pixabay.com/a.jpg', 'https://user:pass@cdn.pixabay.com/a.jpg', 'https://evil.pixabay.com/a.jpg', 'https://cdn.pixabay.com:8443/a.jpg', 'https://cdn.pixabay.com/a.jpg?key=secret', 'https://pixabay.com/api/']) {
    const response = await POST(new Request('http://localhost/api/images', { method: 'POST', body: JSON.stringify({ imageUrl }) })); assert.equal(response.status, 400);
  }
});
test('upstream HTTP status is logged safely while the response stays generic', async () => {
  const originalError = console.error; const entries: unknown[][] = [];
  console.error = (...args) => { entries.push(args); };
  global.fetch = async () => new Response('upstream private body', { status: 403 });
  try {
    const response = await POST(new Request('http://localhost/api/images', { method: 'POST', body: JSON.stringify({ imageUrl: 'https://cdn.pixabay.com/forbidden-test.jpg' }) }));
    assert.equal(response.status, 503);
    assert.match(JSON.stringify(entries), /HTTP 403/); assert.doesNotMatch(JSON.stringify(entries), /private body/);
  } finally { console.error = originalError; }
});
test('Wikimedia tracking parameters are accepted and error logs redact API keys and URLs', async () => {
  const { downloadableImageUrl } = await import('../lib/schemas');
  const { imageErrorMessage } = await import('../lib/image-errors');
  assert.equal(downloadableImageUrl.safeParse('https://upload.wikimedia.org/wikipedia/commons/a/rose.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original').success, true);
  const message = imageErrorMessage(new Error('fetch https://example.com/?key=private-key failed; token=token-secret private-key'), ['private-key']);
  assert.doesNotMatch(message, /private-key|token-secret|example.com/);
  assert.match(message, /failed/);
});
