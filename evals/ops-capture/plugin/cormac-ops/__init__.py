"""Cormac operations-agent tools (project plugin).

Three typed tools, one job each, all thin HTTP clients over the control
plane's /agent/* surface. The security posture is the point (the ops seam
decision, ADR-0008):

- The model sees three declared tools and nothing else; there is no shell.
- Every call is a fresh stateless HTTP request carrying the workspace-scoped
  agent token (ADR-0005). No connection state exists to lose.
- The handlers hold no credentials of their own: CORMAC_CONTROL_PLANE_URL and
  CORMAC_AGENT_TOKEN arrive as process env, injected at gateway launch
  (`pnpm ops:hub run`, ADR-0005 as amended / ADR-0006).
- The control plane revalidates everything server-side; these schemas guide
  the model, they do not protect anything.

Tool names and shapes mirror the /agent/* interface (the ADR-0004 discipline:
bindings can swap, cognition must not).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from tools.registry import tool_error, tool_result

_TIMEOUT_SECONDS = 60


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


SEARCH_RECORDS_SCHEMA = {
    "name": "search_records",
    "description": (
        "Case-insensitive search over this workspace's existing records "
        "(display fields only; sensitive values are never returned). Use it to "
        "find the record an update refers to before proposing. Returns up to "
        "20 matches with their record ids."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Name or text to match"},
        },
        "required": ["query"],
    },
}


def _handle_search_records(args: dict, **_kw) -> str:
    query = str(args.get("query") or "").strip()
    if not query:
        return tool_error("query is required")
    status, payload = _call("GET", "/agent/records?query=" + urllib.parse.quote(query))
    if status != 200:
        return _problem(status, payload)
    return tool_result(payload)


GET_RECORD_SCHEMA = {
    "name": "get_record",
    "description": (
        "Fetch one record by id for a before/after comparison. Sensitive field "
        "values are redacted; everything else is current state."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "recordId": {"type": "string", "description": "A record id from search_records"},
        },
        "required": ["recordId"],
    },
}


def _handle_get_record(args: dict, **_kw) -> str:
    record_id = str(args.get("recordId") or "").strip()
    if not record_id:
        return tool_error("recordId is required")
    status, payload = _call("GET", "/agent/records/" + urllib.parse.quote(record_id))
    if status != 200:
        return _problem(status, payload)
    return tool_result(payload)


SUBMIT_PROPOSAL_SCHEMA = {
    "name": "submit_proposal",
    "description": (
        "The terminal action of a successful task. Submits your proposed record "
        "changes; the control plane validates them against the contract and "
        "HOLDS them for human review — nothing is applied directly. If "
        "validation fails, fix the changes and submit again, or finish without "
        "submitting and say why."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "taskId": {
                "type": "string",
                "description": "The task id from your instructions; you cannot invent one",
            },
            "changes": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "properties": {
                        "objectApiName": {"type": "string"},
                        "op": {"type": "string", "enum": ["create", "update"]},
                        "recordId": {
                            "type": "string",
                            "description": "Required for update, forbidden for create",
                        },
                        "values": {
                            "type": "object",
                            "description": "field apiName -> proposed value, agent-editable fields only",
                        },
                        "rationale": {"type": "string"},
                    },
                    "required": ["objectApiName", "op", "values"],
                },
            },
            "notes": {"type": "string"},
            "uncertain": {
                "type": "boolean",
                "description": "Set true when a match or value is a guess a human should look at closely",
            },
        },
        "required": ["taskId", "changes"],
    },
}


def _handle_submit_proposal(args: dict, **_kw) -> str:
    task_id = str(args.get("taskId") or "").strip()
    changes = args.get("changes")
    if not task_id:
        return tool_error("taskId is required")
    if not isinstance(changes, list) or not changes:
        return tool_error("changes must be a non-empty array")
    body = {"taskId": task_id, "changes": changes}
    if args.get("notes"):
        body["notes"] = str(args["notes"])
    if args.get("uncertain") is not None:
        body["uncertain"] = bool(args["uncertain"])
    status, payload = _call("POST", "/agent/proposals", body)
    if status != 200:
        return _problem(status, payload)
    return tool_result(payload)


_TOOLS = (
    ("search_records", SEARCH_RECORDS_SCHEMA, _handle_search_records, "🔎"),
    ("get_record", GET_RECORD_SCHEMA, _handle_get_record, "📇"),
    ("submit_proposal", SUBMIT_PROPOSAL_SCHEMA, _handle_submit_proposal, "📮"),
)


def register(ctx) -> None:
    """Register the operations toolset. Called once by the plugin loader."""
    for name, schema, handler, emoji in _TOOLS:
        ctx.register_tool(
            name=name,
            toolset="cormac_ops",
            schema=schema,
            handler=handler,
            check_fn=_available,
            requires_env=["CORMAC_CONTROL_PLANE_URL", "CORMAC_AGENT_TOKEN"],
            emoji=emoji,
        )
