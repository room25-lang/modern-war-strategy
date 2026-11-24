import type { Facility, GameState, GenCat, Stock } from '../types';
import { W, isAdj, nodeKm } from '../world';
import { CFG } from '../config';
import { CAMP_COLORS, MAJORS } from '../data/countries';
import * as A from '../game/actions';
import {
  C, adAt, airShare, atWar, campsAtWar, exhaustion, genLabel, goalProgress, hostileNode, landAt, sameSide, seaOK, side, supplyAt, weekOf,
} from '../game/rules';
import { campName, exitWar, facName, genCatName, nearestOwnKm, wName } from '../game/sim';
import type { MapView, ViewState } from '../render/map';
import { drawMinimap } from '../render/map';
import { flagSVG } from './flags';
import { music, setMood, setMusicVol, sfx, sound, toggleMusic, toggleSound } from '../audio';

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const pct = (v: number) => `${Math.round(v)}%`;
const n0 = (v: number) => Math.round(v).toLocaleString();

export interface Host {
  s: GameState; view: MapView; v: ViewState; paused: boolean;
  setPaused(p: boolean): void; save(slot: number): void; load(slot: number): boolean; restart(): void;
}

type Panel = 'diplo' | 'budget' | 'prod' | 'land' | 'sea' | 'air' | 'strike' | 'recon' | 'cyber' | 'news' | null;

export class UI {
  h: Host; panel: Panel = null;
  diploSel = '';
  draft = { target: -1, facility: 'ad' as Facility, n: { cruise: 0, ballistic: 0, drone: 0, interceptor: 0 } as Stock, day: 1, hour: 3 };
  cyberSel = { target: '', effect: 'gdp' as 'gdp' | 'sat' | 'ad' };
  weekSnap = { debt: 0, opinion: 0, missile: 0, ad: 0, week: -1 };
  newsSeen = 0;
  tour: () => void = () => {};

  constructor(h: Host) { this.h = h; }
  get s() { return this.h.s; }
  get me() { return C(this.s, this.s.player); }

  // ---------- 初期化 ----------
  mount() {
    $('#cats').innerHTML = ([
      ['diplo', '外交', 'M3 9 L10 4 L17 9 M5 9 V15 M10 9 V15 M15 9 V15 M3 16 H17'],
      ['budget', '予算', 'M10 3 a7 7 0 1 0 0.01 0 M10 3 V10 L15 14'],
      ['prod', '生産', 'M2 17 V9 L7 12 V9 L12 12 V5 H17 V17 Z'],
      ['land', '部隊', 'M3 5 H17 V15 H3 Z M3 5 L17 15 M17 5 L3 15'],
      ['sea', '海', 'M2 12 H18 L15 16 H5 Z M7 12 V8 H12 V12 M9.5 8 V4'],
      ['air', '空', 'M10 2 L11.5 8 L18 11 V12.5 L11.5 11 L11 15 L13 16.5 V18 L10 17 L7 18 V16.5 L9 15 L8.5 11 L2 12.5 V11 L8.5 8 Z'],
      ['strike', '打撃', 'M10 3.5 a6.5 6.5 0 1 0 0.01 0 M10 1.5 V5 M10 15 V18.5 M1.5 10 H5 M15 10 H18.5'],
      ['recon', '索敵', 'M2 10 Q10 3 18 10 Q10 17 2 10 Z M10 7.5 a2.5 2.5 0 1 0 0.01 0'],
      ['cyber', 'サイバー', 'M3 4 H17 V14 H3 Z M7 7.5 L5.5 9 L7 10.5 M13 7.5 L14.5 9 L13 10.5 M7 17 H13'],
    ] as const).map(([k, t, d]) => `<button type="button" data-panel="${k}"><svg width="26" height="26" viewBox="0 0 20 20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></path></svg>${t}</button>`).join('');
    const ic = (d: string) => `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"></path></svg>`;
    $('#tools').innerHTML = `
      <button type="button" class="lb" data-tool="mode">${ic('M10 2.5 a7.5 7.5 0 1 0 0.01 0 M2.5 10 H17.5 M10 2.5 C6.5 6 6.5 14 10 17.5 M10 2.5 C13.5 6 13.5 14 10 17.5')}国/陣営</button>
      <button type="button" class="lb" data-tool="sea">${ic('M2 12 H18 L15 16 H5 Z M7 12 V8 H12 V12 M9.5 8 V4')}制海</button>
      <button type="button" class="lb" data-tool="air">${ic('M10 2 L11.5 8 L18 11 V12.5 L11.5 11 L11 15 L13 16.5 V18 L10 17 L7 18 V16.5 L9 15 L8.5 11 L2 12.5 V11 L8.5 8 Z')}制空</button>
      <button type="button" class="lb" data-tool="supply">${ic('M3 6.5 L10 3 L17 6.5 V14 L10 17.5 L3 14 Z M3 6.5 L10 10 L17 6.5 M10 10 V17.5')}補給</button>
      <div class="pair"><button type="button" data-tool="search" aria-label="拠点を探す">${ic('M8.5 3 a5.5 5.5 0 1 0 0.01 0 M13 13 L18 18')}</button><button type="button" data-tool="news" aria-label="ニュース">${ic('M2.5 4.5 H17.5 V15.5 H2.5 Z M2.5 5 L10 11 L17.5 5')}</button></div>`;
    document.body.addEventListener('click', (e) => this.onClick(e));
    document.body.addEventListener('input', (e) => this.onInput(e));
    document.body.addEventListener('change', (e) => this.onInput(e));
    $('#mini canvas').addEventListener('click', (e) => {
      const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
      this.h.view.cam.x = (e.clientX - r.left) / r.width * W.W; this.h.view.cam.y = (e.clientY - r.top) / r.height * W.H; this.h.view.clamp();
    });
  }

  mark(k: string) { if (!this.s.tips.includes(k)) this.s.tips.push(k); }
  // 選んだ拠点から行ける先
  updateCand() {
    const s = this.s, v = this.h.v, n = v.selected, me = s.player;
    v.cand = null;
    if (n === null || !sameSide(s, s.nodes[n].ctrl, me)) return;
    if (!s.units.some((u) => u.node === n && u.owner === me && !u.move && (u.kind === 'land' || u.kind === 'ad') && !u.order)) return;
    const attack: number[] = [], move: number[] = [];
    const eng = C(s, me).engaged; const sd = side(s, me);
    for (const e of W.adj[n]) { if (sameSide(s, s.nodes[e.to].ctrl, me)) move.push(e.to); else if (eng && hostileNode(s, me, e.to)) attack.push(e.to); }
    if (W.nodes[n].port && s.nodes[n].health.port >= 30) for (const z of W.nodes[n].zones) {
      if (!seaOK(s, z, sd)) continue;
      for (const zz of [z]) for (const p of W.portsByZone[zz]) {
        if (p === n || isAdj(n, p) || attack.includes(p) || move.includes(p)) continue;
        if (sameSide(s, s.nodes[p].ctrl, me)) { if (zz === z) move.push(p); } else if (eng && hostileNode(s, me, p)) attack.push(p);
      }
    }
    v.cand = { from: n, attack, move };
  }

  // ---------- 毎フレーム・毎日の更新 ----------
  frame() { drawMinimap($('#mini canvas') as HTMLCanvasElement, this.h.view); }
  daily() {
    const s = this.s;
    if (weekOf(s) !== this.weekSnap.week && s.day % 7 === 0) {
      const me = this.me;
      this.weekSnap = { debt: this.debtRatio(), opinion: me.opinion, missile: this.missilePct(), ad: this.adPct(), week: weekOf(s) };
    }
    setMood(s.phase === 'war' && this.me.engaged ? 'war' : 'calm');
    this.updateCand(); this.top(); this.legend(); this.nodePanel(); this.strikeBar(); this.renderPanel(); this.todo(); this.flushNews(); this.checkModals();
    const tb = document.querySelectorAll('#tools button');
    tb.forEach((b) => { const t = (b as HTMLElement).dataset.tool; b.classList.toggle('on', (t === 'mode' && this.h.v.mode === 'camp') || t === this.h.v.overlay); });
  }
  debtRatio() { const c = this.me; return c.debt / (c.gdpBase * 52) * 100; }
  missilePct() { const c = this.me; const i = c.stockInit.cruise + c.stockInit.ballistic; return i ? (c.stock.cruise + c.stock.ballistic) / i * 100 : 0; }
  adPct() { const c = this.me; return c.stockInit.interceptor ? c.stock.interceptor / c.stockInit.interceptor * 100 : 0; }

  top() {
    const s = this.s, c = this.me;
    const d = (now: number, was: number, good: 'up' | 'down', unit = '') => {
      if (this.weekSnap.week < 0) return '';
      const x = now - was; if (Math.abs(x) < 0.5) return '';
      const isGood = good === 'up' ? x > 0 : x < 0;
      return `<span class="${isGood ? 'up' : 'down'}">${x > 0 ? '+' : '−'}${Math.abs(Math.round(x))}${unit}/週</span>`;
    };
    const wk = weekOf(s);
    const date = s.phase === 'tension' ? `緊張期 第${wk}週<small>開戦まで最長あと${Math.max(0, CFG.tensionWeeks - wk + 1)}週</small>` : `第${wk}週<small>終了まであと${CFG.totalWeeks - wk + 1}週</small>`;
    $('#top').innerHTML = `
      <div class="flag">${flagSVG(c.id, c.color)}</div>
      <div class="met"><span>予算配分</span><b>軍${Math.round(c.budget.mil)} ・ 産業${Math.round(c.budget.ind)} ・ 国民${Math.round(c.budget.pop)}</b></div>
      <div class="met"><span>週の予算</span><b>${n0(c.gdp)}pt</b></div>
      <div class="met"><span>国債（GDP比）</span><b>${n0(this.debtRatio())}% ${d(this.debtRatio(), this.weekSnap.debt, 'down')}</b></div>
      <div class="met"><span>世論</span><b class="${c.opinion < CFG.opinionNoMobilize ? 'warn' : ''}">${n0(c.opinion)} ${d(c.opinion, this.weekSnap.opinion, 'up')}</b></div>
      <div class="met"><span>ミサイル在庫</span><b>${pct(this.missilePct())} ${d(this.missilePct(), this.weekSnap.missile, 'up')}</b></div>
      <div class="met"><span>防空在庫</span><b class="${this.adPct() < 35 ? 'warn' : ''}">${pct(this.adPct())} ${d(this.adPct(), this.weekSnap.ad, 'up')}</b></div>
      <div class="met"><span>戦争目的の達成度</span><b>${c.warGoal.length ? pct(goalProgress(s, c.id) * 100) : '未設定'}</b></div>
      <div class="right">
        ${this.timerHtml()}
        <div class="date">${date}</div>
        <button type="button" data-act="pause" aria-label="${this.h.paused ? '再生' : '一時停止'}" class="${this.h.paused ? 'hot' : ''}">${this.h.paused ? '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1 L12 7 L3 13 Z" fill="currentColor"></path></svg>' : '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" fill="currentColor"></rect><rect x="8.5" y="1" width="3.5" height="12" fill="currentColor"></rect></svg>'}</button>
        <button type="button" data-act="settings" aria-label="設定"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M9 1.5v2.5M9 14v2.5M1.5 9H4M14 9h2.5M3.7 3.7l1.8 1.8M12.5 12.5l1.8 1.8M3.7 14.3l1.8-1.8M12.5 5.5l1.8-1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg></button>
      </div>`;
  }
  timerHtml() {
    const ms = this.s.playMs ?? 0, lim = 2 * 3600 * 1000;
    const f = (v: number) => { const t = Math.floor(v / 1000); return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
    const over = ms >= lim;
    return `<div class="timer ${over ? 'over' : ms > lim * 0.85 ? 'near' : ''}" title="実際に遊んだ時間（一時停止中は止まります）"><span>プレイ時間</span><b>${f(ms)}<small> / 2:00:00</small></b><i style="width:${Math.min(100, ms / lim * 100)}%"></i></div>`;
  }
  tickTimer() {
    const el = document.querySelector('#top .timer'); if (!el) return;
    el.outerHTML = this.timerHtml();
    const ms = this.s.playMs ?? 0;
    if (ms >= 2 * 3600 * 1000 && !this.s.tips.includes('timer2h')) { this.mark('timer2h'); this.toast('プレイ開始から2時間が経ちました。区切りのいいところで保存して休みましょう', 'warn'); sfx.alert(); }
    else if (ms >= 105 * 60 * 1000 && !this.s.tips.includes('timer105')) { this.mark('timer105'); this.toast('2時間まであと15分です', 'info'); }
  }
  legend() {
    const v = this.h.v;
    const items: [string, string][] = v.mode === 'camp'
      ? [[CAMP_COLORS.self, '自国'], [CAMP_COLORS.ally, '同じ陣営'], [CAMP_COLORS.enemy, '敵（参戦中）'], [CAMP_COLORS.enemyIdle, '敵陣営（未参戦）'], [CAMP_COLORS.other, '別の陣営'], [CAMP_COLORS.neutral, '中立']]
      : MAJORS.map((m) => [m.color, m.name] as [string, string]);
    $('#legend').innerHTML = items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('') + `<span><i class="gold"></i>金の縁＝あなたの国</span><span><i class="hatch"></i>斜線＝占領地</span><span><i style="background:#2A2E35"></i>暗い所＝未索敵</span>`;
  }

  // ---------- 拠点パネル ----------
  nodePanel() {
    const s = this.s, n = this.h.v.selected, el = $('#nodePanel');
    if (n === null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const wn = W.nodes[n], ns = s.nodes[n], ctrl = C(s, ns.ctrl), owner = C(s, ns.owner);
    const p = s.player;
    const friendly = sameSide(s, ns.ctrl, p);
    const hostile = hostileNode(s, p, n) || campsAtWar(s, this.me.camp, ctrl.camp);
    const badges = [wn.capital && '首都', wn.port && '港', wn.airbase && '航空基地', wn.adSite && '防空陣地'].filter(Boolean).join('・');
    let units = '';
    if (friendly) {
      const mine = s.units.filter((u) => u.node === n && !u.move);
      const land = mine.filter((u) => u.kind === 'land'); const ad = mine.filter((u) => u.kind === 'ad');
      units = `陸${land.length}・防空${ad.length}`;
    } else {
      const seen = s.seen[n];
      units = seen ? (s.day - seen.day <= 1 ? `陸 約${Math.round(seen.land)}・防空${seen.ad}` : `${s.day - seen.day}日前：陸 約${Math.round(seen.land)}`) : '不明（索敵が必要）';
    }
    const psd = side(s, p);
    const stat = (k: string, val: string, cls = '') => `<span class="k">${k}</span><b class="${cls}">${val}</b>`;
    const goal = this.me.warGoal.includes(n);
    const canGoal = !this.me.engaged && !sameSide(s, ns.owner, p);
    el.innerHTML = `
      <div class="ph">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${wn.capital ? '<path d="M8 1 l2 4.5 5 .6 -3.7 3.4 1 5 -4.3 -2.5 -4.3 2.5 1 -5 L1 6.1 l5 -.6z" fill="currentColor"></path>' : '<circle cx="8" cy="8" r="4" fill="currentColor"></circle>'}</svg>
        <h2>${wn.name}</h2><span class="muted">${ctrl.name}${ns.owner !== ns.ctrl ? `（${owner.name}領を占領中）` : ''}${badges ? '／' + badges : ''}</span>
        <button type="button" class="x" data-act="deselect" aria-label="閉じる">✕</button>
      </div>
      <div class="tbl">
        ${stat(friendly ? '駐留' : '敵兵力', units)}
        ${stat('補給', friendly ? pct(supplyAt(s, ns.ctrl, n) * 100) : '—', friendly && supplyAt(s, ns.ctrl, n) < 0.5 ? 'warn' : '')}
        ${stat('防空', wn.adSite ? `陣地${Math.round(ns.health.ad)}%・大隊${adAt(s, n).length}` : `大隊${adAt(s, n).length}`)}
        ${stat('産業', `${wn.ind}（稼働${Math.round(ns.health.ind)}%）`)}
        ${stat('制空', `${pct(airShare(s, wn.region, psd) * 100)}<small>${W.regions[wn.region].name}</small>`)}
        ${stat(friendly ? '港・基地' : '索敵', friendly ? (`${wn.port ? '港' + Math.round(ns.health.port) + '% ' : ''}${wn.airbase ? '基地' + Math.round(ns.health.airbase) + '%' : ''}`.trim() || '—') : (s.seen[n] ? `${s.day - s.seen[n].day}日前` : 'なし'))}
      </div>
      ${friendly ? this.unitList(n) : ''}
      <div class="acts">
        ${friendly ? `<button type="button" data-act="reinforceAD">防空強化</button>` : ''}
        ${hostile ? `<button type="button" data-act="strikeAt" class="hot">打撃</button>` : ''}
        ${canGoal ? `<button type="button" data-act="goal">${goal ? '戦争目的から外す' : '戦争目的に加える'}</button>` : ''}
        ${!friendly ? `<button type="button" data-act="droneHere">偵察を向ける</button>` : ''}
        ${!ctrl.major && !friendly && !hostile ? `<button type="button" data-act="diploOpen" data-arg="${ctrl.id}">外交</button>` : ''}
      </div>`;
  }

  unitList(n: number): string {
    const s = this.s, me = s.player;
    const us = s.units.filter((u) => u.node === n && (u.kind === 'land' || u.kind === 'ad')).sort((a, b) => (a.owner === me ? -1 : 1) - (b.owner === me ? -1 : 1));
    if (!us.length) return '<p class="hintline">この拠点に部隊はいません</p>';
    const rows = us.slice(0, 6).map((u) => {
      const st = u.move ? `移動中 → ${W.nodes[u.move.path.at(-1)!].name}` : u.order ? `攻勢中 → ${W.nodes[s.orders.find((o) => o.id === u.order)?.to ?? n].name}` : '待機';
      const col = u.strength > 66 ? '#9CCB8E' : u.strength > 33 ? '#E8B36A' : '#E0606A';
      return `<div class="urow ${u.owner === me ? 'mine' : ''}"><span class="ui">${u.kind === 'land' ? '師団' : '防空'}</span><span class="uo">${C(s, u.owner).name}</span><span class="bar"><i style="width:${u.strength}%;background:${col}"></i></span><b>${Math.round(u.strength)}%</b><span class="us">${st}</span></div>`;
    }).join('');
    const mineHere = us.some((u) => u.owner === me && !u.move && !u.order);
    return `<div class="ulist">${rows}${us.length > 6 ? `<p class="muted">ほか${us.length - 6}部隊</p>` : ''}</div>${mineHere ? '<p class="hintline"><b class="r">赤い輪</b>の拠点を押すと攻撃、<b>白い点線の輪</b>を押すと移動（ドラッグでも可）</p>' : ''}`;
  }

  // ---------- やることリスト ----------
  todo() {
    const s = this.s, me = this.me, el = $('#todo');
    if (this.panel || !s || s.over) { el.classList.add('hidden'); return; }
    const done = (k: string) => s.tips.includes(k);
    type T = [string, string, boolean, string];
    const items: T[] = [];
    const campWar = s.wars.some(([a, b]) => a === me.camp || b === me.camp);
    if (s.phase === 'tension') {
      items.push(['time', '時間を進める（スペースキー／右上の▶）', s.day > 0, 'pause']);
      items.push(['goal', '戦争目的を決める：敵になりそうな国の拠点を押して「戦争目的に加える」', me.warGoal.length > 0, 'hint:goal']);
      items.push(['aid', '中小国に援助して味方に引き込む（外交）', done('aid'), 'panel:diplo']);
      items.push(['move', '部隊を国境の拠点へ動かす（自分の駒を押して白い輪へ）', done('move'), 'hint:move']);
      items.push(['prod', '師団か防空大隊を生産する（生産）', done('prod'), 'panel:prod']);
      items.push(['budget', '予算の配分を見直す（予算）', done('budget'), 'panel:budget']);
    } else {
      if (campWar && !me.engaged) items.push(['join', 'あなたの陣営が戦争中です。参戦する（外交）', false, 'panel:diplo']);
      items.push(['budget', '戦時に合わせて軍の予算を増やす（予算）', done('budget'), 'panel:budget']);
      if (me.engaged) {
        items.push(['recon', '偵察衛星・ドローンを前線へ向ける（索敵）', done('recon'), 'panel:recon']);
        items.push(['strike', '敵の防空陣地を打撃する（打撃）', done('strike'), 'panel:strike']);
        items.push(['attack', '前線の敵拠点へ攻勢をかける（駒を押して赤い輪へ）', done('attack'), 'hint:move']);
        items.push(['seaair', '艦隊と航空隊を前線へ割り当てる（海・空）', done('seaair'), 'panel:air']);
        items.push(['peace', '世論・在庫が苦しくなったら講和を考える（外交）', me.opinion > 45, 'panel:diplo']);
      }
    }
    const open = items.filter((i) => !i[2]).slice(0, 4);
    const total = items.length, fin = items.filter((i) => i[2]).length;
    el.classList.toggle('hidden', !open.length);
    el.innerHTML = `<div class="th"><b>${s.phase === 'tension' ? '緊張期にやること' : '戦時にやること'}</b><span>${fin}/${total}</span></div>${open.map((i) => `<button type="button" class="ti" data-todo="${i[3]}"><span class="box"></span>${i[1]}</button>`).join('')}`;
  }

  // ---------- 打撃予定 ----------
  strikeBar() {
    const s = this.s;
    const mine = s.strikes.filter((x) => x.owner === s.player).sort((a, b) => a.day - b.day || a.hour - b.hour || a.target - b.target);
    const linked = (i: number) => i > 0 && mine[i - 1].target === mine[i].target && mine[i - 1].day === mine[i].day;
    const group = (i: number) => linked(i) || (i + 1 < mine.length && linked(i + 1));
    const card = (x: (typeof mine)[number], i: number) => {
      const w = (['drone', 'cruise', 'ballistic'] as const).filter((k) => x.n[k] > 0).map((k) => `${wName(k)}×${x.n[k]}`).join('<br>');
      return `${linked(i) ? '<span class="link" aria-label="同時刻">⛓</span>' : ''}<div class="scard ${group(i) ? 'sat' : ''}"><span class="t">${x.day - s.day <= 0 ? '本日' : `あと${x.day - s.day}日`}　${String(x.hour).padStart(2, '0')}:00</span><b>${W.nodes[x.target].name}・${facName(x.facility)}</b><span>${w}</span><button type="button" class="x" data-act="cancelStrike" data-arg="${x.id}" aria-label="取り消す">✕</button></div>`;
    };
    $('#strikeBar').innerHTML = `<div class="shead"><b>打撃予定</b><span>同じ日に重ねると飽和攻撃</span></div><div class="srow">${mine.slice(0, 4).map(card).join('')}${mine.length > 4 ? `<div class="scard more"><b>ほか${mine.length - 4}件</b></div>` : ''}<button type="button" class="sadd" data-panel="strike"><span>＋</span>打撃を予約</button></div>`;
  }

  // ---------- パネル ----------
  open(p: Panel) { this.panel = this.panel === p ? null : p; this.renderPanel(); document.querySelectorAll('#cats button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.panel === this.panel)); }
  renderPanel() {
    const el = $('#panel');
    if (!this.panel) { el.classList.add('hidden'); return; }
    // 入力中は描き直さない
    if (el.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName.match(/INPUT|SELECT/)) return;
    el.classList.remove('hidden');
    const body = ({ diplo: () => this.pDiplo(), budget: () => this.pBudget(), prod: () => this.pProd(), land: () => this.pLand(), sea: () => this.pSea(), air: () => this.pAir(), strike: () => this.pStrike(), recon: () => this.pRecon(), cyber: () => this.pCyber(), news: () => this.pNews() } as Record<string, () => string>)[this.panel]();
    const title = ({ diplo: '外交', budget: '予算', prod: '生産', land: '部隊一覧', sea: '海軍', air: '空軍', strike: '打撃', recon: '索敵', cyber: 'サイバー', news: 'ニュース' } as Record<string, string>)[this.panel];
    el.innerHTML = `<div class="ph"><h2>${title}</h2><button type="button" class="x" data-act="closePanel" aria-label="閉じる">✕</button></div><div class="pb">${body}</div>`;
  }

  pDiplo(): string {
    const s = this.s, me = this.me;
    const camps = [...new Set(Object.values(s.countries).filter((c) => c.camp >= 0).map((c) => c.camp))];
    const campHtml = camps.map((k) => {
      const ms = Object.values(s.countries).filter((c) => c.camp === k);
      const war = s.wars.filter(([a, b]) => a === k || b === k).map(([a, b]) => campName(s, a === k ? b : a));
      return `<div class="camp"><b>${campName(s, k)}${k === me.camp ? '（自陣営）' : ''}</b>${war.length ? `<span class="down">戦争中：${war.join('、')}</span>` : ''}<div class="chips">${ms.map((c) => `<button type="button" data-act="dsel" data-arg="${c.id}" class="cc ${c.engaged ? 'eng' : ''} ${this.diploSel === c.id ? 'on' : ''}">${c.name}</button>`).join('')}</div></div>`;
    }).join('');
    const majors = s.majors.filter((m) => m !== me.id).map((m) => {
      const r = s.rel[me.id][m]; const c = C(s, m);
      return `<button type="button" class="relrow ${this.diploSel === m ? 'on' : ''}" data-act="dsel" data-arg="${m}"><span>${c.name}</span><span class="bar"><i style="left:50%;width:${Math.abs(r) / 2}%;${r < 0 ? `transform:translateX(-100%);background:${CAMP_COLORS.enemy}` : `background:${CAMP_COLORS.self}`}"></i></span><b>${r > 0 ? '+' : ''}${Math.round(r)}</b></button>`;
    }).join('');
    let sel = '';
    if (this.diploSel && this.diploSel !== me.id) {
      const t = C(s, this.diploSel);
      const war = atWar(s, me.id, t.id);
      sel = `<div class="selbox"><h3>${t.name}</h3>
        <p class="muted">${t.major ? `関係 ${Math.round(s.rel[me.id][t.id])}／世論 ${Math.round(t.opinion)}／疲弊 ${Math.round(exhaustion(s, t.id) * 100)}%` : `あなたへの傾き ${Math.round(t.alignment[me.id] ?? 0)}（${CFG.campJoin}以上で陣営入り）／${t.basesOf.length ? '基地：' + t.basesOf.map((b) => C(s, b).name).join('・') : '基地なし'}`}</p>
        <div class="acts">
          ${t.major && !war ? `<button type="button" data-act="summit">首脳会談</button>` : ''}
          ${!war ? `<button type="button" data-act="aid">経済援助（${CFG.aidCost}pt）</button>` : ''}
          ${!t.major && !war ? `<button type="button" data-act="base">基地を置く（${CFG.baseCost}pt）</button>` : ''}
          ${sameSide(s, me.id, t.id) ? `<button type="button" data-act="weapons">兵器を送る</button>` : ''}
          ${war ? `<button type="button" data-act="peaceDemand" class="hot">講和を迫る（相手が抜ける）</button><button type="button" data-act="peaceAsk">講和を求める（自国が抜ける）</button><button type="button" data-act="asat">衛星を攻撃</button>` : ''}
        </div></div>`;
    }
    const join = !me.engaged && s.wars.some(([a, b]) => a === me.camp || b === me.camp) ? `<button type="button" class="hot wide" data-act="join">参戦する</button>` : '';
    const goals = me.warGoal.length ? me.warGoal.map((n) => `<span class="tag">${W.nodes[n].name}</span>`).join('') : '<span class="muted">未設定。敵になりそうな国の拠点を選び、拠点パネルから加えます（参戦するまで）</span>';
    return `${join}
      <h3>陣営</h3><p class="muted">${s.phase === 'tension' ? '陣営は関係値で自動的に決まります（関係+40以上で同じ陣営）。開戦で固定されます' : '陣営は固定されています。太字の国は参戦中'}</p>${campHtml}
      <h3>主要国との関係</h3>${majors}${sel}
      <h3>戦争目的</h3><div class="chips">${goals}</div>
      ${s.phase === 'tension' ? `<h3>張り詰め度</h3>${W.regions.map((r, i) => ({ r, t: s.tension[i] })).filter((x) => x.t > 20).sort((a, b) => b.t - a.t).slice(0, 6).map((x) => `<div class="kv"><span>${x.r.name}</span><span class="bar"><i style="width:${x.t}%;background:${x.t > 75 ? CAMP_COLORS.enemy : '#B5B6B9'}"></i></span><b>${Math.round(x.t)}</b></div>`).join('')}<p class="muted">100に達した地域から戦争が始まります。緊張期が終わると、最も高い地域で必ず開戦します</p>` : ''}`;
  }
  pBudget(): string {
    const c = this.me, mx = A.maxMil(this.s, c);
    const slider = (k: 'mil' | 'ind' | 'pop', t: string, note: string) => `<label class="sl"><span>${t} <b>${Math.round(c.budget[k])}%</b></span><input type="range" min="0" max="100" step="1" value="${Math.round(c.budget[k])}" data-budget="${k}"><small>${note}</small></label>`;
    return `${slider('mil', '軍', `部隊の維持・生産・弾の補充（上限${mx}%）`)}${slider('ind', '産業', '経済を育てる（来週以降の予算が増える）')}${slider('pop', '国民', '世論を支える（20%を超えた分だけ上がる）')}
      <div class="kv"><span>週の予算</span><b>${n0(c.gdp)}pt</b></div>
      <div class="kv"><span>国債（GDP比）</span><b>${n0(this.debtRatio())}%</b></div>
      <div class="kv"><span>利払い</span><b>${(c.debt * CFG.interestPerWeek).toFixed(1)}pt/週</b></div>
      <div class="acts"><button type="button" data-act="borrow">国債を発行（+${n0(c.gdpBase * CFG.borrowWeeks)}pt）</button><button type="button" data-act="repay">返済する</button></div>
      <p class="muted">GDP比${CFG.debtPenaltyRatio}%を超えると、経済と世論が毎週下がります</p>
      <h3>体制</h3><div class="acts"><button type="button" data-act="warMode" class="${c.warMode ? 'hot' : ''}">${c.warMode ? '戦時体制（解除する）' : '戦時体制に移行'}</button></div>
      <p class="muted">戦時体制：軍の上限が65%に上がる代わりに、世論−5と張り詰め度の上昇。参戦中は上限75%</p>
      <h3>世論の限界</h3><p class="muted">${CFG.opinionNoMobilize}未満で動員できない → ${CFG.opinionBudgetCap}未満で軍の予算が35%まで → ${CFG.opinionForcedPeace}未満で講和を強いられる</p>`;
  }
  pProd(): string {
    const c = this.me;
    const names: Record<string, string> = { land: '師団', air: '航空隊', fleet: '艦隊', ad: '防空大隊' };
    const q = c.queue.map((it, i) => `<div class="kv"><span>${names[it.kind]}</span><span class="bar"><i style="width:${Math.min(100, it.progress / it.cost * 100)}%;background:#B5B6B9"></i></span><button type="button" class="x" data-act="dequeue" data-arg="${i}" aria-label="取り消す">✕</button></div>`).join('') || '<p class="muted">予定なし（軍の予算の残りはすべて弾の補充に回ります）</p>';
    const gen = (['fighter', 'armor', 'ad', 'naval'] as GenCat[]).map((k) => `<div class="kv"><span>${genCatName(k)}</span><b>${genLabel(c.gen[k])}</b>${c.gen[k] < 3 && !c.genProject ? `<button type="button" data-act="gen" data-arg="${k}">改修（${CFG.genCost[c.gen[k]]}pt）</button>` : ''}</div>`).join('');
    const gp = c.genProject ? `<div class="kv"><span>改修中：${genCatName(c.genProject.cat)}</span><span class="bar"><i style="width:${c.genProject.progress / c.genProject.cost * 100}%;background:#E8B36A"></i></span></div>` : '';
    const st = (k: keyof Stock) => `<div class="kv"><span>${wName(k)}</span><b>${n0(c.stock[k])}</b><small class="muted">開始時 ${n0(c.stockInit[k])}</small></div>`;
    return `<div class="acts">${(['land', 'air', 'fleet', 'ad'] as const).map((k) => `<button type="button" data-act="enqueue" data-arg="${k}">${names[k]}（${CFG.cost[k]}pt）</button>`).join('')}</div>
      <h3>生産の予定</h3>${q}
      <h3>動員</h3><div class="acts"><button type="button" data-act="mobilize" ${c.opinion < CFG.opinionNoMobilize ? 'disabled' : ''}>予備役を動員${c.cooldown.mobilize ? `（あと${c.cooldown.mobilize}日）` : ''}</button></div><p class="muted">すぐに師団が出るが、世論−${CFG.mobilizeOpinion}・経済−1%</p>
      <h3>兵器の世代</h3>${gen}${gp}
      <h3>弾の在庫</h3>${st('cruise')}${c.hasBallistic ? st('ballistic') : ''}${st('interceptor')}${st('drone')}`;
  }
  pLand(): string {
    const s = this.s, me = this.me;
    const orders = s.orders.filter((o) => o.owner === me.id).map((o) => `<div class="kv"><span>${W.nodes[o.from].name} → ${W.nodes[o.to].name}${o.amphib ? '（上陸）' : ''}</span><span class="bar"><i style="width:${Math.min(100, o.progress)}%;background:#E8806F"></i></span><button type="button" class="x" data-act="cancelOrder" data-arg="${o.id}" aria-label="取りやめる">✕</button></div>`).join('') || '<p class="muted">攻勢なし</p>';
    const by = new Map<number, { land: number[]; ad: number; busy: boolean }>();
    let moving = 0;
    for (const u of s.units) if (u.owner === me.id && (u.kind === 'land' || u.kind === 'ad')) {
      if (u.move) { moving++; continue; }
      const e = by.get(u.node) ?? { land: [], ad: 0, busy: false }; if (u.kind === 'land') e.land.push(u.strength); else e.ad++; if (u.order) e.busy = true; by.set(u.node, e);
    }
    const front = (n: number) => W.adj[n].some((e) => atWar(s, me.id, s.nodes[e.to].ctrl));
    const list = [...by.entries()].sort((a, b) => Number(front(b[0])) - Number(front(a[0])) || b[1].land.length - a[1].land.length).map(([n, e]) => `<button type="button" class="relrow" data-act="goto" data-arg="${n}"><span>${W.nodes[n].name}${front(n) ? ' <small class="down">前線</small>' : ''}${e.busy ? ' <small class="warn">攻勢中</small>' : ''}</span><span class="muted">師団${e.land.length}・防空${e.ad}</span><b>${e.land.length ? Math.round(e.land.reduce((a, b) => a + b, 0) / e.land.length) + '%' : '—'}</b></button>`).join('');
    const fl = s.units.filter((u) => u.owner === me.id && u.kind === 'fleet').map((u, i) => `<button type="button" class="relrow" data-act="gozone" data-arg="${u.zone}"><span>艦隊${i + 1}</span><span class="muted">${W.zones[u.zone].name}${u.transit ? '（移動中）' : ''}</span><b>${Math.round(u.strength)}%</b></button>`).join('') || '<p class="muted">なし</p>';
    const air = s.units.filter((u) => u.owner === me.id && u.kind === 'air').map((u, i) => `<button type="button" class="relrow" data-act="goregion" data-arg="${u.region}"><span>航空隊${i + 1}</span><span class="muted">${W.regions[u.region].name}${u.transit ? '（移動中）' : ''}</span><b>${Math.round(u.strength)}%</b></button>`).join('') || '<p class="muted">なし</p>';
    return `<p class="muted">押すとその場所へ移動します。地図で自分の駒がいる拠点を押すと、行ける先が輪で光ります（白い点線＝移動、赤＝攻撃）</p>
      <h3>攻勢</h3>${orders}
      <h3>陸の部隊（拠点ごと）${moving ? `<small class="muted">　移動中 ${moving}</small>` : ''}</h3>${list}
      <h3>艦隊 <small class="muted">担当の変更は「海」</small></h3>${fl}
      <h3>航空隊 <small class="muted">担当の変更は「空」</small></h3>${air}`;
  }
  pSea(): string {
    const s = this.s, me = this.me, sd = side(s, me.id);
    const fl = s.units.filter((u) => u.owner === me.id && u.kind === 'fleet');
    const opts = (cur: number) => W.zones.map((z) => `<option value="${z.id}" ${z.id === cur ? 'selected' : ''}>${z.name}</option>`).join('');
    const rows = fl.map((u, i) => `<label class="kv"><span>艦隊${i + 1}（${Math.round(u.strength)}%）${u.transit ? `<small class="muted">移動中 ${u.transit}日</small>` : ''}</span><select data-fleet="${u.id}">${opts(u.zone)}</select></label>`).join('') || '<p class="muted">艦隊がありません</p>';
    const zs = W.zones.map((z) => ({ z, sh: s.seaShare[z.id] ?? {} })).filter((x) => Object.keys(x.sh).length).map(({ z, sh }) => {
      const tot = Object.values(sh).reduce((a, b) => a + b, 0); const mine = sh[sd] ?? 0;
      const enemy = Object.entries(sh).filter(([k]) => campsAtWar(s, Number(k), me.camp)).reduce((a, [, v]) => a + v, 0);
      return `<div class="kv"><span>${z.name}</span><span class="bar"><i style="width:${mine / tot * 100}%;background:${CAMP_COLORS.self}"></i><i style="left:${mine / tot * 100}%;width:${enemy / tot * 100}%;background:${CAMP_COLORS.enemy}"></i></span><b>${Math.round(mine / tot * 100)}%</b></div>`;
    }).join('');
    return `<div class="kv"><span>ドクトリン</span><b>${me.doctrine.sea === 'carrier' ? '空母打撃群（艦隊+20%、空を支援）' : '潜水艦・対艦ミサイル（敵艦への損害+30%）'}</b></div>
      <h3>艦隊の担当海域</h3>${rows}<h3>制海</h3>${zs || '<p class="muted">艦隊のいる海域はまだありません</p>'}<p class="muted">制海45%以上（または敵艦隊がいない）で、その海を補給と上陸に使えます</p>`;
  }
  pAir(): string {
    const s = this.s, me = this.me, sd = side(s, me.id);
    const wings = s.units.filter((u) => u.owner === me.id && u.kind === 'air');
    const opts = (cur: number) => W.regions.map((r) => `<option value="${r.id}" ${r.id === cur ? 'selected' : ''}>${r.name}</option>`).join('');
    const rows = wings.map((u, i) => `<label class="kv"><span>航空隊${i + 1}（${Math.round(u.strength)}%）${u.transit ? `<small class="muted">移動中 ${u.transit}日</small>` : ''}</span><select data-wing="${u.id}">${opts(u.region)}</select></label>`).join('') || '<p class="muted">航空隊がありません</p>';
    const regs = W.regions.filter((r) => Object.keys(s.airShare[r.id] ?? {}).length).map((r) => `<div class="kv"><span>${r.name}</span><span class="bar"><i style="width:${airShare(s, r.id, sd) * 100}%;background:${CAMP_COLORS.self}"></i></span><b>${Math.round(airShare(s, r.id, sd) * 100)}%</b></div>`).join('');
    return `<div class="kv"><span>ドクトリン</span><b>${me.doctrine.air === 'air' ? '航空優勢（航空隊+25%）' : '地上配備防空（防空+35%）'}</b></div>
      <div class="kv"><span>戦闘機</span><b>${genLabel(me.gen.fighter)}</b></div>
      <h3>航空隊の担当地域</h3>${rows}<h3>地域ごとの制空</h3>${regs}<p class="muted">制空は地上戦（最大±25%）、偵察ドローンの生存、早期警戒機による索敵に効きます</p>`;
  }
  pStrike(): string {
    const s = this.s, me = this.me, d = this.draft;
    const t = d.target;
    const valid = t >= 0 && (hostileNode(s, me.id, t) || campsAtWar(s, me.camp, C(s, s.nodes[t].ctrl).camp));
    const dist = t >= 0 ? nearestOwnKm(s, me.id, t) : 0;
    const facs: Facility[] = ['ad', 'airbase', 'port', 'ind', 'units'];
    const unit = { drone: '機', cruise: '発', ballistic: '発' };
    const wrow = (k: 'drone' | 'cruise' | 'ballistic') => {
      if (k === 'ballistic' && !me.hasBallistic) return '';
      const range = Math.round(CFG.range[k] * (k === 'cruise' ? 1.6 : 1));
      const inRange = t < 0 || dist <= range;
      return `<div class="wrow"><span class="wn">${wName(k)}</span><input type="range" min="0" max="${Math.floor(me.stock[k])}" step="1" value="${d.n[k]}" data-wn="${k}" aria-label="${wName(k)}の数"><input type="number" min="0" max="${Math.floor(me.stock[k])}" value="${d.n[k]}" data-wn="${k}" aria-label="${wName(k)}の数"><small>在庫 ${n0(me.stock[k])}${unit[k]}　|　射程 ${n0(range)}km${inRange ? '' : '<em>（届かない）</em>'}　|　所要 ${d.n[k]}${unit[k]}</small></div>`;
    };
    return `<div class="trow"><span class="lbl">目標</span><b>${t >= 0 ? `${W.nodes[t].name}・${facName(d.facility)}（${C(s, s.nodes[t].ctrl).name}）` : '未選択'}</b><button type="button" data-act="target" data-arg="strike"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 13 C3 8.5 2.5 6.5 2.5 5 a4.5 4.5 0 0 1 9 0 C11.5 6.5 11 8.5 7 13 Z M7 3.5 a1.5 1.5 0 1 0 0.01 0" fill="none" stroke="currentColor" stroke-width="1.3"></path></svg>地図で選ぶ</button></div>
      <div class="chips fac">${facs.map((f) => `<button type="button" class="cc ${d.facility === f ? 'on' : ''}" data-act="fac" data-arg="${f}">${facName(f)}</button>`).join('')}</div>
      ${t >= 0 ? `<p class="muted">最寄りの味方拠点から ${n0(dist)}km／相手の防空：${s.seen[t] && s.day - s.seen[t].day <= 14 ? `大隊${s.seen[t].ad}${W.nodes[t].adSite ? '＋陣地' : ''}` : '不明（見えていない目標は命中率が下がる）'}</p>` : ''}
      ${wrow('drone')}${wrow('cruise')}${wrow('ballistic')}
      <div class="trow time"><span class="lbl">実行時刻</span><div class="stepper"><button type="button" data-act="tprev" aria-label="早める">◀</button><b>${d.day}日後 ${String(d.hour).padStart(2, '0')}:00</b><button type="button" data-act="tnext" aria-label="遅らせる">▶</button></div></div>
      <button type="button" class="primary wide" data-act="doStrike" ${valid && me.engaged ? '' : 'disabled'}>予約する</button>
      <p class="note">※ 同じ目標に、同じ日に複数の打撃を重ねると、敵の防空網への飽和攻撃になり、迎撃される割合が下がります。${!me.engaged ? '<br>まだ参戦していないため打撃できません。' : !valid && t >= 0 ? '<br>この拠点は戦争中の相手ではありません。' : ''}</p>`;
  }
  pRecon(): string {
    const s = this.s, me = this.me;
    const opts = (cur: number) => W.regions.map((r) => `<option value="${r.id}" ${r.id === cur ? 'selected' : ''}>${r.name}</option>`).join('');
    const sats = me.satAssign.map((r, i) => `<label class="kv"><span>偵察衛星${i + 1}</span><select data-sat="${i}">${opts(r)}</select></label>`).join('') || '<p class="muted">衛星がありません</p>';
    const drs = me.droneAssign.map((r, i) => `<label class="kv"><span>偵察ドローン隊${i + 1}${airShare(s, r, side(s, me.id)) < 0.35 ? ' <small class="down">制空不足で撃墜の恐れ</small>' : ''}</span><select data-drone="${i}">${opts(r)}</select></label>`).join('') || '<p class="muted">偵察ドローン隊がありません</p>';
    return `<div class="kv"><span>ドクトリン</span><b>${me.doctrine.intel === 'recon' ? '索敵重視（衛星2日ごと・ドローン3拠点先まで）' : '秘匿重視（相手の見積もりが±40%ぶれる）'}</b></div>
      <div class="kv"><span>今日見えている拠点</span><b>${s.visibleNow.length}</b></div>
      ${me.effects.satBlind ? `<p class="down">サイバー攻撃で衛星が使えません（あと${me.effects.satBlind}日）</p>` : ''}
      <h3>偵察衛星（地域全体を定期的に撮る）</h3>${sats}
      <h3>偵察ドローン（前線の先を見続ける。制空35%以上が必要）</h3>${drs}
      <p class="muted">ほかに、前線で接している敵拠点は常に見えます。制空60%以上の地域では早期警戒機が2拠点先まで見ます。衛星の攻撃は外交パネルから</p>`;
  }
  pCyber(): string {
    const s = this.s, me = this.me, cs = this.cyberSel;
    const targets = Object.values(s.countries).filter((c) => c.major && !sameSide(s, c.id, me.id));
    if (!cs.target && targets.length) cs.target = targets[0].id;
    return `<p class="muted">成功率は約65%（秘匿重視なら75%）。約半分の確率で相手に気づかれ、関係が悪化し張り詰め度が上がります</p>
      <label class="kv"><span>相手</span><select data-cyt>${targets.map((c) => `<option value="${c.id}" ${c.id === cs.target ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
      <div class="chips">${([['gdp', '経済（4週間 −15%）'], ['sat', '衛星（3週間 使えない）'], ['ad', '防空（2週間 −40%）']] as const).map(([k, t]) => `<button type="button" class="cc ${cs.effect === k ? 'on' : ''}" data-act="cyeff" data-arg="${k}">${t}</button>`).join('')}</div>
      <button type="button" class="hot wide" data-act="doCyber" ${me.cooldown.cyber ? 'disabled' : ''}>${me.cooldown.cyber ? `あと${me.cooldown.cyber}日` : `実行する（${CFG.cyberCost}pt）`}</button>`;
  }
  pNews(): string {
    return [...this.s.news].reverse().slice(0, 80).map((n) => `<div class="news ${n.kind}"><span>第${Math.floor(n.day / 7) + 1}週</span>${n.text}</div>`).join('') || '<p class="muted">まだありません</p>';
  }

  // ---------- 通知 ----------
  toast(text: string, kind: 'info' | 'warn' | 'bad' | 'good' = 'info', tip = false) {
    const box = tip ? $('#tips') : $('#toasts');
    const el = document.createElement('div'); el.className = `toast ${kind} ${tip ? 'tip' : ''}`; el.setAttribute('role', 'status');
    el.innerHTML = `<div>${text}</div>${tip ? '<button type="button" data-act="dismiss">了解</button>' : ''}`;
    box.prepend(el);
    while (box.children.length > (tip ? 2 : 3)) box.lastChild!.remove();
    if (!tip) setTimeout(() => el.remove(), 9000);
  }
  tip(key: string, text: string) {
    const done: string[] = JSON.parse(localStorage.getItem('mws_tips') ?? '[]');
    if (done.includes(key)) return;
    done.push(key); localStorage.setItem('mws_tips', JSON.stringify(done));
    this.toast(`<b>ヒント</b><br>${text}`, 'info', true);
  }
  flushNews() {
    const s = this.s;
    const fresh = s.news.slice(this.newsSeen); this.newsSeen = s.news.length;
    for (const n of fresh.slice(-4)) {
      if (n.kind === 'info' && !n.text.includes('【')) continue;
      this.toast(n.text, n.kind);
      if (n.text.startsWith('【開戦】')) { sfx.war(); this.tip('war', '戦争が始まりました。参戦中なら、拠点をドラッグして攻勢、左上の「打撃」でミサイル、「海」「空」で艦隊と航空隊を動かせます。世論と在庫が尽きた側が負けます'); }
      else if (n.kind === 'bad') sfx.alert();
      else if (n.kind === 'good') sfx.capture();
    }
  }
  checkModals() {
    const s = this.s;
    if ($('#modal').dataset.kind) return;
    if (s.over && s.result) return this.resultModal();
    if (s.forcedPeace) {
      this.modal('forced', `<h2>世論が限界です</h2><p>世論が${CFG.opinionForcedPeace}を下回り、政府は講和を迫られています。戦争から抜けるしかありません。</p><div class="acts"><button type="button" class="hot" data-act="forcedOk">講和して戦争から抜ける</button></div>`);
      this.h.setPaused(true); return;
    }
    if (s.pendingPeace) {
      const f = C(s, s.pendingPeace.from);
      this.modal('peace', `<h2>${f.name}から講和の申し入れ</h2><p>${f.name}が戦争から抜けたいと申し入れてきました。受け入れると、あなたが戦争目的として押さえている${f.name}の拠点はあなたの領土になり、それ以外の占領地は返します。</p><div class="acts"><button type="button" class="hot" data-act="peaceYes">受け入れる</button><button type="button" data-act="peaceNo">拒否する</button></div>`);
      this.h.setPaused(true);
    }
  }
  modal(kind: string, html: string) { const m = $('#modal'); m.dataset.kind = kind; m.innerHTML = `<div class="mbox">${html}</div>`; m.classList.remove('hidden'); }
  closeModal() { const m = $('#modal'); delete m.dataset.kind; m.classList.add('hidden'); m.innerHTML = ''; }
  resultModal() {
    const r = this.s.result!;
    this.modal('result', `<h2>${r.defeat ? '敗北' : '終戦'}　評価 ${r.rank}</h2>${r.achieved.length ? `<ul>${r.achieved.map((a) => `<li>${a}</li>`).join('')}</ul>` : '<p>達成した勝ち方はありません</p>'}<p class="muted">${r.notes.join('<br>')}</p><div class="acts"><button type="button" class="hot" data-act="restart">もう一度遊ぶ</button></div>`);
  }
  settingsModal() {
    const slot = (i: number) => { const raw = localStorage.getItem('mws_save_' + i); let info = '空き'; if (raw) { try { const j = JSON.parse(raw); info = `${C(j, j.player)?.name ?? ''} 第${Math.floor(j.day / 7) + 1}週`; } catch { info = '読めません'; } } return `<div class="kv"><span>スロット${i}：${info}</span><button type="button" data-act="save" data-arg="${i}">保存</button><button type="button" data-act="load" data-arg="${i}" ${raw ? '' : 'disabled'}>読み込む</button></div>`; };
    this.modal('settings', `<h2>設定</h2>${[1, 2, 3].map(slot).join('')}<div class="acts"><button type="button" data-act="tour">チュートリアル</button><button type="button" data-act="sound">効果音：${sound.on ? 'オン' : 'オフ'}</button><button type="button" data-act="music">BGM：${music.on ? 'オン' : 'オフ'}</button></div><label class="sl"><span>BGMの音量 <b>${Math.round(music.vol * 100)}</b></span><input type="range" min="0" max="1" step="0.05" value="${music.vol}" data-mvol></label><div class="acts"><button type="button" data-act="restart">最初から</button><button type="button" class="hot" data-act="closeModal">閉じる</button></div><p class="muted">地図データ：Natural Earth（パブリックドメイン）</p>`);
  }

  // ---------- 入力 ----------
  act(res: A.Res) { if (res.msg) this.toast(res.msg, res.ok ? 'good' : 'warn'); res.ok ? sfx.order() : sfx.click(); this.daily(); }
  onClick(e: Event) {
    const t = (e.target as HTMLElement).closest('button,[data-panel]') as HTMLElement | null;
    if (!t) return;
    const s = this.s, me = s.player, sel = this.h.v.selected ?? -1;
    if (t.dataset.panel) { sfx.click(); this.open(t.dataset.panel as Panel); return; }
    if (t.dataset.todo) {
      sfx.click(); const [k, v2] = t.dataset.todo.split(':');
      if (k === 'panel') this.open(v2 as Panel);
      else if (k === 'pause') this.h.setPaused(false);
      else if (v2 === 'goal') this.toast('敵になりそうな国の拠点を押し、左下のパネルの「戦争目的に加える」を押します', 'info');
      else { this.h.v.selected = this.me.capital; this.h.view.centerOn(this.me.capital, 1.4); this.toast('自分の駒がいる拠点を押すと、行ける先が輪で光ります。白い点線は移動、赤は攻撃です', 'info'); }
      this.daily(); return;
    }
    if (t.dataset.tool) {
      sfx.click(); const k = t.dataset.tool;
      if (k === 'mode') this.h.v.mode = this.h.v.mode === 'country' ? 'camp' : 'country';
      else if (k === 'news') this.open('news');
      else if (k === 'search') { const q = prompt('拠点の名前'); const hit = q ? W.nodes.find((n) => n.name.includes(q)) : null; if (hit) { this.h.v.selected = hit.id; this.h.view.centerOn(hit.id, 1.6); } }
      else this.h.v.overlay = this.h.v.overlay === k ? 'none' : (k as ViewState['overlay']);
      this.daily(); return;
    }
    const a = t.dataset.act, arg = t.dataset.arg ?? '';
    if (!a) return;
    switch (a) {
      case 'pause': this.h.setPaused(!this.h.paused); break;
      case 'settings': this.h.setPaused(true); this.settingsModal(); break;
      case 'closeModal': this.closeModal(); break;
      case 'closePanel': this.open(null); break;
      case 'dismiss': t.parentElement?.remove(); break;
      case 'deselect': this.h.v.selected = null; break;
      case 'target': this.h.v.targeting = { kind: arg as 'attack' | 'strike', from: sel }; this.hint(arg === 'strike' ? '打撃する敵の拠点をクリック（Escで取りやめ）' : '攻めるか移動する先の拠点をクリック（Escで取りやめ）'); break;
      case 'reinforceAD': this.act(A.reinforceAD(s, me, sel)); break;
      case 'strikeAt': this.draft.target = sel; this.panel = null; this.open('strike'); break;
      case 'goal': this.act(A.toggleGoal(s, me, sel)); break;
      case 'droneHere': { const c = C(s, me); if (!c.droneAssign.length) { this.toast('偵察ドローン隊がありません', 'warn'); break; } c.droneAssign[0] = W.nodes[sel].region; this.mark('recon'); this.toast(`偵察ドローン隊1を${W.regions[W.nodes[sel].region].name}へ向けました`, 'good'); break; }
      case 'diploOpen': this.diploSel = arg; this.panel = null; this.open('diplo'); break;
      case 'cancelStrike': this.act(A.cancelStrike(s, me, Number(arg))); break;
      case 'dsel': this.diploSel = arg; this.renderPanel(); break;
      case 'summit': this.act(A.summit(s, me, this.diploSel)); break;
      case 'aid': this.act(A.aid(s, me, this.diploSel)); this.mark('aid'); break;
      case 'base': this.act(A.placeBase(s, me, this.diploSel)); this.mark('aid'); break;
      case 'weapons': this.act(A.sendWeapons(s, me, this.diploSel)); break;
      case 'peaceDemand': this.act(A.proposePeace(s, me, this.diploSel, 'demand')); break;
      case 'peaceAsk': this.act(A.proposePeace(s, me, this.diploSel, 'ask')); break;
      case 'asat': this.act(A.asat(s, me, this.diploSel)); break;
      case 'join': this.act(A.declareJoin(s, me)); this.mark('join'); break;
      case 'borrow': this.act(A.borrow(s, me)); break;
      case 'repay': this.act(A.repay(s, me)); break;
      case 'warMode': this.act(A.toggleWarMode(s, me)); this.mark('budget'); break;
      case 'enqueue': this.act(A.enqueue(s, me, arg as 'land')); this.mark('prod'); break;
      case 'dequeue': this.act(A.dequeue(s, me, Number(arg))); break;
      case 'mobilize': this.act(A.mobilize(s, me)); this.mark('prod'); break;
      case 'gen': this.act(A.startGen(s, me, arg as GenCat)); break;
      case 'cancelOrder': this.act(A.cancelOrder(s, me, Number(arg))); break;
      case 'goto': this.h.v.selected = Number(arg); this.h.view.centerOn(Number(arg), Math.max(1.3, this.h.view.cam.z)); break;
      case 'gozone': { const z = W.zones[Number(arg)]; this.h.view.cam.x = z.x; this.h.view.cam.y = z.y; this.h.view.clamp(); this.h.v.overlay = 'sea'; break; }
      case 'goregion': { const r = W.regions[Number(arg)]; this.h.view.cam.x = r.x; this.h.view.cam.y = r.y; this.h.view.clamp(); this.h.v.overlay = 'air'; break; }
      case 'fac': this.draft.facility = arg as Facility; this.renderPanel(); break;
      case 'tprev': case 'tnext': { const d = this.draft; let h = d.day * 24 + d.hour + (a === 'tnext' ? 3 : -3); h = Math.max(24, Math.min(7 * 24 + 21, h)); d.day = Math.floor(h / 24); d.hour = h % 24; this.renderPanel(); break; }
      case 'doStrike': { const d = this.draft; const r = A.scheduleStrike(s, me, d.target, d.facility, d.n, d.day, d.hour); if (r.ok) { this.mark('strike'); sfx.launch(); d.n = { cruise: 0, ballistic: 0, drone: 0, interceptor: 0 }; this.tip('strike', '打撃は予約した日の時刻に実行されます。結果はニュースに出ます。迎撃弾が尽きた相手には、ミサイルがほとんど命中します'); } this.act(r); break; }
      case 'cyeff': this.cyberSel.effect = arg as 'gdp'; this.renderPanel(); break;
      case 'doCyber': this.act(A.cyber(s, me, this.cyberSel.target, this.cyberSel.effect)); break;
      case 'forcedOk': { const foe = Object.values(s.countries).find((c) => atWar(s, me, c.id)); if (foe) A.proposePeace(s, me, foe.id, 'ask'); s.forcedPeace = false; this.closeModal(); break; }
      case 'peaceYes': { const f = s.pendingPeace!.from; s.pendingPeace = null; exitWar(s, f, me); C(s, me).opinion += 4; this.toast(`${C(s, f).name}との講和が成立しました`, 'good'); this.closeModal(); this.h.setPaused(false); break; }
      case 'peaceNo': s.pendingPeace = null; C(s, me).opinion -= 1; this.closeModal(); this.h.setPaused(false); this.toast('講和を拒否しました', 'info'); break;
      case 'save': this.h.save(Number(arg)); this.settingsModal(); this.toast(`スロット${arg}に保存しました`, 'good'); break;
      case 'load': if (this.h.load(Number(arg))) { this.closeModal(); this.toast('読み込みました', 'good'); } break;
      case 'sound': toggleSound(); this.settingsModal(); break;
      case 'music': toggleMusic(); this.settingsModal(); break;
      case 'tour': this.closeModal(); this.tour(); break;
      case 'restart': this.closeModal(); this.h.restart(); break;
    }
    this.daily();
  }
  onInput(e: Event) {
    const t = e.target as HTMLInputElement | HTMLSelectElement; const s = this.s, me = s.player; const d = t.dataset;
    if (d.budget) {
      const c = C(s, me); const k = d.budget as 'mil' | 'ind' | 'pop'; const v = Number(t.value);
      const others = (['mil', 'ind', 'pop'] as const).filter((x) => x !== k); const rest = 100 - v; const os = others.reduce((a, x) => a + c.budget[x], 0) || 1;
      const nb = { ...c.budget, [k]: v } as typeof c.budget; for (const x of others) nb[x] = rest * c.budget[x] / os;
      A.setBudget(s, me, nb.mil, nb.ind, nb.pop); this.mark('budget');
      if (e.type === 'change') { (document.activeElement as HTMLElement)?.blur(); this.renderPanel(); } this.top();
    } else if (d.wn) {
      const max = Math.floor(this.me.stock[d.wn as 'cruise']); const v = Math.max(0, Math.min(max, Math.round(Number(t.value) || 0)));
      this.draft.n[d.wn as 'cruise'] = v;
      t.parentElement?.querySelectorAll<HTMLInputElement>('input').forEach((x) => { if (x !== t) x.value = String(v); });
      if (e.type === 'change') { (t as HTMLElement).blur(); this.renderPanel(); }
    }
    else if ('mvol' in d) { setMusicVol(Number(t.value)); const b = t.parentElement?.querySelector('b'); if (b) b.textContent = String(Math.round(Number(t.value) * 100)); return; }
    else if (e.type !== 'change') return;
    else if (d.fleet) { this.mark('seaair'); this.act(A.assignFleet(s, me, Number(d.fleet), Number(t.value))); }
    else if (d.wing) { this.mark('seaair'); this.act(A.assignAir(s, me, Number(d.wing), Number(t.value))); }
    else if (d.sat) { this.mark('recon'); this.act(A.assignSat(s, me, Number(d.sat), Number(t.value))); }
    else if (d.drone) { this.mark('recon'); this.act(A.assignDrone(s, me, Number(d.drone), Number(t.value))); }
    else if ('sday' in d) this.draft.day = Number(t.value);
    else if ('shour' in d) this.draft.hour = Number(t.value);
    else if ('cyt' in d) this.cyberSel.target = t.value;
    (t as HTMLElement).blur?.();
  }
  order(from: number, to: number) {
    const s = this.s; const friendly = sameSide(s, s.nodes[to].ctrl, s.player);
    const r = A.orderTo(s, s.player, from, to);
    if (r.ok) { this.mark(friendly ? 'move' : 'attack'); if (!friendly) this.tip('attack', '攻勢は毎日判定されます。索敵→制空→打撃→地上戦の順に強さが決まり、矢印の点線が進み具合です。補給が切れた部隊は弱ります'); }
    this.act(r); return r.ok;
  }
  hint(text: string | null) { const h = $('#hint'); h.textContent = text ?? ''; h.classList.toggle('hidden', !text); }

  // 地図から：targeting
  mapTarget(n: number) {
    const tg = this.h.v.targeting; if (!tg) return false;
    if (tg.kind === 'strike') { this.draft.target = n; this.panel = 'strike'; this.renderPanel(); }
    else if (tg.kind === 'attack' && tg.from !== undefined && tg.from >= 0) this.order(tg.from, n);
    this.h.v.targeting = null; this.hint(null);
    return true;
  }
}
export { landAt, nodeKm };
