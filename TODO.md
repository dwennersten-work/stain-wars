# TODO

## Phase 1 — MVP
- [x] Docs: decisions.md, CLAUDE.md, README.md
- [x] Shared constants (outfits, weapons, map, collision) — `public/shared.js`
- [x] Server: socket.io, players, projectiles, damage, kills, money, outfit drop on death, leaderboard
- [x] Derpy bots
- [x] Localhost admin endpoints + `scripts/admin.sh` (reset / bots / nobots / status)
- [x] Client: Three.js arena, FPS controls, low-poly googly-eyed players, outfit colors 
- [x] Weapons: mustard, hamburger grenade, ketchup sniper + hotdog scope
- [x] HUD: health, money, outfit, leaderboard, kill feed, shop (B)
- [x] install.sh (Node, systemd, port 80, htop)
- [x] GitHub repo + push

## Phase 2 — Security hardening
- [x] Validate all socket input (crash fix, `__proto__` projectile leak, buy tier type)
- [x] Server-side movement validation: speed, jump height, air time, box collision; `setpos` correction
- [x] Rate limit (60 msgs/s per socket), connection caps (80 total / 40 per IP), 10KB message cap
- [x] Run service as non-root `stainwars` user with systemd sandboxing; `npm ci`
- [x] `nosniff` / `X-Frame-Options` headers on static files

## Later (ideas, not started)
- [ ] Web admin dashboard `/admin`: live CPU/RAM/network/player-count graphs for screensharing
- [ ] Show "cost per player" (CPU %/bandwidth per connected player)
- [ ] Password-protected admin page with reset / add-bots buttons
- [ ] Sound effects beyond simple blips
- [ ] Mobile/touch controls
- [ ] More maps / map rotation
- [ ] More weapons (pie launcher, spaghetti whip, soda shotgun)
- [ ] Outfit preview in the shop (3D spin)
- [ ] Client-side prediction/interpolation improvements
- [ ] Stronger anti-cheat: aimbots and auto-fire are still possible (server can't tell good aim from a script)
- [ ] Enable GitHub Dependabot security alerts on the repo (repo Settings → Code security)
- [ ] Subresource Integrity for the unpkg Three.js import (or vendor `three.module.js` into `public/`)
