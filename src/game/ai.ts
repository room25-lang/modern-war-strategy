import type { Country, Facility, GameState } from '../types';
import { W, nodeKm } from '../world';
import { CFG } from '../config';
import { C, atWar, chance, enemyCampIdle, exhaustion, genF, hostileNode, landAt, rand, sameSide, side, seaOK } from './rules';
import * as A from './actions';
import { declareWar } from './sim';

const diff = (s: GameState) => CFG.diff[s.difficulty];
const ownNodes = (s: GameState, id: string) => { const o: number[] = []; for (let i = 0; i < W.nodes.length; i++) if (s.nodes[i].ctrl === id) o.push(i); return o; };

// ---------- 緊張期（毎週） ----------
export function aiTension(s: GameState, c: Country) {
  if (!c.major) return;
  let rival = '', rv = 100;
  for (const m of s.majors) if (m !== c.id && c.interest.some((r) => s.countries[m].interest.includes(r)) && s.rel[c.id][m] < rv) { rv = s.rel[c.id][m]; rival = m; }
  if (rival && rv < -30 && !c.warMode && chance(0.18)) A.toggleWarMode(s, c.id);
  // 中小国の取り合い
  if (chance(0.45)) {
    const cands = Object.values(s.countries).filter((m) => !m.major && c.interest.includes(W.nodes[m.capital].region) && (m.alignment[c.id] ?? 0) >= 15 && (m.alignment[c.id] ?? 0) < 75);
    const t = cands[Math.floor(rand(0, cands.length))];
    if (t) { if ((t.alignment[c.id] ?? 0) >= 45 && chance(0.25)) A.placeBase(s, c.id, t.id); else A.aid(s, c.id, t.id); }
  }
  // 首脳会談
  if (c.cooldown.summit <= 0 && chance(0.25)) {
    const friends = s.majors.filter((m) => m !== c.id && s.rel[c.id][m] > 10 && s.rel[c.id][m] < 60);
    const t = rv > -40 && chance(0.3) ? rival : friends[Math.floor(rand(0, friends.length))];
    if (t) A.summit(s, c.id, t);
  }
  // 国境への前進
  if (rival && rv < -20) {
    const border = ownNodes(s, c.id).filter((n) => W.adj[n].some((e) => s.nodes[e.to].ctrl === rival));
    const interior = ownNodes(s, c.id).filter((n) => !border.includes(n) && landAt(s, n).filter((u) => u.owner === c.id).length >= 2);
    if (border.length && interior.length && chance(0.5)) A.orderTo(s, c.id, interior[0], border[Math.floor(rand(0, border.length))]);
  }
}

// ---------- 戦争目的 ----------
export function aiWarGoal(s: GameState, c: Country) {
  const mine = ownNodes(s, c.id);
  const cand: [number, number][] = [];
  for (let n = 0; n < W.nodes.length; n++) {
    const o = s.nodes[n].ctrl;
    if (!(atWar(s, c.id, o) || enemyCampIdle(s, c.id, o))) continue;
    const d = Math.min(...mine.map((m) => nodeKm(m, n)));
    if (d > 2400) continue;
    cand.push([n, (W.nodes[n].ind + 1 + (W.nodes[n].capital ? 6 : 0)) * 1000 / (d + 200)]);
  }
  cand.sort((a, b) => b[1] - a[1]);
  c.warGoal = cand.slice(0, 4 + Math.floor(rand(0, 4))).map((x) => x[0]);
}

// ---------- 領土拡大（毎週）：どの国も、勝てそうな隣国があれば宣戦する。同盟国も例外ではない ----------
export function aiExpand(s: GameState, c: Country) {
  if (s.phase !== 'war' || c.capitulated || (!c.major && !c.fights)) return;
  if (exhaustion(s, c.id) > 0.5 || c.opinion < 38 || (c.peace['_'] ?? 0) > s.day) return;
  const pow = (id: string) => s.units.reduce((a, u) => a + (u.owner === id && u.kind === 'land' ? u.strength / 100 * genF(C(s, id), 'armor') : 0), 0);
  const myPow = pow(c.id);
  const alive = s.majors.filter((m) => !C(s, m).capitulated);
  const avg = alive.reduce((a, m) => a + pow(m), 0) / Math.max(1, alive.length);
  const strong = myPow / Math.max(1, avg); // 1より大きいほど大国
  const foes = Object.values(s.countries).filter((o) => atWar(s, c.id, o.id)).length;
  if (foes >= (c.major ? Math.min(5, 2 + Math.floor(strong)) : 1)) return;
  const p = c.major ? ({ easy: 0.18, normal: 0.32, hard: 0.45 } as Record<string, number>)[s.difficulty] * Math.min(2.5, Math.max(0.6, strong)) : 0.03;
  if (!chance(p)) return;
  const front = new Map<string, number>();
  for (let n = 0; n < W.nodes.length; n++) {
    if (s.nodes[n].ctrl !== c.id) continue;
    for (const e of W.adj[n]) { const t = s.nodes[e.to].ctrl; if (t !== c.id && !atWar(s, c.id, t)) front.set(t, (front.get(t) ?? 0) + W.nodes[e.to].ind + 1); }
    // 海の向こう（同じ海域の港）も狙う
    if (c.major && W.nodes[n].port) for (const z of W.nodes[n].zones) for (const p of W.portsByZone[z]) { const t = s.nodes[p].ctrl; if (t !== c.id && !atWar(s, c.id, t)) front.set(t, (front.get(t) ?? 0) + (W.nodes[p].ind + 1) * 0.6); }
  }
  let best = '', bv = 0;
  for (const [t, gain] of front) {
    const T = C(s, t); if (T.capitulated) continue;
    let tp = pow(t) + (W.nodesByCountry[t] ?? []).length * 0.3;
    // 相手の陣営が助けに来る分も見込む
    if (T.camp >= 0 && T.camp !== c.camp) for (const m of s.majors) if (m !== t && C(s, m).camp === T.camp) tp += pow(m) * 0.4;
    const betray = c.camp >= 0 && T.camp === c.camp;
    const req = (betray ? 1.8 : T.camp < 0 ? 1.3 : 1.6) / Math.min(1.4, Math.max(1, strong * 0.8));
    const ratio = myPow / Math.max(0.5, tp) * rand(0.85, 1.15);
    if (ratio < req) continue;
    const v = (gain + T.indBase * 0.3) * Math.min(3, ratio / req) * (betray ? 0.8 : 1);
    if (v > bv) { bv = v; best = t; }
  }
  if (best) declareWar(s, c.id, best);
}

// ---------- 毎週 ----------
export function aiWeekly(s: GameState, c: Country) {
  const atWarNow = c.engaged;
  const campWar = s.wars.some(([a, b]) => a === c.camp || b === c.camp);
  if (atWarNow) A.setBudget(s, c.id, 70, 15, c.opinion < 35 ? 30 : 15);
  else if (campWar || c.warMode) A.setBudget(s, c.id, 50, 30, 20);
  else A.setBudget(s, c.id, 38, 40, 22);
  const myUnits = s.units.filter((u) => u.owner === c.id);
  const count = (k: string) => myUnits.filter((u) => u.kind === k).length;
  if ((atWarNow || c.warMode || campWar) && c.queue.length < (c.gdp > 90 ? 5 : 3)) {
    if (c.stock.interceptor < c.stockInit.interceptor * 0.4 && c.stockInit.interceptor > 0) A.enqueue(s, c.id, 'ad');
    else if (count('land') < c.landInit * 1.5 * Math.max(1, c.gdp / Math.max(1, c.gdpBase))) A.enqueue(s, c.id, 'land');
    else if (c.major && chance(0.4)) A.enqueue(s, c.id, 'air');
    else if (c.major && chance(0.3) && (W.nodesByCountry[c.id] ?? []).some((n) => W.nodes[n].port)) A.enqueue(s, c.id, 'fleet');
    else A.enqueue(s, c.id, 'land');
  }
  if (c.major && !c.genProject && chance(0.5)) {
    const cats = (['fighter', 'armor', 'ad', 'naval'] as const).filter((k) => c.gen[k] < 3).sort((a, b) => c.gen[a] - c.gen[b]);
    if (cats.length) A.startGen(s, c.id, cats[0]);
  }
  if (atWarNow && count('land') < c.landInit * 0.9 && c.opinion >= 42) A.mobilize(s, c.id);
  // 戦争目的をほぼ達成したら、次の目標を足して拡張を続ける
  if (atWarNow && c.major && c.warGoal.length && c.warGoal.filter((n) => sameSide(s, s.nodes[n].ctrl, c.id)).length >= c.warGoal.length * 0.6) {
    const old = new Set(c.warGoal); aiWarGoal(s, c); c.warGoal = [...new Set([...old, ...c.warGoal])];
  }
  // 参戦の判断
  const leftBefore = c.peace['_'] !== undefined;
  if (!atWarNow && campWar && (c.peace['_'] ?? 0) <= s.day && (!leftBefore || (exhaustion(s, c.id) < 0.3 && c.opinion > 50))) {
    const allyInTrouble = Object.values(s.countries).some((o) => o.engaged && sameSide(s, o.id, c.id) && o.major && (s.nodes[o.capital].ctrl !== o.id || exhaustion(s, o.id) > 0.5));
    if ((c.major && (allyInTrouble || chance(0.25))) || (!c.major && c.fights && chance(0.1))) A.declareJoin(s, c.id);
  }
  if (!atWarNow) return;
  // 前線の地域
  const fronts = new Set<number>();
  for (const n of ownNodes(s, c.id)) if (W.adj[n].some((e) => atWar(s, c.id, s.nodes[e.to].ctrl))) fronts.add(W.nodes[n].region);
  for (const n of c.warGoal) fronts.add(W.nodes[n].region);
  const fr = [...fronts];
  if (fr.length) {
    myUnits.filter((u) => u.kind === 'air' && !u.transit).forEach((u, i) => { const r = fr[i % fr.length]; if (u.region !== r && chance(0.5)) A.assignAir(s, c.id, u.id, r); });
    c.satAssign = c.satAssign.map((_, i) => fr[i % fr.length]);
    c.droneAssign = c.droneAssign.map((_, i) => fr[i % fr.length]);
  }
  // 艦隊：敵艦隊のいる自国近海へ
  const homeZones = [...new Set((W.nodesByCountry[c.id] ?? []).flatMap((n) => W.nodes[n].zones))];
  const sd = side(s, c.id);
  const threatened = homeZones.filter((z) => !seaOK(s, z, sd));
  const goalZones = [...new Set(c.warGoal.flatMap((n) => W.nodes[n].zones))];
  myUnits.filter((u) => u.kind === 'fleet' && !u.transit).forEach((u, i) => {
    const want = threatened.length ? threatened[i % threatened.length] : goalZones.length && i % 2 ? goalZones[i % goalZones.length] : null;
    if (want !== null && want !== u.zone && chance(0.5)) A.assignFleet(s, c.id, u.id, want);
  });
  // サイバー
  if (c.major && c.cooldown.cyber <= 0 && chance(0.3)) {
    const foes = Object.values(s.countries).filter((o) => o.major && atWar(s, c.id, o.id));
    const t = foes[Math.floor(rand(0, foes.length))];
    if (t) A.cyber(s, c.id, t.id, (['gdp', 'sat', 'ad'] as const)[Math.floor(rand(0, 3))]);
  }
  // 中小国への援助（戦時も続ける）
  if (c.major && chance(0.2)) {
    const cands = Object.values(s.countries).filter((m) => !m.major && !m.engaged && fr.includes(W.nodes[m.capital].region) && (m.alignment[c.id] ?? 0) >= 20 && (m.alignment[c.id] ?? 0) < 70);
    if (cands.length) A.aid(s, c.id, cands[0].id);
  }
}

// ---------- 毎日（参戦中） ----------
export function aiDaily(s: GameState, c: Country) {
  if (!c.engaged || (!c.major && !c.fights)) return;
  const d = diff(s);
  const offset = (s.day + Number(c.id)) % 2;
  void offset; attacks(s, c, d.attack, d.noise);
  if ((s.day + Number(c.id)) % 2 === 1) rebalance(s, c);
  if (c.major && (s.day + Number(c.id)) % 3 === 0) strikes(s, c);
}

function estPower(s: GameState, n: number, noise: number): number {
  let p = 0;
  for (const u of s.units) if (u.node === n && !u.move && (u.kind === 'land' || u.kind === 'ad')) p += u.strength / 100 * genF(C(s, u.owner), 'armor') * (u.kind === 'ad' ? 0.3 : 1) * (C(s, u.owner).doctrine.land === 'depth' ? 1.25 : 1);
  return Math.max(0.25, p * rand(1 - noise, 1 + noise));
}
const unitNodes = (s: GameState, id: string) => [...new Set(s.units.filter((u) => u.owner === id && u.kind === 'land' && !u.move && u.node >= 0 && sameSide(s, s.nodes[u.node].ctrl, id)).map((u) => u.node))];
function attacks(s: GameState, c: Country, thr: number, noise: number) {
  const busy = new Set(s.orders.filter((o) => o.owner === c.id).map((o) => o.from));
  const targeted = new Set(s.orders.filter((o) => sameSide(s, o.owner, c.id)).map((o) => o.to));
  for (const n of unitNodes(s, c.id)) {
    if (busy.has(n)) continue;
    const mine = landAt(s, n).filter((u) => u.owner === c.id && !u.order);
    if (!mine.length) continue;
    const enemiesNear = W.adj[n].filter((e) => hostileNode(s, c.id, e.to)).length;
    const keep = mine.length >= 2 || enemiesNear > 1 ? 1 : 0;
    if (mine.length - keep <= 0) continue;
    const myP = mine.slice(0, mine.length - keep).reduce((a, u) => a + u.strength / 100 * genF(c, 'armor') * (c.doctrine.land === 'mobile' ? 1.2 : 1), 0);
    let best = -1, bs = 0;
    for (const e of W.adj[n]) {
      if (!hostileNode(s, c.id, e.to) || targeted.has(e.to)) continue;
      if (!atWar(s, c.id, s.nodes[e.to].ctrl) && !c.major) continue;
      const ratio = myP / estPower(s, e.to, noise) * (c.warGoal.includes(e.to) ? 1.4 : 1) * (1 + W.nodes[e.to].ind * 0.04) * (s.nodes[e.to].owner !== s.nodes[e.to].ctrl ? 1.2 : 1) * (W.nodes[e.to].capital ? 1.3 : 1);
      if (ratio > bs) { bs = ratio; best = e.to; }
    }
    if (best >= 0 && bs >= thr * (keep ? 1 : 1.2)) { A.orderTo(s, c.id, n, best); targeted.add(best); }
    else if (best >= 0 && s.difficulty === 'hard' && chance(0.05)) A.orderTo(s, c.id, n, best); // 陽動
  }
  // 上陸作戦（陸の前線がないとき）
  if (c.major && (s.day + Number(c.id)) % 7 === 0) {
    const ports: number[] = []; for (let n = 0; n < W.nodes.length; n++) if (W.nodes[n].port && hostileNode(s, c.id, n)) ports.push(n);
    const goals = [...c.warGoal.filter((g) => ports.includes(g)), ...ports.filter((g) => !c.warGoal.includes(g))];
    for (const g of goals) {
      if (!hostileNode(s, c.id, g) || !W.nodes[g].zones.length) continue;
      const from = ownNodes(s, c.id).find((n) => W.nodes[n].port && landAt(s, n).filter((u) => u.owner === c.id && !u.order).length >= 3
        && W.nodes[n].zones.some((z) => W.nodes[g].zones.includes(z) && seaOK(s, z, side(s, c.id))));
      if (from !== undefined && estPower(s, g, 0.2) < 1.2) { A.orderTo(s, c.id, from, g); break; }
    }
  }
}
function rebalance(s: GameState, c: Country) {
  const nodes = ownNodes(s, c.id);
  const threat = (n: number) => W.adj[n].reduce((a, e) => a + (atWar(s, c.id, s.nodes[e.to].ctrl) || (c.major && hostileNode(s, c.id, e.to)) ? estPower(s, e.to, 0.2) : 0), 0);
  const near = (n: number) => nodes.some((m) => nodeKm(m, n) < 2200);
  const side_: number[] = []; for (let i = 0; i < W.nodes.length; i++) if (sameSide(s, s.nodes[i].ctrl, c.id) && (s.nodes[i].ctrl === c.id || near(i))) side_.push(i);
  const front = side_.filter((n) => threat(n) > 0).sort((a, b) => threat(b) / estPower(s, b, 0) - threat(a) / estPower(s, a, 0));
  const interior = unitNodes(s, c.id).filter((n) => threat(n) === 0 && landAt(s, n).some((u) => u.owner === c.id && !u.order));
  if (!front.length || !interior.length) return;
  let tgt = front[0];
  if (threat(tgt) < estPower(s, tgt, 0) * 0.9) {
    // 攻勢の準備：戦争目的か弱い敵に接する前線へ兵を集める
    const score = (n: number) => W.adj[n].reduce((a, e) => a + (hostileNode(s, c.id, e.to) ? (c.warGoal.includes(e.to) ? 3 : 1) / estPower(s, e.to, 0.2) : 0), 0);
    tgt = [...front].sort((a, b) => score(b) - score(a))[0];
  }
  const src = interior.sort((a, b) => nodeKm(a, tgt) - nodeKm(b, tgt))[0];
  const us = landAt(s, src).filter((u) => u.owner === c.id && !u.order);
  if (us.length >= (src === c.capital ? 2 : 1)) A.orderTo(s, c.id, src, tgt);
}
function strikes(s: GameState, c: Country) {
  const st = c.stock;
  if (st.cruise + st.ballistic + st.drone < 20) return;
  const cand: [number, Facility, number][] = [];
  const mine: number[] = []; for (let i = 0; i < W.nodes.length; i++) if (sameSide(s, s.nodes[i].ctrl, c.id) && (s.nodes[i].ctrl === c.id || C(s, s.nodes[i].ctrl).major || C(s, s.nodes[i].ctrl).basesOf.includes(c.id))) mine.push(i);
  for (let n = 0; n < W.nodes.length; n++) {
    const o = s.nodes[n].ctrl;
    if (!atWar(s, c.id, o)) continue;
    const d = Math.min(...mine.map((m) => nodeKm(m, n)));
    if (d > CFG.range.cruise && !(c.hasBallistic && d < CFG.range.ballistic)) continue;
    const front = W.adj[n].some((e) => sameSide(s, s.nodes[e.to].ctrl, c.id));
    const D = C(s, o);
    const weakAD = D.stock.interceptor < D.stockInit.interceptor * 0.3;
    let fac: Facility = 'ind'; let v = W.nodes[n].ind;
    if (front && landAt(s, n).length) { fac = 'units'; v = 3 + landAt(s, n).length; }
    else if (W.nodes[n].adSite && s.nodes[n].health.ad > 40 && !weakAD) { fac = 'ad'; v = 4; }
    else if (W.nodes[n].airbase && s.nodes[n].health.airbase > 40) { fac = 'airbase'; v = 3; }
    else if (W.nodes[n].port && s.nodes[n].health.port > 40) { fac = 'port'; v = 2.5; }
    if (c.warGoal.includes(n)) v *= 1.5;
    if (weakAD) v *= 1.5;
    cand.push([n, fac, v * rand(0.7, 1.3) / (1 + d / 2000)]);
  }
  if (!cand.length) return;
  cand.sort((a, b) => b[2] - a[2]);
  const [n, fac] = cand[0];
  const share = s.difficulty === 'hard' ? 0.14 : s.difficulty === 'normal' ? 0.1 : 0.07;
  const d = Math.min(...mine.map((m) => nodeKm(m, n)));
  const k = s.difficulty === 'hard' ? 1.3 : s.difficulty === 'normal' ? 1 : 0.7;
  const take = { cruise: d <= CFG.range.cruise ? Math.min(Math.floor(40 * k), Math.floor(st.cruise * share)) : 0, ballistic: c.hasBallistic ? Math.min(Math.floor(16 * k), Math.floor(st.ballistic * share)) : 0, drone: d <= CFG.range.drone ? Math.min(Math.floor(120 * k), Math.floor(st.drone * share)) : 0, interceptor: 0 };
  if (take.cruise + take.ballistic + take.drone < 5) return;
  A.scheduleStrike(s, c.id, n, fac, take, 1, [0, 3, 6, 21][Math.floor(rand(0, 4))]);
}
