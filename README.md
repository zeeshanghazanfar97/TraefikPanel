# Traefik Panel

A Next.js + shadcn-style UI to edit Traefik `dynamic.yml` interactively.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Configurable dynamic file path

Set `DYNAMIC_CONFIG_PATH` to control where the app reads/writes Traefik dynamic config:

```bash
# Relative to project root
export DYNAMIC_CONFIG_PATH=dynamic.yml

# Or absolute path
export DYNAMIC_CONFIG_PATH=/data/traefik/dynamic.yml
```

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

The default compose file maps:

- Host `./dynamic.yml` -> Container `/data/dynamic.yml`
- `DYNAMIC_CONFIG_PATH=/data/dynamic.yml`

Customize the env var and volume mapping in [docker-compose.yml](/Users/zeeshanghazanfar/Documents/PersonalProjects/TraefikPanel/docker-compose.yml) for your environment.

## Doc basis

Modeled from Traefik docs around file provider dynamic configuration for `http`/`tcp`/`udp`/`tls` entities:

- https://doc.traefik.io/traefik/providers/file/
- https://doc.traefik.io/traefik/reference/routing-configuration/http/routing/router/
- https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/file/
