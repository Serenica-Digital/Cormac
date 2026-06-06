# Microsoft Graph Permissions

Status: stub (pending Graph connector, ADR-012)
Maps to: control-register row 15
Last reviewed: 2026-06-06

Blocked on: building the Microsoft connector beyond login.

## Intended content

- The multi-tenant Entra app registration and its publisher-verification status.
- A per-feature permission inventory mapping each Graph scope to the feature that needs it, with a least-privilege justification for each.
- The consent model: delegated (acting as the signed-in user) preferred; application permissions only where truly required.
- The tiered connector levels (ADR-012): Level 0 (no Microsoft) is fully functional; each higher level adds narrow, consented scope.

## Principles already decided (ADR-012)

- The base product needs zero Graph consent and degrades gracefully.
- Login is not Graph consent; Graph is a separate, incremental step.
- Prefer delegated over application permissions.

## To make this real

Build the first Graph feature (likely the file picker, Level 2), record the exact scopes requested and why, complete publisher verification, and flip control-register row 15.
