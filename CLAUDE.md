# Diskplot

Disk space analyzer for Windows: Electron, TypeScript, React. An Android build (Capacitor) shares the same interface. Product truth is in PRODUCT.md, the visual system in DESIGN.md.

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

## Android

- The same renderer runs inside Capacitor. `src/mobile/bridge.ts` provides `window.api` on Android; `android/app/src/main/java/com/diskplot/app/` holds the native plugin, the scanner and the duplicate finder.
- The table is built by `src/shared/table.ts` on both platforms. Change it there, not in the scanners.
- Features Android lacks are switched off through `window.api.can`; check it before offering a desktop-only action.
- Build: `npm run mobile:apk` with `JAVA_HOME` pointing at JDK 23 (Gradle 8.14 does not run on JDK 25) and the SDK in `%LOCALAPPDATA%AndroidSdk`. The APK lands in `android/app/build/outputs/apk/debug/`.
- An emulator named `diskplot` (Pixel 7, Android 16) exists for testing. Debug builds expose the WebView to Chrome DevTools: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`.
- Android is not part of the release workflow yet and is not on Google Play.
