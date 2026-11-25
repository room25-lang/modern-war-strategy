# balance-test.ts の出力（JSON行）をまとめる
import json, sys, collections
rows = [json.loads(l) for f in sys.argv[1:] for l in open(f) if l.startswith('{')]
names = list(rows[0]['sh'].keys())
win = collections.Counter(); tot = collections.defaultdict(float); dead = collections.Counter(); w60 = collections.Counter()
for r in rows:
    top = max(r['sh'], key=r['sh'].get); win[top] += 1
    for k, v in r['sh'].items(): tot[k] += v
    for k in r['dead']: dead[k] += 1
    w60[max(r['mid'], key=r['mid'].get)] += 1
n = len(rows)
print(f'{n}試合　国: 1位の回数 / 60週時点の1位 / 平均シェア / 消滅した回数')
for k in sorted(names, key=lambda k: -tot[k]):
    print(f'  {k}: {win[k]} / {w60[k]} / {tot[k]/n*100:.0f}% / {dead[k]}')
tops = sorted(max(r['sh'].values()) for r in rows)
print('1位のシェア:', ' '.join(f'{t*100:.0f}' for t in tops))
