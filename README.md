# Tech Store

React + Express + Postgres (RDS) store, live at https://shop.kodingkat.xyz.

- `server/` Express API (`GET /api/health`). Tests: `cd server && TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/shop_test npm test`
- `web/` React front end (added in a later task)
- `deploy/` `deploy.sh` (tar over ssh), `shop-api.service`, `Caddyfile.shop`

Local test DB: `docker run -d --name shop-pg-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=shop_test -p 55432:5432 postgres:16`

Deploy: `./deploy/deploy.sh`. Secrets live only in `/etc/shop-api.env` on the VPS.
