# Security Overview

Status: drafted
Maps to: control-register rows 1-13
Last reviewed: 2026-06-06

A plain-language summary of how the platform protects client data. The detail and the proof live in the linked documents and in [control-register.md](control-register.md).

## What the product is

A multi-tenant CRM agent. Each client brings the spreadsheets their business runs on; the system lifts each workbook into a governed, versioned contract and operates on it through an agent reachable over web, SMS, email, Excel, and Claude/MCP. Business objects are defined by each client's contract, not hard-coded, so the system is data-agnostic and the same controls apply to whatever a client stores.

## The security model in five sentences

1. Every surface (web, SMS, email, Excel, Claude/MCP) is untrusted input; none writes business data directly.
2. One backend, the control plane, owns all authority: it verifies identity, enforces roles, validates every change against the client's contract, and is the only thing that writes.
3. The AI runtime proposes changes; it holds no database credentials and cannot apply anything itself.
4. Every write is held for approval or applied-then-reported per the client's choice, and every write is recorded in an append-only audit trail with before/after values and a link to the message that caused it.
5. Tenant data is isolated at the database by row-level security, so even a software mistake cannot cross workspaces.

## Why this passes scrutiny

The hard question about an AI that proposes writes is how it is prevented from making them unsafely. The answer is structural, not hopeful: the runtime literally cannot write (no credentials), its output is validated against the contract before anything is held, and the field-level `editableByAgent` and `sensitive` flags are enforced in code. See [agent-runtime-security.md](agent-runtime-security.md).

## Scope and posture

The early market is deliberately financial-adjacent SMBs (real estate, private lenders, brokers, family offices), not formally-regulated institutions (ADR-016). That keeps the compliance bar at a private-pilot packet plus enforced baseline controls. SOC 2 is designed-for, staged behind buyer demand, not promised. See [data-classification-and-handling.md](data-classification-and-handling.md).
