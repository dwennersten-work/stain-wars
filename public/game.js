import * as THREE from 'three';
const S = window.Shared;
const socket = io();
const $ = (id) => document.getElementById(id);
// Phones and tablets get touch controls and a smaller HUD. Laptops (even ones with a touch screen) keep mouse + keyboard.
const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;
document.body.classList.toggle('touch', TOUCH);
const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// ---------- Scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = 0x87e0ff, FALL_SKY = 0xffb36b;   // normal vs. Thanksgiving
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 120, 380);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 600);
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a890, 1.4);   // neutral from below, or indoor ceilings turn green
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(20, 40, 10); scene.add(sun);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const BOX = new THREE.BoxGeometry(1, 1, 1);
const mat = (color, extra) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
// Thanksgiving recolor: squeeze every hue into reds, oranges and golds; near-grays become warm browns.
function autumnColor(hex) {
  const c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl);
  if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 0.2) return c.setHSL(0.08, 0.35, hsl.l * 0.9);
  return c.setHSL(hsl.h * 0.15, Math.max(hsl.s, 0.6), Math.min(hsl.l, 0.55));
}
// Everything that changes color for Thanksgiving registers here: [material, normal hex].
const themed = [];
const tmat = (color, extra) => { const m = mat(color, extra); themed.push([m, color]); return m; };
const flat = (w, d, color, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), tmat(color)); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); return m; };

// ---------- The town ----------
flat(1000, 1000, 0x7ed957, 0, -0.05, 0);                         // fields outside town
flat(S.ARENA * 2, S.ARENA * 2, 0xd6d0c4, 0, 0, 0);                // sidewalk concrete
const A = S.ARENA, SW = S.STREET_W;
const blockEdges = [[-A, S.STREETS[0] - SW / 2], ...S.STREETS.slice(0, -1).map((s, i) => [s + SW / 2, S.STREETS[i + 1] - SW / 2]), [S.STREETS[3] + SW / 2, A]];
blockEdges.forEach(([x0, x1], i) => blockEdges.forEach(([z0, z1], j) => {
  if (i === 2 && j === 2) flat(x1 - x0, z1 - z0, 0xd9a06b, 0, 0.006, 0);                      // Town Square (brick)
  else if (i === 2 && j === 3) flat(x1 - x0, z1 - z0, 0x55585f, 0, 0.006, (z0 + z1) / 2);      // parking lot
  else if (!(i === 2 && j === 1)) flat(x1 - x0 - 6, z1 - z0 - 6, 0x8fd16a, (x0 + x1) / 2, 0.006, (z0 + z1) / 2);   // lawns
}));
for (const s of S.STREETS) { flat(SW, A * 2, 0x44474f, s, 0.012, 0); flat(A * 2, SW, 0x44474f, 0, 0.012, s); }
flat(S.GAS.x1 - S.GAS.x0, S.GAS.z1 - S.GAS.z0, 0xbfc3c9, 0, 0.009, (S.GAS.z0 + S.GAS.z1) / 2);
// Dashed center lines and parking stripes: one instanced mesh each.
(function paint() {
  const dashes = [], stripes = [];
  for (const s of S.STREETS) for (let t = -A + 2; t < A; t += 6) {
    if (S.STREETS.some(q => Math.abs(t - q) < SW / 2 + 1)) continue;   // not across intersections
    dashes.push([s, t, 0.25, 2.5], [t, s, 2.5, 0.25]);
  }
  for (const x of [-14, -7, 0, 7, 14]) for (const z of [50, 63]) stripes.push([x + 3.5, z, 0.2, 5]);
  for (const [list, color, y] of [[dashes, 0xffd400, 0.016], [stripes, 0xffffff, 0.01]]) {
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), tmat(color), list.length), m4 = new THREE.Matrix4();
    list.forEach(([x, z, w, d], i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(w, d, 1))));
    scene.add(im);
  }
})();

// All the map's boxes go into one mesh (one draw call), so school laptops don't pay for thousands of separate objects.
// Undersides are darker so ceilings read as ceilings, since there are no real shadows.
// Each building also gets a thin ground floor. It's only for looks (you'd stand at 0 anyway), so it isn't in S.BOXES.
// Two color sets are kept so the Thanksgiving theme is just a swap.
const world = (function buildWorld() {
  const floors = S.BUILDINGS.map(B => ({ x: B.x, z: B.z, w: B.w, d: B.d, y: -0.1, top: 0.015, color: 0xeee3cf }));
  const all = [...S.BOXES, ...floors];
  const t = new THREE.BoxGeometry(1, 1, 1), tp = t.attributes.position, tn = t.attributes.normal, ti = t.index, n = all.length;
  const pos = new Float32Array(n * tp.count * 3), nor = new Float32Array(n * tp.count * 3), col = new Float32Array(n * tp.count * 3), fall = new Float32Array(n * tp.count * 3), idx = new Uint32Array(n * ti.count);
  const c = new THREE.Color();
  all.forEach((b, i) => {
    const h = b.top - b.y, base = i * tp.count, f = autumnColor(b.color);
    c.setHex(b.color);
    for (let v = 0; v < tp.count; v++) {
      const k = (base + v) * 3, ny = tn.getY(v), shade = ny < 0 ? 0.8 : ny > 0 ? 1 : 0.88;
      pos[k] = b.x + tp.getX(v) * b.w; pos[k + 1] = b.y + h / 2 + tp.getY(v) * h; pos[k + 2] = b.z + tp.getZ(v) * b.d;
      nor[k] = tn.getX(v); nor[k + 1] = ny; nor[k + 2] = tn.getZ(v);
      col[k] = c.r * shade; col[k + 1] = c.g * shade; col[k + 2] = c.b * shade;
      fall[k] = f.r * shade; fall[k + 1] = f.g * shade; fall[k + 2] = f.b * shade;
    }
    for (let v = 0; v < ti.count; v++) idx[i * ti.count + v] = base + ti.getX(v);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col.slice(), 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  return { g, col, fall };
})();
// Painted signs: over each building's front door, and on the gas station canopy.
function sign(text, w, h, x, y, z, ry = 0, bg = '#fff6d8', fg = '#7b2ff7') {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, 512, 96);
  c.fillStyle = fg; c.font = 'bold 60px Comic Sans MS, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 256, 50, 490);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
  return m;
}
for (const B of S.BUILDINGS) sign(B.name, 4.8, 0.8, B.doorX, 3.15, B.doorZ + 0.03);
sign('⛽ GOBBLE GAS ⛽', 12, 2, 0, 5.5, -47.48, 0, '#e63946', '#fff');
sign('⛽ GOBBLE GAS ⛽', 12, 2, 0, 5.5, -64.52, Math.PI, '#e63946', '#fff');
sign('🦃 TOWN SQUARE 🦃', 8, 1.4, 0, 0.8, 20.5, 0, '#d9a06b', '#5a2d0c');
for (const x of [-3, 3]) for (const z of [-60, -52]) {   // pumps on the islands (the islands are the solid part)
  const p = new THREE.Mesh(BOX, mat(0xe63946)); p.scale.set(0.9, 1.6, 0.7); p.position.set(x, 2.2, z); scene.add(p);
}
// Ziplines: a cable and two poles each. The poles are only for looks; the server checks the cable itself.
for (const L of S.ZIPLINES) {
  const a = new THREE.Vector3(...L.a), b = new THREE.Vector3(...L.b), mid = a.clone().add(b).multiplyScalar(0.5);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, a.distanceTo(b), 4), mat(0x222222));
  cable.position.copy(mid); cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); scene.add(cable);
  for (const [base, top] of [[L.pa, L.a], [L.pb, L.b]]) {
    const h = top[1] - base[1] + 0.3, pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, h, 6), tmat(0xffb703));
    pole.position.set(base[0], base[1] + h / 2, base[2]); scene.add(pole);
    const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), mat(0xe63946, { emissive: 0x551111 })); cap.position.set(top[0], top[1] + 0.3, top[2]); scene.add(cap);
  }
}
// fence + a city skyline far outside it
for (let i = 0; i < 4; i++) {
  const w = new THREE.Mesh(new THREE.BoxGeometry(S.ARENA * 2, 1, 0.4), tmat([0xff4fa3, 0xffe600, 0x4d96ff, 0x7b2ff7][i]));
  w.position.set(i < 2 ? 0 : (i === 2 ? 1 : -1) * S.ARENA, 0.5, i < 2 ? (i === 0 ? 1 : -1) * S.ARENA : 0);
  if (i >= 2) w.rotation.y = Math.PI / 2;
  scene.add(w);
}
for (let i = 0; i < 48; i++) {
  const along = (Math.random() * 2 - 1) * (A + 80), out = (A + 30 + Math.random() * 90) * (Math.random() < 0.5 ? -1 : 1);
  const [x, z] = Math.random() < 0.5 ? [along, out] : [out, along], h = 20 + Math.random() * 50, w = 12 + Math.random() * 20;
  const t = new THREE.Mesh(BOX, tmat(new THREE.Color().setHSL(0.6, 0.15, 0.55 + Math.random() * 0.15).getHex()));
  t.scale.set(w, h, w); t.position.set(x, h / 2, z); scene.add(t);
}
// Falling leaves, only in the Thanksgiving boss fight.
const LEAVES = 90, leafData = [];
const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.35, 0.25), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), LEAVES);
for (let i = 0; i < LEAVES; i++) {
  leafData.push({ x: (Math.random() - 0.5) * 60, y: Math.random() * 25, z: (Math.random() - 0.5) * 60, s: Math.random() * 6 });
  leaves.setColorAt(i, new THREE.Color([0xd62828, 0xf77f00, 0xfcbf49, 0x9c6644][i % 4]));
}
leaves.visible = false; scene.add(leaves);

// ---------- Avatars ----------
const G = {
  leg: new THREE.BoxGeometry(0.25, 0.8, 0.3), body: new THREE.CylinderGeometry(0.42, 0.5, 0.8, 6),
  arm: new THREE.BoxGeometry(0.18, 0.6, 0.18), head: new THREE.IcosahedronGeometry(0.38, 0),
  eye: new THREE.SphereGeometry(0.13, 8, 6), pupil: new THREE.SphereGeometry(0.06, 6, 4), hat: new THREE.ConeGeometry(0.3, 0.55, 5),
  blob: new THREE.IcosahedronGeometry(1, 1), cone: new THREE.ConeGeometry(1, 1, 5), cube: BOX,
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
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

// The "6 7" joke: hands with way too many fingers (a dig at AI-drawn hands). Palm faces local -z, fingers run along -y,
// so with the arm raised forward the palm faces up. Every hand has 7 fingers; the 7th is hidden to make a 6.
const handMat = mat(0xffcc99);
function makeHand() {
  const g = new THREE.Group(), palm = new THREE.Mesh(G.cube, handMat);
  palm.scale.set(0.3, 0.2, 0.06); g.add(palm);
  const fingers = [];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(G.cube, handMat), a = (i - 3) * 0.16;
    f.scale.set(0.035, 0.17, 0.035); f.position.set(Math.sin(a) * 0.17 + (i - 3) * 0.02, -0.08 - Math.cos(a) * 0.1, 0); f.rotation.z = -a;
    g.add(f); fingers.push(f);
  }
  g.position.y = -0.75; g.visible = false;
  return { g, fingers };
}

function makeAvatar() {
  const g = new THREE.Group(), human = new THREE.Group();
  g.add(human);
  const shirt = mat(0xffffff), pants = mat(0xffffff), hat = mat(0xffffff);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); human.add(o); return o; };
  // Arms and legs hang from pivots at the shoulder and hip, so dances look like dances.
  const limb = (geo, m, x, y, len) => { const p = new THREE.Group(); p.position.set(x, y, 0); human.add(p); const o = new THREE.Mesh(geo, m); o.position.y = -len / 2; p.add(o); return p; };
  const legL = limb(G.leg, pants, -0.15, 0.8, 0.8), legR = limb(G.leg, pants, 0.15, 0.8, 0.8);
  add(G.body, shirt, 0, 1.2, 0);
  const armL = limb(G.arm, shirt, -0.55, 1.55, 0.6), armR = limb(G.arm, shirt, 0.55, 1.55, 0.6);
  add(G.head, skin, 0, 1.85, 0);
  const eyeL = add(G.eye, white, -0.15, 1.92, -0.3), eyeR = add(G.eye, white, 0.17, 1.95, -0.3);
  eyeR.scale.setScalar(1.3); // derp
  const pupils = [add(G.pupil, black, -0.15, 1.92, -0.42), add(G.pupil, black, 0.17, 1.95, -0.45)];
  const h = add(G.hat, hat, 0.05, 2.35, 0); h.rotation.z = 0.25;
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));   // depth tested: walls hide name tags
  tag.scale.set(2.4, 0.6, 1); tag.position.y = 2.95; g.add(tag);
  const tray = makeTray(1); tray.position.set(-0.32, 1.25, -0.62); tray.rotation.y = 0.25; tray.visible = false; g.add(tray);
  const hands = [makeHand(), makeHand()];
  armL.add(hands[0].g); armR.add(hands[1].g);
  scene.add(g);
  return { g, human, tray, shirt, pants, hat, armL, armR, legL, legR, hands, pupils, eyes: [eyeL, eyeR], canvas, tag, tier: -1, hp: -1, name: '',
    team: 0, owl: null, owls: {}, size: 1, sizeTarget: 1, target: new THREE.Vector3(), ry: 0, phase: Math.random() * 10, emote: 0, emoteT: 0, zip: 0, music: null, disco: null };
}

function setForm(a, team) {
  a.team = team;
  a.human.visible = !team;
  if (team && !a.owls[team]) { a.owls[team] = makeOwl(team); a.g.add(a.owls[team].g); }
  for (const t in a.owls) a.owls[t].g.visible = +t === team;
  a.owl = team ? a.owls[team] : null;
}

// Thanksgiving: everyone dresses in harvest colors with a black pilgrim hat (nobody can be told apart by tier, but
// nobody needs to: it's everyone vs. the turkey).
const HARVEST = [0xc0392b, 0xe67e22, 0xd4a017, 0x8b4513, 0x6b8e23, 0xa0522d, 0xcd853f, 0xb5651d, 0x9b2335, 0xf4a261];
let thanks = false;
function setOutfit(mats, tier) {
  const o = S.OUTFITS[tier];
  const cols = thanks ? [HARVEST[tier], HARVEST[(tier + 3) % 10], 0x1a1a1a] : [o.shirt, o.pants, o.hat];
  [mats.shirt, mats.pants, mats.hat].forEach((m, i) => { m.color.setHex(cols[i]); m.emissive.setHex(cols[i]).multiplyScalar(thanks ? 0 : o.glow); });
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

// Poses: walking, sitting in a car, hanging from a zipline, and the four dances. Called every frame per avatar.
const discoMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, flatShading: true });
function pose(a, t, moving, seated) {
  const H = a.human, [aL, aR, lL, lR] = [a.armL, a.armR, a.legL, a.legR];
  H.position.set(0, 0, 0); H.rotation.set(0, 0, 0);
  for (const l of [aL, aR, lL, lR]) l.rotation.set(0, 0, 0);
  a.hands.forEach(h => h.g.visible = false);
  if (a.disco) a.disco.visible = false;
  const e = a.emote, et = t - a.emoteT;
  if (a.owl) {   // owls just bop along to any dance
    const flap = 0.15 + (moving || e ? 0.5 + Math.sin(t * 16 + a.phase) * 0.5 : 0);
    a.owl.wings[0].rotation.z = -flap; a.owl.wings[1].rotation.z = flap;
    a.owl.g.position.y = e ? Math.abs(Math.sin(et * 6)) * 0.4 : 0; a.owl.g.rotation.y = e === 1 ? et * 4 : 0;
    return;
  }
  if (seated) { lL.rotation.x = lR.rotation.x = Math.PI / 2; aL.rotation.x = aR.rotation.x = 1.1; return; }
  if (a.zip) { aL.rotation.z = -2.9; aR.rotation.z = 2.9; lL.rotation.x = Math.sin(t * 5) * 0.3; lR.rotation.x = -Math.sin(t * 5) * 0.3; return; }
  if (e === 1) {   // Disco Fever: point to the sky, point to the floor, under a tiny disco ball
    const up = Math.floor(et * 2) % 2 === 0, s = Math.sin(et * Math.PI * 2);
    aR.rotation.z = up ? 2.6 : -0.5; aR.rotation.x = up ? 0 : 0.4;
    aL.rotation.z = -0.6; aL.rotation.x = -0.5;
    H.rotation.z = s * 0.12; H.position.x = s * 0.1; lL.rotation.z = -0.2 + s * 0.15; lR.rotation.z = 0.2 + s * 0.15;
    if (!a.disco) { a.disco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), discoMat); a.g.add(a.disco); }
    a.disco.visible = true; a.disco.position.set(0, 3.5, 0); a.disco.rotation.y = et * 3;
  } else if (e === 2) {   // Fish Belly Flop: hop, flop onto your belly, then flip-flop like a fish out of water
    const air = Math.min(1, et / 0.8);
    H.position.y = et < 0.8 ? Math.sin(air * Math.PI) * 1.2 + 0.35 * air : 0.35 + Math.abs(Math.sin(et * 7)) * 0.25;
    H.rotation.x = -Math.PI / 2 * air;
    if (et > 0.8) {
      const w = Math.sin(et * 14);
      H.rotation.y = w * 0.35; aL.rotation.z = -1.4 + w * 0.6; aR.rotation.z = 1.4 + w * 0.6;
      lL.rotation.x = lR.rotation.x = -0.4 + Math.sin(et * 14 + 1) * 0.5;   // legs together: a tail
    }
  } else if (e === 3) {   // 6 7: palms up, weighing it up and down... with 6 and 7 fingers
    const s = Math.sin(et * 7);
    aL.rotation.x = Math.PI / 2 + s * 0.35; aR.rotation.x = Math.PI / 2 - s * 0.35;
    H.position.y = Math.abs(s) * 0.06;
    if (et > 0.4) {   // the hands "glitch" in, then each beat randomly decides which one has 6 and which has 7
      const beat = Math.floor(et * 2), six = (beat * 7919 + a.id) % 2;
      a.hands.forEach((h, i) => { h.g.visible = true; h.g.scale.setScalar(1.8 * Math.min(1, (et - 0.4) * 4)); h.fingers[6].visible = i !== six; });
    }
  } else if (e === 4) {   // Orange Justice: scoop the arms side to side while stepping out
    const s = Math.sin(et * 8), c = Math.cos(et * 8);
    aL.rotation.x = aR.rotation.x = 0.5 + Math.abs(c) * 0.4; aL.rotation.z = aR.rotation.z = s * 0.9;
    lL.rotation.x = Math.max(0, s) * -0.8; lR.rotation.x = Math.max(0, -s) * -0.8;
    H.position.y = Math.abs(c) * 0.12; H.rotation.y = s * 0.25;
  } else {
    const sw = moving ? Math.sin(t * 12 + a.phase) * 0.8 : 0;
    aL.rotation.x = sw; aR.rotation.x = -sw; lL.rotation.x = -sw * 0.6; lR.rotation.x = sw * 0.6;
  }
}

const avatars = new Map();
const info = new Map();   // id -> { name, team, scale }, from the 1Hz board

// ---------- Vehicles ----------
// Low-poly, open-top food vehicles. Faces -z like the avatars. Each type gets a giant food sign on top.
const VG = { box: G.cube, wheel: new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10) };
function makeVehicle(type) {
  const T = S.VEHICLE_TYPES[type], g = new THREE.Group(), body = tmat(T.color), dark = mat(0x222222), trim = tmat(0xf1faee);
  const box = (m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(VG.box, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); g.add(o); return o; };
  const L = T.len, W = T.wid;
  box(body, 0, 0.75, 0, W, 0.6, L);                                     // tub
  box(body, 0, 1.25, -L / 2 + 0.35, W, 0.4, 0.7);                      // hood
  box(body, 0, 1.15, L / 2 - 0.15, W, 0.4, 0.3);                       // tailgate
  for (const s of [-1, 1]) box(body, s * (W / 2 - 0.1), 1.15, 0, 0.2, 0.4, L);   // sides
  box(mat(0x9ad1ff, { transparent: true, opacity: 0.5 }), 0, 1.75, -L / 2 + 0.75, W - 0.2, 0.6, 0.06);   // windshield
  for (const s of [-1, 1]) {
    box(mat(0xfff3b0, { emissive: 0xaa9900 }), s * (W / 2 - 0.35), 1.0, -L / 2 - 0.02, 0.4, 0.2, 0.05);   // headlights
    box(mat(0xff3030, { emissive: 0x880000 }), s * (W / 2 - 0.3), 1.0, L / 2 + 0.02, 0.35, 0.15, 0.05);   // taillights
  }
  T.seats.forEach(([r, f]) => box(trim, r, 0.95, f + 0.3, 0.5, 0.5, 0.15));   // seat backs
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(VG.wheel, dark); w.rotation.z = Math.PI / 2; w.position.set(sx * (W / 2), 0.42, sz * L * 0.32); g.add(w); wheels.push(w);
  }
  // The food on top, on two poles: taco, pizza slice, hot dog, striped canopy.
  const topY = 3.1, poleM = mat(0xcccccc);
  for (const z of [-0.5, 0.5]) box(poleM, 0, topY / 2 + 0.6, L * 0.25 + z, 0.1, topY - 1.2, 0.1);
  const top = new THREE.Group(); top.position.set(0, topY, L * 0.25); g.add(top);
  const piece = (geo, m, x, y, z, sx, sy, sz, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); top.add(o); };
  if (type === 'truck') {
    piece(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true, 0, Math.PI), tmat(0xf4c95d, { side: THREE.DoubleSide }), 0, 0, 0, 1.3, 2.6, 1.3, 0, Math.PI / 2);
    piece(G.cube, tmat(0x55aa22), 0, 0.2, 0, 2.2, 0.25, 1.8);
    piece(G.cube, tmat(0xe23a2a), 0, 0.35, 0, 1.6, 0.15, 1.4);
  } else if (type === 'car') {
    piece(new THREE.CylinderGeometry(1, 1, 0.15, 3), tmat(0xf4a261), 0, 0, 0, 1.4, 1, 1.4);
    for (const [x, z] of [[0, 0.3], [-0.35, -0.3], [0.4, -0.2]]) piece(G.cyl, tmat(0xc0392b), x, 0.1, z, 0.2, 0.05, 0.2);
  } else if (type === 'dog') {
    piece(new THREE.CapsuleGeometry(0.45, 2, 4, 8), tmat(0xe8b46a), 0, 0, 0, 1, 1, 1, Math.PI / 2);
    piece(new THREE.CapsuleGeometry(0.28, 2.4, 4, 8), tmat(0xb0391b), 0, 0.3, 0, 1, 1, 1, Math.PI / 2);
    piece(G.cube, tmat(0xffd400), 0, 0.6, 0, 0.12, 0.05, 2);
  } else {
    piece(G.cube, tmat(0xffffff), 0, 0, 0, W + 0.4, 0.12, L + 0.2);
    for (let i = 0; i < 4; i++) piece(G.cube, tmat(0xff6b6b), -W / 2 + (i + 0.5) * (W + 0.4) / 4 - 0.2, 0.01, 0, 0.2, 0.13, L + 0.22);
  }
  // Steering wheel in front of the driver's seat.
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 4, 10), dark);
  sw.position.set(T.seats[0][0], 1.45, T.seats[0][1] - 0.45); sw.rotation.x = -0.6; g.add(sw);
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
  tag.scale.set(3, 0.75, 1); tag.position.y = 4.4; g.add(tag);
  scene.add(g);
  return { g, wheels, tag, canvas, type, target: new THREE.Vector3(), ry: 0, hp: 0, fuel: 0, dead: 0, speed: 0, seats: [], tagKey: '', first: true };
}
function drawVehTag(v) {
  const T = S.VEHICLE_TYPES[v.type], key = `${Math.ceil(v.hp / T.hp * 20)}|${Math.ceil(v.fuel / 5)}`;
  if (key === v.tagKey) return;
  v.tagKey = key;
  const c = v.canvas.getContext('2d');
  c.clearRect(0, 0, 256, 64);
  c.font = 'bold 24px Comic Sans MS, sans-serif'; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = '#000'; c.fillStyle = '#fff';
  const label = v.fuel <= 0 ? '⛽ OUT OF GAS' : T.name;
  c.strokeText(label, 128, 24); c.fillText(label, 128, 24);
  c.fillStyle = '#000'; c.fillRect(38, 34, 180, 24);
  c.fillStyle = '#3f3'; c.fillRect(40, 36, 176 * Math.max(0, v.hp) / T.hp, 9);
  c.fillStyle = '#fa0'; c.fillRect(40, 47, 176 * v.fuel / S.FUEL_MAX, 9);
  v.tag.material.map.needsUpdate = true;
}
const vehs = new Map();   // id -> vehicle view
S.VEHICLES.forEach(([type, x, z, ry], id) => { const v = makeVehicle(type); v.id = id; v.g.position.set(x, 0, z); v.g.rotation.y = ry; v.ry = ry; vehs.set(id, v); });
function seatWorld(v, i) {   // where seat i is right now, from the smoothed car we're drawing
  const [r, f] = S.VEHICLE_TYPES[v.type].seats[i], ry = v.g.rotation.y;
  return [v.g.position.x + Math.cos(ry) * r - Math.sin(ry) * f, v.g.position.z - Math.sin(ry) * r - Math.cos(ry) * f];
}

// ---------- The boss: Tom Gobbleton ----------
// A giant derpy turkey in a pilgrim hat. Head position must match the server's (S.BOSS.headY / headFwd).
const turkey = (function makeTurkey() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const add = (geo, m, x, y, z, sx = 1, sy = sx, sz = sx, parent = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); parent.add(o); return o; };
  const brown = mat(0x8b5a2b), light = mat(0xb07d48), wingM = mat(0x6b4226), orange = mat(0xf4a300), red = mat(0xd32f2f);
  add(G.blob, brown, 0, 5.2, 0, 4, 3.6, 4.6);
  add(G.blob, light, 0, 4.8, -2.3, 3, 2.8, 2.3);
  const fan = new THREE.Group(); fan.position.set(0, 5.5, 3.4); body.add(fan);   // tail feathers
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Group(); p.rotation.z = (i - 4) * 0.32; p.rotation.x = -0.35; fan.add(p);
    add(G.cone, mat([0xc0392b, 0xe67e22, 0xf1c40f, 0x8b4513, 0xd35400][i % 5]), 0, 3.2, 0, 1.1, 6.4, 0.35, p);
  }
  const wings = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 3.6, 6.2, 0); body.add(p); add(G.blob, wingM, 0, -1.2, 0, 0.8, 2.4, 3, p); return p; });
  const neck = new THREE.Group(); neck.position.set(0, 7, -2.2); body.add(neck);
  add(G.cyl, light, 0, 0.6, -0.2, 0.7, 2.4, 0.7, neck);
  const head = new THREE.Group(); head.position.set(0, 8.6 - 7, -2.6 + 2.2); neck.add(head);
  add(G.blob, mat(0xe57373), 0, 0, 0, 1.3, 1.3, 1.3, head);
  add(G.cone, orange, 0, -0.1, -1.4, 0.4, 0.9, 0.4, head).rotation.x = -Math.PI / 2;
  const wattle = add(G.blob, red, 0.3, -0.8, -1.1, 0.3, 0.8, 0.3, head);
  const eyes = [add(G.eye, white, -0.55, 0.4, -1.0, 2.8, 2.8, 2.8, head), add(G.eye, white, 0.55, 0.45, -1.0, 3.4, 3.4, 3.4, head)];
  const pupils = eyes.map(e => add(G.pupil, black, e.position.x, e.position.y, -1.42, 2.6, 2.6, 2.6, head));
  add(G.cyl, black, 0, 1.6, 0.1, 0.9, 1.4, 0.9, head);                 // pilgrim hat
  add(G.cyl, black, 0, 0.95, 0.1, 1.5, 0.12, 1.5, head);
  add(G.cube, mat(0xffd700, { emissive: 0x554400 }), 0, 1.15, -0.78, 0.6, 0.45, 0.08, head);   // buckle
  const legs = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * 1.4, 3.4, 0); g.add(p);
    add(G.cyl, orange, 0, -1.7, 0, 0.25, 3.4, 0.25, p);
    for (const a of [-0.5, 0, 0.5]) { const toe = add(G.cone, orange, Math.sin(a) * 0.6, -3.3, -Math.cos(a) * 0.6, 0.18, 1.2, 0.18, p); toe.rotation.set(-Math.PI / 2, 0, -a); }
    return p;
  });
  g.scale.setScalar(S.BOSS.size);   // modeled at size 1; the server's hitbox numbers already include the scale
  g.visible = false; scene.add(g);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xa0522d, transparent: true, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);   // the stomp's shockwave, out to S.BOSS.stompR
  return { g, ring, body, wings, neck, head, wattle, eyes, pupils, legs, target: new THREE.Vector3(), ry: 0, hp: 0, max: 1, stomp: 0, gobbleAt: 0, slamAt: 0 };
})();

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
  const W = S.W(w), m = new THREE.Mesh(w === 1 ? pellet : w === 6 || w > 10 ? blob : ball, mat(W.color));
  if (w === 2) m.scale.set(0.4, 0.4, 10);   // flying noodle
  if (w === 5) m.scale.set(0.8, 0.8, 4);
  if (w > 10) m.scale.setScalar(W.r * 4);   // the turkey's gravy, cranberries and stuffing are big
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

function splat(p, w, huge) {
  const W = S.W(w), big = huge || !!(W.splash || W.blind), cols = splatColors[w] || [W.color, 0xffffff];
  for (let i = 0; i < (huge ? 30 : big ? 16 : 5); i++) {
    const m = new THREE.Mesh(ball, mat(cols[i % cols.length]));
    m.position.set(p[0], p[1] + 0.2, p[2]);
    const sp = huge ? 14 : big ? 9 : 4;
    parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * sp, Math.random() * sp, (Math.random() - 0.5) * sp), t: 0.6 });
    scene.add(m);
  }
  const floor = S.floorBelow(p[0], p[1] + 0.2, p[2]);
  if (p[1] - floor < 0.3 || Math.random() < 0.3) {
    const d = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: cols[Math.floor(Math.random() * cols.length)] }));
    d.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
    d.scale.setScalar(huge ? 4 : big ? 2.5 : 0.4 + Math.random() * 0.5);
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
// Pitch slide from f to `to`. vib = wobble depth in Hz (kazoo, trombone, burp). out = where it plays (emote music has its own).
function tone(f, dur, { type = 'square', vol = 0.05, to = f * 0.4, at = 0, vib = 0, out } = {}) {
  if (!ac || vol < 0.002) return;
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (vib) {
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = 7; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur);
  }
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out || ac.destination); o.start(t); o.stop(t + dur);
}
// Noise through a sweeping filter: squirts, splats, fizz, whooshes.
function noise(dur, { vol = 0.05, type = 'lowpass', f = 1000, to = f, q = 1, at = 0, out } = {}) {
  if (!ac || vol < 0.002) return;
  const t = ac.currentTime + at, src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf; fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(fl).connect(g).connect(out || ac.destination); src.start(t, Math.random() * 0.5); src.stop(t + dur);
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
  gobble: (v = 1) => { for (let i = 0; i < 7; i++) tone(520 - i * 25, 0.08, { type: 'sawtooth', vol: 0.1 * v, to: 280, at: i * 0.08, vib: 80 }); },
  windup: () => tone(80, 0.9, { type: 'sawtooth', vol: 0.08, to: 400 }),
  slam: (v = 1) => { noise(0.8, { vol: 0.25 * v, f: 1500, to: 60 }); tone(90, 0.6, { type: 'sine', vol: 0.25 * v, to: 30 }); },
  honk: () => { tone(392, 0.3, { type: 'square', vol: 0.05, to: 392 }); tone(494, 0.3, { type: 'square', vol: 0.04, to: 494 }); },
  door: () => { tone(300, 0.08, { type: 'square', vol: 0.05, to: 200 }); noise(0.08, { vol: 0.05, f: 800, to: 300, at: 0.05 }); },
  boom: (v = 1) => { noise(0.9, { vol: 0.2 * v, f: 3000, to: 100 }); tone(150, 0.6, { type: 'sawtooth', vol: 0.1 * v, to: 40 }); },
  fanfare: () => notes([[523, 0.15], [523, 0.15], [523, 0.15], [698, 0.5], [880, 0.2], [784, 0.2], [880, 0.2], [1046, 0.8]], { type: 'square', vol: 0.06 }),
};
const fireSfx = [SFX.squirt, SFX.fizz, SFX.whip, SFX.lob, SFX.lob, SFX.snipe, SFX.spray];
// A looping sound (engine hum, zipline whir). Returns { set(freq, vol), stop() }.
function loopSound(kind) {
  if (!ac) return null;
  const g = ac.createGain(); g.gain.value = 0; g.connect(ac.destination);
  let src, fl;
  if (kind === 'engine') { src = ac.createOscillator(); src.type = 'sawtooth'; fl = ac.createBiquadFilter(); fl.frequency.value = 500; src.connect(fl).connect(g); }
  else { src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true; fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 4; src.connect(fl).connect(g); }
  src.start();
  return {
    set(f, vol) { if (kind === 'engine') src.frequency.setTargetAtTime(f, ac.currentTime, 0.1); else fl.frequency.setTargetAtTime(f, ac.currentTime, 0.1); g.gain.setTargetAtTime(vol, ac.currentTime, 0.1); },
    stop() { g.gain.setTargetAtTime(0, ac.currentTime, 0.05); setTimeout(() => { src.stop(); g.disconnect(); }, 300); },
  };
}

// Emote music: 8 seconds at 120 BPM, all synthesized. Each plays into its own gain node so it can be stopped early.
// speak = the "6 7" emote also says "six seven" out loud (only for your own dance, so a crowd doesn't spam it).
function playEmote(n, vol = 1, speak = false) {
  if (!ac) return null;
  const out = ac.createGain(), timers = [];
  out.gain.value = vol; out.connect(ac.destination);
  const B = 0.5, o = { out };
  const kick = (at) => tone(150, 0.2, { type: 'sine', vol: 0.2, to: 40, at, out });
  const hat = (at, v = 0.03) => noise(0.04, { vol: v, type: 'highpass', f: 8000, at, out });
  const snare = (at) => noise(0.16, { vol: 0.09, type: 'bandpass', f: 1800, to: 900, at, out });
  const note = (f, d, at, type = 'square', v = 0.045) => tone(f, d, { type, vol: v, to: f * 0.995, at, out });
  if (n === 0) {   // Disco: four on the floor, octave bass, string stabs
    const bass = [110, 110, 98, 98, 87, 87, 98, 98];
    for (let b = 0; b < 16; b++) {
      const at = b * B, f = bass[Math.floor(b / 2) % 8];
      kick(at); hat(at + B / 2, 0.05); if (b % 2) snare(at);
      note(f, 0.22, at, 'sawtooth', 0.05); note(f * 2, 0.22, at + B / 2, 'sawtooth', 0.05);
      if (b % 4 === 2) for (const c of [440, 554, 659]) note(c * f / 110, 0.3, at + B * 0.25, 'triangle', 0.035);
    }
  } else if (n === 1) {   // Belly flop: slide whistle, SPLASH, then a goofy tuba and flip-flops
    tone(400, 0.7, { type: 'sine', vol: 0.08, to: 1600, out });
    noise(0.7, { vol: 0.25, f: 3000, to: 200, at: 0.78, out }); tone(90, 0.5, { type: 'sine', vol: 0.2, to: 40, at: 0.78, out });
    const tuba = [98, 131, 165, 131, 98, 147, 196, 147];
    for (let b = 2; b < 16; b++) {
      const at = b * B;
      note(tuba[b % 8], 0.35, at, 'sawtooth', 0.06);
      tone(220, 0.1, { type: 'sine', vol: 0.08, to: 90, at: at + B / 2, out });   // flop
    }
  } else if (n === 2) {   // 6 7: trap beat, 808s and two big "doot doot" notes
    for (let b = 0; b < 16; b++) {
      const at = b * B;
      for (let i = 0; i < 4; i++) hat(at + i * B / 4, 0.025);
      if (b % 2) snare(at);
      if (b % 4 === 0) tone(60, 0.6, { type: 'sine', vol: 0.25, to: 42, at, out });
      if (b % 2 === 0) { note(392, 0.18, at, 'square', 0.04); note(440, 0.3, at + B / 2, 'square', 0.04); }
    }
    if (speak && 'speechSynthesis' in window) for (let i = 0; i < 4; i++) timers.push(setTimeout(() => {
      const u = new SpeechSynthesisUtterance('six... seven!'); u.rate = 1.15; u.pitch = 1.4; speechSynthesis.speak(u);
    }, 500 + i * 2000));
  } else {   // Orange Justice: bouncy electro lead
    const lead = [659, 784, 880, 784, 659, 587, 523, 587];
    for (let b = 0; b < 16; b++) {
      const at = b * B;
      kick(at); if (b % 2) { snare(at); snare(at + 0.015); }
      note(lead[(b * 2) % 8], 0.2, at, 'square', 0.04); note(lead[(b * 2 + 1) % 8], 0.2, at + B / 2, 'square', 0.04);
      note(b % 4 < 2 ? 131 : 147, 0.4, at, 'triangle', 0.08);
    }
  }
  o.stop = () => {
    timers.forEach(clearTimeout);
    if (speak && 'speechSynthesis' in window) speechSynthesis.cancel();
    out.gain.setTargetAtTime(0, ac.currentTime, 0.05);
    setTimeout(() => out.disconnect(), 300);
  };
  return o;
}
let remoteMusic = 0;   // at most 3 other people's dance tunes at once, or a dance party gets painful

// ---------- Local player ----------
const me = { x: 0, y: 0, z: 0, vy: 0, onGround: true };
let myId = 0, myName = '', yaw = 0, pitch = 0, alive = true, hp = 100, tier = 0, money = 0, earned = 0, ammo = 0, blindLeft = 0;
let phase = 'free', phaseLeft = 0, nextPh = null, scores = [0, 0], myTeam = 0, myScale = 1, eyeScale = 1, lastResults = null;
let owned = S.WEAPONS.map((_, i) => i === 0 ? 1 : 0);
let wstains = S.WEAPONS.map(() => 0), dmgLv = S.WEAPONS.map(() => 0), hasTray = false, trayHp = 0, trayBackAt = 0, viewY = 0;
let weapon = 0, firing = false, zoom = false, lastFire = 0, lastBomb = 0, kick = 0, lastSend = 0, inShop = false;
let mySeat = null;        // { v: vehicle id, i: seat } while riding
let zipping = null;       // { i, t, dir } while on a zipline
let myEmote = null;       // { n, t0, yaw0, music } while dancing
let resultsShown = false, wheelOpen = false, lastLook = 0, engine = null, whir = null, prompt = null;
const SLOTS = S.FLASH;   // weapon slots 1..6; the cream bomb is thrown with G
const keys = {};
const fwd = new THREE.Vector3();
const meAv = makeAvatar();   // your own body, seen in third person (driving, dancing)
meAv.tag.visible = false; meAv.g.visible = false;

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyB') toggleShop();
  if (e.code === 'KeyT') toggleWheel();
  else if (wheelOpen && /^Digit[1-4]$/.test(e.code)) { startEmote(+e.code.slice(5) - 1); toggleWheel(false); }
  else if (/^Digit[1-9]$/.test(e.code)) setWeapon(+e.code.slice(5) - 1);
  if (e.code === 'KeyQ') { let w = weapon; do w = (w + 1) % SLOTS; while (!owned[w]); setWeapon(w); }
  if (e.code === 'KeyG') throwBomb();
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyH' && mySeat && mySeat.i === 0) SFX.honk();
  if (e.code === 'Space' && zipping) socket.emit('zip');   // let go
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
  lastLook = performance.now();
});
const lock = () => {
  audio();
  if (!TOUCH) return renderer.domElement.requestPointerLock();
  // No pointer lock on phones: just hide the menu. Fullscreen + landscape where the browser allows it (not iPhone Safari).
  ac.resume();
  $('start').classList.add('hidden');
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen().then(() => screen.orientation.lock('landscape')).catch(() => {});
  }
};
$('playBtn').onclick = lock;
if (TOUCH) { $('playBtn').textContent = 'TAP TO PLAY'; $('shopClose').textContent = 'Back to the fight'; }
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (!locked) firing = zoom = false;
  $('start').classList.toggle('hidden', locked || inShop);
});

// ---------- Touch controls ----------
// Left side of the screen: a joystick that appears under your thumb. Right side: drag to aim.
// A finger that starts on the fire button also aims, so you can track someone while shooting.
const stick = { id: null, x: 0, y: 0, dx: 0, dy: 0 }, STICK_R = 55;
if (TOUCH) {
  const looks = new Map();   // touch id -> last [x, y]
  let fireId = null, jumpId = null;
  const inMenu = (e) => !!e.target.closest('.overlay');   // menus and the shop keep normal taps and scrolling
  const opts = { passive: false };
  document.addEventListener('touchstart', (e) => {
    if (inMenu(e)) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const btn = t.target.closest('.tb'), slot = t.target.closest('#weapons div'), em = t.target.closest('[data-e]'), id = t.identifier;
      if (em) { startEmote(+em.dataset.e); toggleWheel(false); }
      else if (slot) {
        const s = slot.dataset.s;
        if (s === 'shop') toggleShop(); else if (s === 'bomb') throwBomb(); else if (s === 'emote') toggleWheel(); else setWeapon(+s);
      } else if (btn && btn.dataset.tb === 'act') interact();
      else if (btn && btn.dataset.tb === 'jump') { keys.Space = true; jumpId = id; btn.classList.add('down'); if (zipping) socket.emit('zip'); }
      else if (btn && btn.dataset.tb === 'scope') { zoom = !zoom; btn.classList.toggle('down', zoom); }
      else if (btn) { firing = true; fireId = id; btn.classList.add('down'); looks.set(id, [t.clientX, t.clientY]); }
      else if (stick.id === null && t.clientX < innerWidth * 0.4) {
        Object.assign(stick, { id, x: t.clientX, y: t.clientY, dx: 0, dy: 0 });
        $('joy').style.left = t.clientX + 'px'; $('joy').style.top = t.clientY + 'px';
        $('joyKnob').style.transform = ''; $('joy').classList.add('on');
      } else looks.set(id, [t.clientX, t.clientY]);
    }
  }, opts);
  document.addEventListener('touchmove', (e) => {
    if (inMenu(e)) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const last = looks.get(t.identifier);
      if (t.identifier === stick.id) {
        let dx = (t.clientX - stick.x) / STICK_R, dy = (t.clientY - stick.y) / STICK_R;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        stick.dx = dx; stick.dy = dy;
        $('joyKnob').style.transform = `translate(${dx * STICK_R}px, ${dy * STICK_R}px)`;
      } else if (last) {
        const sens = 0.0075 * (camera.fov / 75);   // playtest: 0.0055 felt a bit slow
        yaw -= (t.clientX - last[0]) * sens;
        pitch = Math.max(-1.5, Math.min(1.5, pitch - (t.clientY - last[1]) * sens));
        last[0] = t.clientX; last[1] = t.clientY;
        lastLook = performance.now();
      }
    }
  }, opts);
  const end = (e) => {
    for (const t of e.changedTouches) {
      const id = t.identifier;
      looks.delete(id);
      if (id === stick.id) { stick.id = null; stick.dx = stick.dy = 0; $('joy').classList.remove('on'); }
      if (id === fireId) { fireId = null; firing = false; $('tbFire').classList.remove('down'); }
      if (id === jumpId) { jumpId = null; keys.Space = false; $('tbJump').classList.remove('down'); }
    }
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
  document.addEventListener('gesturestart', (e) => e.preventDefault());   // iOS pinch zoom
}

function setWeapon(w) {
  if (w >= SLOTS) return;
  if (!owned[w]) { popup(`🔒 Buy the ${S.WEAPONS[w].name} in the shop [B]`); SFX.nope(); return; }
  if (TOUCH) { zoom = false; $('tbScope').classList.remove('down'); $('tbScope').classList.toggle('hidden', !S.WEAPONS[w].scope); }
  if (w !== weapon) socket.emit('equip', w);   // the server needs to know: the tray only works with one-handed food
  weapon = w;
  views.forEach((v, i) => v.visible = i === w);
  renderWeapons();
}
function renderWeapons() {
  const F = S.WEAPONS[S.FLASH];
  $('weapons').innerHTML = S.WEAPONS.slice(0, SLOTS).map((W, i) =>
    `<div data-s="${i}" class="${i === weapon ? 'on' : ''} ${owned[i] ? '' : 'lock'}">${TOUCH ? '' : i + 1 + ' '}${W.icon}${dmgLv[i] ? '⭐' + dmgLv[i] : ''}</div>`).join('') +
    `<div data-s="bomb" class="${ammo ? '' : 'lock'}">${TOUCH ? '' : 'G '}${F.icon}×${ammo}</div>` + (TOUCH ? '<div data-s="emote">💃</div><div data-s="shop">🛒</div>' : '');
  $('weaponName').textContent = S.WEAPONS[weapon].name + (dmgLv[weapon] ? ` (+${Math.round(dmgLv[weapon] * S.DMG_STEP * 100)}% damage)` : '');
}
// Our position goes to the server 20 times a second, and right before every shot. Socket.io keeps messages in order,
// so the server moves us (with its usual speed and wall checks) and then fires from exactly where we stood.
// Without the extra send, a strafing player's shots started up to 50ms of movement (0.4m) to the side.
// While dancing we face where we started dancing, not where the orbit camera points.
function sendPos() {
  lastSend = performance.now();
  socket.emit('pos', [me.x, me.y, me.z, myEmote ? myEmote.yaw0 : yaw].map(n => Math.round(n * 100) / 100));
}
function throwBomb() {
  const now = performance.now();
  if (!alive || inShop || phase === 'ended' || now - lastBomb < S.WEAPONS[S.FLASH].cd * 1000) return;
  if (mySeat && mySeat.i === 0) return;
  if (!ammo) { popup('🍦 Out of cream bombs! Buy more [B]'); SFX.nope(); return; }
  stopEmote();
  lastBomb = now;
  camera.getWorldDirection(fwd);
  sendPos();
  socket.emit('fire', { w: S.FLASH, d: fwd.toArray() });
  SFX.spray();
}

// ---------- Emotes ----------
function toggleWheel(open = !wheelOpen) {
  wheelOpen = open && alive && !mySeat && !zipping;
  $('emoteWheel').classList.toggle('hidden', !wheelOpen);
}
$('emoteWheel').innerHTML = '<div class="ewTitle">💃 Emotes</div>' + S.EMOTES.map((E, i) => `<div data-e="${i}">${TOUCH ? '' : `<b>${i + 1}</b> `}${E.icon} ${E.name}</div>`).join('') +
  (TOUCH ? '' : '<div class="ewHint">Press 1-4 (T to close). Move to stop dancing.</div>');
$('emoteWheel').onclick = (e) => { const d = e.target.closest('[data-e]'); if (d) { startEmote(+d.dataset.e); toggleWheel(false); } };
function startEmote(n) {
  if (!alive || mySeat || zipping || inShop) return;
  stopEmote(true);
  audio();
  const yaw0 = yaw;
  myEmote = { n, t0: clock.elapsedTime, yaw0, music: playEmote(n, 0.9, true) };
  yaw = yaw0 + Math.PI; pitch = -0.15;   // swing the camera around to watch yourself
  meAv.emote = n + 1; meAv.emoteT = clock.elapsedTime;
  socket.emit('emote', n);
  sendPos();
}
function stopEmote(silent) {
  if (!myEmote) return;
  if (myEmote.music) myEmote.music.stop();
  yaw = myEmote.yaw0; pitch = 0;
  myEmote = null; meAv.emote = 0;
  if (!silent) socket.emit('emote', -1);
}

// ---------- Vehicles & ziplines: what's in reach? ----------
function nearZip() {
  const hy = me.y + 2.2;
  let best = null, bd = S.ZIP_REACH - 0.2;   // a little stricter than the server, so the prompt never lies
  S.ZIPLINES.forEach((L, i) => {
    const t = S.zipClosest(L, me.x, hy, me.z), c = S.zipPoint(L, t), d = Math.hypot(c[0] - me.x, c[1] - hy, c[2] - me.z);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function nearVehicle() {
  if (me.y > 2.5) return null;
  let best = null, bd = S.ENTER_R - 0.2;
  for (const [id, v] of vehs) {
    const d = S.vehDist(v.type, v.g.position.x, v.g.position.z, v.g.rotation.y, me.x, me.z);
    if (!v.dead && d < bd && v.seats.includes(0)) { bd = d; best = id; }
  }
  return best;
}
function updatePrompt() {
  prompt = null;
  if (!alive || inShop) {}
  else if (mySeat) { if (TOUCH) prompt = { icon: '🚪', text: '[E] Get out' }; }   // the car panel already says so on laptops
  else if (zipping) prompt = { icon: '🪂', text: '[E] or [Space] Let go (careful, falls still stain!)' };
  else {
    const z = nearZip(), v = z === null ? nearVehicle() : null;
    if (z !== null) prompt = { icon: '🚡', text: '[E] Ride the zipline' };
    else if (v !== null) { const w = vehs.get(v); prompt = { icon: '🚗', text: `[E] ${w.seats[0] ? 'Ride in' : 'Drive'} the ${S.VEHICLE_TYPES[w.type].name}` }; }
  }
  $('prompt').classList.toggle('hidden', !prompt);
  if (prompt) $('prompt').textContent = TOUCH ? prompt.text.replace(/\[E\]( or \[Space\])? /, '') : prompt.text;
  if (TOUCH) { $('tbAct').classList.toggle('hidden', !prompt); if (prompt) $('tbActIcon').textContent = prompt.icon; }
}
setInterval(updatePrompt, 120);
function interact() {
  if (!alive || inShop) return;
  if (mySeat) return socket.emit('seat');
  if (zipping) return socket.emit('zip');
  stopEmote();
  if (nearZip() !== null) { sendPos(); socket.emit('zip'); }
  else if (nearVehicle() !== null) { sendPos(); socket.emit('seat'); SFX.door(); }
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
      <span class="nm"><b>${W.name}</b><br><small>${W.desc}${W.pack ? ` · have ${ammo}/${W.maxAmmo} · ${TOUCH ? 'tap it in the bottom bar to throw' : 'throw with G'}` : ''}</small>${levelLine(W, i)}</span>${right}</div>`;
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
  if (inShop) { stopEmote(); toggleWheel(false); renderShop(); if (!TOUCH) document.exitPointerLock(); } else lock();
}
$('shopClose').onclick = toggleShop;

// ---------- Thanksgiving theme ----------
// Switched on for the boss fight (and its results): warm sky, autumn town, harvest outfits, falling leaves.
function setTheme(on) {
  if (on === thanks) return;
  thanks = on;
  document.body.classList.toggle('thanks', on);
  const sky = on ? FALL_SKY : SKY;
  scene.background.setHex(sky); scene.fog.color.setHex(sky);
  hemi.color.setHex(on ? 0xffe0b0 : 0xffffff);
  world.g.attributes.color.array.set(on ? world.fall : world.col); world.g.attributes.color.needsUpdate = true;
  for (const [m, c] of themed) m.color.copy(on ? autumnColor(c) : new THREE.Color(c));
  leaves.visible = on;
  for (const a of [...avatars.values(), meAv]) { a.tier = -1; a.hp = -1; }   // re-dress everyone on the next snapshot
}

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
function updateVehHud() {
  const v = mySeat && vehs.get(mySeat.v);
  $('vehHud').classList.toggle('hidden', !v);
  if (!v) return;
  const T = S.VEHICLE_TYPES[v.type], { x, z } = v.g.position, gas = x > S.GAS.x0 && x < S.GAS.x1 && z > S.GAS.z0 && z < S.GAS.z1;
  $('vehName').textContent = `${mySeat.i === 0 ? '🚗 Driving' : '🪑 Riding in'} the ${T.name} · ${Math.round(Math.abs(v.speed) * 3.6)} km/h`;
  $('vehHp').style.width = Math.max(0, v.hp / T.hp * 100) + '%';
  $('vehFuel').style.width = v.fuel / S.FUEL_MAX * 100 + '%';
  $('vehMsg').textContent = gas && v.fuel < S.FUEL_MAX ? '⛽ Filling up...' : v.fuel <= 0 ? '⛽ OUT OF GAS! You\'re stuck. Hop out (it gets towed home)'
    : v.fuel < 25 ? '⛽ Low on gas! Gobble Gas is just north of the Town Square'
    : mySeat.i === 0 ? (TOUCH ? 'Left thumb: gas and steer' : 'W/S gas & reverse · A/D steer · Space brake · H honk · E get out') : (TOUCH ? 'Shoot from the car!' : 'Click to shoot from the car · E get out');
}
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function updateClock() {
  phaseLeft = Math.max(0, phaseLeft - 250);
  const soon = nextPh === 'team' ? '🦉 Owl Showdown in ' : nextPh === 'boss' ? '🦃 Turkey Boss in ' : '⏱️ Game ends in ';
  const label = { free: 'Free play', ffa: soon + mmss(phaseLeft), team: (nextPh === 'boss' ? '🦉 Owl Showdown (turkey next): ' : '🦉 Owl Showdown: ') + mmss(phaseLeft),
    boss: '🦃 Stain the turkey before time runs out! ' + mmss(phaseLeft), ended: '🏁 Game over' };
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
    $(`team${i + 1}List`).replaceChildren(...shown.map(r => li(`${r[1]} — ${r[8]} pts`, r[0] === myId)));
  });
  const a = S.TEAMS[0], b = S.TEAMS[1];
  $('teamScore').innerHTML = `<span style="color:${a.css}">${scores[0]}</span> : <span style="color:${b.css}">${scores[1]}</span>`;
}
const li = (text, mine) => { const e = document.createElement('li'); e.textContent = text; if (mine) e.className = 'me'; return e; };

// Results. The boss fight gets its own Thanksgiving screen: a feast and confetti for a win, a sad turkey-less table for a loss.
function renderResults(r) {
  const body = $('resultsBody');
  body.replaceChildren();
  const line = (label, entry, big) => { if (!entry) return; const p = document.createElement('p'); p.textContent = `${label}: ${entry[0]} (${entry[1]})`; if (big) p.style.fontSize = '22px'; body.append(p); };
  const text = (t, size) => { const p = document.createElement('p'); p.textContent = t; if (size) p.style.fontSize = size; body.append(p); return p; };
  $('results').classList.toggle('feast', !!(r.boss && r.boss.won));
  $('confetti').replaceChildren();
  if (r.boss) {
    const B = r.boss;
    if (B.won) {
      $('resultsHead').textContent = '🦃 TURKEY DEFEATED! 🦃';
      text('🥧 Happy Thanksgiving, Stain Warriors! 🌽', '26px');
      text(`You stained ${S.BOSS.name} in ${mmss(B.secs * 1000)}. Pass the gravy, heroes!`);
      for (let i = 0; i < 40; i++) {   // falling feast
        const s = document.createElement('span');
        s.textContent = ['🍂', '🥧', '🌽', '🦃', '🍁', '🥔', '🍗', '🎉'][i % 8];
        s.style.left = Math.random() * 100 + 'vw'; s.style.animationDelay = Math.random() * 4 + 's'; s.style.fontSize = 22 + Math.random() * 26 + 'px';
        $('confetti').append(s);
      }
    } else {
      $('resultsHead').textContent = '🦃 The turkey got away!';
      text(`${S.BOSS.name} escaped with ${B.hpLeft} of ${B.max} HP left. Thanksgiving dinner is... tofurky. 😬`, '20px');
      text('Next time: hit the head for double damage, and jump when it stomps!');
    }
    B.top.forEach((e, i) => line(['🥇 Top turkey stainer', '🥈 2nd', '🥉 3rd'][i], e, i === 0));
  } else if (r.winner === null) $('resultsHead').textContent = '🏁 Time!';
  else $('resultsHead').textContent = r.winner < 0 ? '🤝 It\'s a tie!' : `🏆 ${S.TEAMS[r.winner].name} win!`;
  if (r.winner !== null && r.winner !== undefined) {
    if (r.boss) text(r.winner < 0 ? '🦉 Owl Showdown: a tie' : `🦉 Owl Showdown: ${S.TEAMS[r.winner].name} won`);
    S.TEAMS.forEach((T, i) => { const p = text(`${T.name}: ${r.scores[i]}`, r.boss ? '' : '24px'); p.style.color = T.css; p.style.fontWeight = 'bold'; });
    S.TEAMS.forEach((T, i) => line(`${T.owl} MVP (points)`, r.mvp[i]));
  }
  r.top.forEach((e, i) => line(['🥇 Most stains', '🥈 2nd', '🥉 3rd'][i], e));
}
let popTimer;
function popup(text, ms = 1500) {
  if (TOUCH) text = text.replace(' [B]', ' 🛒');
  $('popup').textContent = text; $('popup').style.opacity = 1;
  clearTimeout(popTimer); popTimer = setTimeout(() => $('popup').style.opacity = 0, ms);
}
function flash(color) {
  const f = $('flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = 0.45;
  requestAnimationFrame(() => { f.style.transition = 'opacity 0.4s'; f.style.opacity = 0; });
}

// ---------- Minimap ----------
// Streets, buildings, gas, ziplines, cars, the turkey and you. Other players only show up when they're on your side.
const MM = $('minimap'), mmc = MM.getContext('2d'), MS = MM.width / (S.ARENA * 2), mmBase = document.createElement('canvas');
const mx = (x) => (x + S.ARENA) * MS;
function drawMinimapBase() {
  mmBase.width = mmBase.height = MM.width;
  const c = mmBase.getContext('2d');
  c.fillStyle = thanks ? '#c98b3a' : '#8fd16a'; c.fillRect(0, 0, MM.width, MM.height);
  c.fillStyle = '#44474f';
  for (const s of S.STREETS) { c.fillRect(mx(s - S.STREET_W / 2), 0, S.STREET_W * MS, MM.height); c.fillRect(0, mx(s - S.STREET_W / 2), MM.width, S.STREET_W * MS); }
  c.fillStyle = '#d9a06b'; c.fillRect(mx(-21), mx(-21), 42 * MS, 42 * MS);
  for (const B of S.BUILDINGS) { c.fillStyle = hex(thanks ? autumnColor(B.name === 'LOOKOUT' ? 0x7b6d8d : 0xff6b6b).getHex() : 0xeeeeee); c.fillRect(mx(B.x - B.w / 2), mx(B.z - B.d / 2), B.w * MS, B.d * MS); }
  c.strokeStyle = '#ffb703'; c.lineWidth = 1.5;
  for (const L of S.ZIPLINES) { c.beginPath(); c.moveTo(mx(L.a[0]), mx(L.a[2])); c.lineTo(mx(L.b[0]), mx(L.b[2])); c.stroke(); }
  c.font = '14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('⛽', mx(0), mx((S.GAS.z0 + S.GAS.z1) / 2));
}
function drawMinimap() {
  if (TOUCH) return;
  mmc.drawImage(mmBase, 0, 0);
  mmc.textAlign = 'center'; mmc.textBaseline = 'middle';
  for (const v of vehs.values()) {
    if (v.dead) continue;
    mmc.save(); mmc.translate(mx(v.g.position.x), mx(v.g.position.z)); mmc.rotate(-v.g.rotation.y);
    mmc.fillStyle = v.fuel <= 0 ? '#888' : hex(S.VEHICLE_TYPES[v.type].color); mmc.strokeStyle = '#000';
    mmc.fillRect(-3, -5, 6, 10); mmc.strokeRect(-3, -5, 6, 10); mmc.restore();
  }
  if (turkey.g.visible) { mmc.font = '18px sans-serif'; mmc.fillText('🦃', mx(turkey.g.position.x), mx(turkey.g.position.z)); }
  if (myTeam || phase === 'boss') for (const [id, a] of avatars) {   // teammates only: no wallhack from the minimap
    if (!a.g.visible || (phase !== 'boss' && a.team !== myTeam)) continue;
    mmc.fillStyle = myTeam ? S.TEAMS[myTeam - 1].css : '#fff'; mmc.fillRect(mx(a.g.position.x) - 1.5, mx(a.g.position.z) - 1.5, 3, 3);
  }
  mmc.save(); mmc.translate(mx(me.x), mx(me.z)); mmc.rotate(-yaw);
  mmc.fillStyle = '#ffe600'; mmc.strokeStyle = '#000'; mmc.beginPath(); mmc.moveTo(0, -7); mmc.lineTo(5, 5); mmc.lineTo(-5, 5); mmc.closePath(); mmc.fill(); mmc.stroke();
  mmc.restore();
}
drawMinimapBase();
setInterval(drawMinimap, 100);

// ---------- Network ----------
socket.on('welcome', (m) => { myId = m.id; myName = m.name; Object.assign(me, m.spawn); $('myName').textContent = m.name; meAv.id = m.id; });
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
// The server moved us: a rejected move, getting out of a car, or getting run over.
socket.on('setpos', (p) => { Object.assign(me, p, { vy: 0 }); if (mySeat) { mySeat = null; leftSeat(); } });
socket.on('full', () => alert('Stain Wars is full right now. Try again in a bit!'));
socket.on('respawn', (p) => {
  Object.assign(me, p, { vy: 0 }); alive = true; hp = 100; blindLeft = 0; zipping = null; if (mySeat) { mySeat = null; leftSeat(); }
  if (whir) { whir.stop(); whir = null; }
  $('dead').classList.add('hidden'); updateHud(); SFX.whistle();
});
socket.on('blind', (secs) => { blindLeft = Math.max(blindLeft, Math.min(5, +secs || 0)); SFX.poof(); });
socket.on('zip', (z) => { zipping = { i: z.i, t: z.t, dir: z.dir }; stopEmote(); whir = whir || loopSound('whir'); });
socket.on('unzip', (p) => { Object.assign(me, p, { vy: 0, onGround: false, usedAir: false }); zipping = null; if (whir) { whir.stop(); whir = null; } });
socket.on('boss', (m) => {
  const d = Math.hypot(turkey.g.position.x - me.x, turkey.g.position.z - me.z), v = Math.max(0.25, 1 - d / 150);
  if (m.a === 'stomp') { SFX.windup(); if (d < S.BOSS.stompR + 6) popup('🍗 STOMP INCOMING! JUMP! ⬆️', 900); }
  if (m.a === 'slam') { SFX.slam(v); turkey.slamAt = clock.elapsedTime; splat([turkey.g.position.x, 0, turkey.g.position.z], 11, true); }
  if (m.a === 'seek') { SFX.gobble(v); turkey.gobbleAt = clock.elapsedTime; if (d < S.BOSS.seekR + 6) popup('🎃 PUMPKINS ARE CHASING YOU! RUN! 🏃', 1500); }
  if (m.a === 'gobble') { SFX.gobble(v); turkey.gobbleAt = clock.elapsedTime; }
});
socket.on('vboom', (m) => {
  splat(m.p, 3, true); SFX.boom(Math.max(0.2, 1 - Math.hypot(m.p[0] - me.x, m.p[2] - me.z) / 80));
  const v = vehs.get(m.id), div = document.createElement('div');
  div.textContent = `💥 ${m.by} washed out a ${v ? S.VEHICLE_TYPES[v.type].name : 'car'}`;
  $('killfeed').prepend(div); setTimeout(() => div.remove(), 5000);
});
function enteredSeat() {
  stopEmote(); toggleWheel(false);
  pitch = -0.25;
  if (mySeat.i === 0) { engine = engine || loopSound('engine'); popup(TOUCH ? '🚗 Left thumb drives!' : '🚗 W/S gas · A/D steer · E get out'); }
  else popup(TOUCH ? '🪑 Shotgun! Aim and fire from the car' : '🪑 You\'re riding! Click to shoot · E get out');
}
function leftSeat() { if (engine) { engine.stop(); engine = null; } pitch = 0; }
socket.on('snap', (m) => {
  // Homing shots: the server steers them, so take its position and velocity. One missing from the list has given up and falls.
  if (m.s) {
    const live = new Set();
    for (const [id, x, y, z, vx, vy, vz] of m.s) { const s = shots.get(id); if (s) { live.add(id); s.m.position.set(x, y, z); s.v.set(vx, vy, vz); } }
    for (const [id, s] of shots) if (S.W(s.w).seek && !live.has(id)) s.fall = true;
  }
  const seen = new Set(), seated = new Map(), now = clock.elapsedTime;
  for (const [id, x, z, ry, vh, fuel, dead, speed, ...seats] of m.v) {
    const v = vehs.get(id);
    if (v.first || (v.dead && !dead)) { v.g.position.set(x, 0, z); v.g.rotation.y = ry; v.first = false; }   // just (re)spawned: no sliding in from afar
    v.target.set(x, 0, z); v.ry = ry; v.hp = vh; v.fuel = fuel; v.dead = dead; v.speed = speed; v.seats = seats;
    v.g.visible = !dead;
    seats.forEach((pid, i) => pid && seated.set(pid, { v: id, i }));
    drawVehTag(v);
  }
  const was = mySeat, mine = seated.get(myId);
  if (mine && (!was || was.v !== mine.v || was.i !== mine.i)) { mySeat = mine; enteredSeat(); }
  else if (!mine && was) { mySeat = null; leftSeat(); }
  for (const [id, x, y, z, ry, t, h, dead, tray, emo, zip] of m.p) {
    seen.add(id);
    if (id === myId) { if (!dead) hp = h; continue; }
    let a = avatars.get(id);
    if (!a) { a = makeAvatar(); a.id = id; a.g.position.set(x, y, z); avatars.set(id, a); }
    a.target.set(x, y, z); a.ry = ry; a.g.visible = !dead; a.tray.visible = !!tray; a.seat = seated.get(id); a.zip = zip;
    if (a.emote !== emo) {   // started or stopped dancing: their music plays near you
      if (a.music) { a.music.stop(); a.music = null; remoteMusic--; }
      a.emote = emo; a.emoteT = now;
      const d = Math.hypot(x - me.x, z - me.z);
      if (emo && d < 30 && remoteMusic < 3) { a.music = playEmote(emo - 1, 0.6 * (1 - d / 30)); if (a.music) remoteMusic++; }
    }
    const inf = info.get(id), nm = inf ? inf.name : '', team = inf ? inf.team : 0;
    a.sizeTarget = inf ? inf.scale : 1;
    if (a.team !== team) { setForm(a, team); a.hp = -1; }
    if (a.tier !== t) { a.tier = t; setOutfit(a, t); a.hp = -1; }
    if (a.hp !== h || a.name !== nm) { a.hp = h; a.name = nm; drawTag(a); }
  }
  for (const [id, a] of avatars) if (!seen.has(id)) { if (a.music) { a.music.stop(); remoteMusic--; } scene.remove(a.g); avatars.delete(id); }
  if (m.b) {
    const [x, z, ry, bhp, max, stomp] = m.b;
    if (!turkey.g.visible) turkey.g.position.set(x, 0, z);
    turkey.target.set(x, 0, z); turkey.ry = ry; turkey.hp = bhp; turkey.max = max; turkey.stomp = stomp;
    $('bossHp').style.width = Math.max(0, bhp / max * 100) + '%';
    $('bossHpText').textContent = `${Math.ceil(bhp)} / ${max}`;
  }
  turkey.g.visible = !!m.b;
  $('bossBar').classList.toggle('hidden', !m.b);
  updateHud(); updateVehHud();
});
socket.on('board', (m) => {
  const { list } = m, wasPhase = phase, wasLeft = phaseLeft;
  phase = m.phase; phaseLeft = m.left; nextPh = m.next; scores = m.scores; lastResults = m.results;
  setTheme(phase === 'boss' || (phase === 'ended' && !!(m.results && m.results.boss)));
  if (thanks !== mmBase.thanks) { mmBase.thanks = thanks; drawMinimapBase(); }
  info.clear();
  for (const r of list) info.set(r[0], { name: r[1], team: r[6], scale: r[7] });
  const mine = info.get(myId), wasTeam = myTeam;
  myTeam = mine ? mine.team : 0; myScale = me.scale = mine ? mine.scale : 1;   // me.scale: big owls collide bigger
  if (myTeam && myTeam !== wasTeam) { popup(`🦉 You're a ${S.TEAMS[myTeam - 1].owl}!`); SFX.hoot(); }
  else if (phase === 'boss' && wasPhase !== 'boss') { popup('🦃 GOBBLE GOBBLE! Everyone vs. the turkey!', 3000); SFX.gobble(); }
  else if (phase === 'ffa' && wasPhase !== 'ffa') { popup('🍔 New game! Go!'); SFX.whistle(); }
  else if ((phase === 'ffa' || phase === 'team') && nextPh && wasLeft > 60000 && phaseLeft <= 60000) {
    if (nextPh === 'team') { popup('🦉 Owl Showdown in 1 minute!'); SFX.hoot(); } else { popup('🦃 The turkey arrives in 1 minute!'); SFX.gobble(); }
  }
  if (phase === 'ended' && wasPhase !== 'ended') { firing = false; if (m.results && m.results.boss && m.results.boss.won) SFX.fanfare(); else SFX.kazoo(); }
  const showTeams = list.some(r => r[6]);
  $('teamBoards').classList.toggle('hidden', !showTeams);
  $('teamScore').classList.toggle('hidden', !showTeams);
  $('board').classList.toggle('hidden', showTeams);
  $('results').classList.toggle('hidden', !(phase === 'ended' && m.results));
  if (phase === 'ended' && m.results && !resultsShown) { renderResults(m.results); resultsShown = true; }   // once, also for late joiners
  if (phase !== 'ended') resultsShown = false;
  if (showTeams) renderTeams(list);
  updateClock(); updateHud();
  // In the boss fight the leaderboard ranks damage to the turkey.
  const bossy = phase === 'boss';
  $('boardTitle').textContent = bossy ? '🦃 Turkey Stainers' : '🏆 Leaderboard';
  list.sort(bossy ? (a, b) => b[9] - a[9] : (a, b) => b[3] - a[3] || b[2] - a[2]);
  $('boardList').replaceChildren(...list.slice(0, 10).map(([id, n, t, k, mo, , , , , bd]) => {
    const e = li(bossy ? ` ${n} — 🦃 ${bd}` : ` ${n} — ${k} 🎯 $${mo}`, id === myId);
    e.insertAdjacentHTML('afterbegin', swatches(S.OUTFITS[t]).split('</span>')[0] + '</span>');
    return e;
  }));
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
  if (d > 2.5 && d < 45 && now - lastRemoteSfx > 40) { lastRemoteSfx = now; (fireSfx[s.w] || SFX.lob)(0.6 * (1 - d / 45)); }
});
socket.on('pop', (p) => {
  const s = shots.get(p.id);
  if (s) { scene.remove(s.m); shots.delete(p.id); }
  splat(p.p, p.w);
  const W = S.W(p.w), v = 1 - Math.hypot(p.p[0] - me.x, p.p[1] - me.y, p.p[2] - me.z) / 40;
  if (v > 0 && ((p.w !== 0 && !W.pellets) || Math.random() < 0.25)) W.blind ? SFX.poof(v) : SFX.splat(v, !!W.splash);
});
// Shotgun pellets arrive together; only make one noise per burst.
let lastOuch = 0, lastHit = 0;
socket.on('ouch', (m) => {
  hp = m.hp; flash(hex(S.W(m.w).color)); updateHud();
  if (TOUCH && navigator.vibrate) navigator.vibrate(30);
  if (m.head) SFX.bonk(); else if (performance.now() - lastOuch > 80) { lastOuch = performance.now(); SFX.oof(); }
});
socket.on('trayhit', (m) => {
  if (m.broke) { SFX.crash(); popup(`${S.TRAY.icon} Tray smashed! Back in ${S.TRAY.respawnMs / 1000}s`); } else SFX.clang();
});
socket.on('hitmark', (m) => {
  const h = $('hitmark'); h.style.color = m && m.tray ? '#7ff' : m && (m.boss || m.veh) ? '#fa0' : ''; h.style.opacity = 1; setTimeout(() => h.style.opacity = 0, 120);
  if (m && m.tray) { if (m.broke) { SFX.crash(); popup(`${S.TRAY.icon} You smashed their tray!`); } else if (performance.now() - lastHit > 80) { lastHit = performance.now(); SFX.clang(); } }
  else if (m && m.head) { SFX.bonk(); if (!m.boss) popup('🎯 BONK! HEADSHOT!'); }
  else if (performance.now() - lastHit > 80) { lastHit = performance.now(); m && m.veh ? SFX.clang() : SFX.hit(); }
});
socket.on('kill', (k) => {
  const div = document.createElement('div');
  const W = S.W(k.w);   // no weapon means a fatal fall
  div.textContent = W ? `${k.k} ${W.icon}${k.head ? '🎯' : ''} ${k.v}${k.pts ? ` +${k.pts} pts` : ''}` : `🪂 ${k.v} fell too far`;
  $('killfeed').prepend(div); setTimeout(() => div.remove(), 5000);
  if (k.k === myName && k.v !== myName) { popup(k.pts ? `🎉 You stained ${k.v}! +${k.pts} pts` : `🎉 You stained ${k.v}!`); SFX.kazoo(); }
  if (k.v === myName) {
    alive = false; firing = false; stopEmote(true); toggleWheel(false); SFX.trombone();
    $('deadMsg').textContent = W ? `${k.k} got you with the ${W.name}${k.head ? ' (HEADSHOT!)' : ''}! Your outfit and food are safe. Respawning...`
      : 'SPLAT! You dropped more than 5 times your height. Your outfit and food are safe. Respawning...';
    $('dead').classList.remove('hidden');
  }
});

// ---------- Loop ----------
const clock = new THREE.Clock();
let lastDrive = 0;
const camDir = new THREE.Vector3(), camTarget = new THREE.Vector3();
// Third-person orbit camera (driving, dancing). Pulled in if a wall is in the way.
function orbit(tx, ty, tz, dist) {
  pitch = Math.max(-1.1, Math.min(0.4, pitch));
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.getWorldDirection(camDir);
  let d = 0.5;
  for (; d < dist; d += 0.5) if (S.inBox(tx - camDir.x * d, ty - camDir.y * d, tz - camDir.z * d)) { d -= 0.6; break; }
  camera.position.set(tx - camDir.x * d, Math.max(0.4, ty - camDir.y * d), tz - camDir.z * d);
}
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime, now = performance.now();
  const veh = mySeat && vehs.get(mySeat.v), driving = !!(veh && mySeat.i === 0);
  const moveF = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - stick.dy, moveR = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + stick.dx;

  // Moving, jumping or getting hit out of it ends a dance; so does the song ending.
  if (myEmote && (Math.abs(moveF) + Math.abs(moveR) > 0.2 || keys.Space || !alive || t - myEmote.t0 > S.EMOTE_MS / 1000)) stopEmote();

  if (veh) {   // ride along with the car we're drawing (the server moves it)
    [me.x, me.z] = seatWorld(veh, mySeat.i); me.y = S.SEAT_Y; me.vy = 0;
    if (driving && now - lastDrive > 50) {
      lastDrive = now;
      const brake = keys.Space ? (veh.speed > 0.5 ? -1 : veh.speed < -0.5 ? 1 : 0) : null;
      socket.emit('drive', [brake ?? Math.max(-1, Math.min(1, moveF)), Math.max(-1, Math.min(1, moveR))].map(n => Math.round(n * 100) / 100));
    }
    if (engine) engine.set(45 + Math.abs(veh.speed) * 5, veh.fuel > 0 ? 0.035 : 0.005);
  } else if (zipping) {   // same math as the server, so we arrive where it puts us
    const L = S.ZIPLINES[zipping.i];
    zipping.t = Math.max(0, Math.min(1, zipping.t + zipping.dir * S.ZIP_SPEED * dt / L.len));
    const c = S.zipPoint(L, zipping.t);
    me.x = c[0]; me.y = c[1] - S.ZIP_HANG; me.z = c[2]; me.vy = 0; me.onGround = false;
    if (whir) whir.set(900 + zipping.t * 300, 0.04);
  } else if (alive && !inShop && !myEmote) {
    let dx = -Math.sin(yaw) * moveF + Math.cos(yaw) * moveR, dz = -Math.cos(yaw) * moveF - Math.sin(yaw) * moveR;
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
  const third = driving || !!myEmote;
  if (driving) {
    if (now - lastLook > 900) yaw = lerpAng(yaw, veh.g.rotation.y, Math.min(1, dt * 2.5));   // the camera swings back behind the car
    orbit(veh.g.position.x, 2.2, veh.g.position.z, 9);
  } else if (myEmote) orbit(me.x, me.y + 1.3, me.z, 4.5);
  else {
    camera.position.set(me.x, viewY + S.eyeHeight(me.x, me.y, me.z, eyeScale), me.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  if (!driving && now - lastSend > 50) sendPos();   // drivers send 'drive' instead

  // Your own body, when the camera can see it.
  meAv.g.visible = third && alive;
  if (meAv.g.visible) {
    if (meAv.team !== myTeam) setForm(meAv, myTeam);
    if (meAv.tier !== tier) { meAv.tier = tier; setOutfit(meAv, tier); }
    meAv.g.position.set(me.x, me.y, me.z); meAv.g.rotation.y = driving ? veh.g.rotation.y : myEmote ? myEmote.yaw0 : yaw;
    meAv.g.scale.setScalar(myScale);
    pose(meAv, t, false, driving);
  }

  // shooting (not while driving or dancing; a click ends the dance)
  const W = S.WEAPONS[weapon];
  if (firing && myEmote) stopEmote();
  if (firing && alive && !driving && !myEmote && phase !== 'ended' && now - lastFire > W.cd * 1000) {
    lastFire = now;
    camera.getWorldDirection(fwd);
    sendPos();   // the server fires from its copy of us, so bring it up to date first (same origin on both sides)
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
  const scoped = !!(zoom && W.scope && alive && !third);   // must be a real boolean: classList.toggle('on', undefined) flips every frame
  camera.fov += ((scoped ? 18 : 75) - camera.fov) * 0.25;
  camera.updateProjectionMatrix();
  $('scope').classList.toggle('on', scoped && camera.fov < 30);
  v.visible = !(scoped && camera.fov < 30) && !third;
  $('crosshair').style.opacity = scoped || third ? 0 : 1;
  trayView.visible = hasTray && trayHp > 0 && !W.twoHanded && alive && !third;

  // cars: glide to the server's position, spin the wheels, show the name/fuel tag when close
  for (const c of vehs.values()) {
    c.g.position.lerp(c.target, 0.25);
    c.g.rotation.y = lerpAng(c.g.rotation.y, c.ry, 0.25);
    for (const w of c.wheels) w.rotation.x -= c.speed * dt / 0.42;
    c.tag.visible = !(mySeat && mySeat.v === c.id) && Math.hypot(c.g.position.x - me.x, c.g.position.z - me.z) < 30;
  }
  // others: smooth + derpy animation (riders sit in the car we're drawing, so they don't lag behind it)
  for (const a of avatars.values()) {
    const moving = a.g.position.distanceToSquared(a.target) > 0.001;
    if (a.seat) { const c = vehs.get(a.seat.v), [x, z] = seatWorld(c, a.seat.i); a.g.position.set(x, S.SEAT_Y, z); }
    else a.g.position.lerp(a.target, 0.25);
    a.g.rotation.y = a.seat && a.seat.i === 0 ? vehs.get(a.seat.v).g.rotation.y : a.ry;
    a.size += (a.sizeTarget - a.size) * Math.min(1, dt * 3);
    a.g.scale.setScalar(a.size);
    const face = a.owl || a;
    face.pupils.forEach((p, i) => { p.position.x = face.eyes[i].position.x + Math.sin(t * 7 + a.phase + i * 2) * 0.05; });
    pose(a, t, moving && !a.seat, !!a.seat);
    const o = S.OUTFITS[a.tier];
    if (!a.owl && o && o.rainbow && !thanks) {
      const h = (t * o.rainbow * 0.3 + a.phase) % 1;
      a.shirt.color.setHSL(h, 1, 0.55); a.pants.color.setHSL((h + 0.33) % 1, 1, 0.5); a.hat.color.setHSL((h + 0.66) % 1, 1, 0.5);
      a.shirt.emissive.copy(a.shirt.color).multiplyScalar(o.glow * (0.6 + 0.4 * Math.sin(t * 6)));
    }
    if (a.disco && a.disco.visible) discoMat.emissive.setHSL((t * 0.8) % 1, 1, 0.5);
  }
  if (meAv.disco && meAv.disco.visible) discoMat.emissive.setHSL((t * 0.8) % 1, 1, 0.5);
  // the turkey: waddle, flap, gobble, and a big wind-up before the stomp
  if (turkey.g.visible) {
    const T = turkey, moving = T.g.position.distanceToSquared(T.target) > 0.0004;
    T.g.position.lerp(T.target, 0.2);
    T.g.rotation.y = lerpAng(T.g.rotation.y, T.ry, 0.2);
    const walk = moving ? Math.sin(t * 5) : 0, gob = t - T.gobbleAt < 0.6, slam = t - T.slamAt;
    T.legs[0].rotation.x = walk * 0.4; T.legs[1].rotation.x = -walk * 0.4;
    T.body.position.y = T.stomp ? Math.min(2, T.body.position.y + dt * 4) : slam < 0.3 ? 0 : Math.abs(walk) * 0.3;
    T.body.rotation.z = walk * 0.05;
    const flap = T.stomp ? 1.1 : gob ? 0.6 + Math.sin(t * 30) * 0.3 : 0.1 + Math.sin(t * 2) * 0.05;
    T.wings[0].rotation.z = -flap; T.wings[1].rotation.z = flap;
    T.neck.rotation.x = gob ? Math.sin(t * 25) * 0.25 : Math.sin(t * 3) * 0.05;
    T.wattle.rotation.z = Math.sin(t * (gob ? 30 : 4)) * 0.4;
    T.pupils.forEach((p, i) => { p.position.x = T.eyes[i].position.x + Math.sin(t * 6 + i * 2) * 0.12; });
    T.ring.visible = slam < 0.6;
    if (T.ring.visible) { T.ring.position.set(T.g.position.x, 0.15, T.g.position.z); T.ring.scale.setScalar(Math.max(0.01, S.BOSS.stompR * Math.min(1, slam / 0.35))); T.ring.material.opacity = 1 - slam / 0.6; }
  }
  // projectiles (visual only; server decides hits)
  for (const [id, s] of shots) {
    const SW_ = S.W(s.w);
    if (!SW_.seek || s.fall || s.t > SW_.seek) s.v.y -= SW_.grav * dt;
    s.m.position.addScaledVector(s.v, dt);
    if (s.w === 3 || s.w === 4 || s.w === 6 || s.w > 10) s.m.rotation.x += dt * 10;
    if ((s.t += dt) > SW_.life + 0.5) { scene.remove(s.m); shots.delete(id); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.v.y -= 20 * dt; p.m.position.addScaledVector(p.v, dt);
    if ((p.t -= dt) <= 0) { scene.remove(p.m); parts.splice(i, 1); }
  }
  // autumn leaves drift down around you
  if (leaves.visible) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    leafData.forEach((L, i) => {
      L.y -= dt * 1.6; if (L.y < 0) { L.y = 25; L.x = (Math.random() - 0.5) * 60; L.z = (Math.random() - 0.5) * 60; }
      p.set(camera.position.x + L.x + Math.sin(t + L.s) * 1.5, L.y, camera.position.z + L.z);
      leaves.setMatrixAt(i, m4.compose(p, q.setFromEuler(e.set(t * 2 + L.s, t + L.s, 0)), one));
    });
    leaves.instanceMatrix.needsUpdate = true;
  }
  // whipped cream blindness: solid white, fading out over the last second
  blindLeft = Math.max(0, blindLeft - dt);
  $('cream').style.opacity = Math.min(1, blindLeft);
  renderer.render(scene, camera);
}
setWeapon(0);
updateHud();
loop();
