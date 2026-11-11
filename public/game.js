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
scene.fog = new THREE.Fog(0x87e0ff, 90, 280);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 450);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a890, 1.4));   // neutral from below, or indoor ceilings turn green
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(20, 40, 10); scene.add(sun);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const mat = (color, extra) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), mat(0x7ed957));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);
const arena = new THREE.Mesh(new THREE.PlaneGeometry(S.ARENA * 2, S.ARENA * 2, 20, 20), mat(0x9be564, { wireframe: false }));
arena.rotation.x = -Math.PI / 2; scene.add(arena);
// All the map's boxes go into one mesh (one draw call), so school laptops don't pay for thousands of separate objects.
// Undersides are darker so ceilings read as ceilings, since there are no real shadows.
// Each building also gets a thin ground floor. It's only for looks (you'd stand at 0 anyway), so it isn't in S.BOXES.
(function buildWorld() {
  const floors = S.BUILDINGS.map(B => ({ x: B.x, z: B.z, w: B.w, d: B.d, y: -0.1, top: 0.015, color: 0xeee3cf }));
  const all = [...S.BOXES, ...floors];
  const t = new THREE.BoxGeometry(1, 1, 1), tp = t.attributes.position, tn = t.attributes.normal, ti = t.index, n = all.length;
  const pos = new Float32Array(n * tp.count * 3), nor = new Float32Array(n * tp.count * 3), col = new Float32Array(n * tp.count * 3), idx = new Uint32Array(n * ti.count);
  const c = new THREE.Color();
  all.forEach((b, i) => {
    const h = b.top - b.y, base = i * tp.count;
    c.setHex(b.color);
    for (let v = 0; v < tp.count; v++) {
      const k = (base + v) * 3, ny = tn.getY(v), shade = ny < 0 ? 0.8 : ny > 0 ? 1 : 0.88;
      pos[k] = b.x + tp.getX(v) * b.w; pos[k + 1] = b.y + h / 2 + tp.getY(v) * h; pos[k + 2] = b.z + tp.getZ(v) * b.d;
      nor[k] = tn.getX(v); nor[k + 1] = ny; nor[k + 2] = tn.getZ(v);
      col[k] = c.r * shade; col[k + 1] = c.g * shade; col[k + 2] = c.b * shade;
    }
    for (let v = 0; v < ti.count; v++) idx[i * ti.count + v] = base + ti.getX(v);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
})();
// A painted sign over each building's front door.
for (const B of S.BUILDINGS) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff6d8'; c.fillRect(0, 0, 512, 96);
  c.fillStyle = '#7b2ff7'; c.font = 'bold 60px Comic Sans MS, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(B.name, 256, 50, 490);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
  sign.position.set(B.doorX, 3.15, B.doorZ + 0.03); scene.add(sign);
}
// fence + silly scenery
for (let i = 0; i < 4; i++) {
  const w = new THREE.Mesh(new THREE.BoxGeometry(S.ARENA * 2, 1, 0.4), mat([0xff4fa3, 0xffe600, 0x4d96ff, 0x7b2ff7][i]));
  w.position.set(i < 2 ? 0 : (i === 2 ? 1 : -1) * S.ARENA, 0.5, i < 2 ? (i === 0 ? 1 : -1) * S.ARENA : 0);
  if (i >= 2) w.rotation.y = Math.PI / 2;
  scene.add(w);
}
// Trees stay outside the square fence. (A ring around the center put corner trees inside the lookouts.)
for (let i = 0; i < 40; i++) {
  const along = (Math.random() * 2 - 1) * (S.ARENA + 40), out = (S.ARENA + 8 + Math.random() * 32) * (Math.random() < 0.5 ? -1 : 1);
  const [x, z] = Math.random() < 0.5 ? [along, out] : [out, along];
  const tree = new THREE.Mesh(new THREE.ConeGeometry(2 + Math.random() * 2, 6 + Math.random() * 6, 5), mat(new THREE.Color().setHSL(Math.random(), 0.8, 0.55)));
  tree.position.set(x, 4, z); scene.add(tree);
}

// ---------- Avatars ----------
const G = {
  leg: new THREE.BoxGeometry(0.25, 0.8, 0.3), body: new THREE.CylinderGeometry(0.42, 0.5, 0.8, 6),
  arm: new THREE.BoxGeometry(0.18, 0.6, 0.18), head: new THREE.IcosahedronGeometry(0.38, 0),
  eye: new THREE.SphereGeometry(0.13, 8, 6), pupil: new THREE.SphereGeometry(0.06, 6, 4), hat: new THREE.ConeGeometry(0.3, 0.55, 5),
  blob: new THREE.IcosahedronGeometry(1, 1), cone: new THREE.ConeGeometry(1, 1, 5), cube: new THREE.BoxGeometry(1, 1, 1),
};
const skin = mat(0xffcc99), white = mat(0xffffff), black = mat(0x000000);
// The Cafeteria Tray. Faces forward (-z) and is the same model for avatars and your own view.
const trayMat = (c) => mat(c, { emissive: new THREE.Color(c).multiplyScalar(0.35) });
const trayMats = { tray: trayMat(0x45d6c6), rim: trayMat(0x2a9d90), a: trayMat(0xffd400), b: trayMat(0xe0001b) };
function makeTray(s) {
  const g = new THREE.Group(), add = (m, x, y, sx, sy, sz, z = 0) => { const o = new THREE.Mesh(G.cube, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); g.add(o); };
  add(trayMats.rim, 0, 0, 0.8, 0.58, 0.04);
  add(trayMats.tray, 0, 0, 0.72, 0.5, 0.05, -0.01);
  for (const z of [-0.04, 0.04]) {   // old lunch stains, on both sides
    add(trayMats.a, -0.18, 0.08, 0.2, 0.2, 0.02, z);
    add(trayMats.b, 0.2, -0.1, 0.14, 0.14, 0.02, z);
  }
  g.scale.setScalar(s);
  return g;
}

// Team owls. Same height as a person at size 1 (faces -z). Different silhouettes as well as colors, so teams are
// easy to tell apart at a distance: a round golden barn owl with a white heart face vs. a dark purple great horned
// owl with ear tufts and big orange eyes. Materials are shared per team, so they cost almost nothing per player.
const owlMats = S.TEAMS.map(T => ({ body: mat(T.body), belly: mat(T.belly), face: mat(T.face, { emissive: 0x777777 }), beak: mat(T.beak), eye: mat(T.eye), feet: mat(0xff9a1f) }));
function makeOwl(team) {
  const g = new THREE.Group(), m = owlMats[team - 1], barn = team === 1;
  const add = (geo, mt, x, y, z, sx = 1, sy = sx, sz = sx, parent = g) => {
    const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); o.scale.set(sx, sy, sz); parent.add(o); return o;
  };
  add(G.blob, m.body, 0, 0.95, 0, 0.62, 0.85, 0.55);
  add(G.blob, m.belly, 0, 0.9, -0.28, 0.46, 0.62, 0.34);
  add(G.blob, m.body, 0, 1.75, 0, barn ? 0.52 : 0.46, barn ? 0.46 : 0.42, 0.44);
  for (const x of [-0.22, 0.22]) add(G.blob, m.feet, x, 0.08, -0.15, 0.16, 0.08, 0.24);
  add(G.cone, m.body, 0, 0.35, 0.5, 0.26, 0.7, 0.12).rotation.x = 0.5;   // tail
  const wings = [-1, 1].map(side => {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.55, 1.4, 0); g.add(pivot);
    add(G.blob, m.body, side * 0.08, -0.45, 0, 0.15, 0.55, 0.38, pivot);
    return pivot;
  });
  let eyes;
  if (barn) {
    for (const x of [-0.2, 0.2]) add(G.blob, m.face, x, 1.84, -0.34, 0.27, 0.27, 0.1);   // heart-shaped face: two lobes...
    add(G.cone, m.face, 0, 1.56, -0.4, 0.42, 0.42, 0.07).rotation.x = Math.PI;              // ...and a point at the chin
    add(G.cone, m.beak, 0, 1.68, -0.5, 0.05, 0.14, 0.05).rotation.x = Math.PI;
    eyes = [add(G.eye, m.eye, -0.18, 1.84, -0.42, 0.65), add(G.eye, m.eye, 0.19, 1.86, -0.42, 0.8)];   // small, dark, derpy
  } else {
    for (const x of [-1, 1]) add(G.cone, m.body, x * 0.3, 2.2, 0, 0.14, 0.6, 0.14).rotation.z = -x * 0.3;   // ear tufts
    add(G.blob, m.face, 0, 1.42, -0.38, 0.3, 0.13, 0.1);   // white throat
    for (const y of [0.65, 0.85, 1.05]) add(G.cube, m.body, 0, y, -0.58, 0.5, 0.05, 0.12);   // barred chest
    add(G.cone, m.beak, 0, 1.64, -0.45, 0.07, 0.16, 0.07).rotation.x = Math.PI;
    for (const x of [-1, 1]) add(G.cube, m.beak, x * 0.19, 2.01, -0.38, 0.3, 0.05, 0.05).rotation.z = x * 0.3;   // angry brows
    eyes = [add(G.eye, m.eye, -0.19, 1.8, -0.36, 1.3), add(G.eye, m.eye, 0.2, 1.83, -0.36, 1.6)];
  }
  // A white glint on the barn owl's dark eyes, a black pupil on the horned owl's orange ones. Both wobble.
  const pupils = eyes.map(e => add(G.pupil, barn ? white : black, e.position.x, e.position.y, e.position.z - e.scale.z * 0.12));
  return { g, wings, eyes, pupils };
}

function makeAvatar() {
  const g = new THREE.Group(), human = new THREE.Group();
  g.add(human);
  const shirt = mat(0xffffff), pants = mat(0xffffff), hat = mat(0xffffff);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); human.add(o); return o; };
  add(G.leg, pants, -0.15, 0.4, 0); add(G.leg, pants, 0.15, 0.4, 0);
  add(G.body, shirt, 0, 1.2, 0);
  const armL = add(G.arm, shirt, -0.55, 1.25, 0), armR = add(G.arm, shirt, 0.55, 1.25, 0);
  add(G.head, skin, 0, 1.85, 0);
  const eyeL = add(G.eye, white, -0.15, 1.92, -0.3), eyeR = add(G.eye, white, 0.17, 1.95, -0.3);
  eyeR.scale.setScalar(1.3); // derp
  const pupils = [add(G.pupil, black, -0.15, 1.92, -0.42), add(G.pupil, black, 0.17, 1.95, -0.45)];
  const h = add(G.hat, hat, 0.05, 2.35, 0); h.rotation.z = 0.25;
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));   // depth tested: walls hide name tags
  tag.scale.set(2.4, 0.6, 1); tag.position.y = 2.95; g.add(tag);
  const tray = makeTray(1); tray.position.set(-0.32, 1.25, -0.62); tray.rotation.y = 0.25; tray.visible = false; g.add(tray);
  scene.add(g);
  return { g, human, tray, shirt, pants, hat, armL, armR, pupils, eyes: [eyeL, eyeR], canvas, tag, tier: -1, hp: -1, name: '',
    team: 0, owl: null, owls: {}, size: 1, sizeTarget: 1, target: new THREE.Vector3(), ry: 0, phase: Math.random() * 10 };
}

function setForm(a, team) {
  a.team = team;
  a.human.visible = !team;
  if (team && !a.owls[team]) { a.owls[team] = makeOwl(team); a.g.add(a.owls[team].g); }
  for (const t in a.owls) a.owls[t].g.visible = +t === team;
  a.owl = team ? a.owls[team] : null;
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
  c.lineWidth = 5; c.strokeStyle = '#000'; c.fillStyle = a.team ? S.TEAMS[a.team - 1].css : '#' + S.OUTFITS[a.tier].shirt.toString(16).padStart(6, '0');
  c.strokeText(a.name, 128, 28); c.fillText(a.name, 128, 28);
  c.fillStyle = '#000'; c.fillRect(48, 40, 160, 14);
  c.fillStyle = a.hp > 50 ? '#3f3' : a.hp > 25 ? '#fd0' : '#f33'; c.fillRect(50, 42, 156 * Math.max(0, a.hp) / 100, 10);
  a.tag.material.map.needsUpdate = true;
}

const avatars = new Map();
const info = new Map();   // id -> { name, team, scale }, from the 1Hz board

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
const trayView = makeTray(0.42); trayView.position.set(-0.5, -0.27, -0.85); trayView.rotation.set(-0.1, 0.25, 0.08); trayView.visible = false; camera.add(trayView);

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
  const floor = S.floorBelow(p[0], p[1] + 0.2, p[2]);
  if (p[1] - floor < 0.3 || Math.random() < 0.3) {
    const d = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: cols[Math.floor(Math.random() * cols.length)] }));
    d.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
    d.scale.setScalar(big ? 2.5 : 0.4 + Math.random() * 0.5);
    d.position.set(p[0], floor + 0.02 + Math.random() * 0.01, p[2]);
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
  jump2: () => tone(450, 0.16, { type: 'sine', vol: 0.05, to: 1300 }),
  clang: () => { tone(700, 0.1, { type: 'square', vol: 0.05, to: 640 }); tone(1500, 0.18, { type: 'triangle', vol: 0.05, to: 1450 }); },
  crash: () => { noise(0.4, { vol: 0.14, type: 'highpass', f: 2500, to: 6000 }); tone(500, 0.3, { type: 'square', vol: 0.06, to: 90 }); },
  levelUp: () => notes([[523, 0.09], [784, 0.09], [1046, 0.2]], { type: 'triangle', vol: 0.09 }),
  hoot: () => notes([[330, 0.25], [294, 0.5], [330, 0.2], [294, 0.6]], { type: 'sine', vol: 0.14, vib: 6 }),
};
const fireSfx = [SFX.squirt, SFX.fizz, SFX.whip, SFX.lob, SFX.lob, SFX.snipe, SFX.spray];

// ---------- Local player ----------
const me = { x: 0, y: 0, z: 0, vy: 0, onGround: true };
let myId = 0, myName = '', yaw = 0, pitch = 0, alive = true, hp = 100, tier = 0, money = 0, earned = 0, ammo = 0, blindLeft = 0;
let phase = 'free', phaseLeft = 0, teamNext = true, scores = [0, 0], myTeam = 0, myScale = 1, eyeScale = 1;
let owned = S.WEAPONS.map((_, i) => i === 0 ? 1 : 0);
let wstains = S.WEAPONS.map(() => 0), dmgLv = S.WEAPONS.map(() => 0), hasTray = false, trayHp = 0, trayBackAt = 0, viewY = 0;
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
  if (w !== weapon) socket.emit('equip', w);   // the server needs to know: the tray only works with one-handed food
  weapon = w;
  views.forEach((v, i) => v.visible = i === w);
  renderWeapons();
}
function renderWeapons() {
  const F = S.WEAPONS[S.FLASH];
  $('weapons').innerHTML = S.WEAPONS.slice(0, SLOTS).map((W, i) =>
    `<div class="${i === weapon ? 'on' : ''} ${owned[i] ? '' : 'lock'}">${i + 1} ${W.icon}${dmgLv[i] ? '⭐' + dmgLv[i] : ''}</div>`).join('') +
    `<div class="${ammo ? '' : 'lock'}">G ${F.icon}×${ammo}</div>`;
  $('weaponName').textContent = S.WEAPONS[weapon].name + (dmgLv[weapon] ? ` (+${Math.round(dmgLv[weapon] * S.DMG_STEP * 100)}% damage)` : '');
}
function throwBomb() {
  const now = performance.now();
  if (!alive || inShop || phase === 'ended' || now - lastBomb < S.WEAPONS[S.FLASH].cd * 1000) return;
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
  const pct = (n) => Math.round(n * S.DMG_STEP * 100);
  // Stains with a weapon raise its level; each level unlocks one damage upgrade to buy.
  const levelLine = (W, i) => {
    if (W.pack || !owned[i]) return '';
    if (W.noUpgrade) return '<br><small class="lv">⭐ No damage levels: its 2-shot rule never changes</small>';
    const lv = S.weaponLevel(wstains[i]), next = S.LEVEL_STAINS[lv];
    return `<br><small class="lv">⭐ Level ${lv}/${S.LEVEL_STAINS.length} · ${wstains[i]} stains${next ? ` (next level at ${next})` : ''} · damage +${pct(dmgLv[i])}%</small>`;
  };
  const upgradeBtn = (W, i) => {
    if (!owned[i] || !S.canUpgrade(W) || dmgLv[i] >= S.LEVEL_STAINS.length) return '';
    const cost = S.upgradeCost(dmgLv[i]), unlocked = dmgLv[i] < S.weaponLevel(wstains[i]);
    return btn(`data-u="${i}"`, unlocked && money >= cost, `${unlocked ? '' : '🔒 '}+${pct(1)}% dmg $${cost}`);
  };
  $('shopFood').innerHTML = S.WEAPONS.map((W, i) => {
    const right = W.pack ? btn(`data-w="${i}"`, money >= W.cost && ammo < W.maxAmmo, ammo >= W.maxAmmo ? 'Full' : `+${W.pack} for $${W.cost}`)
      : owned[i] ? upgradeBtn(W, i) || '<b>OWNED</b>' : btn(`data-w="${i}"`, money >= W.cost, `Buy $${W.cost}`);
    return `<div class="item ${owned[i] ? 'cur' : ''}"><span class="ico">${W.icon}</span>
      <span class="nm"><b>${W.name}</b><br><small>${W.desc}${W.pack ? ` · have ${ammo}/${W.maxAmmo} · throw with G` : ''}</small>${levelLine(W, i)}</span>${right}</div>`;
  }).join('');
  $('shopGear').innerHTML = `<div class="item ${hasTray ? 'cur' : ''}"><span class="ico">${S.TRAY.icon}</span>
    <span class="nm"><b>${S.TRAY.name}</b><br><small>${S.TRAY.desc}</small></span>
    ${hasTray ? '<b>OWNED</b>' : btn('data-t="1"', money >= S.TRAY.cost, `Buy $${S.TRAY.cost}`)}</div>`;
  $('shopList').innerHTML = S.OUTFITS.map((o, i) => `
    <div class="item ${i === tier ? 'cur' : ''}">${swatches(o)}
      <span class="nm"><b>${o.name}</b><br><small>Stain resistance ${Math.round(o.res * 100)}% · $${o.cost}</small></span>
      ${i === tier ? '<b>WEARING</b>' : i < tier ? '<b>✓</b>' : btn(`data-o="${i}"`, i === tier + 1 && money >= o.cost, i === tier + 1 ? 'Buy $' + o.cost : '🔒 $' + o.cost)}
    </div>`).join('');
}
$('shopBody').onclick = (e) => {
  const { o, w, u, t } = e.target.dataset;
  if (o) socket.emit('buy', +o); else if (w) socket.emit('buyw', +w); else if (u) socket.emit('buyup', +u); else if (t) socket.emit('buytray'); else return;
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
  $('kills').textContent = earned + ' stains';
  const o = S.OUTFITS[tier];
  $('outfit').innerHTML = `${swatches(o)} ${o.name} (${Math.round(o.res * 100)}% resist)`;
  $('tray').classList.toggle('hidden', !hasTray);
  if (hasTray) {
    $('tray').textContent = trayHp <= 0 ? `${S.TRAY.icon} Tray back in ${Math.ceil(Math.max(0, trayBackAt - performance.now()) / 1000)}s`
      : S.WEAPONS[weapon].twoHanded ? `${S.TRAY.icon} Tray put away (two-handed food)` : `${S.TRAY.icon} Tray ${trayHp}/${S.TRAY.hp}`;
  }
  $('owlInfo').classList.toggle('hidden', !myTeam);
  if (myTeam) {
    const T = S.TEAMS[myTeam - 1];
    $('owlInfo').textContent = `🦉 You are a ${T.owl} (size ${myScale.toFixed(1)}×)`;
    $('owlInfo').style.color = T.css;
  }
}
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function updateClock() {
  phaseLeft = Math.max(0, phaseLeft - 250);
  const label = { free: 'Free play', ffa: (teamNext ? '🦉 Owl Showdown in ' : '⏱️ Game ends in ') + mmss(phaseLeft), team: '🦉 Owl Showdown: ' + mmss(phaseLeft), ended: '🏁 Game over' };
  $('clockText').textContent = label[phase];
}
setInterval(updateClock, 250);

function renderTeams(list) {
  S.TEAMS.forEach((T, i) => {
    const rows = list.filter(r => r[6] === i + 1).sort((a, b) => b[8] - a[8] || b[3] - a[3]);
    const shown = rows.slice(0, 8), mine = rows.find(r => r[0] === myId);
    if (mine && !shown.includes(mine)) shown[shown.length - 1] = mine;   // always show yourself
    $(`team${i + 1}Head`).innerHTML = `<span>🦉 ${T.name}</span><span>${scores[i]}</span>`;
    $(`team${i + 1}Head`).style.color = T.css;
    $(`team${i + 1}List`).innerHTML = shown.map(r => `<li class="${r[0] === myId ? 'me' : ''}">${r[1]} — ${r[8]} pts</li>`).join('');
  });
  const a = S.TEAMS[0], b = S.TEAMS[1];
  $('teamScore').innerHTML = `<span style="color:${a.css}">${scores[0]}</span> : <span style="color:${b.css}">${scores[1]}</span>`;
}

function renderResults(r) {
  const line = (label, entry) => entry ? `<p>${label}: <b>${entry[0]}</b> (${entry[1]})</p>` : '';
  if (r.winner === null) $('resultsHead').textContent = '🏁 Time!';
  else $('resultsHead').textContent = r.winner < 0 ? '🤝 It\'s a tie!' : `🏆 ${S.TEAMS[r.winner].name} win!`;
  $('resultsBody').innerHTML = (r.winner === null ? '' :
    S.TEAMS.map((T, i) => `<p style="font-size:24px"><b style="color:${T.css}">${T.name}: ${r.scores[i]}</b></p>`).join('') +
    S.TEAMS.map((T, i) => line(`${T.owl} MVP (points)`, r.mvp[i])).join('')) +
    r.top.map((e, i) => line(['🥇 Most stains', '🥈 2nd', '🥉 3rd'][i], e)).join('');
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
  const levelled = m.wstains.findIndex((n, i) => S.weaponLevel(n) > S.weaponLevel(wstains[i]));
  if (levelled >= 0 && S.canUpgrade(S.WEAPONS[levelled])) {
    popup(`⭐ ${S.WEAPONS[levelled].name} level ${S.weaponLevel(m.wstains[levelled])}! Upgrade it in the shop [B]`);
    SFX.levelUp();
  }
  money = m.money; earned = m.earned; tier = m.tier; ammo = m.ammo; owned = m.owned;
  wstains = m.wstains; dmgLv = m.dmgLv; hasTray = !!m.tray; trayHp = m.trayHp; trayBackAt = performance.now() + m.trayIn;
  if (got >= 0 && got < SLOTS) setWeapon(got); else if (!owned[weapon]) setWeapon(0); else renderWeapons();
  updateHud(); if (inShop) renderShop();
});
socket.on('setpos', (p) => Object.assign(me, p, { vy: 0 }));   // server rejected our move (lag or cheating)
socket.on('full', () => alert('Stain Wars is full right now. Try again in a bit!'));
socket.on('respawn', (p) => { Object.assign(me, p, { vy: 0 }); alive = true; hp = 100; blindLeft = 0; $('dead').classList.add('hidden'); updateHud(); SFX.whistle(); });
socket.on('blind', (secs) => { blindLeft = Math.max(blindLeft, Math.min(5, +secs || 0)); SFX.poof(); });
socket.on('snap', (list) => {
  const seen = new Set();
  for (const [id, x, y, z, ry, t, h, dead, tray] of list) {
    seen.add(id);
    if (id === myId) { if (!dead) hp = h; continue; }
    let a = avatars.get(id);
    if (!a) { a = makeAvatar(); a.g.position.set(x, y, z); avatars.set(id, a); }
    a.target.set(x, y, z); a.ry = ry; a.g.visible = !dead; a.tray.visible = !!tray;
    const inf = info.get(id), nm = inf ? inf.name : '', team = inf ? inf.team : 0;
    a.sizeTarget = inf ? inf.scale : 1;
    if (a.team !== team) { setForm(a, team); a.hp = -1; }
    if (a.tier !== t) { a.tier = t; setOutfit(a, t); a.hp = -1; }
    if (a.hp !== h || a.name !== nm) { a.hp = h; a.name = nm; drawTag(a); }
  }
  for (const [id, a] of avatars) if (!seen.has(id)) { scene.remove(a.g); avatars.delete(id); }
  updateHud();
});
socket.on('board', (m) => {
  const { list } = m, wasPhase = phase, wasLeft = phaseLeft;
  phase = m.phase; phaseLeft = m.left; teamNext = m.teamNext; scores = m.scores;
  info.clear();
  for (const r of list) info.set(r[0], { name: r[1], team: r[6], scale: r[7] });
  const mine = info.get(myId), wasTeam = myTeam;
  myTeam = mine ? mine.team : 0; myScale = me.scale = mine ? mine.scale : 1;   // me.scale: big owls collide bigger
  if (myTeam && myTeam !== wasTeam) { popup(`🦉 You're a ${S.TEAMS[myTeam - 1].owl}!`); SFX.hoot(); }
  else if (phase === 'ffa' && wasPhase !== 'ffa') { popup('🍔 New game! Go!'); SFX.whistle(); }
  else if (phase === 'ffa' && teamNext && wasLeft > 60000 && phaseLeft <= 60000) { popup('🦉 Owl Showdown in 1 minute!'); SFX.hoot(); }
  if (phase === 'ended' && wasPhase !== 'ended') { firing = false; SFX.kazoo(); }
  const showTeams = list.some(r => r[6]);
  $('teamBoards').classList.toggle('hidden', !showTeams);
  $('teamScore').classList.toggle('hidden', !showTeams);
  $('board').classList.toggle('hidden', showTeams);
  $('results').classList.toggle('hidden', !(phase === 'ended' && m.results));
  if (phase === 'ended' && m.results) renderResults(m.results);
  if (showTeams) renderTeams(list);
  updateClock(); updateHud();
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
socket.on('trayhit', (m) => {
  if (m.broke) { SFX.crash(); popup(`${S.TRAY.icon} Tray smashed! Back in ${S.TRAY.respawnMs / 1000}s`); } else SFX.clang();
});
socket.on('hitmark', (m) => {
  const h = $('hitmark'); h.style.color = m && m.tray ? '#7ff' : ''; h.style.opacity = 1; setTimeout(() => h.style.opacity = 0, 120);
  if (m && m.tray) { if (m.broke) { SFX.crash(); popup(`${S.TRAY.icon} You smashed their tray!`); } else if (performance.now() - lastHit > 80) { lastHit = performance.now(); SFX.clang(); } }
  else if (m && m.head) { SFX.bonk(); popup('🎯 BONK! HEADSHOT!'); }
  else if (performance.now() - lastHit > 80) { lastHit = performance.now(); SFX.hit(); }
});
socket.on('kill', (k) => {
  const div = document.createElement('div');
  const W = S.WEAPONS[k.w];   // no weapon means a fatal fall
  div.textContent = W ? `${k.k} ${W.icon}${k.head ? '🎯' : ''} ${k.v}${k.pts ? ` +${k.pts} pts` : ''}` : `🪂 ${k.v} fell too far`;
  $('killfeed').prepend(div); setTimeout(() => div.remove(), 5000);
  if (k.k === myName && k.v !== myName) { popup(k.pts ? `🎉 You stained ${k.v}! +${k.pts} pts` : `🎉 You stained ${k.v}!`); SFX.kazoo(); }
  if (k.v === myName) {
    alive = false; firing = false; SFX.trombone();
    $('deadMsg').textContent = W ? `${k.k} got you with the ${W.name}${k.head ? ' (HEADSHOT!)' : ''}! Your outfit and food are safe. Respawning...`
      : 'SPLAT! You dropped more than 5 times your height. Your outfit and food are safe. Respawning...';
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
    const wasGround = me.onGround, hadAirJump = me.usedAir;
    S.move(me, dx, dz, keys.Space, dt);
    if (wasGround && me.vy > 0) SFX.jump();
    if (me.usedAir && !hadAirJump) SFX.jump2();
    if (l > 0 && me.onGround) kick += dt * 10;
  }
  eyeScale += (myScale - eyeScale) * Math.min(1, dt * 3);   // bigger owls see from higher up (server fires from the same height)
  // Glide up and down stairs instead of snapping from step to step. Real jumps, falls and teleports stay exact.
  viewY = me.onGround && Math.abs(me.y - viewY) < 1 ? viewY + (me.y - viewY) * Math.min(1, dt * 14) : me.y;
  camera.position.set(me.x, viewY + S.eyeHeight(me.x, me.y, me.z, eyeScale), me.z);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  if (now - lastSend > 50) { lastSend = now; socket.emit('pos', [me.x, me.y, me.z, yaw].map(n => Math.round(n * 100) / 100)); }

  // shooting
  const W = S.WEAPONS[weapon];
  if (firing && alive && phase !== 'ended' && now - lastFire > W.cd * 1000) {
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
  const scoped = !!(zoom && W.scope && alive);   // must be a real boolean: classList.toggle('on', undefined) flips every frame
  camera.fov += ((scoped ? 18 : 75) - camera.fov) * 0.25;
  camera.updateProjectionMatrix();
  $('scope').classList.toggle('on', scoped && camera.fov < 30);
  v.visible = !(scoped && camera.fov < 30);
  $('crosshair').style.opacity = scoped ? 0 : 1;
  trayView.visible = hasTray && trayHp > 0 && !W.twoHanded && alive;

  // others: smooth + derpy animation
  for (const a of avatars.values()) {
    const moving = a.g.position.distanceToSquared(a.target) > 0.001;
    a.g.position.lerp(a.target, 0.25);
    a.g.rotation.y = a.ry;
    a.size += (a.sizeTarget - a.size) * Math.min(1, dt * 3);
    a.g.scale.setScalar(a.size);
    const sw = moving ? Math.sin(t * 12 + a.phase) * 0.8 : 0;
    const face = a.owl || a;
    face.pupils.forEach((p, i) => { p.position.x = face.eyes[i].position.x + Math.sin(t * 7 + a.phase + i * 2) * 0.05; });
    if (a.owl) { const flap = 0.15 + (moving ? 0.5 + Math.sin(t * 16 + a.phase) * 0.5 : 0); a.owl.wings[0].rotation.z = -flap; a.owl.wings[1].rotation.z = flap; continue; }
    a.armL.rotation.x = sw; a.armR.rotation.x = -sw;
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
