import type { Doctrine, GenCat, Stock } from '../types';

export interface MajorDef {
  id: string; name: string; short: string; color: string;
  gdp: number; debtRatio: number;
  land: number; air: number; fleet: number; ad: number;
  stock: Stock; gen: Record<GenCat, number>; doctrine: Doctrine;
  satellites: number; reconDrones: number; interest: string[]; ballistic: boolean;
  trait: string;
}

export const MAJORS: MajorDef[] = [
  { id: '840', name: 'アメリカ', short: '米', color: '#5A8FC4', gdp: 100, debtRatio: 120, land: 14, air: 12, fleet: 8, ad: 6,
    stock: { cruise: 600, ballistic: 60, interceptor: 500, drone: 2000 }, gen: { fighter: 3, armor: 2, ad: 2, naval: 3 },
    doctrine: { land: 'mobile', sea: 'carrier', air: 'air', intel: 'recon' }, satellites: 6, reconDrones: 6, ballistic: true,
    interest: ['北米東部', '北米西部', '太平洋中部', '西欧', '日本・西太平洋', '中東・北アフリカ'], trait: '最強の海空軍。ただし世界中に戦線を抱えやすい' },
  { id: '156', name: '中国', short: '中', color: '#C9A33C', gdp: 85, debtRatio: 80, land: 18, air: 10, fleet: 7, ad: 7,
    stock: { cruise: 500, ballistic: 400, interceptor: 450, drone: 2500 }, gen: { fighter: 2, armor: 2, ad: 2, naval: 2 },
    doctrine: { land: 'depth', sea: 'sub', air: 'ground', intel: 'recon' }, satellites: 5, reconDrones: 5, ballistic: true,
    interest: ['東アジア', '日本・西太平洋', '東南アジア', '南アジア', '中央アジア・シベリア'], trait: 'ミサイルの在庫が豊富。近海の接近阻止が得意' },
  { id: '643', name: 'ロシア', short: '露', color: '#8F2F31', gdp: 45, debtRatio: 20, land: 18, air: 8, fleet: 4, ad: 8,
    stock: { cruise: 400, ballistic: 300, interceptor: 500, drone: 1800 }, gen: { fighter: 1, armor: 1, ad: 3, naval: 1 },
    doctrine: { land: 'depth', sea: 'sub', air: 'ground', intel: 'stealth' }, satellites: 4, reconDrones: 4, ballistic: true,
    interest: ['ロシア西部', '東欧', '北欧・バルト', '中央アジア・シベリア', '東アジア', '中東・北アフリカ'], trait: '陸軍と防空が厚い。経済は小さく長期戦に弱い' },
  { id: '392', name: '日本', short: '日', color: '#E3D6B0', gdp: 55, debtRatio: 220, land: 8, air: 6, fleet: 5, ad: 6,
    stock: { cruise: 150, ballistic: 0, interceptor: 350, drone: 600 }, gen: { fighter: 2, armor: 2, ad: 2, naval: 2 },
    doctrine: { land: 'depth', sea: 'sub', air: 'ground', intel: 'recon' }, satellites: 2, reconDrones: 3, ballistic: false,
    interest: ['日本・西太平洋', '東アジア', '東南アジア'], trait: '防空と艦隊は質が高い。海上輸送に頼り、国債も重い' },
  { id: '826', name: 'イギリス', short: '英', color: '#B0384A', gdp: 50, debtRatio: 100, land: 6, air: 5, fleet: 5, ad: 3,
    stock: { cruise: 200, ballistic: 0, interceptor: 200, drone: 500 }, gen: { fighter: 2, armor: 1, ad: 1, naval: 2 },
    doctrine: { land: 'mobile', sea: 'carrier', air: 'air', intel: 'stealth' }, satellites: 1, reconDrones: 3, ballistic: false,
    interest: ['西欧', '北欧・バルト', '中東・北アフリカ'], trait: '島国で守りやすい。陸軍は小さい' },
  { id: '250', name: 'フランス', short: '仏', color: '#2F4F9E', gdp: 50, debtRatio: 110, land: 7, air: 5, fleet: 4, ad: 3,
    stock: { cruise: 200, ballistic: 0, interceptor: 220, drone: 500 }, gen: { fighter: 2, armor: 2, ad: 1, naval: 2 },
    doctrine: { land: 'mobile', sea: 'carrier', air: 'air', intel: 'recon' }, satellites: 2, reconDrones: 3, ballistic: false,
    interest: ['西欧', '中東・北アフリカ', 'アフリカ'], trait: 'バランス型。アフリカの中小国に影響力' },
  { id: '276', name: 'ドイツ', short: '独', color: '#5B5B57', gdp: 60, debtRatio: 65, land: 7, air: 5, fleet: 2, ad: 4,
    stock: { cruise: 150, ballistic: 0, interceptor: 260, drone: 700 }, gen: { fighter: 2, armor: 2, ad: 2, naval: 1 },
    doctrine: { land: 'mobile', sea: 'sub', air: 'ground', intel: 'stealth' }, satellites: 1, reconDrones: 3, ballistic: false,
    interest: ['西欧', '東欧', '北欧・バルト'], trait: '経済と産業が強い。軍は小さいが育てやすい' },
  { id: '356', name: 'インド', short: '印', color: '#D88A3A', gdp: 55, debtRatio: 85, land: 15, air: 7, fleet: 4, ad: 5,
    stock: { cruise: 300, ballistic: 150, interceptor: 300, drone: 1200 }, gen: { fighter: 1, armor: 1, ad: 1, naval: 1 },
    doctrine: { land: 'depth', sea: 'carrier', air: 'air', intel: 'stealth' }, satellites: 2, reconDrones: 3, ballistic: true,
    interest: ['南アジア', '中央アジア・シベリア', '東南アジア', '中東・北アフリカ'], trait: '兵力が多く、どの陣営にもつける位置にいる' },
];

// 現実ベースの関係値
export const REAL_REL: [string, string, number][] = [
  ['840', '826', 70], ['840', '392', 70], ['840', '250', 60], ['840', '276', 60], ['826', '250', 60], ['826', '276', 55],
  ['250', '276', 65], ['392', '826', 50], ['392', '250', 40], ['392', '276', 40], ['840', '356', 30], ['392', '356', 40],
  ['356', '826', 25], ['356', '250', 35], ['356', '276', 25], ['356', '643', 35], ['156', '643', 55],
  ['840', '156', -45], ['840', '643', -55], ['392', '156', -40], ['392', '643', -35], ['826', '643', -55], ['250', '643', -40],
  ['276', '643', -45], ['356', '156', -35], ['826', '156', -25], ['250', '156', -15], ['276', '156', -10],
];

// 中小国：[名前, 陸, 空, 艦, 防空, 戦うか, 傾き]
export const MINORS: Record<string, [string, number, number, number, number, boolean, Record<string, number>]> = {
  '124': ['カナダ', 3, 1, 1, 1, true, { '840': 85, '826': 60 }], '484': ['メキシコ', 2, 0, 0, 0, true, { '840': 45 }],
  '192': ['キューバ', 1, 0, 0, 0, false, { '643': 40, '156': 30 }], '076': ['ブラジル', 3, 1, 1, 1, true, {}],
  '032': ['アルゼンチン', 1, 0, 0, 0, true, {}], '170': ['コロンビア', 1, 0, 0, 0, false, { '840': 40 }],
  '862': ['ベネズエラ', 1, 0, 0, 0, false, { '643': 45, '156': 40 }], '604': ['ペルー', 1, 0, 0, 0, false, {}],
  '152': ['チリ', 1, 0, 0, 0, false, {}],
  '804': ['ウクライナ', 5, 1, 0, 1, true, { '840': 55, '276': 50, '826': 50 }], '616': ['ポーランド', 4, 2, 0, 1, true, { '840': 70, '276': 55 }],
  '112': ['ベラルーシ', 2, 0, 0, 0, true, { '643': 90 }], '440': ['リトアニア', 1, 0, 0, 0, false, { '840': 55, '276': 50 }],
  '428': ['ラトビア', 1, 0, 0, 0, false, { '840': 55 }], '233': ['エストニア', 1, 0, 0, 0, false, { '840': 55, '826': 45 }],
  '246': ['フィンランド', 2, 1, 0, 1, true, { '840': 40, '276': 40 }], '752': ['スウェーデン', 2, 1, 0, 1, true, { '840': 35 }],
  '578': ['ノルウェー', 1, 0, 0, 0, true, { '840': 55, '826': 50 }], '208': ['デンマーク', 1, 0, 0, 0, false, { '840': 50, '826': 45 }],
  '528': ['オランダ', 1, 0, 0, 0, false, { '840': 55, '276': 55 }], '056': ['ベルギー', 1, 0, 0, 0, false, { '250': 55, '276': 50 }],
  '756': ['スイス', 1, 0, 0, 0, false, {}], '040': ['オーストリア', 1, 0, 0, 0, false, { '276': 40 }],
  '203': ['チェコ', 1, 0, 0, 0, false, { '276': 50 }], '348': ['ハンガリー', 1, 0, 0, 0, false, { '276': 35, '643': 30 }],
  '642': ['ルーマニア', 2, 0, 0, 0, true, { '840': 50 }], '100': ['ブルガリア', 1, 0, 0, 0, false, {}],
  '688': ['セルビア', 1, 0, 0, 0, false, { '643': 40 }], '300': ['ギリシャ', 2, 1, 1, 1, true, { '840': 45, '250': 40 }],
  '380': ['イタリア', 3, 2, 2, 1, true, { '840': 50, '276': 45, '250': 45 }], '724': ['スペイン', 3, 1, 1, 1, true, { '250': 45, '840': 45 }],
  '620': ['ポルトガル', 1, 0, 0, 0, false, { '826': 45 }], '372': ['アイルランド', 1, 0, 0, 0, false, { '826': 30 }],
  '792': ['トルコ', 5, 2, 2, 1, true, { '840': 30, '643': 25 }], '268': ['ジョージア', 1, 0, 0, 0, false, {}],
  '031': ['アゼルバイジャン', 1, 0, 0, 0, false, {}], '364': ['イラン', 5, 1, 1, 1, true, { '643': 45, '156': 40 }],
  '368': ['イラク', 1, 0, 0, 0, true, {}], '760': ['シリア', 1, 0, 0, 0, true, { '643': 55 }],
  '376': ['イスラエル', 4, 3, 0, 2, true, { '840': 75 }], '682': ['サウジアラビア', 3, 2, 1, 1, true, { '840': 45, '156': 25 }],
  '784': ['UAE', 1, 1, 0, 1, false, { '840': 45 }], '634': ['カタール', 1, 0, 0, 0, false, { '840': 50 }],
  '512': ['オマーン', 1, 0, 0, 0, false, { '826': 40 }], '887': ['イエメン', 1, 0, 0, 0, false, {}],
  '818': ['エジプト', 4, 1, 1, 1, true, { '840': 35 }], '586': ['パキスタン', 6, 2, 1, 1, true, { '156': 60 }],
  '004': ['アフガニスタン', 1, 0, 0, 0, false, {}], '398': ['カザフスタン', 1, 0, 0, 0, true, { '643': 45, '156': 30 }],
  '860': ['ウズベキスタン', 1, 0, 0, 0, false, { '643': 30 }], '496': ['モンゴル', 1, 0, 0, 0, false, {}],
  '050': ['バングラデシュ', 1, 0, 0, 0, false, { '356': 35 }], '104': ['ミャンマー', 1, 0, 0, 0, false, { '156': 45 }],
  '144': ['スリランカ', 1, 0, 0, 0, false, { '356': 30, '156': 30 }], '764': ['タイ', 2, 0, 0, 0, true, { '840': 30 }],
  '704': ['ベトナム', 4, 1, 1, 1, true, {}], '116': ['カンボジア', 1, 0, 0, 0, false, { '156': 50 }],
  '418': ['ラオス', 1, 0, 0, 0, false, { '156': 50 }], '458': ['マレーシア', 1, 0, 0, 0, false, {}],
  '702': ['シンガポール', 1, 1, 0, 1, false, { '840': 40 }], '360': ['インドネシア', 3, 1, 1, 1, true, {}],
  '608': ['フィリピン', 1, 0, 0, 0, true, { '840': 50 }], '158': ['台湾', 3, 2, 1, 2, true, { '840': 50, '392': 45 }],
  '410': ['韓国', 6, 3, 2, 2, true, { '840': 75, '392': 40 }], '408': ['北朝鮮', 6, 1, 0, 1, true, { '156': 70, '643': 40 }],
  '036': ['オーストラリア', 3, 2, 2, 1, true, { '840': 75, '826': 55 }], '554': ['ニュージーランド', 1, 0, 0, 0, false, { '826': 45, '840': 40 }],
  '566': ['ナイジェリア', 1, 0, 0, 0, true, {}], '710': ['南アフリカ', 1, 0, 0, 0, true, {}],
  '231': ['エチオピア', 1, 0, 0, 0, false, {}], '404': ['ケニア', 1, 0, 0, 0, false, { '826': 30 }],
  '012': ['アルジェリア', 1, 0, 0, 0, false, { '250': 25 }], '504': ['モロッコ', 1, 0, 0, 0, false, { '250': 40 }],
  '434': ['リビア', 1, 0, 0, 0, false, {}], '729': ['スーダン', 1, 0, 0, 0, false, {}],
  '180': ['コンゴ民主共和国', 1, 0, 0, 0, false, {}], '024': ['アンゴラ', 1, 0, 0, 0, false, {}],
  '262': ['ジブチ', 1, 0, 0, 0, false, { '250': 50, '840': 45 }],
};

// 陣営表示の色
export const CAMP_COLORS = { self: '#4A78B8', ally: '#8DB0DA', enemy: '#C0545A', enemyIdle: '#8E5A6A', other: '#B58B4C', neutral: '#8A8A80' };

// 中小国の色（くすんだ色をIDから決める）
export function minorColor(id: string): string {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  const hue = (h * 47) % 360;
  return `hsl(${hue} ${22 + (h % 14)}% ${44 + (h % 12)}%)`;
}
