-- Tech store schema. Applying this file drops and recreates every table.
CREATE EXTENSION IF NOT EXISTS unaccent;

DROP TABLE IF EXISTS page_views, settings, system_logs, order_items, orders, flags, likes, ratings,
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

CREATE TABLE search_click_log (
  id serial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  query_string text NOT NULL DEFAULT '',
  clicked_doc_id int REFERENCES documents(id) ON DELETE SET NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_click_log_ts_idx ON search_click_log ("timestamp");

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
