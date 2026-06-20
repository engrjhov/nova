/* ============================================================
   MAIN.JS — NOVA Space Planning · 3D Scene + UI Controller
   ============================================================ */

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';

const { REGIONS, STORES, geoToWorld, regionCenterWorld, storesByRegion, regionStats, STATUS_META } = window.PH_DATA;

/* ---------------------------------------------------------------
   STATE
--------------------------------------------------------------- */
const state = {
  view: 'overview',          // 'overview' | 'region' | 'store'
  activeRegion: null,        // region id
  activeStoreIndex: -1,      // index into currentStoreList
  currentStoreList: [],
  cameraBusy: false,
  timelineIndex: 5,          // 0..5 (Jan..Jun)
};

/* ---------------------------------------------------------------
   THREE.JS SCENE SETUP
--------------------------------------------------------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050810);
scene.fog = new THREE.FogExp2(0x050810, 0.0095);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 46, 34);
camera.lookAt(0, 0, 0);

/* ---------------------------------------------------------------
   LIGHTING
--------------------------------------------------------------- */
scene.add(new THREE.AmbientLight(0x2a3550, 1.1));

const moonLight = new THREE.DirectionalLight(0x9fd9ff, 1.4);
moonLight.position.set(-20, 30, 15);
scene.add(moonLight);

const rimLight = new THREE.DirectionalLight(0x2fd9ff, 0.5);
rimLight.position.set(20, 10, -20);
scene.add(rimLight);

/* ---------------------------------------------------------------
   STARFIELD BACKDROP
--------------------------------------------------------------- */
function buildStarfield() {
  const count = 1800;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 180 + Math.random() * 220;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 20;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xaecbff, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.6 });
  scene.add(new THREE.Points(geo, mat));
}
buildStarfield();

/* ---------------------------------------------------------------
   OCEAN PLANE — animated shader: subtle swell + scanline shimmer
--------------------------------------------------------------- */
const oceanGeo = new THREE.PlaneGeometry(240, 240, 64, 64);
const oceanUniforms = {
  uTime: { value: 0 },
  uColorDeep: { value: new THREE.Color(0x040a14) },
  uColorShallow: { value: new THREE.Color(0x0d2a3a) },
  uScan: { value: new THREE.Color(0x1fb8d9) },
};
const oceanMat = new THREE.ShaderMaterial({
  uniforms: oceanUniforms,
  vertexShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying float vWave;
    void main() {
      vUv = uv;
      vec3 pos = position;
      float w = sin(pos.x * 0.06 + uTime * 0.35) * cos(pos.y * 0.05 - uTime * 0.25) * 0.18;
      w += sin(pos.x * 0.18 - uTime * 0.6) * 0.05;
      pos.z += w;
      vWave = w;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColorDeep;
    uniform vec3 uColorShallow;
    uniform vec3 uScan;
    uniform float uTime;
    varying vec2 vUv;
    varying float vWave;
    void main() {
      vec3 base = mix(uColorDeep, uColorShallow, smoothstep(-0.18, 0.18, vWave));
      float scan = sin((vUv.y * 220.0) + uTime * 0.6);
      scan = smoothstep(0.985, 1.0, scan) * 0.35;
      float radial = 1.0 - smoothstep(0.0, 0.72, length(vUv - 0.5));
      vec3 col = base + uScan * scan * radial;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -0.4;
scene.add(ocean);

const gridHelper = new THREE.GridHelper(240, 120, 0x0e3a52, 0x081d2c);
gridHelper.position.y = -0.38;
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.4;
scene.add(gridHelper);

/* ---------------------------------------------------------------
   PHILIPPINES LANDMASS (stylized terrain blobs)
--------------------------------------------------------------- */
const islandGroup = new THREE.Group();
scene.add(islandGroup);

function pseudoNoise(x, z, seed = 0) {
  return (
    Math.sin(x * 0.5 + seed) * Math.cos(z * 0.4 + seed * 1.3) * 0.5 +
    Math.sin(x * 1.3 - seed) * Math.cos(z * 1.1 + seed * 0.7) * 0.25
  );
}

function buildIslandMesh(points, segs, heightScale, seed, colorHex) {
  const xs = points.map(p => p.x), zs = points.map(p => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const rx = (maxX - minX) / 2 + 0.6, rz = (maxZ - minZ) / 2 + 0.6;

  const w = maxX - minX + 2, d = maxZ - minZ + 2;
  const geo = new THREE.PlaneGeometry(w, d, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;

  // Elevation gradient stops — low (coastal lowland) to high (mountain ridge)
  const lowColor = new THREE.Color(0x0a2230);   // deep coastal teal
  const midColor = new THREE.Color(0x163a34);   // vegetated lowland green
  const highColor = new THREE.Color(0x3a4f3e);  // upland terrain
  const peakColor = new THREE.Color(0x8fa896);  // pale ridge highlight

  const colors = new Float32Array(pos.count * 3);
  let maxH = 0;

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i) + cx;
    const lz = pos.getZ(i) + cz;
    const nx = (lx - cx) / rx;
    const nz = (lz - cz) / rz;
    const dist = Math.sqrt(nx * nx + nz * nz);
    const falloff = THREE.MathUtils.clamp(1 - dist, 0, 1);
    const shaped = Math.pow(falloff, 0.7);
    const noise = pseudoNoise(lx, lz, seed);
    let h = shaped * heightScale + noise * heightScale * 0.18 * shaped;
    if (shaped <= 0.001) h = -0.6;
    h = Math.max(h, -0.6);
    pos.setY(i, h);
    if (h > maxH) maxH = h;
  }

  // second pass: assign vertex colors now that we know maxH
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    const t = THREE.MathUtils.clamp(h / Math.max(maxH, 0.001), 0, 1);
    if (t < 0.15) tmp.copy(lowColor).lerp(midColor, t / 0.15);
    else if (t < 0.55) tmp.copy(midColor).lerp(highColor, (t - 0.15) / 0.4);
    else tmp.copy(highColor).lerp(peakColor, (t - 0.55) / 0.45);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.08,
    emissive: new THREE.Color(colorHex),
    emissiveIntensity: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, 0);
  mesh.userData.bounds = { minX, maxX, minZ, maxZ };
  return mesh;
}

const luzonOutline = [
  geoToWorld(18.5, 120.8), geoToWorld(16.4, 120.3), geoToWorld(14.0, 120.6),
  geoToWorld(13.5, 121.9), geoToWorld(15.0, 121.6), geoToWorld(17.5, 122.2),
  geoToWorld(18.6, 122.0),
].map(p => ({ x: p.x, z: p.z }));

const visayasOutline = [
  geoToWorld(11.9, 123.0), geoToWorld(10.0, 122.2), geoToWorld(9.6, 123.2),
  geoToWorld(10.5, 124.5), geoToWorld(11.5, 124.2),
].map(p => ({ x: p.x, z: p.z }));

const mindanaoOutline = [
  geoToWorld(9.8, 125.6), geoToWorld(8.8, 123.5), geoToWorld(6.0, 124.2),
  geoToWorld(5.6, 125.4), geoToWorld(7.2, 126.6), geoToWorld(9.3, 126.3),
].map(p => ({ x: p.x, z: p.z }));

const landLuzon = buildIslandMesh(luzonOutline, 48, 2.6, 1.1, 0x10303e);
const landVisayas = buildIslandMesh(visayasOutline, 36, 1.6, 2.4, 0x0e2c3a);
const landMindanao = buildIslandMesh(mindanaoOutline, 42, 2.0, 3.6, 0x0e2c3a);
islandGroup.add(landLuzon, landVisayas, landMindanao);

/* ---------------------------------------------------------------
   ATMOSPHERIC HALO — soft additive glow disc on the water around
   the archipelago, sells the "command-center scanning the region"
   sci-fi ambience without needing post-process bloom passes.
--------------------------------------------------------------- */
function buildHaloTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size/2, size/2, size*0.08, size/2, size/2, size/2);
  grad.addColorStop(0, 'rgba(47,217,255,0.22)');
  grad.addColorStop(0.5, 'rgba(47,217,255,0.08)');
  grad.addColorStop(1, 'rgba(47,217,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
const haloGeo = new THREE.PlaneGeometry(70, 70);
haloGeo.rotateX(-Math.PI / 2);
const haloMat = new THREE.MeshBasicMaterial({
  map: buildHaloTexture(),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const halo = new THREE.Mesh(haloGeo, haloMat);
halo.position.y = -0.2;
scene.add(halo);

/* ---------------------------------------------------------------
   REGION BOUNDARY RINGS + hit zones
--------------------------------------------------------------- */
const regionMeshes = {};

function makeRingOutline(points, color, yLift = 0.05) {
  const shapePts = points.map(p => new THREE.Vector3(p.x, yLift, p.z));
  shapePts.push(shapePts[0].clone());
  const geo = new THREE.BufferGeometry().setFromPoints(shapePts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const line = new THREE.LineLoop(geo, mat);
  return line;
}

function makeHitPlane(outline, regionId) {
  const xs = outline.map(p => p.x), zs = outline.map(p => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const w = maxX - minX, d = maxZ - minZ;
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((minX + maxX) / 2, 1.6, (minZ + maxZ) / 2);
  mesh.userData.regionId = regionId;
  mesh.userData.isRegionHit = true;
  return mesh;
}

function setupRegion(id, outline) {
  const region = REGIONS[id];
  const ring = makeRingOutline(outline, region.color, 0.08);
  islandGroup.add(ring);
  const hit = makeHitPlane(outline, id);
  islandGroup.add(hit);
  regionMeshes[id] = { ring, hit, baseOpacity: 0.85 };

  // corner glow markers along the boundary — gives a "targeting overlay" HUD read
  const cornerGlows = [];
  outline.forEach((pt) => {
    const cg = makeGlowSprite(region.color, 0.7);
    cg.position.set(pt.x, 0.1, pt.z);
    islandGroup.add(cg);
    cornerGlows.push(cg);
  });
  regionMeshes[id].cornerGlows = cornerGlows;

  const label = makeLabelSprite(region.name.toUpperCase(), '#' + region.color.toString(16).padStart(6, '0'));
  const c = regionCenterWorld(id);
  label.position.set(c.x, 6.2, c.z);
  islandGroup.add(label);
  regionMeshes[id].label = label;

  // soft glow halo behind label for legibility + neon pop
  const labelGlow = makeGlowSprite(region.color, 5.5);
  labelGlow.position.set(c.x, 6.1, c.z);
  islandGroup.add(labelGlow);
  regionMeshes[id].labelGlow = labelGlow;
}

setupRegion('luzon', luzonOutline);
setupRegion('visayas', visayasOutline);
setupRegion('mindanao', mindanaoOutline);

const ncrCenter = regionCenterWorld('ncr');
const ncrOutline = [0, 1, 2, 3, 4, 5].map(i => {
  const a = (i / 6) * Math.PI * 2;
  return { x: ncrCenter.x + Math.cos(a) * 1.6, z: ncrCenter.z + Math.sin(a) * 1.6 };
});
setupRegion('ncr', ncrOutline);
regionMeshes['ncr'].ring.material.opacity = 0.55;

/* ---------------------------------------------------------------
   LABEL SPRITE HELPER
--------------------------------------------------------------- */
function makeLabelSprite(text, colorCss) {
  const canvasEl = document.createElement('canvas');
  const ctx = canvasEl.getContext('2d');
  canvasEl.width = 512;
  canvasEl.height = 96;
  ctx.font = '700 30px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = colorCss;
  ctx.shadowBlur = 18;
  ctx.fillStyle = colorCss;
  ctx.fillText(text, 256, 48);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(text, 256, 48);

  const tex = new THREE.CanvasTexture(canvasEl);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(7, 1.3, 1);
  return sprite;
}

/* ---------------------------------------------------------------
   GLOW SPRITE HELPER — cheap "fake bloom" via additive radial sprite.
   Avoids needing EffectComposer/UnrealBloomPass addon imports while
   still giving neon elements a soft light-bleed halo.
--------------------------------------------------------------- */
const glowTextureCache = { __neutral: null };
function getNeutralGlowTexture() {
  if (glowTextureCache.__neutral) return glowTextureCache.__neutral;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.38)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  glowTextureCache.__neutral = tex;
  return tex;
}

function makeGlowSprite(hexColor, worldSize) {
  const mat = new THREE.SpriteMaterial({
    map: getNeutralGlowTexture(),
    color: hexColor,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(worldSize, worldSize, 1);
  return sprite;
}

// Flat ground-hugging glow decal (unlike Sprite, doesn't billboard —
// stays parallel to the terrain so it reads correctly from steep
// top-down overview angles).
function makeGlowDecal(hexColor, worldSize) {
  const geo = new THREE.PlaneGeometry(worldSize, worldSize);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: getNeutralGlowTexture(),
    color: hexColor,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(geo, mat);
}

/* ---------------------------------------------------------------
   STORE PINS
--------------------------------------------------------------- */
const pinGroup = new THREE.Group();
scene.add(pinGroup);
const storePins = {};

function statusColor(status) {
  return { approved: 0x4ade80, pending: 0xfbbf24, issue: 0xf87171 }[status];
}

function buildStorePin(store) {
  const g = new THREE.Group();
  const color = statusColor(store.status);

  const beamGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.2, 8, 1, true);
  beamGeo.translate(0, 1.1, 0);
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  g.add(beam);

  const coreGeo = new THREE.SphereGeometry(0.11, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({ color });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 2.2;
  g.add(core);

  // bloom-fake glow halo behind the core light
  const coreGlow = makeGlowSprite(color, 0.9);
  coreGlow.position.y = 2.2;
  g.add(coreGlow);

  // ground-level glow pool under the beam base — flat decal, not a
  // billboard sprite, so it reads correctly from top-down angles
  const groundGlow = makeGlowDecal(color, 1.1);
  groundGlow.position.y = 0.02;
  g.add(groundGlow);

  const ringGeo = new THREE.RingGeometry(0.18, 0.24, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.03;
  g.add(ring);

  const w = geoToWorld(store.lat, store.lon);
  g.position.set(w.x, 0.4, w.z);
  g.userData.storeId = store.id;
  g.userData.isStorePin = true;
  g.scale.setScalar(0.001);

  pinGroup.add(g);
  storePins[store.id] = { group: g, beam, ring, core, coreGlow, groundGlow, baseY: 0.4, pulsePhase: Math.random() * Math.PI * 2 };
}

STORES.forEach(buildStorePin);


/* ---------------------------------------------------------------
   RAYCASTING
--------------------------------------------------------------- */
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const tooltip = document.createElement('div');
tooltip.className = 'store-tooltip';
document.getElementById('app').appendChild(tooltip);

function getPointerTargets(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);

  const pinHits = raycaster.intersectObjects(pinGroup.children, true);
  if (pinHits.length) {
    let obj = pinHits[0].object;
    while (obj && !obj.userData.isStorePin) obj = obj.parent;
    if (obj) return { type: 'pin', storeId: obj.userData.storeId };
  }

  if (state.view === 'overview') {
    const regionHits = raycaster.intersectObjects(
      Object.values(regionMeshes).filter(r => r.hit).map(r => r.hit)
    );
    if (regionHits.length) {
      return { type: 'region', regionId: regionHits[0].object.userData.regionId };
    }
  }
  return null;
}

canvas.addEventListener('pointermove', (e) => {
  if (state.cameraBusy) { tooltip.classList.remove('show'); return; }
  const hit = getPointerTargets(e.clientX, e.clientY);
  if (hit && hit.type === 'pin') {
    const store = STORES.find(s => s.id === hit.storeId);
    tooltip.textContent = `${store.name} · ${STATUS_META[store.status].label}`;
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = e.clientY + 'px';
    tooltip.classList.add('show');
    canvas.style.cursor = 'pointer';
  } else if (hit && hit.type === 'region') {
    tooltip.classList.remove('show');
    canvas.style.cursor = 'pointer';
  } else {
    tooltip.classList.remove('show');
    canvas.style.cursor = 'grab';
  }
});

let dragStart = null;
canvas.addEventListener('pointerdown', (e) => { dragStart = { x: e.clientX, y: e.clientY }; });

canvas.addEventListener('pointerup', (e) => {
  if (state.cameraBusy) return;
  if (dragStart) {
    const moved = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
    if (moved > 6) return;
  }
  const hit = getPointerTargets(e.clientX, e.clientY);
  if (!hit) return;
  if (hit.type === 'pin') {
    selectStoreById(hit.storeId);
  } else if (hit.type === 'region') {
    enterRegion(hit.regionId);
  }
});

/* ---------------------------------------------------------------
   ORBIT CAMERA CONTROL
--------------------------------------------------------------- */
const orbit = {
  target: new THREE.Vector3(0, 0, 0),
  radius: 56,
  theta: 0.62,
  phi: 0.92,
  dragging: false,
  lastX: 0, lastY: 0,
  enabled: true,
};

function updateCameraFromOrbit() {
  const { target, radius, theta, phi } = orbit;
  const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
  const y = target.y + radius * Math.cos(phi);
  const z = target.z + radius * Math.sin(phi) * Math.cos(theta);
  camera.position.set(x, y, z);
  camera.lookAt(target);
}
updateCameraFromOrbit();

canvas.addEventListener('pointerdown', (e) => {
  if (state.cameraBusy || !orbit.enabled) return;
  orbit.dragging = true;
  orbit.lastX = e.clientX; orbit.lastY = e.clientY;
  canvas.style.cursor = 'grabbing';
});
window.addEventListener('pointermove', (e) => {
  if (!orbit.dragging || state.cameraBusy) return;
  const dx = e.clientX - orbit.lastX;
  const dy = e.clientY - orbit.lastY;
  orbit.lastX = e.clientX; orbit.lastY = e.clientY;
  orbit.theta -= dx * 0.0045;
  orbit.phi = THREE.MathUtils.clamp(orbit.phi - dy * 0.0035, 0.25, 1.45);
  updateCameraFromOrbit();
});
window.addEventListener('pointerup', () => { orbit.dragging = false; canvas.style.cursor = 'grab'; });

canvas.addEventListener('wheel', (e) => {
  if (state.cameraBusy || !orbit.enabled) return;
  e.preventDefault();
  orbit.radius = THREE.MathUtils.clamp(orbit.radius + e.deltaY * 0.03, 6, 90);
  updateCameraFromOrbit();
}, { passive: false });

let pinchStartDist = null;
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    pinchStartDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && pinchStartDist && !state.cameraBusy) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const delta = pinchStartDist - dist;
    orbit.radius = THREE.MathUtils.clamp(orbit.radius + delta * 0.05, 6, 90);
    pinchStartDist = dist;
    updateCameraFromOrbit();
  }
}, { passive: true });

/* ---------------------------------------------------------------
   CINEMATIC CAMERA TRANSITIONS
--------------------------------------------------------------- */
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function flyOrbitTo({ target, radius, theta, phi }, duration = 2200, onDone) {
  state.cameraBusy = true;
  orbit.enabled = false;
  showTransitToast(true);

  const start = {
    target: orbit.target.clone(),
    radius: orbit.radius,
    theta: orbit.theta,
    phi: orbit.phi,
  };
  let dTheta = theta - start.theta;
  while (dTheta > Math.PI) dTheta -= Math.PI * 2;
  while (dTheta < -Math.PI) dTheta += Math.PI * 2;

  const t0 = performance.now();
  const midPhiBoost = 0.12;

  function step(now) {
    const t = Math.min((now - t0) / duration, 1);
    const e = easeInOutCubic(t);
    const bank = Math.sin(t * Math.PI) * midPhiBoost;

    orbit.target.lerpVectors(start.target, target, e);
    orbit.radius = THREE.MathUtils.lerp(start.radius, radius, e);
    orbit.theta = start.theta + dTheta * e + Math.sin(t * Math.PI) * 0.15;
    orbit.phi = THREE.MathUtils.lerp(start.phi, phi, e) - bank;

    updateCameraFromOrbit();

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      orbit.target.copy(target);
      orbit.radius = radius; orbit.theta = theta; orbit.phi = phi;
      updateCameraFromOrbit();
      state.cameraBusy = false;
      orbit.enabled = true;
      showTransitToast(false);
      if (onDone) onDone();
    }
  }
  requestAnimationFrame(step);
}

function showTransitToast(show, text) {
  const toast = document.getElementById('transit-toast');
  if (text) document.getElementById('transit-text').textContent = text;
  toast.classList.toggle('show', show);
}

/* ---------------------------------------------------------------
   ANIMATION LOOP
--------------------------------------------------------------- */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  oceanUniforms.uTime.value = t;

  for (const id in storePins) {
    const p = storePins[id];
    const pulse = (Math.sin(t * 2.4 + p.pulsePhase) + 1) / 2;
    p.ring.scale.setScalar(1 + pulse * 0.9);
    p.ring.material.opacity = 0.7 - pulse * 0.45;
    p.core.position.y = 2.2 + Math.sin(t * 1.8 + p.pulsePhase) * 0.06;
    p.coreGlow.position.y = p.core.position.y;
    const glowPulse = 0.85 + Math.sin(t * 2.4 + p.pulsePhase) * 0.18;
    p.coreGlow.scale.set(0.9 * glowPulse, 0.9 * glowPulse, 1);
  }

  Object.values(regionMeshes).forEach((r, i) => {
    r.ring.material.opacity = r.baseOpacity * (0.75 + 0.25 * Math.sin(t * 1.2 + i));
    if (r.cornerGlows) {
      r.cornerGlows.forEach((cg, ci) => {
        const cp = (Math.sin(t * 1.6 + ci * 1.3 + i) + 1) / 2;
        cg.scale.set(0.5 + cp * 0.4, 0.5 + cp * 0.4, 1);
      });
    }
    if (r.labelGlow) {
      r.labelGlow.material.opacity = 0.55 + Math.sin(t * 1.1 + i) * 0.15;
    }
  });

  if (state.view === 'overview' && !state.cameraBusy && !orbit.dragging) {
    orbit.theta += 0.00018;
    updateCameraFromOrbit();
  }

  renderer.render(scene, camera);
}
animate();

/* ---------------------------------------------------------------
   RESIZE
--------------------------------------------------------------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* =================================================================
   UI / APPLICATION LOGIC LAYER
   ================================================================= */

const el = (id) => document.getElementById(id);

function tickClock() {
  const now = new Date();
  el('clock').textContent = now.toLocaleTimeString('en-PH', { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

window.addEventListener('load', () => {
  setTimeout(() => {
    el('boot-overlay').classList.add('hidden');
  }, 1900);
});

function renderRegionList() {
  const list = el('region-list');
  list.innerHTML = '<div class="panel-subhead">Select Region</div>';
  ['luzon', 'visayas', 'mindanao'].forEach((id) => {
    const region = REGIONS[id];
    const stats = regionStats(id);
    const row = document.createElement('div');
    row.className = 'region-row' + (state.activeRegion === id ? ' active' : '');
    row.innerHTML = `
      <div class="region-row-left">
        <span class="region-swatch" style="background:#${region.color.toString(16).padStart(6,'0')}; color:#${region.color.toString(16).padStart(6,'0')}"></span>
        <span class="region-name">${region.name}</span>
      </div>
      <span class="region-count">${stats.total} stores</span>
    `;
    row.addEventListener('click', () => enterRegion(id));
    list.appendChild(row);
  });
}
renderRegionList();

function updateDashboard(regionId) {
  const isOverview = !regionId;
  const stats = isOverview
    ? { total: STORES.length, approved: STORES.filter(s=>s.status==='approved').length, pending: STORES.filter(s=>s.status==='pending').length, issue: STORES.filter(s=>s.status==='issue').length }
    : regionStats(regionId);

  el('dash-title').textContent = isOverview ? 'Philippines Overview' : REGIONS[regionId].name + ' Dashboard';
  el('dash-tag').textContent = isOverview ? 'NETWORK' : 'REGION';
  el('stat-total').textContent = stats.total;
  el('stat-approved').textContent = stats.approved;
  el('stat-pending').textContent = stats.pending;
  el('stat-issue').textContent = stats.issue;
  renderRegionList();
}
updateDashboard(null);

function updateBreadcrumb() {
  const bc = el('breadcrumb');
  let html = `<span class="crumb ${state.view === 'overview' ? 'active' : ''}" data-crumb="overview">Philippines</span>`;
  if (state.activeRegion) {
    html += `<span class="crumb ${state.view !== 'store' ? 'active' : ''}" data-crumb="region">${REGIONS[state.activeRegion].name}</span>`;
  }
  if (state.view === 'store' && state.activeStoreIndex >= 0) {
    const s = state.currentStoreList[state.activeStoreIndex];
    html += `<span class="crumb active" data-crumb="store">${s.name}</span>`;
  }
  bc.innerHTML = html;
  bc.querySelectorAll('.crumb').forEach(c => {
    c.addEventListener('click', () => {
      const which = c.dataset.crumb;
      if (which === 'overview') backToOverview();
      else if (which === 'region' && state.activeRegion) enterRegion(state.activeRegion, true);
    });
  });
}
updateBreadcrumb();

function updateActionCluster() {
  el('btn-back-overview').style.display = (state.view !== 'overview') ? 'inline-flex' : 'none';
}
el('btn-back-overview').addEventListener('click', backToOverview);

function enterRegion(regionId, skipIfSame = false) {
  if (state.cameraBusy) return;
  if (skipIfSame && state.activeRegion === regionId && state.view === 'region') return;

  state.activeRegion = regionId;
  state.view = 'region';
  state.currentStoreList = storesByRegion(regionId);
  closeStorePanel(true);

  const c = regionCenterWorld(regionId);
  const targetVec = new THREE.Vector3(c.x, 0, c.z);

  showTransitToast(true, `Descending into ${REGIONS[regionId].name}…`);
  flyOrbitTo(
    { target: targetVec, radius: 16, theta: orbit.theta + 0.8, phi: 0.78 },
    2400,
    () => {
      updateDashboard(regionId);
      updateBreadcrumb();
      updateActionCluster();
    }
  );
}

function backToOverview() {
  if (state.cameraBusy) return;
  state.view = 'overview';
  state.activeRegion = null;
  state.activeStoreIndex = -1;
  closeStorePanel(true);

  showTransitToast(true, 'Returning to overview…');
  flyOrbitTo(
    { target: new THREE.Vector3(0,0,0), radius: 56, theta: 0.62, phi: 0.92 },
    2200,
    () => {
      updateDashboard(null);
      updateBreadcrumb();
      updateActionCluster();
    }
  );
}

function selectStoreById(storeId) {
  const store = STORES.find(s => s.id === storeId);
  if (!store) return;

  if (state.activeRegion !== store.region && !(state.activeRegion === 'luzon' && store.region === 'ncr')) {
    state.activeRegion = store.region;
    state.currentStoreList = storesByRegion(store.region);
  } else if (state.view === 'overview') {
    state.activeRegion = store.region;
    state.currentStoreList = storesByRegion(store.region);
  }
  if (!state.currentStoreList.length) state.currentStoreList = storesByRegion(store.region);

  const idx = state.currentStoreList.findIndex(s => s.id === storeId);
  state.activeStoreIndex = idx >= 0 ? idx : 0;
  state.view = 'store';

  flyToStore(store, () => {
    openStorePanel(store);
    updateBreadcrumb();
    updateActionCluster();
    updateDashboard(state.activeRegion);
    highlightActivePin(store.id);
  });
}

function flyToStore(store, onDone) {
  showTransitToast(true, `Flying to ${store.name}…`);
  const targetVec = new THREE.Vector3(store.x, 0.4, store.z);
  flyOrbitTo(
    { target: targetVec, radius: 5.5, theta: orbit.theta + 0.9, phi: 0.85 },
    2000,
    onDone
  );
}

function highlightActivePin(storeId) {
  Object.entries(storePins).forEach(([id, p]) => {
    const scale = id === storeId ? 1.6 : 1;
    p.group.scale.setScalar(scale);
  });
}

function animatePinsIn() {
  STORES.forEach((s, i) => {
    const p = storePins[s.id];
    setTimeout(() => {
      const t0 = performance.now();
      function grow(now) {
        const t = Math.min((now - t0) / 500, 1);
        const e = easeInOutCubic(t);
        p.group.scale.setScalar(e);
        if (t < 1) requestAnimationFrame(grow);
      }
      requestAnimationFrame(grow);
    }, 1900 + i * 60);
  });
}
animatePinsIn();

function openStorePanel(store) {
  const liveStatus = store.history[state.timelineIndex].status;
  const meta = STATUS_META[liveStatus];
  el('store-status-chip').textContent = meta.icon + '  ' + meta.label;
  el('store-status-chip').className = 'store-status-chip ' + liveStatus;
  el('store-name').textContent = store.name;
  el('store-loc').textContent = store.city;
  el('store-coords').textContent = `${store.lat.toFixed(4)}° N, ${store.lon.toFixed(4)}° E`;
  el('store-category').textContent = store.category;
  el('store-update').textContent = state.timelineIndex === 5 ? store.lastUpdate : `${MONTHS[state.timelineIndex]} 2026`;
  el('store-traffic').textContent = store.footTraffic.toLocaleString();
  el('store-manager').textContent = store.manager;

  const grid = el('photo-grid');
  grid.innerHTML = '';
  store.photos.forEach((photo, i) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.innerHTML = `<div class="photo-card-icon">🖼️</div><div class="photo-card-label">${photo.label}</div>`;
    card.addEventListener('click', () => openLightbox(store, i));
    grid.appendChild(card);
  });

  el('store-panel').classList.add('open');
}

function closeStorePanel(silent = false) {
  el('store-panel').classList.remove('open');
  if (!silent) {
    state.view = state.activeRegion ? 'region' : 'overview';
    state.activeStoreIndex = -1;
    updateBreadcrumb();
    updateActionCluster();
  }
}
el('store-close').addEventListener('click', () => closeStorePanel(false));

function gotoRelativeStore(delta) {
  if (state.cameraBusy || !state.currentStoreList.length) return;
  let idx = state.activeStoreIndex + delta;
  if (idx < 0) idx = state.currentStoreList.length - 1;
  if (idx >= state.currentStoreList.length) idx = 0;
  state.activeStoreIndex = idx;
  const store = state.currentStoreList[idx];
  closeStorePanel(true);
  flyToStore(store, () => {
    openStorePanel(store);
    updateBreadcrumb();
    highlightActivePin(store.id);
  });
}
el('next-store').addEventListener('click', () => gotoRelativeStore(1));
el('prev-store').addEventListener('click', () => gotoRelativeStore(-1));

let lightboxStore = null;
function openLightbox(store, photoIndex) {
  lightboxStore = store;
  renderLightboxTabs(photoIndex);
  el('lightbox').classList.add('open');
}
function renderLightboxTabs(activeIndex) {
  const tabsWrap = el('lightbox-tabs');
  tabsWrap.innerHTML = '';
  lightboxStore.photos.forEach((p, i) => {
    const tab = document.createElement('div');
    tab.className = 'lightbox-tab' + (i === activeIndex ? ' active' : '');
    tab.textContent = p.label;
    tab.addEventListener('click', () => {
      el('lightbox-caption').textContent = `${lightboxStore.name} — ${p.label}`;
      renderLightboxTabs(i);
    });
    tabsWrap.appendChild(tab);
  });
  el('lightbox-caption').textContent = `${lightboxStore.name} — ${lightboxStore.photos[activeIndex].label}`;
}
el('lightbox-close').addEventListener('click', () => el('lightbox').classList.remove('open'));
el('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') el('lightbox').classList.remove('open');
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June'];
function renderTimelineTicks() {
  const wrap = el('timeline-ticks');
  wrap.innerHTML = '';
  MONTHS.forEach((m, i) => {
    const t = document.createElement('span');
    t.className = 'timeline-tick' + (i === state.timelineIndex ? ' current' : '');
    t.textContent = m.slice(0, 3);
    wrap.appendChild(t);
  });
}
function setTimelineIndex(idx) {
  state.timelineIndex = idx;
  el('timeline-month').textContent = `${MONTHS[idx]} 2026`;
  const slider = el('timeline-slider');
  slider.value = idx;
  slider.style.setProperty('--fill', `${(idx / 5) * 100}%`);
  renderTimelineTicks();
  applyTimelineToScene(idx);
}
function applyTimelineToScene(idx) {
  STORES.forEach((s) => {
    const hist = s.history[idx];
    const p = storePins[s.id];
    if (!p) return;
    const color = statusColor(hist.status);
    p.beam.material.color.setHex(color);
    p.core.material.color.setHex(color);
    p.ring.material.color.setHex(color);
    p.coreGlow.material.color.setHex(color);
    p.groundGlow.material.color.setHex(color);
    const flashT0 = performance.now();
    function flash(now) {
      const t = Math.min((now - flashT0) / 400, 1);
      const s2 = 1 + (1 - t) * 0.8;
      p.core.scale.setScalar(s2);
      if (t < 1) requestAnimationFrame(flash);
      else p.core.scale.setScalar(1);
    }
    requestAnimationFrame(flash);
  });

  const list = state.activeRegion ? storesByRegion(state.activeRegion) : STORES;
  const approved = list.filter(s => s.history[idx].status === 'approved').length;
  const pending = list.filter(s => s.history[idx].status === 'pending').length;
  const issue = list.filter(s => s.history[idx].status === 'issue').length;
  el('stat-approved').textContent = approved;
  el('stat-pending').textContent = pending;
  el('stat-issue').textContent = issue;
}
el('timeline-slider').addEventListener('input', (e) => {
  setTimelineIndex(parseInt(e.target.value, 10));
});
renderTimelineTicks();
setTimelineIndex(5);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (el('lightbox').classList.contains('open')) { el('lightbox').classList.remove('open'); return; }
    if (state.view === 'store') { closeStorePanel(false); return; }
    if (state.view === 'region') { backToOverview(); return; }
  }
  if (state.view === 'store') {
    if (e.key === 'ArrowRight') gotoRelativeStore(1);
    if (e.key === 'ArrowLeft') gotoRelativeStore(-1);
  }
});

updateActionCluster();
