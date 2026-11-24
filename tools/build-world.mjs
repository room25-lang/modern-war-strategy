// 地図データ生成（Natural Earth 50m, パブリックドメイン）→ public/data/world.json
import fs from 'fs';
import { feature, merge } from 'topojson-client';
import { geoContains } from 'd3-geo';
import { Delaunay } from 'd3-delaunay';
import pc from 'polygon-clipping';
import { NODES, EXTRA_EDGES, BLOCK_EDGES, SEA_ZONES, SEA_ADJ, REGIONS } from './nodes.mjs';

export const W = 4096;
const SEAM = -169;
const LAT_TOP = 78, LAT_BOT = -56;
const miller = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * Math.PI / 180));
const yTop = miller(LAT_TOP), yBot = miller(LAT_BOT);
export const H = Math.round(W * (yTop - yBot) / (2 * Math.PI));
const normLon = (lon) => (lon < SEAM ? lon + 360 : lon);
export function proj(lon, lat) {
  const la = Math.max(LAT_BOT, Math.min(LAT_TOP, lat));
  return [((normLon(lon) - SEAM) / 360) * W, ((yTop - miller(la)) / (yTop - yBot)) * H];
}
const r1 = (v) => Math.round(v * 10) / 10;

const topo = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json'));
const countries = feature(topo, topo.objects.countries).features;
const land = feature(topo, topo.objects.land);
const ALIAS = { '344': '156', '446': '156', '316': '840', '630': '840' };

// 国ごとのポリゴン（投影済み）
const polys = {}; // id -> MultiPolygon [[[x,y]...]...]
for (const f of countries) {
  let id = String(f.id ?? 'x');
  if (id === '010') continue; // 南極
  id = ALIAS[id] ?? id;
  const g = f.geometry; if (!g) continue;
  const list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of list) {
    // 経度の継ぎ目をまたぐリングは東側へ寄せる
    const out = [];
    for (const ring of poly) {
      if (ring.every(([, la]) => la > LAT_TOP + 2 || la < LAT_BOT - 2)) continue;
      const lons = ring.map(([lo]) => normLon(lo));
      const crosses = Math.max(...lons) - Math.min(...lons) > 300;
      const pts = [];
      let last = null;
      for (const [lo, la] of ring) {
        let L = normLon(lo);
        if (crosses && L < 0) L += 360;
        const p = [((L - SEAM) / 360) * W, proj(lo, la)[1]];
        if (last && Math.abs(p[0] - last[0]) < 0.7 && Math.abs(p[1] - last[1]) < 0.7) continue;
        pts.push([r1(p[0]), r1(p[1])]); last = p;
      }
      if (pts.length >= 4) { if (pts[0][0] !== pts.at(-1)[0] || pts[0][1] !== pts.at(-1)[1]) pts.push(pts[0]); out.push(pts); }
    }
    if (out.length) (polys[id] ??= []).push(out);
  }
}

// 拠点
const nodes = NODES.map(([name, lon, lat, country, flags, ind], id) => {
  const [x, y] = proj(lon, lat);
  return { id, name, lon, lat, x: r1(x), y: r1(y), country, capital: flags.includes('c'), port: flags.includes('p'), airbase: flags.includes('a') || flags.includes('c'), adSite: flags.includes('d') || flags.includes('c'), ind, region: 0, zones: [] };
});
const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));
const hav = (a, b) => {
  const R = 6371, t = Math.PI / 180;
  const dla = (b[1] - a[1]) * t, dlo = (b[0] - a[0]) * t;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// 州（ボロノイ×国境）
const provinces = [];
const fillers = [];
const byCountry = {};
for (const n of nodes) (byCountry[n.country] ??= []).push(n);
for (const [cid, mp] of Object.entries(polys)) {
  const ns = byCountry[cid];
  if (!ns) { fillers.push({ country: cid, paths: mp.flat() }); continue; }
  if (ns.length === 1) { provinces.push({ node: ns[0].id, paths: mp.flat() }); continue; }
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of mp) for (const r of p) for (const [x, y] of r) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
  for (const n of ns) { minx = Math.min(minx, n.x); miny = Math.min(miny, n.y); maxx = Math.max(maxx, n.x); maxy = Math.max(maxy, n.y); }
  const del = Delaunay.from(ns.map((n) => [n.x, n.y]));
  const vor = del.voronoi([minx - 10, miny - 10, maxx + 10, maxy + 10]);
  ns.forEach((n, i) => {
    const cell = vor.cellPolygon(i);
    if (!cell) return;
    let res;
    try { res = pc.intersection(mp, [cell]); } catch (e) { console.warn('clip fail', n.name, e.message); return; }
    const paths = res.flat().map((r) => r.map(([x, y]) => [r1(x), r1(y)]));
    if (paths.length) provinces.push({ node: n.id, paths });
  });
}

// 陸路
const landEdges = new Map();
const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const del = Delaunay.from(nodes.map((n) => [n.x, n.y]));
for (let e = 0; e < del.halfedges.length; e++) {
  const j = del.halfedges[e]; if (j < e) continue;
  const a = del.triangles[e], b = del.triangles[e % 3 === 2 ? e - 2 : e + 1];
  const A = nodes[a], B = nodes[b];
  const km = hav([A.lon, A.lat], [B.lon, B.lat]);
  if (km > 2600) continue;
  let onLand = 0; const S = 13;
  for (let s = 0; s <= S; s++) {
    const t = s / S;
    let dlo = B.lon - A.lon; if (dlo > 180) dlo -= 360; if (dlo < -180) dlo += 360;
    if (geoContains(land, [A.lon + dlo * t, A.lat + (B.lat - A.lat) * t])) onLand++;
  }
  if (onLand / (S + 1) >= 0.86) landEdges.set(key(a, b), [a, b, Math.round(km)]);
}
for (const [x, y] of EXTRA_EDGES) { const A = byName[x], B = byName[y]; landEdges.set(key(A.id, B.id), [A.id, B.id, Math.round(hav([A.lon, A.lat], [B.lon, B.lat]))]); }
for (const [x, y] of BLOCK_EDGES) landEdges.delete(key(byName[x].id, byName[y].id));

// 海域と空域
const zones = SEA_ZONES.map(([name, anchors], i) => {
  const [x, y] = proj(...anchors[0]);
  return { id: i, name, lon: anchors[0][0], lat: anchors[0][1], x: r1(x), y: r1(y), anchors, adj: [], region: 0 };
});
for (const [a, b] of SEA_ADJ) { zones[a].adj.push(b); zones[b].adj.push(a); }
const regions = REGIONS.map(([name, anchors], i) => { const [x, y] = proj(...anchors[0]); return { id: i, name, x: r1(x), y: r1(y), anchors }; });
const nearest = (lon, lat, list) => {
  let best = [], d;
  list.forEach((z, i) => { const m = Math.min(...z.anchors.map((a) => hav([lon, lat], a))); best.push([m, i]); });
  best.sort((a, b) => a[0] - b[0]);
  return best;
};
for (const n of nodes) {
  n.region = nearest(n.lon, n.lat, regions)[0][1];
  if (n.port) {
    const b = nearest(n.lon, n.lat, zones);
    n.zones = [b[0][1]];
    if (b[1][0] < b[0][0] * 1.35 && b[1][0] < 1400) n.zones.push(b[1][1]);
  }
}
for (const z of zones) z.region = nearest(z.lon, z.lat, regions)[0][1];

const out = {
  W, H, seam: SEAM, latTop: LAT_TOP, latBot: LAT_BOT,
  nodes, edges: [...landEdges.values()],
  zones: zones.map(({ anchors, ...z }) => z), regions: regions.map(({ anchors, ...r }) => r),
  provinces, fillers,
  outlines: Object.entries(polys).map(([country, mp]) => ({ country, paths: mp.flat() })),
};
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/world.json', JSON.stringify(out));
console.log('nodes', nodes.length, 'edges', out.edges.length, 'provinces', provinces.length, 'fillers', fillers.length, 'H', H,
  'bytes', fs.statSync('public/data/world.json').size);
// 孤立した拠点（陸路なし・港なし）
const deg = new Map(); for (const [a, b] of out.edges) { deg.set(a, (deg.get(a) ?? 0) + 1); deg.set(b, (deg.get(b) ?? 0) + 1); }
console.log('isolated:', nodes.filter((n) => !deg.get(n.id) && !n.port).map((n) => n.name).join(','));
console.log('noProvince:', nodes.filter((n) => !provinces.some((p) => p.node === n.id)).map((n) => n.name).join(','));
