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

## What it supports

- Visual editors for dynamic Traefik sections:
  - `http.routers`, `http.services`, `http.middlewares`, `http.serversTransports`
  - `tcp.routers`, `tcp.services`, `tcp.middlewares`, `tcp.serversTransports`
  - `udp.routers`, `udp.services`
  - `tls.certificates`, `tls.options`, `tls.stores`
- Full YAML fragment editing per object, so any Traefik field is supported.
- Raw full-file YAML tab.
- API-backed load/save to configurable `DYNAMIC_CONFIG_PATH`.
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
```

Compose uses that env var for both:
- Container env `DYNAMIC_CONFIG_PATH`
- Bind mount source and destination path

So use an absolute path that exists on your host.

## Doc basis

Modeled from Traefik docs around file provider dynamic configuration for `http`/`tcp`/`udp`/`tls` entities:

- https://doc.traefik.io/traefik/providers/file/
- https://doc.traefik.io/traefik/reference/routing-configuration/http/routing/router/
- https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/file/
