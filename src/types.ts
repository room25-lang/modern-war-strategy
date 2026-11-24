// ===== 地図データ（public/data/world.json） =====
export interface WNode {
  id: number; name: string; lon: number; lat: number; x: number; y: number;
  country: string; capital: boolean; port: boolean; airbase: boolean; adSite: boolean;
  ind: number; region: number; zones: number[];
}
export interface WZone { id: number; name: string; x: number; y: number; lon: number; lat: number; adj: number[]; region: number }
export interface WRegion { id: number; name: string; x: number; y: number }
export interface WorldData {
  W: number; H: number; seam: number; latTop: number; latBot: number;
  nodes: WNode[]; edges: [number, number, number][];
  zones: WZone[]; regions: WRegion[];
  provinces: { node: number; paths: [number, number][][] }[];
  fillers: { country: string; paths: [number, number][][] }[];
  outlines: { country: string; paths: [number, number][][] }[];
}

// ===== ゲーム状態 =====
export type LandDoc = 'mobile' | 'depth';
export type SeaDoc = 'carrier' | 'sub';
export type AirDoc = 'air' | 'ground';
export type IntelDoc = 'recon' | 'stealth';
export interface Doctrine { land: LandDoc; sea: SeaDoc; air: AirDoc; intel: IntelDoc }
export type GenCat = 'fighter' | 'armor' | 'ad' | 'naval';
export type Weapon = 'cruise' | 'ballistic' | 'drone';
export type Facility = 'ad' | 'airbase' | 'port' | 'ind' | 'units';
export type UnitKind = 'land' | 'air' | 'fleet' | 'ad';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Stock { cruise: number; ballistic: number; interceptor: number; drone: number }

export interface ProdItem { kind: UnitKind; progress: number; cost: number }
export interface GenProject { cat: GenCat; progress: number; cost: number }

export interface Country {
  id: string; name: string; major: boolean; color: string; ai: boolean;
  capital: number;              // 首都の拠点ID
  gdpBase: number;              // 週あたりの基礎予算
  gdp: number;                  // 今週の予算（被害・封鎖を反映）
  budget: { mil: number; ind: number; pop: number };
  debt: number;                 // 国債残高（pt）
  opinion: number;              // 世論 0-100
  warMode: boolean;             // 戦時体制
  stock: Stock; stockInit: Stock;
  gen: Record<GenCat, number>;  // 0=第4 1=第4.5 2=第5 3=第5.5
  doctrine: Doctrine;
  satellites: number; reconDrones: number;
  satAssign: number[]; droneAssign: number[];
  camp: number;                 // 陣営ID（-1=中立）
  engaged: boolean;             // 参戦中
  fights: boolean;              // 自分で戦う国か（中小国）
  alignment: Record<string, number>; // 中小国の主要国への傾き
  basesOf: string[];            // この国に基地を置いている主要国
  warGoal: number[];
  peace: Record<string, number>; // 単独講和した相手 → 再参戦できるようになる日
  queue: ProdItem[]; genProject: GenProject | null;
  cooldown: { summit: number; cyber: number; mobilize: number };
  effects: { gdpMalus: number; satBlind: number; adMalus: number }; // 残り日数
  initiatorDays: number;
  capitulated: boolean;
  lossesTotal: number; landInit: number;
  interest: number[];           // 関心のある地域
  hasBallistic: boolean;
  goalAchieved: number;         // 講和で得た戦争目的の達成度（最大値）
  indBase: number;              // 開始時の産業値の合計
  engagedDay: number;           // 参戦した日
}

export interface Unit {
  id: number; kind: UnitKind; owner: string; strength: number;
  node: number;                 // 陸・防空：いる拠点
  region: number;               // 航空隊：担当地域
  zone: number;                 // 艦隊：担当海域
  move: { path: number[]; dayLeft: number; total: number } | null; // 陸の移動
  transit: number;              // 航空隊・艦隊の移動中の残り日数
  order: number;                // 参加している攻勢ID（0=なし）
}

export interface Order { id: number; owner: string; from: number; to: number; progress: number; badDays: number; amphib: boolean }

export interface Strike { id: number; owner: string; day: number; hour: number; target: number; facility: Facility; n: Stock }

export interface Seen { day: number; land: number; ad: number }

export interface NodeState { owner: string; ctrl: string; health: { ad: number; airbase: number; port: number; ind: number } }

export interface NewsItem { day: number; text: string; kind: 'info' | 'warn' | 'bad' | 'good' }

export interface StrikeFx { from: [number, number]; to: [number, number]; t0: number; hits: number; intercepted: number; owner: string }

export interface GameState {
  version: number;
  day: number; endDay: number; tensionEnd: number;
  phase: 'tension' | 'war';
  player: string; difficulty: Difficulty; relMode: 'real' | 'random';
  countries: Record<string, Country>;
  majors: string[];
  rel: Record<string, Record<string, number>>; // 主要国同士の関係値
  nodes: NodeState[];
  units: Unit[]; nextId: number;
  orders: Order[];
  strikes: Strike[];
  tension: number[];            // 地域ごとの張り詰め度
  contrib: Record<string, number>[]; // 地域ごと：国→張り詰め度への寄与
  wars: [number, number][];     // 戦争中の陣営の組
  campsLocked: boolean;
  seen: Record<number, Seen>;   // プレイヤーの索敵結果
  visibleNow: number[];         // 今日見えている拠点
  news: NewsItem[];
  airShare: Record<number, number>[]; // 地域 → 陣営 → 割合
  seaShare: Record<number, number>[]; // 海域 → 陣営 → 割合
  seaEnemy: number[][];         // 海域ごと：存在する陣営
  supply: Record<string, number[]>; // 陣営キー → 拠点ごとの補給度
  over: boolean;
  result: Result | null;
  pendingPeace: { from: string; nodes: number[] } | null;
  forcedPeace: boolean;
  tips: string[];
}

export interface Result { rank: string; achieved: string[]; notes: string[]; defeat: boolean }
