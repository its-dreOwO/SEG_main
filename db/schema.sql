-- Tech store schema. Applying this file drops and recreates every table.
CREATE EXTENSION IF NOT EXISTS unaccent;

DROP TABLE IF EXISTS search_postings, search_doc_stats, search_index_state, page_views, settings, system_logs, order_items, orders, flags, likes, ratings,
  comments, search_click_log, document_tags, tags, documents, categories, users,
  role_permissions, permissions, roles CASCADE;

-- unaccent() is only STABLE, so wrap it to use it in a generated column.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE TABLE roles (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);
CREATE TABLE permissions (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);
CREATE TABLE role_permissions (
  role_id int NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id int NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  avatar text,
  bio text NOT NULL DEFAULT '',
  role_id int NOT NULL REFERENCES roles(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id serial PRIMARY KEY,
  name text NOT NULL,
  name_vi text,
  slug text NOT NULL UNIQUE
);

CREATE TABLE documents (
  id serial PRIMARY KEY,
  kind text NOT NULL DEFAULT 'product' CHECK (kind IN ('product', 'article')),
  title text NOT NULL,
  title_vi text,
  slug text NOT NULL UNIQUE,
  content text NOT NULL DEFAULT '',
  content_vi text,
  summary text NOT NULL DEFAULT '',
  summary_vi text,
  category_id int REFERENCES categories(id) ON DELETE SET NULL,
  author text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  views_count int NOT NULL DEFAULT 0,
  price numeric(10, 2),
  compare_at_price numeric(10, 2),
  stock int NOT NULL DEFAULT 0,
  brand text,
  image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  seo_title text,
  seo_description text,
  seo_keywords text,
  image_alt text,
  document_search text GENERATED ALWAYS AS (
    lower(f_unaccent(
      coalesce(title, '') || ' ' || coalesce(title_vi, '') || ' ' ||
      coalesce(summary, '') || ' ' || coalesce(summary_vi, '') || ' ' ||
      coalesce(content, '') || ' ' || coalesce(content_vi, '')
    ))
  ) STORED
);
CREATE INDEX documents_category_idx ON documents (category_id);
CREATE INDEX documents_status_created_idx ON documents (status, created_at DESC);

CREATE TABLE tags (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE
);
CREATE TABLE document_tags (
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id int NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  added_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, tag_id)
);

CREATE INDEX document_tags_tag_idx ON document_tags (tag_id);

CREATE TABLE search_click_log (
  id serial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  query_string text NOT NULL DEFAULT '',
  clicked_doc_id int REFERENCES documents(id) ON DELETE SET NULL,
  result_count int,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  -- Phase 2 search engine. A search row has result_count, the ids shown on that page (result_ids, in rank order),
  -- the offset of that page and the sort used. A click row links back to its search (search_id) and stores the
  -- 1-based rank the clicked document had in that result list.
  result_ids int[],
  result_offset int,
  sort text,
  search_id int REFERENCES search_click_log(id) ON DELETE SET NULL,
  clicked_rank int
);
CREATE INDEX search_click_log_ts_idx ON search_click_log ("timestamp");
CREATE INDEX search_click_log_search_idx ON search_click_log (search_id);

CREATE TABLE page_views (
  id serial PRIMARY KEY,
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX page_views_viewed_idx ON page_views (viewed_at);

CREATE TABLE comments (
  id serial PRIMARY KEY,
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id int REFERENCES comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'pending', 'spam')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_document_idx ON comments (document_id);
CREATE INDEX comments_parent_idx ON comments (parent_id);

CREATE TABLE ratings (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  value int NOT NULL CHECK (value BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id)
);
CREATE TABLE likes (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id)
);

CREATE TABLE flags (
  id serial PRIMARY KEY,
  comment_id int NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reporter_id int REFERENCES users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  resolution text,
  resolved_by int REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flags_comment_idx ON flags (comment_id);
CREATE UNIQUE INDEX flags_one_per_reporter_idx ON flags (comment_id, reporter_id);

CREATE TABLE orders (
  id serial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  client_token text NOT NULL,
  status text NOT NULL DEFAULT 'placed',
  total numeric(10, 2) NOT NULL,
  customer_name text NOT NULL,
  address text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_token)
);
CREATE TABLE order_items (
  id serial PRIMARY KEY,
  order_id int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  document_id int REFERENCES documents(id) ON DELETE SET NULL,
  title text NOT NULL,
  unit_price numeric(10, 2) NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE system_logs (
  id serial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- Phase 2 search engine: an inverted index over published documents (see server/src/search/).
-- search_postings is the inverted index: for each term, the documents containing it and the (field-weighted)
-- term frequency. search_doc_stats holds each document's length in tokens, for BM25 length normalisation.
-- No foreign keys on purpose: the index is rebuilt as a whole, and FKs here could deadlock with a document delete.
CREATE TABLE search_postings (
  term text COLLATE "C" NOT NULL,
  doc_id int NOT NULL,
  tf int NOT NULL CHECK (tf > 0),
  PRIMARY KEY (term, doc_id)
);
CREATE INDEX search_postings_doc_idx ON search_postings (doc_id);
CREATE TABLE search_doc_stats (
  doc_id int PRIMARY KEY,
  length int NOT NULL
);
-- One row. dirty = true means the indexed text changed and the index must be rebuilt before the next search.
CREATE TABLE search_index_state (
  id int PRIMARY KEY CHECK (id = 1),
  dirty boolean NOT NULL DEFAULT true,
  built_at timestamptz,
  doc_count int NOT NULL DEFAULT 0,
  term_count int NOT NULL DEFAULT 0
);
INSERT INTO search_index_state (id, dirty) VALUES (1, true);

CREATE OR REPLACE FUNCTION search_index_mark_dirty() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE search_index_state SET dirty = true WHERE id = 1 AND NOT dirty;
  RETURN NULL;
END $$;
-- Only columns that feed the index mark it dirty, so view counters and stock changes do not trigger rebuilds.
CREATE TRIGGER documents_search_dirty AFTER INSERT OR DELETE OR TRUNCATE ON documents
  FOR EACH STATEMENT EXECUTE FUNCTION search_index_mark_dirty();
CREATE TRIGGER documents_search_dirty_upd AFTER UPDATE OF title, title_vi, summary, summary_vi, content, content_vi,
  brand, status, category_id ON documents FOR EACH STATEMENT EXECUTE FUNCTION search_index_mark_dirty();
CREATE TRIGGER document_tags_search_dirty AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON document_tags
  FOR EACH STATEMENT EXECUTE FUNCTION search_index_mark_dirty();
CREATE TRIGGER tags_search_dirty AFTER UPDATE OF name OR DELETE ON tags
  FOR EACH STATEMENT EXECUTE FUNCTION search_index_mark_dirty();
CREATE TRIGGER categories_search_dirty AFTER UPDATE OF name, name_vi OR DELETE ON categories
  FOR EACH STATEMENT EXECUTE FUNCTION search_index_mark_dirty();
