// Shared by server (require) and client (window.Shared). Tweak gameplay numbers here.
(function (S) {
  S.ARENA = 80;            // arena half-size (meters)
  S.SPEED = 8;             // walk speed
  S.GRAVITY = 22;
  S.JUMP = 9;
  S.JUMP2 = 8;             // double jump (press Space again in the air)
  S.MAX_RISE = (S.JUMP * S.JUMP + S.JUMP2 * S.JUMP2) / (2 * S.GRAVITY);   // highest possible double jump
  S.MAX_FALL = 40;         // terminal velocity
  S.RADIUS = 0.5;          // player radius
  S.HEADROOM = 1.9;        // collision height of a normal player (owls scale it: see bodyScale)
  S.STEP_UP = 0.4;         // ledges this high are walked up. Stairs rise 0.3, and a slow client (20fps) dips 0.055 below the floor each frame
  S.PLAYER_H = 2;          // a player's height, for the fall rule
  // Landing after dropping more than 5x your own height stains you instantly. Bigger owls are taller, so they survive more.
  S.fallLimit = (scale) => 5 * S.PLAYER_H * (scale || 1);
  S.MAX_HP = 100;
  S.RESPAWN_MS = 2000;

  // More tiers = wilder colors + glow. res = fraction of damage blocked ("stain resistance").
  // Outfits are permanent and bought one level at a time (must own tier N to buy N+1).
  S.OUTFITS = [
    { name: 'Plain Beige Tee',       cost: 0,   res: 0.00, shirt: 0xd8c9a8, pants: 0x8a7f6a, hat: 0xb5a888, glow: 0 },
    { name: 'Khaki Dad Fit',         cost: 30,  res: 0.05, shirt: 0xc2b280, pants: 0x6b5d3f, hat: 0x3a5f8a, glow: 0 },
    { name: 'Pastel Picnic',         cost: 60,  res: 0.10, shirt: 0xffb3d9, pants: 0xb3e6ff, hat: 0xfff0a0, glow: 0 },
    { name: 'Neon Gym Rat',          cost: 90,  res: 0.15, shirt: 0x39ff14, pants: 0x111111, hat: 0xff5f1f, glow: 0.15 },
    { name: 'Tie-Dye Festival',      cost: 130, res: 0.20, shirt: 0xff00aa, pants: 0x00e5ff, hat: 0xffea00, glow: 0.2 },
    { name: 'Leopard Lame',          cost: 180, res: 0.25, shirt: 0xffa500, pants: 0x8b00ff, hat: 0x00ff88, glow: 0.3 },
    { name: 'Hot Pink Cowboy',       cost: 240, res: 0.30, shirt: 0xff1493, pants: 0x00ffff, hat: 0xffff00, glow: 0.4 },
    { name: 'Holographic Popstar',   cost: 310, res: 0.35, shirt: 0xb0fffa, pants: 0xff00ff, hat: 0x7cff00, glow: 0.5, rainbow: 0.3 },
    { name: 'Disco Ball Royalty',    cost: 390, res: 0.40, shirt: 0xffffff, pants: 0xffd700, hat: 0xff00ff, glow: 0.6, rainbow: 0.6 },
    { name: 'Rainbow Chaos Supreme', cost: 480, res: 0.45, shirt: 0xff0000, pants: 0x00ff00, hat: 0x0000ff, glow: 0.8, rainbow: 1.5 },
  ];
  S.killReward = (victimTier) => 20 + 15 * victimTier;

  // A game session: a free-for-all, then a team "Owl Showdown". Teacher can override both: stainwars newgame 15 5
  S.FFA_MIN = 15;
  S.TEAM_MIN = 5;
  S.RESULTS_MS = 30000;    // how long the final results stay up before free play resumes
  // Owl size is linear in stains earned (total money earned this game), relative to the top earner.
  // The hitbox and eye height scale too, so the biggest owl is the biggest (and most valuable) target.
  S.OWL_MIN = 0.8;
  S.OWL_MAX = 2.5;
  S.OWL_TOP_FLOOR = 100;   // nobody looks giant until someone has earned at least this much
  S.owlScale = (earned, topEarned) => S.OWL_MIN + (S.OWL_MAX - S.OWL_MIN) * earned / Math.max(topEarned, S.OWL_TOP_FLOOR);
  // Big owls collide at their size (radius and height), so ones over ~1.4x can't fit through doors (2.7m) and get sniped
  // from the buildings. Small owls keep normal collision, so they can't squeeze anywhere a player can't.
  S.bodyScale = (p) => Math.max(1, p.scale || 1);
  // Team points for eliminating an enemy: the victim's earnings / 20, rounded up (at least 1, so a newcomer still counts).
  S.teamPoints = (victimEarned) => Math.max(1, Math.ceil(victimEarned / 20));
  S.TEAMS = [
    { name: 'Barn Owls', owl: 'Barn Owl', css: '#ffb52e', body: 0xe8a030, belly: 0xfff6e0, face: 0xffffff, beak: 0xf2c9a0, eye: 0x1a0f08 },
    { name: 'Great Horned Owls', owl: 'Great Horned Owl', css: '#b48cff', body: 0x3d2a8c, belly: 0x8f7fd8, face: 0xf4f0ff, beak: 0x15101f, eye: 0xff8a00 },
  ];

  // Food weapons. Everyone starts with Mustard; the rest are bought once and kept forever.
  // Flags: pellets (shotgun), splash (radius), lob (extra upward speed), head (headshot damage),
  // pierce (ignores stain resistance), scope (hotdog zoom), pack/maxAmmo (consumable), blind (radius),
  // twoHanded (no tray allowed), noUpgrade (no damage levels).
  S.WEAPONS = [
    { id: 0, name: 'Mustard Squirter',   icon: '💛', cost: 0,   cd: 0.09, speed: 28,  life: 0.45, dmg: 7,  grav: 4,  r: 0.15, spread: 0.05, color: 0xffd400, desc: 'Rapid squirts, short range' },
    { id: 1, name: 'Soda Shotgun',       icon: '🥤', cost: 40,  cd: 0.9,  speed: 32,  life: 0.35, dmg: 9,  grav: 6,  r: 0.12, spread: 0.22, pellets: 8, twoHanded: true, color: 0x5a2a10, desc: '8 fizzy blobs, brutal up close' },
    { id: 2, name: 'Spaghetti Whip',     icon: '🍝', cost: 60,  cd: 0.55, speed: 40,  life: 0.11, dmg: 35, grav: 0,  r: 0.5,  color: 0xf3d36b, desc: 'Wide melee lash, 4m reach' },
    { id: 3, name: 'Hamburger Grenade',  icon: '🍔', cost: 100, cd: 1.1,  speed: 17,  life: 2.5,  dmg: 55, grav: 18, r: 0.3,  splash: 4.5, lob: 4, color: 0x8b4513, desc: 'Lobbed, big splash' },
    { id: 4, name: 'Pie Launcher',       icon: '🥧', cost: 150, cd: 0.9,  speed: 24,  life: 2,    dmg: 60, grav: 9,  r: 0.28, splash: 2.2, lob: 2, color: 0xf5e6c8, desc: 'Heavy pie, small splash' },
    { id: 5, name: 'Ketchup Sniper',     icon: '🌭', cost: 250, cd: 1.4,  speed: 140, life: 1.7,  dmg: 50, grav: 0,  r: 0.1,  head: 999, pierce: true, scope: true, twoHanded: true, noUpgrade: true, color: 0xe0001b, desc: 'Head = 1 shot, body = 2. Ignores outfits' },
    { id: 6, name: 'Whipped Cream Bomb', icon: '🍦', cost: 30,  cd: 0.8,  speed: 16,  life: 1.4,  dmg: 0,  grav: 18, r: 0.25, blind: 10, lob: 4, pack: 3, maxAmmo: 6, color: 0xffffff, desc: 'Blinds nearby players. 3 per pack' },
  ];
  S.FLASH = 6;           // whipped cream bomb index (thrown with G, not a weapon slot)
  S.HEAD_Y = 1.62;       // hits above feet + this count as headshots

  // Cafeteria Tray: a shield, bought once. Blocks hits from the front while you hold a one-handed weapon.
  // Destroyed trays come back after respawnMs. Headshots go over the top; a sniper body shot breaks it outright.
  S.TRAY = { name: 'Cafeteria Tray', icon: '🍽️', cost: 120, hp: 75, respawnMs: 5000, raiseMs: 400, cone: 0.34,
    desc: 'Blocks hits from the front. One-handed food only (not Soda Shotgun or Ketchup Sniper). Back 5s after it breaks' };

  // Weapon levels: stains (eliminations) with a weapon unlock damage upgrades for it, which you then buy.
  // Mirrors outfits on purpose: +5% damage per level for the same price as the matching +5% stain resistance tier.
  S.DMG_STEP = 0.05;
  S.LEVEL_STAINS = [2, 4, 7, 11, 16];   // total stains with that weapon to reach level 1, 2, ...
  S.weaponLevel = (stains) => S.LEVEL_STAINS.filter(n => stains >= n).length;
  S.upgradeCost = (bought) => S.OUTFITS[bought + 1].cost;
  S.canUpgrade = (W) => W.dmg > 0 && !W.noUpgrade;

  // Deterministic map so server and clients agree. A box is a solid block from height y up to top.
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
  const r = rng(1234);
  const COLORS = [0xff6b6b, 0xffd93d, 0x6bcB77, 0x4d96ff, 0xc77dff, 0xff9f1c, 0x2ec4b6];
  S.BOXES = [];
  S.BUILDINGS = [];
  const box = (x0, x1, z0, z1, y, top, color) => { if (x1 - x0 > 0.01 && z1 - z0 > 0.01) S.BOXES.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, y, top, color }); };

  // Sizes are chosen so nothing can be tunneled through: walls and floors are thicker than a projectile step or a move step.
  const FLOOR_H = 3.6, WALL = 0.5, SLAB = 0.4, RISE = 0.3, TREAD = 0.5, RUN = TREAD * FLOOR_H / RISE, LANE = 2.4;
  const DOOR = { w: 3, lo: 0, hi: 2.7 }, WINDOW = { w: 2, lo: 1.1, hi: 2.5 };
  const FLOOR_COLOR = 0xeee3cf, STAIR_COLOR = 0x8d99ae, TRIM_COLOR = 0xf7f3e8, CRATE_COLOR = 0xc48a4a;

  // One story of wall with openings cut out. It runs from..to along one axis; `fixed` is its center line on the other axis.
  function wall(alongX, fixed, from, to, y, top, openings, color) {
    const seg = (a, b, y0, y1) => {
      if (b - a < 0.01 || y1 - y0 < 0.01) return;
      if (alongX) box(a, b, fixed - WALL / 2, fixed + WALL / 2, y0, y1, color);
      else box(fixed - WALL / 2, fixed + WALL / 2, a, b, y0, y1, color);
    };
    let pos = from;
    for (const o of [...openings].sort((p, q) => p.at - q.at)) {
      const a = o.at - o.w / 2, b = o.at + o.w / 2;
      seg(pos, a, y, top);
      seg(a, b, y, y + o.lo);
      seg(a, b, y + o.hi, top);
      pos = b;
    }
    seg(pos, to, y, top);
  }

  // A hollow building you can walk around inside. Stairs switch back in two lanes against the north wall, up to a walled roof.
  function building(name, cx, cz, w, d, floors, color, doorX = 0) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const ax0 = x0 + WALL, ax1 = x1 - WALL, az0 = z0 + WALL, az1 = z1 - WALL;   // inside faces of the walls
    const sx0 = cx - RUN / 2, sx1 = cx + RUN / 2, laneA = [az0, az0 + LANE], laneB = [az0 + LANE, az0 + LANE * 2];
    const doorAt = cx + doorX, sideDoorAt = az1 - 1.7, roof = floors * FLOOR_H;
    S.BUILDINGS.push({ name, x: cx, z: cz, w, d, floors, roof, doorX: doorAt, doorZ: z1, sideDoorZ: sideDoorAt, sx0, sx1, laneA, laneB, ax0, ax1, az0, az1 });
    // Evenly spaced windows, skipping anything too close to a door or (on the north wall) hidden behind the stairs.
    const windows = (from, to, doors, skip) => {
      const n = Math.max(1, Math.floor((to - from) / 5)), out = doors.map(at => ({ ...DOOR, at }));
      for (let i = 0; i < n; i++) {
        const at = from + (i + 0.5) * (to - from) / n;
        if (!doors.some(p => Math.abs(p - at) < 2.7) && !(skip && at > skip[0] && at < skip[1])) out.push({ ...WINDOW, at });
      }
      return out;
    };
    for (let f = 0; f < floors; f++) {
      const y = f * FLOOR_H, top = y + FLOOR_H, g = f === 0, lane = f % 2 ? laneB : laneA;
      wall(true, z1 - WALL / 2, x0, x1, y, top, windows(x0 + 1, x1 - 1, g ? [doorAt] : []), color);
      wall(true, z0 + WALL / 2, x0, x1, y, top, windows(x0 + 1, x1 - 1, [], [sx0 - 1.5, sx1 + 1.5]), color);
      wall(false, x0 + WALL / 2, az0, az1, y, top, windows(az0 + 0.5, az1 - 0.5, g ? [sideDoorAt] : []), color);
      wall(false, x1 - WALL / 2, az0, az1, y, top, windows(az0 + 0.5, az1 - 0.5, g ? [sideDoorAt] : []), color);
      // Solid steps climbing to the floor above. Even floors go east in lane A, odd floors go back west in lane B.
      for (let i = 1; i <= Math.round(FLOOR_H / RISE); i++) {
        const a = f % 2 ? sx1 - i * TREAD : sx0 + (i - 1) * TREAD;
        box(a, a + TREAD, lane[0], lane[1], y, y + i * RISE, STAIR_COLOR);
      }
      // The floor above, with a hole over this flight of stairs.
      const fy = top - SLAB;
      box(ax0, sx0, az0, az1, fy, top, FLOOR_COLOR);
      box(sx1, ax1, az0, az1, fy, top, FLOOR_COLOR);
      box(sx0, sx1, az0, lane[0], fy, top, FLOOR_COLOR);
      box(sx0, sx1, lane[1], az1, fy, top, FLOOR_COLOR);
      // Big buildings get side rooms, with a doorway at each end of the dividing wall.
      if (w >= 20) for (const side of [-1, 1]) wall(false, cx + side * w * 0.33, az0, az1, y, top, [{ ...DOOR, w: 2.4, at: az0 + 1.6 }, { ...DOOR, w: 2.4, at: az1 - 1.6 }], TRIM_COLOR);
      // A couple of crates to hide behind (the tower corridors are too narrow for them).
      if (d >= 10) for (const side of [-1, 1]) {
        const cxx = cx + side * (w * 0.12 + 1 + r() * 2), czz = az1 - 1.2 - r() * 1.5;
        if (!(g && Math.abs(cxx - doorAt) < 3)) box(cxx - 0.7, cxx + 0.7, czz - 0.7, czz + 0.7, y, y + 1.1, CRATE_COLOR);
      }
    }
    // A waist-high wall around the roof: cover for snipers, and it stops accidental falls.
    box(x0, x1, z0, z0 + WALL, roof, roof + 1, TRIM_COLOR);
    box(x0, x1, z1 - WALL, z1, roof, roof + 1, TRIM_COLOR);
    box(x0, ax0, az0, az1, roof, roof + 1, TRIM_COLOR);
    box(ax1, x1, az0, az1, roof, roof + 1, TRIM_COLOR);
  }

  // Three-story roofs (10.8m) are over the lethal 10m drop; two-story roofs (7.2m) are not, unless you jump up first.
  building('FOOD COURT', 0, 0, 30, 22, 3, 0xff6b6b);
  building('BURGER BARN', -42, -38, 22, 16, 2, 0xff9f1c);
  building('PIZZA PALACE', 42, -38, 20, 18, 3, 0x2ec4b6);
  building('TACO TOWN', -40, 40, 20, 16, 3, 0xc77dff);
  building('NOODLE HOUSE', 42, 38, 24, 14, 2, 0xffd93d);
  building('SODA FACTORY', 0, -62, 24, 12, 2, 0x4d96ff);
  building('PIE SHOP', 0, 62, 24, 12, 2, 0xff85c0);
  building('DONUT DEPOT', -62, 0, 16, 18, 2, 0x6bcB77);
  building('HOT DOG HUT', 62, 0, 16, 18, 2, 0xe2583e);
  // Sniper lookouts in the corners: 18m roofs that can see the whole map.
  for (const [x, z] of [[-66, -66], [66, -66], [-66, 66], [66, 66]]) building('LOOKOUT', x, z, 12, 8, 5, 0x7b6d8d, -4);

  // Scattered crates outside, keeping clear of the buildings so doors stay open.
  for (let i = 0; i < 70; i++) {
    const x = (r() * 2 - 1) * (S.ARENA - 5), z = (r() * 2 - 1) * (S.ARENA - 5), w = 2 + r() * 5, d = 2 + r() * 5, h = 1 + r() * 3;
    if (S.BUILDINGS.some(B => Math.abs(x - B.x) < B.w / 2 + w / 2 + 3 && Math.abs(z - B.z) < B.d / 2 + d / 2 + 3)) continue;
    box(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, h, COLORS[i % COLORS.length]);
  }

  // Grid of nearby boxes, so collision stays cheap with this many boxes (kept private: it isn't gameplay data).
  const CELL = 6, N = Math.ceil(S.ARENA * 2 / CELL) + 1, grid = Array.from({ length: N * N }, () => []);
  const cellOf = (v) => Math.max(0, Math.min(N - 1, Math.floor((v + S.ARENA) / CELL)));
  const near = (x, z) => grid[cellOf(x) * N + cellOf(z)];
  for (const b of S.BOXES) {
    const m = S.RADIUS * S.OWL_MAX + 0.1;   // big enough for the biggest owl
    for (let i = cellOf(b.x - b.w / 2 - m); i <= cellOf(b.x + b.w / 2 + m); i++)
      for (let j = cellOf(b.z - b.d / 2 - m); j <= cellOf(b.z + b.d / 2 + m); j++) grid[i * N + j].push(b);
  }
  const over = (b, x, z) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2;

  // Clear of every box by enough room for the biggest owl.
  S.randomSpawn = () => {
    const m = S.RADIUS * S.OWL_MAX + 0.5;
    for (;;) {
      const p = { x: (Math.random() * 2 - 1) * (S.ARENA - 3), y: 0, z: (Math.random() * 2 - 1) * (S.ARENA - 3) };
      if (!S.BOXES.some(b => Math.abs(p.x - b.x) < b.w / 2 + m && Math.abs(p.z - b.z) < b.d / 2 + m)) return p;
    }
  };

  // Push a player {x,y,z,scale} out of boxes; returns the ground height under them and sets p.ceil (lowest thing their head can hit).
  // Each box is one of: under the feet (ground), just over the head (ceiling), clear above, or in the way (push out).
  // A ceiling must be over the player's center: a door lintel at head height in front of a big owl is a wall, not a ceiling.
  S.resolve = (p) => {
    const s = S.bodyScale(p), R = S.RADIUS * s, H = S.HEADROOM * s;
    let ground = 0, ceil = Infinity;
    for (let pass = 0; pass < 2; pass++) {   // twice, so a corner can't push you from one wall into the other
      ground = 0; ceil = Infinity;
      for (const b of near(p.x, p.z)) {
        const hx = b.w / 2, hz = b.d / 2;
        const cx = Math.max(b.x - hx, Math.min(p.x, b.x + hx)), cz = Math.max(b.z - hz, Math.min(p.z, b.z + hz));
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (p.y >= b.top - S.STEP_UP) { ground = Math.max(ground, b.top); continue; }
        const head = p.y + H;
        if (head <= b.y) continue;
        if (head < b.y + 0.5 && over(b, p.x, p.z)) { ceil = Math.min(ceil, b.y); continue; }
        if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + dx / d * R; p.z = cz + dz / d * R; }
        else {
          const px = hx + R - Math.abs(p.x - b.x), pz = hz + R - Math.abs(p.z - b.z);
          if (px < pz) p.x += Math.sign(p.x - b.x || 1) * px; else p.z += Math.sign(p.z - b.z || 1) * pz;
        }
      }
    }
    const A = S.ARENA - R;
    p.x = Math.max(-A, Math.min(A, p.x)); p.z = Math.max(-A, Math.min(A, p.z));
    p.ceil = ceil;
    return ground;
  };

  // Move p {x,y,z,vy} by world-space direction (dx,dz in -1..1). jump = is the jump key held right now.
  S.move = (p, dx, dz, jump, dt) => {
    const wasGround = p.onGround;
    p.x += dx * S.SPEED * dt; p.z += dz * S.SPEED * dt;
    let jumped = false;
    if (jump && p.onGround) { p.vy = S.JUMP; jumped = true; }
    else if (jump && !p.jumpHeld && !p.onGround && !p.usedAir) { p.vy = S.JUMP2; p.usedAir = true; }   // a fresh press in the air
    p.jumpHeld = !!jump;
    p.vy = Math.max(-S.MAX_FALL, (p.vy || 0) - S.GRAVITY * dt);
    // Small vertical steps, so a fast fall can't pass through a floor.
    const dy = p.vy * dt, n = Math.max(1, Math.ceil(Math.abs(dy) / 0.3));
    let g = 0;
    const H = S.HEADROOM * S.bodyScale(p);
    p.onGround = false;
    for (let i = 0; i < n; i++) {
      p.y += dy / n;
      g = S.resolve(p);
      if (p.vy > 0 && p.y + H > p.ceil) { p.y = p.ceil - H; p.vy = 0; }   // bonk
      if (p.vy <= 0 && p.y <= g) { p.y = g; p.vy = 0; p.onGround = true; break; }
    }
    // Stay glued to the stairs going down, instead of hopping from step to step.
    if (!p.onGround && wasGround && !jumped && p.vy <= 0 && p.y - g < S.STEP_UP) { p.y = g; p.vy = 0; p.onGround = true; }
    if (p.onGround) p.usedAir = false;
  };

  S.inBox = (x, y, z) => y < 0 || near(x, z).some(b => y >= b.y && y < b.top && over(b, x, z));

  // Is the straight line between two points free of boxes? Stops blasts going through walls and floors.
  S.lineClear = (x0, y0, z0, x1, y1, z1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 0.3) || 1;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (S.inBox(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  };

  // Eye height above the feet. Giant owls would poke their heads through ceilings, so indoors it stops just under the ceiling.
  S.eyeHeight = (x, y, z, scale) => {
    const e = 1.6 * (scale || 1);
    if (e <= S.HEADROOM) return e;
    let top = Infinity;
    for (const b of near(x, z)) if (b.y >= y + S.HEADROOM - 0.5 && b.y < top && over(b, x, z)) top = b.y;
    return Math.min(e, top - y - 0.2);
  };

  // Height of the surface below a point (where a splat lands).
  S.floorBelow = (x, y, z) => {
    let g = 0;
    for (const b of near(x, z)) if (b.top <= y + 0.1 && b.top > g && over(b, x, z)) g = b.top;
    return g;
  };

  // Distance from point to the player's body (vertical segment). Bigger owls have taller bodies.
  S.distToPlayer = (x, y, z, p) => {
    const s = p.scale || 1, cy = Math.max(p.y + 0.3 * s, Math.min(p.y + 1.5 * s, y));
    return Math.hypot(x - p.x, y - cy, z - p.z);
  };

  S.NAMES = ['Taylor Swiftly', 'Harry Stylish', 'Zendaya-ish', 'Billie Eyelash', 'Ariana Grandish', 'Justin Beaver',
    'Dua Leapa', 'Post Malonely', 'Olivia Rodrigo-Go', 'Selena Gomezzz', 'Bad Bunny Slippers', 'Doja Catnap',
    'Lizzo Fizzo', 'Ed Sheeran-ish', 'Shawn Mendeez', 'Timothee Chalamazing', 'Tom Hollandaise', 'Kim Karcrashian',
    'Kendall Jenno', 'Gigi Haddit', 'Bella Haddit', 'Tyra Banksy', 'Naomi Camp-Bell', 'Heidi Klumsy',
    'Rihanna Banana', 'Beyonce-ish', 'Lady GooGoo', 'Bruno Mars Bar', 'The Weeknd-ish', 'Drake Cake',
    'Keanu Leaves', 'Dwayne The Pebble', 'Ryan Reynoodles', 'Margot Robbery', 'Chris Hemsworm', 'Jennifer Lawnmower',
    'Snoop Doggo', 'Cardi Beep', 'Megan Thee Scallion', 'Jack Harlowe-een', 'Sabrina Carpenter Ant', 'Chappell Roan-ald',
    'Pedro Pastrami', 'Jenna Orteguacamole', 'Millie Bobby Brownie', 'Lil Nas Ketchup', 'Kylie Jennerator', 'Zac Effrontery',
    'Adele-icious', 'Pharrell Squirrel', 'Miley Silly-rus', 'Shakira Shakira Shaker'];
  // Lock everything (nested too) so `Shared.SPEED = 30` in the console does nothing. Just a speed bump:
  // the server's movement checks are the real defense.
  (function deepFreeze(o) { Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); })(S);
})(typeof module !== 'undefined' ? module.exports : (window.Shared = {}));
