import type { GameState } from '../types';
import { W } from '../world';
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
}

const OCEAN = '#3B4B5C';
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
      if (showName) this.label(n.name, x + 9, y, n.capital ? 13 : 12, n.capital);
      if (z > 0.55) this.chips(s, n.id, x, y + 14);
    }
    if (v.overlay === 'sea' || z > 0.8) this.fleetChips(s);
    this.drawFx(now);
  }

  arrow(x1: number, y1: number, x2: number, y2: number, col: string, w: number, prog: number) {
    const g = this.ctx;
    let [a, b] = this.toScreen(x1, y1); let [c, d] = this.toScreen(x2, y2);
    if (Math.abs(a - c) > innerWidth) return;
    const len = Math.hypot(c - a, d - b); if (len < 4) return;
    const ux = (c - a) / len, uy = (d - b) / len;
    a += ux * 8; b += uy * 8; c -= ux * 10; d -= uy * 10;
    const mx = (a + c) / 2 - uy * len * 0.12, my = (b + d) / 2 + ux * len * 0.12;
    g.lineCap = 'round'; g.strokeStyle = col; g.globalAlpha = 0.9; g.lineWidth = w;
    g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo(mx, my, c, d); g.stroke();
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
    const g = this.ctx; g.font = `${bold ? 700 : 500} ${size}px 'Noto Sans JP', sans-serif`;
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(24,25,27,0.9)'; g.lineJoin = 'round'; g.strokeText(t, x, y); g.fillStyle = '#F2F2F2'; g.fillText(t, x, y);
  }
  chip(x: number, y: number, bar: string, text: string, dashed = false): number {
    const g = this.ctx; g.font = `600 11px 'JetBrains Mono', 'Noto Sans JP', monospace`;
    const w = g.measureText(text).width + 14, h = 17;
    g.fillStyle = 'rgba(30,31,33,0.92)'; g.fillRect(x, y, w, h);
    if (dashed) { g.setLineDash([3, 2]); g.strokeStyle = '#B5B6B9'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); g.setLineDash([]); }
    else { g.fillStyle = bar; g.fillRect(x, y, 4, h); }
    g.fillStyle = '#F2F2F2'; g.fillText(text, x + (dashed ? 6 : 8), y + h / 2 + 0.5); return w;
  }
  chips(s: GameState, n: number, x: number, y: number) {
    const ns = s.nodes[n]; const p = s.player;
    const units = s.units.filter((u) => u.node === n && !u.move && (u.kind === 'land' || u.kind === 'ad'));
    let cx = x - 10;
    if (sameSide(s, ns.ctrl, p)) {
      const by = new Map<string, { land: number; ad: number }>();
      for (const u of units) { const e = by.get(u.owner) ?? { land: 0, ad: 0 }; if (u.kind === 'land') e.land++; else e.ad++; by.set(u.owner, e); }
      for (const [o, e] of by) { if (o !== p && this.cam.z < 1.3) continue; if (e.land) cx += this.chip(cx, y, this.colorFor(s, 'camp', o), `${o === p ? '' : C(s, o).name.slice(0, 2)}陸${e.land}`) + 3; if (e.ad && this.cam.z > 1.8) cx += this.chip(cx, y, this.colorFor(s, 'camp', o), `防${e.ad}`) + 3; }
    } else if (atWar(s, p, ns.ctrl) || campsAtWar(s, C(s, p).camp, C(s, ns.ctrl).camp)) {
      const seen = s.seen[n];
      if (seen && s.day - seen.day <= 1) { if (seen.land > 0.2) this.chip(cx, y, '#D58894', `陸${Math.max(1, Math.round(seen.land))}`); }
      else if (seen && s.day - seen.day <= 21 && seen.land >= 0.5) this.chip(cx, y, '', `?≈${Math.round(seen.land)}`, true);
      else if (W.adj[n].some((e) => sameSide(s, s.nodes[e.to].ctrl, p))) this.chip(cx, y, '', '?', true);
    }
  }
  fleetChips(s: GameState) {
    const p = s.player; const psd = side(s, p);
    for (const z of W.zones) {
      const [x, y] = this.toScreen(z.x, z.y); if (!this.onScreen(x, y)) continue;
      const own = s.units.filter((u) => u.kind === 'fleet' && u.zone === z.id && !u.transit && sameSide(s, u.owner, p)).length;
      let cx = x;
      if (own) cx += this.chip(cx, y, CAMP_COLORS.self, `艦${own}`) + 3;
      const enemyPower = Object.entries(s.seaShare[z.id] ?? {}).filter(([k]) => Number(k) !== psd && campsAtWar(s, Number(k), C(s, p).camp)).reduce((a, [, v]) => a + v, 0);
      if (enemyPower > 0) this.chip(cx, y, '#D58894', `敵艦≈${Math.max(1, Math.round(enemyPower))}`);
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
