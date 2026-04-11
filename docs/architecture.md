# Architecture

This repository uses a monorepo layout:

- `apps/web` contains the single-page PWA
- `apps/worker` contains the Cloudflare Worker
- `packages/shared` contains prayer calculation logic shared between both apps

Any file or folder prefixed with `minaret-` is considered domain-specific and can be replaced in another future app.
