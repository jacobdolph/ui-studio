# UI Studio

A free web app for building **WoW Forever** Edit Mode layouts in the browser and exporting them as strings players paste into *Edit Mode → Import Layout*.

| Folder | What |
| --- | --- |
| `web/` | Vite + React + TypeScript single-page app, deployed to Cloudflare Pages |
| `addon/` | Companion Lua addon (placeholder for now) |

## Status

Spike complete: `web/src/editmode/` decodes and re-encodes Blizzard's Edit Mode layout string format losslessly. Verified against 570 real exports from wago.io (every version 0–5, including WoW Forever beta builds). The format write-up is in [`web/FORMAT.md`](web/FORMAT.md).

## Develop

```sh
cd web
npm install
npm run dev        # inspector page on http://localhost:5173
npm test           # vitest: codec unit tests + corpus round-trip
npm run eval       # per-version round-trip report over the wago corpus
```

Regenerate the enum/setting schema from Blizzard's FrameXML (branch `forever` of Gethe/wow-ui-source, strings from Ketho/BlizzardInterfaceResources):

```sh
npm run gen:schema -- /path/to/wow-ui-source --flavor camelot --strings /path/to/enUS.lua
```

## Deploy (Cloudflare Pages)

Connect the repo, set root directory `web`, build command `npm run build`, output directory `dist`. Or `cd web && npm run build && npx wrangler pages deploy`.
