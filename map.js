// The embedding map. Every dot is one chunk from knowledge.json, placed by meaning.
// Lesson 3 draws the dots. Lesson 4 (the search box) embeds your question with the
// same model, in your browser, and finds the dots closest to it.
import * as THREE from 'three';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const COLORS = { about: '#e9edf0', experience: '#ffb224', project: '#5fd3ff', skill: '#7be0a3', education: '#b79cff' };

const canvas = document.getElementById('map');
const figure = canvas.closest('figure');
const tip = document.getElementById('tip');
const form = document.getElementById('ask');
const input = document.getElementById('q');
const status = document.getElementById('askstatus');
const hits = document.getElementById('hits');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

const decode = (b64) => Float32Array.from(new Int8Array(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer), (x) => x / 127);

let data;
try {
  const [k, e] = await Promise.all(['knowledge.json', 'embeddings.json'].map((f) => fetch(f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); })));
  const byId = new Map(e.chunks.map((c) => [c.id, c]));
  data = {
    projection: e.projection,
    model: e.model,
    points: k.chunks.filter((c) => byId.has(c.id)).map((c) => ({ ...c, pos: byId.get(c.id).pos, vec: decode(byId.get(c.id).vec) })),
  };
} catch (err) {
  figure.hidden = true;
}

let renderer;
if (data) {
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (err) { figure.hidden = true; }
}

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, 0, 3.7);
  const cloud = new THREE.Group();
  scene.add(cloud);

  // One soft round texture, tinted per group.
  const dot = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.22, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  const R = 1.25; // spread of the cloud
  const sprites = data.points.map((p) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: COLORS[p.group] ?? '#ffffff', transparent: true, depthWrite: false }));
    s.position.set(p.pos[0] * R, p.pos[1] * R, p.pos[2] * R);
    s.scale.setScalar(0.24);
    s.userData = p;
    cloud.add(s);
    return s;
  });

  // Faint threads between each fact and its two nearest neighbours in the full 384-d space.
  const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / Math.sqrt(na * nb); };
  const threads = [];
  data.points.forEach((p, i) => {
    data.points.map((q, j) => [j, i === j ? -1 : cos(p.vec, q.vec)]).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .forEach(([j]) => threads.push(sprites[i].position, sprites[j].position));
  });
  cloud.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(threads), new THREE.LineBasicMaterial({ color: 0x8a97a6, transparent: true, opacity: 0.22 })));

  // The visitor's question, once asked.
  const probe = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#ffffff', transparent: true, depthWrite: false }));
  probe.scale.setScalar(0.3); probe.visible = false; cloud.add(probe);
  const beams = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb224 }));
  beams.visible = false; cloud.add(beams);

  // Orbit by dragging; drifts slowly when left alone.
  let vx = 0, vy = still ? 0 : 0.12, dragging = false, moved = 0, lx = 0, ly = 0, hover = null, top = [];
  cloud.rotation.set(0.25, -0.5, 0);
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const pick = (e) => {
    const b = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    return ray.intersectObjects(sprites)[0]?.object ?? null;
  };
  canvas.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.classList.add('held'); });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      vy = dx * 0.35; vx = dy * 0.35;
      cloud.rotation.y += dx * 0.006; cloud.rotation.x += dy * 0.006;
      tip.hidden = true; return;
    }
    hover = pick(e);
    canvas.classList.toggle('over', !!hover);
    if (hover) {
      const b = canvas.getBoundingClientRect(), p = hover.userData;
      tip.innerHTML = '';
      const t = document.createElement('strong'); t.textContent = p.title;
      const d = document.createElement('span'); d.textContent = p.text.length > 150 ? p.text.slice(0, 147).replace(/\s+\S*$/, '') + '…' : p.text;
      tip.append(t, d);
      tip.style.left = Math.min(b.width - 250, Math.max(0, e.clientX - b.left + 14)) + 'px';
      tip.style.top = (e.clientY - b.top + 16) + 'px';
      tip.hidden = false;
    } else tip.hidden = true;
  });
  const up = (e) => {
    canvas.classList.remove('held');
    if (dragging && moved < 5) { const s = pick(e); if (s) location.href = s.userData.link; }
    dragging = false;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { dragging = false; canvas.classList.remove('held'); });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; hover = null; });

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  let visible = true, last = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    fit();
    if (!dragging) {
      cloud.rotation.y += vy * dt; cloud.rotation.x += vx * dt;
      const idle = still ? 0 : 0.12;
      vy += (idle - vy) * Math.min(1, dt * 1.5); vx += (0 - vx) * Math.min(1, dt * 1.5);
    }
    cloud.rotation.x = Math.max(-1.2, Math.min(1.2, cloud.rotation.x));
    const pulse = 1 + 0.12 * Math.sin(now / 260);
    sprites.forEach((s) => {
      const isTop = top.includes(s), target = isTop ? 0.4 * (still ? 1 : pulse) : s === hover ? 0.32 : 0.24;
      s.scale.setScalar(s.scale.x + (target - s.scale.x) * 0.2);
      s.material.opacity += ((top.length && !isTop ? 0.28 : 1) - s.material.opacity) * 0.15;
    });
    renderer.render(scene, camera);
  })(last);

  // ---- Lesson 4: retrieval ----
  let extractor;
  async function embed(text) {
    if (!extractor) {
      status.textContent = 'Loading the embedding model (about 23 MB, first time only)…';
      const { pipeline } = await import(LIB);
      extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
    }
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    return Float32Array.from(out.data);
  }
  const project = (v) => {
    const { mean, axes, scale } = data.projection;
    return axes.map((a) => { let s = 0; for (let i = 0; i < v.length; i++) s += (v[i] - mean[i]) * a[i]; return s * scale * R; });
  };

  async function ask(text) {
    hits.innerHTML = '';
    const v = await embed(text);
    const ranked = sprites.map((s) => [s, cos(v, s.userData.vec)]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    top = ranked.map(([s]) => s);
    probe.position.set(...project(v)); probe.visible = true;
    beams.geometry.dispose();
    beams.geometry = new THREE.BufferGeometry().setFromPoints(top.flatMap((s) => [probe.position, s.position]));
    beams.visible = true;
    status.textContent = ranked[0][1] < 0.25
      ? 'Nothing sits close to that. These are the nearest facts anyway:'
      : 'The white dot is your question. Nearest facts by meaning:';
    for (const [s, score] of ranked) {
      const li = document.createElement('li');
      const a = document.createElement('a'); a.href = s.userData.link; a.textContent = s.userData.title;
      a.style.setProperty('--c', COLORS[s.userData.group]);
      const m = document.createElement('span'); m.textContent = Math.round(score * 100) + '% match';
      li.append(a, m); hits.append(li);
    }
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    form.classList.add('busy');
    try { await ask(text); }
    catch (err) { status.textContent = 'The embedding model could not load. Check your connection and try again.'; console.error(err); }
    form.classList.remove('busy');
  });
  window.__mapReady = data.points.length;
  window.__mapAsk = ask;
}
