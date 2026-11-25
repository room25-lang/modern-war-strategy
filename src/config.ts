// ===== 数値バランス（仮の値。遊びながらここを直す） =====
export const CFG = {
  dayMs: 30000 / 7,          // 1日の実時間（30秒＝1週間）
  totalWeeks: 240,           // 約4年半（30秒=1週で最大2時間）
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
  combatLoss: 7, progressRate: 26, landSpeedKm: 460,
  progressMax: 20, progressEmpty: 8, // 1日に進む占領の上限（1拠点に最低4〜5日かかる）
  momentumRate: 6.5, momentumMax: 1.8, // 勢い：開始時より広げた世界の割合×Rate だけ地上戦が強くなる（上限Max）
  // 外洋海軍（アメリカ）：制海の取れた海域を何海域も渡って兵を運び、遠くの港へ上陸できる
  blueWater: ['840'] as string[], blueWaterHops: 2, amphibPower: 0.6, amphibPowerBlue: 0.8,
  blueWaterLift: false, blueWaterLiftDays: 20,      // true にすると、上陸だけでなく増援の輸送も何海域も先まで
  // CPUのミサイル打撃：同じ相手国に撃つ間隔（日）と、1回に使う在庫の割合
  droneInterceptCost: 0.2,   // ドローン1機の迎撃に使う迎撃弾
  strikeGapDays: 7, strikeMaxAttackers: 2, strikeMax: { cruise: 22, ballistic: 9, drone: 45 }, // 1回の打撃の上限（ふつう。難しいは1.3倍）
  strikeShare: { easy: 0.05, normal: 0.07, hard: 0.1 } as Record<string, number>,
  hegemonyCap: 0.65,         // 首位がこの割合を超えたら、覇権の追い込みをやめる（世界をすべて塗りつぶさないように）
  hegemonyPower: 1.5,        // 終盤の首位の地上戦の力
  leaderGrowthWeight: 0.25,  // 終盤の首位を選ぶとき、伸び方をどれだけ重く見るか（0＝大きさだけ）
  // 本土で守るときの強さ（国の個性）：ロシアは広い国土と冬、ドイツ・インドは本土の守りが固い
  homeDefense: { '643': 2.2, '276': 1.4, '250': 1.3, '356': 1.15 } as Record<string, number>,
  homeGuard: 0.7,            // 本土の拠点に残す兵：隣の敵師団の数×この割合
  hegemonyWeek: 100,         // この週から、世界最大の主要国は講和せず拡張を続ける（覇権争いの終盤）
  // 中小国の併合：主要国は海を2海域先までたどって中小国の港へ上陸できる。中小国は優先して狙う
  colonialHops: 2, minorBias: 1.8, minorReq: 1.15,
  colonialChance: 0.35,      // 主要国が毎週、通常の宣戦とは別に中小国を狙う確率（ふつう）
  minorAnnexMinor: false,    // 中小国どうしの併合を認めるか（認めないと、併合するのは主要国だけになる）
  peaceKeepsCore: false,     // 講和のとき、主要国の本土は戦争目的の拠点しか譲らない
  capitalHold: 0.5,          // プレイヤーの国は本土の拠点をこの割合以上持っていれば、首都を失っても戦い続ける
  capitalHoldAI: 0.6,        // CPUの主要国は、本土の拠点をこの割合以上持っていれば首都を失っても戦い続ける（序盤の首都急襲だけで大国が消えないように）
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
