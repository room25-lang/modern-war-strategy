// ===== 数値バランス（仮の値。遊びながらここを直す） =====
export const CFG = {
  dayMs: 60000 / 7,          // 1日の実時間（1分＝1週間）
  totalWeeks: 104,           // 約2年
  tensionWeeks: 12,          // 緊張期
  // 部隊の生産（pt と 週）
  cost: { land: 60, air: 80, fleet: 120, ad: 40 } as Record<string, number>,
  maint: { land: 0.35, air: 0.55, fleet: 0.9, ad: 0.3 } as Record<string, number>,
  // 弾の単価（pt）
  stockCost: { cruise: 0.35, ballistic: 0.9, interceptor: 0.5, drone: 0.05 },
  stockSplit: { cruise: 0.3, ballistic: 0.15, interceptor: 0.35, drone: 0.2 },
  // 射程（km）と迎撃されやすさ・威力
  range: { cruise: 2500, ballistic: 5500, drone: 2000 },
  interceptP: { cruise: 0.8, ballistic: 0.5, drone: 0.9 },
  dmg: { cruise: 1, ballistic: 1.6, drone: 0.25 },
  // 防空の1日あたり迎撃能力
  adUnitCap: 60, adSiteCap: 50, adRegionCap: 8,
  // 地上戦
  combatLoss: 7, progressRate: 20, landSpeedKm: 420,
  // 世論
  opinionWarDrift: -0.05, opinionPeaceTarget: 55,
  opinionNoMobilize: 40, opinionBudgetCap: 25, opinionForcedPeace: 12,
  // 国債
  borrowWeeks: 4, interestPerWeek: 0.0006, debtPenaltyRatio: 250,
  // 世代の改修
  genCost: [120, 200, 300], genWeeks: 12,
  genFactor: [1, 1.15, 1.3, 1.45],
  // 難易度（CPUの予算ボーナス、判断のぶれ、攻める閾値）
  diff: {
    easy: { bonus: 1.0, noise: 0.35, attack: 1.25 },
    normal: { bonus: 1.1, noise: 0.2, attack: 1.05 },
    hard: { bonus: 1.25, noise: 0.1, attack: 0.95 },
  },
  campJoin: 50,              // 中小国が陣営に入る傾き
  summitCost: 5, aidCost: 10, baseCost: 15, cyberCost: 15, mobilizeOpinion: 3,
};
