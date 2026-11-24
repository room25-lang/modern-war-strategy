import type { Country, Difficulty, Doctrine, GameState, Unit, UnitKind } from '../types';
import { W } from '../world';
import { MAJORS, MINORS, REAL_REL, minorColor } from '../data/countries';
import { CFG } from '../config';
import { rand, rng } from './rules';

export interface Setup { player: string; difficulty: Difficulty; relMode: 'real' | 'random'; doctrine?: Doctrine; seed?: number }

export function createGame(setup: Setup): GameState {
  rng.seed = setup.seed ?? Math.floor(Math.random() * 1e9);
  const countries: Record<string, Country> = {};
  const capitalOf = (id: string) => (W.nodesByCountry[id] ?? []).find((n) => W.nodes[n].capital) ?? (W.nodesByCountry[id] ?? [0])[0];
  const indSum = (id: string) => (W.nodesByCountry[id] ?? []).reduce((a, n) => a + W.nodes[n].ind, 0);
  const random = setup.relMode === 'random';

  for (const m of MAJORS) {
    countries[m.id] = base(m.id, m.name, true, m.color, capitalOf(m.id), m.gdp, m.debtRatio);
    const c = countries[m.id];
    c.stock = { ...m.stock }; c.stockInit = { ...m.stock };
    c.gen = { ...m.gen }; c.doctrine = { ...m.doctrine };
    c.satellites = m.satellites; c.reconDrones = m.reconDrones; c.hasBallistic = m.ballistic;
    c.interest = m.interest.map((r) => W.regionIdx[r]).filter((x) => x !== undefined);
    c.fights = true;
  }
  for (const id of Object.keys(W.nodesByCountry)) {
    if (countries[id]) continue;
    const d = MINORS[id] ?? [id, 1, 0, 0, 0, false, {}];
    const [name, land, air, fleet, ad, fights, align] = d;
    const gdp = Math.max(2, indSum(id) * 1.8);
    const c = base(id, name, false, minorColor(id), capitalOf(id), gdp, 60);
    c.stock = { cruise: 15 * air, ballistic: 0, interceptor: 30 * (ad + air), drone: 40 * land };
    c.stockInit = { ...c.stock };
    c.gen = { fighter: ['376', '410', '158'].includes(id) ? 2 : 1, armor: 1, ad: 1, naval: 1 };
    c.fights = fights; c.reconDrones = fights ? 1 : 0;
    c.alignment = random ? randomAlign() : { ...align };
    void land; void fleet;
    countries[id] = c;
  }
  const player = setup.player;
  countries[player].ai = false;
  if (setup.doctrine) countries[player].doctrine = { ...setup.doctrine };

  const majors = MAJORS.map((m) => m.id);
  const rel: GameState['rel'] = {};
  for (const a of majors) { rel[a] = {}; for (const b of majors) rel[a][b] = a === b ? 100 : random ? Math.round(rand(-60, 70)) : 0; }
  if (!random) for (const [a, b, v] of REAL_REL) { rel[a][b] = v; rel[b][a] = v; }
  else for (const a of majors) for (const b of majors) if (a < b) rel[b][a] = rel[a][b];

  const s: GameState = {
    version: 1, day: 0, endDay: CFG.totalWeeks * 7, tensionEnd: CFG.tensionWeeks * 7, phase: 'tension',
    player, difficulty: setup.difficulty, relMode: setup.relMode, countries, majors, rel,
    nodes: W.nodes.map((n) => ({ owner: n.country, ctrl: n.country, health: { ad: n.adSite ? 100 : 0, airbase: n.airbase ? 100 : 0, port: n.port ? 100 : 0, ind: 100 } })),
    units: [], nextId: 1, orders: [], strikes: [],
    tension: W.regions.map(() => 5), contrib: W.regions.map(() => ({})),
    wars: [], campsLocked: false, seen: {}, visibleNow: [], news: [],
    airShare: W.regions.map(() => ({})), seaShare: W.zones.map(() => ({})), seaEnemy: [], supply: {},
    over: false, result: null, pendingPeace: null, forcedPeace: false, tips: [],
  };

  // 初期の張り詰め度
  W.regions.forEach((_, r) => {
    const ms = majors.filter((m) => countries[m].interest.includes(r));
    let minRel = 50;
    for (const a of ms) for (const b of ms) if (a < b) minRel = Math.min(minRel, rel[a][b]);
    s.tension[r] = Math.max(5, Math.min(35, -minRel * 0.5 + 5));
  });

  // 部隊の配置
  for (const m of MAJORS) deploy(s, m.id, m.land, m.air, m.fleet, m.ad);
  for (const id of Object.keys(countries)) {
    if (countries[id].major) continue;
    const d = MINORS[id]; const [, land, air, fleet, ad] = d ?? [id, 1, 0, 0, 0];
    deploy(s, id, land, air, fleet, ad);
  }
  for (const c of Object.values(countries)) c.landInit = s.units.filter((u) => u.owner === c.id && u.kind === 'land').length;

  // 衛星・偵察ドローンの初期割り当て（関心地域）
  for (const c of Object.values(countries)) {
    const regs = c.interest.length ? c.interest : [W.nodes[c.capital].region];
    c.satAssign = Array.from({ length: c.satellites }, (_, i) => regs[i % regs.length]);
    c.droneAssign = Array.from({ length: c.reconDrones }, (_, i) => regs[i % regs.length]);
  }
  return s;

  function randomAlign(): Record<string, number> {
    const out: Record<string, number> = {};
    const k = Math.floor(rand(0, 3));
    for (let i = 0; i < k; i++) out[MAJORS[Math.floor(rand(0, MAJORS.length))].id] = Math.round(rand(20, 80));
    return out;
  }
}

function base(id: string, name: string, major: boolean, color: string, capital: number, gdp: number, debtRatio: number): Country {
  return {
    id, name, major, color, ai: true, capital, gdpBase: gdp, gdp, budget: { mil: 35, ind: 40, pop: 25 },
    debt: (debtRatio / 100) * gdp * 52, opinion: 60, warMode: false,
    stock: { cruise: 0, ballistic: 0, interceptor: 0, drone: 0 }, stockInit: { cruise: 0, ballistic: 0, interceptor: 0, drone: 0 },
    gen: { fighter: 1, armor: 1, ad: 1, naval: 1 }, doctrine: { land: 'mobile', sea: 'sub', air: 'ground', intel: 'recon' },
    satellites: 0, reconDrones: 0, satAssign: [], droneAssign: [], camp: -1, engaged: false, fights: false,
    alignment: {}, basesOf: [], warGoal: [], peace: {}, queue: [], genProject: null,
    cooldown: { summit: 0, cyber: 0, mobilize: 0 }, effects: { gdpMalus: 0, satBlind: 0, adMalus: 0 },
    initiatorDays: 0, capitulated: false, lossesTotal: 0, landInit: 0, interest: [], hasBallistic: false, goalAchieved: 0,
    engagedDay: 0,
    indBase: (W.nodesByCountry[id] ?? []).reduce((a, n) => a + W.nodes[n].ind, 0),
  } as Country;
}

export function newUnit(s: GameState, owner: string, kind: UnitKind, at: { node?: number; region?: number; zone?: number }, strength = 100): Unit {
  const u: Unit = { id: s.nextId++, kind, owner, strength, node: at.node ?? -1, region: at.region ?? -1, zone: at.zone ?? -1, move: null, transit: 0, order: 0 };
  s.units.push(u); return u;
}

function deploy(s: GameState, id: string, land: number, air: number, fleet: number, ad: number) {
  const c = s.countries[id];
  const nodes = [...(W.nodesByCountry[id] ?? [])].sort((a, b) => W.nodes[b].ind - W.nodes[a].ind);
  if (!nodes.length) return;
  const order = [c.capital, ...nodes.filter((n) => n !== c.capital)];
  for (let i = 0; i < land; i++) newUnit(s, id, 'land', { node: order[i % order.length] });
  const adOrder = [c.capital, ...nodes.filter((n) => n !== c.capital && W.nodes[n].adSite), ...nodes.filter((n) => n !== c.capital && !W.nodes[n].adSite)];
  for (let i = 0; i < ad; i++) newUnit(s, id, 'ad', { node: adOrder[i % adOrder.length] });
  const regs = [...new Set(nodes.map((n) => W.nodes[n].region))];
  const homeReg = W.nodes[c.capital].region;
  for (let i = 0; i < air; i++) newUnit(s, id, 'air', { region: i % 2 === 0 || regs.length === 1 ? homeReg : regs[i % regs.length] });
  const zones = [...new Set(nodes.flatMap((n) => W.nodes[n].zones))];
  for (let i = 0; i < fleet && zones.length; i++) newUnit(s, id, 'fleet', { zone: zones[i % zones.length] });
}
