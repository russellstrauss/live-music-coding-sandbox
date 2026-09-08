# Live sync (VS Code ↔ browser REPL)

Edit `live.js` in VS Code (or any editor) and save to inject the code into the running Strudel REPL. Each save runs the same path as the UI **Update** button / Ctrl+Enter (`setCode` + `evaluate`), so the new pattern is hot-swapped into the live cycle without reloading the page or stopping audio.

## Usage

1. Install deps (once, after adding this tool): `pnpm i`
2. Start the watcher: `npm run live-sync` (or `pnpm live-sync`)
3. Start the website: `cd website && npm run dev` (or root `npm run start` if jsdoc works)
4. Open http://localhost:4321/ and press **Play** once
5. Open `live.js` at the repo root in VS Code and save changes

You should see `[live-sync] updated from live.js` in the REPL log and hear the pattern change on the next scheduler tick.

## Notes

- Live sync connects automatically in **dev** (`import.meta.env.DEV`).
- Force on in any build: add `?liveSync=1` to the URL.
- Disable: `?liveSync=0`
- Default WebSocket: `ws://localhost:9999` (override with `LIVE_SYNC_PORT` on the server)
- One-way only: disk → browser. Edits in the browser editor are not written back to `live.js`.
