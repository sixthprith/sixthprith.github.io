// Turbofan hero: every part is generated in code, no model or image files.
// Drag sideways to spin the fan up; it coasts back down to idle.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('engine');
const readout = document.getElementById('n1');
const bar = document.getElementById('n1bar');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) {
  canvas.closest('figure').hidden = true;
}

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 8.1);

  const amber = new THREE.PointLight(0xffb224, 60, 20);
  amber.position.set(-4, -2.5, 3);
  scene.add(amber);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 6);
  scene.add(key);

  const metal = (color, roughness, metalness = 1) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });

  const engine = new THREE.Group();
  scene.add(engine);

  // Nacelle: an airfoil-section ring, lathed around the engine axis.
  const lip = [[1.80, -1.0], [1.76, 0.1], [1.80, 0.62], [1.88, 0.74], [1.98, 0.70], [2.07, 0.45], [2.10, 0.0], [2.02, -0.8], [1.90, -1.0], [1.80, -1.0]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const nacelle = new THREE.Mesh(new THREE.LatheGeometry(lip, 120), metal(0x20262e, 0.42, 0.85));
  nacelle.rotation.x = Math.PI / 2;
  engine.add(nacelle);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.885, 0.05, 16, 160), metal(0xd9dee3, 0.18));
  ring.position.z = 0.72;
  engine.add(ring);

  // Acoustic liner and the dark behind the fan.
  const liner = new THREE.Mesh(new THREE.CylinderGeometry(1.765, 1.765, 0.5, 96, 1, true), metal(0x3a424c, 0.75, 0.4));
  liner.rotation.x = Math.PI / 2;
  liner.position.z = 0.3;
  engine.add(liner);
  const back = new THREE.Mesh(new THREE.CircleGeometry(1.8, 64), new THREE.MeshBasicMaterial({ color: 0x06080a }));
  back.position.z = -0.75;
  engine.add(back);

  // Stator vanes behind the fan give the depth something to catch light on.
  const vaneGeo = new THREE.PlaneGeometry(0.34, 1.25);
  const vaneMat = metal(0x59636e, 0.5, 0.9);
  for (let i = 0; i < 38; i++) {
    const pivot = new THREE.Group();
    const vane = new THREE.Mesh(vaneGeo, vaneMat);
    vane.position.y = 1.15;
    vane.rotation.y = 1.15;
    pivot.add(vane);
    pivot.rotation.z = (i / 38) * Math.PI * 2;
    pivot.position.z = -0.5;
    engine.add(pivot);
  }

  // Rotor: spinner plus swept, twisted blades.
  const rotor = new THREE.Group();
  engine.add(rotor);

  const cone = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    cone.push(new THREE.Vector2(0.56 * Math.sqrt(t), 0.95 - 0.95 * t * t * 0.9));
  }
  const spinner = new THREE.Mesh(new THREE.LatheGeometry(cone, 64), metal(0xcfd5db, 0.2));
  spinner.rotation.x = Math.PI / 2;
  spinner.position.z = -0.1;
  rotor.add(spinner);

  // The painted swirl that lets ground crew see a spinning fan.
  const swirlPts = [];
  for (let i = 0; i <= 60; i++) {
    const t = 0.12 + (i / 60) * 0.88;
    const r = 0.565 * Math.sqrt(t), z = 0.95 - 0.95 * t * t * 0.9 - 0.1 + 0.004;
    const a = t * Math.PI * 2.2;
    swirlPts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
  }
  const swirl = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(swirlPts), 80, 0.02, 6),
    new THREE.MeshStandardMaterial({ color: 0xffb224, roughness: 0.5, metalness: 0.1 })
  );
  rotor.add(swirl);

  const BLADES = 24;
  const bladeGeo = new THREE.PlaneGeometry(1, 1, 6, 18);
  const p = bladeGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);            // -0.5..0.5 across the chord
    const s = p.getY(i) + 0.5;      // 0 root .. 1 tip
    const r = 0.5 + s * 1.235;
    const chord = 0.36 + 0.42 * Math.sin(s * 2.2);
    const twist = 1.05 - 0.62 * s;  // steep at the root, flatter at the tip
    const sweep = 0.22 * s * s;     // tips lean into the rotation
    const camber = 0.06 * (1 - 4 * u * u);
    const x = u * chord * Math.cos(twist) + sweep;
    const z = u * chord * Math.sin(twist) + camber;
    p.setXYZ(i, x, r, z);
  }
  bladeGeo.computeVertexNormals();
  const bladeMat = metal(0xaeb6be, 0.3, 0.95);
  for (let i = 0; i < BLADES; i++) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.rotation.z = (i / BLADES) * Math.PI * 2;
    rotor.add(blade);
  }

  // Start three-quarter on, nose toward the page text.
  const REST_Y = -0.48, REST_X = 0.12;
  engine.rotation.set(REST_X, REST_Y, 0);

  // Interaction: sideways drag adds speed, friction brings it back to idle.
  const IDLE = still ? 0 : 0.9, MAX = 26;
  let speed = IDLE, dragging = false, lastX = 0, tiltX = 0, tiltY = 0;

  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.classList.add('held'); });
  canvas.addEventListener('pointermove', (e) => {
    const b = canvas.getBoundingClientRect();
    tiltY = ((e.clientX - b.left) / b.width - 0.5) * 0.25;
    tiltX = ((e.clientY - b.top) / b.height - 0.5) * 0.18;
    if (!dragging) return;
    speed = Math.min(MAX, speed + Math.abs(e.clientX - lastX) * 0.09);
    lastX = e.clientX;
  });
  const release = () => { dragging = false; canvas.classList.remove('held'); };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { tiltX = 0; tiltY = 0; });
  canvas.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { speed = Math.min(MAX, speed + 5); e.preventDefault(); }
  });

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let visible = true, last = performance.now(), shown = -1;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible) return;
    fit();
    if (!dragging) speed += (IDLE - speed) * Math.min(1, dt * 0.55);
    rotor.rotation.z -= speed * dt;
    engine.rotation.y += (REST_Y + tiltY - engine.rotation.y) * 0.06;
    engine.rotation.x += (REST_X + tiltX - engine.rotation.x) * 0.06;
    const pct = Math.round((speed / MAX) * 100);
    if (pct !== shown) {
      shown = pct;
      readout.textContent = pct + '%';
      bar.style.transform = 'scaleX(' + pct / 100 + ')';
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.__engineReady = true;
}
