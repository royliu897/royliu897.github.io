from pathlib import Path
import hashlib
import re

root = Path(__file__).resolve().parents[2]
assets = root / "assets/screener"
files = sorted(assets.glob("*.mjs")) + sorted(assets.glob("*.css"))


def normalize(source):
    return re.sub(r"\?+v=[a-zA-Z0-9]+", "?v=", source)


version = hashlib.sha256(
    "".join(normalize(p.read_text()) for p in files).encode()
).hexdigest()[:12]
for path in files:
    if path.suffix == ".mjs":
        path.write_text(re.sub(r"\?+v=[a-zA-Z0-9]+", "?v=" + version, path.read_text()))
page = root / "screener.html"
page.write_text(
    re.sub(
        r'(assets/screener/[^"?]+\?+v=)[a-zA-Z0-9]+',
        lambda m: m[1].split("?")[0] + "?v=" + version,
        page.read_text(),
    )
)
print("Screener frontend:", version)
