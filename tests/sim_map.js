// Walks a simulated player, using the real S.move, into every building and up to its roof.
// Set DT to test another frame rate: DT=0.05 npm test
const S = require('../public/shared.js');
const DT = +process.env.DT || 1 / 60;

function go(p, x, z, maxT = 12, opts = {}) {
  for (let t = 0; t < maxT; t += DT) {
    const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz);
    if (l < 0.25) return true;
    S.move(p, dx / l, dz / l, false, DT);
    if (opts.watch) opts.watch(p);
  }
  return false;
}
const settle = (p) => { for (let i = 0; i < 120; i++) S.move(p, 0, 0, false, DT); };

const corridor0 = (B) => B.laneB[1] + 0.6;
let fails = 0;
for (const B of S.BUILDINGS) {
  const p = { x: B.doorX, y: 0, z: B.doorZ + 3, vy: 0, onGround: true };
  const log = [];
  let ok = go(p, B.doorX, corridor0(B));               // in the front door
  log.push(`door y=${p.y.toFixed(2)} ok=${ok}`);
  // Round the stairs to the foot of the first flight (west side of lane A).
  const midA = (B.laneA[0] + B.laneA[1]) / 2, midB = (B.laneB[0] + B.laneB[1]) / 2;
  const westX = B.sx0 - 1.2, eastX = B.sx1 + 1.2, corridor = B.laneB[1] + 0.6;
  ok = go(p, westX, corridor) && ok;
  ok = go(p, westX, midA) && ok;
  for (let f = 0; f < B.floors; f++) {
    const up = f % 2 === 0;
    const startX = up ? westX : eastX, endX = up ? eastX : westX, lane = up ? midA : midB;
    if (!go(p, startX, lane)) ok = false;
    if (!go(p, endX, lane)) ok = false;
    settle(p);
    const want = (f + 1) * 3.6;
    if (Math.abs(p.y - want) > 0.02) { ok = false; log.push(`floor ${f + 1}: y=${p.y.toFixed(2)} want ${want}`); }
    // Cross to the other lane ready for the next flight.
    if (f + 1 < B.floors) { const nextLane = up ? midB : midA; if (!go(p, endX, nextLane)) { ok = false; log.push(`cross fail ${f}`); } }
  }
  if (Math.abs(p.y - B.roof) > 0.02) ok = false;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${B.name.padEnd(13)} roof=${B.roof} reached y=${p.y.toFixed(2)} at (${p.x.toFixed(1)},${p.z.toFixed(1)}) ${ok ? '' : log.join(' | ')}`);
  if (!ok) fails++;
  // And walk back down: must never hop off the stairs.
  const q = { ...p, onGround: true };
  let air = 0;
  for (let f = B.floors - 1; f >= 0; f--) {
    const up = f % 2 === 0, lane = up ? midA : midB, topX = up ? eastX : westX, botX = up ? westX : eastX;
    go(q, topX, lane); let wasAir = 0;
    go(q, botX, lane, 12, { watch: (r) => { if (!r.onGround) wasAir++; } });
    air += wasAir;
    settle(q);
    if (f > 0) { const nl = up ? midB : midA; go(q, botX, nl); }
  }
  if (Math.abs(q.y) > 0.02 || air > 0) { console.log(`     descent: y=${q.y.toFixed(2)} airFrames=${air}`); if (Math.abs(q.y) > 0.02) fails++; }
}

// Door + side doors passable straight through, no crate blocking.
for (const B of S.BUILDINGS) for (const side of [-1, 1]) {
  const p = { x: B.x + side * (B.w / 2 + 2), y: 0, z: B.sideDoorZ, vy: 0, onGround: true };
  const ok = go(p, B.x + side * (B.w / 2 - 1.5), B.sideDoorZ);
  if (!ok) { console.log(`FAIL side door ${B.name} ${side}`); fails++; }
}

// Double jump height & air time
{
  const p = { x: 10, y: 0, z: 20, vy: 0, onGround: true };
  let top = 0, n = 0, t = 0; settle(p);
  const start = { x: p.x, z: p.z };
  S.move(p, 0, 0, true, DT);
  for (; t < 3; t += DT) {
    const press = p.vy < 0 && !p.usedAir;
    S.move(p, 0, 0, press, DT);
    top = Math.max(top, p.y);
    if (p.onGround) break;
  }
  console.log(`double jump: peak ${top.toFixed(2)} (MAX_RISE ${S.MAX_RISE.toFixed(2)}) air ${t.toFixed(2)}s usedAir reset=${!p.usedAir}`);
  // Holding the key must not trigger the air jump.
  const h = { x: 10, y: 0, z: 20, vy: 0, onGround: true }; let hTop = 0;
  for (let i = 0; i < 60; i++) { S.move(h, 0, 0, true, DT); hTop = Math.max(hTop, h.y); if (h.usedAir) { console.log('FAIL: air jump from held key'); fails++; break; } }
  console.log(`held key: peak ${hTop.toFixed(2)}`);
}

// Fast fall can't tunnel: drop from 18m onto a roof-level floor at the worst client dt.
{
  const B = S.BUILDINGS.find(b => b.name === 'LOOKOUT');
  const p = { x: B.x - 4, y: 40, z: B.z, vy: -40, onGround: false };
  for (let i = 0; i < 200 && !p.onGround; i++) S.move(p, 0, 0, false, 0.05);
  console.log(`fall onto lookout roof: y=${p.y.toFixed(2)} expected ${B.roof}`);
  if (Math.abs(p.y - B.roof) > 0.01) fails++;
}
// Owls over ~1.4x are too big for the doors (2.7m): they get sniped from the buildings. Smaller ones walk in.
for (const scale of [0.8, 1.3, 1.6, 2.5]) {
  let inside = 0;
  for (const B of S.BUILDINGS) {
    const p = { x: B.doorX, y: 0, z: B.doorZ + 3, vy: 0, onGround: true, scale };
    go(p, B.doorX, B.az1 - 2, 4);
    if (p.z < B.az1) inside++;
  }
  const want = scale <= 1.4, ok = want ? inside === S.BUILDINGS.length : inside === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${scale}x owl ${want ? 'can' : 'cannot'} get in the front door (${inside}/${S.BUILDINGS.length})`);
  if (!ok) fails++;
}
// Spawns leave room for the biggest owl.
{
  let stuck = 0;
  for (let i = 0; i < 300; i++) { const p = { ...S.randomSpawn(), scale: S.OWL_MAX }, x = p.x, z = p.z; S.resolve(p); if (p.x !== x || p.z !== z) stuck++; }
  console.log(`${stuck ? 'FAIL' : 'ok  '} giant owl spawns clear of boxes (${stuck} pushed)`); if (stuck) fails++;
}
// Nothing thinner than the projectile step: every wall/floor thick enough, and all boxes in bounds.
const thin = S.BOXES.filter(b => b.top - b.y < 0.3);
const out = S.BOXES.filter(b => Math.abs(b.x) + b.w / 2 > S.ARENA || Math.abs(b.z) + b.d / 2 > S.ARENA);
console.log(`boxes=${S.BOXES.length} thin=${thin.length} outOfBounds=${out.length}`);
// Collision speed
{
  const t0 = process.hrtime.bigint(); let c = 0;
  for (let i = 0; i < 200000; i++) { const p = { x: (i * 7.3) % 150 - 75, y: (i % 4) * 3.6, z: (i * 3.1) % 150 - 75 }; c += S.resolve(p); }
  console.log(`resolve: ${(Number(process.hrtime.bigint() - t0) / 200000 / 1000).toFixed(2)} microseconds each`);
}
console.log(fails ? `\n${fails} FAILURES` : '\nALL OK');
process.exit(fails ? 1 : 0);
