#!/usr/bin/env python3
"""Passe Frigo Malin à une nouvelle version, partout à la fois.

Usage :
    python3 scripts/bump_version.py 1.1.0
    python3 scripts/bump_version.py patch   # 1.0.0 -> 1.0.1
    python3 scripts/bump_version.py minor   # 1.0.0 -> 1.1.0
    python3 scripts/bump_version.py major   # 1.0.0 -> 2.0.0

Met à jour manifest.json, const.py, le panneau JS et ouvre une section dans
CHANGELOG.md. Il reste ensuite à remplir le CHANGELOG, committer, puis publier
une release GitHub nommée v<version> : HACS proposera la mise à jour.
"""

from __future__ import annotations

from datetime import date
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
COMPONENT = ROOT / "custom_components" / "frigo_malin"
MANIFEST = COMPONENT / "manifest.json"
CONST = COMPONENT / "const.py"
PANEL = COMPONENT / "frontend" / "frigo-malin-panel.js"
CHANGELOG = ROOT / "CHANGELOG.md"
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def current_version() -> str:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))["version"]


def next_version(current: str, wanted: str) -> str:
    if SEMVER.match(wanted):
        return wanted
    major, minor, patch = (int(x) for x in SEMVER.match(current).groups())
    if wanted == "major":
        return f"{major + 1}.0.0"
    if wanted == "minor":
        return f"{major}.{minor + 1}.0"
    if wanted == "patch":
        return f"{major}.{minor}.{patch + 1}"
    sys.exit(f"Version invalide : {wanted} (attendu : 1.2.3, major, minor ou patch)")


def replace(path: Path, pattern: str, repl: str) -> None:
    text = path.read_text(encoding="utf-8")
    new, count = re.subn(pattern, repl, text, count=1, flags=re.M)
    if count != 1:
        sys.exit(f"Motif introuvable dans {path}")
    path.write_text(new, encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    old = current_version()
    new = next_version(old, sys.argv[1])

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["version"] = new
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    replace(CONST, r'^VERSION = "[^"]+"', f'VERSION = "{new}"')
    replace(PANEL, r'^const FM_VERSION = "[^"]+";', f'const FM_VERSION = "{new}";')

    changelog = CHANGELOG.read_text(encoding="utf-8")
    if f"## [{new}]" not in changelog:
        entry = f"## [{new}] – {date.today().isoformat()}\n\n### Ajouté\n\n- \n\n"
        changelog = changelog.replace("## [", entry + "## [", 1)
        CHANGELOG.write_text(changelog, encoding="utf-8")

    print(f"Frigo Malin : {old} -> {new}")
    print("Ensuite : complétez CHANGELOG.md, committez, puis publiez une release GitHub « v%s »." % new)


if __name__ == "__main__":
    main()
