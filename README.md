# Traefik Panel

A Next.js + shadcn-style UI to edit Traefik `dynamic.yml` interactively.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Configurable dynamic file path

Set `DYNAMIC_CONFIG_PATH` to control where the app reads/writes Traefik dynamic config.
This variable is required (there is no fallback default):

```bash
export DYNAMIC_CONFIG_PATH=/data/traefik/dynamic.yml
```

If it is missing, the web UI shows a simple message and disables the editor.

If you run with `npm run dev` directly, `DYNAMIC_CONFIG_PATH` is read by the app process as-is.

### Optional login

You can enable username/password login using environment variables:

```bash
AUTH_USERNAME=admin
AUTH_PASSWORD=supersecret
```

Behavior:

- If both are set: login required.
- If either is missing: no login required.

## What it supports

- Visual editors for dynamic Traefik sections:
  - `http.routers`, `http.services`, `http.middlewares`, `http.serversTransports`
  - `tcp.routers`, `tcp.services`, `tcp.middlewares`, `tcp.serversTransports`
  - `udp.routers`, `udp.services`
  - `tls.certificates`, `tls.options`, `tls.stores`
- Full YAML fragment editing per object, so any Traefik field is supported.
- Raw full-file YAML tab.
- Enable/disable toggle per object. Disabled objects are written as commented YAML blocks and can be re-enabled later.
- API-backed load/save to configurable `DYNAMIC_CONFIG_PATH`.
- Save confirmation dialog with semantic change overview (add/remove/edit/enable/disable).
- Live YAML preview and download.
- Dark mode toggle with persisted theme preference.

## Docker deployment

Build and run with Docker Compose:

```bash
docker compose up --build -d
```

Create `.env` from `.env.example` and set:

```bash
DYNAMIC_CONFIG_PATH=/absolute/path/to/dynamic.yml
AUTH_USERNAME=admin
AUTH_PASSWORD=supersecret
```

Compose uses that env var for both:
- Host bind mount source

Inside container, app path is fixed to `/data/dynamic.yml`.

Example:

- `.env`: `DYNAMIC_CONFIG_PATH=/home/zeeshan/self-hosted/traefik-stack/config/dynamic-bak.yml`
- Container reads: `/data/dynamic.yml`
- Auth is enabled only when both `AUTH_USERNAME` and `AUTH_PASSWORD` are non-empty.

## Doc basis

Modeled from Traefik docs around file provider dynamic configuration for `http`/`tcp`/`udp`/`tls` entities:

- https://doc.traefik.io/traefik/providers/file/
- https://doc.traefik.io/traefik/reference/routing-configuration/http/routing/router/
- https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/file/
