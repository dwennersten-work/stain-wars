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
- **Endless arena**, live leaderboard, drop in any time.
- **Weapons (food):** 1 Mustard squirter (rapid, short range), 2 Hamburger grenade (lobbed, splash), 3 Ketchup sniper with a **hotdog scope** (right-click / Shift zooms with a hotdog-bun overlay).
- **Outfits = armor.** 10 tiers. Each tier adds "stain resistance" (damage reduction). Higher tiers are wilder colors and glow, and the top tiers animate, so strength is visible at a glance.
- **Money only from kills.** Reward scales with the victim's tier (stronger victim → more $).
- **On death you drop one outfit tier** (you keep your money). Respawn after ~2s.
- **Server-authoritative** for projectiles/damage/money. Clients simulate their own movement (smooth, no input lag), but the **server validates every move** (`clientMove` in `server.js`). It caps speed with a token bucket (1.3× walk speed plus a small lag allowance), caps height at a legit jump above the last ground, limits air time to 1.5s, and stops walking through boxes. If a move is rejected, the server sends `setpos` to snap the client back. *Why:* students edited speed and gravity in their own browsers. Validation fixed that without a rewrite or a database. Full server-side movement with client prediction was rejected as too big for the MVP.
- **Bots are intentionally derpy:** random walking, spinning, jumping, spraying in random directions. Their main job is to add server load for the lesson, plus silliness.

## Admin
- **System usage = just `htop`** for now (saves time/tokens). A web admin dashboard is on the TODO list.
- **Teacher controls are CLI only:** `stainwars reset | bots N | nobots | status` on the droplet. They hit localhost-only HTTP endpoints on the game server.

## Security
The goal is to make sure that hosting the game can't hurt the teacher's GitHub or DigitalOcean accounts, and that students can't break the game.
- **No secrets anywhere.** The repo is public, and the droplet never gets a DigitalOcean API token or `doctl` login. A compromised droplet then can't reach the DigitalOcean account. The teacher deletes the droplet after class.
- **The GitHub account is the root key.** `install.sh` and `stainwars update` run code from the repo as root, so GitHub 2FA is required (done).
- **The service runs as user `stainwars`, not root.** It is sandboxed with systemd (`ProtectSystem=strict` etc.) and is allowed to bind port 80 only through `CAP_NET_BIND_SERVICE`. The server never writes files.
- **`npm ci`** installs exact locked versions, so an install never pulls in a surprise new dependency release.
- **Every socket message is validated** for type, range, and finiteness before use. A bad packet used to crash the process, and `w: "__proto__"` used to leak projectiles.
- **Abuse limits:** 80 humans total and 40 per IP. The per-IP limit is generous because a whole school shares one IP through NAT. Each socket may send 60 messages per second before it's disconnected, and socket.io messages are capped at 10KB.
- **Admin endpoints are localhost-only** (checked against the socket's remote address, which can't be spoofed without a proxy). Don't put a reverse proxy in front without adding a password, or the admin endpoints become public.

## Process
- Build an MVP fast ("the gist"), keep error checking minimal, and track extras in `TODO.md`.
