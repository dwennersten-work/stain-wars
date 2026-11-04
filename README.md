# 🍔 Stain Wars 🌭

A derpy, low-poly, browser multiplayer food fight for teaching cloud computing. Students join with a link and start with a mustard squirter, then spend their winnings on soda shotguns, spaghetti whips, hamburger grenades, pie launchers, a ketchup sniper (with a hotdog scope), whipped cream "flashbangs", and wilder, more stain-resistant outfits. Meanwhile, the teacher shows the VM working hard in `htop`.

## Install on a DigitalOcean droplet
1. Create a droplet: **Ubuntu 24.04, Basic, Regular, $6/mo (1 vCPU / 1 GB)**. It costs about $0.009/hour, so delete it when class is done.
2. SSH in as root (or use the droplet's web Console) and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/dwennersten-work/stain-wars/main/install.sh | bash
   ```
3. Give students `http://<droplet-ip>`.

## During class
| Command | What it does |
|---|---|
| `htop` | Live CPU/RAM. Screenshare this. |
| `stainwars newgame` | Start a fresh 20-minute game: 15 min free-for-all, then a 5 min team Owl Showdown |
| `stainwars newgame 10 3` | Custom times: 10 min free-for-all + 3 min Owl Showdown (`newgame 0 5` skips straight to owls) |
| `stainwars skip` | Jump to the next phase now |
| `stainwars stop` | End the game, back to free play (everyone keeps their stuff) |
| `stainwars status` | Game phase, time left, team score, humans, bots, projectiles in flight, server memory |
| `stainwars bots 20` | Add 20 derpy bots (more load!) |
| `stainwars nobots` | Remove bots |
| `stainwars reset` | Stop any game; everyone back to Plain Beige Tee and $0 |
| `stainwars logs` | Follow the server log |
| `stainwars update` | Pull the latest version and restart |

**Lesson idea:** start with no one connected and look at `htop`. Let students join and watch CPU go up. Then run `stainwars bots 50` and watch it climb more.

## How a game works
Until you run `stainwars newgame`, it's endless free play and no timer runs. A game starts everyone from zero as a free-for-all. For the Owl Showdown, everyone is split into two fair teams and becomes a Barn Owl or a Great Horned Owl, sized by the stains (money) they've earned this game. Eliminating an enemy scores your team their earnings ÷ 20, rounded up. The higher team score wins.

## Controls
WASD + Space to move and jump · mouse to aim · click to shoot · 1-6 or Q to switch weapons · right-click or Shift for the hotdog scope · G to throw a whipped cream bomb · B for the shop.

## Run locally
```bash
npm install
npm start   # http://localhost:3000
```
