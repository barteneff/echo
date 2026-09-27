# ECHO — signal destruction system

Procedural audiovisual machine: signal is born, becomes matter, then breaks the image.

## Modes

| Mode | Role |
|------|------|
| **Signals** | Birth — Organic / Fractal / Vortex / Plasma / Noise |
| **Wars** | Matter + Damage — CORE, TRACE, SHATTER, PRESSURE, SCRAP / SCAN, BLEED, VOID, RIFT |
| **Flat** | Pure destruction — CRUSH, TEAR, MELT, BLEED, VOID, SCRAP, DUPLICATE, BURN |

Machine states (Wars): **IMPACT · COLLAPSE · RESIDUE · FRACTURE**

Semantic audio drive: **impact / body / texture / motion** (not raw bass→scale).

## Run

```bash
npm install
npm run dev
```

## GitHub Pages

Сайт: https://barteneff.github.io/echo/

```bash
npm run deploy
```

Публикует `dist` в ветку `gh-pages` ([gh-pages](https://www.npmjs.com/package/gh-pages)).
В Settings → Pages → Source выбери branch **gh-pages** / **/ (root)**.

## Architecture (FSD)

```
src/
  app/         # bootstrap, Engine, Timeline
  pages/       # Signals / Wars / Flat modes
  widgets/     # HUD shell
  features/    # (reserved)
  entities/    # audio, cover, faction, signal
  shared/      # theme, config
```

Aliases: `@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared`.
