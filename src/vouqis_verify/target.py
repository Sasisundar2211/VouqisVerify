"""Locate the user's workflow callable and normalize what it returns.

Target spec forms:

* ``package.module:function`` - imported normally. The suite directory and the
  current working directory are put on ``sys.path`` first.
* ``path/to/file.py:function`` - loaded from a file, resolved relative to the
  suite directory.

The callable receives the case ``input`` as its only positional argument and
``target.kwargs`` as keyword arguments.
"""

from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List

from .errors import InvalidOutputError, TargetError
from .models import Context, Output, ToolCall


def load_callable(spec: str, base_dir: Path) -> Callable[..., Any]:
    if ":" not in spec:
        raise TargetError(f"Target {spec!r} must look like 'module:function' or 'file.py:function'.")
    module_part, _, attr_path = spec.rpartition(":")
    if not module_part or not attr_path:
        raise TargetError(f"Target {spec!r} must look like 'module:function' or 'file.py:function'.")

    for entry in (str(Path.cwd()), str(base_dir)):
        if entry not in sys.path:
            sys.path.insert(0, entry)

    if module_part.endswith(".py") or "/" in module_part or "\\" in module_part:
        path = (base_dir / module_part).resolve()
        if not path.is_file():
            raise TargetError(f"Target file not found: {path}")
        module_name = f"_vouqis_target_{abs(hash(str(path)))}"
        file_spec = importlib.util.spec_from_file_location(module_name, path)
        if file_spec is None or file_spec.loader is None:
            raise TargetError(f"Cannot load target file: {path}")
        module = importlib.util.module_from_spec(file_spec)
        sys.modules[module_name] = module
        try:
            file_spec.loader.exec_module(module)
        except Exception as exc:  # user code failed at import time
            sys.modules.pop(module_name, None)
            raise TargetError(f"Importing {path} failed: {type(exc).__name__}: {exc}") from exc
    else:
        try:
            module = importlib.import_module(module_part)
        except Exception as exc:
            raise TargetError(f"Importing module {module_part!r} failed: {type(exc).__name__}: {exc}") from exc

    obj: Any = module
    for attr in attr_path.split("."):
        try:
            obj = getattr(obj, attr)
        except AttributeError as exc:
            raise TargetError(f"{module_part!r} has no attribute {attr_path!r}.") from exc
    if not callable(obj):
        raise TargetError(f"Target {spec!r} is not callable.")
    return obj


def _context(item: Any, index: int) -> Context:
    if isinstance(item, str):
        return Context(text=item)
    if isinstance(item, dict):
        text = item.get("text", item.get("page_content", item.get("content")))
        if not isinstance(text, str):
            raise InvalidOutputError(f"contexts[{index}] needs a string 'text' field.")
        score = item.get("score")
        if score is not None and not isinstance(score, (int, float)):
            raise InvalidOutputError(f"contexts[{index}].score must be a number.")
        cid = item.get("id")
        return Context(text=text, id=None if cid is None else str(cid), score=score)
    raise InvalidOutputError(f"contexts[{index}] must be a string or an object, got {type(item).__name__}.")


def _tool_call(item: Any, index: int) -> ToolCall:
    if not isinstance(item, dict):
        raise InvalidOutputError(f"tool_calls[{index}] must be an object, got {type(item).__name__}.")
    name = item.get("name")
    if not isinstance(name, str) or not name:
        raise InvalidOutputError(f"tool_calls[{index}] needs a non-empty string 'name'.")
    args = item.get("args", item.get("arguments")) or {}
    if not isinstance(args, dict):
        raise InvalidOutputError(f"tool_calls[{index}].args must be an object.")
    error = item.get("error")
    return ToolCall(name=name, args=args, result=item.get("result"), error=None if error is None else str(error))


def normalize_output(value: Any) -> Output:
    """Convert a target's return value into :class:`Output` or raise ``InvalidOutputError``."""
    if isinstance(value, Output):
        return value
    if isinstance(value, str):
        return Output(answer=value)
    if not isinstance(value, dict):
        raise InvalidOutputError(f"Target must return a string or a dict, got {type(value).__name__}.")

    answer = value.get("answer")
    if answer is not None and not isinstance(answer, str):
        raise InvalidOutputError("'answer' must be a string or null.")

    raw_contexts = value.get("contexts", [])
    if not isinstance(raw_contexts, list):
        raise InvalidOutputError("'contexts' must be a list.")
    raw_calls = value.get("tool_calls", [])
    if not isinstance(raw_calls, list):
        raise InvalidOutputError("'tool_calls' must be a list.")

    stop_reason = value.get("stop_reason")
    if stop_reason is not None and not isinstance(stop_reason, str):
        raise InvalidOutputError("'stop_reason' must be a string or null.")
    metadata = value.get("metadata", {})
    if not isinstance(metadata, dict):
        raise InvalidOutputError("'metadata' must be an object.")

    contexts: List[Context] = [_context(c, i) for i, c in enumerate(raw_contexts)]
    calls: List[ToolCall] = [_tool_call(t, i) for i, t in enumerate(raw_calls)]
    known = {"answer", "contexts", "tool_calls", "stop_reason", "metadata"}
    extra: Dict[str, Any] = {k: v for k, v in value.items() if k not in known}
    if extra:
        metadata = {**extra, **metadata}
    return Output(answer=answer, contexts=contexts, tool_calls=calls, stop_reason=stop_reason, metadata=metadata)
