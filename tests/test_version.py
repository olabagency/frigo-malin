"""La version doit être identique dans le manifest, le code Python, le panneau et le CHANGELOG."""

from pathlib import Path
import runpy

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "check_version.py"


def test_versions_are_consistent():
    found = runpy.run_path(str(SCRIPT))["versions"]()
    assert len(set(found.values())) == 1, found
