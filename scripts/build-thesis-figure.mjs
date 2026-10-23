// Builds the thesis figure in cv.html from a real simulation on toy 2-D data:
// an Annoy-style tree, Annoy's best-first search, and conformal risk control (CRC).
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const N = 160, K = 10, LEAF = 8, CALIBRATION = 1000, TEST = 2000, SAMPLES = 40;
const ALPHAS = [10, 5, 1];

let seed = 7;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const clusters = Array.from({ length: 5 }, () => [0.2 + 0.6 * random(), 0.2 + 0.6 * random(), 0.05 + 0.06 * random()]);
// Data and queries come from the same distribution, which CRC requires.
const sample = () => {
  for (;;) {
    const [cx, cy, s] = clusters[Math.floor(random() * clusters.length)];
    const p = random() < 0.15 ? [random(), random()] : [cx + s * gaussian(), cy + s * gaussian()];
    if (p[0] > 0.03 && p[0] < 0.97 && p[1] > 0.03 && p[1] < 0.97) return p;
  }
};
const points = Array.from({ length: N }, sample);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Clip a convex polygon to the half-plane n·x + b >= 0.
const clip = (polygon, [nx, ny], b) => {
  const side = ([x, y]) => nx * x + ny * y + b;
  const out = [];
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length], sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  });
  return out;
};

// Annoy's Euclidean split: two-means centroids, then the hyperplane between them.
const leaves = [];
const build = (items, polygon) => {
  if (items.length <= LEAF) {
    leaves.push({ items, polygon });
    return { leaf: leaves.length - 1 };
  }
  let a = points[items[Math.floor(random() * items.length)]], b = a;
  while (b === a) b = points[items[Math.floor(random() * items.length)]];
  for (let round = 0; round < 5; round++) {
    const near = [[], []];
    for (const i of items) near[distance(points[i], a) <= distance(points[i], b) ? 0 : 1].push(points[i]);
    if (!near[0].length || !near[1].length) break;
    const mean = (group) => [0, 1].map((d) => group.reduce((sum, p) => sum + p[d], 0) / group.length);
    [a, b] = [mean(near[0]), mean(near[1])];
  }
  const length = distance(a, b);
  const normal = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const offset = -(normal[0] * (a[0] + b[0]) + normal[1] * (a[1] + b[1])) / 2;
  const margin = (p) => normal[0] * p[0] + normal[1] * p[1] + offset;
  const right = items.filter((i) => margin(points[i]) > 0), left = items.filter((i) => margin(points[i]) <= 0);
  if (!right.length || !left.length) {
    leaves.push({ items, polygon });
    return { leaf: leaves.length - 1 };
  }
  return {
    margin,
    left: build(left, clip(polygon, normal.map((v) => -v), -offset)),
    right: build(right, clip(polygon, normal, offset)),
  };
};
const tree = build(points.map((_, i) => i), [[0, 0], [1, 0], [1, 1], [0, 1]]);

// Annoy's search: open the most promising region first until search_k points are collected.
const visitOrder = (query) => {
  const queue = [[Infinity, tree]], order = [];
  while (queue.length) {
    queue.sort((x, y) => y[0] - x[0]);
    const [priority, node] = queue.shift();
    if ('leaf' in node) order.push(node.leaf);
    else {
      const m = node.margin(query);
      queue.push([Math.min(priority, m), node.right], [Math.min(priority, -m), node.left]);
    }
  }
  return order;
};
const truth = (query) => points.map((p, i) => [distance(p, query), i]).sort((x, y) => x[0] - y[0]).slice(0, K).map(([, i]) => i);
const run = (query, searchK) => {
  const visited = [], seen = new Set();
  for (const leaf of visitOrder(query)) {
    if (seen.size >= searchK) break;
    visited.push(leaf);
    leaves[leaf].items.forEach((i) => seen.add(i));
  }
  // With exact re-ranking, a true neighbor is returned exactly when it was checked.
  const nearest = truth(query);
  return { visited, checked: seen.size, found: nearest.filter((i) => seen.has(i)), nearest };
};
const missRate = (query, searchK) => 1 - run(query, searchK).found.length / K;

// CRC: the smallest search_k where (n·mean loss + B) / (n + 1) <= alpha, with loss bound B = 1.
const calibration = Array.from({ length: CALIBRATION }, sample);
const test = Array.from({ length: TEST }, sample);
const levels = ALPHAS.map((alpha) => {
  let searchK = K;
  while (searchK < N) {
    const total = calibration.reduce((sum, q) => sum + missRate(q, searchK), 0);
    if ((total + 1) / (CALIBRATION + 1) <= alpha / 100) break;
    searchK++;
  }
  const testMiss = test.reduce((sum, q) => sum + missRate(q, searchK), 0) / TEST;
  return { alpha, searchK, testMiss };
});
for (const level of levels) assert.ok(level.testMiss <= level.alpha / 100, `Test misses stay under ${level.alpha}%`);
assert.ok(levels[0].searchK < levels[1].searchK && levels[1].searchK < levels[2].searchK);

// Show one test search where a stricter alpha visibly recovers matches; prefer a central query with spread-out matches.
const misses = (query) => levels.map((level) => K - run(query, level.searchK).found.length);
const spread = (query) => distance(points[truth(query).at(-1)], query);
const example = test.filter((q) => {
  const [m10, m5, m1] = misses(q);
  return m10 >= 2 && m10 > m5 && m5 > m1 && m1 === 0 && spread(q) >= 0.13;
}).sort((a, b) => distance(a, [0.5, 0.5]) - distance(b, [0.5, 0.5]))[0];
assert.ok(example, 'An example search shows the effect of alpha');
const runs = levels.map((level) => run(example, level.searchK));

const f = (v) => (v * 100).toFixed(2).replace(/\.?0+$/, '');
const svgPoint = ([x, y]) => `${f(x)},${f(y)}`;
const tags = (test) => ALPHAS.filter((_, l) => test(l)).map((a) => `a${a}`).join(' ');
const regions = leaves.map((leaf, i) => {
  const step = runs.map((r) => r.visited.indexOf(i)).find((s) => s >= 0) ?? 0;
  return `<polygon class="${tags((l) => runs[l].visited.includes(i))}" style="--step:${step}" points="${leaf.polygon.map(svgPoint).join(' ')}"/>`;
});
const nearest = new Set(runs[0].nearest);
const dots = points.map((p, i) => nearest.has(i)
  ? `<circle class="thesis-match ${tags((l) => runs[l].found.includes(i))}" cx="${f(p[0])}" cy="${f(p[1])}" r="1.6"/>`
  : `<circle cx="${f(p[0])}" cy="${f(p[1])}" r=".75"/>`);
const [qx, qy] = example.map(f);
const columns = test.slice(0, SAMPLES).map((q, column) => {
  const counts = misses(q);
  return Array.from({ length: K }, (_, row) => {
    const missed = tags((l) => K - 1 - row < counts[l]);
    return `<rect${missed ? ` class="${missed}"` : ''} x="${column * 5}" y="${row * 5}" width="4" height="4"/>`;
  }).join('');
});
const readouts = levels.map((level, l) => `<span class="thesis-a${level.alpha}">Finds ${runs[l].found.length} of ${K} · checks ${runs[l].checked} of ${N}</span>`);
const averages = levels.map((level) => `<span class="thesis-a${level.alpha}">Average missed <strong>${(level.testMiss * 100).toFixed(1)}%</strong> · limit ${level.alpha}%</span>`);

const figure = `<!-- thesis-figure:start (generated by scripts/build-thesis-figure.mjs) -->
        <figure class="thesis-search" aria-labelledby="thesis-search-title">
          <figcaption id="thesis-search-title">Allowed misses (&alpha;)</figcaption>
          <div class="thesis-risk-options" role="radiogroup" aria-labelledby="thesis-search-title">
${ALPHAS.map((a) => `            <label><input type="radio" name="thesis-risk" id="thesis-risk-${a}" value="${a}"${a === 5 ? ' checked' : ''} />${a}%</label>`).join('\n')}
          </div>
          <svg class="thesis-map" viewBox="0 0 100 100" role="img" aria-label="One search. A lower allowed miss rate checks more regions and finds more of the ten closest matches.">
            <g class="thesis-regions">${regions.join('')}</g>
            <g class="thesis-points">${dots.join('')}</g>
            <path class="thesis-query" d="M${qx - 3.5} ${qy}h7M${qx} ${qy - 3.5}v7"/>
          </svg>
          <p class="thesis-readout" aria-live="polite">${readouts.join('')}</p>
          <div class="thesis-key" aria-hidden="true">
            <span><i class="thesis-key-query">+</i>Query</span>
            <span><i class="thesis-key-found"></i>Found</span>
            <span><i class="thesis-key-missed"></i>Missed</span>
          </div>
          <svg class="thesis-tally" viewBox="0 0 ${SAMPLES * 5 - 1} ${K * 5 - 1}" role="img" aria-label="Forty searches, one per column. Grey squares are missed matches.">${columns.join('')}</svg>
          <p class="thesis-readout" aria-live="polite">${averages.join('')}</p>
        </figure>
        <!-- thesis-figure:end -->`;

const html = await readFile('cv.html', 'utf8');
const marked = /<!-- thesis-figure:start[\s\S]*?<!-- thesis-figure:end -->/;
assert.ok(marked.test(html), 'cv.html has thesis-figure markers');
await writeFile('cv.html', html.replace(marked, figure));
console.log(levels.map((l) => `alpha ${l.alpha}%: search_k ${l.searchK}, test misses ${(l.testMiss * 100).toFixed(2)}%`).join('\n'));
console.log(`example misses per alpha: ${misses(example).join(', ')}`);
