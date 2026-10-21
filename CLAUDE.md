# CLAUDE.md

**Stain Wars**: a browser multiplayer food-fight FPS for a classroom cloud-computing demo. Read `requirements.md`, then `decisions.md` (the *why*), then `TODO.md` (progress; mark items done as you go).

## Layout
- `server.js`: Node HTTP + Socket.io. Authoritative projectiles/damage/money, derpy bots, localhost-only `/admin/*` endpoints.
- `public/shared.js`: constants used by BOTH server (require) and client (global `Shared`): outfits, weapons, map gen, collision. Change gameplay numbers here.
- `public/index.html`, `public/game.js`, `public/style.css`: Three.js client (ES module, Three from unpkg via importmap, no build step).
- `install.sh`: droplet installer (Ubuntu). Clones the repo to `/opt/stainwars`, systemd service `stainwars`, port 80.
- `scripts/admin.sh`: teacher CLI, symlinked to `/usr/local/bin/stainwars`.

## Run locally
`npm install && npm start`, then open http://localhost:3000 (PORT env overrides).
Admin: `curl localhost:3000/admin/status`, `/admin/bots?n=10`, `/admin/nobots`, `/admin/reset`.

## Conventions
- Keep it simple: MVP quality, minimal error checking, no build tooling, no extra dependencies.
- Units: meters; player position = feet; y up. Server ticks at 30Hz and broadcasts at 20Hz.
- Record any important new decision in `decisions.md`. Put new ideas in `TODO.md`.

## Security rules (see `decisions.md` → Security)
- **Never trust the client.** Validate every socket message in the server: types, `Number.isInteger` for indexes (blocks `__proto__`), `Number.isFinite` for numbers. Clients send intent or positions only. Money, damage, tiers, hits and fire rate are decided on the server.
- New gameplay that affects movement must keep `clientMove` in sync (speed, jump and gravity limits).
- Never commit secrets (tokens, passwords, `.env`). The repo is public. Never put DigitalOcean credentials on the droplet.
- Keep the service non-root and sandboxed in `install.sh`. The server must not need to write files.
- New admin features stay localhost-only, or get a password if they're ever exposed.
- Avoid new dependencies. If one is added, commit `package-lock.json` (the installer uses `npm ci`).
- Never render player-controlled text with `innerHTML` (use `textContent`). Today, names are server-picked.
- Repo: https://github.com/dwennersten-work/stain-wars (public; install.sh pulls from it).
