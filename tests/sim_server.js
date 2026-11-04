// Loads the real server.js with a fake clock and fake sockets, then drives it like a client would.
const Module = require('module'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.PORT = '0';
const DT = +process.env.DT || 0.0166667;
let fake = 1e12; const realNow = Date.now; Date.now = () => fake;
let src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
src = src.replace(/setInterval\(\(\) => console\.log[^\n]*\n/, '');
src += `\nmodule.exports = { players, projectiles, newPlayer, clientMove, damage, buyTray, buyUpgrade, buyWeapon, equip, fire, stepProjectiles, stepBot, addBot, endProjectile, trayUp, S, io, server };\n`;
const m = new Module(path.join(ROOT, 'server.js')); m.filename = path.join(ROOT, 'server.js'); m.paths = Module._nodeModulePaths(ROOT);
m._compile(src, m.filename);
const { players, projectiles, newPlayer, clientMove, damage, buyTray, buyUpgrade, equip, fire, stepProjectiles, addBot, trayUp, S, io, server } = m.exports;

let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const adv = (ms) => { fake += ms; };

function client(x, z, y = 0) {
  const events = { setpos: 0, last: {} };
  const c = { x, y, z, vy: 0, onGround: true };
  const sock = { emit(ev, d) { events.last[ev] = d; events[ev] = (events[ev] || 0) + (ev === 'setpos' ? 0 : 1); if (ev === 'setpos') { events.setpos++; Object.assign(c, d, { vy: 0 }); } } };
  const p = newPlayer(false, sock);
  Object.assign(p, { x, y, z });
  p.fallTop = y; p.peak = y + S.MAX_RISE + 0.3; p.ignoreUntil = 0; p.lastMove = fake;
  return { p, c, events, frame: 0 };
}
const send = (A, arr) => { clientMove(A.p, (arr || [A.c.x, A.c.y, A.c.z, 0]).map(n => Math.round(n * 100) / 100)); };
function step(A, dx, dz, jump, dt = DT) {
  adv(dt * 1000);
  S.move(A.c, dx, dz, jump, dt);
  A.frame += dt;
  if (A.frame >= 0.05) { A.frame = 0; send(A); }
}
function go(A, x, z, jump = () => false, maxT = 20) {
  for (let t = 0; t < maxT; t += DT) {
    if (A.p.dead) return false;
    const dx = x - A.c.x, dz = z - A.c.z, l = Math.hypot(dx, dz);
    if (l < 0.25) return true;
    step(A, dx / l, dz / l, jump());
  }
  return false;
}
const idle = (A, secs) => { for (let t = 0; t < secs; t += DT) step(A, 0, 0, false); };

function climb(A, B) {
  const midA = (B.laneA[0] + B.laneA[1]) / 2, midB = (B.laneB[0] + B.laneB[1]) / 2, w = B.sx0 - 1.2, e = B.sx1 + 1.2, cor = B.laneB[1] + 0.6;
  go(A, B.doorX, cor); go(A, w, cor); go(A, w, midA);
  for (let f = 0; f < B.floors; f++) {
    const up = f % 2 === 0, sx = up ? w : e, ex = up ? e : w, lane = up ? midA : midB;
    go(A, sx, lane); go(A, ex, lane);
    if (f + 1 < B.floors) go(A, ex, up ? midB : midA);
  }
  idle(A, 0.3);
}
const atDoor = (B) => client(B.doorX, B.doorZ + 3);
const remove = (A) => players.delete(A.p.id);

// ---------- 1. Honest climbs ----------
for (const B of S.BUILDINGS) {
  const A = atDoor(B);
  climb(A, B);
  check(`climb ${B.name}`, Math.abs(A.p.y - B.roof) < 0.1 && A.events.setpos === 0 && !A.p.dead, `server y=${A.p.y.toFixed(2)} snapbacks=${A.events.setpos}`);
  remove(A);
}

// ---------- 2. Falls ----------
function jumpOff(B, dbl) {
  const A = atDoor(B);
  climb(A, B);
  const x = B.x, z = B.z + B.d / 2 + 6;
  go(A, x, B.az1 - 0.8);
  let jumped = false;
  // Hop the parapet at the south wall; optionally double jump at the top for extra height.
  for (let t = 0; t < 8 && !A.p.dead; t += DT) {
    const air = !A.c.onGround;
    const press = !jumped ? true : dbl && air && A.c.vy < 0.5 && !A.c.usedAir;
    if (!jumped && air) jumped = true;
    const past = A.c.z > B.z + B.d / 2 + 1;
    step(A, 0, past ? 0 : 1, press);
    if (jumped && A.c.onGround) break;
  }
  idle(A, 0.3);
  return A;
}
{
  const two = S.BUILDINGS.find(b => b.roof === 7.2), three = S.BUILDINGS.find(b => b.roof === 10.8), tower = S.BUILDINGS.find(b => b.name === 'LOOKOUT');
  let A = jumpOff(two, false); check('hop off 7.2m roof survives', !A.p.dead && A.p.y < 0.1, `y=${A.p.y.toFixed(2)} fallTop drop ok, snapbacks=${A.events.setpos}`); remove(A);
  A = jumpOff(three, false); check('hop off 10.8m roof = stained', A.p.dead && A.events.last.ouch === undefined); remove(A);
  A = jumpOff(tower, false); check('hop off 18m lookout = stained', A.p.dead, `snapbacks=${A.events.setpos}`); remove(A);
  // Late double jump to soften the landing doesn't help.
  A = jumpOff(tower, true); check('double jump off 18m still stained', A.p.dead); remove(A);
  // Big owl survives a drop that kills a normal player (5x its own height).
  A = atDoor(three); climb(A, three); A.p.scale = 2; A.p.team = 1;
  go(A, three.x, three.az1 - 0.8);
  let jumped = false;
  for (let t = 0; t < 8 && !A.p.dead; t += DT) { if (!A.c.onGround) jumped = true; step(A, 0, A.c.z > three.z + three.d / 2 + 1 ? 0 : 1, !jumped); if (jumped && A.c.onGround) break; }
  idle(A, 0.2);
  check('2x owl survives 10.8m (limit 20m)', !A.p.dead && A.p.y < 0.1); remove(A);
}

// ---------- 3. Honest jumping stays clean ----------
{
  const A = client(10, 22);
  for (let t = 0; t < 20; t += DT) {
    const dir = Math.floor(t / 2) % 2 ? 1 : -1, press = A.c.onGround || (A.c.vy < 1 && !A.c.usedAir && A.frame < 0.01);
    step(A, 0.7 * dir, 0.2 * dir, press);
  }
  check('20s bunny hopping + double jumps: no snapbacks', A.events.setpos === 0 && !A.p.dead, `snapbacks=${A.events.setpos}`);
  remove(A);
  // Low frame rate client
  const L = client(10, 22);
  for (let t = 0; t < 10; t += 0.05) { adv(50); S.move(L.c, 0.7, 0, L.c.onGround || (L.c.vy < 1 && !L.c.usedAir), 0.05); send(L); }
  check('20fps client double jumping: no snapbacks', L.events.setpos === 0, `snapbacks=${L.events.setpos}`);
  remove(L);
}

// ---------- 4. Cheats ----------
{
  // Open ground teleport straight up.
  let A = client(10, 22);
  for (let i = 0; i < 20; i++) { adv(50); send(A, [10, 100, 22, 0]); }
  check('fly hack capped at legit jump height', A.p.y <= S.MAX_RISE + 0.31, `y=${A.p.y.toFixed(2)}`);
  remove(A);
  // Under a ceiling: jump through the floor above.
  const B = S.BUILDINGS[0];
  const inX = B.sx1 + 1.5, inZ = B.laneB[1] + 2;
  A = client(inX, inZ);
  for (let i = 0; i < 20; i++) { adv(50); send(A, [inX, 4, inZ, 0]); }
  check('cannot rise through the ceiling', A.p.y + S.HEADROOM <= 3.2 + 0.2, `y=${A.p.y.toFixed(2)}`);
  remove(A);
  // Outside a wall, claim a huge height while pushing into the building: must not end up on the roof.
  A = client(B.x, B.z + B.d / 2 + 1);
  for (let i = 0; i < 60; i++) { adv(50); send(A, [B.x + 6, 100, B.z, 0]); }
  check('cannot sail over a wall onto the roof', A.p.y < 5 && Math.abs(A.p.z - B.z) > B.d / 2 - 1, `y=${A.p.y.toFixed(2)} z=${A.p.z.toFixed(2)}`);
  remove(A);
  // On an upper floor, claim y=0: can't sink through the floor.
  A = atDoor(B); climb(A, B);
  const rz = A.p.z, rx = A.p.x, ry = A.p.y;
  for (let i = 0; i < 10; i++) { adv(50); send(A, [rx - 1, 0, rz, 0]); }
  check('cannot sink through a floor', A.p.y >= ry - 0.4, `y=${A.p.y.toFixed(2)} (was ${ry})`);
  remove(A);
  // Walk through a wall horizontally at speed (blink).
  A = client(B.x + 8, B.z + B.d / 2 + 1);
  for (let i = 0; i < 40; i++) { adv(50); send(A, [B.x + 8, 0, B.z + B.d / 2 - 3, 0]); }
  check('cannot walk through a wall', A.p.z > B.z + B.d / 2, `z=${A.p.z.toFixed(2)} wall at ${B.z + B.d / 2}`);
  remove(A);
  // Hover: jump up and report a constant height.
  A = client(10, 22);
  for (let i = 0; i < 60; i++) { adv(50); send(A, [10, 3, 22, 0]); }
  check('hover hack gets pinned', A.p.y < 0.1 && A.p.pinned, `y=${A.p.y.toFixed(2)}`);
  remove(A);
  // Step off a tower and float down gently, or hover at roof height: still stained.
  const T = S.BUILDINGS.find(b => b.name === 'LOOKOUT');
  A = atDoor(T); climb(A, T); go(A, T.x, T.az1 - 0.8);
  const outZ = T.z + T.d / 2 + 2;
  A.p.y = T.roof + 1.2; A.p.z = outZ; A.p.fallTop = T.roof + 1.2; A.p.peak = T.roof + 4; A.p.falling = false;
  let y = T.roof + 1.2;
  for (let i = 0; i < 300 && !A.p.dead; i++) { adv(50); y = Math.max(0, y - 0.05); send(A, [A.p.x, y, outZ, 0]); }
  check('float gently down from 18m: still stained', A.p.dead);
  remove(A);
  A = atDoor(T); climb(A, T);
  A.p.y = T.roof + 1.2; A.p.z = outZ; A.p.fallTop = T.roof + 1.2; A.p.peak = T.roof + 4;
  for (let i = 0; i < 200 && !A.p.dead; i++) { adv(50); send(A, [A.p.x, T.roof + 1.2, outZ, 0]); }
  check('hover off a tower: pinned and stained', A.p.dead);
  remove(A);
}

// ---------- 5. Tray ----------
function duel() {
  const V = client(10, 22), At = client(10, 15);   // attacker due north of victim (lower z)
  V.p.ry = 0;   // facing -z, toward the attacker
  V.p.lastActive = fake; At.p.lastActive = fake;
  return { V, At, v: V.p, a: At.p };
}
const fromFront = [0, -1], fromBack = [0, 1];
{
  const { V, At, v, a } = duel();
  v.money = 500; buyTray(v);
  check('tray bought', v.hasTray && v.trayHp === S.TRAY.hp && v.money === 500 - S.TRAY.cost);
  const m0 = v.money; buyTray(v); check('tray only bought once', v.money === m0);
  const broke = client(30, 30); broke.p.money = 10; buyTray(broke.p); check('tray needs money', !broke.p.hasTray); remove(broke);

  damage(v, a, 20, 0, false, fromFront);
  check('front hit lands on tray, not body', v.hp === 100 && v.trayHp === 55, `hp=${v.hp} tray=${v.trayHp}`);
  damage(v, a, 20, 0, false, fromBack);
  check('hit from behind goes around the tray', v.hp === 80 && v.trayHp === 55, `hp=${v.hp}`);
  damage(v, a, 20, 0, false, [1, 0]);
  check('hit from the side goes around the tray', v.hp === 60, `hp=${v.hp}`);
  v.hp = 100;

  // Two-handed food puts it away.
  v.owned[5] = true; v.owned[1] = true;
  equip(v, 5);
  damage(v, a, 10, 0, false, fromFront);
  check('sniper held: no tray', v.hp === 90 && v.trayHp === 55);
  equip(v, 1); damage(v, a, 10, 0, false, fromFront);
  check('shotgun held: no tray', v.hp === 80);
  v.hp = 100;
  equip(v, 0);
  check('tray takes time to raise after switching', !trayUp(v, fake));
  adv(S.TRAY.raiseMs + 1);
  check('tray back up after raise time', trayUp(v, fake));
  // Firing a two-handed gun can't be hidden by never sending equip.
  v.lastShot = 0; v.lastFire = v.lastFire.map(() => 0);
  fire(v, 5, [0, 0, -1]);
  check('firing sniper lowers tray even without an equip message', v.weapon === 5 && !trayUp(v, fake));
  equip(v, 0); adv(S.TRAY.raiseMs + 1);
  equip(v, 99); equip(v, -1); check('bad equip ignored', v.weapon === 0);
  const noGun = client(30, 30); equip(noGun.p, 5); check('cannot equip unowned weapon', noGun.p.weapon === 0); remove(noGun);

  // Sniper: body shot shatters the tray but is stopped; headshot goes over it.
  v.hp = 100; v.trayHp = S.TRAY.hp;
  damage(v, a, S.WEAPONS[5].dmg, 5, false, fromFront);
  check('sniper body shot: tray gone, player unhurt', v.trayHp === 0 && v.hp === 100, `tray=${v.trayHp} hp=${v.hp}`);
  check('tray respawn scheduled at 5s', v.trayBackAt - fake === 5000);
  damage(v, a, 10, 0, false, fromFront);
  check('broken tray blocks nothing', v.hp === 90);
  v.hp = 100;
  v.trayHp = S.TRAY.hp;
  damage(v, a, S.WEAPONS[5].head, 5, true, fromFront);
  check('headshot over the tray still stains', v.dead && v.trayHp === S.TRAY.hp);
  remove(V); remove(At);
}
// Respawn timer is in the real game loop. Wait real time with the real tick.
const wait = (ms) => new Promise(r => { const t = realNow(); const i = setInterval(() => { fake += 34; if (realNow() - t > ms) { clearInterval(i); r(); } }, 34); });

(async () => {
  {
    const { V, At, v, a } = duel();
    v.money = 500; buyTray(v);
    damage(v, a, 999, 5, false, fromFront);
    check('tray destroyed', v.trayHp === 0 && !v.dead);
    await wait(300);
    check('not back yet', v.trayHp === 0);
    fake = v.trayBackAt + 10;
    await wait(100);
    check('tray respawned by the game loop after 5s', v.trayHp === S.TRAY.hp);
    remove(V); remove(At);
  }

  // ---------- 6. Weapon levels ----------
  {
    const { V, At, v, a } = duel();
    a.money = 1000;
    buyUpgrade(a, 0); check('level 0: upgrade locked', a.dmgLv[0] === 0 && a.money === 1000);
    const stain = (w) => { const x = client(50, 50); x.p.lastActive = fake; damage(x.p, a, 9999, w, false, null); remove(x); };
    stain(0); check('stain counted', a.wstains[0] === 1 && S.weaponLevel(1) === 0);
    stain(0); check('2 stains = level 1', S.weaponLevel(a.wstains[0]) === 1);
    const m1 = a.money;
    buyUpgrade(a, 0); check('upgrade bought for tier-1 outfit price', a.dmgLv[0] === 1 && m1 - a.money === S.OUTFITS[1].cost, `paid ${m1 - a.money}`);
    buyUpgrade(a, 0); check('only earned levels can be bought', a.dmgLv[0] === 1);
    buyUpgrade(a, 1); check('unowned weapon cannot be upgraded', a.dmgLv[1] === 0);
    buyUpgrade(a, 99); buyUpgrade(a, -1); buyUpgrade(a, 6); check('bad upgrade ids ignored', a.dmgLv.every((n, i) => i === 0 ? n === 1 : n === 0));
    a.owned[5] = true; a.wstains[5] = 99; buyUpgrade(a, 5); check('sniper has no damage levels', a.dmgLv[5] === 0);
    a.wstains[6] = 99; a.owned[6] = true; buyUpgrade(a, 6); check('cream bomb has no damage levels', a.dmgLv[6] === 0);
    // Damage numbers
    v.hp = 100; damage(v, a, 20, 0, false, null);
    check('+5% damage applied', Math.abs(v.hp - 79) < 1e-6, `hp=${v.hp}`);
    v.tier = 1; v.hp = 100; damage(v, a, 20, 0, false, null);
    check('+5% vs 5% resistance nearly cancels', Math.abs(v.hp - (100 - 20 * 1.05 * 0.95)) < 1e-6, `dmg=${(100 - v.hp).toFixed(2)}`);
    // Level 5 max
    a.wstains[0] = 16; a.money = 9999; for (let i = 0; i < 9; i++) buyUpgrade(a, 0);
    check('caps at 5 levels', a.dmgLv[0] === 5, `lv=${a.dmgLv[0]}`);
    v.tier = 0; v.hp = 100; damage(v, a, 20, 0, false, null);
    check('+25% at max', Math.abs(v.hp - 75) < 1e-6);
    // Sniper body shot is still 2 shots for anyone
    a.wstains[5] = 99; v.tier = 9; v.hp = 100; damage(v, a, 50, 5, false, null); check('sniper body still 50', v.hp === 50);
    // Idle victims pay nothing and don't level.
    const before = a.wstains[0], idleV = client(60, 60); idleV.p.lastActive = fake - 20000; damage(idleV.p, a, 9999, 0, false, null); check('idle victim gives no level progress', a.wstains[0] === before); remove(idleV);
    // Repeat farming dries up.
    const farm = client(61, 60); let n = a.wstains[1];
    a.owned[1] = true; a.earn = 500;
    for (let i = 0; i < 12; i++) { farm.p.dead = false; farm.p.hp = 100; farm.p.lastActive = fake; damage(farm.p, a, 9999, 1, false, null); }
    check('farming one victim stops leveling', a.wstains[1] - n < 7, `+${a.wstains[1] - n} from 12 kills`);
    remove(farm);
    remove(V); remove(At);
  }

  // ---------- 7. Blasts and walls ----------
  {
    const B = S.BUILDINGS[0];
    const At = client(B.x + 12, B.z + B.d / 2 + 6), a = At.p;
    const inside = client(B.x + 8, B.z + B.d / 2 - 2), outside = client(B.x + 8, B.z + B.d / 2 + 2);
    inside.p.lastActive = outside.p.lastActive = fake;
    a.owned[3] = true;
    const { endProjectile } = m.exports;
    // Blast just outside the south wall, level with chest height, avoiding the door.
    const pr = { id: 99999, w: 3, owner: a.id, x: B.x + 8, y: 1.0, z: B.z + B.d / 2 + 0.1, vx: 0, vy: 0, vz: 0, t: 0 };
    check('line through wall is blocked', !S.lineClear(pr.x, 1, pr.z, inside.p.x, 1, inside.p.z));
    projectiles.set(pr.id, pr); endProjectile(pr);
    check('blast hits player outside the wall', outside.p.hp < 100, `hp=${outside.p.hp.toFixed(0)}`);
    check('blast blocked for player inside the wall', inside.p.hp === 100, `hp=${inside.p.hp.toFixed(0)}`);
    remove(At); remove(inside); remove(outside);
    // Projectiles stop at walls, floors and do not go through.
    const S1 = client(B.x + 8, B.z + B.d / 2 + 2), T1 = client(B.x + 8, B.z + B.d / 2 - 2);
    T1.p.lastActive = fake; S1.p.owned[5] = true; S1.p.lastShot = 0; S1.p.lastFire = S1.p.lastFire.map(() => 0);
    S1.p.ry = 0;
    fire(S1.p, 5, [0, 0, -1]);
    for (let i = 0; i < 60 && projectiles.size; i++) stepProjectiles(1 / 30);
    check('sniper stopped by a wall', T1.p.hp === 100, `hp=${T1.p.hp}`);
    // Point blank against the wall.
    S1.p.z = B.z + B.d / 2 + 0.5; adv(2000);
    fire(S1.p, 5, [0, 0, -1]);
    for (let i = 0; i < 60 && projectiles.size; i++) stepProjectiles(1 / 30);
    check('point blank sniper stopped by a wall', T1.p.hp === 100);
    // Through a window it does land.
    remove(S1); remove(T1);
    // From a tower roof to the opposite corner tower's roof
    const T0 = S.BUILDINGS.filter(b => b.name === 'LOOKOUT');
    const sn = client(T0[0].x, T0[0].z, T0[0].roof), tg = client(T0[3].x, T0[3].z, T0[3].roof);
    tg.p.lastActive = fake; sn.p.owned[5] = true; sn.p.lastShot = 0; sn.p.lastFire = sn.p.lastFire.map(() => 0);
    const dist = Math.hypot(tg.p.x - sn.p.x, tg.p.z - sn.p.z);
    fire(sn.p, 5, [tg.p.x - sn.p.x, 0, tg.p.z - sn.p.z]);
    for (let i = 0; i < 60 && projectiles.size; i++) stepProjectiles(1 / 30);
    check(`sniper reaches the far corner tower (${dist.toFixed(0)}m)`, tg.p.hp === 50, `hp=${tg.p.hp}`);
    remove(sn); remove(tg);
  }

  // ---------- 8. Owl eye height indoors ----------
  {
    const e = S.eyeHeight(S.BUILDINGS[0].sx1 + 1.5, 0, S.BUILDINGS[0].az1 - 2, 2.5);
    check('giant owl eye stays under the ceiling', e < 3.2, `eye=${e.toFixed(2)}`);
    check('giant owl eye outdoors unchanged', S.eyeHeight(10, 0, 22, 2.5) === 4);
    check('normal eye unchanged', S.eyeHeight(10, 0, 22, 1) === 1.6);
  }

  // ---------- 9. Load: 50 bots ----------
  {
    for (let i = 0; i < 50; i++) addBot();
    const bots = [...players.values()].filter(p => p.bot);
    const t0 = process.hrtime.bigint(); let ticks = 0;
    for (let i = 0; i < 300; i++) { adv(33); for (const b of bots) m.exports.stepBot(b, 1 / 30); stepProjectiles(1 / 30); ticks++; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / ticks;
    check('50 bots, 10s of game, no crash', true, `${ms.toFixed(2)} ms per 33ms tick, ${projectiles.size} projectiles, ${bots.filter(b => b.y > 0.5).length} bots off the ground`);
  }
  console.log(fails ? `\n${fails} FAILURES` : '\nALL OK');
  process.exit(fails ? 1 : 0);
})();
