const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const S = require('./public/shared.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

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
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

function admin(url, res) {
  const cmd = url.pathname.slice(7);
  let msg;
  if (cmd === 'reset') {
    for (const p of players.values()) { p.tier = 0; p.money = 0; p.kills = 0; p.deaths = 0; respawn(p); sendMe(p); }
    msg = 'Everyone reset to Plain Beige Tee, $0, 0 kills.';
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

function newPlayer(bot, socket) {
  const p = { id: nextId++, name: pickName(bot), bot, socket, ...S.randomSpawn(), vy: 0, ry: 0,
    hp: S.MAX_HP, tier: 0, money: 0, kills: 0, deaths: 0, dead: false, lastFire: [0, 0, 0], lastHit: 0 };
  players.set(p.id, p);
  return p;
}

function respawn(p) {
  Object.assign(p, S.randomSpawn(), { vy: 0, hp: S.MAX_HP, dead: false });
  if (p.socket) p.socket.emit('respawn', { x: p.x, y: p.y, z: p.z });
}

function sendMe(p) { if (p.socket) p.socket.emit('me', { money: p.money, tier: p.tier, kills: p.kills }); }

// ---------- Combat ----------
function fire(p, w, o, d) {
  const W = S.WEAPONS[w], now = Date.now();
  if (!W || p.dead || now - p.lastFire[w] < W.cd * 1000 * 0.9) return;
  p.lastFire[w] = now;
  if (Math.hypot(o[0] - p.x, o[1] - p.y - 1.6, o[2] - p.z) > 3) o = [p.x, p.y + 1.6, p.z];
  let [dx, dy, dz] = d;
  if (W.spread) { dx += (Math.random() - 0.5) * W.spread; dy += (Math.random() - 0.5) * W.spread; dz += (Math.random() - 0.5) * W.spread; }
  const len = Math.hypot(dx, dy, dz) || 1;
  const pr = { id: nextId++, w, owner: p.id, x: o[0], y: o[1], z: o[2],
    vx: dx / len * W.speed, vy: dy / len * W.speed + (w === 1 ? 4 : 0), vz: dz / len * W.speed, t: 0 };
  projectiles.set(pr.id, pr);
  io.emit('shot', { id: pr.id, w, o: [pr.x, pr.y, pr.z], v: [pr.vx, pr.vy, pr.vz] });
}

function damage(v, a, amt, w) {
  if (v.dead) return;
  amt *= 1 - S.OUTFITS[v.tier].res;
  v.hp -= amt; v.lastHit = Date.now();
  if (v.socket) v.socket.emit('ouch', { w, hp: v.hp });
  if (a && a.socket) a.socket.emit('hitmark');
  if (v.hp > 0) return;
  v.dead = true; v.deaths++;
  if (a && a !== v) { a.kills++; a.money += S.killReward(v.tier); sendMe(a); }
  v.tier = Math.max(0, v.tier - 1);
  sendMe(v);
  io.emit('kill', { k: a ? a.name : '???', v: v.name, w });
  setTimeout(() => players.has(v.id) && respawn(v), S.RESPAWN_MS);
}

function endProjectile(pr, hitPlayer) {
  const W = S.WEAPONS[pr.w], owner = players.get(pr.owner);
  projectiles.delete(pr.id);
  if (W.splash) {
    for (const p of players.values()) {
      if (p.id === pr.owner || p.dead) continue;
      const d = S.distToPlayer(pr.x, pr.y, pr.z, p);
      if (d < W.splash) damage(p, owner, W.dmg * (1 - d / W.splash * 0.7), pr.w);
    }
  } else if (hitPlayer) damage(hitPlayer, owner, W.dmg, pr.w);
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
    ai.w = Math.floor(Math.random() * 3);
  }
  b.ry += ai.spin * dt;
  S.move(b, ai.walk ? Math.sin(ai.dir) : 0, ai.walk ? Math.cos(ai.dir) : 0, ai.jumpy && Math.random() < 0.1, dt);
  if (Math.random() < (ai.w === 0 ? 0.3 : 0.03)) {
    let d = [Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5];
    if (Math.random() < 0.4) {   // occasionally aim at someone (badly)
      let best, bd = 30;
      for (const p of players.values()) {
        const dd = Math.hypot(p.x - b.x, p.z - b.z);
        if (p !== b && !p.dead && dd < bd) { bd = dd; best = p; }
      }
      if (best) d = [best.x - b.x + (Math.random() - 0.5) * 6, best.y - b.y + Math.random() * 2, best.z - b.z + (Math.random() - 0.5) * 6];
    }
    b.ry = Math.atan2(-d[0], -d[2]);
    fire(b, ai.w, [b.x, b.y + 1.6, b.z], d);
  }
  const next = S.OUTFITS[b.tier + 1];
  if (next && b.money >= next.cost) { b.money -= next.cost; b.tier++; }
}

// ---------- Sockets ----------
const io = new Server(server);
io.on('connection', (socket) => {
  const p = newPlayer(false, socket);
  socket.emit('welcome', { id: p.id, name: p.name, spawn: { x: p.x, y: p.y, z: p.z } });
  sendMe(p);
  socket.on('pos', (a) => { if (!p.dead && Array.isArray(a)) [p.x, p.y, p.z, p.ry] = a.map(Number); });
  socket.on('fire', (m) => m && fire(p, m.w, m.o, m.d));
  socket.on('buy', (tier) => {
    const o = S.OUTFITS[tier];
    if (o && tier > p.tier && p.money >= o.cost) { p.money -= o.cost; p.tier = tier; sendMe(p); }
  });
  socket.on('disconnect', () => players.delete(p.id));
});

// ---------- Loops ----------
const TICK = 1 / 30;
let tickN = 0;
setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) {
    if (p.bot) stepBot(p, TICK);
    if (!p.dead && now - p.lastHit > 5000) p.hp = Math.min(S.MAX_HP, p.hp + 10 * TICK);
  }
  stepProjectiles(TICK);
  if (++tickN % 3 !== 0) {   // ~20Hz snapshots
    const r = (n) => Math.round(n * 100) / 100;
    io.emit('snap', [...players.values()].map(p => [p.id, r(p.x), r(p.y), r(p.z), r(p.ry), p.tier, Math.ceil(p.hp), p.dead ? 1 : 0]));
  }
  if (tickN % 30 === 0) io.emit('board', [...players.values()].map(p => [p.id, p.name, p.tier, p.kills, p.money, p.bot ? 1 : 0]));
}, TICK * 1000);

setInterval(() => console.log(new Date().toISOString(), status()), 30000);
server.listen(PORT, () => console.log(`Stain Wars on http://localhost:${PORT}`));
