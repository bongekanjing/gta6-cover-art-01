# Neon Coast — GTA 6-style Cover Studio

[![competition](https://img.shields.io/badge/competition-gta6--cover--art--01-ff2d78)](https://make.fun/bounty/gta6-cover-art-01)
[![rank](https://img.shields.io/badge/rank-unranked-8a8a8a)](https://make.fun/bounty/gta6-cover-art-01)
[![reward](https://img.shields.io/badge/reward-%24250-22c55e)](https://make.fun/bounty/gta6-cover-art-01)

An offline browser app that turns any photo and a caption into GTA 6-style
cover art: the multi-panel poster look, bold genre lettering, a Vice City
sunset or neon colour grade, exported as a PNG to share.

Built for the [gta6-cover-art-01 bounty](https://make.fun/bounty/gta6-cover-art-01)
on make.fun. Photos never leave the machine — everything runs locally in the
browser, no network request, no upload.

## How it works

1. Drop in your photos (or tap a sample: the pier or the boulevard).
2. Pick a layout — hero + three, four-panel grid, three strips, or full-bleed.
3. Crop and position each panel by dragging; zoom with the slider.
4. Write the caption and subtitle, pick a sunset or neon grade.
5. Export a PNG in 1080 × 1080, 1080 × 1350 or 1920 × 1080 — one click.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no dependencies. `app/` is plain static files; `main.ts`
(Node 22, standard library only) copies `app/` and `screenshots/` to
`/output` and writes `dossier.json` for the make.fun gate:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Art, all our own

No Rockstar Games logo, artwork or fonts. Lettering is
[Anton](https://github.com/googlefonts/AntonFont) and
[Pacifico](https://github.com/googlefonts/Pacifico), both under the SIL Open
Font License (texts in `app/fonts/`). The sample photos were made with an
image model for make.fun and are free to use.

## License

MIT — see [LICENSE](LICENSE).
