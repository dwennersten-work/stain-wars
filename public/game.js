import * as THREE from 'three';
const S = window.Shared;
const socket = io();
const $ = (id) => document.getElementById(id);

// ---------- Scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87e0ff);
scene.fog = new THREE.Fog(0x87e0ff, 40, 110);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(20, 40, 10); scene.add(sun);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const mat = (color, extra) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0x7ed957));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const arena = new THREE.Mesh(new THREE.PlaneGeometry(S.ARENA * 2, S.ARENA * 2, 20, 20), mat(0x9be564, { wireframe: false }));
arena.rotation.x = -Math.PI / 2; arena.position.y = 0.01; scene.add(arena);
for (const b of S.BOXES) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat(b.color));
  m.position.set(b.x, b.h / 2, b.z); scene.add(m);
}
// fence + silly scenery
for (let i = 0; i < 4; i++) {
  const w = new THREE.Mesh(new THREE.BoxGeometry(S.ARENA * 2, 1, 0.4), mat([0xff4fa3, 0xffe600, 0x4d96ff, 0x7b2ff7][i]));
  w.position.set(i < 2 ? 0 : (i === 2 ? 1 : -1) * S.ARENA, 0.5, i < 2 ? (i === 0 ? 1 : -1) * S.ARENA : 0);
  if (i >= 2) w.rotation.y = Math.PI / 2;
  scene.add(w);
}
for (let i = 0; i < 40; i++) {
  const a = Math.random() * Math.PI * 2, d = S.ARENA + 8 + Math.random() * 40;
  const tree = new THREE.Mesh(new THREE.ConeGeometry(2 + Math.random() * 2, 6 + Math.random() * 6, 5), mat(new THREE.Color().setHSL(Math.random(), 0.8, 0.55)));
  tree.position.set(Math.cos(a) * d, 4, Math.sin(a) * d); scene.add(tree);
}

// ---------- Avatars ----------
const G = {
  leg: new THREE.BoxGeometry(0.25, 0.8, 0.3), body: new THREE.CylinderGeometry(0.42, 0.5, 0.8, 6),
  arm: new THREE.BoxGeometry(0.18, 0.6, 0.18), head: new THREE.IcosahedronGeometry(0.38, 0),
  eye: new THREE.SphereGeometry(0.13, 8, 6), pupil: new THREE.SphereGeometry(0.06, 6, 4), hat: new THREE.ConeGeometry(0.3, 0.55, 5),
};
const skin = mat(0xffcc99), white = mat(0xffffff), black = mat(0x000000);

function makeAvatar() {
  const g = new THREE.Group();
  const shirt = mat(0xffffff), pants = mat(0xffffff), hat = mat(0xffffff);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  add(G.leg, pants, -0.15, 0.4, 0); add(G.leg, pants, 0.15, 0.4, 0);
  add(G.body, shirt, 0, 1.2, 0);
  const armL = add(G.arm, shirt, -0.55, 1.25, 0), armR = add(G.arm, shirt, 0.55, 1.25, 0);
  add(G.head, skin, 0, 1.85, 0);
  const eyeL = add(G.eye, white, -0.15, 1.92, -0.3), eyeR = add(G.eye, white, 0.17, 1.95, -0.3);
  eyeR.scale.setScalar(1.3); // derp
  const pupils = [add(G.pupil, black, -0.15, 1.92, -0.42), add(G.pupil, black, 0.17, 1.95, -0.45)];
  const h = add(G.hat, hat, 0.05, 2.35, 0); h.rotation.z = 0.25;
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  tag.scale.set(2.4, 0.6, 1); tag.position.y = 2.95; g.add(tag);
  scene.add(g);
  return { g, shirt, pants, hat, armL, armR, pupils, eyes: [eyeL, eyeR], canvas, tag, tier: -1, hp: -1, name: '',
    target: new THREE.Vector3(), ry: 0, phase: Math.random() * 10 };
}

function setOutfit(mats, tier) {
  const o = S.OUTFITS[tier];
  for (const [m, c] of [[mats.shirt, o.shirt], [mats.pants, o.pants], [mats.hat, o.hat]]) {
    m.color.setHex(c); m.emissive.setHex(c).multiplyScalar(o.glow);
  }
}

function drawTag(a) {
  const c = a.canvas.getContext('2d');
  c.clearRect(0, 0, 256, 64);
  c.font = 'bold 26px Comic Sans MS, sans-serif'; c.textAlign = 'center';
  c.lineWidth = 5; c.strokeStyle = '#000'; c.fillStyle = '#' + S.OUTFITS[a.tier].shirt.toString(16).padStart(6, '0');
  c.strokeText(a.name, 128, 28); c.fillText(a.name, 128, 28);
  c.fillStyle = '#000'; c.fillRect(48, 40, 160, 14);
  c.fillStyle = a.hp > 50 ? '#3f3' : a.hp > 25 ? '#fd0' : '#f33'; c.fillRect(50, 42, 156 * Math.max(0, a.hp) / 100, 10);
  a.tag.material.map.needsUpdate = true;
}

const avatars = new Map();
const names = new Map();

// ---------- Weapons: projectiles, viewmodels ----------
function burgerMesh(s) {
  const g = new THREE.Group();
  const layers = [[0xd99a4e, 0.12], [0x55aa22, 0.04], [0x6b3a1e, 0.1], [0xffcc00, 0.03], [0xe23a2a, 0.04], [0xe8a65a, 0.16]];
  let y = 0;
  for (const [c, h] of layers) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, h, 8), mat(c)); m.position.y = y + h / 2; y += h; g.add(m); }
  g.scale.setScalar(s); return g;
}
function pieMesh(s) {
  const g = new THREE.Group();
  const crust = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.1, 10), mat(0xd9a35a)); g.add(crust);
  const cream = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.07, 10), mat(0xffffff)); cream.position.y = 0.07; g.add(cream);
  const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat(0xc0102a)); cherry.position.y = 0.14; g.add(cherry);
  g.scale.setScalar(s); return g;
}
function bottle(color, cap) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.35, 8), mat(color)); g.add(b);
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 8), mat(cap)); t.position.y = 0.25; g.add(t);
  g.rotation.x = -Math.PI / 2; return g;
}
const ball = new THREE.SphereGeometry(0.12, 6, 4), pellet = new THREE.SphereGeometry(0.07, 5, 3), blob = new THREE.IcosahedronGeometry(0.25, 0);
function projMesh(w) {
  if (w === 3) return burgerMesh(0.8);
  if (w === 4) return pieMesh(0.9);
  const m = new THREE.Mesh(w === 1 ? pellet : w === 6 ? blob : ball, mat(S.WEAPONS[w].color));
  if (w === 2) m.scale.set(0.4, 0.4, 10);   // flying noodle
  if (w === 5) m.scale.set(0.8, 0.8, 4);
  return m;
}

const views = [
  bottle(0xffd400, 0xff3300),
  (() => {   // soda shotgun: big cola bottle with a red label
    const g = bottle(0x5a2a10, 0xff2222); g.scale.set(1.6, 1.3, 1.6);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.1, 8), mat(0xe8101c)));
    return g;
  })(),
  (() => {   // spaghetti whip: fork with a noodle tangle and a meatball
    const g = new THREE.Group();
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5), mat(0xcccccc)); fork.rotation.x = -Math.PI / 2; g.add(fork);
    const nood = new THREE.Mesh(new THREE.TorusKnotGeometry(0.08, 0.02, 40, 4), mat(0xf3d36b)); nood.position.z = -0.27; g.add(nood);
    const meatball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(0x7a3a1a)); meatball.position.set(0, 0.06, -0.27); g.add(meatball);
    return g;
  })(),
  burgerMesh(0.5),
  (() => { const g = pieMesh(0.55); g.rotation.x = 0.5; return g; })(),
  (() => {
    const g = bottle(0xe0001b, 0xffffff); g.scale.set(1.2, 1.6, 1.2);
    const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), mat(0xe8b46a)); bun.position.set(0, 0.05, -0.12); g.add(bun);
    const dog = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.36, 4, 8), mat(0xb0391b)); dog.position.set(0, 0.05, -0.17); g.add(dog);
    return g; // ketchup sniper with hotdog scope
  })(),
];
views.forEach(v => { v.position.set(0.35, -0.32, -0.9); v.rotation.y = 0.15; v.userData.rx = v.rotation.x; v.visible = false; camera.add(v); });

const shots = new Map();
const parts = [];
const decals = [];
const decalGeo = new THREE.CircleGeometry(1, 7);
const splatColors = [[0xffd400], [0x5a2a10, 0x8b4a20], [0xf3d36b, 0xe23a2a], [0x6b3a1e, 0x55aa22, 0xe23a2a, 0xffcc00],
  [0xf5e6c8, 0xffffff, 0xe8a65a, 0xc0102a], [0xe0001b], [0xffffff, 0xfff5e0]];

function splat(p, w) {
  const big = !!(S.WEAPONS[w].splash || S.WEAPONS[w].blind), cols = splatColors[w];
  for (let i = 0; i < (big ? 16 : 5); i++) {
    const m = new THREE.Mesh(ball, mat(cols[i % cols.length]));
    m.position.set(p[0], p[1] + 0.2, p[2]);
    const sp = big ? 9 : 4;
    parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * sp, Math.random() * sp, (Math.random() - 0.5) * sp), t: 0.6 });
    scene.add(m);
  }
  if (p[1] < 0.3 || Math.random() < 0.3) {
    const d = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: cols[Math.floor(Math.random() * cols.length)] }));
    d.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
    d.scale.setScalar(big ? 2.5 : 0.4 + Math.random() * 0.5);
    d.position.set(p[0], 0.02 + Math.random() * 0.01, p[2]);
    scene.add(d); decals.push(d);
    if (decals.length > 150) scene.remove(decals.shift());
  }
}

// ---------- Silly synth sounds (Web Audio, no files) ----------
let ac, noiseBuf;
function audio() {
  if (!ac) {
    ac = new AudioContext();
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ac;
}
// Pitch slide from f to `to`. vib = wobble depth in Hz (kazoo, trombone, burp).
function tone(f, dur, { type = 'square', vol = 0.05, to = f * 0.4, at = 0, vib = 0 } = {}) {
  if (!ac || vol < 0.002) return;
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (vib) {
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = 7; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur);
  }
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
// Noise through a sweeping filter: squirts, splats, fizz, whooshes.
function noise(dur, { vol = 0.05, type = 'lowpass', f = 1000, to = f, q = 1, at = 0 } = {}) {
  if (!ac || vol < 0.002) return;
  const t = ac.currentTime + at, src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf; fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(fl).connect(g).connect(ac.destination); src.start(t, Math.random() * 0.5); src.stop(t + dur);
}
const notes = (list, opts) => { let at = 0; for (const [f, d] of list) { tone(f, d, { to: f * 0.98, at, ...opts }); at += d * 0.9; } };
const SFX = {
  squirt: (v = 1) => { noise(0.07, { vol: 0.06 * v, type: 'bandpass', f: 2600, to: 700, q: 3 }); tone(350 + Math.random() * 150, 0.05, { type: 'triangle', vol: 0.02 * v }); },
  fizz: (v = 1) => {
    tone(140, 0.08, { vol: 0.08 * v, to: 50 });                          // *pop*
    noise(0.45, { vol: 0.07 * v, type: 'highpass', f: 3000, to: 7000 });  // fsssss
    if (v === 1 && Math.random() < 0.15) SFX.burp();
  },
  burp: () => tone(95, 0.45, { type: 'sawtooth', vol: 0.09, to: 70, at: 0.35, vib: 25 }),
  whip: (v = 1) => { noise(0.16, { vol: 0.09 * v, type: 'bandpass', f: 400, to: 3500, q: 2 }); tone(1400, 0.12, { type: 'sine', vol: 0.04 * v, to: 300, at: 0.1 }); },
  lob: (v = 1) => tone(180, 0.22, { type: 'sine', vol: 0.1 * v, to: 620, vib: 30 }),   // boing!
  snipe: (v = 1) => { tone(1300, 0.18, { vol: 0.05 * v, to: 120 }); noise(0.1, { vol: 0.08 * v, f: 900, to: 200 }); },
  spray: (v = 1) => noise(0.5, { vol: 0.06 * v, type: 'highpass', f: 5000, to: 3000 }),   // pssshhh
  splat: (v = 1, big) => {
    noise(big ? 0.4 : 0.18, { vol: (big ? 0.14 : 0.05) * v, f: big ? 2500 : 1800, to: 150 });
    tone(big ? 120 : 220, big ? 0.25 : 0.1, { type: 'sine', vol: (big ? 0.12 : 0.03) * v, to: 40 });
  },
  poof: (v = 1) => { noise(0.7, { vol: 0.15 * v, f: 6000, to: 300 }); tone(70, 0.4, { type: 'sine', vol: 0.12 * v, to: 30 }); },
  oof: () => { tone(260 + Math.random() * 60, 0.16, { type: 'sawtooth', vol: 0.05, to: 140 }); noise(0.12, { vol: 0.05, f: 1200, to: 200 }); },
  hit: () => tone(1200, 0.04, { vol: 0.03 }),
  bonk: () => { tone(900, 0.09, { type: 'triangle', vol: 0.12, to: 850 }); tone(1760, 0.6, { type: 'sine', vol: 0.06, to: 1750, at: 0.08 }); },
  kazoo: () => notes([[523, 0.12], [659, 0.12], [784, 0.12], [1046, 0.35]], { type: 'sawtooth', vol: 0.05, vib: 12 }),
  trombone: () => notes([[392, 0.35], [370, 0.35], [349, 0.35], [330, 0.9]], { type: 'sawtooth', vol: 0.06, vib: 8 }),
  whistle: () => tone(400, 0.5, { type: 'sine', vol: 0.06, to: 1600 }),
  chaching: () => { tone(2100, 0.06, { type: 'triangle', vol: 0.08, to: 2100 }); tone(2800, 0.4, { type: 'triangle', vol: 0.08, to: 2800, at: 0.06 }); noise(0.15, { vol: 0.05, type: 'highpass', f: 6000, at: 0.06 }); },
  nope: () => tone(150, 0.2, { vol: 0.04, to: 140 }),
  jump: () => tone(250, 0.14, { type: 'sine', vol: 0.03, to: 650 }),
};
const fireSfx = [SFX.squirt, SFX.fizz, SFX.whip, SFX.lob, SFX.lob, SFX.snipe, SFX.spray];

// ---------- Local player ----------
const me = { x: 0, y: 0, z: 0, vy: 0, onGround: true };
let myId = 0, myName = '', yaw = 0, pitch = 0, alive = true, hp = 100, tier = 0, money = 0, kills = 0, ammo = 0, blindLeft = 0;
let owned = S.WEAPONS.map((_, i) => i === 0 ? 1 : 0);
let weapon = 0, firing = false, zoom = false, lastFire = 0, lastBomb = 0, kick = 0, lastSend = 0, inShop = false;
const SLOTS = S.FLASH;   // weapon slots 1..6; the cream bomb is thrown with G
const keys = {};
const fwd = new THREE.Vector3();

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyB') toggleShop();
  if (/^Digit[1-9]$/.test(e.code)) setWeapon(+e.code.slice(5) - 1);
  if (e.code === 'KeyQ') { let w = weapon; do w = (w + 1) % SLOTS; while (!owned[w]); setWeapon(w); }
  if (e.code === 'KeyG') throwBomb();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') zoom = true;
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code.startsWith('Shift')) zoom = false; });
addEventListener('mousedown', (e) => { if (!document.pointerLockElement) return; if (e.button === 0) firing = true; if (e.button === 2) zoom = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; if (e.button === 2) zoom = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  const sens = 0.0022 * (camera.fov / 75);
  yaw -= e.movementX * sens;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * sens));
});
const lock = () => { renderer.domElement.requestPointerLock(); audio(); };
$('playBtn').onclick = lock;
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (!locked) firing = zoom = false;
  $('start').classList.toggle('hidden', locked || inShop);
});

function setWeapon(w) {
  if (w >= SLOTS) return;
  if (!owned[w]) { popup(`🔒 Buy the ${S.WEAPONS[w].name} in the shop [B]`); SFX.nope(); return; }
  weapon = w;
  views.forEach((v, i) => v.visible = i === w);
  renderWeapons();
}
function renderWeapons() {
  const F = S.WEAPONS[S.FLASH];
  $('weapons').innerHTML = S.WEAPONS.slice(0, SLOTS).map((W, i) =>
    `<div class="${i === weapon ? 'on' : ''} ${owned[i] ? '' : 'lock'}">${i + 1} ${W.icon}</div>`).join('') +
    `<div class="${ammo ? '' : 'lock'}">G ${F.icon}×${ammo}</div>`;
  $('weaponName').textContent = S.WEAPONS[weapon].name;
}
function throwBomb() {
  const now = performance.now();
  if (!alive || inShop || now - lastBomb < S.WEAPONS[S.FLASH].cd * 1000) return;
  if (!ammo) { popup('🍦 Out of cream bombs! Buy more [B]'); SFX.nope(); return; }
  lastBomb = now;
  camera.getWorldDirection(fwd);
  socket.emit('fire', { w: S.FLASH, d: fwd.toArray() });
  SFX.spray();
}

// ---------- Shop ----------
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const swatches = (o) => [o.shirt, o.pants, o.hat].map(c => `<span class="sw" style="background:${hex(c)}"></span>`).join('');
function renderShop() {
  $('shopMoney').textContent = `— $${money}`;
  const btn = (attr, ok, label) => `<button ${attr} ${ok ? '' : 'disabled'}>${label}</button>`;
  $('shopFood').innerHTML = S.WEAPONS.map((W, i) => {
    const right = W.pack ? btn(`data-w="${i}"`, money >= W.cost && ammo < W.maxAmmo, ammo >= W.maxAmmo ? 'Full' : `+${W.pack} for $${W.cost}`)
      : owned[i] ? '<b>OWNED</b>' : btn(`data-w="${i}"`, money >= W.cost, `Buy $${W.cost}`);
    return `<div class="item ${owned[i] ? 'cur' : ''}"><span class="ico">${W.icon}</span>
      <span class="nm"><b>${W.name}</b><br><small>${W.desc}${W.pack ? ` · have ${ammo}/${W.maxAmmo} · throw with G` : ''}</small></span>${right}</div>`;
  }).join('');
  $('shopList').innerHTML = S.OUTFITS.map((o, i) => `
    <div class="item ${i === tier ? 'cur' : ''}">${swatches(o)}
      <span class="nm"><b>${o.name}</b><br><small>Stain resistance ${Math.round(o.res * 100)}% · $${o.cost}</small></span>
      ${i === tier ? '<b>WEARING</b>' : i < tier ? '<b>✓</b>' : btn(`data-o="${i}"`, i === tier + 1 && money >= o.cost, i === tier + 1 ? 'Buy $' + o.cost : '🔒 $' + o.cost)}
    </div>`).join('');
}
$('shopBody').onclick = (e) => {
  const { o, w } = e.target.dataset;
  if (o) socket.emit('buy', +o); else if (w) socket.emit('buyw', +w); else return;
  SFX.chaching();
};
function toggleShop() {
  inShop = !inShop;
  $('shop').classList.toggle('hidden', !inShop);
  if (inShop) { renderShop(); document.exitPointerLock(); } else lock();
}
$('shopClose').onclick = toggleShop;

// ---------- HUD ----------
function updateHud() {
  $('hpBar').style.width = Math.max(0, hp) + '%';
  $('hpText').textContent = `Cleanliness ${Math.max(0, Math.ceil(hp))}%`;
  $('money').textContent = '$' + money;
  $('kills').textContent = kills + ' stains';
  const o = S.OUTFITS[tier];
  $('outfit').innerHTML = `${swatches(o)} ${o.name} (${Math.round(o.res * 100)}% resist)`;
}
let popTimer;
function popup(text) {
  $('popup').textContent = text; $('popup').style.opacity = 1;
  clearTimeout(popTimer); popTimer = setTimeout(() => $('popup').style.opacity = 0, 1500);
}
function flash(color) {
  const f = $('flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = 0.45;
  requestAnimationFrame(() => { f.style.transition = 'opacity 0.4s'; f.style.opacity = 0; });
}

// ---------- Network ----------
socket.on('welcome', (m) => { myId = m.id; myName = m.name; Object.assign(me, m.spawn); $('myName').textContent = m.name; });
socket.on('me', (m) => {
  const got = m.owned.findIndex((o, i) => o && !owned[i]);   // just bought a weapon? equip it
  money = m.money; tier = m.tier; kills = m.kills; ammo = m.ammo; owned = m.owned;
  if (got >= 0 && got < SLOTS) setWeapon(got); else if (!owned[weapon]) setWeapon(0); else renderWeapons();
  updateHud(); if (inShop) renderShop();
});
socket.on('setpos', (p) => Object.assign(me, p, { vy: 0 }));   // server rejected our move (lag or cheating)
socket.on('full', () => alert('Stain Wars is full right now. Try again in a bit!'));
socket.on('respawn', (p) => { Object.assign(me, p, { vy: 0 }); alive = true; hp = 100; blindLeft = 0; $('dead').classList.add('hidden'); updateHud(); SFX.whistle(); });
socket.on('blind', (secs) => { blindLeft = Math.max(blindLeft, Math.min(5, +secs || 0)); SFX.poof(); });
socket.on('snap', (list) => {
  const seen = new Set();
  for (const [id, x, y, z, ry, t, h, dead] of list) {
    seen.add(id);
    if (id === myId) { if (!dead) hp = h; continue; }
    let a = avatars.get(id);
    if (!a) { a = makeAvatar(); a.g.position.set(x, y, z); avatars.set(id, a); }
    a.target.set(x, y, z); a.ry = ry; a.g.visible = !dead;
    const nm = names.get(id) || '';
    if (a.tier !== t) { a.tier = t; setOutfit(a, t); a.hp = -1; }
    if (a.hp !== h || a.name !== nm) { a.hp = h; a.name = nm; drawTag(a); }
  }
  for (const [id, a] of avatars) if (!seen.has(id)) { scene.remove(a.g); avatars.delete(id); }
  updateHud();
});
socket.on('board', (list) => {
  for (const [id, n] of list) names.set(id, n);
  list.sort((a, b) => b[3] - a[3] || b[2] - a[2]);
  $('boardList').innerHTML = list.slice(0, 10).map(([id, n, t, k, m]) =>
    `<li class="${id === myId ? 'me' : ''}">${swatches(S.OUTFITS[t]).split('</span>')[0]}</span> ${n} — ${k} 🎯 $${m}</li>`).join('');
});
let lastRemoteSfx = 0;
socket.on('shot', (s) => {
  const m = projMesh(s.w);
  m.position.fromArray(s.o);
  const v = new THREE.Vector3().fromArray(s.v);
  m.lookAt(m.position.clone().add(v));
  scene.add(m); shots.set(s.id, { m, v, w: s.w, t: 0 });
  // Other people's shots get quieter with distance. Throttled so bot spam doesn't deafen anyone.
  const d = camera.position.distanceTo(m.position), now = performance.now();
  if (d > 2.5 && d < 45 && now - lastRemoteSfx > 40) { lastRemoteSfx = now; fireSfx[s.w](0.6 * (1 - d / 45)); }
});
socket.on('pop', (p) => {
  const s = shots.get(p.id);
  if (s) { scene.remove(s.m); shots.delete(p.id); }
  splat(p.p, p.w);
  const W = S.WEAPONS[p.w], v = 1 - Math.hypot(p.p[0] - me.x, p.p[1] - me.y, p.p[2] - me.z) / 40;
  if (v > 0 && ((p.w !== 0 && !W.pellets) || Math.random() < 0.25)) W.blind ? SFX.poof(v) : SFX.splat(v, !!W.splash);
});
// Shotgun pellets arrive together; only make one noise per burst.
let lastOuch = 0, lastHit = 0;
socket.on('ouch', (m) => {
  hp = m.hp; flash(hex(S.WEAPONS[m.w].color)); updateHud();
  if (m.head) SFX.bonk(); else if (performance.now() - lastOuch > 80) { lastOuch = performance.now(); SFX.oof(); }
});
socket.on('hitmark', (m) => {
  const h = $('hitmark'); h.style.opacity = 1; setTimeout(() => h.style.opacity = 0, 120);
  if (m && m.head) { SFX.bonk(); popup('🎯 BONK! HEADSHOT!'); }
  else if (performance.now() - lastHit > 80) { lastHit = performance.now(); SFX.hit(); }
});
socket.on('kill', (k) => {
  const div = document.createElement('div');
  div.textContent = `${k.k} ${S.WEAPONS[k.w].icon}${k.head ? '🎯' : ''} ${k.v}`;
  $('killfeed').prepend(div); setTimeout(() => div.remove(), 5000);
  if (k.k === myName && k.v !== myName) { popup(`🎉 You stained ${k.v}!`); SFX.kazoo(); }
  if (k.v === myName) {
    alive = false; firing = false; SFX.trombone();
    $('deadMsg').textContent = `${k.k} got you with the ${S.WEAPONS[k.w].name}${k.head ? ' (HEADSHOT!)' : ''}! Your outfit and food are safe. Respawning...`;
    $('dead').classList.remove('hidden');
  }
});

// ---------- Loop ----------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime, now = performance.now();

  if (alive && !inShop) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    let dx = -Math.sin(yaw) * f + Math.cos(yaw) * r, dz = -Math.cos(yaw) * f - Math.sin(yaw) * r;
    const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
    const wasGround = me.onGround;
    S.move(me, dx, dz, keys.Space, dt);
    if (wasGround && me.vy > 0) SFX.jump();
    if (l > 0 && me.onGround) kick += dt * 10;
  }
  camera.position.set(me.x, me.y + 1.6, me.z);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  if (now - lastSend > 50) { lastSend = now; socket.emit('pos', [me.x, me.y, me.z, yaw].map(n => Math.round(n * 100) / 100)); }

  // shooting
  const W = S.WEAPONS[weapon];
  if (firing && alive && now - lastFire > W.cd * 1000) {
    lastFire = now;
    camera.getWorldDirection(fwd);
    socket.emit('fire', { w: weapon, d: fwd.toArray() });
    views[weapon].position.z = -0.75;
    if (weapon === 2) views[2].rotation.x = -1.2;   // whip lash
    fireSfx[weapon]();
  }
  const v = views[weapon];
  v.position.z += (-0.9 - v.position.z) * 0.2;
  v.position.y = -0.32 + Math.sin(kick) * 0.02;
  v.rotation.x += (v.userData.rx - v.rotation.x) * 0.15;

  // hotdog scope
  const scoped = zoom && W.scope && alive;
  camera.fov += ((scoped ? 18 : 75) - camera.fov) * 0.25;
  camera.updateProjectionMatrix();
  $('scope').classList.toggle('on', scoped && camera.fov < 30);
  v.visible = !(scoped && camera.fov < 30);
  $('crosshair').style.opacity = scoped ? 0 : 1;

  // others: smooth + derpy animation
  for (const a of avatars.values()) {
    const moving = a.g.position.distanceToSquared(a.target) > 0.001;
    a.g.position.lerp(a.target, 0.25);
    a.g.rotation.y = a.ry;
    const sw = moving ? Math.sin(t * 12 + a.phase) * 0.8 : 0;
    a.armL.rotation.x = sw; a.armR.rotation.x = -sw;
    a.pupils.forEach((p, i) => { p.position.x = a.eyes[i].position.x + Math.sin(t * 7 + a.phase + i * 2) * 0.05; });
    const o = S.OUTFITS[a.tier];
    if (o && o.rainbow) {
      const h = (t * o.rainbow * 0.3 + a.phase) % 1;
      a.shirt.color.setHSL(h, 1, 0.55); a.pants.color.setHSL((h + 0.33) % 1, 1, 0.5); a.hat.color.setHSL((h + 0.66) % 1, 1, 0.5);
      a.shirt.emissive.copy(a.shirt.color).multiplyScalar(o.glow * (0.6 + 0.4 * Math.sin(t * 6)));
    }
  }
  // projectiles (visual only; server decides hits)
  for (const [id, s] of shots) {
    s.v.y -= S.WEAPONS[s.w].grav * dt;
    s.m.position.addScaledVector(s.v, dt);
    if (s.w === 3 || s.w === 4 || s.w === 6) s.m.rotation.x += dt * 10;
    if ((s.t += dt) > S.WEAPONS[s.w].life + 0.5) { scene.remove(s.m); shots.delete(id); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.v.y -= 20 * dt; p.m.position.addScaledVector(p.v, dt);
    if ((p.t -= dt) <= 0) { scene.remove(p.m); parts.splice(i, 1); }
  }
  // whipped cream blindness: solid white, fading out over the last second
  blindLeft = Math.max(0, blindLeft - dt);
  $('cream').style.opacity = Math.min(1, blindLeft);
  renderer.render(scene, camera);
}
setWeapon(0);
updateHud();
loop();
