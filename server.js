const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const S = require('./public/shared.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
// Abuse limits. Per-IP is generous because a whole classroom shares one school IP (NAT).
const MAX_HUMANS = 80, MAX_PER_IP = 40, MAX_MSGS_PER_SEC = 60;
// Anti kill-farming (students feeding kills from extra tabs): idle victims pay nothing, repeat kills on the
// same victim pay half each time, and income is capped near what a great legit player can earn.
const IDLE_MS = 15000, REPEAT_MS = 120000, EARN_PER_SEC = 5, EARN_MAX = 500;
const JUMP_H = S.JUMP * S.JUMP / (2 * S.GRAVITY);   // legit max jump height
const vec3 = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
const ipCount = new Map();

const players = new Map();   // id -> player
const projectiles = new Map();
let nextId = 1;

// ---------- HTTP: static files + localhost-only admin ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/admin/')) {
    const ip = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) { res.writeHead(403); return res.end('localhost only'); }
    return admin(url, res);
  }
  const file = path.join(PUB, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(PUB)) { res.writeHead(404); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    res.end(data);
  });
});

function admin(url, res) {
  const cmd = url.pathname.slice(7);
  let msg;
  if (cmd === 'reset') {
    for (const p of players.values()) { Object.assign(p, startKit(p.bot), { money: 0, kills: 0, deaths: 0 }); respawn(p); sendMe(p); }
    msg = 'Everyone reset to Plain Beige Tee, mustard only, $0, 0 kills.';
  } else if (cmd === 'bots') {
    const n = Math.min(100, parseInt(url.searchParams.get('n')) || 10);
    for (let i = 0; i < n; i++) addBot();
    msg = `Added ${n} derpy bots.`;
  } else if (cmd === 'nobots') {
    for (const p of players.values()) if (p.bot) players.delete(p.id);
    msg = 'All bots removed.';
  } else msg = 'commands: reset | bots?n=10 | nobots | status';
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end((msg ? msg + '\n' : '') + status() + '\n');
}

function status() {
  const all = [...players.values()];
  const mem = process.memoryUsage().rss / 1048576;
  return `humans=${all.filter(p => !p.bot).length} bots=${all.filter(p => p.bot).length} projectiles=${projectiles.size} memMB=${mem.toFixed(0)}`;
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
  return { tier: 0, ammo: 0, owned: S.WEAPONS.map((W, i) => i === 0 || (bot && !W.pack)) };
}

function newPlayer(bot, socket) {
  const p = { id: nextId++, name: pickName(bot), bot, socket, ...S.randomSpawn(), vy: 0, ry: 0, ...startKit(bot),
    hp: S.MAX_HP, money: 0, kills: 0, deaths: 0, dead: false, lastFire: S.WEAPONS.map(() => 0), lastShot: 0, lastHit: 0,
    blindUntil: 0, msgs: 0, lastFix: 0, lastActive: Date.now(), farm: new Map(), earn: 200 };
  resetMove(p);
  players.set(p.id, p);
  return p;
}

function respawn(p) {
  Object.assign(p, S.randomSpawn(), { vy: 0, hp: S.MAX_HP, dead: false });
  resetMove(p);
  if (p.socket) p.socket.emit('respawn', { x: p.x, y: p.y, z: p.z });
}

// ---------- Movement anti-cheat ----------
// Clients simulate their own movement, but the server only accepts moves a legit client could make:
// horizontal speed via a token bucket, a jump-height ceiling, and a max air time (stops low-gravity floating).
function resetMove(p) {
  Object.assign(p, { budget: 0, air: 0, pinned: false, falling: false, peak: p.y + JUMP_H + 0.3, lastMove: Date.now(), ignoreUntil: Date.now() + 500 });
}

// Walk from p toward q in small steps so a big jump can't skip through a thin box.
function sweep(p, q) {
  const n = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.3) || 1, c = { x: p.x, y: p.y, z: p.z };
  let g = 0;
  for (let i = 0; i < n; i++) {
    c.x += (q.x - p.x) / n; c.y += (q.y - p.y) / n; c.z += (q.z - p.z) / n;
    g = S.resolve(c);
  }
  q.x = c.x; q.z = c.z;
  return g;
}

function clientMove(p, a) {
  const now = Date.now();
  if (p.dead || now < p.ignoreUntil || !Array.isArray(a) || a.length !== 4 || !a.every(Number.isFinite)) return;
  const dt = Math.min(0.5, (now - p.lastMove) / 1000);
  p.lastMove = now;
  // Refill at barely over walk speed; the 2.5m cap (~250ms) absorbs lag bursts. A 1.3x rate let speed hacks keep 30%.
  p.budget = Math.min(2.5, p.budget + dt * S.SPEED * 1.05);
  const q = { x: a[0], y: a[1], z: a[2] };
  const dx = q.x - p.x, dz = q.z - p.z, dist = Math.hypot(dx, dz);
  if (dist > p.budget) { q.x = p.x + dx / dist * p.budget; q.z = p.z + dz / dist * p.budget; }
  p.budget -= Math.min(dist, p.budget);
  const g = sweep(p, q);   // no walking through boxes or out of the arena
  if (q.y <= g + 0.05) { q.y = Math.max(q.y, g); p.air = 0; p.peak = g + JUMP_H + 0.3; p.pinned = false; }
  else if (p.pinned) q.y = g;   // stays pinned until the client admits it landed
  else {
    // Rising again just after falling near the ground = a landing we missed between 20Hz samples (bunny hop).
    // Floating cheaters never get here: they'd have to come back down to the ground first.
    if (q.y > p.y && p.falling && p.y <= g + 1) { p.air = 0; p.peak = g + JUMP_H + 0.3; }
    // Over a box top (g > 0 only counts boxes we're nearly on top of): the client may have stepped onto it mid-jump.
    if (g > 0 && g + JUMP_H + 0.3 > p.peak) { p.peak = g + JUMP_H + 0.3; p.air = 0; }
    p.air += dt;
    if (q.y > p.peak) q.y = p.peak;
    if (p.air > 1.5) { q.y = g; p.pinned = true; }
  }
  if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) > 0.05 || Math.abs(a[3] - p.ry) > 0.05) p.lastActive = now;
  p.falling = q.y < p.y;
  p.x = q.x; p.y = q.y; p.z = q.z; p.ry = a[3];
  // Tell a cheating (or badly lagging) client where it really is.
  if (Math.hypot(q.x - a[0], q.y - a[1], q.z - a[2]) > 0.5 && now - p.lastFix > 250) {
    p.lastFix = now;
    p.socket.emit('setpos', { x: p.x, y: p.y, z: p.z });
  }
}

function sendMe(p) {
  if (p.socket) p.socket.emit('me', { money: p.money, tier: p.tier, kills: p.kills, ammo: p.ammo, owned: p.owned.map(Number) });
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

// ---------- Combat ----------
// Clients only choose weapon + aim direction. Origin, cooldown, ownership and spread are all server-side.
function fire(p, w, d) {
  const W = S.WEAPONS[w], now = Date.now();
  if (!W || p.dead || !p.owned[w] && !(W.pack && p.ammo > 0) || now - p.lastFire[w] < W.cd * 1000 * 0.9) return;
  // Like the real client, guns share one cooldown: no firing sniper + pie + burger in the same instant.
  if (!W.pack && now - p.lastShot < W.cd * 1000 * 0.9) return;
  const len = Math.hypot(...d);
  if (!(len > 1e-6 && len < 1e6)) return;
  d = d.map(n => n / len);
  p.lastFire[w] = now; p.lastActive = now;
  if (W.pack) { p.ammo--; sendMe(p); } else p.lastShot = now;
  // Always fire from the server's copy of the player's eyes, so nobody can shoot from behind a wall.
  const o = [p.x + d[0] * 0.6, p.y + 1.6 + d[1] * 0.6, p.z + d[2] * 0.6];
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

function damage(v, a, amt, w, head) {
  if (v.dead) return;
  if (!S.WEAPONS[w].pierce) amt *= 1 - S.OUTFITS[v.tier].res;
  v.hp -= amt; v.lastHit = Date.now();
  if (v.socket) v.socket.emit('ouch', { w, hp: v.hp, head });
  if (a && a.socket) a.socket.emit('hitmark', { head });
  if (v.hp > 0) return;
  v.dead = true; v.deaths++;
  if (a && a !== v && (v.bot || Date.now() - v.lastActive < IDLE_MS)) { a.kills++; a.money += reward(a, v); sendMe(a); }
  io.emit('kill', { k: a ? a.name : '???', v: v.name, w, head });
  setTimeout(() => players.has(v.id) && respawn(v), S.RESPAWN_MS);
}

function reward(a, v) {
  const now = Date.now(), rec = a.farm.get(v.id);
  const n = rec && now - rec.t < REPEAT_MS ? rec.n + 1 : 0;
  a.farm.set(v.id, { n, t: now });
  const amt = Math.min(Math.floor(a.earn), Math.round(S.killReward(v.tier) / 2 ** n));
  a.earn -= amt;
  return amt;
}

function endProjectile(pr, hitPlayer) {
  const W = S.WEAPONS[pr.w], owner = players.get(pr.owner);
  projectiles.delete(pr.id);
  if (W.blind) {
    // Whipped cream: longer blind when close and looking toward it. Clients draw it; bots stop aiming.
    for (const p of players.values()) {
      if (p.id === pr.owner || p.dead) continue;
      const dx = pr.x - p.x, dz = pr.z - p.z, d = Math.hypot(dx, pr.y - p.y - 1.6, dz);
      if (d > W.blind) continue;
      const facing = (-Math.sin(p.ry) * dx - Math.cos(p.ry) * dz) / (Math.hypot(dx, dz) || 1) > 0;
      const secs = (0.8 + 3.2 * (1 - d / W.blind)) * (facing ? 1 : 0.5);
      p.blindUntil = Date.now() + secs * 1000;
      if (p.socket) p.socket.emit('blind', +secs.toFixed(2));
    }
  } else if (W.splash) {
    for (const p of players.values()) {
      if (p.id === pr.owner || p.dead) continue;
      const d = S.distToPlayer(pr.x, pr.y, pr.z, p);
      if (d < W.splash) damage(p, owner, W.dmg * (1 - d / W.splash * 0.7), pr.w);
    }
  } else if (hitPlayer) {
    const head = !!W.head && pr.y - hitPlayer.y > S.HEAD_Y;
    damage(hitPlayer, owner, head ? W.head : W.dmg, pr.w, head);
  }
  io.emit('pop', { id: pr.id, w: pr.w, p: [+pr.x.toFixed(2), +Math.max(0, pr.y).toFixed(2), +pr.z.toFixed(2)] });
}

function stepProjectiles(dt) {
  for (const pr of projectiles.values()) {
    const W = S.WEAPONS[pr.w];
    const steps = Math.ceil(W.speed * dt / 0.4), sdt = dt / steps;
    outer: for (let i = 0; i < steps; i++) {
      pr.vy -= W.grav * sdt;
      pr.x += pr.vx * sdt; pr.y += pr.vy * sdt; pr.z += pr.vz * sdt; pr.t += sdt;
      for (const p of players.values()) {
        if (p.id !== pr.owner && !p.dead && S.distToPlayer(pr.x, pr.y, pr.z, p) < 0.55 + W.r) { endProjectile(pr, p); break outer; }
      }
      if (pr.t > W.life || S.inBox(pr.x, pr.y, pr.z) || Math.abs(pr.x) > S.ARENA || Math.abs(pr.z) > S.ARENA) { endProjectile(pr); break; }
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
  if (Math.random() < (ai.w === 0 ? 0.3 : 0.03)) {
    let d = [Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5];
    if (Math.random() < 0.4 && Date.now() > b.blindUntil) {   // occasionally aim at someone (badly), unless creamed
      let best, bd = 30;
      for (const p of players.values()) {
        const dd = Math.hypot(p.x - b.x, p.z - b.z);
        if (p !== b && !p.dead && dd < bd) { bd = dd; best = p; }
      }
      if (best) d = [best.x - b.x + (Math.random() - 0.5) * 6, best.y - b.y + Math.random() * 2, best.z - b.z + (Math.random() - 0.5) * 6];
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
  socket.on('disconnect', () => {
    players.delete(p.id);
    const n = ipCount.get(ip) - 1;
    if (n > 0) ipCount.set(ip, n); else ipCount.delete(ip);
  });
});

// ---------- Loops ----------
const TICK = 1 / 30;
let tickN = 0;
setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) {
    if (p.bot) stepBot(p, TICK);
    if (!p.dead && now - p.lastHit > 5000) p.hp = Math.min(S.MAX_HP, p.hp + 10 * TICK);
    p.earn = Math.min(EARN_MAX, p.earn + EARN_PER_SEC * TICK);
  }
  stepProjectiles(TICK);
  if (++tickN % 3 !== 0) {   // ~20Hz snapshots
    const r = (n) => Math.round(n * 100) / 100;
    io.emit('snap', [...players.values()].map(p => [p.id, r(p.x), r(p.y), r(p.z), r(p.ry), p.tier, Math.ceil(p.hp), p.dead ? 1 : 0]));
  }
  if (tickN % 30 === 0) for (const p of players.values()) p.msgs = 0;   // per-second message budget
  if (tickN % 30 === 0) io.emit('board', [...players.values()].map(p => [p.id, p.name, p.tier, p.kills, p.money, p.bot ? 1 : 0]));
}, TICK * 1000);

setInterval(() => console.log(new Date().toISOString(), status()), 30000);
server.listen(PORT, () => console.log(`Stain Wars on http://localhost:${PORT}`));
