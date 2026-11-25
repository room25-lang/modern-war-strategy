// 各主要国の強さの偏りを調べる：CPU同士で試合を回し、最終的な世界の工業力シェアを1行のJSONで出す
// 使い方: npx tsx tools/balance-test.ts real 1 2 3   （まとめは tools/balance-sum.py）
import fs from 'fs';
import { setWorld, W } from '../src/world';
import { createGame } from '../src/game/state';
import { step } from '../src/game/sim';
(globalThis as any).performance ??= { now: () => Date.now() };
setWorld(JSON.parse(fs.readFileSync('public/data/world.json', 'utf8')));
const mode = process.argv[2] as 'real' | 'random';
const tot = W.nodes.reduce((a, n) => a + n.ind + 1, 0);
for (const seed of process.argv.slice(3).map(Number)) {
  const seat = ['840', '156', '643', '392', '826', '250', '276', '356'][seed % 8]; // 観戦の席は試合ごとに入れ替える
  const s = createGame({ player: seat, difficulty: 'normal', relMode: mode, seed }); s.countries[seat].ai = true;
  const mid: Record<string, number> = {}; const fall: string[] = [];
  while (!s.over) {
    step(s);
    for (const m of s.majors) { const c = s.countries[m]; if (c.capitulated && !fall.some((f) => f.startsWith(c.name))) fall.push(`${c.name}@${Math.floor(s.day / 7)}週←${s.countries[s.nodes[c.capital].ctrl]?.name}`); }
    if (s.day === 7 * 60) for (const m of s.majors) mid[s.countries[m].name] = 0;
    if (s.day === 7 * 60) W.nodes.forEach((n, i) => { const c = s.countries[s.nodes[i].ctrl]; if (c?.major) mid[c.name] += (n.ind + 1) / tot; });
  }
  const sh: Record<string, number> = {}; for (const m of s.majors) sh[s.countries[m].name] = 0;
  W.nodes.forEach((n, i) => { const c = s.countries[s.nodes[i].ctrl]; if (c?.major) sh[c.name] += (n.ind + 1) / tot; });
  const dead = s.majors.filter((m) => s.countries[m].capitulated).map((m) => s.countries[m].name);
  console.log(JSON.stringify({ mode, seed, sh, mid, dead, fall }));
}
