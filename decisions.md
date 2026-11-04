# Decisions

Important decisions and *why*. A fresh context should read this first (after `requirements.md`).

## Purpose & audience
- **Why the game exists:** a teacher demo of cloud VM usage. Students play live while the teacher screenshares `htop` on the droplet so they see CPU/RAM rise with load.
- **Players:** middle/high school students on **laptops** (touchpad or mouse + keyboard). No touch/mobile controls.
- **No accounts, no chat, no persistence.** Students click a link, get a random **parody** celebrity/model name (e.g., "Taylor Swiftly"). Real names were avoided because the players are minors in a school setting. Leaving resets you.

## Platform
- **Stack:** Node.js + Socket.io server, Three.js client loaded from unpkg CDN (no build step). One language, small footprint, quick to write.
- **Droplet:** Basic **$6/mo (1 vCPU / 1 GB), Ubuntu 24.04**. The teacher has $5 of credit that must last several *hours*, not days. $6/mo ≈ $0.009/hr, so cost is negligible. A small box is *better* for the lesson because load shows up visibly in htop.
- **Access:** plain `http://<droplet-ip>` on **port 80**. No domain/HTTPS. Port 80 avoids school firewalls blocking odd ports.
- **Install:** public GitHub repo `dwennersten-work/stain-wars` + one-liner `curl … install.sh | bash`. Runs as a systemd service `stainwars` from `/opt/stainwars`.

## Gameplay
- **Arena with timed game sessions.** Drop in any time. Until the teacher starts a game it's endless free play. `stainwars newgame [ffaMin] [teamMin]` wipes everyone's progress and runs: free-for-all (default 15 min) → Owl Showdown (default 5 min) → 30s results → free play. **No timer starts by itself**, so a game can't run out in an empty server before class. There is one game at a time in one arena (a single class on a small droplet doesn't need parallel rooms). All session state is in memory, since the server must not write files.
- **Game length:** the request said both "last 5 of 15" and "20 minutes total". We read that as 15 + 5 = 20. Any other split is one command away.
- **Owl Showdown (team finale).** Everyone becomes a Barn Owl or a Great Horned Owl, with different silhouettes (round + heart face vs. ear tufts + orange eyes) as well as colors (gold vs. purple), so a teammate can be spotted at a distance. Two team leaderboards replace the normal one. Money, shop, weapons and outfit resistance all work as before; the owl only replaces how you look. Everyone respawns when it starts.
- **Fair teams:** strength = stains earned + 25 × outfit tier. Humans are ranked (with ±10% jitter so splits vary) and dealt out in neighboring pairs, with the stronger of each pair going to the team that's behind; then the same for bots, so bots can't pile students onto one side. Latecomers join the smaller team. In simulation the average strength gap is ~4% vs. ~30% for a coin flip (a tiny class with one dominant player can't be fully evened out). No rebalancing if people leave.
- **"Stains" = total money earned this game** (`earned`), which spending doesn't reduce. The HUD now shows this instead of kills; kills stay on the leaderboard.
- **Team points:** eliminating an enemy scores the **victim's** `earned / 20`, rounded up, with a **minimum of 1** so a newcomer who earned $0 still counts. Big owls are the most valuable targets, which gives the losing team a way back. AFK victims score nothing (same anti-farm rule as money), but repeat kills aren't reduced, because re-killing the same enemy is normal in a small class. A player who leaves takes their name off the board, but their points stay with the team.
- **No friendly fire in the Showdown** (shots, splash and cream all pass through teammates). The request said "nothing else changes", but otherwise teammates could kill each other for money.
- **Owl size is linear in `earned`, relative to the top earner:** 0.8× at $0 up to 2.5× for the leader, so it works for any game length (a floor of $100 stops a first kill making someone giant). **Hitbox, headshot height and eye height scale too.** Otherwise shots would pass visibly through a giant owl. So the best player is the biggest target and worth the most, but can see over boxes. Movement speed, jump and collision radius don't change, so `clientMove` is unaffected.
- **Weapons (food), bought in the shop (B), kept forever:** everyone starts with only the 1 Mustard squirter. Prices go up with power: 2 Soda shotgun $40 (8 pellets, close range), 3 Spaghetti whip $60 (wide 4m melee), 4 Hamburger grenade $100 (lobbed, big splash), 5 Pie launcher $150 (heavy, small splash), 6 Ketchup sniper $250 with a **hotdog scope** (right-click / Shift).
- **Sniper: headshot = 1 shot, body = 2 shots, always.** It ignores stain resistance, so the rule holds against every outfit. Balanced by the 1.4s cooldown, the highest price, and the need to aim. Headshot = hit above feet + 1.62m (server-side).
- **Whipped cream bomb = flashbang.** A consumable, thrown with G: $30 for 3, carry max 6. Blinds players within 10m (not the thrower) for 0.8 to 4s, halved if they face away. The blind is drawn by the client, so a cheater could ignore it. Accepted for a classroom game. Bots stop aiming while blinded.
- **Outfits = armor.** 10 tiers, 0 to 45% stain resistance (capped lower than before because outfits are now permanent). **Bought one level at a time** (must own tier N to buy N+1). Higher tiers are wilder colors and glow, and the top tiers animate, so strength is visible at a glance.
- **Money only from kills.** Reward = $20 + $15 × victim tier (stronger victim → more $). The first upgrade costs about 2 kills. Everything together is about $2,500.
- **Nothing is lost on death** (outfits, weapons, money all kept). This was changed from "drop a tier" because purchases should feel permanent. Respawn after ~2s. Leaving the game still resets you.
- **Sounds are synthesized** with Web Audio (squirts, fizz, burps, boings, splats, kazoo kill, sad-trombone death, ka-ching). No audio files, so nothing extra to download.
- **Server-authoritative** for projectiles/damage/money. Clients simulate their own movement (smooth, no input lag), but the **server validates every move** (`clientMove` in `server.js`). It caps speed with a token bucket (refills at 1.05× walk speed; a 2.5m burst cap absorbs lag), caps height at a legit jump above the last ground, limits air time to 1.5s, and stops walking through boxes. If a move is rejected, the server sends `setpos` to snap the client back. *Why:* students edited speed and gravity in their own browsers. Validation fixed that without a rewrite or a database. Full server-side movement with client prediction was rejected as too big for the MVP.
- **Bots are intentionally derpy:** random walking, spinning, jumping, spraying in random directions. Their main job is to add server load for the lesson, plus silliness.

## Admin
- **System usage = just `htop`** for now (saves time/tokens). A web admin dashboard is on the TODO list.
- **Teacher controls are CLI only:** `stainwars newgame [ffaMin] [teamMin] | skip | stop | reset | bots N | nobots | status` on the droplet. They hit localhost-only HTTP endpoints on the game server.

## Security
The goal is to make sure that hosting the game can't hurt the teacher's GitHub or DigitalOcean accounts, and that students can't break the game.
- **No secrets anywhere.** The repo is public, and the droplet never gets a DigitalOcean API token or `doctl` login. A compromised droplet then can't reach the DigitalOcean account. The teacher deletes the droplet after class.
- **The GitHub account is the root key.** `install.sh` and `stainwars update` run code from the repo as root, so GitHub 2FA is required (done).
- **The service runs as user `stainwars`, not root.** It is sandboxed with systemd (`ProtectSystem=strict` etc.) and is allowed to bind port 80 only through `CAP_NET_BIND_SERVICE`. The server never writes files.
- **`npm ci`** installs exact locked versions, so an install never pulls in a surprise new dependency release.
- **Every socket message is validated** for type, range, and finiteness before use. A bad packet used to crash the process, and `w: "__proto__"` used to leak projectiles.
- **Shots:** the client sends only the weapon and aim direction. The server fires from its own copy of the player's eyes (no shooting from behind walls). It checks ownership/ammo and enforces one shared cooldown across guns (no firing sniper + pie + burger in one instant), the same as the real client. A blinded player's shots get heavy spread on the server, so hiding the whipped cream in a hacked client doesn't help much.
- **Movement:** moves are swept in 0.3m steps (no blinking through thin boxes), and the lag allowance is 2.5m. Bunny hops that land between 20Hz samples are detected (rising again near the ground after falling, or stepping onto a box top) so honest players aren't snapped back. A pinned flyer stays pinned until its client reports the ground.
- **Anti kill-farming** (feeding kills from extra tabs, which is easy because a school shares one IP): killing someone idle for 15s+ gives no kill and no money. Killing the same person again within 2 min pays half each time. Income is capped by a bucket of $5/s (max $500 saved), about what a great legit player earns.
- **Speed hacks:** students changed `Shared.SPEED` in the console. The server used to refill the movement budget at 1.3× walk speed, so a hacker kept a steady ~30% boost, and on their own screen they zoomed ahead for 0.5s between snap-backs. Now the refill is 1.05× and snap-backs come every 250ms. In simulation, 1.25×, 2× and 4× hacks all end up at about 1.0× on the server, with zero snap-backs for honest players (even with network jitter and bunny hopping).
- **`Shared` is deep-frozen** (end of `shared.js`), so console edits to speed, weapons, outfits or boxes do nothing. It is a speed bump, not real protection: a determined student can still edit the files with DevTools overrides. The **server checks are the real defense**, so never rely on client-side freezing for anything that matters. Don't assign to `Shared` after load (nothing does today).
- **Not preventable without a big rewrite:** aimbots/triggerbots (good aim looks the same as a script) and wallhacks (every client gets every position). Both are noted in TODO.
- **Abuse limits:** 80 humans total and 40 per IP. The per-IP limit is generous because a whole school shares one IP through NAT. Each socket may send 60 messages per second before it's disconnected, and socket.io messages are capped at 10KB.
- **Admin endpoints are localhost-only** (checked against the socket's remote address, which can't be spoofed without a proxy). Don't put a reverse proxy in front without adding a password, or the admin endpoints become public.

## Process
- Build an MVP fast ("the gist"), keep error checking minimal, and track extras in `TODO.md`.
