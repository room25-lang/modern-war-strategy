import type { Facility, GameState, GenCat, Stock, UnitKind } from '../types';
import { W, isAdj } from '../world';
import { CFG } from '../config';
import { C, atWar, campsAtWar, chance, enemyCampIdle, findPath, friendlyNode, hostileNode, landAt, adAt, sameSide, seaOK, side, hopDays } from './rules';
import { addTension, capBudget, declareWar, engage, exitWar, maxMil, news, peaceAccept, wName } from './sim';

export type Res = { ok: boolean; msg: string };
const ok = (msg = ''): Res => ({ ok: true, msg });
const ng = (msg: string): Res => ({ ok: false, msg });

// ---------- 予算 ----------
export function setBudget(s: GameState, id: string, mil: number, ind: number, pop: number): Res {
  const c = C(s, id); const t = mil + ind + pop || 1;
  c.budget = { mil: mil / t * 100, ind: ind / t * 100, pop: pop / t * 100 };
  capBudget(s, c);
  return ok();
}
export function borrow(s: GameState, id: string): Res {
  const c = C(s, id); const v = c.gdpBase * CFG.borrowWeeks;
  c.debt += v; // 借りた分は弾と生産に回す
  const split = CFG.stockSplit;
  for (const k of ['cruise', 'ballistic', 'interceptor', 'drone'] as const) {
    if (k === 'ballistic' && !c.hasBallistic) continue;
    c.stock[k] += v * 0.5 * split[k] / CFG.stockCost[k];
  }
  for (const it of c.queue) it.progress += v * 0.5 / Math.max(1, c.queue.length);
  return ok(`国債を発行し、${Math.round(v)}ptを弾と生産に回しました`);
}
export function repay(s: GameState, id: string): Res {
  const c = C(s, id); const v = Math.min(c.debt, c.gdpBase * 2);
  c.debt -= v; c.opinion -= 1; for (const it of c.queue) it.progress = Math.max(0, it.progress - v / 4 / Math.max(1, c.queue.length));
  void s; return ok(`${Math.round(v)}ptを返済しました（国民の負担で世論−1）`);
}
export function toggleWarMode(s: GameState, id: string): Res {
  const c = C(s, id); c.warMode = !c.warMode;
  if (c.warMode) { c.opinion -= 5; for (const r of c.interest) addTension(s, r, id, 9); news(s, `${c.name}が戦時体制に移行しました`, id === s.player ? 'warn' : 'info'); }
  capBudget(s, c);
  return ok(c.warMode ? '戦時体制に移行しました（軍の予算上限65%、世論−5、張り詰め度が上昇）' : '平時体制に戻しました');
}
export { maxMil };

// ---------- 生産 ----------
export function enqueue(s: GameState, id: string, kind: UnitKind): Res {
  const c = C(s, id); if (c.queue.length >= 8) return ng('生産の予定がいっぱいです');
  c.queue.push({ kind, progress: 0, cost: CFG.cost[kind] }); void s; return ok();
}
export function dequeue(s: GameState, id: string, i: number): Res { C(s, id).queue.splice(i, 1); return ok(); }
export function mobilize(s: GameState, id: string): Res {
  const c = C(s, id);
  if (c.opinion < CFG.opinionNoMobilize) return ng(`世論が${CFG.opinionNoMobilize}未満のため動員できません`);
  if (c.cooldown.mobilize > 0) return ng(`動員はあと${c.cooldown.mobilize}日できません`);
  const at = s.nodes[c.capital].ctrl === id ? c.capital : (W.nodesByCountry[id] ?? []).find((n) => s.nodes[n].ctrl === id);
  if (at === undefined) return ng('部隊を置ける拠点がありません');
  const n = c.major ? 2 : 1;
  for (let i = 0; i < n; i++) s.units.push({ id: s.nextId++, kind: 'land', owner: id, strength: 60, node: at, region: -1, zone: -1, move: null, transit: 0, order: 0 });
  c.opinion -= CFG.mobilizeOpinion; c.gdpBase *= 0.99; c.cooldown.mobilize = 28;
  return ok(`予備役を動員し、${n}個師団を${W.nodes[at].name}に集めました（世論−${CFG.mobilizeOpinion}、経済−1%）`);
}
export function startGen(s: GameState, id: string, cat: GenCat): Res {
  const c = C(s, id);
  if (c.genProject) return ng('すでに改修中です');
  if (c.gen[cat] >= 3) return ng('これ以上の世代はありません');
  c.genProject = { cat, progress: 0, cost: CFG.genCost[c.gen[cat]] };
  void s; return ok();
}

// ---------- 外交 ----------
export function summit(s: GameState, id: string, target: string): Res {
  const c = C(s, id), t = C(s, target);
  if (!t.major) return ng('首脳会談は主要国とだけ行えます');
  if (c.cooldown.summit > 0) return ng(`首脳会談はあと${c.cooldown.summit}日できません`);
  if (atWar(s, id, target)) return ng('戦争中の相手とは会談できません');
  s.rel[id][target] = Math.min(100, s.rel[id][target] + 12); s.rel[target][id] = s.rel[id][target];
  for (const r of c.interest) if (t.interest.includes(r)) addTension(s, r, id, -10);
  c.cooldown.summit = 28; c.debt += CFG.summitCost * 0.2;
  return ok(`${t.name}と首脳会談を行いました（関係+12、共通の地域の張り詰め度−10）`);
}
export function aid(s: GameState, id: string, target: string): Res {
  const c = C(s, id), t = C(s, target);
  c.debt += CFG.aidCost * 0.5;
  if (t.major) { s.rel[id][target] = Math.min(100, s.rel[id][target] + 6); s.rel[target][id] = s.rel[id][target]; for (const r of c.interest) if (t.interest.includes(r)) addTension(s, r, id, -3); return ok(`${t.name}に経済援助を行いました（関係+6）`); }
  t.alignment[id] = Math.min(100, (t.alignment[id] ?? 0) + 12);
  for (const k of Object.keys(t.alignment)) if (k !== id && !t.basesOf.includes(k)) t.alignment[k] = Math.max(0, t.alignment[k] - 3);
  return ok(`${t.name}に経済援助を行いました（傾き ${Math.round(t.alignment[id])}／陣営入りは${CFG.campJoin}以上）`);
}
export function placeBase(s: GameState, id: string, target: string): Res {
  const c = C(s, id), t = C(s, target);
  if (t.major) return ng('基地は中小国にだけ置けます');
  if ((t.alignment[id] ?? 0) < 40) return ng('この国の傾きが40未満のため、基地を置けません');
  if (t.basesOf.includes(id)) return ng('すでに基地があります');
  if (t.camp >= 0 && c.camp >= 0 && t.camp !== c.camp && t.engaged) return ng('敵陣営として参戦中の国です');
  t.basesOf.push(id); t.alignment[id] = Math.max(60, t.alignment[id]);
  c.debt += CFG.baseCost * 0.5;
  const r = W.nodes[t.capital].region; addTension(s, r, id, 5);
  news(s, `${c.name}が${t.name}に基地を置きました`, id === s.player ? 'info' : 'warn');
  return ok(`${t.name}に基地を置きました（寝返りを防ぎ、出撃拠点になります。張り詰め度+5）`);
}
export function declareWarOn(s: GameState, id: string, target: string): Res {
  const err = declareWar(s, id, target); if (err) return ng(err);
  return ok(`${C(s, target).name}に宣戦しました`);
}
export function declareJoin(s: GameState, id: string): Res {
  const c = C(s, id);
  if (c.engaged) return ng('すでに参戦しています');
  if (!s.wars.some(([a, b]) => a === c.camp || b === c.camp)) return ng('あなたの陣営は戦争をしていません');
  if ((c.peace['_'] ?? 0) > s.day) return ng(`講和したばかりのため、あと${(c.peace['_'] ?? 0) - s.day}日参戦できません`);
  engage(s, id);
  return ok('参戦しました');
}
export function proposePeace(s: GameState, id: string, target: string, type: 'ask' | 'demand'): Res {
  if (!atWar(s, id, target)) return ng('この国とは戦争していません');
  if (s.forcedPeace && id === s.player && type === 'ask') { exitWar(s, id, target); s.forcedPeace = false; news(s, `${C(s, id).name}は講和し、戦争から抜けました`, 'warn'); return ok('講和が成立しました'); }
  if (!peaceAccept(s, id, target, type)) { C(s, id).opinion -= 1; return ng(`${C(s, target).name}は講和を拒否しました`); }
  if (type === 'ask') { exitWar(s, id, target); news(s, `${C(s, id).name}が講和し、戦争から抜けました`, 'warn'); }
  else { exitWar(s, target, id); news(s, `${C(s, target).name}が講和を受け入れ、戦争から抜けました`, 'good'); C(s, id).opinion += 6; }
  return ok('講和が成立しました');
}
export function sendWeapons(s: GameState, id: string, ally: string): Res {
  const c = C(s, id), a = C(s, ally);
  if (!sameSide(s, id, ally) || id === ally) return ng('同じ陣営の国にだけ送れます');
  const give: Stock = { cruise: Math.floor(c.stock.cruise * 0.15), ballistic: 0, interceptor: Math.floor(c.stock.interceptor * 0.15), drone: Math.floor(c.stock.drone * 0.15) };
  for (const k of ['cruise', 'interceptor', 'drone'] as const) { c.stock[k] -= give[k]; a.stock[k] += give[k]; }
  s.rel[id][ally] !== undefined && (s.rel[id][ally] = Math.min(100, s.rel[id][ally] + 3));
  return ok(`${a.name}へ巡航ミサイル${give.cruise}・迎撃弾${give.interceptor}・ドローン${give.drone}を送りました`);
}
export function toggleGoal(s: GameState, id: string, node: number): Res {
  const c = C(s, id);
  if (c.engaged || (id === s.player && s.phase === 'war' && c.engaged)) return ng('戦争目的は参戦する前までしか変えられません');
  if (sameSide(s, id, s.nodes[node].owner)) return ng('自陣営の拠点は戦争目的にできません');
  const i = c.warGoal.indexOf(node);
  if (i >= 0) { c.warGoal.splice(i, 1); return ok(`${W.nodes[node].name}を戦争目的から外しました`); }
  c.warGoal.push(node); return ok(`${W.nodes[node].name}を戦争目的に加えました`);
}

// ---------- 陸 ----------
export function orderTo(s: GameState, id: string, from: number, to: number): Res {
  if (from === to) return ng('');
  if (!friendlyNode(s, id, from)) return ng('出発点が自陣営の拠点ではありません');
  const mine = landAt(s, from).filter((u) => u.owner === id && !u.order);
  const ads = adAt(s, from).filter((u) => u.owner === id);
  if (!mine.length && !ads.length) return ng('この拠点に動かせる部隊がありません');
  const tc = s.nodes[to].ctrl;
  if (friendlyNode(s, id, to)) {
    const p = findPath(s, id, from, to); if (!p) return ng('そこまでの道がありません（敵地や制海の取れていない海を通れません）');
    const movers = mine.length ? mine : ads;
    for (const u of movers) { u.move = { path: [...p.path], dayLeft: hopDays(s, from, p.path[0]), total: p.days }; u.order = 0; }
    return ok(`${movers.length}部隊が${W.nodes[to].name}へ移動を始めました（約${p.days}日）`);
  }
  if (!hostileNode(s, id, to)) return ng(`${C(s, tc).name}とは戦争していません`);
  if (!mine.length) return ng('攻勢に使える師団がありません');
  let amphib = false;
  if (!isAdj(from, to)) {
    const A = W.nodes[from], B = W.nodes[to];
    if (!A.port || !B.zones.length) return ng('隣り合った拠点か、海を挟んだ港どうしでないと攻められません');
    const zs = A.zones.filter((z) => B.zones.includes(z) || B.zones.some((t) => W.zones[z].adj.includes(t)));
    if (!zs.length) return ng('上陸できるのは、同じ海域か隣の海域に面した拠点だけです');
    if (!zs.some((z) => seaOK(s, z, side(s, id)))) return ng('上陸には、その海域の制海が必要です');
    amphib = true;
  }
  const C_ = C(s, id);
  if (!C_.engaged) return ng('まだ参戦していません');
  if (enemyCampIdle(s, id, tc)) engage(s, tc);
  const use = mine.length >= 2 ? mine.sort((a, b) => b.strength - a.strength).slice(0, mine.length - 1) : mine;
  const o = { id: s.nextId++, owner: id, from, to, progress: 0, badDays: 0, amphib };
  s.orders.push(o);
  for (const u of use) u.order = o.id;
  return ok(`${use.length}個師団で${W.nodes[to].name}へ${amphib ? '上陸作戦' : '攻勢'}を始めました`);
}
export function cancelOrder(s: GameState, id: string, oid: number): Res {
  const o = s.orders.find((x) => x.id === oid && x.owner === id); if (!o) return ng('');
  for (const u of s.units) if (u.order === oid) u.order = 0;
  s.orders = s.orders.filter((x) => x !== o); return ok('攻勢を取りやめました');
}
export function reinforceAD(s: GameState, id: string, node: number): Res {
  if (!friendlyNode(s, id, node)) return ng('自陣営の拠点ではありません');
  const cand = s.units.filter((u) => u.owner === id && u.kind === 'ad' && !u.move && u.node !== node);
  if (!cand.length) return ng('動かせる防空大隊がありません（生産パネルで作れます）');
  cand.sort((a, b) => adAt(s, b.node).length - adAt(s, a.node).length);
  const u = cand[0]; const p = findPath(s, id, u.node, node);
  if (!p) return ng('防空大隊を運ぶ道がありません');
  u.move = { path: [...p.path], dayLeft: hopDays(s, u.node, p.path[0]), total: p.days };
  return ok(`${W.nodes[u.node].name}の防空大隊を${W.nodes[node].name}へ送ります（約${p.days}日）`);
}

// ---------- 海・空 ----------
export function assignAir(s: GameState, id: string, uid: number, region: number): Res {
  const u = s.units.find((x) => x.id === uid && x.owner === id && x.kind === 'air'); if (!u) return ng('');
  if (u.region === region) return ok();
  u.region = region; u.transit = 5; return ok(`航空隊を${W.regions[region].name}へ移します（5日）`);
}
export function assignFleet(s: GameState, id: string, uid: number, zone: number): Res {
  const u = s.units.find((x) => x.id === uid && x.owner === id && x.kind === 'fleet'); if (!u) return ng('');
  if (u.zone === zone) return ok();
  // 海域の隣接をたどる日数
  const dist = new Map<number, number>([[u.zone, 0]]); const q = [u.zone];
  while (q.length) { const z = q.shift()!; for (const a of W.zones[z].adj) if (!dist.has(a)) { dist.set(a, dist.get(z)! + 1); q.push(a); } }
  const hops = dist.get(zone) ?? 6;
  u.zone = zone; u.transit = 3 * hops; return ok(`艦隊を${W.zones[zone].name}へ向かわせます（${3 * hops}日）`);
}

// ---------- 打撃 ----------
export function scheduleStrike(s: GameState, id: string, target: number, facility: Facility, n: Stock, dayOffset: number, hour: number): Res {
  const c = C(s, id);
  const tc = s.nodes[target].ctrl;
  if (!(atWar(s, id, tc) || enemyCampIdle(s, id, tc))) return ng('戦争中の相手の拠点しか打撃できません');
  if (!c.engaged) return ng('まだ参戦していません');
  for (const k of ['cruise', 'ballistic', 'drone'] as const) if (n[k] > c.stock[k]) return ng(`${wName(k)}が足りません`);
  if (n.cruise + n.ballistic + n.drone <= 0) return ng('撃つ数を指定してください');
  for (const k of ['cruise', 'ballistic', 'drone'] as const) c.stock[k] -= n[k];
  s.strikes.push({ id: s.nextId++, owner: id, day: s.day + Math.max(1, dayOffset), hour, target, facility, n: { ...n, interceptor: 0 } });
  return ok(`${W.nodes[target].name}への打撃を予約しました`);
}
export function cancelStrike(s: GameState, id: string, sid: number): Res {
  const st = s.strikes.find((x) => x.id === sid && x.owner === id); if (!st) return ng('');
  const c = C(s, id); c.stock.cruise += st.n.cruise; c.stock.ballistic += st.n.ballistic; c.stock.drone += st.n.drone;
  s.strikes = s.strikes.filter((x) => x !== st); return ok('打撃の予約を取り消しました');
}

// ---------- 索敵・サイバー ----------
export function assignSat(s: GameState, id: string, i: number, region: number): Res { const c = C(s, id); if (i < c.satAssign.length) c.satAssign[i] = region; void s; return ok(); }
export function assignDrone(s: GameState, id: string, i: number, region: number): Res { const c = C(s, id); if (i < c.droneAssign.length) c.droneAssign[i] = region; void s; return ok(); }
export function asat(s: GameState, id: string, target: string): Res {
  const c = C(s, id), t = C(s, target);
  if (!c.hasBallistic || c.stock.ballistic < 4) return ng('衛星攻撃には弾道ミサイル4発が必要です');
  if (!atWar(s, id, target)) return ng('戦争中の相手の衛星しか撃てません');
  if (t.satellites <= 0) return ng('相手に衛星がありません');
  c.stock.ballistic -= 4; t.satellites--; t.satAssign.pop();
  for (const o of Object.values(s.countries)) o.opinion -= o.id === id ? 2 : 0;
  news(s, `${c.name}が${t.name}の偵察衛星を破壊しました`, id === s.player ? 'good' : target === s.player ? 'bad' : 'info');
  return ok(`${t.name}の衛星を1基破壊しました（残り${t.satellites}基）`);
}
export function cyber(s: GameState, id: string, target: string, effect: 'gdp' | 'sat' | 'ad'): Res {
  const c = C(s, id), t = C(s, target);
  if (c.cooldown.cyber > 0) return ng(`サイバー攻撃はあと${c.cooldown.cyber}日できません`);
  if (id === target || sameSide(s, id, target)) return ng('味方には行えません');
  c.cooldown.cyber = 56; c.debt += CFG.cyberCost * 0.5;
  const p = (c.doctrine.intel === 'stealth' ? 0.75 : 0.65) - (t.doctrine.intel === 'stealth' ? 0.1 : 0);
  const detected = chance(0.45);
  if (detected && c.major && t.major) { s.rel[id][target] -= 8; s.rel[target][id] -= 8; for (const r of c.interest) if (t.interest.includes(r)) addTension(s, r, id, 6); }
  if (!chance(p)) return ng(`サイバー攻撃は失敗しました${detected ? '（相手に気づかれました）' : ''}`);
  if (effect === 'gdp') t.effects.gdpMalus = 28; else if (effect === 'sat') t.effects.satBlind = 21; else t.effects.adMalus = 14;
  return ok(`サイバー攻撃が成功しました：${t.name}の${effect === 'gdp' ? '経済（4週間 −15%）' : effect === 'sat' ? '衛星（3週間 使えない）' : '防空（2週間 −40%）'}${detected ? '／相手に気づかれました' : ''}`);
}
export const canAttack = (s: GameState, id: string, n: number) => hostileNode(s, id, n) && C(s, id).engaged;
export { campsAtWar };
