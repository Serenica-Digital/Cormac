"""Cormac authoring-agent tools (project plugin).

Two typed tools, one job each, both thin HTTP clients over the control
plane's /agent/* surface. This replaces the ADR-0004 shell binding (the
terminal tool plus read_workbook.sh / submit_contract.sh) with the ADR-0008
typed-plugin pattern already proven on the operations agent:

- The model sees two declared tools and nothing else; there is no shell.
- Every call is a fresh stateless HTTP request carrying the workspace-scoped
  agent token (ADR-0005). No connection state exists to lose.
- The handlers hold no credentials of their own: CORMAC_CONTROL_PLANE_URL and
  CORMAC_AGENT_TOKEN arrive as process env, injected at gateway launch
  (`pnpm agent:hub run`, ADR-0005 as amended / ADR-0006).
- The control plane revalidates everything server-side; these schemas guide
  the model, they do not protect anything.

Tool names and shapes mirror the /agent/* interface and the prior shell tools
(the ADR-0004 discipline: bindings can swap, cognition must not).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from tools.registry import tool_error, tool_result

_TIMEOUT_SECONDS = 120


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def _available() -> bool:
    """Gate on the injected env pair; without it the tools stay unlisted."""
    return bool(_env("CORMAC_CONTROL_PLANE_URL") and _env("CORMAC_AGENT_TOKEN"))


def _call(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    """One request to the control plane. Returns (status, parsed JSON body).

    Never raises to the caller with the token in the message; urllib errors
    are reduced to status + body text before they leave this function.
    """
    base = _env("CORMAC_CONTROL_PLANE_URL").rstrip("/")
    request = urllib.request.Request(
        base + path,
        method=method,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={
            "Authorization": "Bearer " + _env("CORMAC_AGENT_TOKEN"),
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"error": "non_json_response", "message": raw[:2000]}
    except urllib.error.URLError as exc:
        return 0, {"error": "unreachable", "message": f"control plane unreachable: {exc.reason}"}


def _problem(status: int, payload: dict) -> str:
    """Render a control-plane problem response as a tool error the model can act on."""
    message = str(payload.get("message") or payload.get("error") or "request failed")
    detail = payload.get("detail")
    text = f"{message} ({detail})" if detail else message
    return tool_error(text, status_code=status)


READ_WORKBOOK_SCHEMA = {
    "name": "read_workbook",
    "description": (
        "Read the client's workbook as a detection profile: sheets, headers, "
        "inferred column types, and sample rows. Do this first, before greeting "
        "the client. With no arguments it returns the client's most recent "
        "upload, which is what you want."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "workbook": {
                "type": "string",
                "description": (
                    "Optional specific workbook name; omit to get the latest upload"
                ),
            },
        },
        "required": [],
    },
}


def _handle_read_workbook(args: dict, **_kw) -> str:
    workbook = str(args.get("workbook") or "").strip()
    path = "/agent/workbook"
    if workbook:
        path += "?name=" + urllib.parse.quote(workbook)
    status, payload = _call("GET", path)
    if status != 200:
        return _problem(status, payload)
    return tool_result(payload)


SUBMIT_CONTRACT_SCHEMA = {
    "name": "submit_contract",
    "description": (
        "The terminal action of a successful session. Submits the finished "
        "contract document; the control plane validates it against the "
        "meta-schema and publishes a new version. If validation fails it "
        "returns every issue verbatim (path + message) — fix the document and "
        "submit again. Validator output is for you, not the client."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "contract": {
                "type": "object",
                "description": (
                    "The full contract document: "
                    "{ name, version, objects: [...], glossary: [...] }"
                ),
            },
        },
        "required": ["contract"],
    },
}


def _handle_submit_contract(args: dict, **_kw) -> str:
    contract = args.get("contract")
    if not isinstance(contract, dict) or not contract:
        return tool_error("contract must be the full contract document (an object)")
    status, payload = _call("POST", "/agent/contract/submit", {"contract": contract})
    if status == 200:
        return tool_result(payload)
    # 422: validation failed. Surface the issues verbatim so the agent can repair.
    issues = payload.get("issues")
    if status == 422 and isinstance(issues, list):
        lines = [
            f"- {issue.get('path', '(root)')}: {issue.get('message', 'invalid')}"
            for issue in issues
        ]
        return tool_error(
            "contract invalid; fix these and resubmit:\n" + "\n".join(lines),
            status_code=422,
        )
    return _problem(status, payload)


_TOOLS = (
    ("read_workbook", READ_WORKBOOK_SCHEMA, _handle_read_workbook, "📖"),
    ("submit_contract", SUBMIT_CONTRACT_SCHEMA, _handle_submit_contract, "📝"),
)


def register(ctx) -> None:
    """Register the authoring toolset. Called once by the plugin loader."""
    for name, schema, handler, emoji in _TOOLS:
        ctx.register_tool(
            name=name,
            toolset="cormac_authoring",
            schema=schema,
            handler=handler,
            check_fn=_available,
            requires_env=["CORMAC_CONTROL_PLANE_URL", "CORMAC_AGENT_TOKEN"],
            emoji=emoji,
        )
