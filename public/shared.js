// Shared by server (require) and client (window.Shared). Tweak gameplay numbers here.
(function (S) {
  S.ARENA = 40;            // arena half-size (meters)
  S.SPEED = 8;             // walk speed
  S.GRAVITY = 22;
  S.JUMP = 9;
  S.RADIUS = 0.5;          // player radius
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

  // Food weapons. Everyone starts with Mustard; the rest are bought once and kept forever.
  // Flags: pellets (shotgun), splash (radius), lob (extra upward speed), head (headshot damage),
  // pierce (ignores stain resistance), scope (hotdog zoom), pack/maxAmmo (consumable), blind (radius).
  S.WEAPONS = [
    { id: 0, name: 'Mustard Squirter',   icon: '💛', cost: 0,   cd: 0.09, speed: 28,  life: 0.45, dmg: 7,  grav: 4,  r: 0.15, spread: 0.05, color: 0xffd400, desc: 'Rapid squirts, short range' },
    { id: 1, name: 'Soda Shotgun',       icon: '🥤', cost: 40,  cd: 0.9,  speed: 32,  life: 0.35, dmg: 9,  grav: 6,  r: 0.12, spread: 0.22, pellets: 8, color: 0x5a2a10, desc: '8 fizzy blobs, brutal up close' },
    { id: 2, name: 'Spaghetti Whip',     icon: '🍝', cost: 60,  cd: 0.55, speed: 40,  life: 0.11, dmg: 35, grav: 0,  r: 0.5,  color: 0xf3d36b, desc: 'Wide melee lash, 4m reach' },
    { id: 3, name: 'Hamburger Grenade',  icon: '🍔', cost: 100, cd: 1.1,  speed: 17,  life: 2.5,  dmg: 55, grav: 18, r: 0.3,  splash: 4.5, lob: 4, color: 0x8b4513, desc: 'Lobbed, big splash' },
    { id: 4, name: 'Pie Launcher',       icon: '🥧', cost: 150, cd: 0.9,  speed: 24,  life: 2,    dmg: 60, grav: 9,  r: 0.28, splash: 2.2, lob: 2, color: 0xf5e6c8, desc: 'Heavy pie, small splash' },
    { id: 5, name: 'Ketchup Sniper',     icon: '🌭', cost: 250, cd: 1.4,  speed: 140, life: 1.2,  dmg: 50, grav: 0,  r: 0.1,  head: 999, pierce: true, scope: true, color: 0xe0001b, desc: 'Head = 1 shot, body = 2. Ignores outfits' },
    { id: 6, name: 'Whipped Cream Bomb', icon: '🍦', cost: 30,  cd: 0.8,  speed: 16,  life: 1.4,  dmg: 0,  grav: 18, r: 0.25, blind: 10, lob: 4, pack: 3, maxAmmo: 6, color: 0xffffff, desc: 'Blinds nearby players. 3 per pack' },
  ];
  S.FLASH = 6;           // whipped cream bomb index (thrown with G, not a weapon slot)
  S.HEAD_Y = 1.62;       // hits above feet + this count as headshots

  // Deterministic map so server and clients agree.
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
  const r = rng(1234);
  const COLORS = [0xff6b6b, 0xffd93d, 0x6bcB77, 0x4d96ff, 0xc77dff, 0xff9f1c, 0x2ec4b6];
  S.BOXES = [];
  for (let i = 0; i < 28; i++) {
    const x = (r() * 2 - 1) * (S.ARENA - 5), z = (r() * 2 - 1) * (S.ARENA - 5);
    if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;
    S.BOXES.push({ x, z, w: 2 + r() * 5, d: 2 + r() * 5, h: 1 + r() * 3, color: COLORS[i % COLORS.length] });
  }

  S.randomSpawn = () => {
    for (;;) {
      const p = { x: (Math.random() * 2 - 1) * (S.ARENA - 3), y: 0, z: (Math.random() * 2 - 1) * (S.ARENA - 3) };
      if (!S.BOXES.some(b => Math.abs(p.x - b.x) < b.w / 2 + 1 && Math.abs(p.z - b.z) < b.d / 2 + 1)) return p;
    }
  };

  // Push a player {x,y,z} out of boxes; returns the ground height under them.
  S.resolve = (p) => {
    let ground = 0;
    const R = S.RADIUS;
    for (const b of S.BOXES) {
      const hx = b.w / 2, hz = b.d / 2;
      const cx = Math.max(b.x - hx, Math.min(p.x, b.x + hx)), cz = Math.max(b.z - hz, Math.min(p.z, b.z + hz));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      if (p.y >= b.h - 0.35) { ground = Math.max(ground, b.h); continue; }
      if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + dx / d * R; p.z = cz + dz / d * R; }
      else {
        const px = hx + R - Math.abs(p.x - b.x), pz = hz + R - Math.abs(p.z - b.z);
        if (px < pz) p.x += Math.sign(p.x - b.x || 1) * px; else p.z += Math.sign(p.z - b.z || 1) * pz;
      }
    }
    const A = S.ARENA - R;
    p.x = Math.max(-A, Math.min(A, p.x)); p.z = Math.max(-A, Math.min(A, p.z));
    return ground;
  };

  // Move p {x,y,z,vy} by world-space direction (dx,dz in -1..1).
  S.move = (p, dx, dz, jump, dt) => {
    p.x += dx * S.SPEED * dt; p.z += dz * S.SPEED * dt;
    if (jump && p.onGround) p.vy = S.JUMP;
    p.vy = (p.vy || 0) - S.GRAVITY * dt;
    p.y += p.vy * dt;
    const g = S.resolve(p);
    if (p.y <= g) { p.y = g; p.vy = 0; p.onGround = true; } else p.onGround = false;
  };

  S.inBox = (x, y, z) => y < 0 || S.BOXES.some(b => y < b.h && Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);

  // Distance from point to the player's body (vertical segment).
  S.distToPlayer = (x, y, z, p) => {
    const cy = Math.max(p.y + 0.3, Math.min(p.y + 1.5, y));
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
