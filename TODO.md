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
- [ ] Rate limiting / anti-cheat (low priority for classroom)
