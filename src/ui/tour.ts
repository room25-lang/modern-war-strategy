// 最初のチュートリアル（画面の部品を順に光らせて説明する）
import { W } from '../world';
import type { UI } from './ui';

interface Step { title: string; body: string; target?: () => DOMRect | null; before?: () => void }

export class Tour {
  i = 0; steps: Step[] = []; ui: UI;
  constructor(ui: UI) { this.ui = ui; }

  start() {
    const ui = this.ui, h = ui.h;
    const el = (sel: string) => () => { const e = document.querySelector(sel) as HTMLElement | null; return e && e.offsetParent !== null ? e.getBoundingClientRect() : null; };
    const capRect = () => { const n = W.nodes[ui.me.capital]; const [x, y] = h.view.toScreen(n.x, n.y); return new DOMRect(x - 40, y - 26, 150, 80); };
    this.steps = [
      { title: 'ようこそ、指導者', body: `あなたは<b>${ui.me.name}</b>の国家指導者です。約2年（1分＝1週間）のあいだに、戦争の入口から出口までを決めます。<br>大事なのは3つだけ：<b>見る</b>（敵を索敵する）、<b>削る</b>（ミサイル・迎撃弾・予算・補給の削り合い）、<b>終わらせる</b>（世論が尽きる前に講和する）。` },
      { title: '上の帯：国の体力', body: '予算・国債・<b>世論</b>・ミサイルと防空の<b>在庫</b>・戦争目的の達成度です。世論か在庫が尽きた側が負けます。数字の横の「+2/週」は先週からの変化です。', target: el('#top') },
      { title: 'あなたの部隊', body: '白い枠の駒があなたの部隊です。<b>□に×</b>が師団、<b>□に半円</b>が防空大隊、数字が部隊の数、下の線が強さです。<br>拠点を押すと、行ける先が光ります。<b>白い点線の輪</b>を押すと移動、<b>赤い輪</b>を押すと攻撃です（ドラッグでも動かせます）。', target: capRect, before: () => { h.v.selected = ui.me.capital; h.view.centerOn(ui.me.capital, 1.5); ui.daily(); } },
      { title: '拠点パネル', body: '選んだ拠点の情報です。いる部隊を1つずつ、強さと「待機／移動中／攻勢中」で表示します。敵の拠点なら「打撃」や「戦争目的に加える」がここに出ます。', target: el('#nodePanel') },
      { title: '分野ボタン', body: '<b>外交</b>：陣営・援助・基地・参戦・講和　<b>予算</b>：軍・産業・国民の配分と国債<br><b>生産</b>：部隊と兵器の世代　<b>部隊</b>：全部隊の一覧<br><b>海・空</b>：艦隊と航空隊の担当　<b>打撃</b>：ミサイルとドローン<br><b>索敵</b>：衛星・偵察ドローン　<b>サイバー</b>：経済・衛星・防空への妨害', target: el('#cats') },
      { title: 'やることリスト', body: '迷ったらここを見てください。今やるべきことが並び、終わると消えます。押すとそのパネルが開きます。', target: el('#todo'), before: () => { ui.open(null); ui.daily(); } },
      { title: '打撃予定', body: '予約したミサイル攻撃が並びます。<b>同じ目標・同じ日</b>に安いドローンとミサイルを重ねると、敵の迎撃弾を使い切らせる<b>飽和攻撃</b>になります。', target: el('#strikeBar') },
      { title: '地図の表示', body: '「国/陣営」で塗り分けを切り替え、「制海」「制空」「補給」で状況を重ねて表示します。ホイールで拡大、ドラッグで移動、右下の全体地図を押すとそこへ飛べます。', target: el('#tools') },
      { title: '時間を進める', body: '最初の最大12週は<b>緊張期</b>です。戦争はまだ始まっていません。中小国を味方に引き込み、部隊を国境へ動かし、戦争目的を決めておきましょう。<br>準備ができたら<b>スペースキー</b>か右上の<b>▶</b>で時間を進めます。', target: el('#top .right') },
    ];
    this.i = 0; h.setPaused(true); this.show();
  }
  show() {
    const box = document.getElementById('tour')!; const st = this.steps[this.i];
    st.before?.();
    const r = st.target?.() ?? null;
    box.classList.remove('hidden');
    const card = { w: 400, h: 230 };
    let left = innerWidth / 2 - card.w / 2, top = innerHeight / 2 - card.h / 2;
    if (r) {
      top = r.bottom + 14 + card.h < innerHeight ? r.bottom + 14 : Math.max(10, r.top - card.h - 14);
      left = Math.min(innerWidth - card.w - 10, Math.max(10, r.left + r.width / 2 - card.w / 2));
      if (r.height > innerHeight * 0.5) { left = r.right + 14 + card.w < innerWidth ? r.right + 14 : r.left - card.w - 14; top = Math.max(10, r.top); }
    }
    const last = this.i === this.steps.length - 1;
    box.innerHTML = `${r ? `<div class="ring" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>` : '<div class="ring" style="left:50%;top:50%;width:0;height:0"></div>'}
      <div class="card" role="dialog" aria-label="チュートリアル" style="left:${left}px;top:${top}px"><h3>${st.title}</h3><div>${st.body}</div>
      <div class="nav"><span>${this.i + 1} / ${this.steps.length}</span><div><button type="button" data-tour="skip">飛ばす</button>${this.i ? '<button type="button" data-tour="back">戻る</button>' : ''}<button type="button" class="hot" data-tour="next">${last ? '始める' : '次へ'}</button></div></div></div>`;
    box.querySelectorAll<HTMLElement>('[data-tour]').forEach((b) => b.onclick = () => {
      const a = b.dataset.tour;
      if (a === 'next' && !last) { this.i++; this.show(); }
      else if (a === 'back') { this.i--; this.show(); }
      else this.end();
    });
  }
  end() {
    document.getElementById('tour')!.classList.add('hidden');
    localStorage.setItem('mws_tour', '1');
    this.ui.daily();
  }
}
