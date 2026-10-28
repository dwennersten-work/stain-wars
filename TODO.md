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

## Phase 3 — Shop & food arsenal
- [x] Food weapon store: start with mustard only, weapons bought once and kept
- [x] New weapons: soda shotgun, spaghetti whip, pie launcher
- [x] Ketchup sniper: headshot 1-shot, body 2-shot (ignores stain resistance)
- [x] Whipped cream bomb (flashbang): consumable, G to throw, blinds nearby players
- [x] Outfits kept on death; bought one level at a time
- [x] Rebalanced prices, kill reward and resistance
- [x] Silly synth sound effects

## Phase 4 — Anti-cheat
- [x] Server picks the shot origin (no shooting through walls); client sends weapon + direction only
- [x] Shared gun cooldown (no instant multi-weapon bursts); reject huge/zero aim vectors
- [x] Swept movement (no blinking through boxes); smaller lag allowance; pinned flyers stay pinned
- [x] Fix false snap-backs when bunny hopping
- [x] Blinded players' shots spray server-side
- [x] Anti kill-farming: idle victims pay nothing, repeat-victim decay, income cap
- [x] `Object.freeze(Shared)` blocks the console speed hack (`Shared.SPEED = …`)
- [x] Tighten server speed limit: budget refill 1.3× → 1.05× walk speed, snap-backs every 250ms (was 500ms)
- [x] Deep-freeze `Shared` (nested WEAPONS/OUTFITS/BOXES too)
- [ ] Re-test speed hacks on the droplet with real students after `stainwars update`

## Later (ideas, not started)
- [ ] Web admin dashboard `/admin`: live CPU/RAM/network/player-count graphs for screensharing
- [ ] Show "cost per player" (CPU %/bandwidth per connected player)
- [ ] Password-protected admin page with reset / add-bots buttons
- [ ] Mobile/touch controls
- [ ] More maps / map rotation
- [ ] Playtest balance with a real class (prices, sniper strength, blind length)
- [ ] Outfit preview in the shop (3D spin)
- [ ] Client-side prediction/interpolation improvements
- [ ] Stronger anti-cheat: aimbots and auto-fire are still possible (server can't tell good aim from a script)
- [ ] Wallhack resistance: only send positions of players each client could plausibly see
- [ ] Enable GitHub Dependabot security alerts on the repo (repo Settings → Code security)
- [ ] Subresource Integrity for the unpkg Three.js import (or vendor `three.module.js` into `public/`)
