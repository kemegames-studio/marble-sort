"""Apply shared presentation to the preserved Android build without Capacitor sync."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
assets = root / 'android/app/src/main/assets/public/assets'
for name in ['design-system.css', 'design-system.js']:
    shutil.copyfile(root / 'public/assets' / name, assets / name)
bundle = assets / 'index-xlleoick.js'
text = bundle.read_text()
if 'import { renderStore }' not in text:
    text = 'import { renderStore } from "./design-system.js";\n' + text
start = text.index('function ct(){')
end = text.index(' const ut=', start)
text = text[:start] + 'function ct(){return renderStore({coins:o.coins,products:Ze,price:kn})}' + text[end:]
text = text.replace('${r.badge} ${r.name} League', '<span aria-hidden="true">★</span> ${r.name} League')
text = text.replace('${H(e.league).badge} ${H(e.league).name}', '${H(e.league).name}')
text = text.replace('<span class="lb-podium-points">STAR ', '<span class="lb-podium-points">★ ')
bundle.write_text(text)
html = assets.parent / 'index.html'
text = html.read_text()
if '/assets/design-system.css' not in text:
    text = text.replace('</head>', '<link rel="stylesheet" href="/assets/design-system.css" />\n</head>')
html.write_text(text)
print('Shared home design applied; production purchase and ranking handlers preserved.')
