#!/usr/bin/env python3
"""Vérifie que la version est la même partout (et égale au tag donné, s'il y en a un)."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
COMPONENT = ROOT / "custom_components" / "frigo_malin"


def versions() -> dict[str, str | None]:
    def find(path: Path, pattern: str) -> str | None:
        match = re.search(pattern, path.read_text(encoding="utf-8"), re.M)
        return match.group(1) if match else None

    return {
        "manifest.json": json.loads((COMPONENT / "manifest.json").read_text(encoding="utf-8"))["version"],
        "const.py": find(COMPONENT / "const.py", r'^VERSION = "([^"]+)"'),
        "frigo-malin-panel.js": find(COMPONENT / "frontend" / "frigo-malin-panel.js", r'^const FM_VERSION = "([^"]+)";'),
        "CHANGELOG.md": find(ROOT / "CHANGELOG.md", r"^## \[(\d+\.\d+\.\d+)\]"),
    }


def main() -> None:
    found = versions()
    expected = sys.argv[1] if len(sys.argv) > 1 else found["manifest.json"]
    wrong = {name: v for name, v in found.items() if v != expected}
    if wrong:
        for name, value in wrong.items():
            print(f"{name} : {value} (attendu {expected})")
        sys.exit("Versions incohérentes. Lancez : python3 scripts/bump_version.py " + expected)
    print(f"Version {expected} cohérente partout.")


if __name__ == "__main__":
    main()
