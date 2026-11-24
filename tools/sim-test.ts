// CPU同士で最後まで自動進行させ、落ちないか・展開がおかしくないかを確かめる
import fs from 'fs';
import { setWorld, W } from '../src/world';
import { createGame } from '../src/game/state';
import { step } from '../src/game/sim';
import { campName, events } from '../src/game/sim';

(globalThis as any).performance ??= { now: () => Date.now() };
setWorld(JSON.parse(fs.readFileSync('public/data/world.json', 'utf8')));
const seed = Number(process.argv[2] ?? 7);
const player = process.argv[3] ?? '392';
const s = createGame({ player, difficulty: 'normal', relMode: (process.argv[4] as any) ?? 'real', seed });
s.countries[player].ai = true;
const t0 = Date.now();
const report = () => {
  const camps = [...new Set(s.majors.map((m) => s.countries[m].camp))].map((c) => campName(s, c)).join(' / ');
  console.log(`--- 第${Math.floor(s.day / 7)}週 phase=${s.phase} wars=${JSON.stringify(s.wars)} units=${s.units.length} orders=${s.orders.length} strikes=${s.strikes.length}`);
  console.log('  陣営:', camps);
  for (const m of s.majors) {
    const c = s.countries[m];
    const held = W.nodes.filter((_, i) => s.nodes[i].ctrl === m).length;
    const land = s.units.filter((u) => u.owner === m && u.kind === 'land').length;
    console.log(`  ${c.name.padEnd(5)} camp=${c.camp} eng=${c.engaged ? 1 : 0} 拠点=${held} 陸=${land} 世論=${c.opinion.toFixed(0)} 予算=${c.gdp.toFixed(0)} 国債=${(c.debt / (c.gdpBase * 52) * 100).toFixed(0)}% 迎撃=${c.stock.interceptor.toFixed(0)} 巡航=${c.stock.cruise.toFixed(0)} ${c.capitulated ? '降伏' : ''}`);
  }
};
while (!s.over) {
  step(s);
  if (s.day % 91 === 0) report();
}
report();
console.log('result', s.result, 'ms', Date.now() - t0);
console.log('news sample:\n' + s.news.slice(-25).map((n) => `  [${Math.floor(n.day / 7)}週] ${n.text}`).join('\n'));
console.log('WARS:', s.news.filter((n) => n.text.includes('開戦') || n.text.includes('降伏') || n.text.includes('講和')).map((n) => `[${Math.floor(n.day / 7) + 1}週] ${n.text}`).join('\n  '));
console.log('CAPTURES:', s.news.filter((n) => n.text.includes('占領')).length, 'STRIKES:', s.news.filter((n) => n.text.includes('打撃')).length);
const EU = new Set(['西欧', '北欧・バルト', '東欧', 'ロシア西部'].map((r) => W.regionIdx[r]));
const capEU = s.news.filter((n) => n.text.includes('占領') && W.nodes.some((nd) => EU.has(nd.region) && n.text.includes(`が${nd.name}（`))).length;
const changed = W.nodes.filter((n, i) => s.nodes[i].ctrl !== n.country).length;
console.log('ALL_CAPTURES:', events.filter((e) => e.kind === 'capture').length, 'EU_CAPTURES:', capEU, 'NODES_CHANGED_HANDS:', changed, 'EU_CHANGED:', W.nodes.filter((n, i) => EU.has(n.region) && s.nodes[i].ctrl !== n.country).length);
