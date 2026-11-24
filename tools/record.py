"""CPU同士の1ゲーム（約2年）を、世界地図の構図で連番画像に撮る。
使い方: python3 tools/record.py URL 出力フォルダ 種(seed) 秒数"""
import sys, asyncio, os
from playwright.async_api import async_playwright

URL, OUT, SEED, SECS = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4])
FPS = 30
os.makedirs(OUT, exist_ok=True)

OVERLAY = """
() => {
  for (const id of ['cats','todo','panel','nodePanel','strikeBar','tools','toasts','tips','mini','top','legend','hint','tour']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  const o = document.createElement('div'); o.id = 'rec';
  o.innerHTML = `<div class="rt"><b>現代戦ストラテジー（仮）</b><span>CPU同士の対戦　約2年を20秒で</span></div><div class="rw"></div><div class="rc"></div><div class="rl"></div>`;
  document.body.appendChild(o);
  const st = document.createElement('style');
  st.textContent = `#rec{position:fixed;inset:0;pointer-events:none;font-family:'Noto Sans JP',sans-serif;color:#F2F2F2;z-index:50}
  #rec .rt{position:absolute;left:28px;top:22px;display:flex;align-items:baseline;gap:16px}
  #rec .rt b{font-size:30px;letter-spacing:.04em} #rec .rt span{font-size:18px;color:#CFCFD1}
  #rec .rw{position:absolute;right:28px;top:16px;text-align:right;font-size:34px;font-weight:700}
  #rec .rw small{display:block;font-size:15px;font-weight:400;color:#CFCFD1}
  #rec .rc{position:absolute;left:50%;bottom:58px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px}
  #rec .rc div{padding:6px 16px;border-radius:6px;background:rgba(24,25,27,.92);border-left:5px solid #E8806F;font-size:19px;font-weight:700;white-space:nowrap}
  #rec .rc div.g{border-left-color:#9CCB8E} #rec .rc div.w{border-left-color:#E8B36A}
  #rec .rl{position:absolute;left:28px;bottom:24px;display:flex;gap:14px;font-size:15px}
  #rec .rl span{display:flex;align-items:center;gap:6px} #rec .rl i{width:18px;height:12px;display:inline-block;border:1px solid rgba(0,0,0,.4)}`;
  document.head.appendChild(st);
}
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1920, 'height': 1080})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        await pg.click('[data-start]'); await pg.wait_for_timeout(500)
        if await pg.locator('[data-tour=skip]').count(): await pg.click('[data-tour=skip]')
        await pg.evaluate(f"""() => {{
          const M = window.__mws; const h = M.host;
          h.s = M.createGame({{ player: '392', difficulty: 'normal', relMode: 'real', seed: {SEED} }});
          h.s.countries['392'].ai = true; M.updateCamps(h.s); M.computeSupply(h.s);
          h.paused = true; h.v.spectator = true; h.view.spectator = true; h.v.mode = 'country'; h.v.selected = null;
          h.view.lastKey = ''; h.view.cam.x = 2048; h.view.cam.z = innerWidth / 4096; h.view.clamp();
        }}""")
        await pg.evaluate(OVERLAY)
        await pg.evaluate("""() => {
          const M = window.__mws; const s = M.host.s;
          document.querySelector('#rec .rl').innerHTML = s.majors.map((m) => `<span><i style="background:${s.countries[m].color}"></i>${s.countries[m].name}</span>`).join('');
          window.__cap = []; window.__seen = 0;
        }""")
        frames = int(SECS * FPS)
        for i in range(frames):
            await pg.evaluate(f"""() => {{
              const M = window.__mws; const s = M.host.s; const target = Math.min(s.endDay, Math.floor(({i} + 1) * s.endDay / {frames}));
              while (s.day < target && !s.over) M.step(s);
              const wk = Math.min(104, Math.floor(s.day / 7) + 1);
              document.querySelector('#rec .rw').innerHTML = `第${{wk}}週<small>${{s.phase === 'tension' ? '緊張期' : '戦争中'}}</small>`;
              const fresh = s.news.slice(window.__seen); window.__seen = s.news.length;
              const big = fresh.filter((n) => /開戦|降伏|講和|参戦|首都/.test(n.text) && !/中小国陣営/.test(n.text))
                .filter((n) => s.majors.some((m) => n.text.includes(s.countries[m].name)));
              for (const n of big) window.__cap.push({{ t: n.text.replace(/^【開戦】/, '開戦：'), k: /降伏|開戦/.test(n.text) ? '' : /講和/.test(n.text) ? 'w' : 'g', f: {i} }});
              window.__cap = window.__cap.filter((c) => {i} - c.f < 55).slice(-2);
              document.querySelector('#rec .rc').innerHTML = window.__cap.map((c) => `<div class="${{c.k}}">${{c.t}}</div>`).join('');
            }}""")
            await pg.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")
            await pg.screenshot(path=f'{OUT}/{i:04d}.jpg', type='jpeg', quality=88)
        print('errors:', errs)
        print(await pg.evaluate("JSON.stringify(window.__mws.host.s.result)"))
        await b.close()

asyncio.run(main())
