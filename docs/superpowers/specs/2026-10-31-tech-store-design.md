# Tech Store: E-Commerce Platform & Product Catalog (Design)

Date: 2026-10-31

## Intent

A coursework project (SEG, slot 16) graded by a lecturer against a written requirements list, but built and presented as a real online tech store rather than a class demo. It is Phase 1 of a larger project: Phase 2 adds a real search engine, so the data must be ready for that.

The lecturer will open the live site, click through it, and log in to the admin side to check each role.

## Goals

- Meet every item in the requirements (reproduced in the checklist at the end).
- Feel like a real shop: real-sounding copy, working cart, working mock checkout.
- Visual style follows the reference design (InfixShop template): white pages, generous space, one strong accent colour (pink-red), flat pastel promo blocks, hero with side promos, category row, product card grid with reveal-on-hover "Add to cart", deal-of-the-day block with countdown, blog row, multi-column footer.
- Custom-written animations.
- Live on the user's VPS at `https://shop.kodingkat.xyz`.

## Non-goals

- Real payments. Checkout is a mock; no card details are collected.
- The real search engine (Phase 2). Phase 1 uses simple database queries.
- Email sending (password reset, order emails).
- Real inventory, shipping or tax logic.

## Anti-goals

- Gradients anywhere in the UI. The user ruled these out explicitly.
- Lorem Ipsum or placeholder-feeling content.
- Off-the-shelf animation component packs. Animations are custom.
- Any disruption to the personal site at `kodingkat.xyz`.
- Looking like a student demo (visible "test" labels in the storefront).

## Constraints

- VPS: AWS EC2 t4g.small, ARM64, Debian 13, about 1.5 GB free memory, 12 GB free disk, Singapore (`ap-southeast-1`), Caddy already running, no Node, Docker or psql installed. Security group opens 22/80/443.
- `kodingkat.xyz` is on Cloudflare, proxied, SSL Full (strict). A new `shop` DNS record is needed; Caddy issues its certificate over HTTP-01.
- AWS credits are finite. The VPS alone uses about $21/month of them; RDS adds an estimated $15/month on top, about $36/month total. The database is temporary. The user accepted this estimate in principle, and credits being used up sooner than March 2027 is a known trade-off.
- The Git repository must be on GitHub or GitLab.
- Deadline: 2 to 3 hours from 2026-10-31 afternoon. This is Phase 1 of 2 and requires basic core functionality, so a working full loop beats polish.

## Decisions by the user

- Audience: lecturer grading, but it must feel like an actual site.
- Visitors can add to cart and place a mock order with no real payment.
- Products: tech (phones, headphones, audio, PCs, and similar).
- Database: an AWS service rather than on the VPS, temporary. Amazon RDS PostgreSQL accepted.
- Supabase dropped; login is built into Express.
- Custom animation, no gradients, minimal theming like the reference image.
- Deployed to the user's VPS and website.
- Two languages and currencies with a switcher: English/USD (default) and Vietnamese/VND.

## Builder's calls (proposed, not requested by the user)

### Stack

- Frontend: React + Vite (same as the user's personal site), React Router, GSAP for animation. Plain CSS with design tokens.
- Backend: Node.js + Express REST API, plain SQL through `pg`.
- Database: RDS PostgreSQL, `db.t4g.micro`, in the VPS's VPC, not publicly accessible, security group allows 5432 only from the VPS. TLS required. Estimated cost about $15/month.
- Auth: bcrypt-hashed passwords, JWT in an httpOnly, Secure, SameSite cookie.
- Hosting: Caddy serves the built frontend from `/var/www/shop.kodingkat.xyz` and reverse-proxies `/api/*` to Express on localhost. Express runs as a systemd service. The existing Caddy blocks are not changed.
- Repository: a new standalone GitHub repository. `slot16` is its local home, kept out of the parent SEG repository.

### Data model

Products are stored in the required Documents table, so the schema matches the brief literally.

- `documents`: `id`, `title`, `slug`, `content` (HTML), `summary`, `category_id`, `author`, `created_at`, `updated_at`, `views_count`, plus `price`, `compare_at_price`, `stock`, `brand`, `image_url`, `status` (draft/published), and SEO fields (`seo_title`, `seo_description`, `seo_keywords`, `image_alt`). `author` is the staff member who wrote the listing.
- `tags` and `document_tags`: the required `tags` field is a many-to-many relation. `document_tags` records who added a tag, so staff tags and user tags can be told apart.
- `categories`: hierarchical is not required; a flat list with slug.
- `search_click_log`: `id`, `user_id` (nullable for guests), `query_string`, `clicked_doc_id` (nullable for a search with no click), `timestamp`. A search writes a row; a click on a result writes a row.
- `users`: email, password hash, display name, avatar, bio, role, active flag.
- `roles`, `permissions`, `role_permissions`: so "assign permissions" is a real feature, not a fixed mapping in code.
- `comments`: document, user, parent (optional), body, status (visible/hidden/pending/spam).
- `ratings`: one per user per document, 1 to 5. `likes`: user + document.
- `flags`: reports on comments, with reason and resolution.
- `orders`, `order_items`: mock orders, with address and a price snapshot.
- `system_logs`: admin actions and logins.
- `settings`: key/value global settings (store name, promo banner text, comment moderation on/off).
- `page_views` or use of `search_click_log` plus `views_count`: enough to feed the analytics dashboard.

### Seed data

100 hand-written, realistic products across about 8 categories (phones, headphones, speakers, laptops, desktop PCs, monitors, keyboards and mice, smart watches), with real product names and real specs. Plus demo users, one per admin role, some customers, comments, ratings and a sample of search logs so dashboards are not empty. Seeding is one repeatable command.

Blog row from the reference: 3 to 6 buying-guide articles, kept as a `kind` field on documents (`product`/`article`) so they share the same table.

### Images

The user did not specify a source. Plan: flat, consistent illustrations generated by the builder for each product category, or free-licence stock photos, stored as static files served by Caddy. No scraped retailer photos.

### Storefront pages

Home (hero, categories, new arrivals, deal of the day, top sellers, articles), catalog listing (paginated, with summary snippets, filters), product detail (full content, images, metadata including author, date, view count, categories, tags; comments, rating, like, add tag), search results, cart, checkout, order confirmation, register, login, profile (edit details, order history).

Search: keyword via `ILIKE`, filters for category, tag and date range, also price as an extra.

### Admin

A separate `/admin` area. Each role sees only its own sections, enforced on the API, not just hidden in the UI.

- Super Admin: users and roles, permission assignment, system logs, global settings.
- Content Manager: full product/article CRUD, publish/unpublish, categories and tags.
- Moderator: comment review queue, flags and reports, spam marking.
- Data & SEO Specialist: SEO fields per product, analytics dashboard (views, top searches, zero-result searches, click-through).

Demo logins for all four roles go in a separate submission note for the lecturer, not in the repository (which may be public) and not on the storefront.

### Animation

Written by hand with GSAP and CSS, respecting `prefers-reduced-motion`: page transitions, scroll reveals on sections, product card hover (image lift, add-to-cart slide-up), add-to-cart item flying to the cart icon with a count bump, countdown digit flips, hero promo sequence.

### Testing

API tests for auth, role enforcement, cart/order and search logging, run against a local Postgres. Storefront and admin flows checked in a real browser on the live site before handover.

### Language and currency

All UI text exists in both languages. `documents` stores prices in USD; VND is a fixed conversion rate in `settings`, rounded to a sensible price point. Product and article text has English and Vietnamese fields (`title_vi`, `summary_vi`, `content_vi`, falling back to English if empty). The required English fields remain the base record. The language choice is kept in the browser. Search matches both languages, and Vietnamese diacritics are ignored through the `unaccent` extension.

### Priority under the deadline

Build in this order, with the site deployed early and redeployed as work lands:

1. Must have, everything the brief lists: schema, seed, API, storefront pages, cart, mock checkout, all four admin roles, search logging, live deployment, GitHub repository, submission note.
2. Should have: English/Vietnamese switching for UI, product names and summaries; home page per the reference; core animations (page and scroll reveals, card hover, add-to-cart).
3. If time remains: Vietnamese full descriptions, articles, remaining animations, extra price filter.

The API test suite is limited to auth, role enforcement and orders. Anything cut is reported to the user, not silently dropped.

## Left to the builder

File layout, component breakdown, exact palette values, fonts, API route names, rate limiting details.

## Deployment access

The builder performs deployment directly: AWS CLI credentials, VPS SSH key and a Cloudflare API token are available on the user's machine. GitHub access is through the `gh` CLI. Deployment work is done and verified by the builder, not handed over as a runbook.

## After grading

Delete the RDS instance, but only when the user says so, since Phase 2 may still need it. Take a final snapshot first. Schema and seed data live in the repository, so the database can always be rebuilt; only user-generated data and logs depend on the snapshot.

Phase 2 is expected to build on this site and schema. Its exact needs are unknown; 100 products and sample logs are the Phase 1 target.

## Requirements (verbatim from the brief)

### 3. Technical Requirements

- Backend: RESTful API or GraphQL (Node.js/Express, Python FastAPI/Django, Java Spring Boot, PHP Laravel, etc.)
- Database: RDBMS (PostgreSQL, MySQL) or NoSQL (MongoDB) acting as the Document Store.
- Frontend: Responsive Web UI (React, Vue, Next.js, HTML/CSS/JS, etc.)
- Version Control: Git repository (GitHub or GitLab).

### 4. Functional Requirements

**A. Client / User Interface**

- Home & Directory: Paginated listing of latest items with summary snippets.
- Detail View: Display full content, images, and metadata (author, date, view count, categories, tags).
- User Engagement:
  - Registration, login, and profile management.
  - Commenting, rating/liking, and user tagging.
- Basic Search & Filtering (Phase 2 Placeholder):
  - Keyword search using standard database queries (LIKE or Regex).
  - Filters for category, tag, and date range.

**B. Admin Interface (Role-Based Access Control)**

| Role | Core Responsibilities |
|---|---|
| Super Admin | Manage user accounts/roles, assign permissions, view system logs, and configure global settings. |
| Content Manager | Full CRUD on content, publication status (publish/unpublish), and taxonomy management (categories, tags). |
| Moderator | Review user-generated comments/posts, handle flags/reports, and manage spam control. |
| Data & SEO Specialist | Configure SEO metadata (titles, descriptions, alt text, keywords) and monitor analytics dashboards. |

### 5. Data Schema & Preparation for Phase 2

To prepare for the search engine implementation in Phase 2, the database must include:

- Documents Collection/Table: Required fields: id, title, content (plain text/HTML), summary, category_id, tags, author, created_at, views_count.
- Search & Click Log Collection/Table: Required fields: user_id, query_string, clicked_doc_id, timestamp.
- Seed Data: Populate the database with at least 50-100 realistic text records (do NOT use Lorem Ipsum).

"User tagging" is read as logged-in users adding tags to products (builder's reading, shown to the user). Rating and liking are both implemented, so either reading of "rating/liking" is covered.
