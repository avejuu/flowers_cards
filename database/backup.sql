CREATE TABLE IF NOT EXISTS flower_cards_backup (
  id UUID PRIMARY KEY,
  device_id UUID NOT NULL,
  german_name TEXT NOT NULL,
  english_name TEXT NOT NULL,
  latin_name TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  image_source TEXT NOT NULL,
  image_source_page TEXT,
  image_author TEXT NOT NULL,
  image_license TEXT,
  haltbarkeit TEXT NOT NULL,
  kombiniert_mit TEXT NOT NULL,
  verarbeitung TEXT NOT NULL,
  verwendung TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  card_data JSONB NOT NULL,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS flower_cards_backup_device_idx ON flower_cards_backup(device_id);
