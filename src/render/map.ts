import type { GameState } from '../types';
import { W, proj } from '../world';
import { CAMP_COLORS } from '../data/countries';
import { C, atWar, campsAtWar, sameSide, side, airShare, supplyAt } from '../game/rules';
import { fx } from '../game/sim';

export interface ViewState {
  mode: 'country' | 'camp';
  overlay: 'none' | 'sea' | 'air' | 'supply';
  selected: number | null;
  drag: { from: number; x: number; y: number } | null;
  hover: number | null;
  targeting: null | { kind: 'attack' | 'strike' | 'goal'; from?: number };
  cand: { from: number; attack: number[]; move: number[] } | null;
}

const OCEAN = '#3B4B5C';
const FORMAL: Record<string, string> = { '840': 'アメリカ合衆国', '156': '中華人民共和国', '643': 'ロシア連邦', '392': '日本', '826': 'イギリス', '250': 'フランス', '276': 'ドイツ', '356': 'インド', '410': '大韓民国', '408': '朝鮮民主主義人民共和国' };
const SEAS: [string, number, number][] = [
  ['日本海', 135, 40.5], ['黄海', 123.2, 35.2], ['東シナ海', 125.5, 28.5], ['南シナ海', 114, 14], ['フィリピン海', 133, 20], ['オホーツク海', 149, 53],
  ['太平洋', 170, 28], ['太平洋', -140, 15], ['大西洋', -40, 32], ['大西洋', -20, -20], ['インド洋', 80, -12], ['アラビア海', 64, 15], ['ベンガル湾', 88, 14],
  ['地中海', 18, 34.5], ['北海', 3, 56.5], ['バルト海', 19.5, 58], ['黒海', 34, 43.3], ['カリブ海', -75, 15], ['メキシコ湾', -90, 25], ['紅海', 38.5, 20],
  ['タスマン海', 160, -38], ['ノルウェー海', 4, 68], ['ペルシャ湾', 51.5, 27],
];
const FILLER = ['#8A8466', '#7F8668', '#8C7E68', '#7A8070'];

export class MapView {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  cam = { x: 3000, y: 700, z: 0.6 };
  tex = document.createElement('canvas'); fog = document.createElement('canvas');
  relief: HTMLImageElement;
  provPaths = new Map<number, Path2D>(); provBox = new Map<number, [number, number, number, number]>();
  fillerPaths: { country: string; p: Path2D }[] = [];
  outline = new Path2D(); provEdges = new Path2D();
  lastKey = ''; fogKey = '';
  countryLabels: { id: string; x: number; y: number; area: number }[] = [];
  seaLabels: { t: string; x: number; y: number }[] = [];
  dpr = 1;

  constructor(canvas: HTMLCanvasElement, relief: HTMLImageElement) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d')!; this.relief = relief;
    this.tex.width = W.W; this.tex.height = W.H; this.fog.width = W.W / 2; this.fog.height = W.H / 2;
    for (const pr of W.provinces) {
      const p = new Path2D(); let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      for (const ring of pr.paths) { ring.forEach(([x, y], i) => { if (i) p.lineTo(x, y); else p.moveTo(x, y); minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }); p.closePath(); }
      const old = this.provPaths.get(pr.node);
      if (old) { old.addPath(p); const b = this.provBox.get(pr.node)!; this.provBox.set(pr.node, [Math.min(b[0], minx), Math.min(b[1], miny), Math.max(b[2], maxx), Math.max(b[3], maxy)]); }
      else { this.provPaths.set(pr.node, p); this.provBox.set(pr.node, [minx, miny, maxx, maxy]); }
      this.provEdges.addPath(p);
    }
    for (const f of W.fillers) { const p = new Path2D(); for (const ring of f.paths) { ring.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); } this.fillerPaths.push({ country: f.country, p }); }
    for (const o of W.outlines) for (const ring of o.paths) { ring.forEach(([x, y], i) => (i ? this.outline.lineTo(x, y) : this.outline.moveTo(x, y))); this.outline.closePath(); }
    // 国名の位置：首都と陸続きの州の重心
    const areaOf = (paths: [number, number][][]) => paths.reduce((a, r) => { let v = 0; for (let i = 0; i < r.length - 1; i++) v += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a + Math.abs(v) / 2; }, 0);
    const cen = (paths: [number, number][][]) => { let x = 0, y = 0, n = 0; for (const r of paths) for (const [px, py] of r) { x += px; y += py; n++; } return [x / n, y / n]; };
    const byC: Record<string, { node: number; area: number; c: number[] }[]> = {};
    for (const pr of W.provinces) { const c = W.nodes[pr.node].country; (byC[c] ??= []).push({ node: pr.node, area: areaOf(pr.paths), c: cen(pr.paths) }); }
    for (const [id, ps] of Object.entries(byC)) {
      const big = ps.reduce((a, b) => (b.area > a.area ? b : a));
      const comp = new Set([big.node]); const q = [big.node];
      while (q.length) { const n = q.shift()!; for (const e of W.adj[n]) if (W.nodes[e.to].country === id && !comp.has(e.to)) { comp.add(e.to); q.push(e.to); } }
      let ax = 0, ay = 0, at = 0;
      for (const p of ps) if (comp.has(p.node)) { ax += p.c[0] * p.area; ay += p.c[1] * p.area; at += p.area; }
      this.countryLabels.push({ id, x: ax / at, y: ay / at, area: at });
    }
    for (const [t, lon, lat] of SEAS) { const [x, y] = proj(lon, lat); this.seaLabels.push({ t, x, y }); }
    this.resize();
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = innerWidth * this.dpr; this.canvas.height = innerHeight * this.dpr;
    this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px';
    this.clamp();
  }
  minZ() { return innerHeight / W.H; }
  clamp() {
    this.cam.z = Math.max(this.minZ(), Math.min(7, this.cam.z));
    const half = innerHeight / 2 / this.cam.z;
    this.cam.y = Math.max(half, Math.min(W.H - half, this.cam.y));
    this.cam.x = ((this.cam.x % W.W) + W.W) % W.W;
  }
  toWorld(sx: number, sy: number): [number, number] { return [(sx - innerWidth / 2) / this.cam.z + this.cam.x, (sy - innerHeight / 2) / this.cam.z + this.cam.y]; }
  toScreen(wx: number, wy: number): [number, number] {
    let dx = wx - this.cam.x; if (dx > W.W / 2) dx -= W.W; if (dx < -W.W / 2) dx += W.W;
    return [dx * this.cam.z + innerWidth / 2, (wy - this.cam.y) * this.cam.z + innerHeight / 2];
  }
  centerOn(n: number, z?: number) { this.cam.x = W.nodes[n].x; this.cam.y = W.nodes[n].y; if (z) this.cam.z = z; this.clamp(); }

  colorFor(s: GameState, mode: ViewState['mode'], id: string): string {
    if (mode === 'country') return C(s, id).color;
    const p = s.player;
    if (id === p) return CAMP_COLORS.self;
    if (sameSide(s, id, p)) return CAMP_COLORS.ally;
    const P = C(s, p), X = C(s, id);
    if (atWar(s, p, id)) return CAMP_COLORS.enemy;
    if (campsAtWar(s, P.camp, X.camp)) return CAMP_COLORS.enemyIdle;
    if (X.camp >= 0) return CAMP_COLORS.other;
    return CAMP_COLORS.neutral;
  }

  // 国の塗り（所有が変わったときだけ描き直す）
  rebuild(s: GameState, v: ViewState) {
    const key = v.mode + '|' + s.nodes.map((n) => n.ctrl + n.owner).join(',') + '|' + (v.mode === 'camp' ? Object.values(s.countries).map((c) => c.camp + (c.engaged ? 'e' : '')).join('') + s.wars.join(';') : '');
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.tex.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = OCEAN; g.fillRect(0, 0, W.W, W.H);
    this.fillerPaths.forEach((f, i) => { g.fillStyle = FILLER[i % FILLER.length]; g.fill(f.p); });
    for (const [n, p] of this.provPaths) {
      const ns = s.nodes[n];
      g.fillStyle = this.colorFor(s, v.mode, ns.ctrl); g.fill(p);
      if (ns.ctrl !== ns.owner) { g.save(); g.clip(p); g.fillStyle = this.stripe(g, this.colorFor(s, v.mode, ns.owner)); g.fillRect(...this.provBoxXYWH(n)); g.restore(); }
    }
    g.fillStyle = 'rgba(122,118,108,0.2)'; for (const p of this.provPaths.values()) g.fill(p);
    g.globalCompositeOperation = 'soft-light'; g.drawImage(this.relief, 0, 0, W.W, W.H);
    g.globalCompositeOperation = 'source-over';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(20,18,16,0.28)'; g.lineWidth = 0.7; g.stroke(this.provEdges);
    g.strokeStyle = 'rgba(16,14,12,0.75)'; g.lineWidth = 1.4; g.stroke(this.outline);
  }
  provBoxXYWH(n: number): [number, number, number, number] { const b = this.provBox.get(n)!; return [b[0], b[1], b[2] - b[0], b[3] - b[1]]; }
  stripeCache = new Map<string, CanvasPattern>();
  stripe(g: CanvasRenderingContext2D, color: string): CanvasPattern {
    let p = this.stripeCache.get(color); if (p) return p;
    const c = document.createElement('canvas'); c.width = c.height = 10; const x = c.getContext('2d')!;
    x.strokeStyle = color; x.lineWidth = 3; x.beginPath(); x.moveTo(-2, 12); x.lineTo(12, -2); x.stroke();
    p = g.createPattern(c, 'repeat')!; this.stripeCache.set(color, p); return p;
  }
  // 見えていない敵地を暗くする
  rebuildFog(s: GameState) {
    const key = s.day + '|' + s.visibleNow.length;
    if (key === this.fogKey) return; this.fogKey = key;
    const g = this.fog.getContext('2d')!; g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    g.clearRect(0, 0, W.W, W.H); g.fillStyle = 'rgba(10,12,16,0.38)';
    for (const [n, p] of this.provPaths) {
      const ctrl = s.nodes[n].ctrl;
      if (!(atWar(s, s.player, ctrl) || campsAtWar(s, C(s, s.player).camp, C(s, ctrl).camp))) continue;
      const seen = s.seen[n]; if (seen && s.day - seen.day <= 7) continue;
      g.fill(p);
    }
  }

  draw(s: GameState, v: ViewState, frac: number) {
    const g = this.ctx; const z = this.cam.z;
    this.rebuild(s, v); this.rebuildFog(s);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#2B3743'; g.fillRect(0, 0, innerWidth, innerHeight);
    for (const k of [-1, 0, 1]) {
      const ox = (k * W.W - this.cam.x) * z + innerWidth / 2;
      if (ox > innerWidth || ox + W.W * z < 0) continue;
      const oy = (0 - this.cam.y) * z + innerHeight / 2;
      g.imageSmoothingEnabled = true;
      g.drawImage(this.tex, ox, oy, W.W * z, W.H * z);
      g.drawImage(this.fog, ox, oy, W.W * z, W.H * z);
    }
    this.drawOverlays(s, v, frac);
  }

  private onScreen(x: number, y: number, m = 60) { return x > -m && y > -m && x < innerWidth + m && y < innerHeight + m; }

  drawOverlays(s: GameState, v: ViewState, frac: number) {
    const g = this.ctx; const z = this.cam.z; const now = performance.now();
    // 海と国の名前
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of this.seaLabels) {
      const [x, y] = this.toScreen(l.x, l.y); if (!this.onScreen(x, y)) continue;
      const fs = Math.max(11, Math.min(20, 13 * Math.sqrt(z)));
      g.font = `italic 500 ${fs}px 'Noto Sans JP', sans-serif`; g.fillStyle = 'rgba(205,218,230,0.55)';
      this.spaced(l.t, x, y, fs * 0.35, false);
    }
    for (const l of this.countryLabels) {
      const [x, y] = this.toScreen(l.x, l.y); if (!this.onScreen(x, y, 200)) continue;
      const name = FORMAL[l.id] ?? s.countries[l.id]?.name ?? '';
      const fs = Math.sqrt(l.area) * z * 0.09;
      if (fs < 11 || fs > 60) continue;
      g.font = `700 ${Math.min(34, fs)}px 'Noto Sans JP', sans-serif`;
      g.lineWidth = 3; g.strokeStyle = 'rgba(20,20,22,0.35)'; g.fillStyle = 'rgba(245,240,228,0.72)';
      this.spaced(name, x, y, Math.min(34, fs) * 0.45, true);
    }
    g.textAlign = 'left';
    // 予約した打撃の軌道
    for (const st of s.strikes) {
      if (st.owner !== s.player) continue;
      const from = this.launchPos(s, st.target); const t = W.nodes[st.target];
      const [a, b] = this.toScreen(from[0], from[1]), [c, d] = this.toScreen(t.x, t.y);
      if (Math.abs(a - c) > innerWidth) continue;
      const mx = (a + c) / 2, my = (b + d) / 2 - Math.hypot(c - a, d - b) * 0.22;
      g.strokeStyle = 'rgba(232,179,106,0.9)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.lineDashOffset = -now / 60;
      g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo(mx, my, c, d); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
      g.strokeStyle = '#E8B36A'; g.lineWidth = 2.5; g.beginPath(); g.arc(c, d, 10, 0, 7); g.stroke(); g.beginPath(); g.arc(c, d, 4, 0, 7); g.stroke();
    }
    // 陸路
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.beginPath();
    for (const [a, b] of W.edges) {
      const [x1, y1] = this.toScreen(W.nodes[a].x, W.nodes[a].y), [x2, y2] = this.toScreen(W.nodes[b].x, W.nodes[b].y);
      if (Math.abs(x1 - x2) > innerWidth) continue;
      if (!this.onScreen(x1, y1, 400) && !this.onScreen(x2, y2, 400)) continue;
      g.moveTo(x1, y1); g.lineTo(x2, y2);
    }
    g.stroke();
    // 重ね表示
    if (v.overlay === 'sea') this.drawSea(s);
    if (v.overlay === 'air') this.drawAir(s);
    // 前線（自陣営と交戦中の敵の境目）
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2.5; g.setLineDash([6, 5]);
    g.beginPath();
    for (const [a1, b1] of W.edges) {
      const ca = s.nodes[a1].ctrl, cb = s.nodes[b1].ctrl;
      const fa = sameSide(s, ca, s.player), fb = sameSide(s, cb, s.player);
      if (fa === fb) continue;
      if (!atWar(s, s.player, fa ? cb : ca) && !campsAtWar(s, C(s, s.player).camp, C(s, fa ? cb : ca).camp)) continue;
      const [x1, y1] = this.toScreen(W.nodes[a1].x, W.nodes[a1].y), [x2, y2] = this.toScreen(W.nodes[b1].x, W.nodes[b1].y);
      if (Math.abs(x1 - x2) > innerWidth || (!this.onScreen(x1, y1) && !this.onScreen(x2, y2))) continue;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / L, ny = (x2 - x1) / L, h = Math.min(40, L * 0.35);
      g.moveTo(mx - nx * h, my - ny * h); g.lineTo(mx + nx * h, my + ny * h);
    }
    g.stroke(); g.setLineDash([]);
    // 攻勢の矢印
    for (const o of s.orders) {
      const mine = o.owner === s.player, ally = sameSide(s, o.owner, s.player);
      if (!mine && !ally && !(s.visibleNow.includes(o.from) || s.visibleNow.includes(o.to))) continue;
      const col = mine ? '#F2F2F2' : ally ? '#A9C7EC' : '#E8806F';
      this.arrow(W.nodes[o.from].x, W.nodes[o.from].y, W.nodes[o.to].x, W.nodes[o.to].y, col, 7, o.progress / 100);
    }
    if (v.drag) { const n = W.nodes[v.drag.from]; const [wx, wy] = this.toWorld(v.drag.x, v.drag.y); this.arrow(n.x, n.y, wx, wy, 'rgba(242,242,242,0.8)', 6, 0); }
    // 移動中の部隊
    for (const u of s.units) {
      if (!u.move || !u.move.path.length) continue;
      if (u.owner !== s.player && !sameSide(s, u.owner, s.player)) continue;
      const a = W.nodes[u.node], b = W.nodes[u.move.path[0]];
      const total = Math.max(1, Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
      void total;
      const t = 1 - (u.move.dayLeft - frac) / Math.max(1, u.move.dayLeft + 1);
      const [x, y] = this.toScreen(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      g.fillStyle = u.owner === s.player ? '#F2F2F2' : '#A9C7EC'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
    }
    // 行ける先（部隊を選んだとき）
    if (v.cand) {
      const pulse = 1 + Math.sin(now / 250) * 0.12;
      for (const n of v.cand.attack) { const [x, y] = this.toScreen(W.nodes[n].x, W.nodes[n].y); g.strokeStyle = '#E8806F'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 15 * pulse, 0, 7); g.stroke(); this.label('攻撃', x - 13, y - 24, 12, true); }
      for (const n of v.cand.move) { const [x, y] = this.toScreen(W.nodes[n].x, W.nodes[n].y); g.strokeStyle = 'rgba(242,242,242,0.9)'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, 13, 0, 7); g.stroke(); g.setLineDash([]); }
    }
    // 拠点
    const P = C(s, s.player);
    for (const n of W.nodes) {
      const [x, y] = this.toScreen(n.x, n.y); if (!this.onScreen(x, y)) continue;
      const ns = s.nodes[n.id];
      if (v.overlay === 'supply' && sameSide(s, ns.ctrl, s.player)) {
        const sp = supplyAt(s, s.player, n.id); g.fillStyle = sp >= 0.9 ? 'rgba(120,200,120,0.8)' : sp >= 0.5 ? 'rgba(230,190,90,0.85)' : 'rgba(230,90,80,0.9)';
        g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
      }
      if (P.warGoal.includes(n.id)) { g.strokeStyle = '#E8C063'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 9, 0, 7); g.stroke(); }
      if (n.capital) this.star(x, y, 6.5); else { g.fillStyle = '#F2F2F2'; g.strokeStyle = '#1E1F21'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, z > 1 ? 4 : 3, 0, 7); g.fill(); g.stroke(); }
      if (v.selected === n.id) { g.strokeStyle = '#FFFFFF'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 12 + Math.sin(now / 200) * 1.5, 0, 7); g.stroke(); }
    }
    // 名前と部隊チップ
    g.textBaseline = 'middle';
    for (const n of W.nodes) {
      const [x, y] = this.toScreen(n.x, n.y); if (!this.onScreen(x, y)) continue;
      const showName = n.capital ? z > 0.45 : n.ind >= 3 ? z > 0.9 : z > 1.5;
      if (showName) this.label(n.name, x + 9, y, n.capital ? 15 : 13, true);
      this.chips(s, n.id, x, y + 11);
    }
    if (v.overlay === 'sea' || z > 0.8) this.fleetChips(s);
    this.drawFx(now);
  }

  spaced(t: string, x: number, y: number, sp: number, stroke: boolean) {
    const g = this.ctx; const ws = [...t].map((ch) => g.measureText(ch).width);
    const total = ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1);
    let cx = x - total / 2; g.textAlign = 'left';
    [...t].forEach((ch, i) => { if (stroke) g.strokeText(ch, cx, y); g.fillText(ch, cx, y); cx += ws[i] + sp; });
    g.textAlign = 'center';
  }
  launchPos(s: GameState, target: number): [number, number] {
    let best = C(s, s.player).capital, bd = Infinity; const t = W.nodes[target];
    for (const n of W.nodes) if (s.nodes[n.id].ctrl === s.player) { const d = Math.hypot(n.x - t.x, n.y - t.y); if (d < bd) { bd = d; best = n.id; } }
    return [W.nodes[best].x, W.nodes[best].y];
  }
  arrow(x1: number, y1: number, x2: number, y2: number, col: string, w: number, prog: number) {
    const g = this.ctx;
    let [a, b] = this.toScreen(x1, y1); let [c, d] = this.toScreen(x2, y2);
    if (Math.abs(a - c) > innerWidth) return;
    const len = Math.hypot(c - a, d - b); if (len < 4) return;
    const ux = (c - a) / len, uy = (d - b) / len;
    a += ux * 8; b += uy * 8; c -= ux * 10; d -= uy * 10;
    const mx = (a + c) / 2 - uy * len * 0.12, my = (b + d) / 2 + ux * len * 0.12;
    g.lineCap = 'round'; g.strokeStyle = col; g.globalAlpha = 0.92; g.lineWidth = w;
    if (col === '#F2F2F2') g.setLineDash([w * 1.2, w * 0.9]);
    g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo(mx, my, c, d); g.stroke(); g.setLineDash([]);
    if (prog > 0) { g.strokeStyle = '#1E1F21'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo(mx, my, a + (c - a) * prog + (mx - (a + c) / 2) * 0.5, b + (d - b) * prog + (my - (b + d) / 2) * 0.5); g.stroke(); g.setLineDash([]); }
    const tx = c - mx, ty = d - my, tl = Math.hypot(tx, ty) || 1;
    const hx = tx / tl, hy = ty / tl;
    g.fillStyle = col; g.beginPath(); g.moveTo(c + hx * 10, d + hy * 10); g.lineTo(c - hy * 9 - hx * 4, d + hx * 9 - hy * 4); g.lineTo(c + hy * 9 - hx * 4, d - hx * 9 - hy * 4); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }
  star(x: number, y: number, r: number) {
    const g = this.ctx; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = '#F2F2F2'; g.strokeStyle = '#1E1F21'; g.lineWidth = 1.5; g.fill(); g.stroke();
  }
  label(t: string, x: number, y: number, size: number, bold: boolean) {
    const g = this.ctx; g.font = `${bold ? 700 : 600} ${size}px 'Noto Sans JP', sans-serif`; g.textAlign = 'left';
    g.lineWidth = 4; g.strokeStyle = 'rgba(24,25,27,0.9)'; g.lineJoin = 'round'; g.strokeText(t, x, y); g.fillStyle = '#F2F2F2'; g.fillText(t, x, y);
  }
  chip(x: number, y: number, bar: string, text: string, dashed = false): number {
    const g = this.ctx; g.font = `600 12px 'Noto Sans JP', sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'left';
    const w = g.measureText(text).width + (dashed ? 14 : 18), h = 20;
    g.fillStyle = 'rgba(26,27,29,0.94)'; g.fillRect(x, y, w, h);
    g.lineWidth = 1;
    if (dashed) { g.setLineDash([4, 3]); g.strokeStyle = bar || '#E6E6E6'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); g.setLineDash([]); }
    else { g.strokeStyle = 'rgba(255,255,255,0.28)'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); g.fillStyle = bar; g.fillRect(x + 1, y + 1, 5, h - 2); }
    g.fillStyle = '#F2F2F2'; g.fillText(text, x + (dashed ? 7 : 11), y + h / 2 + 0.5); return w;
  }
  // 部隊の駒（国旗の色・兵種・数・強さ）
  counter(x: number, y: number, o: { kind: 'land' | 'ad'; n: string; str: number; color: string; style: 'me' | 'ally' | 'enemy' | 'unknown'; busy?: boolean }): number {
    const g = this.ctx; const k = this.cam.z < 1.5 ? 0.8 : 1;
    g.save(); g.translate(x, y); g.scale(k, k); x = 0; y = 0;
    const r = this.counterBody(g, x, y, o); g.restore(); return r * k;
  }
  counterBody(g: CanvasRenderingContext2D, x: number, y: number, o: { kind: 'land' | 'ad'; n: string; str: number; color: string; style: 'me' | 'ally' | 'enemy' | 'unknown'; busy?: boolean }): number {
    const w = 50, h = 30;
    const border = o.style === 'me' ? '#F2F2F2' : o.style === 'ally' ? '#8DB0DA' : o.style === 'enemy' ? '#E0606A' : '#B5B6B9';
    g.fillStyle = o.style === 'enemy' ? 'rgba(58,26,30,0.95)' : 'rgba(24,25,27,0.95)'; g.fillRect(x, y, w, h);
    if (o.style === 'unknown') { g.setLineDash([4, 3]); g.strokeStyle = border; g.lineWidth = 1.5; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); g.setLineDash([]); }
    else { g.fillStyle = o.color; g.fillRect(x, y, w, 4); g.strokeStyle = border; g.lineWidth = o.style === 'me' ? 2 : 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    // 兵種の記号（陸＝四角に×、防空＝半円）
    g.strokeStyle = '#E6E6E6'; g.lineWidth = 1.3; const ix = x + 5, iy = y + 9;
    if (o.kind === 'land') { g.strokeRect(ix, iy, 16, 11); g.beginPath(); g.moveTo(ix, iy); g.lineTo(ix + 16, iy + 11); g.moveTo(ix + 16, iy); g.lineTo(ix, iy + 11); g.stroke(); }
    else { g.strokeRect(ix, iy, 16, 11); g.beginPath(); g.arc(ix + 8, iy + 11, 6, Math.PI, 0); g.stroke(); }
    g.font = `700 14px 'Noto Sans JP', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#F2F2F2';
    g.fillText(o.n, x + 36, y + 15); g.textAlign = 'left';
    if (o.style !== 'unknown') {
      g.fillStyle = '#3A3B3F'; g.fillRect(x + 4, y + h - 5, w - 8, 3);
      g.fillStyle = o.str > 66 ? '#9CCB8E' : o.str > 33 ? '#E8B36A' : '#E0606A'; g.fillRect(x + 4, y + h - 5, (w - 8) * Math.max(0, Math.min(1, o.str / 100)), 3);
    }
    if (o.busy) { g.fillStyle = '#E8806F'; g.beginPath(); g.moveTo(x + w - 9, y + 6); g.lineTo(x + w - 3, y + 10); g.lineTo(x + w - 9, y + 14); g.closePath(); g.fill(); }
    return w;
  }
  chips(s: GameState, n: number, x: number, y: number) {
    const ns = s.nodes[n]; const p = s.player; const z = this.cam.z;
    const units = s.units.filter((u) => u.node === n && !u.move && (u.kind === 'land' || u.kind === 'ad'));
    let cx = x - 25;
    if (sameSide(s, ns.ctrl, p)) {
      const by = new Map<string, { land: number[]; ad: number[]; busy: boolean }>();
      for (const u of units) { const e = by.get(u.owner) ?? { land: [], ad: [], busy: false }; (u.kind === 'land' ? e.land : e.ad).push(u.strength); if (u.order) e.busy = true; by.set(u.owner, e); }
      const avg = (a: number[]) => a.reduce((x1, y1) => x1 + y1, 0) / a.length;
      for (const [o, e] of [...by].sort((a, b) => (a[0] === p ? -1 : b[0] === p ? 1 : 0))) {
        const me = o === p;
        if (!me && z < 1.2) continue;
        if (!me && z < 0.55) continue;
        if (e.land.length) cx += this.counter(cx, y, { kind: 'land', n: String(e.land.length), str: avg(e.land), color: C(s, o).color, style: me ? 'me' : 'ally', busy: e.busy }) + 3;
        if (e.ad.length && (me ? z > 1.9 : z > 2.4)) cx += this.counter(cx, y, { kind: 'ad', n: String(e.ad.length), str: avg(e.ad), color: C(s, o).color, style: me ? 'me' : 'ally' }) + 3;
      }
    } else if (z > 0.55 && (atWar(s, p, ns.ctrl) || campsAtWar(s, C(s, p).camp, C(s, ns.ctrl).camp))) {
      const seen = s.seen[n]; const col = C(s, ns.ctrl).color;
      if (seen && s.day - seen.day <= 1) { if (seen.land > 0.2) cx += this.counter(cx, y, { kind: 'land', n: String(Math.max(1, Math.round(seen.land))), str: 100, color: col, style: 'enemy' }) + 3; if (seen.ad && z > 1.2) this.counter(cx, y, { kind: 'ad', n: String(seen.ad), str: 100, color: col, style: 'enemy' }); }
      else if (seen && s.day - seen.day <= 21 && seen.land >= 0.5) this.counter(cx, y, { kind: 'land', n: `?≈${Math.round(seen.land)}`, str: 0, color: col, style: 'unknown' });
      else if (W.adj[n].some((e) => sameSide(s, s.nodes[e.to].ctrl, p))) this.counter(cx, y, { kind: 'land', n: '?', str: 0, color: col, style: 'unknown' });
    }
  }
  fleetChips(s: GameState) {
    const p = s.player; const psd = side(s, p);
    for (const z of W.zones) {
      const [x, y] = this.toScreen(z.x, z.y); if (!this.onScreen(x, y)) continue;
      const own = s.units.filter((u) => u.kind === 'fleet' && u.zone === z.id && !u.transit && sameSide(s, u.owner, p)).length;
      let cx = x;
      if (own) cx += this.chip(cx, y, '#7FA6D6', `艦${own}`) + 3;
      const enemyPower = Object.entries(s.seaShare[z.id] ?? {}).filter(([k]) => Number(k) !== psd && campsAtWar(s, Number(k), C(s, p).camp)).reduce((a, [, v]) => a + v, 0);
      if (enemyPower > 0) this.chip(cx, y, '#E0606A', `敵艦≈${Math.max(1, Math.round(enemyPower))}`, true);
    }
  }
  drawSea(s: GameState) {
    const g = this.ctx; const psd = side(s, s.player);
    for (const z of W.zones) {
      const [x, y] = this.toScreen(z.x, z.y); if (!this.onScreen(x, y, 100)) continue;
      const sh = s.seaShare[z.id] ?? {}; const tot = Object.values(sh).reduce((a, b) => a + b, 0);
      g.globalAlpha = 0.85; g.fillStyle = 'rgba(30,31,33,0.88)'; g.fillRect(x - 70, y - 34, 140, 30); g.globalAlpha = 1;
      this.label(z.name, x - 64, y - 26, 11, true);
      let bx = x - 64;
      if (tot > 0) for (const [k, v] of Object.entries(sh)) { const w = 128 * v / tot; const own = Number(k) === psd; const enemy = campsAtWar(s, Number(k), C(s, s.player).camp); g.fillStyle = own ? CAMP_COLORS.self : enemy ? CAMP_COLORS.enemy : CAMP_COLORS.other; g.fillRect(bx, y - 15, w, 6); bx += w; }
      else { g.fillStyle = '#5A5B5E'; g.fillRect(bx, y - 15, 128, 6); }
    }
  }
  drawAir(s: GameState) {
    const g = this.ctx; const psd = side(s, s.player);
    for (const r of W.regions) {
      const [x, y] = this.toScreen(r.x, r.y); if (!this.onScreen(x, y, 100)) continue;
      const sh = airShare(s, r.id, psd);
      g.fillStyle = 'rgba(30,31,33,0.88)'; g.fillRect(x - 70, y - 34, 140, 30);
      this.label(`${r.name} 制空${Math.round(sh * 100)}%`, x - 64, y - 26, 11, true);
      g.fillStyle = CAMP_COLORS.enemy; g.fillRect(x - 64, y - 15, 128, 6); g.fillStyle = CAMP_COLORS.self; g.fillRect(x - 64, y - 15, 128 * sh, 6);
      const own = s.units.filter((u) => u.kind === 'air' && u.region === r.id && u.owner === s.player).length;
      if (own) this.chip(x - 64, y - 4, CAMP_COLORS.self, `空${own}`);
    }
  }
  drawFx(now: number) {
    const g = this.ctx;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; const t = (now - f.t0) / 1800;
      if (t > 1.6) { fx.splice(i, 1); continue; }
      const [a, b] = this.toScreen(...f.from), [c, d] = this.toScreen(...f.to);
      if (Math.abs(a - c) > innerWidth) continue;
      const mx = (a + c) / 2, my = Math.min(b, d) - Math.hypot(c - a, d - b) * 0.35;
      g.strokeStyle = 'rgba(255,230,200,0.35)'; g.lineWidth = 1.5; g.setLineDash([3, 5]);
      g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo(mx, my, c, d); g.stroke(); g.setLineDash([]);
      if (t < 1) { const u = t; const px = (1 - u) ** 2 * a + 2 * (1 - u) * u * mx + u * u * c, py = (1 - u) ** 2 * b + 2 * (1 - u) * u * my + u * u * d; g.fillStyle = '#FFE2B8'; g.beginPath(); g.arc(px, py, 3, 0, 7); g.fill(); }
      else { const k = t - 1; g.strokeStyle = `rgba(255,140,90,${1 - k / 0.6})`; g.lineWidth = 3; for (let j = 0; j < Math.min(4, 1 + f.hits / 20); j++) { g.beginPath(); g.arc(c + j * 4 - 6, d + (j % 2) * 4 - 2, 6 + k * 40 * (1 + j * 0.3), 0, 7); g.stroke(); } }
    }
  }

  pick(sx: number, sy: number): number | null {
    let best: number | null = null, bd = 16;
    for (const n of W.nodes) { const [x, y] = this.toScreen(n.x, n.y); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = n.id; } }
    if (best !== null) return best;
    let [wx, wy] = this.toWorld(sx, sy); wx = ((wx % W.W) + W.W) % W.W;
    this.ctx.save(); this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    let hit: number | null = null;
    for (const [n, p] of this.provPaths) {
      const b = this.provBox.get(n)!; if (wx < b[0] || wx > b[2] || wy < b[1] || wy > b[3]) continue;
      if (this.ctx.isPointInPath(p, wx, wy)) { hit = n; break; }
    }
    this.ctx.restore();
    return hit;
  }
}

// ミニマップ
export function drawMinimap(cv: HTMLCanvasElement, view: MapView) {
  const g = cv.getContext('2d')!; const w = cv.width, h = cv.height;
  g.drawImage(view.tex, 0, 0, w, h);
  const sx = w / W.W, sy = h / W.H;
  const vw = innerWidth / view.cam.z * sx, vh = innerHeight / view.cam.z * sy;
  const x = view.cam.x * sx - vw / 2, y = view.cam.y * sy - vh / 2;
  g.strokeStyle = '#FFFFFF'; g.lineWidth = 2;
  for (const k of [-w, 0, w]) g.strokeRect(x + k, y, vw, vh);
}
