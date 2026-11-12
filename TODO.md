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

## Phase 5 — Game sessions & Owl Showdown
- [x] Timed sessions: free-for-all → team finale → results → free play
- [x] `stainwars newgame [ffaMin] [teamMin]`, `skip`, `stop`; custom time limits
- [x] Random but strength-balanced teams; latecomers join the smaller team
- [x] Barn Owl and Great Horned Owl models, team colors, size by stains earned (hitbox and eye height too)
- [x] Big owls (over ~1.4×) collide at their size and can't fit through doors, so smaller players can snipe them
- [x] Trees no longer spawn inside the corner lookouts
- [x] Team scoring: victim's earnings / 20, rounded up (min 1); no friendly fire
- [x] Two team leaderboards, game clock, score display, final results screen
- [ ] Playtest with a real class: owl size range, team points, whether giant owls see too far over boxes, whether the ~1.4× door cutoff is too strict (fix: taller doors)

## Phase 6 — Buildings & progression
- [x] Map doubled to 160m × 160m; fog, camera range and sniper range to match
- [x] 3D collision (floors, ceilings, stairs), with a grid so about 2,000 boxes stay cheap
- [x] Hollow low-poly buildings with stairs, rooms, windows and walled roofs, plus 4 sniper lookouts
- [x] Double jump
- [x] Instant stain on a drop over 5× your height (server-side)
- [x] Cafeteria Tray shield: front only, one-handed food only, back 5s after breaking
- [x] Weapon levels and buyable +5% damage upgrades, priced like outfits
- [x] Blasts and cream stopped by walls; name tags hidden by walls
- [x] Server anti-cheat updated: double jump, floors, ceilings, long falls
- [ ] Test the branch on a droplet, then merge to main
- [ ] Check shooting, tray hit sounds and the level-up popup in a real browser
- [ ] Playtest with a real class: map size, tray price/HP, level thresholds, whether lookouts are too strong
- [ ] Check frame rate on real school laptops (tested only on a software renderer so far)

## Later (ideas, not started)
- [ ] Minimap or compass, now that the map is bigger
- [ ] Teach bots to use stairs (today they only wander up by accident)
- [ ] Bridges between rooftops
- [ ] Warning when you're about to take a fatal drop
- [ ] Rebalance teams if many players leave during the Showdown
- [ ] Web admin dashboard `/admin`: live CPU/RAM/network/player-count graphs for screensharing
- [ ] Show "cost per player" (CPU %/bandwidth per connected player)
- [ ] Password-protected admin page with reset / add-bots buttons
- [x] Mobile/touch controls (joystick, drag to aim, tap weapon bar, small HUD)
- [x] First phone playtest (student): aim sensitivity raised 0.0055 → 0.0075; emoji fire/jump/scope buttons replaced with line icons
- [ ] Playtest touch controls on more phones (iPhone Safari and Android Chrome): new aim speed, button sizes, notch insets. Maybe an in-game sensitivity slider
- [x] Shots start where the shooter really is when strafing (position sent right before each shot)
- [x] Kill reward grows with tier² instead of +$15 per tier (cheap outfits no longer nearly double your bounty)
- [ ] Playtest the new reward curve: does the early game feel too slow?
- [ ] More maps / map rotation
- [ ] Playtest balance with a real class (prices, sniper strength, blind length)
- [ ] Outfit preview in the shop (3D spin)
- [ ] Client-side prediction/interpolation improvements
- [ ] Stronger anti-cheat: aimbots and auto-fire are still possible (server can't tell good aim from a script)
- [ ] Wallhack resistance: only send positions of players each client could plausibly see
- [ ] Enable GitHub Dependabot security alerts on the repo (repo Settings → Code security)
- [ ] Subresource Integrity for the unpkg Three.js import (or vendor `three.module.js` into `public/`)
