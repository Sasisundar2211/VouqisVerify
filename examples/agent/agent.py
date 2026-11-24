"""A tool-using support agent used as a Vouqis Verify reference workflow.

The agent runs a real plan -> act -> observe loop: it calls tools against an
in-memory order backend, retries transient failures, enforces a step budget,
and records every call in a trace. The planner is rule-based so the example
runs offline and deterministically. In your project, wrap your LLM agent and
return the same dict shape (``answer``, ``tool_calls``, ``stop_reason``).

Knobs that reproduce common agent regressions:

* ``skip_eligibility_check`` - issues refunds without checking policy first.
* ``swallow_tool_errors``    - ignores tool errors and reports success (silent failure).
* ``max_retries``            - 0 turns a transient backend error into a failure.
* ``max_steps``              - a small budget stops the agent before it finishes.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any, Callable, Dict, List, Optional

TODAY = date(2026, 6, 1)
REFUND_WINDOW_DAYS = 30


class ToolError(Exception):
    pass


class TransientToolError(ToolError):
    pass


def _orders() -> Dict[str, Dict[str, Any]]:
    return {
        "ORD-1001": {"status": "delivered", "delivered_on": date(2026, 5, 20), "amount": 129.0},
        "ORD-1002": {"status": "delivered", "delivered_on": date(2026, 3, 2), "amount": 59.0},
        "ORD-1003": {"status": "in_transit", "delivered_on": None, "amount": 249.0, "eta": "2026-06-04"},
        "ORD-1004": {"status": "in_transit", "delivered_on": None, "amount": 19.0, "eta": "2026-06-03", "flaky": True},
    }


class Backend:
    """In-memory order system. A fresh instance per run keeps cases independent."""

    def __init__(self) -> None:
        self.orders = _orders()
        self.refunds: List[str] = []
        self._flaky_calls: Dict[str, int] = {}

    def lookup_order(self, order_id: str) -> Dict[str, Any]:
        order = self.orders.get(order_id)
        if order is None:
            raise ToolError(f"order {order_id} not found")
        return {"order_id": order_id, "status": order["status"], "amount": order["amount"]}

    def check_refund_eligibility(self, order_id: str) -> Dict[str, Any]:
        order = self.lookup_order(order_id) and self.orders[order_id]
        delivered = order["delivered_on"]
        if delivered is None:
            return {"eligible": False, "reason": "order has not been delivered"}
        age = (TODAY - delivered).days
        if age > REFUND_WINDOW_DAYS:
            return {
                "eligible": False,
                "reason": f"delivered {age} days ago, outside the {REFUND_WINDOW_DAYS} day window",
            }
        return {"eligible": True, "reason": f"delivered {age} days ago"}

    def issue_refund(self, order_id: str, amount: float) -> Dict[str, Any]:
        if order_id not in self.orders:
            raise ToolError(f"cannot refund unknown order {order_id}")
        self.refunds.append(order_id)
        return {"refund_id": f"RF-{order_id[-4:]}", "amount": amount}

    def get_shipping_status(self, order_id: str) -> Dict[str, Any]:
        order = self.orders.get(order_id)
        if order is None:
            raise ToolError(f"order {order_id} not found")
        if order.get("flaky"):
            self._flaky_calls[order_id] = self._flaky_calls.get(order_id, 0) + 1
            if self._flaky_calls[order_id] == 1:
                raise TransientToolError("carrier API timed out")
        return {"order_id": order_id, "status": order["status"], "eta": order.get("eta")}


class StepBudgetExceeded(Exception):
    pass


class Agent:
    def __init__(
        self,
        backend: Backend,
        *,
        max_steps: int,
        max_retries: int,
        skip_eligibility_check: bool,
        swallow_tool_errors: bool,
    ) -> None:
        self.backend = backend
        self.max_steps = max_steps
        self.max_retries = max_retries
        self.skip_eligibility_check = skip_eligibility_check
        self.swallow_tool_errors = swallow_tool_errors
        self.trace: List[Dict[str, Any]] = []

    def call(self, name: str, **args: Any) -> Optional[Dict[str, Any]]:
        tool: Callable[..., Dict[str, Any]] = getattr(self.backend, name)
        attempt = 0
        while True:
            if len(self.trace) >= self.max_steps:
                raise StepBudgetExceeded()
            try:
                result = tool(**args)
                self.trace.append({"name": name, "args": args, "result": result, "error": None})
                return result
            except TransientToolError as exc:
                self.trace.append({"name": name, "args": args, "result": None, "error": str(exc)})
                attempt += 1
                if attempt > self.max_retries:
                    if self.swallow_tool_errors:
                        return None
                    raise
            except ToolError as exc:
                self.trace.append({"name": name, "args": args, "result": None, "error": str(exc)})
                if self.swallow_tool_errors:
                    return None
                raise

    def handle(self, message: str) -> str:
        match = re.search(r"\bORD-\d{4}\b", message, re.IGNORECASE)
        text = message.lower()
        if not match:
            return "Please share your order number (for example ORD-1234) so I can look it up."
        order_id = match.group(0).upper()

        if "refund" in text:
            order = self.call("lookup_order", order_id=order_id)
            if not self.skip_eligibility_check:
                verdict = self.call("check_refund_eligibility", order_id=order_id)
                if verdict is not None and not verdict["eligible"]:
                    return f"Order {order_id} is not eligible for a refund: {verdict['reason']}."
            amount = order["amount"] if order else 0.0
            refund = self.call("issue_refund", order_id=order_id, amount=amount)
            ref = refund["refund_id"] if refund else "pending"
            return f"Your refund for {order_id} has been issued (reference {ref}, amount {amount:.2f})."

        if any(w in text for w in ("where", "status", "track", "shipping")):
            status = self.call("get_shipping_status", order_id=order_id)
            if status is None:
                return f"Order {order_id} is on its way."
            label = status["status"].replace("_", " ")
            eta = f", expected {status['eta']}" if status.get("eta") else ""
            return f"Order {order_id} is {label}{eta}."

        return "I can help with refunds and shipping status. What would you like to do?"


def run(
    case_input: Any,
    *,
    max_steps: int = 8,
    max_retries: int = 2,
    skip_eligibility_check: bool = False,
    swallow_tool_errors: bool = False,
) -> Dict[str, Any]:
    """Vouqis target: takes the customer message as a string."""
    agent = Agent(
        Backend(),
        max_steps=int(max_steps),
        max_retries=int(max_retries),
        skip_eligibility_check=bool(skip_eligibility_check),
        swallow_tool_errors=bool(swallow_tool_errors),
    )
    try:
        answer = agent.handle(str(case_input))
        stop = "final_answer"
    except StepBudgetExceeded:
        answer, stop = "I ran out of steps before finishing your request.", "max_steps"
    except ToolError as exc:
        answer, stop = f"I couldn't complete that: {exc}.", "tool_error"
    return {
        "answer": answer,
        "tool_calls": agent.trace,
        "stop_reason": stop,
        "metadata": {"refunds_issued": list(agent.backend.refunds)},
    }
