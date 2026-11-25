"""Downsample the official image-tool master for installation, preserving alpha.

No creative image edits or background extraction take place in this script.
"""
from pathlib import Path
from base64 import b64encode
from PIL import Image

project = Path(__file__).resolve().parents[1]
root = project / 'public' / 'icons'
root.mkdir(parents=True, exist_ok=True)
master = Image.open(project / 'assets' / 'brand' / 'wolfshield-master.png').convert('RGBA')
assert master.width == master.height, 'Use a square master without stretching'
assert master.getchannel('A').getextrema() == (0, 255), 'Master must have genuine transparency'
for size in (16, 32, 48, 64, 128, 256, 512):
    master.resize((size, size), Image.Resampling.LANCZOS).save(root / f'icon{size}.png', optimize=True)
png = (root / 'icon512.png').read_bytes()
(root / 'wolf.png').write_bytes(png)
# Compatibility wrapper only; this is not a vector tracing.
(root / 'wolf.svg').write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" '
    'aria-label="WolfShield — logo oficial"><title>WolfShield — logo oficial</title>'
    '<image width="512" height="512" href="data:image/png;base64,'
    + b64encode(png).decode('ascii') + '"/></svg>', encoding='utf-8')
print(f'Official master: {master.width}x{master.height}; seven PNG sizes; SVG raster wrapper')
