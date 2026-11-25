from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
root=Path(__file__).resolve().parents[1]
out=root.parent
for target in ('chromium','firefox'):
    name=out/f'WolfShield-{target.capitalize()}.zip'
    with ZipFile(name,'w',ZIP_DEFLATED,compresslevel=9) as z:
        for file in sorted((root/'dist'/target).rglob('*')):
            if file.is_file():z.write(file,file.relative_to(root/'dist'/target))
    print(name.name,name.stat().st_size)
name=out/'WolfShield-Codigo-Fuente.zip'
with ZipFile(name,'w',ZIP_DEFLATED,compresslevel=9) as z:
    for file in sorted(root.rglob('*')):
        rel=file.relative_to(root)
        if file.is_file() and not any(p in ('node_modules','dist','test-results','.git') for p in rel.parts) and file.suffix!='.zip':z.write(file,Path('WolfShield')/rel)
print(name.name,name.stat().st_size)
lines=[]
for file in sorted(out.glob('WolfShield-*.zip')):lines.append(hashlib.sha256(file.read_bytes()).hexdigest()+'  '+file.name)
(out/'SHA256SUMS.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
