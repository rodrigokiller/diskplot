# Diskplot

Disk space analyzer for Windows: Electron, TypeScript, React. Product truth is in PRODUCT.md, the visual system in DESIGN.md.

## Rules that hold everywhere

- No emojis and no em dashes, in the interface, the site, the README or commit messages.
- Square corners. One ink per theme, red only for selection, growth and destructive actions.
- Interface and site text exist in English and Brazilian Portuguese. Portuguese carries its accents. Keep copy short and technical; no metaphors.
- The landing pages are generated. Edit `scripts/build-site.mjs`, then run `npm run site:build`. Do not edit `site/**/index.html` by hand.
- A new theme is one more block of variables in `src/renderer/src/styles.css`.

## Releases

Never publish a version unless the user asks for it in the current conversation ("sobe nova versão", "faz um release"). When they do, follow the `release` skill in `.claude/skills/release`.

## Running

- `npm run dev` starts the app. In the VS Code terminal `ELECTRON_RUN_AS_NODE` is set; launch Electron with `env -u ELECTRON_RUN_AS_NODE`.
- `npx tsc --noEmit` typechecks. There are no automated tests yet.
- The site deploys to Vercel on every push to `main`.
