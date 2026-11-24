// Lesson 2: turn every chunk in knowledge.json into an embedding.
//
//   node tools/embed.mjs            real run (GitHub Actions does this on every change)
//   node tools/embed.mjs --offline  fake vectors, for testing the map with no model
//
// Output: embeddings.json, holding for each chunk
//   vec  its 384-number embedding, squeezed to one byte per number
//   pos  where it sits on the 3D map
// plus the recipe (mean, axes, scale) for dropping a brand-new question onto the same map.
import { readFileSync, writeFileSync } from 'node:fs';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const DIM = 384;
const offline = process.argv.includes('--offline');
const root = new URL('../', import.meta.url);
const { chunks } = JSON.parse(readFileSync(new URL('knowledge.json', root), 'utf8'));

// What we embed: the title and the text together, so short titles add signal.
const inputs = chunks.map((c) => `${c.title}. ${c.text}`);

let vectors;
if (offline) {
  // Hash each word into a bucket. Meaningless as language, but the right shape.
  vectors = inputs.map((t) => {
    const v = new Float64Array(DIM);
    for (const w of t.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      let h = 2166136261;
      for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      v[(h >>> 0) % DIM] += 1;
    }
    const n = Math.hypot(...v) || 1;
    return Array.from(v, (x) => x / n);
  });
} else {
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  const out = await extractor(inputs, { pooling: 'mean', normalize: true });
  vectors = out.tolist();
}
if (vectors.length !== chunks.length || vectors[0].length !== DIM) {
  throw new Error(`Expected ${chunks.length} x ${DIM}, got ${vectors.length} x ${vectors[0]?.length}`);
}

// ---- Lesson 3: PCA, from 384 dimensions down to the 3 that spread the points most ----
const n = vectors.length;
const mean = Array.from({ length: DIM }, (_, j) => vectors.reduce((s, v) => s + v[j], 0) / n);
const X = vectors.map((v) => v.map((x, j) => x - mean[j]));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// With 27 points it is far cheaper to work on the 27x27 table of point-to-point
// similarities than on the 384x384 one. Same answer.
const G = X.map((a) => X.map((b) => dot(a, b)));
const axes = [];
for (let k = 0; k < 3; k++) {
  let u = Array.from({ length: n }, (_, i) => Math.sin(i * 12.9898 + k * 78.233)); // fixed start, so reruns match
  for (let it = 0; it < 500; it++) {
    const w = G.map((row) => dot(row, u));
    const len = Math.hypot(...w);
    u = w.map((x) => x / len);
  }
  const lambda = dot(u, G.map((row) => dot(row, u)));
  const axis = Array.from({ length: DIM }, (_, j) => X.reduce((s, x, i) => s + x[j] * u[i], 0) / Math.sqrt(lambda));
  axes.push(axis);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) G[i][j] -= lambda * u[i] * u[j]; // remove it, find the next
}

let pos = X.map((x) => axes.map((a) => dot(x, a)));
const scale = 1 / Math.max(...pos.map((p) => Math.hypot(...p)));
pos = pos.map((p) => p.map((x) => +(x * scale).toFixed(4)));

const toBytes = (v) => Buffer.from(Int8Array.from(v, (x) => Math.max(-127, Math.min(127, Math.round(x * 127)))).buffer).toString('base64');
const round = (a) => a.map((x) => +x.toFixed(5));

writeFileSync(new URL('embeddings.json', root), JSON.stringify({
  model: offline ? 'offline-test' : MODEL,
  dim: DIM,
  projection: { mean: round(mean), axes: axes.map(round), scale: +scale.toFixed(5) },
  chunks: chunks.map((c, i) => ({ id: c.id, pos: pos[i], vec: toBytes(vectors[i]) })),
}));
console.log(`Embedded ${n} chunks with ${offline ? 'offline test vectors' : MODEL}. Wrote embeddings.json.`);
