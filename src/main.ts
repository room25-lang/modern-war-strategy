import './style.css';
import type { Difficulty, Doctrine, GameState } from './types';
import { loadWorld, proj, W } from './world';
import { CFG } from './config';
import { MAJORS } from './data/countries';
import { createGame } from './game/state';
import { events, step, computeSupply, updateCamps } from './game/sim';
import { C, sameSide, landAt } from './game/rules';
import * as A from './game/actions';
import { MapView, type ViewState } from './render/map';
import { UI } from './ui/ui';
import { flagSVG } from './ui/flags';
import { Tour } from './ui/tour';
import { sfx, startMusic } from './audio';

const BASE = import.meta.env.BASE_URL;
const DOCS = [
  { name: 'dl', key: 'land', label: '陸：地上戦の方針', opts: [
    { v: 'mobile', t: '機動打撃', eff: '攻める力+20%、守る力−5%。敵の弱い所へ素早く攻め込む', for: '向く場面：陸続きの国境で、こちらから攻めたいとき' },
    { v: 'depth', t: '縦深防御', eff: '守る力+25%、攻める力−5%。陣地で敵をすり減らす', for: '向く場面：攻められる側に回りそうなとき、兵力が少ないとき' }] },
  { name: 'ds', key: 'sea', label: '海：艦隊の方針', opts: [
    { v: 'carrier', t: '空母打撃群', eff: '艦隊の力+20%、近くの空の戦いも支える', for: '向く場面：遠くの海まで出ていき、制海を取りたいとき' },
    { v: 'sub', t: '潜水艦・対艦ミサイル', eff: '敵艦隊への損害+30%。自分の近海に敵を寄せつけない', for: '向く場面：島国や沿岸国で、近海を守りたいとき' }] },
  { name: 'da', key: 'air', label: '空：航空の方針', opts: [
    { v: 'air', t: '航空優勢', eff: '航空隊の力+25%。戦闘機で空を取る', for: '向く場面：戦闘機の世代が高く、空で押したいとき' },
    { v: 'ground', t: '地上配備防空', eff: '防空の迎撃能力+35%、防空も制空に数える', for: '向く場面：ミサイル攻撃を受けやすく、守りを固めたいとき' }] },
  { name: 'di', key: 'intel', label: '情報：索敵の方針', opts: [
    { v: 'recon', t: '索敵重視', eff: '衛星が2日ごとに撮影、ドローンが1拠点先まで見える', for: '向く場面：敵の位置を正確に知って、先に撃ちたいとき' },
    { v: 'stealth', t: '秘匿重視', eff: '敵の見積もりが±40%ぶれ、衛星に35%見落とされる。サイバー成功率も上がる', for: '向く場面：兵力を隠して、敵に読ませたくないとき' }] },
];
const speed = Number(new URLSearchParams(location.search).get('speed') ?? 1) || 1;

async function boot() {
  const [, relief] = await Promise.all([
    loadWorld(BASE + 'data/world.json'),
    new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = BASE + 'img/relief.jpg'; }),
  ]);
  document.getElementById('loading')!.remove();
  const canvas = document.getElementById('map') as HTMLCanvasElement;
  const view = new MapView(canvas, relief);
  const v: ViewState = { mode: 'country', overlay: 'none', selected: null, drag: null, hover: null, targeting: null, cand: null };
  const host = {
    s: null as unknown as GameState, view, v, paused: true,
    setPaused(p: boolean) { host.paused = p; ui.top(); },
    save(slot: number) { localStorage.setItem('mws_save_' + slot, JSON.stringify(host.s)); },
    load(slot: number) {
      const raw = localStorage.getItem('mws_save_' + slot); if (!raw) return false;
      try { host.s = JSON.parse(raw); updateCamps(host.s); computeSupply(host.s); ui.newsSeen = host.s.news.length; v.selected = null; view.lastKey = ''; ui.daily(); return true; } catch { return false; }
    },
    restart() { setupScreen(); },
  };
  const ui = new UI(host);
  ui.mount();
  const tour = new Tour(ui); ui.tour = () => tour.start();
  (window as unknown as { __mws: unknown }).__mws = { host, ui, A, step, createGame, updateCamps, computeSupply, proj };

  // ---------- 開始画面 ----------
  function setupScreen() {
    host.paused = true;
    let pick = '392';
    const docOf = (id: string) => MAJORS.find((m) => m.id === id)!.doctrine;
    const render = () => {
      const d = docOf(pick);
      const radio = (name: string, val: string, label: string, checked: boolean) => `<label><input type="radio" name="${name}" value="${val}" ${checked ? 'checked' : ''}>${label}</label>`;
      const saves = [1, 2, 3].filter((i) => localStorage.getItem('mws_save_' + i));
      ui.modal('setup', `<div class="setup">
        <h1>現代戦ストラテジー（仮）</h1>
        <p class="lead">架空の近未来、世界大戦。国家指導者として、最大2時間で戦争の入口から出口までを決めます。<br>本質は「見る（索敵）・削る（在庫と補給）・終わらせる（世論と講和）」。</p>
        <div class="cards">${MAJORS.map((m) => `<button type="button" class="card ${m.id === pick ? 'on' : ''}" data-pick="${m.id}">${flagSVG(m.id, m.color, 48, 32)}<b>${m.name}</b><small>${m.trait}</small></button>`).join('')}</div>
        <div class="row">
          <fieldset><legend>難易度</legend>${radio('diff', 'easy', 'やさしい', false)}${radio('diff', 'normal', 'ふつう', true)}${radio('diff', 'hard', '難しい', false)}</fieldset>
          <fieldset><legend>国どうしの関係</legend>${radio('rel', 'real', '現実に近い', true)}${radio('rel', 'random', 'ランダム', false)}</fieldset>
        </div>
        <fieldset class="docf"><legend>ドクトリン（戦い方の方針。開始時に決め、ゲーム中は変えられません）</legend>
          <p class="muted">分野ごとに2つから1つを選びます。どちらが正解ということはなく、得意な戦い方が変わります。「標準」はこの国にもともと合っている方です。迷ったら標準のままで大丈夫です。</p>
          <div class="docs">${DOCS.map((cat) => `<div class="dcat"><h4>${cat.label}</h4>${cat.opts.map((o) => `<label class="dopt"><input type="radio" name="${cat.name}" value="${o.v}" ${(d as unknown as Record<string, string>)[cat.key] === o.v ? 'checked' : ''}><span><b>${o.t}${(d as unknown as Record<string, string>)[cat.key] === o.v ? '<em>標準</em>' : ''}</b><small>${o.eff}</small><small class="for">${o.for}</small></span></label>`).join('')}</div>`).join('')}</div>
        </fieldset>
        <div class="acts" style="margin-top:14px"><button type="button" class="hot" data-start style="min-height:44px;padding:0 24px;font-size:15px">開始する</button>${saves.map((i) => `<button type="button" data-loadslot="${i}">スロット${i}を読み込む</button>`).join('')}</div>
        <p class="muted">この作品はフィクションです。実在の国名と地図を使っていますが、現実の出来事や意図を表すものではありません。地図データ：Natural Earth（パブリックドメイン）</p>
      </div>`);
      const m = document.getElementById('modal')!;
      m.querySelectorAll<HTMLElement>('[data-pick]').forEach((b) => b.onclick = () => { pick = b.dataset.pick!; sfx.click(); render(); });
      m.querySelectorAll<HTMLElement>('[data-loadslot]').forEach((b) => b.onclick = () => { if (host.load(Number(b.dataset.loadslot))) { ui.closeModal(); startMusic(); start(false); } });
      (m.querySelector('[data-start]') as HTMLElement).onclick = () => {
        const val = (n: string) => (m.querySelector(`input[name=${n}]:checked`) as HTMLInputElement).value;
        const doctrine = { land: val('dl'), sea: val('ds'), air: val('da'), intel: val('di') } as Doctrine;
        host.s = createGame({ player: pick, difficulty: val('diff') as Difficulty, relMode: val('rel') as 'real', doctrine });
        updateCamps(host.s); computeSupply(host.s);
        ui.newsSeen = 0; ui.weekSnap.week = -1; v.selected = null; view.lastKey = '';
        ui.closeModal(); startMusic(); start(true);
      };
    };
    render();
  }
  function start(fresh: boolean) {
    const s = host.s;
    view.centerOn(C(s, s.player).capital, 1.1);
    ui.daily();
    if (fresh && !localStorage.getItem('mws_tour')) setTimeout(() => tour.start(), 300);
    host.paused = true; ui.top();
  }

  // ---------- 地図の操作 ----------
  let down: { x: number; y: number; cx: number; cy: number; node: number | null; moved: boolean; arrow: boolean } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!host.s) return;
    canvas.setPointerCapture(e.pointerId);
    const n = view.pick(e.clientX, e.clientY);
    const s = host.s;
    const canArrow = n !== null && sameSide(s, s.nodes[n].ctrl, s.player) && (landAt(s, n).some((u) => u.owner === s.player) || s.units.some((u) => u.node === n && u.kind === 'ad' && u.owner === s.player && !u.move));
    down = { x: e.clientX, y: e.clientY, cx: view.cam.x, cy: view.cam.y, node: n, moved: false, arrow: canArrow && !v.targeting };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 6) down.moved = true;
    if (!down.moved) return;
    if (down.arrow && down.node !== null) { v.drag = { from: down.node, x: e.clientX, y: e.clientY }; }
    else { canvas.classList.add('dragging'); view.cam.x = down.cx - dx / view.cam.z; view.cam.y = down.cy - dy / view.cam.z; view.clamp(); }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    canvas.classList.remove('dragging');
    if (down.moved && v.drag) {
      const to = view.pick(e.clientX, e.clientY);
      if (to !== null && to !== v.drag.from) ui.order(v.drag.from, to);
      v.drag = null;
    } else if (!down.moved) {
      const n = view.pick(e.clientX, e.clientY);
      if (n !== null && ui.mapTarget(n)) { /* 目標を選んだ */ }
      else if (n !== null && v.cand && (v.cand.attack.includes(n) || v.cand.move.includes(n))) { ui.order(v.cand.from, n); }
      else { v.selected = n; sfx.click(); ui.daily(); }
    }
    down = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [wx, wy] = view.toWorld(e.clientX, e.clientY);
    view.cam.z *= Math.exp(-e.deltaY * 0.0015); view.clamp();
    const [nx, ny] = view.toWorld(e.clientX, e.clientY);
    view.cam.x += wx - nx; view.cam.y += wy - ny; view.clamp();
  }, { passive: false });
  document.getElementById('zin')!.onclick = () => { view.cam.z *= 1.4; view.clamp(); };
  document.getElementById('zout')!.onclick = () => { view.cam.z /= 1.4; view.clamp(); };
  window.addEventListener('resize', () => view.resize());
  window.addEventListener('keydown', (e) => {
    if (!host.s || (e.target as HTMLElement).tagName === 'INPUT' || document.getElementById('modal')!.dataset.kind || !document.getElementById('tour')!.classList.contains('hidden')) return;
    if (e.code === 'Space') { e.preventDefault(); host.setPaused(!host.paused); }
    if (e.code === 'Escape') { if (v.targeting) { v.targeting = null; ui.hint(null); } else if (ui.panel) ui.open(null); else v.selected = null; ui.daily(); }
  });

  // ---------- ループ ----------
  let last = performance.now(), acc = 0, frame = 0, lastEv = 0;
  const loop = (t: number) => {
    const dt = Math.min(250, t - last); last = t;
    const s = host.s;
    if (s && !host.paused && !s.over && !document.getElementById('modal')!.dataset.kind && document.getElementById('tour')!.classList.contains('hidden')) {
      acc += dt * speed; s.playMs = (s.playMs ?? 0) + dt;
      let n = 0;
      while (acc >= CFG.dayMs && n < 20) { step(s); acc -= CFG.dayMs; n++; ui.daily(); }
    }
    if (s) {
      for (const ev of events.splice(lastEv)) { if (ev.kind === 'strike') sfx.boom(); }
      lastEv = 0;
      view.draw(s, v, acc / CFG.dayMs);
      if (frame++ % 15 === 0) { ui.frame(); ui.tickTimer(); }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  setupScreen();
  void W;
}
boot().catch((e) => { document.getElementById('loading')!.textContent = '読み込みに失敗しました：' + e; console.error(e); });
