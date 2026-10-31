# Tech Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live bilingual tech store at `https://shop.kodingkat.xyz` meeting every Phase 1 requirement in the brief.

**Architecture:** React SPA served as static files by Caddy; `/api/*` proxied to an Express service on the VPS; Express talks plain SQL to a private RDS PostgreSQL instance. The site is deployed in Task 1 and redeployed after every later task.

**Tech Stack:** Node 22, Express 5, `pg`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `sanitize-html`, `express-rate-limit`, Node's built-in test runner plus `supertest`; React 19, Vite, React Router, GSAP; PostgreSQL 16 with `unaccent`.

**Spec:** `docs/superpowers/specs/2026-10-31-tech-store-design.md`

## Global Constraints

- No gradients in any CSS (`grep -rn gradient web/src` must return nothing).
- No Lorem Ipsum; no visible "test"/"demo" labels on the storefront.
- Existing `kodingkat.xyz` and `www` Caddy blocks must stay byte-identical; `kodingkat.xyz` must still return 200 after every deploy.
- No third-party animation component packs. GSAP and CSS only; honour `prefers-reduced-motion`.
- RDS: `db.t4g.micro`, not publicly accessible, 5432 open only to the VPS, TLS required.
- No secrets in the repository. Demo logins go in a submission note outside it.
- Default language English/USD; Vietnamese/VND via switcher.
- Repository: private GitHub repo `SEG_slot16`; local checkout is `slot16` with its own `.git`, never committed to the parent SEG repo.
- Roles are enforced in the API, not only hidden in the UI.

## Review Focus

- A forged checkout request with altered prices: the server uses its own prices.
- Ordering more than stock, or the same checkout submitted twice: rejected or deduplicated, stock never negative.
- A customer calling admin endpoints directly, or a deactivated user holding a valid cookie: 403/401.
- HTML or script in comments, tags, or profile fields: stored safely, rendered inert.
- Search for `%`, `_`, `'`, or Vietnamese without diacritics: literal matching, no error, and unpublished products never appear.

---

## File Structure

```
server/src/app.js            Express app (no listen), mounts routers
server/src/index.js          listen on 127.0.0.1:4000
server/src/db.js             pg Pool, query(text, params)
server/src/auth.js           requireAuth, requirePermission(code), signSession
server/src/log.js            logAction(userId, action, detail)
server/src/routes/{auth,catalog,engagement,orders}.js
server/src/routes/admin/{users,content,moderation,seo,settings}.js
server/test/*.test.js
db/schema.sql                full schema, idempotent drop/create
db/seed.js                   repeatable: schema, then db/data/*
db/data/{products,articles,users}.js
web/src/{main,App,api,i18n,money}.jsx?
web/src/styles/{tokens,base}.css
web/src/components/, pages/, admin/, motion/
web/public/img/
deploy/{Caddyfile.shop,shop-api.service,deploy.sh}
```

## Task 1: Repository, infrastructure, first deploy

**Files:** Create `.gitignore`, `README.md`, `server/src/{app,index,db}.js`, `deploy/*`.

**Interfaces:**
- Produces: `GET /api/health` returning `{ok:true, db:true}`; `deploy/deploy.sh` (builds web, uploads with tar over ssh, installs server, restarts `shop-api`); env file `/etc/shop-api.env` with `DATABASE_URL`, `JWT_SECRET`.

- [ ] **Step 1:** `git init` in `slot16`, `gh repo create SEG_slot16 --private --source . --push`. Expected: repo visible through `gh repo view SEG_slot16`.
- [ ] **Step 2:** Create a DB subnet group from the VPC's subnets and a security group allowing 5432 from the VPS security group `sg-0a4525a44f7353976`. Create RDS `shop-db` with Postgres 16, 20 GB gp3, no public access, 1-day backups, password generated locally and stored only in `/etc/shop-api.env` and `~/.config/shop-db.env` (mode 600). Run `aws rds wait db-instance-available`.
- [ ] **Step 3:** On the VPS, install Node 22 and `postgresql-client` (no Docker). Verify `psql` connects with `sslmode=require`; create databases `shop` and `shop_test`.
- [ ] **Step 4:** Back up the Caddyfile, append `deploy/Caddyfile.shop` (`/api/*` to `127.0.0.1:4000`, SPA fallback, security headers; no external CSP hosts beyond fonts), run `caddy validate`, reload. Add proxied `shop` DNS record through the Cloudflare API.
- [ ] **Step 5:** Run deploy. Expected: `curl https://shop.kodingkat.xyz/api/health` returns `{"ok":true,"db":true}` and `curl -I https://kodingkat.xyz` returns 200. Commit.

## Task 2: Schema and base seed

**Files:** Create `db/schema.sql`, `db/seed.js`, `db/data/users.js`, `server/test/schema.test.js`, `server/test/helpers.js`.

**Interfaces:**
- Consumes: `query` from `db.js`.
- Produces: tables exactly as listed in the spec's Data model, plus `documents.kind`, `title_vi`, `summary_vi`, `content_vi`. Permission codes: `users.manage`, `roles.manage`, `logs.view`, `settings.manage`, `content.manage`, `taxonomy.manage`, `moderation.manage`, `seo.manage`, `analytics.view`. Roles `super_admin`, `content_manager`, `moderator`, `seo_specialist`, `customer`. Test helpers `resetDb()`, `loginAs(role)` returning a supertest agent. Tests use `TEST_DATABASE_URL` through an SSH tunnel to `shop_test`.

- [ ] **Step 1:** Write `schema.test.js`: `documents` has `id,title,content,summary,category_id,author,created_at,views_count`; `search_click_log` has `user_id,query_string,clicked_doc_id,timestamp`; each role has its expected permission codes.
- [ ] **Step 2:** Run `node --test server/test/schema.test.js`. Expected: FAIL, relation missing.
- [ ] **Step 3:** Write schema and seed. Add a `document_search` generated `unaccent` lowercase column across English and Vietnamese title/summary/content, through an immutable wrapper function.
- [ ] **Step 4:** Run tests. Expected: PASS. Commit.

## Task 3: Auth and permissions

**Files:** Create `server/src/auth.js`, `server/src/log.js`, `server/src/routes/auth.js`, `server/test/auth.test.js`.

**Interfaces:**
- Produces: `requireAuth`, `requirePermission(code)`, `logAction(userId, action, detail)`; `POST /api/auth/register|login|logout`, `GET/PATCH /api/me`; `req.user = {id, role, permissions[]}`. Session cookie `sid`, 7 days, httpOnly, Secure, SameSite=Lax. Login rate limited.

- [ ] **Step 1:** Tests: register then login works; wrong password 401; duplicate email 409; password under 8 chars 400; profile update persists and strips HTML; a deactivated user's existing cookie gets 401 on `/api/me`; customer on a `requirePermission` route gets 403.
- [ ] **Step 2:** Run, expected FAIL.
- [ ] **Step 3:** Implement. `requireAuth` reloads the user and permissions from the DB per request, so deactivation and permission edits apply at once.
- [ ] **Step 4:** Run, expected PASS. Deploy. Commit.

## Task 4: Catalog, search, engagement

**Files:** Create `server/src/routes/{catalog,engagement}.js`, `server/test/{catalog,engagement}.test.js`.

**Interfaces:**
- Produces: `GET /api/documents?page,limit,q,category,tag,from,to,minPrice,maxPrice,kind,sort` returning `{items,total,page,pages}`; `GET /api/documents/:slug` (increments `views_count`, returns tags, rating average, like count, comments); `GET /api/categories`, `GET /api/tags`; `POST /api/search/click {query,docId}`; `POST/DELETE` for `/api/documents/:id/{comments,rating,like,tags}`; `POST /api/comments/:id/flag`.

- [ ] **Step 1:** Tests: pagination totals; each filter narrows results; draft never returned by list, search or detail; `q=%` matches only literal `%`; `q=tai nghe` matches `Tai nghe`-text with diacritics; a search writes a log row with null `clicked_doc_id`, a click writes one with the id, guests have null `user_id`; rating upserts to one per user; like toggles; comment HTML is stored as plain text; anonymous comment 401.
- [ ] **Step 2:** Run, expected FAIL.
- [ ] **Step 3:** Implement. Escape `%`, `_`, `\` and use `ILIKE ... ESCAPE`. Comment status honours the moderation setting. Empty `q` writes no log row.
- [ ] **Step 4:** Run, expected PASS. Deploy. Commit.

## Task 5: Orders

**Files:** Create `server/src/routes/orders.js`, `server/test/orders.test.js`.

**Interfaces:**
- Produces: `POST /api/orders {items:[{docId,qty}], address, clientToken}`, `GET /api/orders`, `GET /api/orders/:id`. Login is required to order. The cart itself lives in browser `localStorage`.

- [ ] **Step 1:** Tests: total computed from DB prices, client-sent prices ignored; qty over stock 409 with no partial change; qty under 1 400; same `clientToken` twice creates one order; stock decremented; a user cannot read another's order (404); two concurrent orders for the last unit produce exactly one success.
- [ ] **Step 2:** Run, expected FAIL.
- [ ] **Step 3:** Implement in one transaction with `SELECT ... FOR UPDATE`; unique `(user_id, client_token)`.
- [ ] **Step 4:** Run, expected PASS. Deploy. Commit.

## Task 6: Admin API

**Files:** Create `server/src/routes/admin/*.js`, `server/test/admin.test.js`.

**Interfaces:**
- Produces, under `/api/admin`, each behind its permission: `users` (list, change role, activate/deactivate), `roles` (read and set role permissions), `logs`, `settings`; `documents` CRUD with `status`, `categories`, `tags` CRUD; `comments` queue, `flags` resolve, spam marking; `seo/:id` update of SEO fields only; `analytics` returning `{totals, topViewed, topSearches, zeroResultSearches, clickThrough, viewsByDay}`.

- [ ] **Step 1:** Tests: a table test that each of the four roles gets 200 on its own area and 403 on the other three, customer gets 403 everywhere; content HTML is sanitised on save; publish makes a product visible and unpublish hides it; hiding a comment removes it from the detail response; a Super Admin cannot deactivate themselves; a role change writes a `system_logs` row; deleting a category in use returns 409; SEO role cannot change price through `seo/:id`.
- [ ] **Step 2:** Run, expected FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, expected PASS. Deploy. Commit.

## Task 7: Product content and images

**Files:** Create `db/data/products.js`, `db/data/articles.js`, `web/public/img/products/*`.

**Interfaces:**
- Consumes: seed format from Task 2. Each product: `{slug,title,title_vi,summary,summary_vi,content,category,brand,price,compare_at_price,stock,tags,image,image_alt,seo_*}`.

- [ ] **Step 1:** Write a seed validation test: at least 100 products across 8 categories, no empty fields, unique slugs, no "lorem" anywhere, every `image` exists on disk.
- [ ] **Step 2:** Run, expected FAIL.
- [ ] **Step 3:** Write the 100 products with real names and specs, and at least 3 articles. Draw one flat SVG per product variant family, no gradients. Seed comments, ratings, flags, orders, and 200+ search log rows.
- [ ] **Step 4:** Run the test and seed `shop`. Expected: PASS and `select count(*)` shows at least 100. Commit.

## Task 8: Frontend foundation

**Files:** Create `web/` scaffold, `web/src/{api.js,i18n.jsx,money.js,cart.jsx}`, `styles/*`, `components/{Header,Footer,ProductCard,Pagination,Stars}.jsx`, `web/src/test/money.test.js`.

**Interfaces:**
- Produces: `api(path, opts)`; `useT()` returning `t(key)` and `pick(doc,'title')` (Vietnamese with English fallback); `formatPrice(usd, lang, rate)`; `useCart()` with `add, remove, setQty, clear, items, count`.

- [ ] **Step 1:** Test: `formatPrice(19.99,'en',25000)` is `$19.99`; `formatPrice(19.99,'vi',25000)` is `500.000 ₫` (rounded to the nearest 1,000); every key in `en` exists in `vi`.
- [ ] **Step 2:** Run, expected FAIL.
- [ ] **Step 3:** Implement. Tokens from the reference: white background, near-black text, accent `#E8175D`, pastels `#FFBCBC`, `#FDF6E0`, `#F4F4F4`.
- [ ] **Step 4:** Run, expected PASS. Commit.

## Task 9: Storefront pages

**Files:** Create `web/src/pages/{Home,Catalog,Product,Search,Cart,Checkout,OrderDone,Login,Register,Profile,NotFound}.jsx`.

**Interfaces:**
- Consumes: Task 4, 5, 3 APIs; Task 8 hooks.

- [ ] **Step 1:** Build all pages; Home follows the reference (hero with two promos, categories, new arrivals, deal of the day with countdown, top sellers, articles, footer). Search result clicks call `POST /api/search/click`.
- [ ] **Step 2:** Deploy and verify in a browser at 1280 and 390 wide: register, log in, edit profile, search with filters, open a product, comment, rate, like, tag, add to cart, check out, view the order, switch language. Expected: no console errors, no horizontal scroll on mobile. Commit.

## Task 10: Admin UI

**Files:** Create `web/src/admin/*`.

**Interfaces:**
- Consumes: Task 6 API; `/api/me` permissions decide which sections appear.

- [ ] **Step 1:** Build the shell and sections for all four roles, with the analytics dashboard as simple flat bar charts.
- [ ] **Step 2:** Deploy and verify in a browser, logged in as each role: every responsibility in the brief's table works, and other sections are absent. Commit.

## Task 11: Motion

**Files:** Create `web/src/motion/*`; modify pages and components.

- [ ] **Step 1:** Add page transition, scroll reveals, card hover, add-to-cart flight with cart count bump, countdown digit flip, hero sequence.
- [ ] **Step 2:** Verify with reduced motion on (no movement) and off, then run the gradient grep. Commit.

## Task 12: Handover

**Files:** Modify `README.md`. Create `/home/dre/Desktop/study/SEG/slot16/SUBMISSION.md` outside the repository.

- [ ] **Step 1:** README covers stack, setup, schema, requirements mapping. The submission note lists URL, repository, and demo logins.
- [ ] **Step 2:** Re-seed `shop`, run all tests, walk the requirements list on the live site line by line, confirm `kodingkat.xyz` returns 200, confirm no secrets with `git log -p | grep -i -E 'password=|secret='`. Push.
- [ ] **Step 3:** Report to the user what was cut, if anything, and remind them that the repo is private (lecturer access) and RDS is still running.

## Priority cuts

If time runs short, cut in this order: Task 11 extras (hero sequence, digit flip), then articles, then Vietnamese product summaries. Tasks 1 to 10 otherwise stay. Full Vietnamese descriptions are not scheduled; `content_vi` falls back to English.
