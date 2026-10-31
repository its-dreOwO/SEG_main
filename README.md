# Volt: Tech Store

Volt is an online tech store (phones, laptops, headphones, monitors and more) with a catalogue of 100+ seeded products and articles, a working cart and mock checkout, user engagement features, and a role-based admin area. It is Phase 1 of a coursework project (SEG, slot 16); the data is shaped so a real search engine can be added in Phase 2.

- Live site: https://shop.kodingkat.xyz
- Repository: https://github.com/its-dreOwO/SEG_slot16 (private)
- Demo logins are given in the separate submission note, not in this repository.

## Stack

| Layer | Choice |
|---|---|
| Front end | React 19, React Router 7, Vite, GSAP for motion, hand-written CSS (no gradients), English and Vietnamese |
| Back end | Node.js, Express 4, REST JSON API under `/api`, JWT in an httpOnly cookie, bcrypt password hashes, rate limiting |
| Database | PostgreSQL 16 (Amazon RDS in production), accessed with `pg` |
| Hosting | One VPS: Caddy serves the built front end and proxies `/api/*` to a systemd service (`shop-api`) |
| Tests | Node test runner (server, against a real Postgres), Vitest (web) |

## Architecture

```
Browser --https--> Caddy (shop.kodingkat.xyz)
                     |-- /api/*  --> Express (127.0.0.1:4000) --> PostgreSQL (RDS, TLS verified)
                     `-- /*      --> static React build (SPA fallback to index.html)
```

- `server/src/app.js` wires the middleware and routes. `routes/catalog.js` (listing, detail, categories, tags, public settings), `routes/auth.js` (register, login, logout, profile), `routes/engagement.js` (comments, ratings, likes, tags, flags, search click log), `routes/orders.js` (checkout, order history), and `routes/admin/*` (users and roles, content and taxonomy, moderation, SEO and analytics).
- Access control is permission based. Roles map to permissions in the database and every admin route checks the permission it needs, so the UI hiding a menu is never the only guard.
- `web/src/pages` holds the storefront, `web/src/admin` the admin area, `web/src/locales.js` the EN/VI strings (prices switch between USD and VND with the language).
- `deploy/` holds `deploy.sh` (build, upload over ssh, restart), `shop-api.service` and `Caddyfile.shop`.

## Local setup

Requirements: Node 20+, a PostgreSQL 16 database (Docker is the easiest way).

```bash
# 1. a throwaway database
docker run -d --name shop-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=shop -p 55433:5432 postgres:16

# 2. install
(cd server && npm ci)
(cd web && npm ci)

# 3. seed (see below), then run the API
export DATABASE_URL=postgres://postgres:dev@127.0.0.1:55433/shop
(cd server && npm start)            # http://127.0.0.1:4000, GET /api/health

# 4. run the web app (Vite dev server, proxies /api to port 4000)
(cd web && npm run dev)             # http://127.0.0.1:5173
```

Tests:

```bash
docker run -d --name shop-pg-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=shop_test -p 55432:5432 postgres:16
(cd server && TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/shop_test npm test)
(cd web && npm test)
```

## Seeding

From the repository root (it reuses `server/node_modules`):

```bash
SEED_PASSWORD='choose-a-password' DATABASE_URL=postgres://... node db/seed.js --reset
```

- `--reset` is required. The script drops and recreates every table, so it is destructive; it refuses to run without the flag. Never run it against a database holding data you want to keep.
- `SEED_PASSWORD` is the password given to every demo account. It is read from the environment only and is not stored in the repository.
- The seed creates the roles and permissions, demo staff (one account per admin role) and customers, 8 categories, around 100 realistic products with English and Vietnamese titles and summaries, articles, tags, comments, ratings, likes, flags, sample orders and search/click history. No Lorem Ipsum.
- For the test database: `NODE_ENV=test TEST_DATABASE_URL=... SEED_PASSWORD=x node db/seed.js --reset`.

## Schema overview

Defined in `db/schema.sql`.

| Table | Purpose |
|---|---|
| `roles`, `permissions`, `role_permissions`, `users` | Accounts and role-based access control |
| `categories` | Product categories (EN and VI names) |
| `documents` | The Phase 2 documents table: id, title, content, summary, category_id, author, created_at, views_count, plus price, stock, brand, image, status (draft/published), SEO fields, and a generated, accent-folded `document_search` column. `kind` is `product` or `article` |
| `tags`, `document_tags` | Tags and the many-to-many link (with who added the tag) |
| `search_click_log` | Phase 2 log: user_id, query_string, clicked_doc_id, timestamp (plus result_count) |
| `page_views` | One row per view, feeding the analytics dashboard |
| `comments`, `ratings`, `likes`, `flags` | User engagement and moderation |
| `orders`, `order_items` | Mock checkout |
| `system_logs`, `settings` | Audit trail and global settings (admin) |

## Deployment

`./deploy/deploy.sh` builds `web/`, uploads the build and `server/` over ssh, runs `npm ci --omit=dev` and restarts `shop-api`. Secrets (database URL, JWT secret, CA bundle path) live only in `/etc/shop-api.env` on the server. Caddy terminates TLS and sends security headers including a strict Content-Security-Policy. The database is Amazon RDS and incurs ongoing cost while it runs.

## Requirements to feature mapping

| Requirement | Where it is met |
|---|---|
| Backend: REST API | Express REST API under `/api` (`server/src`) |
| Database: RDBMS | PostgreSQL 16 on RDS (`db/schema.sql`) |
| Frontend: responsive web UI | React SPA, checked at 1280 and 390 px wide |
| Version control | Git, GitHub repository above |
| Home and directory: paginated latest items with snippets | Home (new arrivals) and `/shop`: 12 per page with pager, summary snippets on cards and hero |
| Detail view: content, images, metadata | `/product/:slug` and `/article/:slug`: full content, image, author, date, view count, category, tags |
| Registration, login, profile management | `/register`, `/login`, `/profile` (name, bio, password, order history) |
| Commenting, rating/liking, user tagging | On the detail page: comments (with flagging), 1 to 5 star rating, like, and logged-in users add tags |
| Keyword search (LIKE) | `/search?q=`, case and accent insensitive over title, summary and content, so `tai nghe` finds headphones; clicks are logged |
| Filters: category, tag, date range | Filter panel on `/shop` and `/search` (also price and sort) |
| Super Admin | `/admin/users`, `/admin/roles` (permissions), `/admin/logs`, `/admin/settings` |
| Content Manager | `/admin/content` (create, edit, delete, publish/unpublish), `/admin/taxonomy` (categories, tags) |
| Moderator | `/admin/moderation`: hide/approve/spam comments, resolve flags |
| Data and SEO Specialist | `/admin/seo` (titles, descriptions, keywords, alt text), `/admin/analytics` |
| Documents table fields | `documents` table in `db/schema.sql` |
| Search and click log fields | `search_click_log` table |
| Seed data of 50 to 100+ records, no Lorem Ipsum | `db/data/*`, loaded by `db/seed.js` (100+ documents) |

"User tagging" is read as logged-in users adding tags to products. Rating and liking are both implemented, so either reading of "rating/liking" is covered. Checkout is a mock: no payment details are collected.
