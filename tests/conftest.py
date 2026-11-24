from __future__ import annotations

import textwrap
from pathlib import Path
from typing import Any, Dict

import pytest
import yaml

from vouqis_verify.config import Suite, parse_suite

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "examples"


@pytest.fixture
def make_suite(tmp_path: Path):
    """Write a target module and build a Suite from a dict, like a real suite file."""

    def factory(data: Dict[str, Any], target_code: str = "") -> Suite:
        if target_code:
            (tmp_path / "target_mod.py").write_text(textwrap.dedent(target_code))
        path = tmp_path / "vouqis.yaml"
        path.write_text(yaml.safe_dump(data))
        return parse_suite(data, path)

    return factory
