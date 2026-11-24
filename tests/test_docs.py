"""Keep documentation in step with the implementation."""

from __future__ import annotations

import re
import textwrap

import pytest
import yaml

from conftest import ROOT
from vouqis_verify.checks import REGISTRY
from vouqis_verify.config import parse_suite

DOCS = [ROOT / "README.md", *sorted((ROOT / "docs").glob("*.md"))]


def yaml_blocks(path):
    # Fences inside list items are indented; dedent so the block parses as written.
    blocks = re.findall(r"^([ \t]*)```yaml\n(.*?)^[ \t]*```", path.read_text(encoding="utf-8"), re.S | re.M)
    return [
        textwrap.dedent(
            "".join(line[len(indent) :] if line.startswith(indent) else line for line in body.splitlines(keepends=True))
        )
        for indent, body in blocks
    ]


def test_every_check_is_documented():
    text = (ROOT / "docs" / "checks.md").read_text(encoding="utf-8")
    missing = [t for t in REGISTRY if f"| `{t}` |" not in text]
    assert not missing, f"undocumented checks: {missing}"


def test_documented_checks_exist():
    text = (ROOT / "docs" / "checks.md").read_text(encoding="utf-8")
    documented = set(re.findall(r"^\| `([a-z_]+)` \|", text, re.M))
    assert documented == set(REGISTRY), documented ^ set(REGISTRY)


SUITE_EXAMPLES = [(path, block) for path in DOCS for block in yaml_blocks(path) if re.search(r"^cases:", block, re.M)]


@pytest.mark.parametrize(
    "path, block", SUITE_EXAMPLES, ids=[f"{p.name}#{i}" for i, (p, _) in enumerate(SUITE_EXAMPLES)]
)
def test_suite_examples_in_docs_are_valid(path, block, tmp_path):
    parse_suite(yaml.safe_load(block), tmp_path / "vouqis.yaml")


def test_suite_examples_were_found():
    assert len(SUITE_EXAMPLES) >= 2


def test_docs_have_no_em_dashes():
    offenders = [p.name for p in DOCS if "—" in p.read_text(encoding="utf-8")]
    assert not offenders
