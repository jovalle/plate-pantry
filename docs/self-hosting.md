# Self-Hosting Plate Pantry

Plate Pantry is designed to be completely self-contained and easy to host on any Docker-capable server, VPS, homelab, or local machine.

A live demo instance is available at [jayro.dev/plate-pantry](https://jayro.dev/plate-pantry).

---

## 1. Quickstart with Docker Compose

1. **Clone the repository**:

   ```bash
   git clone https://github.com/jovalle/plate-pantry.git
   cd plate-pantry
   ```

2. **Configure environment**:
   Run the interactive configuration helper:

   ```bash
   ./scripts/setup-env.sh
   ```

   Or copy the template manually:

   ```bash
   cp .env.example .env
   ```

3. **Start the container**:
   ```bash
   docker compose up -d
   ```

The dashboard will be available at `http://localhost:5360/plate-pantry`.

---

## 2. Configuration & Environment Variables

All settings can be placed in a `.env` file in the project root or passed as environment variables.

| Variable                             | Default                 | Description                                                         |
| :----------------------------------- | :---------------------- | :------------------------------------------------------------------ |
| `PORT`                               | `5360`                  | HTTP port exposed by the application.                               |
| `HOST`                               | `0.0.0.0`               | Host bind address.                                                  |
| `NEXT_PUBLIC_PLATE_PANTRY_BASE_PATH` | `/plate-pantry`         | URL path prefix where the dashboard is served.                      |
| `PLATE_PANTRY_PUBLIC_ORIGIN`         | `http://localhost:5360` | Canonical public URL used for links and CORS.                       |
| `PLATE_PANTRY_SSR_ORIGIN`            | `plate-pantry`          | Identifier returned in `x-plate-pantry-ssr-origin` response header. |
| `PLATE_PANTRY_DATA_DIR`              | `./data`                | Host directory for persisting lookup stats.                         |
| `PLATE_PANTRY_ORIGIN_SECRET`         | _(empty)_               | Shared secret token for edge-to-origin authentication.              |
| `PLATE_PANTRY_RATE_LIMIT_PER_MINUTE` | `20`                    | Max DMV lookup requests permitted per client IP per minute.         |
| `PLATE_PANTRY_MAX_STATS_ENTRIES`     | `10000`                 | Max unique plates cached before least-queried LRU eviction.         |
| `DMV_PROXY_REQUIRED`                 | `0`                     | Set to `1` to require an upstream proxy for NY DMV queries.         |
| `DMV_PROXY_URL`                      | _(empty)_               | Upstream HTTP proxy URL (e.g. `http://gluetun:8888`).               |

---

## 3. Proxy & VPN Routing (Optional)

If your host requires routing NY DMV lookup traffic through a VPN or residential proxy (such as Gluetun or Squid):

1. Set `DMV_PROXY_REQUIRED=1` in `.env`.
2. Set `DMV_PROXY_URL=http://<proxy-host>:<proxy-port>` in `.env`.

Plate Pantry will fail-closed if the proxy becomes unavailable, ensuring direct traffic is never leaked.

---

## 4. Origin Hardening & Edge Relay (Optional)

If exposing Plate Pantry behind Cloudflare Workers or a CDN:

1. **Generate an origin secret**:
   ```bash
   openssl rand -hex 32
   ```
2. Set `PLATE_PANTRY_ORIGIN_SECRET=<generated-secret>` on your origin server's `.env`.
3. Requests directly hitting your origin without the `x-plate-pantry-origin-secret` header will be rejected with `403 Forbidden`.
4. If using the included Cloudflare Worker ([edge/worker.ts](../edge/worker.ts)), configure `PLATE_PANTRY_ORIGIN_SECRET` and `PLATE_PANTRY_ORIGIN_URL` in your worker environment.
