"""起伏の陰影（Natural Earth Shaded Relief, パブリックドメイン）をミラー図法に変換し、
128を中立とするグレースケール（soft-light合成用）で書き出す。
入力: basemap-data パッケージ内の shadedrelief.jpg（引数で指定）"""
import sys, math
import numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None

src = sys.argv[1]
W = 4096
SEAM, TOP, BOT = -169.0, 78.0, -56.0
miller = lambda lat: 1.25 * np.log(np.tan(np.pi / 4 + 0.4 * np.radians(lat)))
yT, yB = miller(TOP), miller(BOT)
H = round(W * (yT - yB) / (2 * math.pi))

rel = Image.open(src).convert('L')
L = np.asarray(rel, dtype=np.float32)
blur = np.asarray(rel.filter(ImageFilter.GaussianBlur(14)), dtype=np.float32)
hp = np.clip(L / np.maximum(blur, 1), 0.5, 1.5)          # 局所的な明暗＝陰影
rh, rw = hp.shape

xs = np.arange(W) + 0.5
ys = np.arange(H) + 0.5
lon = SEAM + xs / W * 360.0
lon = np.where(lon > 180, lon - 360, lon)
ym = yT - ys / H * (yT - yB)
lat = np.degrees((np.arctan(np.exp(ym / 1.25)) - np.pi / 4) / 0.4)
sx = ((lon + 180) / 360 * rw).astype(int).clip(0, rw - 1)
sy = ((90 - lat) / 180 * rh).astype(int).clip(0, rh - 1)
shade = hp[sy[:, None], sx[None, :]]

rng = np.random.default_rng(3)
grain = np.asarray(Image.fromarray((rng.random((H, W)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)), np.float32) / 255 - 0.5
cloud = np.asarray(Image.fromarray((rng.random((H // 48, W // 48)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(24)), np.float32) / 255 - 0.5
v = 128 + (shade - 1) * 230 + grain * 12 + cloud * 26
Image.fromarray(np.clip(v, 0, 255).astype(np.uint8)).save('public/img/relief.jpg', quality=82)
print('relief', W, H)
