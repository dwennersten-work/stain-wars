// Vehicles, ziplines, emotes and the Thanksgiving boss, driven against the real server.js (loaded by sim_server.js).
module.exports = (X) => {
  const { S, players, projectiles, vehicles, enterVehicle, leaveVehicle, driveInput, stepVehicles, hitVehicle, resetVehicle, zipToggle, stepZip,
    emote, startGame, advance, stepBoss, hurtBoss, boss, session, freePlay, fire, clientMove, stepProjectiles, client, step, check, adv, remove, now } = X;
  const TICK = 1 / 30;
  const run = (secs, each) => { for (let t = 0; t < secs; t += TICK) { adv(1000 * TICK); if (each) each(); stepVehicles(TICK, now()); } };
  const reload = (p) => { p.lastShot = 0; p.lastFire = p.lastFire.map(() => 0); };
  const flush = (secs = 3) => { for (let i = 0; i < secs * 30 && projectiles.size; i++) stepProjectiles(TICK); };
  const clear = () => { for (const p of [...players.values()]) players.delete(p.id); projectiles.clear(); };

  // ---------- 10. Vehicles ----------
  clear(); freePlay();
  const v = vehicles[1];   // a Pizza Buggy parked at (7, 50), facing north
  resetVehicle(v);
  const far = client(7, 40); enterVehicle(far.p);
  check('too far from the car: cannot get in', !far.p.veh);
  const D = client(7 + 2.3, 50); enterVehicle(D.p);
  check('right next to the car: you drive', D.p.veh === v && D.p.seat === 0);
  const P = client(7 - 2.3, 50); enterVehicle(P.p);
  check('second person in: passenger seat', P.p.veh === v && P.p.seat === 1);
  for (const bad of [null, 'x', [NaN, 0], [1], [1, 2, 3], { 0: 1, 1: 1, length: 2 }, ['1', '1']]) driveInput(D.p, bad);
  check('bad drive messages ignored', v.thr === 0 && v.steer === 0);
  driveInput(P.p, [1, 0]);
  check('passengers cannot drive', v.thr === 0);
  driveInput(D.p, [1e9, -1e9]);
  check('drive input clamped to -1..1', v.thr === 1 && v.steer === -1);
  driveInput(D.p, [0, 0]);
  reload(D.p); const n0 = projectiles.size; fire(D.p, 0, [0, 0, -1]);
  check('drivers cannot shoot', projectiles.size === n0);
  reload(P.p); fire(P.p, 0, [-1, 0, 0]);
  check('passengers can shoot', projectiles.size === n0 + 1);
  projectiles.clear();
  clientMove(P.p, [100, 50, 100, 1]);
  check('riders cannot move themselves (only look around)', Math.abs(P.p.x - 100) > 50 && P.p.ry === 1);

  const z0 = v.z;
  run(2, () => driveInput(D.p, [1, 0]));
  check('the car drives forward', v.z < z0 - 10, `moved ${(z0 - v.z).toFixed(1)}m in 2s, ${v.speed.toFixed(1)} m/s`);
  check('never beats its top speed', v.speed <= S.VEHICLE_TYPES.car.top + 1e-9);
  check('riders ride along', Math.hypot(D.p.x - v.x, D.p.z - v.z) < 1.5 && P.p.y === S.SEAT_Y);
  check('driving burns fuel', v.fuel < S.FUEL_MAX, `fuel=${v.fuel.toFixed(1)}`);

  // Run someone over.
  const V = client(v.x, v.z - 9); V.p.lastActive = now();
  run(0.8, () => driveInput(D.p, [1, 0]));
  check('running someone over stains them', V.p.hp < 100, `hp=${V.p.hp.toFixed(0)} (${S.runoverDmg(v.speed).toFixed(0)} at this speed)`);
  check('...knocks them out of the way, and tells their client', Math.abs((V.p.x - v.x) * Math.cos(v.ry) - (V.p.z - v.z) * Math.sin(v.ry)) > 1.5 && V.events.setpos > 0);
  remove(V);

  // Keep going north: through the Town Square and the gas station, into the Soda Factory's south wall.
  run(10, () => driveInput(D.p, [1, 0]));
  check('cars cannot drive through buildings', v.z > -108.5, `stopped at z=${v.z.toFixed(1)} (wall at -108.5)`);

  // Out of gas = stuck.
  Object.assign(v, { ry: Math.PI, speed: 0, fuel: 0.01 });
  const x1 = v.x, z1 = v.z;
  run(3, () => driveInput(D.p, [1, 0]));
  check('out of gas: stuck', v.fuel === 0 && Math.hypot(v.x - x1, v.z - z1) < 0.5);
  // Gobble Gas fills you up.
  Object.assign(v, { x: 0, z: -56 });
  run(3, () => driveInput(D.p, [0, 0]));
  check('parked on the gas station pad: refueled', v.fuel === S.FUEL_MAX);

  leaveVehicle(D.p);
  check('getting out: beside the car, told where', !D.p.veh && v.seats[0] === 0 && S.vehDist(v.type, v.x, v.z, v.ry, D.p.x, D.p.z) > 0.3 && D.events.setpos > 0);
  adv(600); const dx0 = D.p.x;
  clientMove(D.p, [D.p.x + 30, 0, D.p.z, 0]);
  check('on foot again: the normal speed limit is back', Math.abs(D.p.x - dx0) < 3);
  remove(D);   // out of the line of fire below

  // Cars are cover: a shot at the car hits the car, not the driver.
  const E = client(v.x + 2.3, v.z); enterVehicle(E.p);
  const sh = client(v.x + 14, v.z); sh.p.owned[5] = true; reload(sh.p);
  const vhp = v.hp;
  fire(sh.p, 5, [-14, -1.1, 0]);
  flush();
  check('a shot at the car hits the car (with stain resistance), not the driver', v.hp === vhp - S.WEAPONS[5].dmg * (1 - S.VEH_RES) && E.p.hp === 100, `car ${vhp}->${v.hp}`);
  hitVehicle(v, sh.p, 99999, 0);
  check('a washed-out car throws everyone out', v.dead && !E.p.veh && !P.p.veh && v.seats.every(s => !s));
  enterVehicle(E.p);
  check('nobody can get into a washed-out car', !E.p.veh);
  adv(S.VEH_RESPAWN_MS + 10); stepVehicles(TICK, now());
  check('...and it comes back home later', !v.dead && v.x === v.home.x && v.hp === S.VEHICLE_TYPES.car.hp && v.fuel === S.FUEL_MAX);
  v.fuel = 0; v.x += 5; run(0.1); adv(S.STUCK_RESET_MS + 10); stepVehicles(TICK, now());
  check('an empty out-of-gas car gets towed home', v.fuel === S.FUEL_MAX && v.x === v.home.x);
  [P, E, sh, far].forEach(remove);
  {   // Parked tight against the Food Court's south wall (outer face z=11), driver's door on the wall side.
    const B = S.BUILDINGS.find(b => b.name === 'FOOD COURT'), c = vehicles[0], T = S.VEHICLE_TYPES[c.type];
    resetVehicle(c); Object.assign(c, { x: B.x - 4, z: B.z + B.d / 2 + T.wid / 2 + 0.05, ry: -Math.PI / 2 });
    const W = client(c.x, c.z + 3); enterVehicle(W.p); leaveVehicle(W.p);
    check('getting out against a wall: never through it', W.p.z > B.z + B.d / 2, `z=${W.p.z.toFixed(2)} (wall face at ${B.z + B.d / 2})`);
    remove(W); resetVehicle(c);
  }

  // ---------- 11. Ziplines ----------
  {
    const L = S.ZIPLINES[0], Z = client(L.la[0], L.la[2], L.la[1]);
    const nope = client(10, 22); zipToggle(nope.p);
    check('no zipline in reach: nothing happens', !nope.p.zip);
    zipToggle(Z.p);
    check('grab the zipline beside its pole (rides away from that end)', Z.p.zip && Z.p.zip.dir === 1 && Z.events.zip === 1);
    const at = Z.p.x;
    clientMove(Z.p, [Z.p.x + 50, Z.p.y, Z.p.z, 0]);
    check('riders cannot move themselves', Math.abs(Z.p.x - at) < 1);
    let t = 0;
    for (; t < 10 && Z.p.zip; t += TICK) { adv(1000 * TICK); stepZip(Z.p, TICK); }
    check('the ride ends standing on the far roof', !Z.p.zip && Z.p.x === L.lb[0] && Z.p.z === L.lb[2] && Z.p.y === L.lb[1] && Z.events.unzip === 1,
      `${t.toFixed(1)}s for ${L.len.toFixed(0)}m (${S.ZIP_SPEED} m/s)`);
    zipToggle(Z.p);
    check('from the far end it rides back', Z.p.zip && Z.p.zip.dir === -1);
    zipToggle(Z.p);
    check('E again lets go', !Z.p.zip);
    remove(Z); remove(nope);
    // Let go high over the Town Square: a long fall stains you, like any other.
    const L1 = S.ZIPLINES[1], F = client(L1.la[0], L1.la[2], L1.la[1]);
    zipToggle(F.p);
    for (let i = 0; i < 90; i++) { adv(1000 * TICK); stepZip(F.p, TICK); }
    zipToggle(F.p);
    Object.assign(F.c, { x: F.p.x, y: F.p.y, z: F.p.z, vy: 0, onGround: false });
    const top = F.p.y;
    for (let i = 0; i < 200 && !F.p.dead; i++) step(F, 0, 0, false);
    check(`letting go ${top.toFixed(1)}m up is a fatal fall`, F.p.dead);
    remove(F);
  }

  // ---------- 12. Emotes ----------
  {
    const M = client(10, 22);
    emote(M.p, 2);
    check('emote starts', M.p.emote === 3);
    M.p.ignoreUntil = 0; M.p.budget = 2; adv(100);
    clientMove(M.p, [M.p.x + 0.5, 0, M.p.z, 0]);
    check('walking stops the dance', M.p.emote === 0);
    emote(M.p, 0); reload(M.p); fire(M.p, 0, [0, 0, -1]);
    check('shooting stops the dance', M.p.emote === 0);
    emote(M.p, 1); emote(M.p, -1);
    check('-1 stops it too', M.p.emote === 0);
    projectiles.clear(); remove(M);
  }

  // ---------- 13. The turkey boss ----------
  {
    clear();
    const A1 = client(0, 0), A2 = client(0, 0);
    startGame(0, 0, 60000);
    check('a boss-only game starts the turkey fight', session.phase === 'boss' && boss.on);
    check('turkey HP scales with the class', boss.max === Math.max(S.BOSS.hpMin, 2 * S.BOSS.hpHuman) && boss.hp === boss.max, `${boss.max} HP for 2 students`);
    check('everyone spawns out of stomping range', [A1, A2].every(A => Math.hypot(A.p.x, A.p.z) >= 45));
    const late = client(60, 60);
    check('a latecomer makes the turkey tougher', boss.max === Math.max(S.BOSS.hpMin, 3 * S.BOSS.hpHuman));
    remove(late);
    // No friendly fire: everyone is on the same side.
    A1.p.lastActive = A2.p.lastActive = now();
    Object.assign(A1.p, { x: 60, y: 0, z: 22 }); Object.assign(A2.p, { x: 62, y: 0, z: 22 });
    reload(A1.p); fire(A1.p, 0, [1, -0.1, 0]); flush();
    check('no friendly fire in the boss fight', A2.p.hp === 100);
    // Squirt the turkey from 12m away.
    Object.assign(A1.p, { x: boss.x, y: 0, z: boss.z + 12 });
    const hp0 = boss.hp;
    for (let i = 0; i < 20; i++) { adv(100); fire(A1.p, 0, [0, 0.25, -1]); flush(0.5); }
    check('stains hurt the turkey', boss.hp < hp0, `${(hp0 - boss.hp).toFixed(0)} damage from 20 squirts`);
    check('...and pay a little money', A1.p.money > 0 && A1.p.bossDmg > 0, `$${A1.p.money}`);
    const h1 = boss.hp; hurtBoss(A1.p, 0, 10, true);
    check('head hits do double damage', Math.abs(h1 - boss.hp - 20) < 1e-9);
    // Its attacks hurt players (gravy, cranberries, stuffing or a stomp).
    Object.assign(A2.p, { x: boss.x + 20, y: 0, z: boss.z, hp: 100, dead: false });
    let hurt = false;
    for (let i = 0; i < 30 * 30 && !hurt; i++) { adv(1000 * TICK); stepBoss(TICK, now()); stepProjectiles(TICK); hurt = A1.p.hp < 100 || A2.p.hp < 100 || A1.p.dead || A2.p.dead; }
    check('the turkey fights back', hurt);
    // Jump to dodge the stomp.
    projectiles.clear();
    Object.assign(A1.p, { x: boss.x + 8, y: 0, z: boss.z, hp: 100, dead: false }); Object.assign(A2.p, { x: boss.x - 8, y: 2.5, z: boss.z, hp: 100, dead: false });
    boss.stompAt = now() + 900; boss.next = now() + 99999;
    adv(1000); stepBoss(TICK, now());
    check('the stomp hits people on the ground...', A1.p.hp < 100, `hp=${A1.p.hp.toFixed(0)}`);
    check('...but not people in the air', A2.p.hp === 100);
    hurtBoss(A1.p, 0, 1e9, false);
    const R = session.results;
    check('staining it to 0 wins the game for everyone', session.phase === 'ended' && R.boss && R.boss.won && R.boss.top[0][0] === A1.p.name);
    check('no credit for overkill', A1.p.bossDmg <= boss.max + 1e-6);
    check('the turkey is gone', !boss.on);
    // Time runs out = the turkey wins.
    startGame(0, 0, 1000); advance();
    check('time up: the turkey got away', session.phase === 'ended' && session.results.boss && !session.results.boss.won);
    // Full game: free-for-all -> Owl Showdown -> turkey -> results (with the owl result kept).
    startGame(1000, 1000, 1000);
    const phases = [session.phase];
    for (let i = 0; i < 3; i++) { advance(); phases.push(session.phase); }
    check('ffa -> team -> boss -> ended', phases.join(',') === 'ffa,team,boss,ended', phases.join(','));
    check('results keep both the owl and the turkey outcome', session.results.boss && session.results.winner !== null);
    freePlay(); clear();
  }
};
