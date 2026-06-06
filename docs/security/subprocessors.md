# Subprocessors

Status: drafted
Maps to: data-flow.md, ai-data-handling.md
Last reviewed: 2026-06-06

Third parties that may process client data, and what each requires in the packet. Confirm DPAs and data-residency choices before a pilot.

| Subprocessor | Role | Data it sees | Packet needs |
| --- | --- | --- | --- |
| Supabase | Managed Postgres, Auth, Storage | All business + operational data | DPA; region choice; SOC 2 report; backup/restore ownership |
| Anthropic (Claude) | Model inference | Message + contract + minimized, non-sensitive context | DPA; no-training-on-API-data terms; retention window; see [ai-data-handling.md](ai-data-handling.md) |
| Twilio | SMS (when enabled) | Phone numbers, message content | DPA; A2P 10DLC registration; consent/opt-out; see [sms-compliance.md](sms-compliance.md) |
| Microsoft (Entra, Graph) | Identity + Microsoft 365 (when enabled) | Sign-in identity; selected files/mail per scope | DPA; least-privilege scopes; see [microsoft-permissions.md](microsoft-permissions.md) |
| Juno | Orchestration/hosting (prototype) | Hosts containers; platform-level access | Shared-responsibility split; see [platform-hosting.md](platform-hosting.md) |
| Email provider (TBD) | Outbound mail (reports, invites) | Recipient addresses, message content | Provider selection; DPA; SPF/DKIM/DMARC |
| Compliance tooling (optional) | SOC 2 evidence (if pursued) | Read access to systems | Only if a buyer requires certification |

## Notes

- The list is enabled-feature-dependent: a Level-0 deployment (no Microsoft, no SMS) has a much shorter subprocessor list. Keep this table accurate per tenant configuration.
- Anthropic, Twilio, Microsoft, and the email provider only receive data when their surface is enabled.
- The DPA, privacy policy, and terms that reference these subprocessors are blocked on the legal entity (ADR-001); see [dpa.md](dpa.md).
