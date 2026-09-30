import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
const workspace = process.cwd();
let temporary = '';
test.before(async () => { temporary = await mkdtemp('/tmp/flower-api-tests-'); process.chdir(temporary); });
test.after(async () => { process.chdir(workspace); await rm(temporary, { recursive: true }); });
test.beforeEach(async () => { await rm(path.join(temporary, '.data'), { recursive: true, force: true }); });
import { POST as search } from '../app/api/search/route';
import { POST as card } from '../app/api/card/route';
const identity = { germanName: 'Strandflieder', englishName: 'Sea lavender', latinName: 'Limonium' };
const info = { haltbarkeit: '7–14 Tage', kombiniertMit: 'Rosen', verarbeitung: 'Stiele anschneiden.', verwendung: 'Beiwerk' };
const request = (body: unknown) => new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });
const model = (value: unknown) => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
const originalFetch = global.fetch;
test.afterEach(() => { global.fetch = originalFetch; delete process.env.GEMINI_API_KEY; delete process.env.PIXABAY_API_KEY; });
function keys() { process.env.GEMINI_API_KEY = 'test-not-a-real-key'; process.env.PIXABAY_API_KEY = 'test-not-a-real-key'; }
test('empty name rejected before requests', async () => { const result = await search(request({ name: ' ' })); assert.equal(result.status, 400); });
test('missing keys reported safely', async () => { const result = await search(request({ name: 'Rose' })); assert.equal(result.status, 503); assert.match((await result.json()).error, /GEMINI_API_KEY/); });
test('unknown flower rejected without Pixabay request', async () => { keys(); global.fetch = async () => model({ germanName: '', englishName: '', latinName: '', isValidPlant: false }); const result = await search(request({ name: 'Unbekannt' })); assert.equal(result.status, 422); });
test('English search falls back to Latin with attribution retained', async () => {
  keys(); const queries: string[] = [];
  global.fetch = async (input) => { const url = String(input); if (url.includes('googleapis')) return model({ ...identity, isValidPlant: true }); if (url.includes('commons.wikimedia.org')) return Response.json({ query: { pages: {} } }); queries.push(new URL(url).searchParams.get('q')!); return Response.json({ hits: queries.length === 1 ? [] : Array.from({ length: 6 }, (_, i) => ({ id: i + 1, largeImageURL: `https://cdn.pixabay.com/photo/${i + 1}/large.jpg`, webformatURL: `https://cdn.pixabay.com/photo/${i + 1}/medium.jpg`, user: 'Anna', user_id: 1, pageURL: 'https://pixabay.com/photos/1/', tags: 'Flower' })) }); };
  const result = await search(request({ name: 'Strandflieder' })); assert.equal(result.status, 200); const data = await result.json(); assert.deepEqual(queries, ['Sea lavender', 'Limonium']); assert.equal(data.photos[0].imageAuthor, 'Anna');
});
test('no photos is a recoverable empty result', async () => { keys(); global.fetch = async input => String(input).includes('googleapis') ? model({ ...identity, isValidPlant: true }) : String(input).includes('commons.wikimedia.org') ? Response.json({ query: { pages: {} } }) : Response.json({ hits: [] }); const result = await search(request({ name: 'Strandflieder' })); assert.equal(result.status, 200); assert.deepEqual((await result.json()).photos, []); });
test('rate limit and network errors become understandable messages', async () => { keys(); global.fetch = async () => new Response('', { status: 429 }); assert.equal((await search(request({ name: 'Rose' }))).status, 429); global.fetch = async () => { throw new Error('private stack'); }; const result = await search(request({ name: 'Rose' })); assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(await result.json()), /private stack/); });
test('invalid model JSON rejected', async () => { keys(); global.fetch = async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{bad}' }] } }] }); assert.equal((await card(request({ action: 'generate', identity }))).status, 502); });
test('generate and explicit verification use current fields and preserve identity', async () => { keys(); let sent = ''; global.fetch = async (_input, init) => { sent = String(init?.body); return model({ ...identity, ...info, haltbarkeit: '10–14 Tage' }); }; const generated = await card(request({ action: 'generate', identity })); assert.equal(generated.status, 200); const checked = await card(request({ action: 'verify', identity, info })); assert.equal(checked.status, 200); assert.match(sent, /7–14 Tage/); assert.equal((await checked.json()).haltbarkeit, '10–14 Tage'); });
test('insufficient results trigger broader query, merge unique IDs, and cache for repeat searches', async () => {
  keys(); const queries: string[] = [];
  global.fetch = async input => {
    const url = String(input); if (url.includes('googleapis')) return model({ ...identity, isValidPlant: true });
    const query = new URL(url).searchParams.get('q')!; queries.push(query);
    return Response.json({ hits: Array.from({ length: query.endsWith(' flower') ? 8 : 1 }, (_, i) => ({ id: i + 1, largeImageURL: `https://cdn.pixabay.com/photo/${i + 1}/large.jpg`, webformatURL: `https://cdn.pixabay.com/photo/${i + 1}/medium.jpg`, user: 'Anna', user_id: 1, pageURL: 'https://pixabay.com/photos/1/', tags: 'Flower' })) });
  };
  const first = await search(request({ name: 'Strandflieder' })); assert.equal(first.status, 200); assert.equal((await first.json()).photos.length, 8);
  assert.deepEqual(queries, ['Sea lavender', 'Limonium', 'Sea lavender flower']);
  const repeated = await search(request({ name: 'Strandflieder' })); assert.equal(repeated.status, 200); assert.equal(queries.length, 3);
});
test('Pixabay rate limits, invalid key, unavailability and network errors are safe', async () => {
  keys();
  for (const status of [429, 400, 503, 0]) {
    global.fetch = async input => { if (String(input).includes('googleapis')) return model({ ...identity, isValidPlant: true }); if (status === 0) throw new Error('private key / stack'); return new Response('secret details', { status }); };
    const result = await search(request({ name: 'Strandflieder' })); assert.equal(result.status, 503); const error = (await result.json()).error; assert.match(error, /Pixabay/); assert.doesNotMatch(error, /secret|private/);
  }
});

test('all Gemini flows use the required model despite a stale environment override', async () => {
  keys(); const previousModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = 'obsolete-model';
  const requests: string[] = [];
  global.fetch = async (input, init) => {
    const url = String(input);
    if (!url.includes('googleapis')) return Response.json({ hits: [] });
    requests.push(url);
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'test-not-a-real-key');
    assert.ok(!url.includes('test-not-a-real-key'));
    const body = JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.ok(body.generationConfig.responseJsonSchema);
    assert.equal(body.generationConfig.thinkingConfig, undefined);
    return model({ ...identity, ...info, isValidPlant: true });
  };
  try {
    assert.equal((await search(request({ name: 'Rose' }))).status, 200);
    assert.equal((await card(request({ action: 'generate', identity }))).status, 200);
    assert.equal((await card(request({ action: 'verify', identity, info }))).status, 200);
    assert.equal(requests.length, 3);
  } finally {
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
});

const plants = [
  ['Einblatt', 'Peace lily', 'Spathiphyllum'], ['Spathiphyllum', 'Peace lily', 'Spathiphyllum'],
  ['Orchidee', 'Orchid', 'Orchidaceae'], ['Anthurie', 'Anthurium', 'Anthurium'],
  ['Rose', 'Rose', 'Rosa'], ['Tulpe', 'Tulip', 'Tulipa'], ['Eukalyptus', 'Eucalyptus', 'Eucalyptus'],
  ['Monstera', 'Monstera', 'Monstera'], ['Schleierkraut', 'Baby’s breath', 'Gypsophila'],
  ['Hortensie', 'Hydrangea', 'Hydrangea'], ['Lavendel', 'Lavender', 'Lavandula'], ['Geranie', 'Geranium', 'Pelargonium']
];
for (const [name, englishName, latinName] of plants) test(`recognition and card generation accept ${name}`, async () => {
  keys(); const plant = { germanName: name === 'Spathiphyllum' ? 'Einblatt' : name, englishName, latinName };
  global.fetch = async (input, init) => {
    if (String(input).includes('googleapis')) {
      const body = JSON.parse(String(init?.body)); const prompt = body.contents[0].parts[0].text;
      if (prompt.includes('Bestimme')) { assert.match(prompt, /Zimmerpflanzen/); assert.match(prompt, /keine typischen Schnittblumen/); assert.ok(body.generationConfig.responseJsonSchema.properties.isValidPlant); }
      return model({ ...plant, ...info, isValidPlant: true });
    }
    if (String(input).includes('commons.wikimedia.org')) return Response.json({ query: { pages: {} } });
    return Response.json({ hits: [] });
  };
  const result = await search(request({ name })); assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).identity, plant);
  assert.equal((await card(request({ action: 'generate', identity: plant }))).status, 200);
  assert.equal((await card(request({ action: 'verify', identity: plant, info }))).status, 200);
});

test('Wikimedia fallback uses botanical name and preserves plain attribution and license', async () => {
  keys(); const queries: string[] = [];
  global.fetch = async input => {
    const url = String(input);
    if (url.includes('googleapis')) return model({ ...identity, isValidPlant: true });
    if (url.includes('pixabay.com')) return Response.json({ hits: [] });
    queries.push(new URL(url).searchParams.get('gsrsearch')!);
    return Response.json({ query: { pages: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, { pageid: i + 1, title: 'File:Plant.jpg', index: i, imageinfo: [{ url: `https://upload.wikimedia.org/wikipedia/commons/a/plant${i}.jpg`, thumburl: `https://thumb.wikimedia.org/wikipedia/commons/a/thumb${i}.jpg`, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Plant.jpg', mime: 'image/jpeg', extmetadata: { CommonsMetadataExtension: { value: 1.2 }, Artist: { value: '<a href="evil">Artist</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' } } }] }])) } });
  };
  const result = await search(request({ name: 'Strandflieder' })); assert.equal(result.status, 200);
  const data = await result.json(); assert.deepEqual(queries, ['Limonium']); assert.equal(data.photos.length, 8); assert.equal(data.photos[0].source, 'wikimedia'); assert.equal(data.photos[0].author, 'Artist'); assert.equal(data.photos[0].license, 'CC BY-SA 4.0');
});
