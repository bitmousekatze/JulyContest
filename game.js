/* ═══════════════════════════════════════════════════════════════════
   BROADSIDE! — a 3D pirate-age naval war simulator
   Prompted July Games Contest · pick a captain, sink the community.
   Three.js (r152) + vanilla JS. No build step — just open index.html.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
"use strict";

/* ── Constants & tiny helpers ─────────────────────────────────────── */
const CELL = 6, N = 10;
const PLAYER_Z = 40, ENEMY_Z = -40;          // grid centers on the z axis
const SHIP_DEFS = [
  { name: "Man o' War", len: 5 },
  { name: "Galleon",    len: 4 },
  { name: "Brigantine", len: 3 },
  { name: "Schooner",   len: 3 },
  { name: "Sloop",      len: 2 },
];
const key   = (x, z) => x + "," + z;
const rand  = (n) => Math.floor(Math.random() * n);
const pick  = (a) => a[rand(a.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const inGrid = (x, z) => x >= 0 && x < N && z >= 0 && z < N;
const cellToWorld = (centerZ, gx, gz) =>
  new THREE.Vector3((gx - 4.5) * CELL, 0, centerZ + (gz - 4.5) * CELL);

/* ── Sound (synthesized, no assets) ───────────────────────────────── */
const AudioFX = (() => {
  let ctx = null, muted = false;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function noise(dur) {
    const c = ac(), b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function boom(vol = 0.7) {
    if (muted) return;
    const c = ac(), t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = noise(0.5);
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
  function splash() {
    if (muted) return;
    const c = ac(), t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = noise(0.45);
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 750; f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  }
  function crackle() {
    if (muted) return;
    const c = ac(), t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = noise(0.25);
    const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  }
  function bell(notes, dur = 0.28, vol = 0.22) {
    if (muted) return;
    const c = ac(), t0 = c.currentTime;
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
    boom, splash, crackle,
    victory: () => bell([523, 659, 784, 1046]),
    defeat:  () => bell([330, 277, 220, 165], 0.4, 0.2),
    toggle:  () => (muted = !muted),
    isMuted: () => muted,
    warmup:  () => { try { ac(); } catch (e) {} },
  };
})();

/* ── Renderer / scene / camera ────────────────────────────────────── */
const canvas   = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141d33);
scene.fog = new THREE.Fog(0x141d33, 150, 420);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 1200);

scene.add(new THREE.HemisphereLight(0x8fb3d9, 0x0a1a2a, 0.85));
const sun = new THREE.DirectionalLight(0xffd9a0, 1.1);
sun.position.set(70, 90, -50);
scene.add(sun);

/* Moon + stars */
{
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xf4ead0, fog: false })
  );
  moon.position.set(-200, 160, -460);
  moon.lookAt(0, 0, 0);
  scene.add(moon);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(40, 32),
    new THREE.MeshBasicMaterial({ color: 0xf4ead0, fog: false, transparent: true, opacity: 0.12 })
  );
  halo.position.copy(moon.position).multiplyScalar(1.001);
  halo.lookAt(0, 0, 0);
  scene.add(halo);

  const starPos = [];
  for (let i = 0; i < 450; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
    const r = 750;
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
const oceanGeo = new THREE.PlaneGeometry(520, 520, 88, 88);
oceanGeo.rotateX(-Math.PI / 2);
const ocean = new THREE.Mesh(oceanGeo, new THREE.MeshPhongMaterial({
  color: 0x0e3a52, specular: 0x2e5a77, shininess: 60, flatShading: true,
}));
scene.add(ocean);
const oceanPos = oceanGeo.attributes.position;
function updateOcean(t) {
  for (let i = 0; i < oceanPos.count; i++) {
    oceanPos.setY(i, oceanHeight(oceanPos.getX(i), oceanPos.getZ(i), t));
  }
  oceanPos.needsUpdate = true;
  oceanGeo.computeVertexNormals();
}

/* ── Grids ────────────────────────────────────────────────────────── */
function buildGrid(centerZ, color, tint, tintOpacity) {
  const pts = [], half = N * CELL / 2, y = 1.3;
  for (let i = 0; i <= N; i++) {
    const o = -half + i * CELL;
    pts.push(-half, y, centerZ + o,  half, y, centerZ + o);
    pts.push(o, y, centerZ - half,   o, y, centerZ + half);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.55,
  })));
  const zone = new THREE.Mesh(
    new THREE.PlaneGeometry(N * CELL, N * CELL),
    new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: tintOpacity, depthWrite: false })
  );
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(0, 1.25, centerZ);
  scene.add(zone);
  return zone;
}
const enemyZone = buildGrid(ENEMY_Z, 0x5fe0c8, 0x1a6a5c, 0.13);  // clickable
buildGrid(PLAYER_Z, 0xe8b64c, 0x6a521a, 0.09);

/* Hover highlight on enemy waters */
const hover = new THREE.Mesh(
  new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92),
  new THREE.MeshBasicMaterial({ color: 0xe8b64c, transparent: true, opacity: 0.4, depthWrite: false })
);
hover.rotation.x = -Math.PI / 2;
hover.position.y = 1.35;
hover.visible = false;
scene.add(hover);

/* ── Ship models (low-poly pirate builds) ─────────────────────────── */
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
  const tallest = { h: 0, x: 0, z: 0 };
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
  return grp;
}
const PLAYER_PALETTE = { hull: 0x5a3a20, trim: 0xc9963b, sail: 0xe8dcc0, flag: 0x1a1a1a };
const WRECK_PALETTE  = { hull: 0x1e1a16, trim: 0x3a3128, sail: 0x2a2a2a, flag: 0x111111 };

/* Places a ship group onto grid cells (rotates for horizontal ships) */
function poseShipOnCells(mesh, centerZ, cells) {
  const a = cellToWorld(centerZ, cells[0].x, cells[0].z);
  const b = cellToWorld(centerZ, cells[cells.length - 1].x, cells[cells.length - 1].z);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.rotation.y = (cells[0].x !== cells[cells.length - 1].x) ? Math.PI / 2 : 0;
}

/* Enemy flagship (the opposing captain's avatar, beyond their waters) */
const flagship = buildShip(5, { hull: 0x241a12, trim: 0x6a1f1f, sail: 0x494039, flag: 0x0a0a0a });
flagship.scale.setScalar(1.6);
flagship.position.set(0, 0, -96);
scene.add(flagship);

let flagshipLabel = null;
function setFlagshipLabel(emoji, name) {
  if (flagshipLabel) { scene.remove(flagshipLabel); flagshipLabel.material.map.dispose(); }
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 192;
  const c = cv.getContext("2d");
  c.textAlign = "center";
  c.font = "90px serif";
  c.fillText(emoji, 256, 92);
  c.font = "48px 'Pirata One', Georgia, serif";
  c.fillStyle = "#e8b64c";
  c.shadowColor = "#000"; c.shadowBlur = 10;
  c.fillText("Cap'n " + name, 256, 165);
  const tex = new THREE.CanvasTexture(cv);
  flagshipLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthTest: false }));
  flagshipLabel.scale.set(34, 12.75, 1);
  flagshipLabel.position.set(0, 26, -96);
  scene.add(flagshipLabel);
}

/* ── Animation & particle effects ─────────────────────────────────── */
const anims = [];           // fn(dt) → false when finished
function addAnim(fn) { anims.push(fn); }
function runAnims(dt) {
  for (let i = anims.length - 1; i >= 0; i--) {
    if (anims[i](dt) === false) anims.splice(i, 1);
  }
}

let battleGroup = new THREE.Group();   // per-battle meshes; nuked between battles
scene.add(battleGroup);
function resetBattleGroup() {
  scene.remove(battleGroup);
  battleGroup = new THREE.Group();
  scene.add(battleGroup);
}

const ballGeo = new THREE.SphereGeometry(0.75, 10, 8);
const ballMat = new THREE.MeshPhongMaterial({ color: 0x14100c, shininess: 90 });

function fireCannonball(src, dst, onLand) {
  AudioFX.boom();
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.position.copy(src);
  scene.add(ball);
  const dist = src.distanceTo(dst);
  const dur = 0.85 + dist * 0.004;
  const apex = 13 + dist * 0.13;
  let t = 0;
  addAnim((dt) => {
    t += dt / dur;
    if (t >= 1) { scene.remove(ball); onLand(); return false; }
    ball.position.lerpVectors(src, dst, t);
    ball.position.y += apex * 4 * t * (1 - t);
    return true;
  });
}

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
  scene.add(pts);
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
    if (life > 1.1) { scene.remove(pts); geo.dispose(); mat.dispose(); return false; }
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
  scene.add(ring);
  let life = 0;
  addAnim((dt) => {
    life += dt;
    const s = 1 + life * 7;
    ring.scale.set(s, s, 1);
    ring.material.opacity = Math.max(0, 0.85 - life * 1.3);
    if (life > 0.7) { scene.remove(ring); return false; }
    return true;
  });
}

function splashFX(pos) {
  AudioFX.splash();
  ringFX(pos, 0xbfe0f0);
  particleBurst(new THREE.Vector3(pos.x, 1.2, pos.z), 0x9fc8e8, 16, 9, 22);
}

function explosionFX(pos, big) {
  AudioFX.crackle();
  AudioFX.boom(big ? 0.9 : 0.5);
  ringFX(pos, 0xffa040);
  particleBurst(pos.clone().setY(pos.y + 1), 0xff8830, big ? 34 : 20, big ? 13 : 9, 14);
  particleBurst(pos.clone().setY(pos.y + 1), 0x555049, 12, 5, 3);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.95 })
  );
  flash.position.copy(pos).y += 1;
  scene.add(flash);
  let life = 0;
  addAnim((dt) => {
    life += dt;
    flash.scale.setScalar(1 + life * (big ? 16 : 9));
    flash.material.opacity = Math.max(0, 0.95 - life * 3.2);
    if (life > 0.35) { scene.remove(flash); return false; }
    return true;
  });
}

function addMissMarker(centerZ, gx, gz) {
  const p = cellToWorld(centerZ, gx, gz);
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 20),
    new THREE.MeshBasicMaterial({ color: 0xd8e8f2, transparent: true, opacity: 0.55, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(p.x, 1.32, p.z);
  battleGroup.add(m);
}

function addHitMarker(centerZ, gx, gz, y) {
  const p = cellToWorld(centerZ, gx, gz);
  const fire = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.9 })
  );
  fire.position.set(p.x, y, p.z);
  battleGroup.add(fire);
  const phase = Math.random() * 9;
  addAnim((dt) => {
    if (!fire.parent || !fire.parent.parent) return false;   // battle cleanup removed it
    const t = clock.elapsedTime;
    const s = 1 + 0.28 * Math.sin(t * 11 + phase);
    fire.scale.setScalar(s);
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
    mesh.position.y -= dt * 2.2;
    mesh.rotation.z += dt * 0.3 * dir;
    if (t > 3.2) { if (mesh.parent) mesh.parent.remove(mesh); return false; }
    return true;
  });
}

/* Reveal + sink a wreck where an enemy ship just died */
function revealEnemyWreck(ship) {
  const wreck = buildShip(ship.len, WRECK_PALETTE);
  poseShipOnCells(wreck, ENEMY_Z, ship.cells);
  wreck.position.y = 0.4;
  battleGroup.add(wreck);
  const mid = ship.cells[Math.floor(ship.cells.length / 2)];
  explosionFX(cellToWorld(ENEMY_Z, mid.x, mid.z).setY(3), true);
  sinkShipMesh(wreck);
}

/* ── Board logic ──────────────────────────────────────────────────── */
function makeBoard() {
  const b = { ships: [], occ: new Map(), shots: new Set() };
  for (const def of SHIP_DEFS) {
    for (let tries = 0; tries < 500; tries++) {
      const horiz = Math.random() < 0.5;
      const x0 = rand(horiz ? N - def.len + 1 : N);
      const z0 = rand(horiz ? N : N - def.len + 1);
      const cells = [];
      for (let i = 0; i < def.len; i++) {
        cells.push({ x: x0 + (horiz ? i : 0), z: z0 + (horiz ? 0 : i) });
      }
      if (cells.every(c => !b.occ.has(key(c.x, c.z)))) {
        const ship = { name: def.name, len: def.len, cells, hits: new Array(def.len).fill(false), sunk: false };
        cells.forEach((c, i) => b.occ.set(key(c.x, c.z), { ship, seg: i }));
        b.ships.push(ship);
        break;
      }
    }
  }
  return b;
}

function receiveShot(board, x, z) {
  board.shots.add(key(x, z));
  const hit = board.occ.get(key(x, z));
  if (!hit) return { result: "miss" };
  hit.ship.hits[hit.seg] = true;
  if (hit.ship.hits.every(Boolean)) { hit.ship.sunk = true; return { result: "sunk", ship: hit.ship }; }
  return { result: "hit", ship: hit.ship };
}

const fleetDead = (board) => board.ships.every(s => s.sunk);

/* ── Enemy AI (smarter with more Builder Points) ──────────────────── */
function makeAI(smart) {
  return { smart, shots: new Set(), openHits: [] };  // openHits: {x,z,ship}
}

function aiPick(ai) {
  const free = (x, z) => inGrid(x, z) && !ai.shots.has(key(x, z));

  if (ai.openHits.length && Math.random() < 0.55 + 0.45 * ai.smart) {
    // Prefer extending an established line on a wounded ship
    const byShip = new Map();
    for (const h of ai.openHits) {
      if (!byShip.has(h.ship)) byShip.set(h.ship, []);
      byShip.get(h.ship).push(h);
    }
    const lineExt = [];
    for (const hits of byShip.values()) {
      if (hits.length < 2) continue;
      const horiz = hits[0].z === hits[1].z;
      const axis = horiz ? "x" : "z";
      const fixed = horiz ? hits[0].z : hits[0].x;
      const vals = hits.map(h => h[axis]);
      const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1;
      const mk = (v) => horiz ? { x: v, z: fixed } : { x: fixed, z: v };
      if (free(mk(lo).x, mk(lo).z)) lineExt.push(mk(lo));
      if (free(mk(hi).x, mk(hi).z)) lineExt.push(mk(hi));
    }
    if (lineExt.length) return pick(lineExt);

    const neighbors = [];
    for (const h of ai.openHits) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (free(h.x + dx, h.z + dz)) neighbors.push({ x: h.x + dx, z: h.z + dz });
      }
    }
    if (neighbors.length) return pick(neighbors);
  }

  // Hunting: smart captains use checkerboard parity
  const useParity = Math.random() < ai.smart;
  const pool = [];
  for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
    if (!free(x, z)) continue;
    if (useParity && (x + z) % 2 !== 0) continue;
    pool.push({ x, z });
  }
  if (!pool.length) {
    for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
      if (free(x, z)) pool.push({ x, z });
    }
  }
  return pick(pool);
}

function aiLearn(ai, cell, outcome) {
  ai.shots.add(key(cell.x, cell.z));
  if (outcome.result === "hit") {
    ai.openHits.push({ x: cell.x, z: cell.z, ship: outcome.ship });
  } else if (outcome.result === "sunk") {
    ai.openHits = ai.openHits.filter(h => h.ship !== outcome.ship);
  }
}

/* ── Taunts & flavor ──────────────────────────────────────────────── */
const LINES = {
  intro: [
    "So ye dare sail into me waters? Yer hull will feed the crabs!",
    "Hoist the colors, dogs! No quarter given!",
    "I've sunk a hundred ships prettier than yers.",
    "The kraken spat ye out, and I'll send ye back down!",
    "Yer bounty will buy me a new hat. FIRE AS SHE BEARS!",
  ],
  playerHit: [
    "ARGH! Ye scratched me beautiful hull!",
    "Lucky shot, bilge rat! It won't happen twice!",
    "Me timbers! MY TIMBERS ARE SHIVERED!",
    "Ye'll pay for that in blood and doubloons!",
  ],
  playerMiss: [
    "HA! Ye couldn't hit the broadside of a galleon!",
    "Was that a cannonball or a pebble? Pathetic!",
    "Me grandmother aims better, and she's a skeleton!",
    "Splash! Feed the fish, why don't ye!",
  ],
  playerSunk: [
    "NOOO! Me {ship}! She was me favorite!",
    "Ye devil! The {ship} cost me three years o' plunder!",
    "The {ship} goes down... ye'll join her soon enough!",
  ],
  enemyHit: [
    "DIRECT HIT! Yer deck splinters like driftwood!",
    "That's the smell o' yer ship burnin', matey!",
    "Right in the gunwale! HAHAHA!",
  ],
  enemyMiss: [
    "Blast! The wind cheated me!",
    "A warning shot! The next one bites!",
    "Curse this fog! Reload the guns!",
  ],
  enemySunk: [
    "Yer {ship} sleeps with Davy Jones now! HAHA!",
    "Down goes yer {ship}! The sea thanks me for the gift!",
  ],
  victory: [
    "impossible... me fleet... MEE FLEEEET!",
    "Ye win this day... but the sea remembers, matey.",
    "Blub... blub... tell me crew I loved... gold...",
  ],
  defeat: [
    "And STAY down! These waters be MINE!",
    "Another pretender feeds the fishes. NEXT!",
  ],
};
function sayAs(who, tpl, shipName) {
  const msg = tpl.replace("{ship}", shipName || "ship");
  const el = document.getElementById("log-banner");
  el.querySelector(".who").textContent = who ? who + ":" : "";
  el.querySelector(".msg").textContent = " “" + msg + "”";
  el.style.opacity = "1";
}
function narrate(msg) {
  const el = document.getElementById("log-banner");
  el.querySelector(".who").textContent = "";
  el.querySelector(".msg").textContent = msg;
  el.style.opacity = "1";
}

/* ── Game state & flow ────────────────────────────────────────────── */
const G = {
  phase: "title",     // title | placement | player | busy | over
  captain: null,
  opponents: [],
  oppIdx: 0,
  enemy: null,
  playerBoard: null,
  enemyBoard: null,
  ai: null,
  playerShipMeshes: [],
  shots: 0, hits: 0,
  totalShots: 0, totalHits: 0, defeated: 0,
};

const bpLo = Math.min(...ROSTER.map(r => r.bp));
const bpHi = Math.max(...ROSTER.map(r => r.bp));
const smartness = (bp) => 0.2 + 0.75 * ((bp - bpLo) / Math.max(1, bpHi - bpLo));

function startContest(captain) {
  AudioFX.warmup();
  G.captain = captain;
  G.opponents = ROSTER.filter(r => r !== captain).sort((a, b) => a.bp - b.bp);
  G.oppIdx = 0;
  G.defeated = 0;
  G.totalShots = 0; G.totalHits = 0;
  document.getElementById("screen-title").classList.add("hidden");
  document.getElementById("hud").classList.add("active");
  startBattle();
}

function startBattle() {
  G.enemy = G.opponents[G.oppIdx];
  G.playerBoard = makeBoard();
  G.enemyBoard = makeBoard();
  G.ai = makeAI(smartness(G.enemy.bp));
  G.shots = 0; G.hits = 0;
  G.phase = "placement";

  resetBattleGroup();
  spawnPlayerFleet();
  setFlagshipLabel(G.enemy.emoji, G.enemy.name);

  document.getElementById("screen-end").classList.add("hidden");
  document.getElementById("placement-panel").classList.add("active");
  document.getElementById("battle-progress").textContent =
    `Foe ${G.oppIdx + 1} o' ${G.opponents.length} · ${G.enemy.emoji} ${G.enemy.name} · ${G.enemy.bp} BP`;
  document.getElementById("turn-banner").textContent = "Prepare yer fleet";
  renderPanels();
  narrate(`Cap'n ${G.enemy.name} blocks yer passage. Position yer fleet!`);
  setCameraPreset("fleet");
}

function spawnPlayerFleet() {
  G.playerShipMeshes.forEach(m => { if (m.parent) m.parent.remove(m); });
  G.playerShipMeshes = [];
  for (const ship of G.playerBoard.ships) {
    const mesh = buildShip(ship.len, PLAYER_PALETTE);
    poseShipOnCells(mesh, PLAYER_Z, ship.cells);
    battleGroup.add(mesh);
    G.playerShipMeshes.push(mesh);
  }
}

function shuffleFleet() {
  if (G.phase !== "placement") return;
  G.playerBoard = makeBoard();
  spawnPlayerFleet();
  AudioFX.splash();
}

function beginCombat() {
  if (G.phase !== "placement") return;
  document.getElementById("placement-panel").classList.remove("active");
  G.phase = "player";
  document.getElementById("turn-banner").textContent = "🔥 FIRE AT WILL";
  sayAs("Cap'n " + G.enemy.name, pick(LINES.intro));
  setCameraPreset("enemy");
}

function playerSource() {
  const alive = G.playerBoard.ships.findIndex(s => !s.sunk);
  const mesh = G.playerShipMeshes[Math.max(0, alive)];
  return mesh.position.clone().setY(4);
}

function playerFire(gx, gz) {
  if (G.phase !== "player") return;
  if (G.enemyBoard.shots.has(key(gx, gz))) return;
  G.phase = "busy";
  hover.visible = false;
  G.shots++; G.totalShots++;
  document.getElementById("turn-banner").textContent = "Cannonball away…";

  const dst = cellToWorld(ENEMY_Z, gx, gz).setY(1.3);
  fireCannonball(playerSource(), dst, () => {
    const out = receiveShot(G.enemyBoard, gx, gz);
    if (out.result === "miss") {
      splashFX(dst);
      addMissMarker(ENEMY_Z, gx, gz);
      sayAs("Cap'n " + G.enemy.name, pick(LINES.playerMiss));
    } else {
      G.hits++; G.totalHits++;
      explosionFX(dst.clone().setY(2.2), out.result === "sunk");
      addHitMarker(ENEMY_Z, gx, gz, 2.2);
      if (out.result === "sunk") {
        revealEnemyWreck(out.ship);
        sayAs("Cap'n " + G.enemy.name, pick(LINES.playerSunk), out.ship.name);
      } else {
        sayAs("Cap'n " + G.enemy.name, pick(LINES.playerHit));
      }
    }
    renderPanels();

    if (fleetDead(G.enemyBoard)) {
      G.phase = "over";
      setTimeout(() => endBattle(true), 1400);
      return;
    }
    if (out.result !== "miss") {
      // A true broadside earns another shot
      setTimeout(() => {
        G.phase = "player";
        document.getElementById("turn-banner").textContent = "🔥 Direct hit — FIRE AGAIN!";
      }, 700);
    } else {
      setTimeout(enemyVolley, 800);
    }
  });
}

function enemyVolley() {
  document.getElementById("turn-banner").textContent = `${G.enemy.emoji} ${G.enemy.name} returns fire…`;
  setTimeout(() => {
    const cell = aiPick(G.ai);
    const dst = cellToWorld(PLAYER_Z, cell.x, cell.z).setY(1.3);
    fireCannonball(flagship.position.clone().setY(7), dst, () => {
      const out = receiveShot(G.playerBoard, cell.x, cell.z);
      aiLearn(G.ai, cell, out);
      if (out.result === "miss") {
        splashFX(dst);
        addMissMarker(PLAYER_Z, cell.x, cell.z);
        sayAs("Cap'n " + G.enemy.name, pick(LINES.enemyMiss));
      } else {
        explosionFX(dst.clone().setY(3), out.result === "sunk");
        addHitMarker(PLAYER_Z, cell.x, cell.z, 3.4);
        if (out.result === "sunk") {
          const idx = G.playerBoard.ships.indexOf(out.ship);
          sinkShipMesh(G.playerShipMeshes[idx]);
          sayAs("Cap'n " + G.enemy.name, pick(LINES.enemySunk), out.ship.name);
        } else {
          sayAs("Cap'n " + G.enemy.name, pick(LINES.enemyHit));
        }
      }
      renderPanels();

      if (fleetDead(G.playerBoard)) {
        G.phase = "over";
        setTimeout(() => endBattle(false), 1400);
        return;
      }
      setTimeout(() => {
        G.phase = "player";
        document.getElementById("turn-banner").textContent = "🔥 FIRE AT WILL";
      }, 600);
    });
  }, 700);
}

function endBattle(won) {
  G.phase = "over";
  const acc = G.shots ? Math.round(100 * G.hits / G.shots) : 0;
  const scr = document.getElementById("screen-end");
  const btns = document.getElementById("end-buttons");
  btns.innerHTML = "";

  if (won) {
    AudioFX.victory();
    G.defeated++;
    const last = G.oppIdx >= G.opponents.length - 1;
    if (last) {
      document.getElementById("end-emoji").textContent = "🏆";
      document.getElementById("end-title").textContent = "CONTEST CHAMPION!";
      document.getElementById("end-sub").textContent =
        `Cap'n ${G.captain.name} has sunk every fleet in the Prompted seas! The July crown be yers!`;
      document.getElementById("end-shots").textContent = G.totalShots;
      document.getElementById("end-acc").textContent =
        (G.totalShots ? Math.round(100 * G.totalHits / G.totalShots) : 0) + "%";
      document.getElementById("end-defeated").textContent = G.defeated;
      addBtn(btns, "🏠 Return to Port", backToPort);
    } else {
      document.getElementById("end-emoji").textContent = "🏴‍☠️";
      document.getElementById("end-title").textContent = "Victory!";
      document.getElementById("end-sub").textContent =
        `Cap'n ${G.enemy.name}'s fleet rests on the seabed. “${pick(LINES.victory)}”`;
      document.getElementById("end-shots").textContent = G.shots;
      document.getElementById("end-acc").textContent = acc + "%";
      document.getElementById("end-defeated").textContent = G.defeated;
      addBtn(btns, `⚔️ Next Foe: ${G.opponents[G.oppIdx + 1].emoji} ${G.opponents[G.oppIdx + 1].name}`, () => {
        G.oppIdx++;
        startBattle();
      });
      addBtn(btns, "🏠 Abandon Voyage", backToPort, true);
    }
  } else {
    AudioFX.defeat();
    document.getElementById("end-emoji").textContent = "☠️";
    document.getElementById("end-title").textContent = "Davy Jones' Locker";
    document.getElementById("end-sub").textContent =
      `Cap'n ${G.enemy.name} sends ye to the depths. “${pick(LINES.defeat)}”`;
    document.getElementById("end-shots").textContent = G.shots;
    document.getElementById("end-acc").textContent = acc + "%";
    document.getElementById("end-defeated").textContent = G.defeated;
    addBtn(btns, "⚓ Raise a New Fleet (retry)", startBattle);
    addBtn(btns, "🏠 Back to Port", backToPort, true);
  }
  scr.classList.remove("hidden");
  setCameraPreset("overview");
}

function addBtn(parent, label, fn, ghost) {
  const b = document.createElement("button");
  b.className = "btn" + (ghost ? " ghost" : "");
  b.textContent = label;
  b.onclick = fn;
  parent.appendChild(b);
}

function backToPort() {
  G.phase = "title";
  resetBattleGroup();
  if (flagshipLabel) { scene.remove(flagshipLabel); flagshipLabel = null; }
  document.getElementById("screen-end").classList.add("hidden");
  document.getElementById("hud").classList.remove("active");
  document.getElementById("placement-panel").classList.remove("active");
  document.getElementById("screen-title").classList.remove("hidden");
}

/* ── HUD panels ───────────────────────────────────────────────────── */
function renderPanels() {
  const pp = document.getElementById("panel-player");
  pp.innerHTML = `
    <div class="fp-head">
      <span class="fp-emoji">${G.captain.emoji}</span>
      <span><div class="fp-name">Cap'n ${esc(G.captain.name)}</div>
      <div class="fp-user">@${esc(G.captain.username)} · yer fleet</div></span>
    </div>` +
    G.playerBoard.ships.map(s => `
      <div class="shiprow${s.sunk ? " sunk" : ""}">
        <span class="pips">${s.hits.map(h => `<span class="pip${h ? " hit" : ""}"></span>`).join("")}</span>
        ${esc(s.name)}
      </div>`).join("");

  const pe = document.getElementById("panel-enemy");
  pe.innerHTML = `
    <div class="fp-head">
      <span class="fp-emoji">${G.enemy.emoji}</span>
      <span><div class="fp-name">Cap'n ${esc(G.enemy.name)}</div>
      <div class="fp-user">@${esc(G.enemy.username)} · ${G.enemy.bp} BP</div></span>
    </div>` +
    G.enemyBoard.ships.map(s => `
      <div class="shiprow${s.sunk ? " sunk" : ""}">
        <span class="pips">${s.hits.map(() => `<span class="pip${s.sunk ? " hit" : ""}"></span>`).join("")}</span>
        ${esc(s.name)} ${s.sunk ? "— SUNK" : ""}
      </div>`).join("");
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ── Camera orbit controls (hand-rolled, no deps) ─────────────────── */
const cam = {
  theta: 0, phi: 1.0, radius: 115,
  target: new THREE.Vector3(0, 0, -5),
  tween: null,
};
const PRESETS = {
  enemy:    { theta: 0,   phi: 0.92, radius: 100, target: new THREE.Vector3(0, 0, -18) },
  overview: { theta: 0,   phi: 0.35, radius: 150, target: new THREE.Vector3(0, 0, 0) },
  fleet:    { theta: 0,   phi: 1.05, radius: 68,  target: new THREE.Vector3(0, 0, 30) },
};
function setCameraPreset(name) {
  const p = PRESETS[name];
  cam.tween = {
    t: 0,
    from: { theta: cam.theta, phi: cam.phi, radius: cam.radius, target: cam.target.clone() },
    to:   { theta: p.theta,   phi: p.phi,   radius: p.radius,   target: p.target.clone() },
  };
}
function updateCamera(dt) {
  if (cam.tween) {
    const tw = cam.tween;
    tw.t = Math.min(1, tw.t + dt / 0.9);
    const e = 1 - Math.pow(1 - tw.t, 3);
    cam.theta  = tw.from.theta  + (tw.to.theta  - tw.from.theta)  * e;
    cam.phi    = tw.from.phi    + (tw.to.phi    - tw.from.phi)    * e;
    cam.radius = tw.from.radius + (tw.to.radius - tw.from.radius) * e;
    cam.target.lerpVectors(tw.from.target, tw.to.target, e);
    if (tw.t >= 1) cam.tween = null;
  }
  const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
  camera.position.set(
    cam.target.x + cam.radius * sp * Math.sin(cam.theta),
    cam.target.y + cam.radius * cp,
    cam.target.z + cam.radius * sp * Math.cos(cam.theta)
  );
  camera.lookAt(cam.target);
}

/* ── Pointer input: orbit-drag, hover, click-to-fire ──────────────── */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pDown = null, dragging = false;

function pointToCell(clientX, clientY) {
  ndc.x = (clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(enemyZone)[0];
  if (!hit) return null;
  const gx = Math.floor((hit.point.x + N * CELL / 2) / CELL);
  const gz = Math.floor((hit.point.z - ENEMY_Z + N * CELL / 2) / CELL);
  if (!inGrid(gx, gz)) return null;
  return { gx, gz };
}

canvas.addEventListener("pointerdown", (e) => {
  pDown = { x: e.clientX, y: e.clientY };
  dragging = false;
  AudioFX.warmup();
});
window.addEventListener("pointermove", (e) => {
  if (pDown) {
    const dx = e.clientX - pDown.x, dy = e.clientY - pDown.y;
    if (dragging || Math.hypot(dx, dy) > 6) {
      dragging = true;
      cam.tween = null;
      cam.theta = cam.theta - (e.movementX || 0) * 0.005;
      cam.phi = clamp(cam.phi - (e.movementY || 0) * 0.005, 0.15, 1.35);
      hover.visible = false;
    }
    return;
  }
  if (G.phase !== "player") { hover.visible = false; return; }
  const c = pointToCell(e.clientX, e.clientY);
  if (c && !G.enemyBoard.shots.has(key(c.gx, c.gz))) {
    const p = cellToWorld(ENEMY_Z, c.gx, c.gz);
    hover.position.set(p.x, 1.35, p.z);
    hover.visible = true;
  } else {
    hover.visible = false;
  }
});
window.addEventListener("pointerup", (e) => {
  const wasDrag = dragging;
  const wasDown = !!pDown;
  pDown = null; dragging = false;
  if (!wasDown || wasDrag) return;
  if (e.target !== canvas) return;
  if (G.phase !== "player") return;
  const c = pointToCell(e.clientX, e.clientY);
  if (c) playerFire(c.gx, c.gz);
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  cam.tween = null;
  cam.radius = clamp(cam.radius * (1 + e.deltaY * 0.001), 45, 220);
}, { passive: false });

/* ── UI wiring ────────────────────────────────────────────────────── */
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
      <div class="cbp">⚜ ${cap.bp.toLocaleString()} BP</div>`;
    card.onclick = () => startContest(cap);
    grid.appendChild(card);
  }
}
buildRoster();

document.getElementById("btn-shuffle").onclick = shuffleFleet;
document.getElementById("btn-battle").onclick = beginCombat;
document.querySelectorAll(".viewbtn").forEach(b => {
  b.onclick = () => setCameraPreset(b.dataset.view);
});
document.getElementById("mutebtn").onclick = function () {
  AudioFX.toggle();
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

  updateOcean(t);
  runAnims(dt);
  updateCamera(dt);

  // Bob everything that floats
  for (const mesh of G.playerShipMeshes) {
    if (mesh.userData.sinking || !mesh.parent) continue;
    mesh.position.y = oceanHeight(mesh.position.x, mesh.position.z, t) * 0.6;
    mesh.rotation.z = 0.03 * Math.sin(t * 0.9 + mesh.userData.bobPhase);
  }
  flagship.position.y = oceanHeight(0, -96, t) * 0.6;
  flagship.rotation.z = 0.03 * Math.sin(t * 0.8);

  renderer.render(scene, camera);
}
animate();

})();
