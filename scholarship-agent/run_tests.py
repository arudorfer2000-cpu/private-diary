#!/usr/bin/env python3
"""Runs every automated check: unit/integration tests, then the viewer test in headless Chromium if node + playwright exist."""
import shutil, subprocess, sys, tempfile
from pathlib import Path
HERE = Path(__file__).parent
rc = subprocess.call([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-t", ".", "-p", "test_*.py"], cwd=HERE)
node = shutil.which("node")
if node and (HERE / "tests" / "viewer_test.mjs").exists():
    out = tempfile.mkdtemp()
    subprocess.check_call([sys.executable, "-m", "tests.seed_viewer", out], cwd=HERE, stdout=subprocess.DEVNULL)
    rc |= subprocess.call([node, "tests/viewer_test.mjs", out], cwd=HERE)
else:
    print("viewer test skipped (node not found)")
sys.exit(rc)
