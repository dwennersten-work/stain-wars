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
function bottle(color, cap) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.35, 8), mat(color)); g.add(b);
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 8), mat(cap)); t.position.y = 0.25; g.add(t);
  g.rotation.x = -Math.PI / 2; return g;
}
const projGeo = [new THREE.SphereGeometry(0.12, 6, 4), null, new THREE.SphereGeometry(0.1, 6, 4)];
function projMesh(w) {
  if (w === 1) return burgerMesh(0.8);
  const m = new THREE.Mesh(projGeo[w], mat(S.WEAPONS[w].color));
  if (w === 2) m.scale.set(1, 1, 4);
  return m;
}

const views = [bottle(0xffd400, 0xff3300), burgerMesh(0.5), (() => {
  const g = bottle(0xe0001b, 0xffffff); g.scale.set(1.2, 1.6, 1.2);
  const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), mat(0xe8b46a)); bun.position.set(0, 0.05, -0.12); g.add(bun);
  const dog = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.36, 4, 8), mat(0xb0391b)); dog.position.set(0, 0.05, -0.17); g.add(dog);
  return g; // ketchup sniper with hotdog scope
})()];
views.forEach(v => { v.position.set(0.35, -0.32, -0.9); v.rotation.y = 0.15; v.visible = false; camera.add(v); });

const shots = new Map();
const parts = [];
const decals = [];
const decalGeo = new THREE.CircleGeometry(1, 7);
const splatColors = [[0xffd400], [0x6b3a1e, 0x55aa22, 0xe23a2a, 0xffcc00], [0xe0001b]];

function splat(p, w) {
  const big = w === 1, cols = splatColors[w];
  for (let i = 0; i < (big ? 16 : 5); i++) {
    const m = new THREE.Mesh(projGeo[0], mat(cols[i % cols.length]));
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

// ---------- Sound (tiny) ----------
let ac;
function beep(f, dur = 0.08, type = 'square', vol = 0.05) {
  ac = ac || new AudioContext();
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = f; o.frequency.exponentialRampToValueAtTime(f * 0.4, ac.currentTime + dur);
  g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}

// ---------- Local player ----------
const me = { x: 0, y: 0, z: 0, vy: 0, onGround: true };
let myId = 0, myName = '', yaw = 0, pitch = 0, alive = true, hp = 100, tier = 0, money = 0, kills = 0;
let weapon = 0, firing = false, zoom = false, lastFire = 0, kick = 0, lastSend = 0, inShop = false;
const keys = {};

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyB') toggleShop();
  if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) setWeapon(+e.code.slice(5) - 1);
  if (e.code === 'KeyQ') setWeapon((weapon + 1) % 3);
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
const lock = () => { renderer.domElement.requestPointerLock(); ac = ac || new AudioContext(); };
$('playBtn').onclick = lock;
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (!locked) firing = zoom = false;
  $('start').classList.toggle('hidden', locked || inShop);
});

function setWeapon(w) {
  weapon = w;
  views.forEach((v, i) => v.visible = i === w);
  $('weapons').innerHTML = S.WEAPONS.map((W, i) => `<div class="${i === w ? 'on' : ''}">${i + 1} ${['💛', '🍔', '🌭'][i]} ${W.name}</div>`).join('');
}
setWeapon(0);

// ---------- Shop ----------
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const swatches = (o) => [o.shirt, o.pants, o.hat].map(c => `<span class="sw" style="background:${hex(c)}"></span>`).join('');
function renderShop() {
  $('shopMoney').textContent = `— $${money}`;
  $('shopList').innerHTML = S.OUTFITS.map((o, i) => `
    <div class="item ${i === tier ? 'cur' : ''}">${swatches(o)}
      <span class="nm"><b>${o.name}</b><br><small>Stain resistance ${Math.round(o.res * 100)}% · $${o.cost}</small></span>
      ${i === tier ? '<b>WEARING</b>' : `<button data-t="${i}" ${i < tier || money < o.cost ? 'disabled' : ''}>${i < tier ? 'Worse' : 'Buy $' + o.cost}</button>`}
    </div>`).join('');
}
$('shopList').onclick = (e) => { const t = e.target.dataset.t; if (t) socket.emit('buy', +t); };
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
socket.on('me', (m) => { money = m.money; tier = m.tier; kills = m.kills; updateHud(); if (inShop) renderShop(); });
socket.on('respawn', (p) => { Object.assign(me, p, { vy: 0 }); alive = true; hp = 100; $('dead').classList.add('hidden'); updateHud(); });
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
socket.on('shot', (s) => {
  const m = projMesh(s.w);
  m.position.fromArray(s.o);
  const v = new THREE.Vector3().fromArray(s.v);
  m.lookAt(m.position.clone().add(v));
  scene.add(m); shots.set(s.id, { m, v, w: s.w, t: 0 });
});
socket.on('pop', (p) => {
  const s = shots.get(p.id);
  if (s) { scene.remove(s.m); shots.delete(p.id); }
  splat(p.p, p.w);
  const d = Math.hypot(p.p[0] - me.x, p.p[2] - me.z);
  if (p.w === 1 && d < 30) beep(90, 0.3, 'sawtooth', 0.08 * (1 - d / 30));
});
socket.on('ouch', (m) => { hp = m.hp; flash(['#ffd400', '#8b4513', '#e0001b'][m.w]); beep(200, 0.1, 'sawtooth'); updateHud(); });
socket.on('hitmark', () => { const h = $('hitmark'); h.style.opacity = 1; setTimeout(() => h.style.opacity = 0, 120); beep(1200, 0.04, 'square', 0.03); });
socket.on('kill', (k) => {
  const div = document.createElement('div');
  div.textContent = `${k.k} ${['💛', '🍔', '🌭'][k.w]} ${k.v}`;
  $('killfeed').prepend(div); setTimeout(() => div.remove(), 5000);
  if (k.k === myName && k.v !== myName) { popup(`🎉 You stained ${k.v}!`); beep(660, 0.15, 'triangle', 0.08); setTimeout(() => beep(990, 0.2, 'triangle', 0.08), 120); }
  if (k.v === myName) {
    alive = false; firing = false;
    $('deadMsg').innerHTML = `${k.k} got you with ${S.WEAPONS[k.w].name}!<br>Your outfit dropped a tier. Respawning...`;
    $('dead').classList.remove('hidden');
  }
});

// ---------- Loop ----------
const clock = new THREE.Clock();
const fwd = new THREE.Vector3();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime, now = performance.now();

  if (alive && !inShop) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    let dx = -Math.sin(yaw) * f + Math.cos(yaw) * r, dz = -Math.cos(yaw) * f - Math.sin(yaw) * r;
    const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
    S.move(me, dx, dz, keys.Space, dt);
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
    const o = camera.position.clone().addScaledVector(fwd, 0.6);
    socket.emit('fire', { w: weapon, o: o.toArray(), d: fwd.toArray() });
    views[weapon].position.z = -0.75;
    if (weapon === 0) beep(300 + Math.random() * 100, 0.05, 'triangle', 0.03); else beep(weapon === 1 ? 150 : 500, 0.12, 'square', 0.05);
  }
  const v = views[weapon];
  v.position.z += (-0.9 - v.position.z) * 0.2;
  v.position.y = -0.32 + Math.sin(kick) * 0.02;

  // hotdog scope
  const scoped = zoom && weapon === 2 && alive;
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
    if (s.w === 1) s.m.rotation.x += dt * 10;
    if ((s.t += dt) > S.WEAPONS[s.w].life + 0.5) { scene.remove(s.m); shots.delete(id); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.v.y -= 20 * dt; p.m.position.addScaledVector(p.v, dt);
    if ((p.t -= dt) <= 0) { scene.remove(p.m); parts.splice(i, 1); }
  }
  renderer.render(scene, camera);
}
updateHud();
loop();
