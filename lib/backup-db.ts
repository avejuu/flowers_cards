import 'server-only';
import { Pool } from 'pg';
import { cardSchema, type FlowerCard } from './schemas';
import { ApiError } from './server';
let pool: Pool | undefined;
let ready: Promise<unknown> | undefined;
const schema = `CREATE TABLE IF NOT EXISTS flower_cards_backup (
 id UUID PRIMARY KEY, device_id UUID NOT NULL, german_name TEXT NOT NULL, english_name TEXT NOT NULL,
 latin_name TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL, image_source TEXT NOT NULL,
 image_source_page TEXT, image_author TEXT NOT NULL, image_license TEXT, haltbarkeit TEXT NOT NULL,
 kombiniert_mit TEXT NOT NULL, verarbeitung TEXT NOT NULL, verwendung TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, card_data JSONB NOT NULL, deleted_at TIMESTAMPTZ);
 CREATE INDEX IF NOT EXISTS flower_cards_backup_device_idx ON flower_cards_backup(device_id);`;
export async function database() {
  if (!pool) { pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 8000, query_timeout: 10000, idleTimeoutMillis: 10000 }); pool.on('error', () => { /* Handled by the next API request; never expose credentials. */ }); }
  if (!ready) ready = pool.query(schema).catch(error => { ready = undefined; throw error; });
  await ready; return pool;
}
export async function readBackup(deviceId: string) {
  const db = await database();
  const result = await db.query('SELECT card_data FROM flower_cards_backup WHERE device_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [deviceId]);
  return result.rows.map(row => cardSchema.parse(row.card_data));
}
export async function writeBackup(deviceId: string, card: FlowerCard) {
  const db = await database();
  const result = await db.query(`INSERT INTO flower_cards_backup
    (id, device_id, german_name, english_name, latin_name, image_url, image_source, image_source_page, image_author, image_license, haltbarkeit, kombiniert_mit, verarbeitung, verwendung, created_at, updated_at, card_data)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (id) DO UPDATE SET german_name=EXCLUDED.german_name, english_name=EXCLUDED.english_name,
    latin_name=EXCLUDED.latin_name, image_url=EXCLUDED.image_url, image_source=EXCLUDED.image_source,
    image_source_page=EXCLUDED.image_source_page, image_author=EXCLUDED.image_author, image_license=EXCLUDED.image_license,
    haltbarkeit=EXCLUDED.haltbarkeit, kombiniert_mit=EXCLUDED.kombiniert_mit, verarbeitung=EXCLUDED.verarbeitung,
    verwendung=EXCLUDED.verwendung, updated_at=EXCLUDED.updated_at, card_data=EXCLUDED.card_data
    WHERE flower_cards_backup.device_id=EXCLUDED.device_id AND flower_cards_backup.deleted_at IS NULL
    AND flower_cards_backup.updated_at <= EXCLUDED.updated_at RETURNING id`,
    [card.id, deviceId, card.germanName, card.englishName, card.latinName, card.imageUrl, card.imageSource, card.imagePageUrl || null, card.imageAuthor ?? '', card.imageLicense || null, card.haltbarkeit, card.kombiniertMit, card.verarbeitung, card.verwendung, card.createdAt, card.updatedAt || card.createdAt, JSON.stringify(card)]);
  if (!result.rowCount) throw new ApiError(409, 'Die lokale Karte wurde gespeichert; die Sicherung enthält eine neuere oder gelöschte Version.');
}
export async function deleteBackup(deviceId: string, id: string) {
  const db = await database();
  // A tombstone also blocks an earlier save request that arrives after deletion.
  await db.query(`INSERT INTO flower_cards_backup (id,device_id,german_name,english_name,image_url,image_source,image_author,haltbarkeit,kombiniert_mit,verarbeitung,verwendung,created_at,updated_at,card_data,deleted_at)
    VALUES ($1,$2,'','','','','','','','','',NOW(),NOW(),'{}',NOW())
    ON CONFLICT (id) DO UPDATE SET deleted_at=NOW(),updated_at=NOW() WHERE flower_cards_backup.device_id=$2`, [id, deviceId]);
}
