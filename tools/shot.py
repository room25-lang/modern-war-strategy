"""ブラウザで実際に動かして画面を撮る（動作確認用）"""
import sys, asyncio
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/shot'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto(URL)
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT + '_1setup.png')
        await pg.click('[data-start]')
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT + '_2start.png')
        await pg.keyboard.press('Space')
        await pg.wait_for_timeout(int(sys.argv[3]) if len(sys.argv) > 3 else 12000)
        await pg.keyboard.press('Space')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + '_3war.png')
        await pg.click('[data-panel=diplo]')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT + '_4diplo.png')
        await pg.click('[data-panel=strike]')
        await pg.wait_for_timeout(400)
        await pg.mouse.click(800, 450)
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT + '_5strike.png')
        print('\n'.join(logs[-30:]))
        await b.close()

asyncio.run(main())
