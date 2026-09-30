# Blumenkarten

The existing German flower-card app accepts flowers, houseplants, decorative greenery and ornamental plants. Gemini normalizes German/English/botanical names using **gemini-3.5-flash-lite** for identification, generation and optional verification. English and botanical names improve image search; German remains the main card name.

## Run

Use Node.js 22 LTS:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Put credentials in **`.env.local` in the project root**, beside `package.json`:

```dotenv
GEMINI_API_KEY=your_gemini_key
PIXABAY_API_KEY=your_pixabay_key
DATABASE_URL=postgresql://USER:PASSWORD@YOUR-NEON-HOST/DATABASE?sslmode=require
```

Copy the PostgreSQL connection string from your Neon project (a pooled connection string is suitable). `DATABASE_URL` is optional. Restart Next.js after changing environment variables; configure the same server-only variables in your hosting dashboard when deploying. None of these variables has a `NEXT_PUBLIC_` prefix or is sent to the browser. Do not replace an existing `.env.local` containing your keys.

Open http://localhost:3000. Production: `npm run build`, then `npm start`.

## Card flow and images

Enter a German or botanical plant name → identify a real plant → search images → manually choose an image → generate four editable German fields → optionally click **Informationen prüfen** → save. The card retains its two-sided flip design and the four fields Haltbarkeit, Kombiniert sich mit, Verarbeitung and Verwendung.

Pixabay is primary: English name, botanical name, then `<english name> flower`. When fewer than six distinct usable photos are available, Wikimedia Commons searches botanical, English, then German names. Up to eight choices are displayed. No image is automatically selected. The provider modules return shared photo metadata, including lowercase `source` (`pixabay` or `wikimedia`), `sourcePageUrl`, `author` and `license`. Compatibility fields preserve the existing UI and old saved cards.

Wikimedia results include plain-text author/license attribution and source-page links; files without license metadata or supported raster image types are excluded. Attribution remains visible after saving. Inspect the original source page for full license details. See [MediaWiki imageinfo documentation](https://www.mediawiki.org/wiki/API:Imageinfo).

Pixabay searches are cached for 24 hours in `.data/pixabay`. After saving locally, selected Pixabay images are downloaded to `.data/images`, with HTTPS host checks, file-signature checks and size limits. Failed downloads do not prevent local card saving and show a small warning. Keep `.data/images` on persistent storage when deploying: PostgreSQL backs up card records and image metadata, **not image file bytes**. Existing Pixabay/Pexels cards remain readable.

## Local storage and optional PostgreSQL backup

**localStorage remains the primary storage.** Save and delete take effect locally first. Backup runs afterwards through `/api/backup`; failures show a small German warning and cannot block local saving. On startup, the app displays local cards immediately, then restores remote cards missing locally. Card IDs prevent duplicates; existing local edits take precedence. Locally saved cards are retried on the next visit. A failed remote delete is retried and local deletion markers prevent resurrection.

A random UUID is stored under `blumenkarten:deviceId` and reused. Cards use `blumenkarten:v1`; deletion markers use `blumenkarten:deleted`. There is no fingerprinting, login, profile or hardware collection. The device UUID identifies the backup collection: treat it as the recovery identifier. If all site data is cleared, that UUID is also lost; recovery requires restoring the original UUID. This is backup for the same device identifier, not account synchronization.

The server **automatically creates `flower_cards_backup` and its index** on the first configured backup request. No manual SQL is needed when the database role has table-creation permission. If it does not, run [database/backup.sql](database/backup.sql) once in the Neon SQL editor with an owner role and give the application's database role SELECT, INSERT and UPDATE permission. The table uses UUIDs, TIMESTAMPTZ timestamps and JSONB to preserve complete card metadata. `deleted_at` records deletion tombstones to prevent late requests from recreating deleted cards. The JSONB record supplements the individually named columns. Database access uses parameterized queries and a small [node-postgres pool](https://node-postgres.com/features/pooling).

## Test backup and restore

1. Set `DATABASE_URL` in `.env.local`, restart the app, create a card and save it.
2. In Neon SQL editor, run `SELECT id, device_id, german_name, deleted_at FROM flower_cards_backup;`. Confirm the new card appears with `deleted_at IS NULL`.
3. In browser DevTools → Application → Local Storage, note the `blumenkarten:deviceId` value. Remove **only** `blumenkarten:v1`, leaving the device ID and deletion markers intact. Reload. The missing cards should reappear and be written back to localStorage.
4. Edit a card, save, and confirm its backup columns and `card_data` update without inserting duplicates.
5. Use an unreachable database connection string temporarily, restart, and save another card. It should appear immediately, survive reload, and show only a small backup warning. Restore the working connection and reload to retry backup.
6. Delete a card while the database is unavailable. Reload and confirm it stays deleted. Restore the connection and reload: its backup should have a `deleted_at` timestamp and be excluded from recovery.

To recover after clearing **all** site data, set `localStorage.setItem('blumenkarten:deviceId', 'YOUR-PREVIOUS-UUID')` in the console before reloading. Without that previously saved UUID, the app cannot associate the new browser identifier with the old collection. Avoid clearing deletion markers during a failed-delete test.

## Validation

```bash
npm run typecheck
npm test
npx playwright install chromium webkit
# WebKit may also require: sudo npx playwright install-deps webkit
npm run dev
# In another terminal:
npm run test:e2e
```

API/storage tests cover the 12 requested plants, provider ordering, fallback, malformed JSON, unavailable services, unsafe URLs, legacy cards, merging and local deletion markers. PostgreSQL SQL is exercised against an embedded PostgreSQL engine (PGlite) for schema creation, upserts, recovery, ownership isolation, stale updates and deletion tombstones. Browser tests cover complete manual creation, editing, optional verification, flipping, local persistence with unavailable backup, simulated backup recovery and failed-delete retries.

Live validation accepted Einblatt, Spathiphyllum, Orchidee, Anthurie, Rose, Tulpe, Eukalyptus, Monstera, Schleierkraut, Hortensie, Lavendel and Geranie, each with eight Pixabay choices. Live Neon backup requires your `DATABASE_URL`; automated backup browser tests simulate the remote endpoint.

AI can make factual mistakes and image searches can show an incorrect species. Manual image selection, editable information and the separate optional check remain essential. Public deployment needs quota protection and persistent storage for downloaded images.

## Files changed for this update

Existing files updated:

- `app/page.tsx`
- `app/globals.css`
- `app/api/search/route.ts`
- `app/api/card/route.ts`
- `lib/schemas.ts`
- `lib/server.ts`
- `lib/image-provider.ts`
- `lib/storage.ts`
- `.env.example`
- `package.json`
- `package-lock.json`
- `README.md`
- `tests/api.test.ts`
- `tests/core.test.ts`
- `tests/browser/cards.spec.ts`

New files:

- `lib/wikimedia-provider.ts`
- `lib/backup-db.ts`
- `lib/backup-client.ts`
- `app/api/backup/route.ts`
- `database/backup.sql`
- `tests/backup.test.ts`
- `tests/backup-postgres.test.ts`
