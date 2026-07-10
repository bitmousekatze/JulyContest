/* ═══════════════════════════════════════════════════════════════════
   BROADSIDE ROYALE — a 3D pirate battle arena
   Prompted July Games Contest · 24 captains sail in, 1 sails out.
   Pick a community captain, sail free, trade broadsides, survive the
   storm. Three.js (r152) + vanilla JS. No build step.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

/* ── Tiny helpers ─────────────────────────────────────────────────── */
const rand  = (n) => Math.floor(Math.random() * n);
const pick  = (a) => a[rand(a.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dirFromAngle = (a) => new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
const angleOf = (v) => Math.atan2(-v.x, -v.z);
function angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ── Combat tuning ────────────────────────────────────────────────── */
const BALL_G   = 22;     // cannonball gravity
const BALL_VY  = 14;     // launch climb speed → ~1.27s flight
const MAX_VH   = 52;     // max horizontal ball speed
const FIRE_RANGE = 64;
const HULLS = {          // ship class by Builder Points tier
  manowar:    { name: "Man o' War", len: 5, hp: 175, spd: 9.0,  turn: 0.50, guns: 5 },
  galleon:    { name: "Galleon",    len: 4, hp: 140, spd: 10.5, turn: 0.65, guns: 4 },
  brigantine: { name: "Brigantine", len: 3, hp: 115, spd: 12.0, turn: 0.82, guns: 3 },
};
function hullFor(cap) {
  const sorted = [...ROSTER].sort((a, b) => b.bp - a.bp);
  const i = sorted.indexOf(cap);
  return i < 8 ? HULLS.manowar : i < 16 ? HULLS.galleon : HULLS.brigantine;
}

/* ── Sound (synthesized, no assets) ───────────────────────────────── */
const AudioFX = (() => {
  let ctx = null, muted = false, dead = false, lastBoom = 0;
  function ac() {
    if (dead) return null;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch (e) { dead = true; return null; }
  }
  function noise(c, dur) {
    const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function boom(vol = 0.7) {
    if (muted || vol < 0.03) return;
    const now = performance.now();
    if (now - lastBoom < 70) return;      // don't stack 24 ships' volleys
    lastBoom = now;
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = noise(c, 0.5);
    const f = c.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(60, t + 0.4);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
    const o = c.createOscillator(), og = c.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.35);
    og.gain.setValueAtTime(vol * 0.7, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(og); og.connect(c.destination); o.start(t); o.stop(t + 0.45);
  }
  function splashS(vol = 0.25) {
    if (muted || vol < 0.03) return;
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = noise(c, 0.4);
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 750; f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  }
  function crackle(vol = 0.25) {
    if (muted || vol < 0.03) return;
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = noise(c, 0.25);
    const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  }
  function bellSeq(notes, dur = 0.28, vol = 0.22) {
    if (muted) return;
    const c = ac(); if (!c) return;
    const t0 = c.currentTime;
    notes.forEach((n, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "triangle"; o.frequency.value = n;
      const t = t0 + i * dur;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.8);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur * 2);
    });
  }
  return {
    boom, splashS, crackle,
    kill:    () => bellSeq([659, 880], 0.14, 0.18),
    victory: () => bellSeq([523, 659, 784, 1046]),
    defeat:  () => bellSeq([330, 277, 220, 165], 0.4, 0.2),
    toggle:  () => (muted = !muted),
    isMuted: () => muted,
    warmup:  () => ac(),
  };
})();

/* ── Battle music ─────────────────────────────────────────────────── */
const MUSIC_VOL = 0.4;
const music = new Audio("BattleSong.mp3");
music.loop = true;
music.volume = MUSIC_VOL;

function startMusic() {
  music.volume = MUSIC_VOL;
  music.muted = AudioFX.isMuted();
  if (music.paused) {
    music.currentTime = 0;
    music.play().catch(() => {});   // blocked until a user gesture — fine
  }
}
function fadeOutMusic() {
  if (music.paused) return;
  let t = 0;
  addAnim((dt) => {
    t += dt;
    music.volume = Math.max(0, MUSIC_VOL * (1 - t / 1.4));
    if (t >= 1.4) { music.pause(); music.volume = MUSIC_VOL; return false; }
    return true;
  });
}

/* ── Renderer / scene / lights / sky ──────────────────────────────── */
const canvas   = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141d33);
scene.fog = new THREE.Fog(0x141d33, 160, 480);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1400);

scene.add(new THREE.HemisphereLight(0x8fb3d9, 0x0a1a2a, 0.85));
const sunLight = new THREE.DirectionalLight(0xffd9a0, 1.1);
sunLight.position.set(70, 90, -50);
scene.add(sunLight);

{
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xf4ead0, fog: false })
  );
  moon.position.set(-220, 170, -480);
  moon.lookAt(0, 0, 0);
  scene.add(moon);
  const starPos = [];
  for (let i = 0; i < 450; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45, r = 850;
    starPos.push(r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph), r * Math.sin(ph) * Math.cos(th));
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
    color: 0xcfd8ff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85,
  })));
}

/* ── Ocean ────────────────────────────────────────────────────────── */
function oceanHeight(x, z, t) {
  return 0.45 * Math.sin(x * 0.07 + t * 0.8)
       + 0.35 * Math.sin(z * 0.09 + t * 1.1 + 2.1)
       + 0.25 * Math.sin((x + z) * 0.05 + t * 0.6);
}
const oceanGeo = new THREE.PlaneGeometry(760, 760, 96, 96);
oceanGeo.rotateX(-Math.PI / 2);
scene.add(new THREE.Mesh(oceanGeo, new THREE.MeshPhongMaterial({
  color: 0x0e3a52, specular: 0x2e5a77, shininess: 60, flatShading: true,
})));
const oceanPos = oceanGeo.attributes.position;
function updateOcean(t) {
  for (let i = 0; i < oceanPos.count; i++) {
    oceanPos.setY(i, oceanHeight(oceanPos.getX(i), oceanPos.getZ(i), t));
  }
  oceanPos.needsUpdate = true;
  oceanGeo.computeVertexNormals();
}

/* ── Storm wall ───────────────────────────────────────────────────── */
const stormWall = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 55, 72, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0x8a46b8, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, depthWrite: false, fog: false,
  })
);
stormWall.position.y = 20;
scene.add(stormWall);

/* ── Ship models ──────────────────────────────────────────────────── */
const CELL = 6;
function buildShip(len, palette) {
  const grp = new THREE.Group();
  const L = len * CELL * 0.88;
  const hullMat = new THREE.MeshPhongMaterial({ color: palette.hull, flatShading: true });
  const trimMat = new THREE.MeshPhongMaterial({ color: palette.trim, flatShading: true });
  const sailMat = new THREE.MeshPhongMaterial({ color: palette.sail, side: THREE.DoubleSide, flatShading: true });
  const mastMat = new THREE.MeshPhongMaterial({ color: 0x3a2413, flatShading: true });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, L), hullMat);
  hull.position.y = 1.0;
  grp.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.2, 4), hullMat);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.z = Math.PI / 4;
  bow.position.set(0, 1.0, -(L / 2 + 1.9));
  grp.add(bow);

  const stern = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, L * 0.24), hullMat);
  stern.position.set(0, 2.6, L * 0.36);
  grp.add(stern);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.32, L * 0.98), trimMat);
  stripe.position.y = 1.85;
  grp.add(stripe);

  const mastCount = len >= 5 ? 3 : len >= 3 ? 2 : 1;
  const tallest = { h: 0, z: 0 };
  for (let m = 0; m < mastCount; m++) {
    const fz = mastCount === 1 ? 0 : (m / (mastCount - 1) - 0.5) * L * 0.55;
    const h = 8 + len * 0.9 - Math.abs(fz) * 0.12;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, h, 6), mastMat);
    mast.position.set(0, 2 + h / 2, fz);
    grp.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.6 + len * 0.3, h * 0.5), sailMat);
    sail.position.set(0, 2 + h * 0.62, fz - 0.25);
    grp.add(sail);
    if (h > tallest.h) { tallest.h = h; tallest.z = fz; }
  }
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.1),
    new THREE.MeshPhongMaterial({ color: palette.flag, side: THREE.DoubleSide })
  );
  flag.position.set(1.0, 2 + tallest.h + 0.5, tallest.z);
  grp.add(flag);

  grp.userData.bobPhase = Math.random() * Math.PI * 2;
  grp.userData.mastTop = 2 + tallest.h;
  return grp;
}
const PLAYER_PALETTE = { hull: 0x5a3a20, trim: 0xe8b64c, sail: 0xe8dcc0, flag: 0x1a1a1a };
function aiPalette(cap) {
  let h = 0;
  for (const ch of cap.username) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const sail = new THREE.Color().setHSL((h % 360) / 360, 0.32, 0.5);
  return { hull: 0x3a2716, trim: 0x8a6a30, sail, flag: 0x141414 };
}

/* Name + HP label floating above each ship */
function makeLabel(ship) {
  const cv = document.createElement("canvas");
  cv.width = 320; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false }));
  spr.scale.set(20, 6, 1);
  spr.position.set(0, ship.mesh.userData.mastTop + 4.5, 0);
  ship.mesh.add(spr);
  ship.label = spr;
  ship.labelCv = cv;
  drawLabel(ship);
}
function drawLabel(ship) {
  const c = ship.labelCv.getContext("2d");
  c.clearRect(0, 0, 320, 96);
  c.textAlign = "center";
  c.font = "34px serif";
  c.shadowColor = "#000"; c.shadowBlur = 6;
  c.fillStyle = ship.isPlayer ? "#e8b64c" : "#e8d9b5";
  c.fillText(ship.cap.emoji + " " + ship.cap.name, 160, 40);
  c.shadowBlur = 0;
  c.fillStyle = "rgba(10,14,22,.75)";
  c.fillRect(60, 58, 200, 13);
  const frac = clamp(ship.hp / ship.maxHp, 0, 1);
  c.fillStyle = frac > 0.35 ? "#5fce6f" : "#e05a3a";
  c.fillRect(62, 60, 196 * frac, 9);
  ship.label.material.map.needsUpdate = true;
}

/* ── Effects ──────────────────────────────────────────────────────── */
const anims = [];
function addAnim(fn) { anims.push(fn); }
function runAnims(dt) {
  for (let i = anims.length - 1; i >= 0; i--) {
    if (anims[i](dt) === false) anims.splice(i, 1);
  }
}

let arenaGroup = new THREE.Group();
scene.add(arenaGroup);
function resetArenaGroup() {
  scene.remove(arenaGroup);
  arenaGroup = new THREE.Group();
  scene.add(arenaGroup);
  anims.length = 0;
}

const camVol = (pos) => clamp(0.9 - pos.distanceTo(camera.position) / 280, 0, 0.9);

function particleBurst(pos, color, count, speed, gravity) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const vels = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
    vels.push(new THREE.Vector3(
      (Math.random() - 0.5) * speed,
      Math.random() * speed * 0.9 + speed * 0.3,
      (Math.random() - 0.5) * speed
    ));
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.9, transparent: true, opacity: 1 });
  const pts = new THREE.Points(geo, mat);
  arenaGroup.add(pts);
  let life = 0;
  addAnim((dt) => {
    life += dt;
    const p = geo.attributes.position;
    for (let i = 0; i < count; i++) {
      vels[i].y -= gravity * dt;
      p.setX(i, p.getX(i) + vels[i].x * dt);
      p.setY(i, p.getY(i) + vels[i].y * dt);
      p.setZ(i, p.getZ(i) + vels[i].z * dt);
    }
    p.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - life / 1.1);
    if (life > 1.1) { arenaGroup.remove(pts); geo.dispose(); mat.dispose(); return false; }
    return true;
  });
}

function ringFX(pos, color) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 1.0, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, 1.15, pos.z);
  arenaGroup.add(ring);
  let life = 0;
  addAnim((dt) => {
    life += dt;
    const s = 1 + life * 7;
    ring.scale.set(s, s, 1);
    ring.material.opacity = Math.max(0, 0.85 - life * 1.3);
    if (life > 0.7) { arenaGroup.remove(ring); return false; }
    return true;
  });
}

function splashFX(pos) {
  AudioFX.splashS(camVol(pos) * 0.4);
  ringFX(pos, 0xbfe0f0);
  particleBurst(new THREE.Vector3(pos.x, 1.2, pos.z), 0x9fc8e8, 12, 8, 22);
}

function explosionFX(pos, big) {
  AudioFX.crackle(camVol(pos) * 0.4);
  AudioFX.boom(camVol(pos) * (big ? 1 : 0.55));
  ringFX(pos, 0xffa040);
  particleBurst(pos.clone().setY(pos.y + 1), 0xff8830, big ? 34 : 18, big ? 13 : 9, 14);
  particleBurst(pos.clone().setY(pos.y + 1), 0x555049, 10, 5, 3);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.95 })
  );
  flash.position.copy(pos).y += 1;
  arenaGroup.add(flash);
  let life = 0;
  addAnim((dt) => {
    life += dt;
    flash.scale.setScalar(1 + life * (big ? 16 : 9));
    flash.material.opacity = Math.max(0, 0.95 - life * 3.2);
    if (life > 0.35) { arenaGroup.remove(flash); return false; }
    return true;
  });
}

function addDeckFire(ship) {
  const L = ship.hull.len * CELL * 0.8;
  const fire = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.9 })
  );
  fire.position.set((Math.random() - 0.5) * 2, 3.1, (Math.random() - 0.5) * L * 0.6);
  ship.mesh.add(fire);
  const phase = Math.random() * 9;
  let t = 0;
  addAnim((dt) => {
    if (!fire.parent || !fire.parent.parent) return false;
    t += dt;
    fire.scale.setScalar(1 + 0.3 * Math.sin(t * 11 + phase));
    fire.material.color.setHSL(0.05 + 0.03 * Math.sin(t * 7 + phase), 1, 0.55);
    return true;
  });
}

function sinkShipMesh(mesh) {
  mesh.userData.sinking = true;
  const dir = Math.random() < 0.5 ? 1 : -1;
  let t = 0;
  addAnim((dt) => {
    t += dt;
    mesh.position.y -= dt * 2.4;
    mesh.rotation.z += dt * 0.3 * dir;
    if (t > 3.4) { if (mesh.parent) mesh.parent.remove(mesh); return false; }
    return true;
  });
}

/* ── Game state ───────────────────────────────────────────────────── */
const G = {
  mode: "title",       // title | arena
  over: false,
  paused: false,
  ships: [],           // all ships, dead ones flagged
  balls: [],
  captain: null,
  playerShip: null,
  time: 0,
  stormR: 215,
  spectating: false,
  winner: null,
};
const aliveShips = () => G.ships.filter(s => s.alive);

const bpLo = Math.min(...ROSTER.map(r => r.bp));
const bpHi = Math.max(...ROSTER.map(r => r.bp));
const smartness = (bp) => 0.2 + 0.75 * ((bp - bpLo) / Math.max(1, bpHi - bpLo));

const STORM = { grace: 25, rate: 1.05, minR: 30, damage: 6, attrition: 1.6, startR: 215 };

function makeShip(cap, isPlayer, pos) {
  const hull = hullFor(cap);
  const mesh = buildShip(hull.len, isPlayer ? PLAYER_PALETTE : aiPalette(cap));
  mesh.position.copy(pos);
  arenaGroup.add(mesh);
  const ship = {
    cap, hull, mesh, isPlayer,
    alive: true,
    hp: hull.hp + (isPlayer ? 40 : 0),
    maxHp: hull.hp + (isPlayer ? 40 : 0),
    heading: Math.random() * Math.PI * 2,
    speed: hull.spd * 0.5,
    vel: new THREE.Vector3(),
    rl: { port: Math.random() * 2, star: Math.random() * 2 },
    reload: isPlayer ? 3.2 : 4.8 - 1.7 * smartness(cap.bp),
    halfLen: (hull.len * CELL * 0.88) / 2 + 1.8,
    kills: 0, dmg: 0,
    place: null, sunkBy: null, deathTime: null,
    fires: 0,                     // deck fires spawned
    ai: isPlayer ? null : { smart: smartness(cap.bp), target: null, retarget: 2 + Math.random() * 6 },
    label: null, labelCv: null,
  };
  makeLabel(ship);
  return ship;
}

/* ── Arena setup / teardown ───────────────────────────────────────── */
function startArena(captain) {
  AudioFX.warmup();
  G.captain = captain;
  G.mode = "arena";
  G.over = false;
  G.paused = false;
  document.getElementById("screen-pause").classList.add("hidden");
  G.spectating = false;
  G.winner = null;
  G.time = 0;
  G.stormR = STORM.startR;
  G.balls = [];
  resetArenaGroup();

  // Scatter spawns across the arena with breathing room between crews
  const caps = [captain, ...ROSTER.filter(r => r !== captain)];
  const spawns = [];
  let minSep = 58, attempts = 0;
  while (spawns.length < caps.length) {
    if (++attempts > 3000) { minSep *= 0.85; attempts = 0; }
    const r = 55 + Math.random() * 135;
    const a = Math.random() * Math.PI * 2;
    const p = new THREE.Vector3(r * Math.sin(a), 0, r * Math.cos(a));
    if (spawns.every(q => q.distanceTo(p) > minSep)) spawns.push(p);
  }
  G.ships = caps.map((cap, i) => makeShip(cap, cap === captain, spawns[i]));
  G.playerShip = G.ships[0];

  document.getElementById("screen-title").classList.add("hidden");
  document.getElementById("screen-end").classList.add("hidden");
  document.getElementById("hud").classList.add("active");
  document.body.classList.add("in-arena");
  document.getElementById("killfeed").innerHTML = "";
  document.getElementById("pp-emoji").textContent = captain.emoji;
  document.getElementById("pp-name").textContent = "Cap'n " + captain.name;
  document.getElementById("pp-ship").textContent =
    "@" + captain.username + " · " + G.playerShip.hull.name;
  showBanner("⚔️ NO QUARTER! Last ship afloat takes the July crown!");
  startMusic();
}

function backToPort() {
  G.mode = "title";
  G.over = false;
  resetArenaGroup();
  fadeOutMusic();
  G.ships = []; G.balls = []; G.playerShip = null;
  document.getElementById("screen-end").classList.add("hidden");
  document.getElementById("hud").classList.remove("active");
  document.getElementById("screen-title").classList.remove("hidden");
  document.body.classList.remove("in-arena");
}

/* ── HUD ──────────────────────────────────────────────────────────── */
let bannerTimer = null;
function showBanner(msg) {
  const el = document.getElementById("log-banner");
  el.querySelector(".msg").textContent = msg;
  el.style.opacity = "1";
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.style.opacity = "0"; }, 3500);
}

function addFeed(html) {
  const feed = document.getElementById("killfeed");
  const div = document.createElement("div");
  div.className = "kf-entry";
  div.innerHTML = html;
  feed.prepend(div);
  while (feed.children.length > 6) feed.removeChild(feed.lastChild);
  setTimeout(() => div.classList.add("fade"), 5500);
  setTimeout(() => div.remove(), 6600);
}

function refreshHUD() {
  const p = G.playerShip;
  const fill = document.getElementById("hp-fill");
  const frac = clamp(p.hp / p.maxHp, 0, 1);
  fill.style.width = (frac * 100) + "%";
  fill.classList.toggle("low", frac < 0.35);
  document.getElementById("stat-kills").textContent = p.kills;
  document.getElementById("stat-dmg").textContent = Math.round(p.dmg);
  document.getElementById("alive-count").textContent = aliveShips().length;

  for (const [side, gunId, fillId] of [["port", "gun-port", "gf-port"], ["star", "gun-star", "gf-star"]]) {
    const ready = p.rl[side] <= 0;
    document.getElementById(gunId).classList.toggle("ready", ready);
    document.getElementById(fillId).style.width =
      (clamp(1 - p.rl[side] / p.reload, 0, 1) * 100) + "%";
  }

  const st = document.getElementById("storm-text");
  if (G.time < STORM.grace) {
    st.textContent = `the storm gathers — ${Math.ceil(STORM.grace - G.time)}s`;
  } else if (G.stormR > STORM.minR) {
    st.textContent = `🌀 storm closing — safe ring ${Math.round(G.stormR)}m`;
  } else {
    st.textContent = "⚡ MAELSTROM — all waters cursed";
  }
}

/* ── Firing & cannonballs ─────────────────────────────────────────── */
const ballGeo = new THREE.SphereGeometry(0.65, 10, 8);
const ballMat = new THREE.MeshPhongMaterial({ color: 0x14100c, shininess: 90 });
const FLIGHT_T = 2 * BALL_VY / BALL_G;

/* Aim a broadside from `ship` on `side` (+1 port, -1 starboard). */
function fireBroadside(ship, side) {
  const rlKey = side > 0 ? "port" : "star";
  if (ship.rl[rlKey] > 0 || !ship.alive) return false;
  ship.rl[rlKey] = ship.reload;

  const gunAngle = ship.heading + side * Math.PI / 2;
  // Aim assist: range on the closest foe roughly in this side's arc
  let aimAngle = gunAngle, vh = 38, assist = null, best = 1e9;
  for (const s of G.ships) {
    if (!s.alive || s === ship) continue;
    const to = s.mesh.position.clone().sub(ship.mesh.position);
    const d = to.length();
    if (d > FIRE_RANGE + 8) continue;
    if (Math.abs(angleDiff(angleOf(to), gunAngle)) > 0.6) continue;
    if (d < best) { best = d; assist = s; }
  }
  const acc = ship.isPlayer ? 0.8 : ship.ai.smart;
  if (assist) {
    const lead = assist.vel.clone().multiplyScalar(FLIGHT_T * acc);
    const target = assist.mesh.position.clone().add(lead);
    const to = target.sub(ship.mesh.position);
    // Cannons scatter with distance — close the gap for a killing volley
    const falloff = best / FIRE_RANGE;
    const angNoise = 0.03 + 0.16 * (1 - acc) + 0.24 * falloff * (1.15 - acc);
    const spdNoise = 0.06 + 0.16 * (1 - acc) + 0.20 * falloff * (1.15 - acc);
    aimAngle = angleOf(to) + (Math.random() - 0.5) * angNoise;
    vh = clamp(to.length() / FLIGHT_T, 16, MAX_VH) * (1 + (Math.random() - 0.5) * spdNoise);
  }

  const fwd = dirFromAngle(ship.heading);
  const sideDir = dirFromAngle(gunAngle);
  const L = ship.hull.len * CELL * 0.88;
  const nGuns = ship.hull.guns;
  for (let i = 0; i < nGuns; i++) {
    const off = (i / Math.max(1, nGuns - 1) - 0.5) * L * 0.6;
    const p = ship.mesh.position.clone()
      .add(fwd.clone().multiplyScalar(off))
      .add(sideDir.clone().multiplyScalar(2.3));
    p.y = 3;
    const jitter = aimAngle + (Math.random() - 0.5) * 0.09;
    const v = dirFromAngle(jitter).multiplyScalar(vh * (1 + (Math.random() - 0.5) * 0.06));
    v.y = BALL_VY;
    const mesh = new THREE.Mesh(ballGeo, ballMat);
    mesh.position.copy(p);
    arenaGroup.add(mesh);
    G.balls.push({ p, v, mesh, owner: ship, life: 0 });
  }
  const flashPos = ship.mesh.position.clone().add(sideDir.clone().multiplyScalar(3)).setY(3);
  particleBurst(flashPos, 0xffc060, 8, 6, 8);
  AudioFX.boom(camVol(ship.mesh.position) * 0.8);
  return true;
}

function damageShip(ship, amount, attacker) {
  if (!ship.alive) return;
  ship.hp -= amount;
  if (attacker) attacker.dmg += amount;
  drawLabel(ship);
  const thresholds = [0.55, 0.3];
  while (ship.fires < thresholds.length && ship.hp / ship.maxHp < thresholds[ship.fires]) {
    addDeckFire(ship);
    ship.fires++;
  }
  if (ship.hp <= 0) killShip(ship, attacker);
}

function killShip(ship, attacker) {
  ship.alive = false;
  ship.hp = 0;
  ship.place = aliveShips().length + 1;
  ship.sunkBy = attacker ? attacker.cap : null;
  ship.deathTime = G.time;
  if (ship.label) { ship.mesh.remove(ship.label); ship.label = null; }
  explosionFX(ship.mesh.position.clone().setY(3), true);
  sinkShipMesh(ship.mesh);

  const dName = `${ship.cap.emoji} ${esc(ship.cap.name)}`;
  if (attacker) {
    attacker.kills++;
    addFeed(`<span class="k">${attacker.cap.emoji} ${esc(attacker.cap.name)}</span> ⚔️ sank <span class="d">${dName}</span>`);
    if (attacker.isPlayer) {
      AudioFX.kill();
      showBanner(`☠️ Ye sent ${ship.cap.name} to the depths! (${attacker.kills} sunk)`);
    }
  } else {
    addFeed(`🌀 the storm swallowed <span class="d">${dName}</span>`);
  }
  if (ship.isPlayer) playerDied(attacker);
  checkEnd();
}

/* ── Player death / end of match ──────────────────────────────────── */
function playerDied(attacker) {
  AudioFX.defeat();
  const place = aliveShips().length + 1;
  G.playerPlace = place;
  showEndCard({
    emoji: "☠️",
    title: "Davy Jones' Locker",
    sub: attacker
      ? `Cap'n ${attacker.cap.name} sent ye down. The battle rages on without ye…`
      : "The storm claimed yer hull. The battle rages on without ye…",
    place,
    buttons: [
      ["🔭 Spectate the Rest", () => {
        document.getElementById("screen-end").classList.add("hidden");
        G.spectating = true;
      }],
      ["⚓ New Battle", () => startArena(G.captain)],
      ["🏠 Back to Port", backToPort, true],
    ],
  });
}

function checkEnd() {
  const alive = aliveShips();
  if (alive.length > 1 || G.over) return;
  G.over = true;
  G.winner = alive[0] || null;
  if (G.winner) G.winner.place = 1;

  if (G.winner && G.winner.isPlayer) {
    AudioFX.victory();
    showEndCard({
      emoji: "🏆",
      title: "LAST SHIP AFLOAT!",
      sub: `Cap'n ${G.captain.name} rules the Prompted seas! The July crown be yers!`,
      place: 1,
      buttons: [
        ["⚓ Sail Again", () => startArena(G.captain)],
        ["🏠 Back to Port", backToPort, true],
      ],
    });
  } else {
    const w = G.winner ? `${G.winner.cap.emoji} Cap'n ${G.winner.cap.name}` : "No one";
    showEndCard({
      emoji: "🏴‍☠️",
      title: `${G.winner ? G.winner.cap.name : "Nobody"} wins!`,
      sub: `${w} be the last ship afloat. Ye placed #${G.playerPlace || "?"} of ${G.ships.length}.`,
      place: G.playerPlace || "—",
      buttons: [
        ["⚓ New Battle", () => startArena(G.captain)],
        ["🏠 Back to Port", backToPort, true],
      ],
    });
  }
}

function showEndCard({ emoji, title, sub, place, buttons }) {
  document.getElementById("end-emoji").textContent = emoji;
  document.getElementById("end-title").textContent = title;
  document.getElementById("end-sub").textContent = sub;
  document.getElementById("end-place").textContent = "#" + place;
  document.getElementById("end-kills").textContent = G.playerShip ? G.playerShip.kills : 0;
  document.getElementById("end-dmg").textContent = G.playerShip ? Math.round(G.playerShip.dmg) : 0;
  const btns = document.getElementById("end-buttons");
  btns.innerHTML = "";
  for (const [label, fn, ghost] of buttons) {
    const b = document.createElement("button");
    b.className = "btn" + (ghost ? " ghost" : "");
    b.textContent = label;
    b.onclick = fn;
    btns.appendChild(b);
  }
  renderMemorial(document.getElementById("memorial"));
  document.getElementById("screen-end").classList.remove("hidden");
}

/* ── Memorial board: the fallen, Hunger Games style ───────────────── */
const fmtTime = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");

function renderMemorial(board) {
  const order = [...G.ships].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.alive) return b.hp - a.hp;
    return a.place - b.place;
  });
  board.innerHTML = order.map(s => {
    const i = G.ships.indexOf(s);
    const cls = ["mem-tile", s.alive ? "" : "dead",
                 s.place === 1 ? "winner" : "", s.isPlayer ? "me" : ""].join(" ");
    const ava = s.cap.avatar
      ? `<span class="mem-emoji">${s.cap.emoji}</span><img src="${esc(s.cap.avatar)}" alt="" onerror="this.remove()">`
      : `<span class="mem-emoji">${s.cap.emoji}</span>`;
    const badge = s.place === 1 ? `<span class="mem-skull">👑</span>`
                : !s.alive      ? `<span class="mem-skull">☠️</span>` : "";
    const place = !s.alive || s.place === 1 ? `<span class="mem-place">#${s.place}</span>` : "";
    return `<div class="${cls}" data-i="${i}">
      <div class="mem-ava">${ava}</div>${badge}${place}
      <div class="mem-name">${esc(s.cap.name)}${s.isPlayer ? " (YE)" : ""}</div>
    </div>`;
  }).join("");
}

/* Tooltip: hover a tile → that captain's voyage */
const memTip = document.getElementById("memorial-tip");
function attachMemorialTip(board) {
  board.addEventListener("mouseover", (e) => {
  const tile = e.target.closest(".mem-tile");
  if (!tile) return;
  const s = G.ships[+tile.dataset.i];
  if (!s) return;
  const status = s.place === 1
    ? `👑 Last ship afloat — champion!`
    : s.alive
      ? `⛵ Still afloat — hull at ${Math.round(100 * s.hp / s.maxHp)}%`
      : `☠️ Placed #${s.place} — ${s.sunkBy
          ? "sunk by " + esc(s.sunkBy.name) : "swallowed by the storm"} at ${fmtTime(s.deathTime)}`;
  memTip.innerHTML = `
    <div class="tt-name">${s.cap.emoji} Cap'n ${esc(s.cap.name)}</div>
    <div class="tt-user">@${esc(s.cap.username)} · ${s.cap.bp.toLocaleString()} BP</div>
    <div class="tt-status">${status}</div>
    <div class="tt-row"><span>⛵ Hull</span><span>${s.hull.name}</span></div>
    <div class="tt-row"><span>⚔️ Ships sunk</span><span>${s.kills}</span></div>
    <div class="tt-row"><span>💥 Damage dealt</span><span>${Math.round(s.dmg)}</span></div>`;
  memTip.style.display = "block";
  const r = tile.getBoundingClientRect(), tw = memTip.offsetWidth, th = memTip.offsetHeight;
  memTip.style.left = clamp(r.left + r.width / 2 - tw / 2, 8, window.innerWidth - tw - 8) + "px";
  memTip.style.top = (r.top - th - 8 < 8 ? r.bottom + 8 : r.top - th - 8) + "px";
  });
  board.addEventListener("mouseleave", () => { memTip.style.display = "none"; });
}
attachMemorialTip(document.getElementById("memorial"));
attachMemorialTip(document.getElementById("memorial-pause"));

/* ── Pause (parley) ───────────────────────────────────────────────── */
function togglePause() {
  if (G.mode !== "arena" || G.over) return;
  if (!document.getElementById("screen-end").classList.contains("hidden")) return;
  G.paused = !G.paused;
  document.getElementById("screen-pause").classList.toggle("hidden", !G.paused);
  memTip.style.display = "none";
  if (G.paused) {
    renderMemorial(document.getElementById("memorial-pause"));
    music.pause();
  } else if (music.paused) {
    music.play().catch(() => {});
  }
}
document.getElementById("btn-resume").onclick = togglePause;
document.getElementById("btn-port-pause").onclick = () => {
  G.paused = false;
  document.getElementById("screen-pause").classList.add("hidden");
  backToPort();
};

/* ── AI captains ──────────────────────────────────────────────────── */
function stepAI(ship, dt) {
  const ai = ship.ai;
  ai.retarget -= dt;
  if (ai.retarget <= 0 || !ai.target || !ai.target.alive) {
    ai.retarget = 2 + Math.random() * 2;
    let best = null, bd = 1e9;
    for (const s of G.ships) {
      if (!s.alive || s === ship) continue;
      const d = s.mesh.position.distanceTo(ship.mesh.position);
      if (d < bd) { bd = d; best = s; }
    }
    ai.target = best;
  }
  const pos = ship.mesh.position;
  let desired;

  const distCenter = Math.hypot(pos.x, pos.z);
  if (distCenter > G.stormR - 18) {
    desired = angleOf(pos.clone().negate());        // flee the storm
  } else if (ai.target) {
    const to = ai.target.mesh.position.clone().sub(pos);
    const angT = angleOf(to);
    if (to.length() > 55) {
      desired = angT;                               // close the distance
    } else {                                        // bring a broadside to bear
      const dPort = Math.abs(angleDiff(angT, ship.heading + Math.PI / 2));
      const dStar = Math.abs(angleDiff(angT, ship.heading - Math.PI / 2));
      desired = dPort < dStar ? angT - Math.PI / 2 : angT + Math.PI / 2;
    }
  } else {
    desired = ship.heading;
  }
  ship.heading += clamp(angleDiff(desired, ship.heading), -ship.hull.turn * dt, ship.hull.turn * dt);

  const tgtDist = ai.target ? ai.target.mesh.position.distanceTo(pos) : 1e9;
  const wantSpd = tgtDist < 28 ? ship.hull.spd * 0.55 : ship.hull.spd;
  ship.speed += clamp(wantSpd - ship.speed, -6 * dt, 4 * dt);

  if (ai.target && tgtDist < FIRE_RANGE) {
    const angT = angleOf(ai.target.mesh.position.clone().sub(pos));
    if (Math.abs(angleDiff(angT, ship.heading + Math.PI / 2)) < 0.55) fireBroadside(ship, +1);
    if (Math.abs(angleDiff(angT, ship.heading - Math.PI / 2)) < 0.55) fireBroadside(ship, -1);
  }
}

/* ── Player input ─────────────────────────────────────────────────── */
const keys = {};
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === "escape") { togglePause(); return; }
  if (G.mode !== "arena" || G.paused || !G.playerShip || !G.playerShip.alive) return;
  if (k === "q") fireBroadside(G.playerShip, +1);
  if (k === "e") fireBroadside(G.playerShip, -1);
  if (k === " ") {
    fireBroadside(G.playerShip, +1);
    fireBroadside(G.playerShip, -1);
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

function stepPlayer(ship, dt) {
  const left  = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;
  if (left)  ship.heading += ship.hull.turn * dt;
  if (right) ship.heading -= ship.hull.turn * dt;
  const want = (keys.w || keys.arrowup) ? ship.hull.spd
             : (keys.s || keys.arrowdown) ? -2.5
             : ship.hull.spd * 0.45;
  ship.speed += clamp(want - ship.speed, -8 * dt, 5 * dt);
}

/* ── Simulation step (rendering-independent, exposed for testing) ── */
const _to = new THREE.Vector3();
function step(dt) {
  if (G.mode !== "arena") return;
  if (G.over) { runAnims(dt); refreshHUD(); return; }
  G.time += dt;

  // Storm
  if (G.time > STORM.grace && G.stormR > STORM.minR) {
    G.stormR = Math.max(STORM.minR, G.stormR - STORM.rate * dt);
  }
  stormWall.scale.set(G.stormR, 1, G.stormR);

  // Ships: control + movement
  for (const ship of G.ships) {
    if (!ship.alive) continue;
    if (ship.isPlayer) stepPlayer(ship, dt);
    else stepAI(ship, dt);

    ship.rl.port = Math.max(0, ship.rl.port - dt);
    ship.rl.star = Math.max(0, ship.rl.star - dt);

    const fwd = dirFromAngle(ship.heading);
    ship.vel.copy(fwd).multiplyScalar(ship.speed);
    ship.mesh.position.x += ship.vel.x * dt;
    ship.mesh.position.z += ship.vel.z * dt;

    // Storm & maelstrom attrition
    const dc = Math.hypot(ship.mesh.position.x, ship.mesh.position.z);
    if (dc > G.stormR) damageShip(ship, STORM.damage * dt, null);
    else if (G.stormR <= STORM.minR) damageShip(ship, STORM.attrition * dt, null);
  }

  // Soft collisions: push overlapping hulls apart
  const alive = aliveShips();
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      _to.copy(b.mesh.position).sub(a.mesh.position);
      _to.y = 0;
      const d = _to.length(), minD = (a.halfLen + b.halfLen) * 0.55;
      if (d > 0.01 && d < minD) {
        _to.normalize().multiplyScalar((minD - d) * 0.5);
        b.mesh.position.add(_to);
        a.mesh.position.sub(_to);
      }
    }
  }

  // Cannonballs
  for (let i = G.balls.length - 1; i >= 0; i--) {
    const ball = G.balls[i];
    ball.life += dt;
    ball.v.y -= BALL_G * dt;
    ball.p.addScaledVector(ball.v, dt);
    ball.mesh.position.copy(ball.p);

    let dead = false;
    if (ball.life > 6) dead = true;
    else if (ball.p.y < 1.0) { splashFX(ball.p); dead = true; }
    else if (ball.p.y < 9) {
      for (const ship of G.ships) {
        if (!ship.alive || ship === ball.owner) continue;
        _to.copy(ball.p).sub(ship.mesh.position);
        const fwd = dirFromAngle(ship.heading);
        const lon = _to.x * fwd.x + _to.z * fwd.z;
        const lat = _to.x * fwd.z - _to.z * fwd.x;   // 2D cross → lateral offset
        if (Math.abs(lon) < ship.halfLen && Math.abs(lat) < 3.3) {
          explosionFX(ball.p.clone(), false);
          damageShip(ship, 3 + Math.random() * 3, ball.owner);
          dead = true;
          break;
        }
      }
    }
    if (dead) {
      arenaGroup.remove(ball.mesh);
      G.balls.splice(i, 1);
    }
  }

  runAnims(dt);
  refreshHUD();
}

/* Debug/testing hook: drive the simulation without rendering */
window.__broadside = {
  start: (i) => startArena(ROSTER[i ?? 0]),
  step,
  state: () => ({
    mode: G.mode,
    over: G.over,
    alive: aliveShips().length,
    playerAlive: !!(G.playerShip && G.playerShip.alive),
    winner: G.winner ? G.winner.cap.name : null,
    time: Math.round(G.time),
    balls: G.balls.length,
    stormR: Math.round(G.stormR),
  }),
};

/* ── Chase camera ─────────────────────────────────────────────────── */
const cam = { yawOff: 0, pitch: 0.42, dist: 46 };
let camTargetShip = null;

function updateCamera(dt) {
  let focus = G.playerShip;
  if (G.spectating || (focus && !focus.alive)) {
    if (!camTargetShip || !camTargetShip.alive) {
      camTargetShip = aliveShips().sort((a, b) => b.hp - a.hp)[0] || focus;
    }
    focus = camTargetShip;
  }
  if (!focus) return;

  const a = focus.heading + Math.PI + cam.yawOff;
  const horiz = Math.cos(cam.pitch) * cam.dist;
  const target = new THREE.Vector3(
    focus.mesh.position.x + -Math.sin(a) * horiz,
    Math.sin(cam.pitch) * cam.dist + 3,
    focus.mesh.position.z + -Math.cos(a) * horiz
  );
  const k = 1 - Math.exp(-5 * dt);
  camera.position.lerp(target, k);
  const look = focus.mesh.position.clone()
    .add(dirFromAngle(focus.heading).multiplyScalar(10));
  look.y = 5;
  camera.lookAt(look);
}

/* Drag-to-look + scroll zoom */
let pDown = null;
canvas.addEventListener("pointerdown", (e) => {
  pDown = { x: e.clientX, y: e.clientY };
  AudioFX.warmup();
});
window.addEventListener("pointermove", (e) => {
  if (!pDown) return;
  cam.yawOff = cam.yawOff - (e.movementX || 0) * 0.005;
  cam.pitch = clamp(cam.pitch + (e.movementY || 0) * 0.004, 0.12, 1.25);
});
window.addEventListener("pointerup", () => { pDown = null; });
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 22, 110);
}, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

/* ── Title screen ─────────────────────────────────────────────────── */
function buildRoster() {
  const grid = document.getElementById("roster-grid");
  grid.innerHTML = "";
  const sorted = [...ROSTER].sort((a, b) => b.bp - a.bp);
  for (const cap of sorted) {
    const card = document.createElement("div");
    card.className = "captain-card";
    card.innerHTML = `
      <div class="emoji">${cap.emoji}</div>
      <div class="cname">${esc(cap.name)}</div>
      <div class="cuser">@${esc(cap.username)}</div>
      <div class="cbp">⚜ ${cap.bp.toLocaleString()} BP</div>
      <div class="chull">⛵ ${hullFor(cap).name}</div>`;
    card.onclick = () => startArena(cap);
    grid.appendChild(card);
  }
}
buildRoster();

document.getElementById("mutebtn").onclick = function () {
  AudioFX.toggle();
  music.muted = AudioFX.isMuted();
  this.textContent = AudioFX.isMuted() ? "🔇" : "🔊";
};

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ── Main loop ────────────────────────────────────────────────────── */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (G.mode === "arena" && G.paused) {
    renderer.render(scene, camera);   // frozen tableau under the parley card
    return;
  }
  updateOcean(t);
  if (G.mode === "arena") {
    step(dt);
    // Visual-only bobbing (does not affect simulation positions)
    for (const ship of G.ships) {
      if (!ship.alive || ship.mesh.userData.sinking) continue;
      const p = ship.mesh.position;
      p.y = oceanHeight(p.x, p.z, t) * 0.5;
      ship.mesh.rotation.y = ship.heading;
      ship.mesh.rotation.z = 0.035 * Math.sin(t * 0.9 + ship.mesh.userData.bobPhase);
      ship.mesh.rotation.x = 0.02 * Math.sin(t * 1.2 + ship.mesh.userData.bobPhase);
    }
    updateCamera(dt);
  } else {
    // Idle title-screen drift
    const a = t * 0.05;
    camera.position.set(Math.sin(a) * 180, 60, Math.cos(a) * 180);
    camera.lookAt(0, 0, 0);
    runAnims(dt);
  }
  renderer.render(scene, camera);
}
animate();

})();
