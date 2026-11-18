# 🍔 Stain Wars 🌭

A derpy, low-poly, browser multiplayer food fight for teaching cloud computing. Students join with a link and start with a mustard squirter, then spend their winnings on soda shotguns, spaghetti whips, hamburger grenades, pie launchers, a ketchup sniper (with a hotdog scope), whipped cream "flashbangs", a cafeteria tray shield, weapon damage upgrades, and wilder, more stain-resistant outfits. The map is a little food town: streets, 22 buildings to explore, rooftops to snipe from, ziplines between roofs, 8 drivable food trucks and a gas station. Games end with the whole class vs. a giant Thanksgiving turkey. Meanwhile, the teacher shows the VM working hard in `htop`.

## Install on a DigitalOcean droplet
1. Create a droplet: **Ubuntu 24.04, Basic, Regular, $6/mo (1 vCPU / 1 GB)**. It costs about $0.009/hour, so delete it when class is done.
2. SSH in as root (or use the droplet's web Console) and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/dwennersten-work/stain-wars/main/install.sh | bash
   ```
3. Give students `http://<droplet-ip>`. Run `stainwars url` any time to see it again.

To try out a branch before it goes to `main`, use that branch's script and name the branch:
```bash
curl -fsSL https://raw.githubusercontent.com/dwennersten-work/stain-wars/<branch>/install.sh | BRANCH=<branch> bash
```
Re-run it to get newer commits from that branch. To go back, run the normal install command above.

## During class
| Command | What it does |
|---|---|
| `htop` | Live CPU/RAM. Screenshare this. |
| `stainwars newgame` | Start a fresh 25-minute game: 15 min free-for-all, 5 min team Owl Showdown, then a 5 min Turkey Boss |
| `stainwars newgame 10 3 4` | Custom times: 10 min free-for-all + 3 min Owl Showdown + 4 min Turkey Boss (`0` skips a phase: `newgame 15 5 0` = no turkey) |
| `stainwars boss 5` | Jump straight into a 5 min Thanksgiving boss fight (everyone starts fresh) |
| `stainwars skip` | Jump to the next phase now |
| `stainwars stop` | End the game, back to free play (everyone keeps their stuff) |
| `stainwars url` | Print the link to give students (`http://<droplet-ip>`) |
| `stainwars status` | Game phase, time left, team score, humans, bots, projectiles in flight, server memory |
| `stainwars bots 20` | Add 20 derpy bots (more load!). At most 150 bots in total |
| `stainwars nobots` | Remove bots |
| `stainwars reset` | Stop any game; everyone back to Plain Beige Tee and $0 |
| `stainwars logs` | Follow the server log |
| `stainwars update` | Pull the latest version of the installed branch and restart |
| `stainwars student add '<key>'` | Let a student run games over SSH: a `student` login that only gets a menu of game commands, `htop` and logs (no shell, no sudo). See [student_access.md](student_access.md) |
| `stainwars student remove` | Take that access away (or just delete the droplet) |

**Lesson idea:** start with no one connected and look at `htop`. Let students join and watch CPU go up. Then run `stainwars bots 50` and watch it climb more.

## How a game works
Until you run `stainwars newgame`, it's endless free play and no timer runs. A game starts everyone from zero as a free-for-all. For the Owl Showdown, everyone is split into two fair teams and becomes a Barn Owl or a Great Horned Owl, sized by the stains (money) they've earned this game. Owls over about 1.4× are too big to fit through doors, so smaller players can snipe them from the buildings. Eliminating an enemy scores your team their earnings ÷ 20, rounded up. The higher team score wins.

**Turkey Boss (Thanksgiving):** everyone is on the same side (no friendly fire) against Tom Gobbleton, a giant turkey in the Town Square. The whole town turns autumn colors. It lobs gravy bombs, sprays cranberries, rains stuffing on rooftop campers, and stomps (jump to dodge!). Head hits do double damage, and every 10 damage pays $1. Its HP scales with the class (4,000 per student, 400 per bot). Stain it before the clock runs out for a Thanksgiving feast screen; otherwise the turkey gets away.

## Controls
WASD + Space to move and jump (press Space again in the air to double jump) · mouse to aim · click to shoot · 1-6 or Q to switch weapons · right-click or Shift for the hotdog scope · G to throw a whipped cream bomb · B for the shop · E to drive or ride a car, or grab a zipline (E again to get out or let go) · T for emotes (then 1-4).

**Driving:** W/S gas and reverse, A/D steer, Space brake, H honk. Passengers can shoot, drivers can't. Hitting someone at speed stains them. Cars run on gas: fill up by driving onto the pad at **Gobble Gas** (north of the Town Square, ⛽ on the minimap). Out of gas = stuck; an empty stuck car gets towed home after 20s, and a washed-out car comes back after 15s.

**Phones and tablets** (held sideways): drag on the left to move · drag on the right to aim · hold 💥 to shoot (keep dragging to aim) · ⬆ to jump · tap the bottom bar for weapons, cream bombs, 💃 emotes and the shop · 🌭 toggles the scope · a 🚗/🚡 button pops up near cars and ziplines (the left thumb drives).

## Good to know
- **Falls:** a drop of more than 5× your height (10m) stains you instantly. Three-story roofs and the corner lookouts are that high, so take the stairs down.
- **Cafeteria Tray ($120):** blocks hits from the front while you hold one-handed food (not the Soda Shotgun or Ketchup Sniper). It comes back 5 seconds after it breaks.
- **Emotes:** Disco Fever, Fish Belly Flop, 6 7 (watch the fingers), and Orange Justice, each with its own synthesized music that people nearby hear too. Moving or shooting stops the dance.
- **Ziplines** run between roofs across streets (and over the Town Square). Letting go high up is a long fall, and long falls stain.
- **Weapon levels:** stains with a weapon level it up. Each level unlocks a +5% damage upgrade in the shop, up to +25%. The price matches the same step of stain resistance, so upgrades and outfits balance out.

## Run locally
```bash
npm install
npm start   # http://localhost:3000
```
