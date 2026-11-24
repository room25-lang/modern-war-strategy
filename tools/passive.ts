// プレイヤーが何もしない場合に、どこまで生き残れるかを調べる
import fs from 'fs';
import { setWorld, W } from '../src/world';
import { createGame } from '../src/game/state';
import { step } from '../src/game/sim';
(globalThis as any).performance ??= { now: () => Date.now() };
setWorld(JSON.parse(fs.readFileSync('public/data/world.json', 'utf8')));
const names: Record<string, string> = {};
for (const diff of ['normal'] as const) for (const p of ['840', '156', '643', '392', '826', '250', '276', '356']) {
  const out: string[] = [];
  for (const seed of [61, 74, 76]) {
    const s = createGame({ player: p, difficulty: diff, relMode: 'real', seed });
    names[p] = s.countries[p].name;
    let firstWar = -1, t0 = Date.now(), maxStep = 0;
    while (!s.over) { const a = Date.now(); step(s); maxStep = Math.max(maxStep, Date.now() - a); if (firstWar < 0 && s.countries[p].engaged) firstWar = Math.floor(s.day / 7); if (s.forcedPeace) { s.forcedPeace = false; } }
    const held = (W.nodesByCountry[p] ?? []).filter((n) => s.nodes[n].ctrl === p).length / (W.nodesByCountry[p] ?? [1]).length;
    out.push(`seed${seed}: 終了=第${Math.floor(s.day / 7)}週 ${s.result?.defeat ? '敗北' : '評価' + s.result?.rank} 参戦=第${firstWar}週 本土${Math.round(held * 100)}% 世論${Math.round(s.countries[p].opinion)} ${Date.now() - t0}ms max${maxStep}ms`);
  }
  console.log(names[p], '\n  ' + out.join('\n  '));
}
