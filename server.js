const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const S = require('./public/shared.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
// Abuse limits. Per-IP is generous because a whole classroom shares one school IP (NAT).
const MAX_HUMANS = 80, MAX_PER_IP = 40, MAX_MSGS_PER_SEC = 60, MAX_BOTS = 150;
// Anti kill-farming (students feeding kills from extra tabs): idle victims pay nothing, repeat kills on the
// same victim pay half each time, and income is capped near what a great legit player can earn.
const IDLE_MS = 15000, REPEAT_MS = 120000, EARN_PER_SEC = 5, EARN_MAX = 500;
const JUMP_H = S.MAX_RISE;   // legit max jump height (a double jump, second press at the top of the first)
const BOSS_ID = -1;          // owner id of the turkey's projectiles
const vec3 = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
const clamp1 = (n) => Math.max(-1, Math.min(1, n));
const ipCount = new Map();

const players = new Map();   // id -> player
const projectiles = new Map();
let nextId = 1;
// Game session: free -> ffa -> team -> boss -> ended -> free. 'free' is endless play with no timer, waiting for the teacher.
const session = { phase: 'free', endsAt: 0, teamMs: 0, bossMs: 0, scores: [0, 0], results: null, teamRes: null };

// ---------- HTTP: static files + localhost-only admin ----------
const server = http.createServer((req, res) => {
  let url;   // a bad path like "//" makes new URL throw, which used to crash the whole server
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
  if (url.pathname.startsWith('/admin/')) {
    const ip = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) { res.writeHead(403); return res.end('localhost only'); }
    return admin(url, res);
  }
  const file = path.join(PUB, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(404); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    res.end(data);
  });
});

function admin(url, res) {
  const cmd = url.pathname.slice(7);
  const mins = (k, def) => { const n = parseFloat(url.searchParams.get(k)); return Number.isFinite(n) ? Math.max(0, Math.min(180, n)) : def; };
  let msg;
  if (cmd === 'newgame') {
    const ffa = mins('ffa', S.FFA_MIN), team = mins('team', S.TEAM_MIN), bossMin = mins('boss', S.BOSS_MIN);
    if (ffa + team + bossMin > 0) {
      startGame(ffa * 60000, team * 60000, bossMin * 60000);
      msg = `New game: ${ffa} min free-for-all + ${team} min Owl Showdown + ${bossMin} min Turkey Boss. Everyone starts fresh.`;
    } else msg = 'A game needs some time: newgame <ffaMinutes> <teamMinutes> <bossMinutes>';
  } else if (cmd === 'boss') {
    const m = mins('min', S.BOSS_MIN) || S.BOSS_MIN;
    startGame(0, 0, m * 60000);
    msg = `Turkey boss battle! Everyone starts fresh and has ${m} min to defeat ${S.BOSS.name} together.`;
  } else if (cmd === 'skip') {
    if (session.phase === 'free') msg = 'No game running.'; else { advance(); msg = 'Skipped to the next phase.'; }
  } else if (cmd === 'stop') {
    freePlay();
    msg = 'Game stopped. Back to free play (everyone keeps their stuff).';
  } else if (cmd === 'reset') {
    resetAll();
    setPhase('free', 0);
    msg = 'Game stopped. Everyone reset to Plain Beige Tee, mustard only, $0, 0 kills.';
  } else if (cmd === 'bots') {
    const have = [...players.values()].filter(p => p.bot).length;   // total cap: repeated "bots 100" could swamp a small droplet
    const n = Math.max(0, Math.min(100, MAX_BOTS - have, parseInt(url.searchParams.get('n')) || 10));
    for (let i = 0; i < n; i++) addBot();
    msg = `Added ${n} derpy bots` + (n < 100 && have + n >= MAX_BOTS ? ` (max ${MAX_BOTS} bots).` : '.');
  } else if (cmd === 'nobots') {
    for (const p of players.values()) if (p.bot) players.delete(p.id);
    msg = 'All bots removed.';
  } else if (cmd !== 'status') msg = 'commands: newgame?ffa=15&team=5&boss=5 | boss?min=5 | skip | stop | reset | bots?n=10 | nobots | status';
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end((msg ? msg + '\n' : '') + status() + '\n');
}

function status() {
  const all = [...players.values()];
  const mem = process.memoryUsage().rss / 1048576;
  const left = session.endsAt ? Math.ceil((session.endsAt - Date.now()) / 1000) + 's' : '-';
  const turkey = boss.on ? ` turkeyHP=${Math.ceil(boss.hp)}/${boss.max}` : '';
  return `phase=${session.phase} left=${left} score=${session.scores.join('-')}${turkey} humans=${all.filter(p => !p.bot).length} bots=${all.filter(p => p.bot).length} cars=${vehicles.filter(v => !v.dead).length}/${vehicles.length} projectiles=${projectiles.size} memMB=${mem.toFixed(0)}`;
}

// ---------- Players ----------
function pickName(bot) {
  const used = new Set([...players.values()].map(p => p.name));
  const free = S.NAMES.filter(n => !used.has(n) && !used.has('Bot ' + n));
  const base = free.length ? free[Math.floor(Math.random() * free.length)] : S.NAMES[Math.floor(Math.random() * S.NAMES.length)] + ' ' + nextId;
  return bot ? 'Bot ' + base : base;
}

// Humans start with mustard only. Bots get every regular weapon so they stay chaotic.
function startKit(bot) {
  return { tier: 0, ammo: 0, owned: S.WEAPONS.map((W, i) => i === 0 || (bot && !W.pack)), weapon: 0,
    wstains: S.WEAPONS.map(() => 0), dmgLv: S.WEAPONS.map(() => 0), hasTray: false, trayHp: 0, trayBackAt: 0, trayReadyAt: 0 };
}

const spawnSpot = () => S.randomSpawn(session.phase === 'boss' ? 45 : 0);   // boss fights: start out of stomping range

function newPlayer(bot, socket) {
  const p = { id: nextId++, name: pickName(bot), bot, socket, ...spawnSpot(), vy: 0, ry: 0, ...startKit(bot),
    hp: S.MAX_HP, money: 0, earned: 0, kills: 0, deaths: 0, team: 0, scale: 1, teamPts: 0, dead: false, lastFire: S.WEAPONS.map(() => 0), lastShot: 0, lastHit: 0,
    blindUntil: 0, msgs: 0, lastFix: 0, lastActive: Date.now(), farm: new Map(), earn: 200,
    veh: null, seat: -1, zip: null, emote: 0, emoteAt: 0, runAt: 0, bossDmg: 0, bossPaid: 0 };
  resetMove(p);
  if (session.phase === 'team') { p.team = weakerTeam(); p.scale = S.OWL_MIN; }   // latecomers even out the teams
  if (boss.on) { const add = bot ? S.BOSS.hpBot : S.BOSS.hpHuman; boss.max += add; boss.hp += add; }   // more players, tougher turkey
  players.set(p.id, p);
  return p;
}

function playerLeft(p) {
  leaveVehicle(p, false);
  players.delete(p.id);
  if (boss.on && boss.max > S.BOSS.hpMin) {   // fewer players, weaker turkey (keeps the same fraction of HP left)
    const max = Math.max(S.BOSS.hpMin, boss.max - (p.bot ? S.BOSS.hpBot : S.BOSS.hpHuman));
    boss.hp = Math.max(1, boss.hp * max / boss.max); boss.max = max;
  }
}

function respawn(p) {
  leaveVehicle(p, false); p.zip = null; p.emote = 0;
  Object.assign(p, spawnSpot(), { vy: 0, hp: S.MAX_HP, dead: false });
  resetMove(p);
  if (p.hasTray) { p.trayHp = S.TRAY.hp; p.trayBackAt = 0; sendMe(p); }
  if (p.socket) p.socket.emit('respawn', { x: p.x, y: p.y, z: p.z });
}

// ---------- Movement anti-cheat ----------
// Clients simulate their own movement, but the server only accepts moves a legit client could make:
// horizontal speed via a token bucket, a jump-height ceiling, and a max air time (stops low-gravity floating).
function resetMove(p) {
  Object.assign(p, { budget: 0, air: 0, pinned: false, falling: false, peak: p.y + JUMP_H + 0.3, fallTop: p.y, lastMove: Date.now(), ignoreUntil: Date.now() + 500 });
}

// Walk from p toward q in small 3D steps so a big move can't skip through a wall, a floor or a ceiling.
function sweep(p, q) {
  const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) / 0.3) || 1, c = { x: p.x, y: p.y, z: p.z, scale: p.scale };
  const H = S.HEADROOM * S.bodyScale(p);
  const sx = (q.x - p.x) / n, sy = (q.y - p.y) / n, sz = (q.z - p.z) / n;
  let g = 0;
  for (let i = 0; i < n; i++) {
    c.x += sx; c.y += sy; c.z += sz;
    g = S.resolve(c);
    if (c.y < g) c.y = g;   // can't sink through a floor
    else if (sy > 0 && c.y > g + 0.05 && c.y + H > c.ceil + 0.15) c.y = c.ceil - H;   // or rise through a ceiling
  }
  q.x = c.x; q.y = c.y; q.z = c.z;
  return g;
}

// Called whenever the player touches down (landed) or is in the air, with the height of the ground below them.
// The drop is measured from the highest point since they last stood on something, so a late double jump can't save you.
function trackFall(p, landed, g, y) {
  if (!landed) { p.fallTop = Math.max(p.fallTop, y); return false; }
  const drop = p.fallTop - g;
  p.fallTop = y;
  if (drop <= S.fallLimit(p.scale)) return false;
  fallDeath(p);
  return true;
}

function clientMove(p, a) {
  const now = Date.now();
  // In a car or on a zipline the server moves you: only the look direction is taken from the client.
  if ((p.veh || p.zip) && Array.isArray(a) && Number.isFinite(a[3])) { p.ry = a[3]; p.lastMove = now; return; }
  if (p.dead || p.veh || p.zip || now < p.ignoreUntil || !Array.isArray(a) || a.length !== 4 || !a.every(Number.isFinite)) return;
  const dt = Math.min(0.5, (now - p.lastMove) / 1000);
  p.lastMove = now;
  // Refill at barely over walk speed; the 2.5m cap (~250ms) absorbs lag bursts. A 1.3x rate let speed hacks keep 30%.
  p.budget = Math.min(2.5, p.budget + dt * S.SPEED * 1.05);
  const q = { x: a[0], y: Math.min(a[1], p.peak), z: a[2] };   // capped first, so a huge y can't sail over a wall in the sweep
  const dx = q.x - p.x, dz = q.z - p.z, dist = Math.hypot(dx, dz);
  if (dist > p.budget) { q.x = p.x + dx / dist * p.budget; q.z = p.z + dz / dist * p.budget; }
  p.budget -= Math.min(dist, p.budget);
  const g = sweep(p, q);   // no walking through boxes or out of the arena
  let landed = false;
  if (q.y <= g + 0.05) { q.y = Math.max(q.y, g); p.air = 0; p.peak = g + JUMP_H + 0.3; p.pinned = false; landed = true; }
  else if (p.pinned) q.y = g;   // stays pinned until the client admits it landed
  else {
    // Rising again just after falling near the ground = a landing we missed between 20Hz samples (bunny hop).
    // Floating cheaters never get here: they'd have to come back down to the ground first.
    // Fast falls cover up to ~2m between samples, hence the 2.2m window.
    if (q.y > p.y && p.falling && p.y <= g + 2.2) { p.air = 0; p.peak = g + JUMP_H + 0.3; landed = true; }
    // Over a box top (g > 0 only counts boxes we're nearly on top of): the client may have stepped onto it mid-jump.
    if (g > 0 && g + JUMP_H + 0.3 > p.peak) { p.peak = g + JUMP_H + 0.3; p.air = 0; }
    p.air += dt;
    if (q.y > p.peak) q.y = p.peak;
    // Air time allows for a double jump plus the fall back down, however far that is.
    if (p.air > 1.5 + Math.sqrt(2 * Math.max(0, Math.max(p.fallTop, q.y) - g) / S.GRAVITY)) { q.y = g; p.pinned = true; landed = true; }
  }
  if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) > 0.05 || Math.abs(a[3] - p.ry) > 0.05) p.lastActive = now;
  if (p.emote && Math.hypot(q.x - p.x, q.z - p.z) > 0.05) p.emote = 0;   // walking cancels a dance
  p.falling = q.y < p.y;
  p.x = q.x; p.y = q.y; p.z = q.z; p.ry = a[3];
  if (trackFall(p, landed, g, q.y)) return;
  // Tell a cheating (or badly lagging) client where it really is.
  if (Math.hypot(q.x - a[0], q.y - a[1], q.z - a[2]) > 0.5 && now - p.lastFix > 250) {
    p.lastFix = now;
    p.socket.emit('setpos', { x: p.x, y: p.y, z: p.z });
  }
}

function sendMe(p) {
  if (p.socket) p.socket.emit('me', { money: p.money, earned: p.earned, tier: p.tier, kills: p.kills, ammo: p.ammo, owned: p.owned.map(Number),
    wstains: p.wstains, dmgLv: p.dmgLv, tray: p.hasTray ? 1 : 0, trayHp: Math.ceil(p.trayHp), trayIn: p.trayHp > 0 ? 0 : Math.max(0, p.trayBackAt - Date.now()) });
}

// Outfits: only the next level up. Weapons: once each. Cream bombs: a pack at a time, capped.
function buyOutfit(p, tier) {
  const o = S.OUTFITS[tier];
  if (tier !== p.tier + 1 || !o || p.money < o.cost) return;
  p.money -= o.cost; p.tier = tier; sendMe(p);
}

function buyWeapon(p, w) {
  const W = S.WEAPONS[w];
  if (!W || p.money < W.cost) return;
  if (W.pack) { if (p.ammo >= W.maxAmmo) return; p.ammo = Math.min(W.maxAmmo, p.ammo + W.pack); }
  else if (p.owned[w]) return;
  else p.owned[w] = true;
  p.money -= W.cost; sendMe(p);
}

function buyTray(p) {
  if (p.hasTray || p.money < S.TRAY.cost) return;
  p.money -= S.TRAY.cost; p.hasTray = true; p.trayHp = S.TRAY.hp; p.trayReadyAt = 0; sendMe(p);
}

// One damage level at a time, and only levels already earned with stains from that weapon.
function buyUpgrade(p, w) {
  const W = S.WEAPONS[w];
  if (!W || !p.owned[w] || !S.canUpgrade(W)) return;
  const n = p.dmgLv[w];
  if (n >= S.weaponLevel(p.wstains[w]) || p.money < S.upgradeCost(n)) return;
  p.money -= S.upgradeCost(n); p.dmgLv[w] = n + 1; sendMe(p);
}

// Switching food takes the tray down briefly, so flicking to a one-handed weapon between sniper shots can't block everything.
function equip(p, w) {
  if (!S.WEAPONS[w] || S.WEAPONS[w].pack || !p.owned[w] || p.weapon === w) return;
  p.weapon = w;
  p.trayReadyAt = Date.now() + S.TRAY.raiseMs;
}

const trayUp = (p, now) => p.hasTray && p.trayHp > 0 && !S.WEAPONS[p.weapon].twoHanded && now >= p.trayReadyAt;

// ---------- Emotes ----------
// Purely for fun: the server only remembers which dance you're doing so everyone sees (and hears) it.
function emote(p, n) {
  if (n < 0 || p.dead || p.veh || p.zip) { p.emote = 0; return; }
  p.emote = n + 1; p.emoteAt = Date.now();
}

// ---------- Vehicles ----------
// The server drives every car: the driver only sends throttle and steering, so nobody can speed-hack a car.
const vehicles = S.VEHICLES.map(([type, x, z, ry], id) => ({ id, type, home: { x, z, ry }, seats: [] }));
const vFwd = (v) => [-Math.sin(v.ry), -Math.cos(v.ry)];
const vRight = (v) => [Math.cos(v.ry), -Math.sin(v.ry)];

function resetVehicle(v) {
  const T = S.VEHICLE_TYPES[v.type];
  for (const id of v.seats) { const p = players.get(id); if (p) leaveVehicle(p); }
  Object.assign(v, { x: v.home.x, z: v.home.z, ry: v.home.ry, speed: 0, thr: 0, steer: 0, inputAt: 0, hp: T.hp, fuel: S.FUEL_MAX,
    dead: false, backAt: 0, emptySince: Date.now(), seats: T.seats.map(() => 0) });
}
vehicles.forEach(resetVehicle);

function seatPos(v, i) {
  const [r, f] = S.VEHICLE_TYPES[v.type].seats[i], F = vFwd(v), R = vRight(v);
  return [v.x + R[0] * r + F[0] * f, v.z + R[1] * r + F[1] * f];
}

// E near a car: hop in, driver's seat first.
function enterVehicle(p) {
  if (p.dead || p.zip || p.veh || p.y > 2.5) return;
  let best = null, bd = S.ENTER_R;
  for (const v of vehicles) {
    const d = S.vehDist(v.type, v.x, v.z, v.ry, p.x, p.z);
    if (!v.dead && d < bd && v.seats.includes(0)) { bd = d; best = v; }
  }
  if (!best) return;
  p.seat = best.seats.indexOf(0); best.seats[p.seat] = p.id; p.veh = best; p.emote = 0;
  [p.x, p.z] = seatPos(best, p.seat); p.y = S.SEAT_Y;   // in your seat right away, not standing next to the car until the next tick
  if (p.seat === 0) best.inputAt = 0;
}

// place = step out beside the car (false when dying, respawning or leaving the game).
function leaveVehicle(p, place = true) {
  const v = p.veh, seat = p.seat;
  if (!v) return;
  if (v.seats[seat] === p.id) v.seats[seat] = 0;
  if (seat === 0) v.thr = v.steer = 0;
  p.veh = null; p.seat = -1;
  if (!place) return;
  // Out your own side if it's clear, else the other side, the back or the front. Never through a wall the car is parked against.
  const T = S.VEHICLE_TYPES[v.type], F = vFwd(v), R = vRight(v), side = T.seats[seat][0] < 0 ? -1 : 1;
  const out = T.wid / 2 + 0.9, end = T.len / 2 + 0.9;
  let spot = null;
  for (const [a, b] of [[side * out, 0], [-side * out, 0], [0, end], [0, -end]]) {
    const q = { x: v.x + R[0] * a + F[0] * b, y: 0, z: v.z + R[1] * a + F[1] * b }, x = q.x, z = q.z;
    S.resolve(q);
    if (Math.hypot(q.x - x, q.z - z) < 0.01 && S.lineClear(v.x, 1, v.z, q.x, 1, q.z)) { spot = q; break; }
  }
  if (!spot) { spot = { x: v.x, y: 0, z: v.z }; S.resolve(spot); }
  Object.assign(p, { x: spot.x, y: 0, z: spot.z, vy: 0 });
  resetMove(p);
  if (p.socket) p.socket.emit('setpos', { x: p.x, y: p.y, z: p.z });
}

function driveInput(p, a) {
  if (!p.veh || p.seat !== 0 || !Array.isArray(a) || a.length !== 2 || !a.every(Number.isFinite)) return;
  Object.assign(p.veh, { thr: clamp1(a[0]), steer: clamp1(a[1]), inputAt: Date.now() });
  if (a[0] || a[1]) p.lastActive = Date.now();
}

// Collide like two circles (front half and back half), so the nose can't poke into walls. Returns true on a crash.
function bumpWalls(v) {
  const T = S.VEHICLE_TYPES[v.type], off = T.len / 2 - T.wid / 2;
  let hit = false;
  for (const s of [off, -off]) {
    const F = vFwd(v), q = { x: v.x + F[0] * s, y: 0, z: v.z + F[1] * s, rad: T.wid / 2, hgt: 1.5 }, x = q.x, z = q.z;
    S.resolve(q);
    if (Math.abs(q.x - x) + Math.abs(q.z - z) > 1e-4) { hit = true; v.x += q.x - x; v.z += q.z - z; }
  }
  return hit;
}

const onGas = (v) => v.x > S.GAS.x0 && v.x < S.GAS.x1 && v.z > S.GAS.z0 && v.z < S.GAS.z1;

function stepVehicles(dt, now) {
  for (const v of vehicles) {
    const T = S.VEHICLE_TYPES[v.type];
    if (v.dead) { if (now >= v.backAt) resetVehicle(v); continue; }
    if (v.seats.some(Boolean)) v.emptySince = now;
    else if (v.fuel <= 0 && now - v.emptySince > S.STUCK_RESET_MS) { resetVehicle(v); continue; }   // towed home
    const driving = v.seats[0] && now - v.inputAt < 600;
    const thr = driving && v.fuel > 0 ? v.thr : 0;   // out of gas = stuck
    if (thr) v.fuel = Math.max(0, v.fuel - S.FUEL_BURN * Math.abs(thr) * dt);
    if (thr && Math.sign(thr) !== Math.sign(v.speed) && Math.abs(v.speed) > 0.5) v.speed += thr * T.accel * 2.5 * dt;   // brakes beat the engine
    else if (thr) v.speed += thr * T.accel * dt;
    else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 5 * dt);   // coast to a stop
    v.speed = Math.max(-T.top * 0.4, Math.min(T.top, v.speed));
    v.ry -= (driving ? v.steer : 0) * T.turn * dt * Math.min(1, Math.abs(v.speed) / 5) * Math.sign(v.speed);
    // Sub-steps no longer than 0.4m, much less than a car's half-width, so nothing tunnels.
    const n = Math.ceil(Math.abs(v.speed) * dt / 0.4) || 1;
    let crashed = false;
    for (let i = 0; i < n; i++) {
      const F = vFwd(v);
      v.x += F[0] * v.speed * dt / n; v.z += F[1] * v.speed * dt / n;
      if (bumpWalls(v)) crashed = true;
    }
    if (crashed) v.speed *= 0.4;
    if (onGas(v)) v.fuel = Math.min(S.FUEL_MAX, v.fuel + S.FUEL_FILL * dt);
  }
  // Cars bounce off each other.
  for (let i = 0; i < vehicles.length; i++) for (let j = i + 1; j < vehicles.length; j++) {
    const a = vehicles[i], b = vehicles[j];
    if (a.dead || b.dead) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01;
    const min = (S.VEHICLE_TYPES[a.type].len + S.VEHICLE_TYPES[b.type].len) * 0.38;
    if (d >= min) continue;
    const push = (min - d) / 2;
    a.x -= dx / d * push; a.z -= dz / d * push; b.x += dx / d * push; b.z += dz / d * push;
    a.speed *= 0.5; b.speed *= 0.5;
    bumpWalls(a); bumpWalls(b);
  }
  for (const v of vehicles) {
    if (v.dead) continue;
    // Riders ride along.
    v.seats.forEach((id, i) => {
      const p = players.get(id);
      if (!p) { v.seats[i] = 0; return; }
      [p.x, p.z] = seatPos(v, i); p.y = S.SEAT_Y; p.fallTop = p.y;
    });
    if (Math.abs(v.speed) > 5) runOver(v, now);
  }
}

// Fortnite-style: hitting someone at speed stains them and knocks them out of the way. Teammates are safe.
function runOver(v, now) {
  const T = S.VEHICLE_TYPES[v.type], F = vFwd(v), R = vRight(v), driver = players.get(v.seats[0]);
  for (const p of players.values()) {
    if (p.dead || p.veh || p.zip || p.y > 1.5 || now - p.runAt < 1000 || allies(p, driver)) continue;
    const dx = p.x - v.x, dz = p.z - v.z, lf = dx * F[0] + dz * F[1], lr = dx * R[0] + dz * R[1];
    if (Math.abs(lf) > T.len / 2 + S.RADIUS || Math.abs(lr) > T.wid / 2 + S.RADIUS) continue;
    p.runAt = now;
    const side = lr >= 0 ? 1 : -1, q = { x: v.x + R[0] * side * (T.wid / 2 + 1.5) + F[0] * lf, y: p.y, z: v.z + R[1] * side * (T.wid / 2 + 1.5) + F[1] * lf, scale: p.scale };
    S.resolve(q);
    if (S.lineClear(p.x, p.y + 1, p.z, q.x, p.y + 1, q.z)) {   // knocked aside, but never through a wall
      p.x = q.x; p.z = q.z;
      if (p.socket) p.socket.emit('setpos', { x: p.x, y: p.y, z: p.z });
    }
    damage(p, driver, S.runoverDmg(v.speed), S.RUNOVER, false, null);
  }
}

// Can this projectile hit this car? Never your own ride; the turkey hits everything; nobody hurts teammates' cars,
// and in the boss fight players can't wreck cars at all.
function vehicleTarget(v, pr, owner) {
  if (v.dead || v.seats.includes(pr.owner)) return false;
  if (pr.owner === BOSS_ID) return true;
  return session.phase !== 'boss' && !allies(players.get(v.seats[0]), owner);
}

// Is a point inside the car's body (an oriented box from the ground up to VEH_H)? pad = projectile radius.
function inVehicle(v, x, y, z, pad) {
  const T = S.VEHICLE_TYPES[v.type], F = vFwd(v), R = vRight(v), dx = x - v.x, dz = z - v.z;
  return y > 0 && y < S.VEH_H + pad && Math.abs(dx * F[0] + dz * F[1]) < T.len / 2 + pad && Math.abs(dx * R[0] + dz * R[1]) < T.wid / 2 + pad;
}

function hitVehicle(v, a, amt, w) {
  if (v.dead) return;
  if (a && S.canUpgrade(S.W(w))) amt *= 1 + S.DMG_STEP * a.dmgLv[w];
  v.hp -= amt * (1 - S.VEH_RES);
  if (a && a.socket) a.socket.emit('hitmark', { veh: 1 });
  if (v.hp > 0) return;
  // Washed out: everyone tumbles out, and it's back home in a bit.
  for (const id of v.seats) { const p = players.get(id); if (p) leaveVehicle(p); }
  Object.assign(v, { dead: true, backAt: Date.now() + S.VEH_RESPAWN_MS, speed: 0 });
  io.emit('vboom', { id: v.id, p: [+v.x.toFixed(2), 1, +v.z.toFixed(2)], by: a ? a.name : S.BOSS.name });
}

// ---------- Ziplines ----------
// Press E with a hand (feet + 2.2m) near a cable. The server moves riders along it, so the movement checks don't
// fight it and nobody can zip faster. You ride toward the end you're facing; from an end you always ride away from it.
function zipToggle(p) {
  if (p.zip) return releaseZip(p);
  if (p.dead || p.veh) return;
  let best = null, bd = S.ZIP_REACH;
  S.ZIPLINES.forEach((L, i) => {
    const hy = p.y + 2.2, t = S.zipClosest(L, p.x, hy, p.z), c = S.zipPoint(L, t), d = Math.hypot(c[0] - p.x, c[1] - hy, c[2] - p.z);
    if (d < bd) { bd = d; best = { i, t }; }
  });
  if (!best) return;
  const L = S.ZIPLINES[best.i], fx = -Math.sin(p.ry), fz = -Math.cos(p.ry);
  const dir = best.t < 0.08 ? 1 : best.t > 0.92 ? -1 : fx * (L.b[0] - L.a[0]) + fz * (L.b[2] - L.a[2]) >= 0 ? 1 : -1;
  p.zip = { i: best.i, t: best.t, dir }; p.emote = 0;
  placeOnZip(p);
  if (p.socket) p.socket.emit('zip', p.zip);
}

function placeOnZip(p) {
  const c = S.zipPoint(S.ZIPLINES[p.zip.i], p.zip.t);
  p.x = c[0]; p.y = c[1] - S.ZIP_HANG; p.z = c[2]; p.fallTop = p.y;
}

function stepZip(p, dt) {
  const L = S.ZIPLINES[p.zip.i];
  p.zip.t += p.zip.dir * S.ZIP_SPEED * dt / L.len;
  if (p.zip.t > 0 && p.zip.t < 1) return placeOnZip(p);
  const land = p.zip.t >= 1 ? L.lb : L.la;   // the end: step off onto the roof
  p.x = land[0]; p.y = land[1]; p.z = land[2];
  releaseZip(p);
}

// Letting go mid-way drops you from where you are: long falls still stain, like any other fall.
function releaseZip(p) {
  p.zip = null; p.vy = 0;
  resetMove(p);
  if (p.socket) p.socket.emit('unzip', { x: p.x, y: p.y, z: p.z });
}

// ---------- Game session ----------
function setPhase(phase, ms) {
  session.phase = phase;
  session.endsAt = ms ? Date.now() + ms : 0;
  sendBoard();
}

function resetAll() {
  boss.on = false;
  for (const p of players.values()) {
    Object.assign(p, startKit(p.bot), { money: 0, earned: 0, kills: 0, deaths: 0, team: 0, scale: 1, teamPts: 0, farm: new Map(), earn: 200, blindUntil: 0, bossDmg: 0, bossPaid: 0 });
    respawn(p); sendMe(p);
  }
  vehicles.forEach(resetVehicle);
  projectiles.clear();
  session.scores = [0, 0]; session.results = null; session.teamRes = null;
}

function startGame(ffaMs, teamMs, bossMs = 0) {
  resetAll();
  session.teamMs = teamMs; session.bossMs = bossMs;
  if (ffaMs > 0) setPhase('ffa', ffaMs); else if (teamMs > 0) startTeams(); else startBoss();
}

const power = (p) => p.earned + 25 * p.tier;   // how strong a player is, for picking fair teams

function teamTotals() {
  const size = [0, 0], total = [0, 0];
  for (const p of players.values()) if (p.team) { size[p.team - 1]++; total[p.team - 1] += power(p); }
  return { size, total };
}

// Team number (1 or 2) a newcomer should join: fewer players first, then less total strength.
function weakerTeam() {
  const { size, total } = teamTotals();
  if (size[0] !== size[1]) return size[0] < size[1] ? 1 : 2;
  if (total[0] !== total[1]) return total[0] < total[1] ? 1 : 2;
  return Math.random() < 0.5 ? 1 : 2;
}

// Random but fair: rank by strength (with some jitter so it isn't the same split every time) and deal out
// neighbors in pairs, giving the stronger of each pair to the team that's behind. Humans are split first
// so bots can't pile all the students onto one side.
function assignTeams() {
  const all = [...players.values()];
  for (const p of all) p.team = 0;
  for (const group of [all.filter(p => !p.bot), all.filter(p => p.bot)]) {
    const ranked = group.map(p => [p, power(p) * (0.9 + Math.random() * 0.2) + Math.random()]).sort((a, b) => b[1] - a[1]).map(r => r[0]);
    for (let i = 0; i < ranked.length; i += 2) {
      const behind = weakerTeam();
      ranked[i].team = behind;
      if (ranked[i + 1]) ranked[i + 1].team = 3 - behind;
    }
  }
}

function updateOwlSizes() {
  let top = 0;
  for (const p of players.values()) top = Math.max(top, p.earned);
  for (const p of players.values()) p.scale = p.team ? Math.round(S.owlScale(p.earned, top) * 100) / 100 : 1;
}

function startTeams() {
  assignTeams();
  updateOwlSizes();
  projectiles.clear();
  for (const p of players.values()) respawn(p);   // everyone starts the showdown fresh
  setPhase('team', session.teamMs);
}

// The Owl Showdown's outcome, kept when the boss fight follows so the results screen can show both.
function teamResults() {
  const all = [...players.values()], [a, b] = session.scores;
  if (!all.some(p => p.team)) return null;
  const mvp = (t) => { const best = all.filter(p => p.team === t).sort((x, y) => y.teamPts - x.teamPts)[0]; return best ? [best.name, best.teamPts] : null; };
  return { winner: a === b ? -1 : a > b ? 0 : 1, scores: [a, b], mvp: [mvp(1), mvp(2)] };
}

function endGame() {
  const all = [...players.values()];
  const teams = session.phase === 'team' ? teamResults() : session.teamRes;
  session.results = { winner: teams ? teams.winner : null, scores: teams ? teams.scores : [0, 0], mvp: teams ? teams.mvp : [null, null],
    top: [...all].sort((x, y) => y.earned - x.earned).slice(0, 3).map(p => [p.name, p.earned]) };
  if (session.phase === 'boss') {
    session.results.boss = { won: boss.hp <= 0, secs: Math.round((Date.now() - boss.startedAt) / 1000), hpLeft: Math.max(0, Math.ceil(boss.hp)), max: boss.max,
      top: all.filter(p => p.bossDmg > 0).sort((x, y) => y.bossDmg - x.bossDmg).slice(0, 3).map(p => [p.name, Math.round(p.bossDmg)]) };
  }
  boss.on = false;
  projectiles.clear();
  setPhase('ended', S.RESULTS_MS);
}

function freePlay() {
  boss.on = false;
  for (const p of players.values()) Object.assign(p, { team: 0, scale: 1, teamPts: 0 });
  session.scores = [0, 0]; session.results = null; session.teamRes = null;
  setPhase('free', 0);
}

function advance() {
  if (session.phase === 'ffa') { if (session.teamMs > 0) startTeams(); else if (session.bossMs > 0) startBoss(); else endGame(); }
  else if (session.phase === 'team') { if (session.bossMs > 0) { session.teamRes = teamResults(); startBoss(); } else endGame(); }
  else if (session.phase === 'boss') endGame();
  else if (session.phase === 'ended') freePlay();
}

const nextPhase = () => session.phase === 'ffa' ? (session.teamMs > 0 ? 'team' : session.bossMs > 0 ? 'boss' : null)
  : session.phase === 'team' && session.bossMs > 0 ? 'boss' : null;

// Sent once a second and on every phase change. Team and owl size live here (not in the 20Hz snapshot) to save bandwidth.
function sendBoard() {
  io.emit('board', { phase: session.phase, left: session.endsAt ? session.endsAt - Date.now() : 0, next: nextPhase(), scores: session.scores, results: session.results,
    list: [...players.values()].map(p => [p.id, p.name, p.tier, p.kills, p.money, p.bot ? 1 : 0, p.team, p.scale, p.teamPts, Math.round(p.bossDmg)]) });
}

// ---------- Thanksgiving boss: Tom Gobbleton ----------
// A giant turkey that roams the Town Square. Everyone is on the same side (no friendly fire), and the class must
// stain it before the clock runs out. Its attacks: lobbed gravy bombs, cranberry blasts, stuffing rain on far-away
// players (roof campers too), a drumstick stomp that hits everyone on the ground nearby (jump to dodge it), and
// pumpkin seekers: slow homing shots, one per nearby player, that stain in one touch (run right away to outrun them).
const boss = { on: false, x: 0, z: 0, ry: 0, hp: 0, max: 0, next: 0, stompAt: 0, seekAt: 0, target: 0, retarget: 0, startedAt: 0 };
const bossFwd = () => [-Math.sin(boss.ry), -Math.cos(boss.ry)];
const bossBodyY = (y) => Math.max(2.5 * S.BOSS.size, Math.min(6 * S.BOSS.size, y));   // nearest point on the body's axis
const bossHead = () => { const f = bossFwd(); return [boss.x + f[0] * S.BOSS.headFwd, S.BOSS.headY, boss.z + f[1] * S.BOSS.headFwd]; };

// 2 = head (double damage), 1 = body, 0 = miss. The body is a fat vertical capsule.
function bossHit(x, y, z, pad) {
  const h = bossHead();
  if (Math.hypot(x - h[0], y - h[1], z - h[2]) < S.BOSS.headR + pad) return 2;
  return Math.hypot(x - boss.x, y - bossBodyY(y), z - boss.z) < S.BOSS.r + pad ? 1 : 0;
}

function startBoss() {
  for (const p of players.values()) Object.assign(p, { team: 0, scale: 1, teamPts: 0, bossDmg: 0, bossPaid: 0 });
  projectiles.clear();
  const all = [...players.values()], humans = all.filter(p => !p.bot).length;
  Object.assign(boss, { on: true, x: 0, z: 0, ry: 0, next: Date.now() + 5000, stompAt: 0, seekAt: Date.now() + 8000, target: 0, retarget: 0, startedAt: Date.now() });
  boss.max = boss.hp = Math.max(S.BOSS.hpMin, S.BOSS.hpHuman * humans + S.BOSS.hpBot * (all.length - humans));
  setPhase('boss', session.bossMs);
  for (const p of players.values()) respawn(p);   // after setPhase, so everyone spawns away from the turkey
}

// Stains on the turkey pay a little money (so you can still shop), and the killing blow wins the game for everyone.
function hurtBoss(a, w, amt, head) {
  if (!boss.on || boss.hp <= 0 || !a) return;
  if (S.canUpgrade(S.WEAPONS[w])) amt *= 1 + S.DMG_STEP * a.dmgLv[w];
  if (head) amt *= 2;
  amt = Math.min(amt, boss.hp);   // no credit (or cash) for overkill
  boss.hp -= amt; a.bossDmg += amt;
  const cash = Math.floor(a.bossDmg / S.BOSS.cashPer) - a.bossPaid;
  if (cash > 0) { a.bossPaid += cash; a.money += cash; a.earned += cash; sendMe(a); }
  if (a.socket) a.socket.emit('hitmark', { boss: 1, head });
  if (boss.hp <= 0) endGame();
}

function bossShot(w, v, home = 0) {
  const h = bossHead(), pr = { id: nextId++, w, owner: BOSS_ID, x: h[0], y: h[1] - 0.6, z: h[2], vx: v[0], vy: v[1], vz: v[2], t: 0, home };
  projectiles.set(pr.id, pr);
  io.emit('shot', { id: pr.id, w, o: [pr.x, pr.y, pr.z], v });
}

// A lobbed shot that lands near (not exactly on) a player.
function lob(w, p, err) {
  const h = bossHead(), W = S.EXTRA[w];
  const dx = p.x + (Math.random() - 0.5) * err * 2 - h[0], dz = p.z + (Math.random() - 0.5) * err * 2 - h[2], dy = p.y + 0.5 - (h[1] - 0.6);
  const T = Math.max(0.9, Math.min(3.5, Math.hypot(dx, dz) / 22));
  bossShot(w, [dx / T, (dy + 0.5 * W.grav * T * T) / T, dz / T]);
}

function stepBoss(dt, now) {
  if (!boss.on) return;
  const B = S.BOSS, alive = [...players.values()].filter(p => !p.dead), flat = (p) => Math.hypot(p.x - boss.x, p.z - boss.z);
  if (now >= boss.retarget || !players.has(boss.target)) {   // chase the nearest student (bots count as farther away)
    boss.retarget = now + 2000;
    let best = null, bd = 160;
    for (const p of alive) { const d = flat(p) * (p.bot ? 1.5 : 1); if (d < bd) { bd = d; best = p; } }
    boss.target = best ? best.id : 0;
  }
  const t = players.get(boss.target);
  if (t && !t.dead && !boss.stompAt) {
    const dx = t.x - boss.x, dz = t.z - boss.z, d = Math.hypot(dx, dz);
    let turn = Math.atan2(-dx, -dz) - boss.ry;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    boss.ry += Math.max(-2.5 * dt, Math.min(2.5 * dt, turn));
    if (d > 9 * B.size) {
      boss.x = Math.max(-B.roam, Math.min(B.roam, boss.x + dx / d * B.speed * dt));
      boss.z = Math.max(-B.roam, Math.min(B.roam, boss.z + dz / d * B.speed * dt));
    }
  }
  if (boss.stompAt && now >= boss.stompAt) {   // the shockwave runs along the ground: anyone in the air or up high is safe
    boss.stompAt = 0;
    io.emit('boss', { a: 'slam' });
    for (const p of alive) { const d = flat(p); if (d < B.stompR && p.y < 1.2 && !p.dead) damage(p, null, S.EXTRA[S.STOMP].dmg * (1 - d / B.stompR * 0.5), S.STOMP, false, null); }
  }
  if (now < boss.next || boss.stompAt || !boss.on) return;
  const rage = boss.hp < boss.max / 2 ? 0.65 : 1;   // angrier (faster) at half health
  boss.next = now + (900 + Math.random() * 800) * rage;
  const near = alive.filter(p => flat(p) < B.seekR);
  if (near.length && now >= boss.seekAt && Math.random() < 0.35) {   // pumpkin seekers: one per nearby player
    boss.seekAt = now + 7000 * rage; boss.next = now + 2500 * rage;
    io.emit('boss', { a: 'seek' });
    const W = S.EXTRA[15], h = bossHead();
    for (const p of near.slice(0, 20)) {
      const dx = p.x - h[0], dy = p.y + 1 - h[1], dz = p.z - h[2], l = Math.hypot(dx, dy, dz) || 1;
      bossShot(15, [dx / l * W.launch, dy / l * W.launch, dz / l * W.launch], p.id);
    }
    return;
  }
  if (alive.some(p => flat(p) < B.stompR && p.y < 3) && Math.random() < 0.4) {
    boss.stompAt = now + 900; boss.next = now + 2600 * rage;
    return io.emit('boss', { a: 'stomp' });
  }
  const inRange = alive.filter(p => flat(p) < 130), roll = Math.random();
  if (!inRange.length) return;
  if (Math.random() < 0.35) io.emit('boss', { a: 'gobble' });
  if (roll < 0.25) for (const p of inRange.sort(() => Math.random() - 0.5).slice(0, 6)) lob(13, p, 3);
  else if (roll < 0.6 && t && !t.dead && flat(t) < 60) {
    const h = bossHead(), W = S.EXTRA[12], dx = t.x - h[0], dy = t.y + 1.2 - h[1], dz = t.z - h[2], l = Math.hypot(dx, dy, dz), T = l / W.speed;
    for (let i = 0; i < 7; i++) {
      const s = () => (Math.random() - 0.5) * 0.16;
      bossShot(12, [(dx / l + s()) * W.speed, (dy / l + s()) * W.speed + 0.5 * W.grav * T, (dz / l + s()) * W.speed]);
    }
  } else if (t && !t.dead) lob(11, t, 2);
}

// ---------- Combat ----------
// No friendly fire among owl teammates, and nobody hurts anybody during the boss fight: it's everyone vs. the turkey.
const allies = (a, b) => !!(a && b && (session.phase === 'boss' || a.team && a.team === b.team));

// Clients only choose weapon + aim direction. Origin, cooldown, ownership and spread are all server-side.
function fire(p, w, d) {
  const W = S.WEAPONS[w], now = Date.now();
  if (!W || p.dead || session.phase === 'ended' || !p.owned[w] && !(W.pack && p.ammo > 0) || now - p.lastFire[w] < W.cd * 1000 * 0.9) return;
  if (p.veh && p.seat === 0) return;   // drivers drive; passengers shoot
  // Like the real client, guns share one cooldown: no firing sniper + pie + burger in the same instant.
  if (!W.pack && now - p.lastShot < W.cd * 1000 * 0.9) return;
  const len = Math.hypot(...d);
  if (!(len > 1e-6 && len < 1e6)) return;
  d = d.map(n => n / len);
  p.lastFire[w] = now; p.lastActive = now; p.emote = 0;
  if (W.pack) { p.ammo--; sendMe(p); } else { p.lastShot = now; equip(p, w); }
  // Always fire from the server's copy of the player's eyes, so nobody can shoot from behind a wall.
  // Starts just in front of the face but within the player's radius, so it can't begin on the far side of a wall.
  const eye = p.y + S.eyeHeight(p.x, p.y, p.z, p.scale);
  const o = S.inBox(p.x + d[0] * 0.45, eye + d[1] * 0.45, p.z + d[2] * 0.45) ? [p.x, eye, p.z] : [p.x + d[0] * 0.45, eye + d[1] * 0.45, p.z + d[2] * 0.45];
  // Creamed players spray wildly, even if a hacked client hides the whipped cream.
  const spread = (W.spread || 0) + (now < p.blindUntil ? 0.6 : 0);
  for (let i = 0; i < (W.pellets || 1); i++) {
    let [dx, dy, dz] = d;
    if (spread) { dx += (Math.random() - 0.5) * spread; dy += (Math.random() - 0.5) * spread; dz += (Math.random() - 0.5) * spread; }
    const l = Math.hypot(dx, dy, dz) || 1;
    const pr = { id: nextId++, w, owner: p.id, x: o[0], y: o[1], z: o[2],
      vx: dx / l * W.speed, vy: dy / l * W.speed + (W.lob || 0), vz: dz / l * W.speed, t: 0 };
    projectiles.set(pr.id, pr);
    io.emit('shot', { id: pr.id, w, o: [pr.x, pr.y, pr.z], v: [pr.vx, pr.vy, pr.vz] });
  }
}

// Does the victim's tray face the direction the hit came from? (dx,dz points from the victim toward the source.)
function trayBlocks(v, dx, dz) {
  if (!trayUp(v, Date.now())) return false;
  const l = Math.hypot(dx, dz);
  return l > 1e-6 && (-Math.sin(v.ry) * dx - Math.cos(v.ry) * dz) / l > S.TRAY.cone;
}

function hitTray(v, a, amt, W) {
  v.trayHp = W.pierce ? 0 : Math.max(0, v.trayHp - amt);   // a sniper body shot shatters it, but is stopped
  const broke = v.trayHp <= 0;
  if (broke) v.trayBackAt = Date.now() + S.TRAY.respawnMs;
  if (v.socket) { v.socket.emit('trayhit', { broke }); sendMe(v); }
  if (a && a.socket) a.socket.emit('hitmark', { tray: 1, broke });
}

// from = [dx, dz] pointing from the victim toward where the hit came from (for the tray).
// w can be a weapon slot or one of S.EXTRA (cars, the turkey's attacks).
function damage(v, a, amt, w, head, from) {
  if (v.dead) return;
  const W = S.W(w);
  if (a && S.canUpgrade(W)) amt *= 1 + S.DMG_STEP * a.dmgLv[w];
  if (!head && from && trayBlocks(v, from[0], from[1])) return hitTray(v, a, amt, W);
  if (!W.pierce) amt *= 1 - S.OUTFITS[v.tier].res;
  v.hp -= amt; v.lastHit = Date.now();
  if (v.socket) v.socket.emit('ouch', { w, hp: v.hp, head });
  if (a && a.socket) a.socket.emit('hitmark', { head });
  if (v.hp > 0) return;
  v.dead = true; v.deaths++;
  leaveVehicle(v, false); v.zip = null; v.emote = 0;
  let pts = 0;
  if (a && a !== v && (v.bot || Date.now() - v.lastActive < IDLE_MS)) {
    const amt = reward(a, v);
    a.kills++; a.money += amt; a.earned += amt;
    if (amt > 0 && a.wstains[w] !== undefined) a.wstains[w]++;   // farmed-out kills that pay nothing don't level up the weapon either
    sendMe(a);
    if (session.phase === 'team' && a.team && v.team && a.team !== v.team) {
      pts = S.teamPoints(v.earned);
      a.teamPts += pts; session.scores[a.team - 1] += pts;
    }
  }
  const killer = a ? a.name : w > S.RUNOVER ? S.BOSS.name : w === S.RUNOVER ? 'A runaway car' : '???';
  io.emit('kill', { k: killer, v: v.name, w, head, pts });
  setTimeout(() => players.has(v.id) && v.dead && respawn(v), S.RESPAWN_MS);
}

// Too big a drop: instantly stained, no killer, no reward, tray or no tray.
function fallDeath(v) {
  if (v.dead) return;
  v.hp = 0; v.dead = true; v.deaths++; v.emote = 0;
  io.emit('kill', { k: 'Gravity', v: v.name, w: -1 });
  setTimeout(() => players.has(v.id) && v.dead && respawn(v), S.RESPAWN_MS);
}

function reward(a, v) {
  const now = Date.now(), rec = a.farm.get(v.id);
  const n = rec && now - rec.t < REPEAT_MS ? rec.n + 1 : 0;
  a.farm.set(v.id, { n, t: now });
  const amt = Math.min(Math.floor(a.earn), Math.round(S.killReward(v.tier) / 2 ** n));
  a.earn -= amt;
  return amt;
}

// hit = what the projectile ran into: { veh } or { boss: 1 | 2 (head) }; hitPlayer for players.
function endProjectile(pr, hitPlayer, hit) {
  const W = S.W(pr.w), owner = players.get(pr.owner);
  projectiles.delete(pr.id);
  if (W.blind) {
    // Whipped cream: longer blind when close and looking toward it. Clients draw it; bots stop aiming.
    for (const p of players.values()) {
      if (p.id === pr.owner || p.dead || allies(p, owner)) continue;
      const eye = p.y + S.eyeHeight(p.x, p.y, p.z, p.scale);
      const dx = pr.x - p.x, dz = pr.z - p.z, d = Math.hypot(dx, pr.y - eye, dz);
      if (d > W.blind || !S.lineClear(pr.x, pr.y, pr.z, p.x, eye, p.z)) continue;   // walls and floors stop the cream
      const facing = (-Math.sin(p.ry) * dx - Math.cos(p.ry) * dz) / (Math.hypot(dx, dz) || 1) > 0;
      const secs = (0.8 + 3.2 * (1 - d / W.blind)) * (facing ? 1 : 0.5);
      p.blindUntil = Date.now() + secs * 1000;
      if (p.socket) p.socket.emit('blind', +secs.toFixed(2));
    }
  } else if (W.splash) {
    for (const p of players.values()) {
      if (p.id === pr.owner || p.dead || allies(p, owner)) continue;
      const d = S.distToPlayer(pr.x, pr.y, pr.z, p);
      // Walls and floors stop the blast, unless the player's chest or head is in the open.
      if (d >= W.splash || !(S.lineClear(pr.x, pr.y, pr.z, p.x, p.y + 1, p.z) || S.lineClear(pr.x, pr.y, pr.z, p.x, p.y + 1.6, p.z))) continue;
      damage(p, owner, W.dmg * (1 - d / W.splash * 0.7), pr.w, false, [pr.x - p.x, pr.z - p.z]);
    }
    for (const v of vehicles) {
      if (!vehicleTarget(v, pr, owner)) continue;
      const d = Math.max(0, Math.hypot(pr.x - v.x, pr.z - v.z) - S.VEHICLE_TYPES[v.type].wid / 2);
      if (d < W.splash) hitVehicle(v, owner, W.dmg * (1 - d / W.splash * 0.7), pr.w);
    }
    if (boss.on && owner && pr.owner !== BOSS_ID) {
      const d = Math.max(0, Math.hypot(pr.x - boss.x, pr.y - bossBodyY(pr.y), pr.z - boss.z) - S.BOSS.r);
      if (d < W.splash) hurtBoss(owner, pr.w, W.dmg * (1 - d / W.splash * 0.7), false);
    }
  } else if (hit && hit.boss) hurtBoss(owner, pr.w, W.dmg, hit.boss === 2);
  else if (hit && hit.veh) hitVehicle(hit.veh, owner, W.dmg, pr.w);
  else if (hitPlayer) {
    const head = !!W.head && pr.y - hitPlayer.y > S.HEAD_Y * hitPlayer.scale;
    damage(hitPlayer, owner, head ? W.head : W.dmg, pr.w, head, [-pr.vx, -pr.vz]);
  }
  io.emit('pop', { id: pr.id, w: pr.w, p: [+pr.x.toFixed(2), +Math.max(0, pr.y).toFixed(2), +pr.z.toFixed(2)] });
}

// Homing (the turkey's pumpkin seekers): turn toward the target's chest at most W.turn rad/s, at a fixed speed.
// If the target is stained or gone, the seeker gives up and falls.
function steer(pr, W, dt) {
  const p = players.get(pr.home);
  if (!p || p.dead) { pr.home = 0; return; }
  const dx = p.x - pr.x, dy = p.y + 1 - pr.y, dz = p.z - pr.z, l = Math.hypot(dx, dy, dz) || 1;
  const sp = Math.hypot(pr.vx, pr.vy, pr.vz) || 1, cx = pr.vx / sp, cy = pr.vy / sp, cz = pr.vz / sp;
  const ang = Math.acos(Math.max(-1, Math.min(1, (cx * dx + cy * dy + cz * dz) / l))), k = ang > 1e-6 ? Math.min(1, W.turn * dt / ang) : 1;
  const nx = cx + (dx / l - cx) * k, ny = cy + (dy / l - cy) * k, nz = cz + (dz / l - cz) * k, n = Math.hypot(nx, ny, nz) || 1;
  const v = W.speed + (W.launch - W.speed) * Math.max(0, 1 - pr.t / W.slow);   // a fast launch that slows to just under run speed
  pr.vx = nx / n * v; pr.vy = ny / n * v; pr.vz = nz / n * v;
}

function stepProjectiles(dt) {
  for (const pr of projectiles.values()) {
    const W = S.W(pr.w);
    const steps = Math.ceil(Math.max(W.launch || W.speed, Math.hypot(pr.vx, pr.vy, pr.vz)) * dt / 0.4), sdt = dt / steps, owner = players.get(pr.owner);
    outer: for (let i = 0; i < steps; i++) {
      if (pr.home && pr.t < W.seek) steer(pr, W, sdt); else pr.vy -= W.grav * sdt;
      pr.x += pr.vx * sdt; pr.y += pr.vy * sdt; pr.z += pr.vz * sdt; pr.t += sdt;
      // Cars are cover: check them before the riders sticking out of them.
      for (const v of vehicles) if (vehicleTarget(v, pr, owner) && inVehicle(v, pr.x, pr.y, pr.z, W.r)) { endProjectile(pr, null, { veh: v }); break outer; }
      for (const p of players.values()) {
        if (p.id !== pr.owner && !p.dead && !allies(p, owner) && !(owner && p.veh && p.veh === owner.veh) &&
          S.distToPlayer(pr.x, pr.y, pr.z, p) < 0.55 * p.scale + W.r) { endProjectile(pr, p); break outer; }
      }
      if (boss.on && pr.owner !== BOSS_ID) { const h = bossHit(pr.x, pr.y, pr.z, W.r); if (h) { endProjectile(pr, null, { boss: h }); break; } }
      if (S.inBox(pr.x, pr.y, pr.z)) {   // back up to the near side of the wall, so the blast goes off on this side of it
        pr.x -= pr.vx * sdt; pr.y -= pr.vy * sdt; pr.z -= pr.vz * sdt;
        endProjectile(pr); break;
      }
      if (pr.t > W.life || Math.abs(pr.x) > S.ARENA || Math.abs(pr.z) > S.ARENA) { endProjectile(pr); break; }
    }
  }
}

// ---------- Derpy bots ----------
function addBot() {
  const b = newPlayer(true, null);
  b.tier = Math.floor(Math.random() * 4);
  b.ai = { t: 0 };
}

function stepBot(b, dt) {
  if (b.dead) return;
  const ai = b.ai;
  ai.t -= dt;
  if (ai.t <= 0) {   // pick a new dumb plan
    ai.t = 0.5 + Math.random() * 2;
    ai.dir = Math.random() * Math.PI * 2;
    ai.walk = Math.random() < 0.7;
    ai.spin = Math.random() < 0.3 ? (Math.random() - 0.5) * 20 : 0;
    ai.jumpy = Math.random() < 0.3;
    do ai.w = Math.floor(Math.random() * S.WEAPONS.length); while (!b.owned[ai.w]);
  }
  b.ry += ai.spin * dt;
  S.move(b, ai.walk ? Math.sin(ai.dir) : 0, ai.walk ? Math.cos(ai.dir) : 0, ai.jumpy && Math.random() < 0.1, dt);
  if (trackFall(b, b.onGround, b.y, b.y)) return;
  if (Math.random() < (ai.w === 0 ? 0.3 : 0.03)) {
    let d = [Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5];
    if (Math.random() < 0.4 && Date.now() > b.blindUntil) {   // occasionally aim at someone (badly), unless creamed
      let best, bd = 30;
      for (const p of players.values()) {
        const dd = Math.hypot(p.x - b.x, p.z - b.z);
        if (p !== b && !p.dead && !allies(p, b) && dd < bd) { bd = dd; best = p; }
      }
      if (best) d = [best.x - b.x + (Math.random() - 0.5) * 6, best.y - b.y + Math.random() * 2, best.z - b.z + (Math.random() - 0.5) * 6];
      else if (boss.on) d = [boss.x - b.x + (Math.random() - 0.5) * 8, 5 - b.y, boss.z - b.z + (Math.random() - 0.5) * 8];   // everyone vs. the turkey
    }
    b.ry = Math.atan2(-d[0], -d[2]);
    fire(b, ai.w, d);
  }
  const next = S.OUTFITS[b.tier + 1];
  if (next && b.money >= next.cost) { b.money -= next.cost; b.tier++; }
}

// ---------- Sockets ----------
// Never trust anything a client sends: validate types/ranges in every handler.
const io = new Server(server, { maxHttpBufferSize: 1e4 });
io.on('connection', (socket) => {
  const ip = socket.handshake.address, humans = [...players.values()].filter(p => !p.bot).length;
  if (humans >= MAX_HUMANS || (ipCount.get(ip) || 0) >= MAX_PER_IP) { socket.emit('full'); return socket.disconnect(true); }
  ipCount.set(ip, (ipCount.get(ip) || 0) + 1);
  const p = newPlayer(false, socket);
  socket.use((_, next) => { if (++p.msgs > MAX_MSGS_PER_SEC) socket.disconnect(true); else next(); });
  socket.emit('welcome', { id: p.id, name: p.name, spawn: { x: p.x, y: p.y, z: p.z } });
  sendMe(p);
  socket.on('pos', (a) => clientMove(p, a));
  socket.on('fire', (m) => { if (m && Number.isInteger(m.w) && vec3(m.d)) fire(p, m.w, m.d); });
  socket.on('buy', (tier) => { if (Number.isInteger(tier)) buyOutfit(p, tier); });
  socket.on('buyw', (w) => { if (Number.isInteger(w)) buyWeapon(p, w); });
  socket.on('buyup', (w) => { if (Number.isInteger(w)) buyUpgrade(p, w); });
  socket.on('buytray', () => buyTray(p));
  socket.on('equip', (w) => { if (Number.isInteger(w)) equip(p, w); });
  socket.on('drive', (a) => driveInput(p, a));
  socket.on('seat', () => { if (p.veh) leaveVehicle(p); else enterVehicle(p); });
  socket.on('zip', () => zipToggle(p));
  socket.on('emote', (n) => { if (Number.isInteger(n) && n >= -1 && n < S.EMOTES.length) emote(p, n); });
  socket.on('disconnect', () => {
    playerLeft(p);
    const n = ipCount.get(ip) - 1;
    if (n > 0) ipCount.set(ip, n); else ipCount.delete(ip);
  });
});

// ---------- Loops ----------
const TICK = 1 / 30;
let tickN = 0;
setInterval(() => {
  const now = Date.now();
  if (session.endsAt && now >= session.endsAt) advance();
  for (const p of players.values()) {
    if (p.bot) stepBot(p, TICK);
    if (p.zip) stepZip(p, TICK);
    if (p.emote && now - p.emoteAt > S.EMOTE_MS) p.emote = 0;
    if (!p.dead && now - p.lastHit > 5000) p.hp = Math.min(S.MAX_HP, p.hp + 10 * TICK);
    if (p.hasTray && p.trayHp <= 0 && now >= p.trayBackAt) { p.trayHp = S.TRAY.hp; sendMe(p); }
    p.earn = Math.min(EARN_MAX, p.earn + EARN_PER_SEC * TICK);
  }
  stepVehicles(TICK, now);
  stepBoss(TICK, now);
  stepProjectiles(TICK);
  if (++tickN % 3 !== 0) {   // ~20Hz snapshots: players, cars, and the turkey
    const r = (n) => Math.round(n * 100) / 100;
    io.emit('snap', {
      p: [...players.values()].map(p => [p.id, r(p.x), r(p.y), r(p.z), r(p.ry), p.tier, Math.ceil(p.hp), p.dead ? 1 : 0, trayUp(p, now) ? 1 : 0, p.emote, p.zip ? 1 : 0]),
      v: vehicles.map(v => [v.id, r(v.x), r(v.z), r(v.ry), Math.ceil(v.hp), Math.ceil(v.fuel), v.dead ? 1 : 0, r(v.speed), ...v.seats]),
      b: boss.on ? [r(boss.x), r(boss.z), r(boss.ry), Math.ceil(boss.hp), boss.max, boss.stompAt ? 1 : 0] : null,
      s: boss.on ? [...projectiles.values()].filter(pr => pr.home).map(pr => [pr.id, r(pr.x), r(pr.y), r(pr.z), r(pr.vx), r(pr.vy), r(pr.vz)]) : null,   // homing shots' course
    });
  }
  if (tickN % 30 === 0) for (const p of players.values()) p.msgs = 0;   // per-second message budget
  if (tickN % 30 === 0) {
    if (session.phase === 'team') updateOwlSizes();
    sendBoard();
  }
}, TICK * 1000);

setInterval(() => console.log(new Date().toISOString(), status()), 30000);
// Log unexpected errors instead of dying: a restart would wipe the game in progress mid-class.
process.on('uncaughtException', (e) => console.error(new Date().toISOString(), 'uncaught', e));
server.listen(PORT, () => console.log(`Stain Wars on http://localhost:${PORT}`));
