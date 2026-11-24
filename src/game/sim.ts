import type { Country, GameState, Order, StrikeFx, Unit } from '../types';
import { W, nodeKm } from '../world';
import { CFG } from '../config';
import {
  C, adAt, airShare, atWar, campsAtWar, chance, enemyCampIdle, exhaustion, friendlyNode, genF, goalProgress, hopDays, landAt,
  rand, sameSide, seaOK, side, sidesAtWar, supplyAt,
} from './rules';
import { newUnit } from './state';
import { aiDaily, aiExpand, aiTension, aiWeekly, aiWarGoal } from './ai';

export const fx: StrikeFx[] = [];
export const events: { kind: 'capture' | 'strike' | 'war' | 'alert'; t: number }[] = [];

export function news(s: GameState, text: string, kind: 'info' | 'warn' | 'bad' | 'good' = 'info') {
  s.news.push({ day: s.day, text, kind });
  if (s.news.length > 200) s.news.splice(0, s.news.length - 200);
}
const mine = (s: GameState, id: string) => id === s.player || sameSide(s, id, s.player);

// ===================== 1日進める =====================
export function step(s: GameState) {
  if (s.over) return;
  s.day++;
  updateCamps(s);
  updateTension(s);
  runStrikes(s);
  moveUnits(s);
  airSea(s);
  computeSupply(s);
  groundCombat(s);
  recon(s);
  upkeepDaily(s);
  for (const c of Object.values(s.countries)) {
    if (c.ai && !c.capitulated) { if (s.phase === 'tension') { if (s.day % 7 === 3) aiTension(s, c); } aiDaily(s, c); }
  }
  if (s.day % 7 === 0) {
    for (const c of Object.values(s.countries)) if (c.ai && !c.capitulated) { aiWeekly(s, c); aiExpand(s, c); }
    for (const c of Object.values(s.countries)) economy(s, c);
    peaceChecks(s);
  }
  checkEnd(s);
}

// ===================== 陣営 =====================
export function updateCamps(s: GameState) {
  const ms = s.majors;
  if (!s.campsLocked) {
    const parent: Record<string, string> = Object.fromEntries(ms.map((m) => [m, m]));
    const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    // 最も仲の悪い2国は必ず別の陣営の核になる
    let pa = ms[0], pb = ms[1], pv = 1e9;
    for (const a of ms) for (const b of ms) if (a < b && s.rel[a][b] < pv) { pv = s.rel[a][b]; pa = a; pb = b; }
    const join = (a: string, b: string) => {
      const ra = find(a), rb = find(b); if (ra === rb) return;
      const poles = [find(pa), find(pb)];
      if (poles.includes(ra) && poles.includes(rb)) return;
      parent[ra] = rb;
    };
    const pairs: [string, string][] = [];
    for (const a of ms) for (const b of ms) if (a < b) pairs.push([a, b]);
    pairs.sort((x, y) => s.rel[y[0]][y[1]] - s.rel[x[0]][x[1]]);
    for (const [a, b] of pairs) if (s.rel[a][b] >= 40) join(a, b);
    // 一人きりの主要国は、関係の良い国の陣営へ
    for (const a of ms) {
      if (ms.some((b) => b !== a && find(b) === find(a))) continue;
      let best = '', bv = 14;
      for (const b of ms) if (b !== a && s.rel[a][b] > bv) { bv = s.rel[a][b]; best = b; }
      if (best) join(a, best);
    }
    const roots = [...new Set(ms.map(find))];
    for (const m of ms) C(s, m).camp = roots.indexOf(find(m));
  }
  for (const c of Object.values(s.countries)) {
    if (c.major) continue;
    if (c.engaged && c.camp >= 0) continue;
    let best = '', bv = CFG.campJoin - 1;
    for (const [m, v] of Object.entries(c.alignment)) if (v > bv) { bv = v; best = m; }
    c.camp = best ? C(s, best).camp : -1;
  }
}

// ===================== 張り詰め度と開戦 =====================
function updateTension(s: GameState) {
  W.regions.forEach((_, r) => {
    const ms = s.majors.filter((m) => C(s, m).interest.includes(r));
    let minRel = 100;
    for (const a of ms) for (const b of ms) if (a < b && !campsAtWar(s, C(s, a).camp, C(s, b).camp) && C(s, a).camp !== C(s, b).camp) minRel = Math.min(minRel, s.rel[a][b]);
    if (minRel === 100) return;
    const h = Math.max(0, -minRel) / 100;
    s.tension[r] += s.phase === 'tension' ? 0.12 + h * 0.32 : h * 0.12;
  });
  // 国境への部隊配置（相手を刺激する）
  if (s.day % 7 === 1) {
    for (const m of s.majors) {
      const c = C(s, m);
      for (const u of s.units) {
        if (u.owner !== m || u.kind !== 'land' || u.node < 0) continue;
        const border = W.adj[u.node].some((e) => { const o = s.nodes[e.to].ctrl; return C(s, o).major && o !== m && s.rel[m][o] < -20; });
        if (border) addTension(s, W.nodes[u.node].region, m, 0.3);
      }
      void c;
    }
  }
  let hot = -1; let hv = 0;
  s.tension.forEach((t, r) => { if (t > hv) { hv = t; hot = r; } });
  if (s.phase === 'tension') {
    if (hv >= 100 || s.day >= s.tensionEnd) outbreak(s, hot);
  } else if (hv >= 100) {
    if (!outbreak(s, hot)) s.tension[hot] = 60;
  }
  s.tension = s.tension.map((t) => Math.min(100, Math.max(0, t)));
}
export function addTension(s: GameState, r: number, who: string, v: number) {
  s.tension[r] = Math.max(0, s.tension[r] + v);
  if (v > 0) s.contrib[r][who] = (s.contrib[r][who] ?? 0) + v;
}

function outbreak(s: GameState, r: number): boolean {
  updateCamps(s);
  const ms = s.majors.filter((m) => C(s, m).interest.includes(r));
  let pair: [string, string] | null = null, pv = 1e9;
  const tryPairs = (list: string[]) => {
    for (const a of list) for (const b of list) {
      if (a >= b) continue;
      const ca = C(s, a).camp, cb = C(s, b).camp;
      if (ca === cb || campsAtWar(s, ca, cb)) continue;
      if (s.rel[a][b] < pv) { pv = s.rel[a][b]; pair = [a, b]; }
    }
  };
  tryPairs(ms); if (!pair) tryPairs(s.majors);
  if (!pair) return false;
  const [a, b] = pair as [string, string];
  const ca = C(s, a).camp, cb = C(s, b).camp;
  s.wars.push([ca, cb]); s.campsLocked = true; s.phase = 'war';
  for (const c of Object.values(s.countries)) {
    if (c.camp !== ca && c.camp !== cb) continue;
    const hasNodes = (W.nodesByRegion[r] ?? []).some((n) => s.nodes[n].owner === c.id);
    if (c.id === a || c.id === b || (c.major && (c.interest.includes(r) || hasNodes)) || (!c.major && c.fights && hasNodes)) engage(s, c.id, false);
  }
  // 仕掛けた国
  let init = '', iv = 0;
  for (const [who, v] of Object.entries(s.contrib[r])) if (v > iv && (C(s, who).camp === ca || C(s, who).camp === cb)) { iv = v; init = who; }
  if (init) {
    const c = C(s, init); c.initiatorDays = 28; c.opinion -= 8;
    news(s, `${c.name}が張り詰め度を高めた国とみなされ、国際的な非難を受けています（世論−8／初動有利）`, init === s.player ? 'warn' : 'info');
  }
  s.tension[r] = 0;
  const pc = C(s, s.player);
  news(s, `【開戦】${W.regions[r].name}で戦争が始まりました：${campName(s, ca)} 対 ${campName(s, cb)}`, 'bad');
  events.push({ kind: 'war', t: performance.now() });
  if (!pc.engaged && (pc.camp === ca || pc.camp === cb)) news(s, `あなたの陣営が戦争に入りました。外交パネルからいつでも参戦できます`, 'warn');
  for (const c of Object.values(s.countries)) if (c.ai && c.engaged && c.major && !c.warGoal.length) aiWarGoal(s, c);
  return true;
}
export function campName(s: GameState, camp: number): string {
  const ms = s.majors.filter((m) => C(s, m).camp === camp).map((m) => C(s, m).name);
  if (ms.length) return ms.join('・') + '陣営';
  const mi = Object.values(s.countries).filter((c) => c.camp === camp).map((c) => c.name);
  return mi.length ? mi.slice(0, 2).join('・') + '陣営' : '中小国陣営';
}
export function engage(s: GameState, id: string, announce = true) {
  const c = C(s, id);
  if (c.engaged || c.capitulated || c.camp < 0) return;
  if ((c.peace['_'] ?? 0) > s.day) return;
  c.engaged = true; c.engagedDay = s.day;
  if (announce) news(s, `${c.name}が参戦しました`, mine(s, id) ? 'info' : 'warn');
  if (c.ai && c.major && !c.warGoal.length) aiWarGoal(s, c);
}
// ===================== 宣戦布告・裏切り =====================
export function newCampId(s: GameState): number {
  let m = -1; for (const c of Object.values(s.countries)) m = Math.max(m, c.camp); for (const [a, b] of s.wars) m = Math.max(m, a, b);
  return m + 1;
}
// a が t に宣戦する。t が同じ陣営なら、a は陣営を抜けて裏切る
export function declareWar(s: GameState, a: string, t: string): string | null {
  const A = C(s, a), T = C(s, t);
  if (a === t || A.capitulated || T.capitulated) return 'この国には宣戦できません';
  if (atWar(s, a, t)) return 'すでに戦争中です';
  if ((A.peace['_'] ?? 0) > s.day) return `講和したばかりのため、あと${(A.peace['_'] ?? 0) - s.day}日は宣戦できません`;
  const betray = A.camp >= 0 && A.camp === T.camp;
  if (betray || A.camp < 0) {
    const old = A.camp; A.camp = newCampId(s);
    if (betray) {
      if (A.major) for (const m of s.majors) if (m !== a && C(s, m).camp === old) { s.rel[a][m] = Math.min(s.rel[a][m], -60); s.rel[m][a] = s.rel[a][m]; }
      news(s, `【裏切り】${A.name}が陣営を離れ、同盟国の${T.name}に宣戦しました`, mine(s, t) || mine(s, a) ? 'bad' : 'warn');
    }
    // 自分に傾いた中小国はついてくる
    for (const c of Object.values(s.countries)) if (!c.major && !c.engaged && (c.alignment[a] ?? 0) >= CFG.campJoin && Object.entries(c.alignment).every(([k, v]) => k === a || v <= (c.alignment[a] ?? 0))) c.camp = A.camp;
  }
  if (T.camp < 0) T.camp = newCampId(s);
  if (!campsAtWar(s, A.camp, T.camp)) s.wars.push([A.camp, T.camp]);
  s.phase = 'war'; s.campsLocked = true;
  A.engaged = true; A.engagedDay = s.day; engage(s, t, false); T.engaged = true;
  A.opinion -= betray ? 8 : 4;
  if (A.major) for (const m of s.majors) if (m !== a && m !== t) { s.rel[m][a] = Math.max(-100, s.rel[m][a] - (betray ? 12 : 6)); s.rel[a][m] = s.rel[m][a]; }
  if (A.major && T.major) { s.rel[a][t] = Math.min(s.rel[a][t], -50); s.rel[t][a] = s.rel[a][t]; }
  if (!betray) news(s, `【宣戦】${A.name}が${T.name}に宣戦布告しました`, mine(s, t) ? 'bad' : mine(s, a) ? 'warn' : 'info');
  // 裏切った瞬間：相手の拠点にいた自軍は、その場を押さえるか自国へ戻る
  for (let n = 0; n < W.nodes.length; n++) {
    const ns = s.nodes[n]; if (!atWar(s, a, ns.ctrl)) continue;
    const here = s.units.filter((u) => u.node === n && (u.kind === 'land' || u.kind === 'ad') && !u.move);
    const mineHere = here.filter((u) => u.owner === a), theirs = here.filter((u) => u.owner !== a && sameSide(s, u.owner, ns.ctrl));
    if (mineHere.length && !theirs.length) { ns.ctrl = a; news(s, `${A.name}が${W.nodes[n].name}を奇襲で押さえました`, mine(s, a) ? 'good' : 'warn'); }
    else for (const u of mineHere) { u.node = C(s, a).capital; u.order = 0; u.move = null; }
  }
  for (const u of s.units) if ((u.kind === 'land' || u.kind === 'ad') && u.node >= 0 && atWar(s, u.owner, s.nodes[u.node].ctrl)) { const home = (W.nodesByCountry[u.owner] ?? []).find((n) => s.nodes[n].ctrl === u.owner) ?? C(s, u.owner).capital; u.node = home; u.move = null; u.order = 0; }
  events.push({ kind: 'war', t: performance.now() });
  if (A.ai && A.major) aiWarGoal(s, A);
  return null;
}
// 攻撃を受けた国（とその国に基地を置く主要国）を巻き込む
function dragIn(s: GameState, attacker: string, target: string) {
  if (enemyCampIdle(s, attacker, target)) engage(s, target);
  for (const m of C(s, target).basesOf) if (enemyCampIdle(s, attacker, m)) engage(s, m);
}

// ===================== 打撃 =====================
function runStrikes(s: GameState) {
  const today = s.strikes.filter((x) => x.day <= s.day);
  s.strikes = s.strikes.filter((x) => x.day > s.day);
  const groups = new Map<string, typeof today>();
  for (const st of today) { const k = `${st.target}|${st.owner}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(st); }
  // 防空側は同じ日の迎撃能力を分け合う
  const capUsed = new Map<number, number>();
  for (const list of groups.values()) {
    const { owner, target } = list[0];
    const A = C(s, owner); const defId = s.nodes[target].ctrl; const D = C(s, defId);
    const n = { cruise: 0, ballistic: 0, drone: 0 };
    for (const st of list) { n.cruise += st.n.cruise; n.ballistic += st.n.ballistic; n.drone += st.n.drone; }
    if (!(atWar(s, owner, defId) || enemyCampIdle(s, owner, defId)) || A.capitulated) {
      A.stock.cruise += n.cruise; A.stock.ballistic += n.ballistic; A.stock.drone += n.drone;
      if (owner === s.player) news(s, `${W.nodes[target].name}への打撃は、相手と戦争状態でないため中止しました（弾は戻りました）`, 'warn');
      continue;
    }
    dragIn(s, owner, defId);
    // 射程
    const dist = nearestOwnKm(s, owner, target);
    for (const w of ['cruise', 'ballistic', 'drone'] as const) {
      const range = CFG.range[w] * (w === 'cruise' && fleetNear(s, owner, target) ? 1.6 : 1);
      if (n[w] > 0 && dist > range) { A.stock[w] += n[w]; if (owner === s.player) news(s, `${W.nodes[target].name}は${wName(w)}の射程外でした（${Math.round(dist)}km）`, 'warn'); n[w] = 0; }
    }
    const total = n.cruise + n.ballistic + n.drone;
    if (!total) continue;
    let cap = adAt(s, target).reduce((a, u) => a + CFG.adUnitCap * u.strength / 100, 0) + (W.nodes[target].adSite ? CFG.adSiteCap * s.nodes[target].health.ad / 100 : 0)
      + W.nodesByRegion[W.nodes[target].region].reduce((a, nn) => a + (sameSide(s, s.nodes[nn].ctrl, defId) ? adAt(s, nn).length * CFG.adRegionCap : 0), 0);
    cap *= (D.doctrine.air === 'ground' ? 1.35 : 1) * genF(D, 'ad') * (D.effects.adMalus > 0 ? 0.6 : 1);
    cap = Math.max(0, cap - (capUsed.get(target) ?? 0));
    const attempts = Math.min(total, cap, D.stock.interceptor);
    capUsed.set(target, (capUsed.get(target) ?? 0) + attempts);
    D.stock.interceptor -= attempts;
    let leakDmg = 0, intercepted = 0;
    for (const w of ['cruise', 'ballistic', 'drone'] as const) {
      if (!n[w]) continue;
      const tries = attempts * n[w] / total;
      const p = CFG.interceptP[w] + (w === 'ballistic' && D.gen.ad >= 2 ? 0.15 : 0);
      const hit = Math.min(n[w], tries * p * rand(0.85, 1.1));
      intercepted += hit;
      leakDmg += (n[w] - hit) * CFG.dmg[w];
    }
    const seen = owner !== s.player || (s.seen[target] && s.day - s.seen[target].day <= 14);
    leakDmg *= (seen ? 1 : 0.6) * (0.9 + 0.1 * A.gen.naval);
    applyDamage(s, target, list[0].facility, leakDmg, defId);
    const hits = Math.round(total - intercepted);
    fx.push({ from: ownPos(s, owner, target), to: [W.nodes[target].x, W.nodes[target].y], t0: performance.now(), hits, intercepted: Math.round(intercepted), owner });
    events.push({ kind: 'strike', t: performance.now() });
    if (owner === s.player || defId === s.player || mine(s, defId)) {
      news(s, `${A.name}が${W.nodes[target].name}（${facName(list[0].facility)}）を打撃：${total}発中${Math.round(intercepted)}発を迎撃、${hits}発が命中`, defId === s.player ? 'bad' : owner === s.player ? 'good' : 'info');
    }
  }
}
export const wName = (w: string) => ({ cruise: '巡航ミサイル', ballistic: '弾道ミサイル', drone: '攻撃ドローン', interceptor: '迎撃弾' } as Record<string, string>)[w];
export const facName = (f: string) => ({ ad: '防空陣地', airbase: '航空基地', port: '港', ind: '産業・発電所', units: '部隊' } as Record<string, string>)[f];
function applyDamage(s: GameState, node: number, fac: string, dmg: number, defId: string) {
  const h = s.nodes[node].health; const D = C(s, defId);
  if (dmg <= 0) return;
  if (fac === 'ad') { h.ad = Math.max(0, h.ad - dmg * 3); for (const u of adAt(s, node)) hurt(s, u, dmg * 2.2); }
  else if (fac === 'airbase') { h.airbase = Math.max(0, h.airbase - dmg * 3); for (const u of s.units) if (u.kind === 'air' && u.owner === defId && u.region === W.nodes[node].region) hurt(s, u, dmg * 0.6); }
  else if (fac === 'port') { h.port = Math.max(0, h.port - dmg * 3); for (const u of s.units) if (u.kind === 'fleet' && u.owner === defId && W.nodes[node].zones.includes(u.zone)) hurt(s, u, dmg * 0.4); }
  else if (fac === 'ind') { h.ind = Math.max(0, h.ind - dmg * 2.5); D.opinion -= Math.min(3, dmg * 0.03); }
  else { const ls = landAt(s, node); for (const u of ls) hurt(s, u, Math.min(60, dmg * 0.8) / Math.max(1, ls.length)); }
}
function hurt(s: GameState, u: Unit, v: number) {
  const before = u.strength; u.strength = Math.max(0, u.strength - v);
  const c = C(s, u.owner); const lost = before - u.strength;
  c.lossesTotal += lost;
  c.opinion -= lost / 100 * 0.35 * Math.min(1.4, Math.sqrt(50 / Math.max(10, c.gdpBase)));
}
export function nearestOwnKm(s: GameState, owner: string, target: number): number {
  let best = Infinity;
  for (let i = 0; i < W.nodes.length; i++) if (sameSide(s, s.nodes[i].ctrl, owner) && (s.nodes[i].ctrl === owner || C(s, s.nodes[i].ctrl).major || C(s, s.nodes[i].ctrl).basesOf.includes(owner))) best = Math.min(best, nodeKm(i, target));
  return best;
}
function fleetNear(s: GameState, owner: string, target: number): boolean {
  const zs = W.nodes[target].zones.length ? W.nodes[target].zones : [];
  return s.units.some((u) => u.kind === 'fleet' && u.owner === owner && !u.transit && (zs.includes(u.zone) || zs.some((z) => W.zones[z].adj.includes(u.zone))));
}
function ownPos(s: GameState, owner: string, target: number): [number, number] {
  let best = -1, bd = Infinity;
  for (let i = 0; i < W.nodes.length; i++) if (sameSide(s, s.nodes[i].ctrl, owner)) { const d = nodeKm(i, target); if (d < bd) { bd = d; best = i; } }
  const n = W.nodes[best < 0 ? C(s, owner).capital : best]; return [n.x, n.y];
}

// ===================== 移動 =====================
function moveUnits(s: GameState) {
  for (const u of s.units) {
    if (u.transit > 0) { u.transit--; continue; }
    if (!u.move) continue;
    u.move.dayLeft--;
    if (u.move.dayLeft > 0) continue;
    const next = u.move.path.shift()!;
    if (!friendlyNode(s, u.owner, next)) { u.move = null; continue; }
    u.node = next;
    if (!u.move.path.length) { u.move = null; continue; }
    u.move.dayLeft = hopDays(s, u.node, u.move.path[0]);
  }
  s.units = s.units.filter((u) => u.strength > 0);
}

// ===================== 空と海 =====================
function airPower(s: GameState, u: Unit): number {
  const c = C(s, u.owner);
  const bases = W.nodesByRegion[u.region].filter((n) => W.nodes[n].airbase && sameSide(s, s.nodes[n].ctrl, u.owner));
  const baseF = bases.length ? Math.max(0.4, bases.reduce((a, n) => a + s.nodes[n].health.airbase, 0) / bases.length / 100) : 0.6;
  return u.strength / 100 * genF(c, 'fighter') * (c.doctrine.air === 'air' ? 1.25 : 1) * baseF;
}
function fleetPower(s: GameState, u: Unit): number {
  const c = C(s, u.owner); return u.strength / 100 * genF(c, 'naval') * (c.doctrine.sea === 'carrier' ? 1.2 : 1);
}
function airSea(s: GameState) {
  // 空
  const airBy: Record<number, number>[] = W.regions.map(() => ({}));
  const adBy: Record<number, number>[] = W.regions.map(() => ({}));
  for (const u of s.units) {
    if (u.kind === 'air' && !u.transit) { const sd = side(s, u.owner); airBy[u.region][sd] = (airBy[u.region][sd] ?? 0) + airPower(s, u); }
    if (u.kind === 'ad' && !u.move && u.node >= 0) {
      const c = C(s, u.owner); const r = W.nodes[u.node].region; const sd = side(s, u.owner);
      adBy[r][sd] = (adBy[r][sd] ?? 0) + 0.5 * u.strength / 100 * genF(c, 'ad') * (c.doctrine.air === 'ground' ? 1.35 : 1);
    }
    if (u.kind === 'fleet' && !u.transit && C(s, u.owner).doctrine.sea === 'carrier') {
      const r = W.zones[u.zone].region; const sd = side(s, u.owner);
      airBy[r][sd] = (airBy[r][sd] ?? 0) + 0.25 * fleetPower(s, u);
    }
  }
  W.regions.forEach((_, r) => {
    const sh: Record<number, number> = {};
    for (const k of new Set([...Object.keys(airBy[r]), ...Object.keys(adBy[r])])) sh[Number(k)] = (airBy[r][Number(k)] ?? 0) + (adBy[r][Number(k)] ?? 0);
    s.airShare[r] = sh;
    // 空戦
    for (const u of s.units) {
      if (u.kind !== 'air' || u.region !== r || u.transit) continue;
      const sd = side(s, u.owner);
      let enemy = 0; for (const k of Object.keys(sh)) if (sidesAtWar(s, Number(k), sd)) enemy += sh[Number(k)];
      if (!enemy) continue;
      const own = airBy[r][sd] ?? 0.01;
      hurt(s, u, 1.6 * enemy / (own + enemy) * rand(0.6, 1.3));
    }
  });
  // 海
  const seaBy: Record<number, number>[] = W.zones.map(() => ({}));
  const subBy: Record<number, boolean>[] = W.zones.map(() => ({}));
  for (const u of s.units) if (u.kind === 'fleet' && !u.transit) {
    const sd = side(s, u.owner); seaBy[u.zone][sd] = (seaBy[u.zone][sd] ?? 0) + fleetPower(s, u);
    if (C(s, u.owner).doctrine.sea === 'sub') subBy[u.zone][sd] = true;
  }
  W.zones.forEach((_, z) => {
    s.seaShare[z] = seaBy[z];
    for (const u of s.units) {
      if (u.kind !== 'fleet' || u.zone !== z || u.transit) continue;
      const sd = side(s, u.owner); let enemy = 0, sub = false;
      for (const k of Object.keys(seaBy[z])) if (sidesAtWar(s, Number(k), sd)) { enemy += seaBy[z][Number(k)]; sub ||= !!subBy[z][Number(k)]; }
      if (!enemy) continue;
      hurt(s, u, 1.3 * enemy / ((seaBy[z][sd] ?? 0.01) + enemy) * rand(0.6, 1.3) * (sub ? 1.3 : 1));
    }
  });
  s.units = s.units.filter((u) => u.strength > 0);
}

// ===================== 補給 =====================
export function computeSupply(s: GameState) {
  const sides = new Map<number, string[]>();
  for (const c of Object.values(s.countries)) { const sd = side(s, c.id); (sides.get(sd) ?? sides.set(sd, []).get(sd)!).push(c.id); }
  const N = W.nodes.length;
  s.supply = {};
  for (const [sd, members] of sides) {
    const mem = new Set(members);
    const inSide = (n: number) => mem.has(s.nodes[n].ctrl);
    const hops = new Array(N).fill(Infinity);
    const q: number[] = [];
    for (let n = 0; n < N; n++) if (inSide(n) && s.nodes[n].ctrl === s.nodes[n].owner && (W.nodes[n].ind >= 2 || W.nodes[n].capital || W.nodes[n].port)) { hops[n] = 0; q.push(n); }
    if (!q.length) continue;
    while (q.length) {
      q.sort((a, b) => hops[a] - hops[b]);
      const cur = q.shift()!;
      const nx: [number, number][] = W.adj[cur].map((e) => [e.to, 1]);
      if (W.nodes[cur].port && s.nodes[cur].health.port >= 30)
        for (const z of W.nodes[cur].zones) if (seaOK(s, z, sd)) for (const p of W.portsByZone[z]) nx.push([p, 2]);
      for (const [n, c] of nx) {
        if (!inSide(n)) continue;
        if (hops[cur] + c < hops[n]) { hops[n] = hops[cur] + c; q.push(n); }
      }
    }
    s.supply[String(sd)] = hops.map((h, n) => (!inSide(n) ? 0 : h === Infinity ? 0.2 : h <= 3 ? 1 : Math.max(0.35, 1 - 0.09 * (h - 3))));
  }
}

// ===================== 地上戦 =====================
function landPower(s: GameState, u: Unit, attack: boolean, node: number): number {
  const c = C(s, u.owner);
  const doc = c.doctrine.land === 'mobile' ? (attack ? 1.25 : 0.95) : (attack ? 1.0 : 1.15);
  const sup = supplyAt(s, u.owner, node);
  const air = 0.75 + 0.5 * airShare(s, W.nodes[node].region, side(s, u.owner));
  const init = c.initiatorDays > 0 ? (attack ? 1.15 : 1) : 1;
  const bonus = c.ai && c.major ? CFG.diff[s.difficulty].bonus : 1;
  return u.strength / 100 * genF(c, 'armor') * doc * (0.4 + 0.6 * sup) * air * init * Math.sqrt(bonus);
}
function groundCombat(s: GameState) {
  for (const o of [...s.orders]) resolveOrder(s, o);
  s.units = s.units.filter((u) => u.strength > 0);
}
function resolveOrder(s: GameState, o: Order) {
  const att = s.units.filter((u) => u.order === o.id && u.node === o.from && !u.move && u.strength > 0);
  const end = (msg?: string) => { for (const u of s.units) if (u.order === o.id) u.order = 0; s.orders = s.orders.filter((x) => x !== o); if (msg && o.owner === s.player) news(s, msg, 'warn'); };
  if (!att.length) return end();
  if (!friendlyNode(s, o.owner, o.from)) return end();
  const tCtrl = s.nodes[o.to].ctrl;
  if (sameSide(s, o.owner, tCtrl)) return end();
  if (!atWar(s, o.owner, tCtrl)) { if (enemyCampIdle(s, o.owner, tCtrl)) dragIn(s, o.owner, tCtrl); else return end(`${W.nodes[o.to].name}への攻勢は、相手と戦争状態でないため取りやめました`); }
  if (o.amphib) {
    const zs = W.nodes[o.from].zones.filter((z) => W.nodes[o.to].zones.includes(z) || W.nodes[o.to].zones.some((t) => W.zones[z].adj.includes(t)));
    if (!zs.some((z) => seaOK(s, z, side(s, o.owner)))) return end(`${W.nodes[o.to].name}への上陸は、制海を失ったため中止しました`);
  }
  const def = s.units.filter((u) => u.node === o.to && (u.kind === 'land' || u.kind === 'ad') && !u.move && u.strength > 0 && atWar(s, o.owner, u.owner));
  let ap = att.reduce((a, u) => a + landPower(s, u, true, o.from), 0) * rand(0.85, 1.15) * (o.amphib ? 0.6 : 1);
  if (o.owner === s.player && !(s.seen[o.to] && s.day - s.seen[o.to].day <= 7)) ap *= 0.85;
  const nd = W.nodes[o.to];
  const fort = (nd.capital ? 1.2 : 1) * (nd.ind >= 4 ? 1.1 : 1);
  let dp = def.reduce((a, u) => a + landPower(s, u, false, o.to) * (u.kind === 'ad' ? 0.3 : 1), 0) * fort * rand(0.85, 1.15);
  dp += (s.nodes[o.to].owner === tCtrl ? 0.15 : 0.05);
  const ratio = ap / dp;
  const tot = ap + dp;
  const attLoss = CFG.combatLoss * dp / tot, defLoss = CFG.combatLoss * ap / tot;
  for (const u of att) hurt(s, u, attLoss / att.length * 1.4);
  for (const u of def) hurt(s, u, defLoss / Math.max(1, def.length) * 1.4);
  o.progress += Math.max(0, ratio - 0.8) * CFG.progressRate + (def.every((u) => u.strength <= 0) ? 30 : 0);
  if (ratio < 0.6) o.badDays++; else o.badDays = 0;
  const avg = att.reduce((a, u) => a + u.strength, 0) / att.length;
  if (o.progress >= 100) return capture(s, o, att);
  if (o.badDays >= 5 || avg < 20) return end(`${W.nodes[o.to].name}への攻勢は行き詰まり、中止しました`);
}
function capture(s: GameState, o: Order, att: Unit[]) {
  const n = o.to; const ns = s.nodes[n]; const loser = ns.ctrl; const L = C(s, loser);
  const newCtrl = ns.owner !== o.owner && sameSide(s, ns.owner, o.owner) ? ns.owner : o.owner;
  // 守備側は退却
  for (const u of s.units.filter((u) => u.node === n && (u.kind === 'land' || u.kind === 'ad') && u.owner !== o.owner && !sameSide(s, u.owner, o.owner))) {
    const back = W.adj[n].find((e) => sameSide(s, s.nodes[e.to].ctrl, u.owner));
    if (back && u.kind === 'land') { u.node = back.to; u.order = 0; hurt(s, u, 10); } else u.strength = 0;
  }
  s.orders = s.orders.filter((x) => x.to !== n || x.owner === o.owner);
  for (const x of s.orders) if (x.from === n) { for (const u of s.units) if (u.order === x.id) u.order = 0; }
  s.orders = s.orders.filter((x) => x !== o && x.from !== n);
  ns.ctrl = newCtrl;
  for (const u of att) { u.node = n; u.order = 0; }
  const A = C(s, o.owner);
  const v = W.nodes[n].ind;
  A.opinion += v * 0.6;
  C(s, ns.owner).opinion -= v * 1.2 + (W.nodes[n].capital ? 15 : 0);
  events.push({ kind: 'capture', t: performance.now() });
  const kind = mine(s, o.owner) ? 'good' : mine(s, loser) ? 'bad' : 'info';
  news(s, `${A.name}が${W.nodes[n].name}（${L.name}）を${newCtrl === o.owner ? '占領' : '奪還'}しました`, kind);
  if (W.nodes[n].capital && n === C(s, ns.owner).capital) capitalFallen(s, ns.owner, o.owner);
}
function capitalFallen(s: GameState, id: string, by: string) {
  const c = C(s, id);
  if (c.opinion < 30 || !c.major) {
    news(s, `${c.name}は首都を失い、降伏しました`, mine(s, id) ? 'bad' : 'good');
    if (id === s.player) { endGame(s, true); return; }
    exitWar(s, id, by, true);
    c.capitulated = true;
  } else news(s, `${c.name}は首都を失いましたが、戦いを続けています`, 'warn');
}

// ===================== 講和 =====================
// id が戦争から抜ける。gainer は戦争目的を得る側
export function exitWar(s: GameState, id: string, gainer: string, capitulate = false) {
  const X = C(s, id);
  X.engaged = false; X.peace['_'] = s.day + 56;
  for (let n = 0; n < W.nodes.length; n++) {
    const ns = s.nodes[n];
    if (ns.owner === id && ns.ctrl !== id && atWarCountry(s, ns.ctrl, id)) {
      const holder = C(s, ns.ctrl);
      const touches = holder.major && W.adj[n].some((e) => s.nodes[e.to].owner === holder.id);
      if (holder.warGoal.includes(n) || touches || (capitulate && C(s, gainer).warGoal.includes(n))) { ns.owner = ns.ctrl; }
      else ns.ctrl = id;
    } else if (ns.ctrl === id && ns.owner !== id) ns.ctrl = ns.owner;
  }
  // 取り残された部隊を戻す
  for (const u of s.units) {
    if ((u.kind === 'land' || u.kind === 'ad') && u.node >= 0 && !sameSide(s, s.nodes[u.node].ctrl, u.owner)) {
      const home = (W.nodesByCountry[u.owner] ?? []).find((n) => s.nodes[n].ctrl === u.owner) ?? C(s, u.owner).capital;
      u.node = home; u.move = null; u.order = 0;
    }
  }
  s.orders = s.orders.filter((o) => o.owner !== id && s.nodes[o.to].ctrl !== id);
  s.strikes = s.strikes.filter((st) => { if (st.owner === id) { X.stock.cruise += st.n.cruise; X.stock.ballistic += st.n.ballistic; X.stock.drone += st.n.drone; return false; } return s.nodes[st.target].ctrl !== id; });
  const G = C(s, gainer);
  G.goalAchieved = Math.max(G.goalAchieved, goalProgress(s, gainer));
  X.opinion = Math.max(X.opinion, 35);
}
function atWarCountry(s: GameState, a: string, b: string) { return campsAtWar(s, C(s, a).camp, C(s, b).camp); }

export function peaceSeverity(s: GameState, demander: string, target: string): number {
  const T = C(s, target);
  let v = 0; for (const n of C(s, demander).warGoal) if (s.nodes[n].owner === target && sameSide(s, s.nodes[n].ctrl, demander)) v += W.nodes[n].ind + 1;
  return v / Math.max(1, T.indBase + 4);
}
// 相手がこの講和を受けるか（type: ask=自分が抜ける, demand=相手が抜ける）
export function peaceAccept(s: GameState, from: string, to: string, type: 'ask' | 'demand'): boolean {
  const hard = s.difficulty === 'hard' ? 0.05 : s.difficulty === 'easy' ? -0.05 : 0;
  if (type === 'ask') return exhaustion(s, to) > 0.22 + hard || goalProgress(s, to) > 0.3 || C(s, from).opinion < CFG.opinionForcedPeace;
  return exhaustion(s, to) - peaceSeverity(s, from, to) * 0.5 > 0.45 + hard;
}
function peaceChecks(s: GameState) {
  for (const c of Object.values(s.countries)) {
    if (!c.engaged || c.capitulated) continue;
    // 世論の限界による強制
    if (c.opinion < CFG.opinionForcedPeace) {
      if (c.id === s.player) { s.forcedPeace = true; continue; }
      const foe = strongestEnemy(s, c.id); if (!foe) continue;
      news(s, `${c.name}は世論の限界から講和を受け入れ、戦争から抜けました`, mine(s, c.id) ? 'bad' : 'good');
      exitWar(s, c.id, foe); continue;
    }
    if (!c.ai || !c.major) continue;
    const ex = exhaustion(s, c.id);
    const foe = strongestEnemy(s, c.id); if (!foe) continue;
    if (ex > 0.78 && s.day - c.engagedDay > 98) {
      if (foe === s.player) { if (!s.pendingPeace) s.pendingPeace = { from: c.id, nodes: [] }; }
      else if (peaceAccept(s, c.id, foe, 'ask')) { news(s, `${c.name}が講和し、戦争から抜けました`, mine(s, c.id) ? 'bad' : 'good'); exitWar(s, c.id, foe); }
    }
  }
}
export function strongestEnemy(s: GameState, id: string): string | null {
  let best: string | null = null, bv = -1;
  for (const o of Object.values(s.countries)) if (atWar(s, id, o.id)) { const v = o.gdpBase + (o.major ? 100 : 0); if (v > bv) { bv = v; best = o.id; } }
  return best;
}

// ===================== 索敵 =====================
function recon(s: GameState) {
  const P = C(s, s.player); const psd = side(s, s.player);
  const vis = new Set<number>();
  const mineNode = (n: number) => sameSide(s, s.nodes[n].ctrl, s.player);
  for (let n = 0; n < W.nodes.length; n++) {
    if (mineNode(n)) { vis.add(n); continue; }
    // 前線の接触
    if (W.adj[n].some((e) => mineNode(e.to) && s.units.some((u) => u.node === e.to && u.owner === s.player))) vis.add(n);
  }
  const period = P.doctrine.intel === 'recon' ? 2 : 3;
  const stealthy = (n: number) => C(s, s.nodes[n].ctrl).doctrine.intel === 'stealth';
  if (P.effects.satBlind <= 0) P.satAssign.forEach((r, i) => {
    if ((s.day + i) % period !== 0) return;
    for (const n of W.nodesByRegion[r]) if (!stealthy(n) || chance(0.65)) vis.add(n);
  });
  const hops = P.doctrine.intel === 'recon' ? 3 : 2;
  for (const r of P.droneAssign) {
    if (airShare(s, r, psd) < 0.35) { if (chance(0.1)) { P.reconDrones = Math.max(0, P.reconDrones - 1); P.droneAssign.pop(); news(s, '偵察ドローン隊が撃墜されました', 'bad'); } continue; }
    const start = W.nodesByRegion[r].filter(mineNode);
    nearby(start, (n) => stealthy(n) ? hops - 1 : hops).forEach((n) => vis.add(n));
  }
  W.regions.forEach((_, r) => {
    if (airShare(s, r, psd) >= 0.6) nearby(W.nodesByRegion[r].filter(mineNode), () => 2).forEach((n) => vis.add(n));
  });
  for (const n of vis) {
    const units = s.units.filter((u) => u.node === n && !u.move);
    const land = units.filter((u) => u.kind === 'land').reduce((a, u) => a + u.strength / 100, 0);
    const ad = units.filter((u) => u.kind === 'ad').length;
    const noise = mineNode(n) ? 0 : stealthy(n) ? 0.4 : 0.1;
    s.seen[n] = { day: s.day, land: Math.max(0, land * rand(1 - noise, 1 + noise)), ad };
  }
  s.visibleNow = [...vis];
}
function nearby(start: number[], hopsOf: (n: number) => number): Set<number> {
  const out = new Set<number>();
  for (const st of start) {
    const seen = new Map<number, number>([[st, 0]]); const q = [st];
    while (q.length) {
      const c = q.shift()!; const d = seen.get(c)!;
      for (const e of W.adj[c]) if (!seen.has(e.to) && d + 1 <= hopsOf(e.to)) { seen.set(e.to, d + 1); q.push(e.to); out.add(e.to); }
    }
  }
  return out;
}

// ===================== 毎日の手入れ =====================
function upkeepDaily(s: GameState) {
  for (const c of Object.values(s.countries)) {
    if (c.engaged) c.opinion += CFG.opinionWarDrift;
    else c.opinion += (CFG.opinionPeaceTarget - c.opinion) * 0.004;
    if (c.engaged && c.warGoal.length) {
      const exp = Math.min(1, (s.day - s.tensionEnd) / 300);
      if (goalProgress(s, c.id) < exp * 0.5) c.opinion -= 0.02 * Math.min(3, c.warGoal.length / 3);
    }
    c.opinion = Math.max(0, Math.min(100, c.opinion));
    for (const k of ['summit', 'cyber', 'mobilize'] as const) if (c.cooldown[k] > 0) c.cooldown[k]--;
    for (const k of ['gdpMalus', 'satBlind', 'adMalus'] as const) if (c.effects[k] > 0) c.effects[k]--;
    if (c.initiatorDays > 0) c.initiatorDays--;
  }
  for (let n = 0; n < W.nodes.length; n++) {
    const h = s.nodes[n].health; const c = C(s, s.nodes[n].ctrl);
    const r = 0.6 + c.budget.ind / 60;
    if (W.nodes[n].adSite) h.ad = Math.min(100, h.ad + r);
    if (W.nodes[n].airbase) h.airbase = Math.min(100, h.airbase + r);
    if (W.nodes[n].port) h.port = Math.min(100, h.port + r);
    h.ind = Math.min(100, h.ind + r * 0.7);
  }
  for (const u of s.units) {
    if (u.kind === 'land' || u.kind === 'ad') {
      if (u.order || u.move || u.node < 0) continue;
      const sup = supplyAt(s, u.owner, u.node);
      if (sup >= 0.5) u.strength = Math.min(100, u.strength + 1.2 * sup);
      else if (sup < 0.3) hurt(s, u, 0.6);
    } else if (!u.transit) u.strength = Math.min(100, u.strength + 0.4);
  }
  s.units = s.units.filter((u) => u.strength > 0);
}

// ===================== 経済（毎週） =====================
function economy(s: GameState, c: Country) {
  let ind = 0;
  for (let n = 0; n < W.nodes.length; n++) {
    const ns = s.nodes[n];
    if (ns.ctrl === c.id) ind += W.nodes[n].ind * ns.health.ind / 100 * (ns.owner === c.id ? 1 : 0.5);
  }
  let gdp = c.gdpBase * ind / Math.max(1, c.indBase);
  const ports = (W.nodesByCountry[c.id] ?? []).filter((n) => W.nodes[n].port && s.nodes[n].ctrl === c.id);
  if (ports.length) {
    const sd = side(s, c.id);
    const blocked = ports.filter((n) => W.nodes[n].zones.every((z) => !seaOK(s, z, sd))).length / ports.length;
    if (blocked >= 0.5) gdp *= ['392', '826'].includes(c.id) ? 0.75 : 0.88;
  }
  if (c.effects.gdpMalus > 0) gdp *= 0.85;
  const ratio = c.debt / (c.gdpBase * 52) * 100;
  if (ratio > CFG.debtPenaltyRatio) { gdp *= 0.95; c.opinion -= 0.3; }
  if (c.ai && c.major) gdp *= CFG.diff[s.difficulty].bonus;
  c.gdp = gdp;
  const interest = c.debt * CFG.interestPerWeek;
  const pts = Math.max(0, gdp - interest);
  // 世論による上限
  capBudget(s, c);
  const mil = pts * c.budget.mil / 100, indPts = pts * c.budget.ind / 100;
  const maint = s.units.filter((u) => u.owner === c.id).reduce((a, u) => a + CFG.maint[u.kind], 0);
  let left = mil - maint;
  if (left < 0) { for (const u of s.units) if (u.owner === c.id) u.strength = Math.max(1, u.strength - 2); left = 0; }
  const qShare = c.queue.length ? (c.genProject ? 0.35 : 0.6) : 0;
  const gShare = c.genProject ? (c.queue.length ? 0.25 : 0.5) : 0;
  if (c.queue.length) {
    const it = c.queue[0]; it.progress += left * qShare;
    if (it.progress >= it.cost) { c.queue.shift(); spawn(s, c, it.kind); }
  }
  if (c.genProject) {
    const g = c.genProject; g.progress += left * gShare;
    if (g.progress >= g.cost) { c.gen[g.cat] = Math.min(3, c.gen[g.cat] + 1); c.genProject = null; if (c.id === s.player) news(s, `${genCatName(g.cat)}の改修が終わりました（${['第4', '第4.5', '第5', '第5.5'][c.gen[g.cat]]}世代相当）`, 'good'); }
  }
  const stockPts = left * (1 - qShare - gShare);
  const split = { ...CFG.stockSplit };
  if (!c.hasBallistic) { split.cruise += split.ballistic / 2; split.interceptor += split.ballistic / 2; split.ballistic = 0; }
  for (const k of ['cruise', 'ballistic', 'interceptor', 'drone'] as const) {
    const cap = Math.max(50, c.stockInit[k] * 2.5);
    c.stock[k] = Math.min(cap, c.stock[k] + stockPts * split[k] / CFG.stockCost[k]);
  }
  c.gdpBase *= 1 + (indPts / Math.max(1, gdp)) * 0.004;
  c.opinion += (c.budget.pop - 20) * 0.07;
  c.opinion = Math.max(0, Math.min(100, c.opinion));
}
export const genCatName = (g: string) => ({ fighter: '戦闘機', armor: '戦車・装甲', ad: '防空・ミサイル', naval: '艦艇・ドローン' } as Record<string, string>)[g];
export function maxMil(s: GameState, c: Country): number {
  let m = c.engaged ? 75 : c.warMode ? 65 : 50;
  if (c.opinion < CFG.opinionBudgetCap) m = Math.min(m, 35);
  void s; return m;
}
export function capBudget(s: GameState, c: Country) {
  const m = maxMil(s, c);
  if (c.budget.mil > m) {
    const extra = c.budget.mil - m; c.budget.mil = m;
    const rest = c.budget.ind + c.budget.pop || 1;
    c.budget.ind += extra * c.budget.ind / rest; c.budget.pop += extra * c.budget.pop / rest;
  }
}
function spawn(s: GameState, c: Country, kind: Unit['kind']) {
  const home = (W.nodesByCountry[c.id] ?? []).filter((n) => s.nodes[n].ctrl === c.id);
  const at = s.nodes[c.capital].ctrl === c.id ? c.capital : home[0];
  if (at === undefined) return;
  if (kind === 'land' || kind === 'ad') newUnit(s, c.id, kind, { node: at });
  else if (kind === 'air') newUnit(s, c.id, 'air', { region: W.nodes[at].region });
  else { const z = home.flatMap((n) => W.nodes[n].zones)[0]; if (z === undefined) return; newUnit(s, c.id, 'fleet', { zone: z }); }
  if (c.id === s.player) news(s, `${({ land: '師団', air: '航空隊', fleet: '艦隊', ad: '防空大隊' } as Record<string, string>)[kind]}が完成しました`, 'good');
}

// ===================== 終了 =====================
function checkEnd(s: GameState) {
  if (s.day >= s.endDay) endGame(s, false);
}
export function endGame(s: GameState, defeat: boolean) {
  s.over = true;
  const p = s.player, P = C(s, p);
  const achieved: string[] = []; const notes: string[] = [];
  if (defeat) { s.result = { rank: 'D', achieved: [], notes: ['首都を失い降伏しました'], defeat: true }; return; }
  const enemyMajors = s.majors.filter((m) => campsAtWar(s, C(s, m).camp, P.camp));
  const military = enemyMajors.length > 0 && enemyMajors.every((m) => C(s, m).capitulated || sameSide(s, s.nodes[C(s, m).capital].ctrl, p));
  if (military) achieved.push('軍事勝利：敵の主要国をすべて降伏させるか、首都を押さえました');
  const gp = goalProgress(s, p);
  if (P.warGoal.length && gp >= 0.5) achieved.push(`有利な講和：戦争目的を${Math.round(gp * 100)}%達成しました`);
  // 陣営の得点
  const score: Record<number, number> = {};
  for (let n = 0; n < W.nodes.length; n++) { const sd = side(s, s.nodes[n].ctrl); score[sd] = (score[sd] ?? 0) + W.nodes[n].ind + 1; }
  const mySide = side(s, p);
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (Number(best[0]) === mySide && P.camp >= 0) {
    let mine = 0; for (let n = 0; n < W.nodes.length; n++) if (s.nodes[n].ctrl === p) mine += W.nodes[n].ind + 1;
    achieved.push(`同盟の勝利：あなたの陣営が最も優勢です（陣営への貢献度 ${Math.round(mine / score[mySide] * 100)}%）`);
  }
  let own = 0, held = 0; for (const n of W.nodesByCountry[p] ?? []) { own += W.nodes[n].ind + 1; if (s.nodes[n].ctrl === p) held += W.nodes[n].ind + 1; }
  const survive = s.nodes[P.capital].ctrl === p && held / own >= 0.8;
  if (survive) achieved.push('生存・現状維持：首都と核心地域を守り抜きました');
  const terr = (id: string) => { let v = 0; for (let n = 0; n < W.nodes.length; n++) if (s.nodes[n].ctrl === id) v += W.nodes[n].ind + 1; return v; };
  const base0 = (id: string) => (W.nodesByCountry[id] ?? []).reduce((a, n) => a + W.nodes[n].ind + 1, 0) || 1;
  const ranking = s.majors.map((m) => ({ m, r: terr(m) / base0(m) })).sort((a, b) => b.r - a.r);
  const myRank = ranking.findIndex((x) => x.m === p) + 1;
  if (myRank === 1 && ranking[0].r > 1.05) achieved.push(`領土拡大：主要国で最も領土を広げました（開始時の${Math.round(ranking[0].r * 100)}%）`);
  notes.push(`領土：開始時の${Math.round(terr(p) / base0(p) * 100)}%（主要国8か国中${myRank}位）　1位 ${C(s, ranking[0].m).name} ${Math.round(ranking[0].r * 100)}%`);
  notes.push(`世論 ${Math.round(P.opinion)}／国債 GDP比 ${Math.round(P.debt / (P.gdpBase * 52) * 100)}%／戦争目的の達成度 ${Math.round(gp * 100)}%`);
  const rank = military ? 'S' : achieved.length >= 3 ? 'A' : achieved.length === 2 ? 'B' : achieved.length === 1 ? 'C' : 'D';
  s.result = { rank, achieved, notes, defeat: false };
}
