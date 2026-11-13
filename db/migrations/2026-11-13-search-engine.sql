-- Phase 2 search engine: inverted index tables, dirty-flag triggers, and click-log columns for evaluation.
-- Additive and idempotent: safe to run twice, keeps all existing data. The index builds itself on the first search.
-- Run: psql "$DATABASE_URL" -f db/migrations/2026-11-13-search-engine.sql
BEGIN;

-- 1. Click log: link clicks to their search and record ranks
ALTER TABLE search_click_log
  ADD COLUMN IF NOT EXISTS result_ids int[],
  ADD COLUMN IF NOT EXISTS result_offset int,
  ADD COLUMN IF NOT EXISTS sort text,
  ADD COLUMN IF NOT EXISTS search_id int REFERENCES search_click_log(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clicked_rank int;
CREATE INDEX IF NOT EXISTS search_click_log_search_idx ON search_click_log (search_id);

-- 2. Inverted index
CREATE TABLE IF NOT EXISTS search_postings (
  term text COLLATE "C" NOT NULL,
  doc_id int NOT NULL,
  tf int NOT NULL CHECK (tf > 0),
  PRIMARY KEY (term, doc_id)
);
CREATE INDEX IF NOT EXISTS search_postings_doc_idx ON search_postings (doc_id);
CREATE TABLE IF NOT EXISTS search_doc_stats (
  doc_id int PRIMARY KEY,
  length int NOT NULL
);
CREATE TABLE IF NOT EXISTS search_index_state (
  id int PRIMARY KEY CHECK (id = 1),
  dirty boolean NOT NULL DEFAULT true,
  built_at timestamptz,
  doc_count int NOT NULL DEFAULT 0,
  term_count int NOT NULL DEFAULT 0
);
INSERT INTO search_index_state (id, dirty) VALUES (1, true) ON CONFLICT (id) DO UPDATE SET dirty = true;

-- 3. Triggers that mark the index dirty when indexed text changes
CREATE OR REPLACE FUNCTION search_index_mark_dirty() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE search_index_state SET dirty = true WHERE id = 1 AND NOT dirty;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS documents_search_dirty ON documents;
CREATE TRIGGER documents_search_dirty AFTER INSERT OR DELETE OR TRUNCATE ON documents
  FOR EACH STATEMENT EXECUTE FUNCTION search_index_mark_dirty();
DROP TRIGGER IF EXISTS documents_search_dirty_upd ON documents;
CREATE TRIGGER documents_search_dirty_upd AFTER UPDATE OF title, title_vi, summary, summary_vi, content, content_vi,
  brand, status, category_id ON documents FOR EACH STATEMENT EXECUTE FUNCTION search_index_mark_dirty();
DROP TRIGGER IF EXISTS document_tags_search_dirty ON document_tags;
CREATE TRIGGER document_tags_search_dirty AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON document_tags
  FOR EACH STATEMENT EXECUTE FUNCTION search_index_mark_dirty();
DROP TRIGGER IF EXISTS tags_search_dirty ON tags;
CREATE TRIGGER tags_search_dirty AFTER UPDATE OF name OR DELETE ON tags
  FOR EACH STATEMENT EXECUTE FUNCTION search_index_mark_dirty();
DROP TRIGGER IF EXISTS categories_search_dirty ON categories;
CREATE TRIGGER categories_search_dirty AFTER UPDATE OF name, name_vi OR DELETE ON categories
  FOR EACH STATEMENT EXECUTE FUNCTION search_index_mark_dirty();

COMMIT;
