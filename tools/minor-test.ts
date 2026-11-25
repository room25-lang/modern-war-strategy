// 南米・アフリカなどの中小国が、試合の終わりまでにどれだけ大国に併合されたかを調べる
import fs from 'fs';
import { setWorld, W } from '../src/world';
import { createGame } from '../src/game/state';
import { step } from '../src/game/sim';
(globalThis as any).performance ??= { now: () => Date.now() };
setWorld(JSON.parse(fs.readFileSync('public/data/world.json', 'utf8')));
const region = (id: string): string => {
  const n = W.nodes[(W.nodesByCountry[id] ?? [])[0]]; if (!n) return '?';
  const { lon, lat } = n as any;
  if (lon < -30 && lat < 13) return '南米';
  if (lon < -30) return '北中米';
  if (lon > -20 && lon < 52 && lat < 36 && !(lon > 34 && lat > 12)) return 'アフリカ';
  if (lon > 25 && lon < 63 && lat > 12 && lat < 42) return '中東';
  if (lon > 60 && lat < 35) return '南・東南アジア';
  if (lon < 45 && lat > 35) return 'ヨーロッパ';
  return 'その他';
};
const seeds = process.argv.slice(2).map(Number); if (!seeds.length) seeds.push(1, 2, 3, 4);
const tot: Record<string, [number, number]> = {}; const by: Record<string, number> = {};
for (const seed of seeds) {
  const s = createGame({ player: '392', difficulty: 'normal', relMode: 'real', seed }); s.countries['392'].ai = true;
  while (!s.over) step(s);
  for (const c of Object.values(s.countries)) {
    if (c.major || !(W.nodesByCountry[c.id] ?? []).length) continue;
    const r = region(c.id); tot[r] ??= [0, 0]; tot[r][1]++;
    const owner = s.nodes[(W.nodesByCountry[c.id])[0]].ctrl;
    if (c.capitulated) { tot[r][0]++; const o = s.countries[owner]; if (o) by[o.name] = (by[o.name] ?? 0) + 1; }
  }
}
console.log('地域ごとの併合された中小国（全試合の合計）');
for (const [r, [a, b]] of Object.entries(tot)) console.log(`  ${r}: ${a}/${b}（${Math.round(a / b * 100)}%）`);
console.log('併合した国:', Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + v).join(' '));
