import type { Country, GameState, Unit } from '../types';
import { W } from '../world';
import { CFG } from '../config';

export const rng = { seed: 1, next(): number { this.seed = (this.seed * 1664525 + 1013904223) % 4294967296; return this.seed / 4294967296; } };
export const rand = (a = 0, b = 1) => a + (b - a) * rng.next();
export const chance = (p: number) => rng.next() < p;

export const C = (s: GameState, id: string): Country => s.countries[id];
let keyIdx: Record<string, number> | null = null; let keyState: GameState | null = null;
export const side = (s: GameState, id: string): number => {
  const c = s.countries[id]; if (c.camp >= 0) return c.camp;
  if (keyState !== s || !keyIdx) { keyIdx = Object.fromEntries(Object.keys(s.countries).map((k, i) => [k, i])); keyState = s; }
  return 1000 + keyIdx[id];
};
export function sameSide(s: GameState, a: string, b: string): boolean { return a === b || side(s, a) === side(s, b); }
export function campsAtWar(s: GameState, a: number, b: number): boolean {
  if (a < 0 || b < 0 || a === b) return false;
  return s.wars.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
export function atWar(s: GameState, a: string, b: string): boolean {
  if (a === b) return false;
  const A = s.countries[a], B = s.countries[b];
  return A.engaged && B.engaged && campsAtWar(s, A.camp, B.camp);
}
// 敵陣営に属しているが、まだ参戦していない（攻撃すれば巻き込む）
export function enemyCampIdle(s: GameState, a: string, b: string): boolean {
  const A = s.countries[a], B = s.countries[b];
  return A.engaged && !B.engaged && campsAtWar(s, A.camp, B.camp) && (B.peace[a] ?? 0) <= s.day && !B.capitulated;
}
export const ctrl = (s: GameState, n: number) => s.nodes[n].ctrl;
export function friendlyNode(s: GameState, owner: string, n: number): boolean { return sameSide(s, owner, s.nodes[n].ctrl); }
export function hostileNode(s: GameState, owner: string, n: number): boolean {
  const c = s.nodes[n].ctrl; return atWar(s, owner, c) || enemyCampIdle(s, owner, c);
}

export const landAt = (s: GameState, n: number): Unit[] => s.units.filter((u) => u.node === n && (u.kind === 'land') && !u.move && u.strength > 0);
export const adAt = (s: GameState, n: number): Unit[] => s.units.filter((u) => u.node === n && u.kind === 'ad' && !u.move && u.strength > 0);
export const unitsOf = (s: GameState, id: string, kind?: string) => s.units.filter((u) => u.owner === id && (!kind || u.kind === kind));

export const genF = (c: Country, cat: keyof Country['gen']) => CFG.genFactor[c.gen[cat]];
export const genLabel = (i: number) => ['第4世代', '第4.5世代', '第5世代', '第5.5世代'][i];

export function supplyAt(s: GameState, owner: string, n: number): number {
  const arr = s.supply[String(side(s, owner))]; return arr ? arr[n] ?? 0.2 : 0.2;
}

// 陸路・海路での移動経路（味方の拠点だけを通る）。移動日数を返す
export function findPath(s: GameState, owner: string, from: number, to: number): { path: number[]; days: number } | null {
  const N = W.nodes.length;
  const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1);
  dist[from] = 0;
  const open = [from];
  const sd = side(s, owner);
  while (open.length) {
    open.sort((a, b) => dist[a] - dist[b]);
    const cur = open.shift()!;
    if (cur === to) break;
    const nexts: [number, number][] = W.adj[cur].map((e) => [e.to, Math.max(1, Math.ceil(e.km / CFG.landSpeedKm))]);
    if (W.nodes[cur].port && s.nodes[cur].health.port >= 30) {
      for (const z of W.nodes[cur].zones) for (const p of W.portsByZone[z]) if (p !== cur && seaOK(s, z, sd)) nexts.push([p, 4]);
    }
    for (const [nx, d] of nexts) {
      if (nx !== to && !friendlyNode(s, owner, nx)) continue;
      if (nx === to && !friendlyNode(s, owner, nx)) continue;
      if (dist[cur] + d < dist[nx]) { dist[nx] = dist[cur] + d; prev[nx] = cur; if (!open.includes(nx)) open.push(nx); }
    }
  }
  if (dist[to] === Infinity) return null;
  const path: number[] = []; let c = to;
  while (c !== from) { path.unshift(c); c = prev[c]; }
  return { path, days: dist[to] };
}
export function hopDays(s: GameState, a: number, b: number): number {
  const e = W.adj[a].find((x) => x.to === b);
  if (e) return Math.max(1, Math.ceil(e.km / CFG.landSpeedKm));
  void s; return 4;
}

// 海域の安全：敵の艦隊がいないか、制海45%以上
export function seaOK(s: GameState, z: number, sd: number): boolean {
  const sh = s.seaShare[z] ?? {};
  let enemy = 0;
  for (const k of Object.keys(sh)) { const c = Number(k); if (c !== sd && sidesAtWar(s, c, sd)) enemy += sh[c]; }
  return enemy === 0 || (sh[sd] ?? 0) >= 0.45;
}
export function sidesAtWar(s: GameState, a: number, b: number): boolean { return a < 1000 && b < 1000 && campsAtWar(s, a, b); }
export function airShare(s: GameState, r: number, sd: number): number {
  const sh = s.airShare[r] ?? {}; const tot = Object.values(sh).reduce((a, b) => a + b, 0);
  if (tot <= 0) return 0.5;
  // 敵対する相手がいなければ0.5扱い
  let hostile = 0; for (const k of Object.keys(sh)) if (sidesAtWar(s, Number(k), sd)) hostile += sh[Number(k)];
  if (hostile === 0) return Math.max(0.5, sh[sd] ?? 0);
  return (sh[sd] ?? 0) / ((sh[sd] ?? 0) + hostile);
}

export function exhaustion(s: GameState, id: string): number {
  const c = s.countries[id];
  const st = c.stock.cruise + c.stock.ballistic + c.stock.interceptor;
  const si = c.stockInit.cruise + c.stockInit.ballistic + c.stockInit.interceptor || 1;
  const debtRatio = c.debt / (c.gdpBase * 52) * 100;
  const capLost = s.nodes[c.capital].ctrl !== id ? 0.3 : 0;
  return 0.35 * (1 - c.opinion / 100) + 0.25 * (1 - Math.min(1, st / si)) + 0.15 * Math.min(1, debtRatio / 400)
    + 0.25 * Math.min(1, c.lossesTotal / Math.max(100, c.landInit * 100)) + capLost;
}

export function goalProgress(s: GameState, id: string): number {
  const c = s.countries[id]; if (!c.warGoal.length) return 0;
  let tot = 0, got = 0;
  for (const n of c.warGoal) { const v = W.nodes[n].ind + 1; tot += v; if (sameSide(s, id, s.nodes[n].ctrl) || s.nodes[n].owner === id) got += v; }
  return Math.max(c.goalAchieved, got / tot);
}

export const weekOf = (s: GameState) => Math.floor(s.day / 7) + 1;
export function countryName(s: GameState, id: string) { return s.countries[id]?.name ?? id; }
