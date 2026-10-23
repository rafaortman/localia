"""Gera public/localia.ico a partir da geometria de public/logo.svg.

Cada tamanho é desenhado separadamente (16x de supersampling e redução com LANCZOS) para ter borda suave,
fundo transparente e proporção correta. Requer Pillow: python tools/make-icon.py
"""
import io
import re
import struct
from pathlib import Path

from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
svg = (root / 'public' / 'logo.svg').read_text(encoding='utf-8')
nums = lambda s: [float(x) for x in re.findall(r'-?\d+\.?\d*', s)]
pairs = lambda v: list(zip(v[0::2], v[1::2]))

gx, gy = nums(re.search(r'<g transform="matrix\(1,0,0,1,([^)]*)\)">', svg).group(1))
l_path, a_path = re.findall(r'<path d="([^"]+)"', svg)
a_outer, a_hole = (p for p in a_path.split('Z') if p.strip())
sy, tx, ty, rx, ry, rw, rh = map(float, re.search(
    r'matrix\(1,0,0,([\d.]+),([\d.]+),([\d.]+)\)">\s*<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"', svg).groups())
rect = [(rx + tx, ry * sy + ty), (rx + tx + rw, (ry + rh) * sy + ty)]

move = lambda pts: [(x + gx, y + gy) for x, y in pts]
ink = [move(pairs(nums(l_path))), move(rect[:1] + [(rect[1][0], rect[0][1]), rect[1], (rect[0][0], rect[1][1])]), move(pairs(nums(a_outer)))]
hole = move(pairs(nums(a_hole)))
xs = [x for poly in ink for x, _ in poly]
ys = [y for poly in ink for _, y in poly]
x0, y0, W, H = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)

SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
SS, FILL = 16, 0.96


def render(n):
    N = n * SS
    k = FILL * N / max(W, H)
    ox, oy = (N - W * k) / 2 - x0 * k, (N - H * k) / 2 - y0 * k
    P = lambda poly: [(ox + x * k, oy + y * k) for x, y in poly]
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for poly in ink:
        d.polygon(P(poly), fill=(0, 0, 0, 255))
    d.polygon(P(hole), fill=(0, 0, 0, 0))
    return img.resize((n, n), Image.LANCZOS)


def png_bytes(img):
    b = io.BytesIO()
    img.save(b, 'PNG')
    return b.getvalue()


STEM = 116.87            # espessura da haste, em unidades do desenho
GAP = (801.913 - 4 * STEM) / 3
RATIO_GAP, RATIO_LETTER, RATIO_VGAP, RATIO_HOLE = GAP / STEM, 549.93 / STEM, 101.2 / STEM, 122.26 / STEM


def snapped(n):
    """Tamanhos pequenos: hastes e vãos com número inteiro de pixels (bordas nítidas, vãos idênticos)."""
    best = None
    for s in range(1, n):
        for g in range(1, n):
            if 4 * s + 3 * g > n or not 0.6 <= g / s <= 1.5:
                continue
            score = (4 * s + 3 * g) / n - 0.5 * abs(g / s - RATIO_GAP)   # preenche o quadrado sem deformar vão e haste
            if best is None or score > best[0]:
                best = (score, s, g)
    _, s, g = best
    letter, vgap, hole = round(RATIO_LETTER * s), max(1, round(RATIO_VGAP * s)), round(RATIO_HOLE * s)
    tw, th = 4 * s + 3 * g, letter + vgap + s
    ox, oy = (n - tw) // 2, (n - th) // 2
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    box = lambda x, y, w, h: d.rectangle([ox + x, oy + y, ox + x + w - 1, oy + y + h - 1], fill=(0, 0, 0, 255))
    box(0, 0, s, letter + vgap + s)                       # haste do L
    box(0, letter + vgap, tw, s)                          # base do L
    box(s + g, 0, s, letter)                              # I
    ax = 2 * (s + g)                                      # A: duas hastes, barra de cima e barra do meio
    box(ax, 0, s, letter)
    box(ax + s + g, 0, s, letter)
    box(ax, 0, 2 * s + g, s)
    box(ax, s + hole, 2 * s + g, s)
    return img


frames = [(n, png_bytes(snapped(n) if n <= 64 else render(n))) for n in SIZES]
head = struct.pack('<HHH', 0, 1, len(frames))
offset = 6 + 16 * len(frames)
entries, blobs = b'', b''
for n, data in frames:
    entries += struct.pack('<BBBBHHII', n % 256, n % 256, 0, 0, 1, 32, len(data), offset + len(blobs))
    blobs += data
(root / 'public' / 'localia.ico').write_bytes(head + entries + blobs)
print('ok', [n for n, _ in frames])
