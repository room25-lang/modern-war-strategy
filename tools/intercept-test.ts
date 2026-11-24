// 開戦から何週で迎撃弾が尽きるかを調べる（CPUに任せた各国×3試合、80週まで）
import fs from 'fs';
import { setWorld } from '../src/world';
import { createGame } from '../src/game/state';
import { step } from '../src/game/sim';
(globalThis as any).performance ??= { now: () => Date.now() };
setWorld(JSON.parse(fs.readFileSync('public/data/world.json', 'utf8')));
for (const p of ['156', '643', '392', '250', '276', '356']) {
  const r: string[] = [];
  for (const seed of [61, 74, 76]) {
    const s = createGame({ player: p, difficulty: 'normal', relMode: 'real', seed }); const c = s.countries[p]; c.ai = true;
    let war = -1, empty = -1;
    while (!s.over && s.day < 7 * 80) { step(s); if (war < 0 && c.engaged) war = s.day; if (war >= 0 && empty < 0 && c.stock.interceptor < c.stockInit.interceptor * 0.1) empty = s.day; }
    r.push(empty < 0 ? '80週もつ' : `開戦${Math.round((empty - war) / 7)}週で枯渇`);
  }
  console.log(createGame({ player: p, difficulty: 'normal', relMode: 'real', seed: 1 }).countries[p].name, r.join(' / '));
}
