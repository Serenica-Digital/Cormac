# Competitive Market Research: Contract-First CRM Agent Platform
## Decision Document — June 2026

---

## 1. Verdict Up Front

**Do the two differentiation claims hold?**

**Claim 1 — Governed agent writes.** *Partially holds, but the window is narrowing.* No competitor shipping today combines a proposal-confirmation-audit pipeline for AI writes as the core product at SMB price points. However, Salesforce Agentforce now ships an "Einstein Trust Layer" with audit trails, scope controls, and zero-data-retention guarantees — the first major platform to approach governed writes at the infrastructure level. The crucial qualifier: Agentforce starts at $2/conversation or $550/user/month, pricing it far above the target client. Among sub-$500/month tools, AI writes remain either fire-and-forget (Phoenix Rising AI Carmen, Structurely, kvCORE Alex) or human-gated with no formal governance layer. The claim holds in the target market segment, but it is a feature gap incumbents are actively closing, not a structural moat.

**Claim 2 — Meet them in their spreadsheets (schema-from-workbook).** *Holds strongly.* No competitor ingests a client's existing Excel workbook as the schema source for a live, governed CRM surface. Attio offers flexible custom objects. Airtable supports arbitrary table schemas. Microsoft Copilot now edits Excel with highlighted changes and plan-mode transparency. But none of them lift an existing workbook into a semantic contract that governs an AI agent. This is the more defensible claim.

**The three most dangerous competitors:**

1. **Microsoft Copilot + Excel + Power Platform.** Not because it replicates the product today, but because the target client already pays for Microsoft 365. Copilot Business at $21/user/month (on top of existing M365) now provides "Edit with Copilot" in Excel with change highlighting, step-by-step reasoning, and Python-powered analysis. The May 2026 update added federated MCP connectors (HubSpot, Notion, others) pulling live data into Copilot at prompt time. The trajectory points toward "text your spreadsheet an update" becoming native. It lacks SMS capture, a governed write pipeline, and CRM-agent semantics — but the default-stack advantage is overwhelming for the target buyer.

2. **Salesforce Agentforce.** The only platform with a governed AI write path backed by an enterprise trust layer, audit trail, and rollback. Pricing ($25/user base + Agentforce add-ons) puts it far above the $40/seat threshold and implementation costs ($25K–$75K) are disqualifying for 10–50-person firms. But it sets the standard for what "governed writes" means in the market, and Salesforce's acquisition of Qualified (announced December 2025) signals intent to push Agentforce down-market through Piper's inbound SDR model.

3. **Follow Up Boss + AI agent layer (Structurely, custom AI, or forthcoming native AI).** Follow Up Boss is the default CRM for the real-estate design partner's peer group ($69/user/month), with 200+ integrations and a mature API. Its 2025 AI launch added draft replies and scoring. Combined with Structurely ($179–$499/month for AI texting/ISA), this stack covers lead capture, SMS engagement, and CRM management for ~$100–$150/user/month total. It lacks governed writes and schema flexibility, but it's the stack the target buyer is most likely evaluating right now.

**Single biggest threat to the thesis:** Microsoft gets there by default. The target clients already run on Excel + Outlook + SharePoint. They don't need to buy anything new — they need Copilot turned on (which their M365 subscription increasingly includes). Every quarter, Copilot's Excel editing gets more transparent, more auditable, and more connected to external data. The product must demonstrate value that Copilot structurally cannot provide: multi-channel SMS/email capture → governed writes against a client-defined contract → audit trail — within 12 months, before Microsoft's trajectory closes the gap from the spreadsheet side.

---

## 2. Positioning Map

**Axes:** Write-governance depth (X) × Spreadsheet-nativeness (Y)

```
                        SCHEMA-FROM-WORKBOOK
                              ▲
                              │
                              │  ★ OUR PRODUCT
                              │
                  LIVE SYNC   │
                              │         Copilot+Excel ●
                              │
               IMPORT/EXPORT  │
                              │  Airtable ●      Smartsheet ●
                              │     Clay ●
                              │  Folk ●   Attio ●
                       NONE   │
                              │ Carmen●  Structurely●  FUB●  Lofty●  kvCORE●
                              │    Conversica●  Piper●
                              │         Agentforce ●
                              │
     ──────────────────────────┼──────────────────────────────────────►
   READ-ONLY          HUMAN-GATED     GOVERNED         UNGATED
                      WRITES          PIPELINE         AUTO-WRITE
                                                
```

**Key observations:** The upper-right quadrant (governed pipeline + schema-from-workbook) is empty except for our product. Agentforce sits at the governed-pipeline position but with zero spreadsheet nativeness. Carmen and Structurely sit at ungated auto-write with no spreadsheet story. Copilot+Excel has strong spreadsheet nativeness but no CRM write path or governance pipeline. The positioning is defensible — but the quadrant is empty partly because no one has proven buyers will pay to be there.

---

## 3. Ring-by-Ring Profiles

### Ring 1 — AI Agents Over Messaging That Write to CRMs

#### Phoenix Rising AI "Carmen"
| Dimension | Assessment |
|---|---|
| **Write path** | Ungated auto-write. Carmen writes lead statuses and conversation notes to CRM in real time. No mention of proposal, confirmation, or rollback anywhere in public materials. **Verified:** phoenixrisingai.com |
| **Schema model** | Writes into existing dealer CRM (DealerSocket, VinSolutions, etc.). Fixed integration schema. No client-defined objects. **Inferred** from product positioning. |
| **Excel story** | None. |
| **Messaging** | Phone (voice), SMS, email — all first-class. Sub-60-second lead response. Multi-modal continuity across channels. **Verified:** phoenixrisingai.com |
| **Pricing** | Not published. Custom enterprise pricing, likely $1,000+/month based on scope (voice + video + CRM integration). **Unknown** — requires sales call. |
| **Target segment** | Automotive dealerships with high-ticket inventory. Not currently serving real estate, lending, or professional services. **Verified:** phoenixrisingai.com |
| **Compliance** | No SOC 2 or audit features mentioned publicly. "Harmony" supervisory layer monitors for dropped calls and sentiment but is operational, not compliance-oriented. **Verified:** phoenixrisingai.com |
| **Traction** | Small team, R&D lab positioning. No G2/Capterra reviews found. No disclosed funding rounds. LinkedIn company page exists but no employee count visible. **Verified:** linkedin.com/company/phoenix-rising-ai-llc |
| **User complaints** | No public review corpus available. |

#### Salesforce Agentforce SDR
| Dimension | Assessment |
|---|---|
| **Write path** | Governed writes with the Einstein Trust Layer: scope controls, zero data retention, toxicity detection, audit trail for governance review. HIPAA and GDPR compliance. Guardrails prevent agents from acting outside defined scope. **Verified:** ekfrazo.com, salesforce.com/agentforce |
| **Schema model** | Full Salesforce data model — custom objects, custom fields, relationships. Extremely flexible but requires Salesforce setup expertise and admin. Not workbook-derived. **Verified** |
| **Excel story** | Import/export via Data Loader. No live Excel surface. |
| **Messaging** | Email engagement, CRM-triggered outreach. No native SMS or voice for SMB use cases. Requires integration partners. **Verified:** prospeo.io/s/ai-sdr-salesforce |
| **Pricing** | Flex Credits at $500/100K credits (~$0.10/standard action), or $2/conversation, or $550/user/month for Agentforce 1 (includes 1M credits). Base Sales Cloud license required ($25–$350/user/month). Implementation: $25K–$75K mid-market. **Verified:** salesforce.com/agentforce/pricing, April 2026 |
| **Target segment** | Enterprise and upper mid-market. 50+ users minimum in practice. Not viable for 10-person non-tech firms. **Verified** |
| **Compliance** | SOC 2, HIPAA, GDPR. Einstein Trust Layer is non-optional infrastructure. **Verified** |
| **Traction** | Salesforce's core AI strategy. Acquiring Qualified (Dec 2025) to push Agentforce down-market. Dominant market position. **Verified:** captiwate.com |
| **User complaints** | Implementation complexity, unpredictable usage-based billing, requires dedicated admin. **Verified:** multiple reviews |

#### Qualified "Piper"
| Dimension | Assessment |
|---|---|
| **Write path** | Reads from and writes to Salesforce (lead status, activity logging, routing). Human-handoff model — escalates to human reps. Not autonomous CRM writes in the Phoenix Rising sense; more CRM reads + meeting booking + activity logging. **Verified:** g2.com, qualified.com |
| **Schema model** | Salesforce-dependent. Works with Salesforce's schema. No independent data model. **Verified** |
| **Excel story** | None. |
| **Messaging** | Website chat (primary), email follow-up, video conversations. No SMS, no voice dialer. Inbound-only. **Verified:** syncgtm.com/blog/qualified-review |
| **Pricing** | $40,000–$68,000/year. Custom pricing, no published list. Being acquired by Salesforce. **Verified:** marketbetter.ai, syncgtm.com |
| **Target segment** | Enterprise B2B SaaS on Salesforce. Not SMB, not real estate, not non-tech. **Verified** |
| **Compliance** | SOC 2 Type II, GDPR compliant. **Verified:** theaiagentindex.com |
| **Traction** | 1,487 G2 reviews at 4.9/5, #1 AI SDR on G2. 500+ companies use Piper. **Verified:** g2.com |
| **User complaints** | Salesforce dependency, enterprise pricing inaccessible to SMBs, inbound-only (no outbound). **Verified:** multiple sources |

#### Conversica
| Dimension | Assessment |
|---|---|
| **Write path** | Auto-writes to CRM (Salesforce, HubSpot, Marketo). Lead status, conversation history, handoff data sync automatically. More governable and traceable than most peers per independent comparison. **Verified:** enginy.ai/blog/11x-vs-conversica |
| **Schema model** | Integrates with target CRM's schema. No independent data model. |
| **Excel story** | None. |
| **Messaging** | Email (primary), SMS (added later), web chat. No phone dialer. Email-first platform. **Verified:** marketbetter.ai/blog/conversica-review-2026 |
| **Pricing** | Starts at $2,999/company/month. Enterprise-only. **Verified:** salesrobot.co |
| **Target segment** | Large B2B enterprises with complex sales processes and high lead volumes. **Verified** |
| **Compliance** | Enterprise-grade. Specific certifications not prominently published. **Inferred** |
| **Traction** | Founded 2007, established player. Multi-language support. **Verified** |
| **User complaints** | Weeks-to-months setup time, email-first limitations, reporting depth insufficient, expensive for what it does in 2026 vs newer alternatives. **Verified:** marketbetter.ai |

#### Structurely (Aisa Holmes)
| Dimension | Assessment |
|---|---|
| **Write path** | AI engages leads via SMS/email/chat, qualifies them, hands off to humans. Writes conversation notes and qualification data to CRM. Fire-and-forget writes — no proposal, confirmation, or audit pipeline mentioned. **Inferred** from feature descriptions |
| **Schema model** | Plugs into existing CRM schema (Follow Up Boss, kvCORE, Sierra). No independent schema. **Verified** |
| **Excel story** | None. |
| **Messaging** | SMS (primary), email, web chat, voice (newer). Under-60-second response. 12+ month nurture capability. **Verified:** retellai.com, v7labs.com |
| **Pricing** | Starter $179/month (1 seat, 50 leads), Growth $299/month (10 seats, 125 leads), Build $499/month (30 seats, 225 leads). Also per-lead pricing at ~$3/lead. **Verified:** v7labs.com |
| **Target segment** | Real estate teams and brokerages. Also mortgage/lending. **Verified** |
| **Compliance** | Not prominently published. **Unknown** |
| **Traction** | Claims 233% conversion lift. Integrated with major real estate CRMs. Multiple mentions in 2026 best-of lists. **Verified** |
| **User complaints** | Additional cost on top of CRM subscription, requires integration setup. **Inferred** from pricing structure |

---

### Ring 2 — AI-Native CRMs

#### Attio
| Dimension | Assessment |
|---|---|
| **Write path** | AI Attributes auto-fill fields using AI (summarize company, classify ICP tier). Automation workflows with branching logic. No autonomous agent that accepts natural-language messages and writes records. Human-initiated AI, not agent-initiated. **Verified:** syncgtm.com/blog/attio-review |
| **Schema model** | Custom objects, custom attributes, relationship types. Flexible relational data model — closest to "arbitrary schema" in Ring 2. But schema is configured in-app, not ingested from a workbook. **Verified:** multiple sources |
| **Excel story** | CSV import. No live Excel sync or native spreadsheet surface. **Verified** |
| **Messaging** | Email sync (Gmail, Outlook). No SMS in/out. No voice. **Verified** |
| **Pricing** | Free (3 users), Plus $29/user/month, Pro $69/user/month, Enterprise $119/user/month. All billed annually. Sub-$40 on Plus tier. **Verified:** attio.com, multiple sources |
| **Target segment** | PLG tech startups, growth-stage SaaS, modern GTM teams. Not non-tech SMBs. G2 reviewer demographics skew tech/SaaS. **Verified** |
| **Compliance** | SOC 2 on Enterprise tier only. **Verified:** coffee.ai |
| **Traction** | Growing rapidly. Multiple "next-gen CRM" mentions. Competitive with HubSpot for startup segment. **Verified** |
| **User complaints** | Limited native integrations (requires APIs/external platforms), still depends on manual data entry despite AI features, no built-in outbound tools, young platform. **Verified:** stacksync.com, coffee.ai |

#### Day.ai
| Dimension | Assessment |
|---|---|
| **Write path** | AI auto-logs interactions from emails and meetings, identifies pricing details and decision timelines, updates opportunity stages, suggests follow-ups. More autonomous than Attio's AI Attributes but still centered on meeting/email capture rather than accepting freeform messages and writing governed records. **Verified:** webpronews.com |
| **Schema model** | AI populates CRM from unstructured data (emails, transcripts). Not client-defined schema from workbook. **Inferred** |
| **Excel story** | None mentioned. |
| **Messaging** | Email and calendar sync (Google Workspace, Microsoft 365). Meeting join + transcribe. No SMS, no voice. **Verified** |
| **Pricing** | $30+/user/month. Hybrid seat + usage credits model. **Verified:** coffee.ai |
| **Target segment** | Startup/growth-stage teams. $20M Sequoia Series A (Feb 2025). **Verified:** webpronews.com |
| **Compliance** | Not prominently published. Early stage. **Unknown** |
| **Traction** | Sequoia-backed. 1.5-hour onboarding. Still early — captures ~70% of unstructured data effectively per testing. **Verified:** coffee.ai |
| **User complaints** | Creates data silos, integration gaps for complex tech stacks, teams still spend more time maintaining records than gaining insights. **Verified:** coffee.ai |

#### Folk
| Dimension | Assessment |
|---|---|
| **Write path** | Magic Fields (AI auto-population of columns), AI Assistants for drafting. No autonomous agent. Human-driven with AI acceleration. **Verified:** efficient.app |
| **Schema model** | Custom objects on Premium tier ($48/user/month). Standard tier is contacts + companies + deals with custom fields. Not workbook-derived. **Verified:** multiple sources |
| **Excel story** | CSV import. Spreadsheet-inspired UI. No live Excel sync. **Verified** |
| **Messaging** | Email campaigns, email sequences (Premium). No SMS. No voice. **Verified** |
| **Pricing** | Standard $24/user/month, Premium $48/user/month, Custom from $80/user/month. Annual billing. **Verified:** folk.app, comparedge.com |
| **Target segment** | Founders, agencies, VC firms, small revenue teams. Series A and below, <20 users. **Verified:** toolchase.com |
| **Compliance** | Not prominently published. **Unknown** |
| **Traction** | 280 G2 reviews at 5/5. High satisfaction, fast setup (~20 minutes). **Verified:** syncgtm.com |
| **User complaints** | No mobile app, limited integrations without Zapier, email sequences locked behind Premium, no enrichment or buying signals on lower tiers. **Verified:** multiple sources |

#### Clay
| Dimension | Assessment |
|---|---|
| **Write path** | Not a CRM. Enrichment + GTM workflow platform. CRM sync (Salesforce, HubSpot) pushes enriched data. No agent that accepts messages. **Verified:** lindy.ai, multiple sources |
| **Schema model** | Spreadsheet-like UI with custom columns. Flexible data model for enrichment workflows. Not CRM schema. **Verified** |
| **Excel story** | Spreadsheet-like interface is the core product metaphor. CSV import/export. But not a live Excel surface. **Verified** |
| **Messaging** | No messaging capabilities. Pre-outreach data enrichment tool. **Verified** |
| **Pricing** | Free tier, Starter $149/month, Growth $495/month, Enterprise custom. Credit-based. New pricing model (Launch/Growth/Enterprise) as of April 2026. **Verified:** warmly.ai, multiple sources |
| **Target segment** | Revenue operations teams, outbound-heavy B2B sales orgs. Technical users comfortable with complex data workflows. **Verified** |
| **Compliance** | Not prominently published. **Unknown** |
| **Traction** | Well-established in GTM tooling space. Steep learning curve widely noted. **Verified** |
| **User complaints** | Steep learning curve (weeks to fully understand), unpredictable credit costs, not intuitive, requires advanced RevOps skills. **Verified:** warmly.ai, multiple G2 reviews |

---

### Ring 3 — Spreadsheet-Native Platforms with AI Layers

#### Airtable
| Dimension | Assessment |
|---|---|
| **Write path** | AI Fields auto-populate per-record using AI. Superagent (newer) allows natural-language interactions within a base — can create and update records. But operates only inside Airtable, cannot cross bases or reach external systems. No governed write pipeline. **Verified:** cotera.co |
| **Schema model** | Fully custom tables, fields, linked records. Client defines schema entirely. Closest to "arbitrary schema" in Ring 3. But schema is built in Airtable UI, not ingested from an existing workbook. **Verified** |
| **Excel story** | CSV import/export. Views (grid, kanban, calendar, gallery). Spreadsheet-adjacent but not an actual Excel surface. No live Excel sync. **Verified** |
| **Messaging** | No SMS, no email ingestion, no voice. Automations can trigger Slack/email notifications but no conversational capture. **Verified** |
| **Pricing** | Free (5 editors, 1,000 records), Team $20/seat/month, Business $45/seat/month, Enterprise custom. Annual billing. **Verified:** multiple sources, March 2026 |
| **Target segment** | Broad: startups to enterprises. 450,000+ organizations. Tech-comfortable teams. Not primarily CRM buyers. **Verified** |
| **Compliance** | SOC 2 on Enterprise. HIPAA available. **Verified** |
| **Traction** | Massive installed base. 6,000+ integrations via Zapier/Make. HyperDB for million-record bases. **Verified:** ai-cmo.net |
| **User complaints** | High per-seat costs for large teams, steep learning curve for non-technical users ("database logic" vs spreadsheet thinking), record limit constraints (50K on Team), mobile limitations, automation runs burn fast. **Verified:** multiple sources |

**Buyer objection answered:** "Why not just use Airtable?" — Airtable gives you a custom schema, but no SMS/email capture, no AI agent that interprets natural-language updates, no governed write pipeline, and no way to hand back a constrained Excel surface. You'd need to bolt on an SMS gateway, build a custom AI integration, and train users away from Excel. By the time you've assembled that stack, you've rebuilt the product at higher cost.

#### Smartsheet
| Dimension | Assessment |
|---|---|
| **Write path** | Smart Flows: natural-language automation creation. Smart Agents: automated risk monitoring. AI writes formulas from natural-language descriptions. No CRM-style record writes from conversational input. **Verified:** aiproductivity.ai |
| **Schema model** | Spreadsheet-based: sheets with columns, rows, formulas. More structured than Excel but less flexible than Airtable for relational data. No custom objects or CRM semantics. **Verified** |
| **Excel story** | Spreadsheet-native interface. CSV/Excel import. Grid view is the primary interaction mode. But not an actual Excel file — proprietary sheet format. **Verified** |
| **Messaging** | No SMS, no email ingestion, no voice. Notification-only integrations. **Verified** |
| **Pricing** | Free (1 user, 2 sheets), Pro $9/user/month (max 10 users), Business $32/user/month (annual). Enterprise custom. **Verified:** automationatlas.io, March 2026 |
| **Target segment** | Enterprise project management, IT, construction, operations. 85% of Fortune 500. Not CRM or SMB relationship-management focused. **Verified** |
| **Compliance** | SOC 2, HIPAA, FedRAMP, GDPR. Enterprise-grade. **Verified** |
| **Traction** | 21,421 G2 reviews at 4.4/5. Dominant in PM/work management. **Verified** |
| **User complaints** | Limited CRM functionality, not designed for relationship management, UI can feel enterprise-heavy for small teams. **Inferred** |

#### Microsoft Copilot + Excel + Power Platform
| Dimension | Assessment |
|---|---|
| **Write path** | Edit with Copilot (March 2026): AI makes spreadsheet edits with change highlighting on the grid, green tab indicators for modified sheets, step-by-step reasoning. Plan mode (May 2026 Frontier preview) makes edits transparent before they apply. This is the closest thing to "governed writes in a spreadsheet" from a major platform. But it's spreadsheet-edit governance, not CRM-agent governance — no proposal/confirmation flow, no policy-based write controls, no multi-user audit trail. **Verified:** techcommunity.microsoft.com, April 2026 |
| **Schema model** | Whatever the user has in their workbook. Excel is inherently user-defined schema. But no concept of semantic contracts, identity rules, field-level AI write permissions, or versioned schema governance. **Verified** |
| **Excel story** | This IS Excel. Native. The target client's existing workbooks are already here. **Verified** |
| **Messaging** | No SMS capture. Outlook email is adjacent but not integrated as a CRM capture channel. Teams chat exists but is not a lead-capture surface. Power Automate can trigger from email but requires technical setup. Copilot Cowork (agentic capability, GA April 2026) can turn goals into multi-step plans across apps but is oriented toward internal productivity, not external client communication. **Verified:** techcommunity.microsoft.com, May 2026 |
| **Pricing** | Copilot Business: $21/user/month ($18/user promotional through June 2026) as add-on. Requires Microsoft 365 Business Standard ($12.50/user/month) or Premium ($22/user/month) as base. Total: $33.50–$43/user/month. For new customers: bundles from $22/user/month (Standard + Copilot). **Verified:** copilot-experts.com, Microsoft official, June 2026 |
| **Target segment** | Everyone with Microsoft 365 — which is essentially all of the target client base. 300 seats max on Business plans. **Verified** |
| **Compliance** | Microsoft's enterprise compliance stack: SOC 2, HIPAA, GDPR, FedRAMP, and dozens more. **Verified** |
| **Traction** | Ubiquitous. 53 updates in May 2026 alone. Federated MCP connectors bringing live data from HubSpot, Notion, and others. GPT-5.5 and Claude Opus 4.7 models now available in Excel Copilot. **Verified:** aguidetocloud.com, May 2026 |
| **User complaints** | Copilot redesign backlash (floating AI button), inconsistent quality of Excel edits, AI suggestions not always relevant, requires training/adoption for ROI, Python in Excel requires Enterprise. **Verified:** wincentral.com, windowsforum.com |

---

### Ring 4 — Vertical Real-Estate CRMs

#### Follow Up Boss
| Dimension | Assessment |
|---|---|
| **Write path** | Human-driven CRM with AI acceleration (launched 2025): AI drafts inbox replies, summarizes lead history, suggests next actions. Open API enables custom AI agents to write back via webhooks. Not autonomous AI writing — AI assists humans or passes through to agents for manual actions. **Verified:** layer3labs.io, keetechnology.com |
| **Schema model** | Fixed real-estate schema: contacts, deals, pipelines, action plans. Custom fields available but not custom objects. Cannot model arbitrary business entities. **Verified** |
| **Excel story** | CSV import/export. No live sync. No spreadsheet surface. **Verified** |
| **Messaging** | Built-in calling, texting, email. SMS is a first-class channel. 200+ lead source integrations. **Verified** |
| **Pricing** | Start $49/user/month (annual), Grow $69/user/month, Dominate $99/user/month, custom pricing for large teams. AI features included on higher tiers or as add-ons. **Verified:** g2.com, multiple sources |
| **Target segment** | Real estate agents and teams. 94% of Capterra reviewers are from small real estate businesses. Zillow-owned (acquired 2023). **Verified:** capterra.com |
| **Compliance** | Data firewalls for agent contacts (post-Zillow acquisition). No prominent SOC 2 publication. **Verified:** keetechnology.com |
| **Traction** | 115 G2 reviews at 4.6/5. 531 Capterra reviews at 4.6/5. 92% customer satisfaction. The default CRM for high-performing real estate teams. **Verified** |
| **User complaints** | Learning curve, Zillow ownership concerns about data independence, price increases with V2 launch, limited native AI (needs third-party add-ons for autonomous texting). **Verified:** inboundrem.com, keetechnology.com |

#### kvCORE / BoldTrail
| Dimension | Assessment |
|---|---|
| **Write path** | AI texting assistant "Alex" sends texts to leads autonomously, qualifies them, logs interactions. Behavioral AI adjusts campaign messaging. Writes are largely ungated — Alex texts without per-message human approval. No formal governance pipeline. **Verified:** layer3labs.io, ainora.lt |
| **Schema model** | Fixed real-estate schema. Contact, listing, and pipeline objects with some custom fields. Cannot model arbitrary business entities. **Verified** |
| **Excel story** | Import/export only. No live sync. **Verified** |
| **Messaging** | SMS (AI-driven), email, built-in dialer. Smart Number feature praised. **Verified** |
| **Pricing** | ~$499+/month for solo agents. Team minimums around $500/month. Not publicly listed — requires demo call. Annual contracts, aggressive sales tactics reported. **Verified:** theprotoolkit.com, realestatebees.com |
| **Target segment** | Brokerages and high-volume teams (Keller Williams, eXp, Century 21). Over-featured for solo agents doing <20 deals/year. **Verified:** aiandrealtors.com |
| **Compliance** | Not prominently published. **Unknown** |
| **Traction** | G2 reviews mixed. 562 reviews on GetApp. Parent company (Inside Real Estate) owns BoomTown, Brokermint. **Verified** |
| **User complaints** | "Technical glitches and slow processing times," unclear pricing, aggressive sales tactics, "customer response times can be improved," mobile app issues, duplicate texts from blast sends, "I don't see what kvcore is doing to solve any problems." **Verified:** realestatebees.com, g2.com, capterra.com |

#### Lofty (formerly Chime)
| Dimension | Assessment |
|---|---|
| **Write path** | AI assistant handles website chat and text, qualifies leads, books appointments 24/7. AI Copilot "can update CRM records in real-time." Smart Plans automate drip campaigns with AI-driven sequencing. Closer to autonomous CRM writes than FUB but no formal governance/proposal layer. **Verified:** agentadvice.com, hubspot.com |
| **Schema model** | Fixed real-estate schema. Contact, lead, pipeline. Custom fields but not custom objects. **Verified** |
| **Excel story** | None. No import/export highlighted. **Verified** |
| **Messaging** | SMS, email, multi-line dialer, unified inbox. AI assistant across chat and text. **Verified** |
| **Pricing** | From $449/month (Core). No free plan, no free trial. Premium and enterprise tiers higher. **Verified:** aiandrealtors.com |
| **Target segment** | Established agents and teams. All-in-one platform. Not budget-friendly for solo agents or small firms. **Verified** |
| **Compliance** | Not prominently published. **Unknown** |
| **Traction** | Rebranded from Chime in 2023. All-in-one positioning. Reviews on GetApp/SoftwareAdvice. **Verified** |
| **User complaints** | "Texting, group texting, my accounts don't sync well from computer to phone, which causes me to miss messages all the time." Steep price tag for what solo agents need. Learning curve for full feature set. **Verified:** softwareadvice.com, aiandrealtors.com |

#### Wise Agent
| Dimension | Assessment |
|---|---|
| **Write path** | GPT-3 chatbot for lead engagement. AI drafts emails and auto-responses. No autonomous CRM record writing. Human-driven with AI text generation assistance. **Verified:** realestatebees.com |
| **Schema model** | Fixed real-estate schema. Contacts, transactions, campaigns. No custom objects. **Verified** |
| **Excel story** | Data import/export. No live sync. **Verified** |
| **Messaging** | Email (up to 2,500/day), SMS (add-on at $11/month + $80 registration fee). No built-in dialer. **Verified:** prospeo.io |
| **Pricing** | $49/month flat for up to 5 team members (shared login). Annual $499/year. Extra logins $20/month each. **Verified:** prospeo.io |
| **Target segment** | Solo agents and small teams on tight budgets. Forbes "Best Real Estate CRM" 2022–2024. **Verified** |
| **Compliance** | GDPR-compliant, AWS-hosted with SSL. **Verified:** softwarefinder.com |
| **Traction** | 531 Capterra reviews at 4.6/5 (customer support). Two decades in market (founded 2002). **Verified** |
| **User complaints** | "Interface feels stuck in 2015," "AI features are basic drip campaigns with a chatbot bolted on," no mobile app, Forbes gave 3.7/5 across 31 metrics. **Verified:** prospeo.io |

#### Real Geeks
| Dimension | Assessment |
|---|---|
| **Write path** | Geek AI: smart auto-responses, AI lead scoring, AI-generated property descriptions. No autonomous agent writing CRM records from conversations. **Verified:** layer3labs.io |
| **Schema model** | Fixed real-estate schema. **Verified** |
| **Excel story** | None highlighted. **Verified** |
| **Messaging** | IDX website with lead capture. Basic communication tools. **Verified** |
| **Pricing** | Budget tier, approximately $400/month range for teams. **Verified:** layer3labs.io |
| **Target segment** | Solo agents and small teams under $400/month. **Verified** |
| **Compliance** | Not prominently published. **Unknown** |
| **Traction** | Frequently mentioned in budget-tier comparisons. **Verified** |
| **User complaints** | AI features not as deep as Lofty or kvCORE. Limited advanced functionality. **Inferred** from positioning |

---

## 4. Phoenix Rising AI Deep Profile

**Product:** Carmen — AI agent for automotive BDC (Business Development Center) and SDR functions.

**Scope:** Carmen handles inbound lead response under 60 seconds via phone, SMS, and email. She qualifies leads, books test drives and service appointments, delivers VIN-specific video content, and writes lead statuses and notes to the dealership's existing CRM. The "Harmony" layer acts as an AI supervisor, detecting dropped calls or frustrated sentiment and alerting humans. A companion product (Akishi) targets personal AI relationships, not business.

**Verticals:** Exclusively automotive as of June 2026. Engineered for "high-ticket inventory." No indication of real estate, lending, or professional services expansion. The technology (perpetual memory, multi-modal, sub-second S2S) could theoretically extend, but the product is deeply automotive in its language and integration assumptions.

**Pricing:** Not published. Sales-call required. Likely $1,000+/month given the scope (voice + video production + CRM integration + supervisory layer). **Unknown** — no public pricing page.

**Funding/Team:** Described as an "Autonomous Agent R&D Lab." No Crunchbase profile matching the correct entity (the Crunchbase result is a different Phoenix Rising USA doing lean consulting). LinkedIn company page exists. No disclosed funding rounds. Appears to be a small, bootstrapped team. **Verified/Inferred** from web presence.

**Write-path mechanics:** Carmen writes directly to existing CRM, updating lead statuses and conversation notes in real-time. The language is "writes directly" — no mention of proposals, confirmations, approvals, rollback, or audit trail. Harmony monitors for errors and bad outcomes but acts as a sentinel for conversation quality, not a write-governance layer. If Carmen incorrectly updates a lead status, there is no published mechanism to catch this before it hits the CRM.

**Gaps relative to our product:**
- **No governance pipeline.** Writes are fire-and-forget. No proposal → confirmation → audit flow.
- **No schema flexibility.** Writes into fixed dealership CRM schemas (DealerSocket, VinSolutions). Cannot model arbitrary business objects.
- **No spreadsheet story.** Zero Excel surface or workbook ingestion.
- **Vertical lock-in.** Automotive only. The video-factory feature (VIN-specific cinematic videos) is deeply automotive and not transferable.
- **No compliance posture.** No SOC 2, no audit features published.
- **No traction evidence.** No G2/Capterra reviews, no visible customer testimonials, no disclosed funding.

**Threat level:** Low for the specific target market (real estate, lending, investment firms). Phoenix Rising AI is a direct conceptual peer — AI agent that writes to CRM over messaging — but it serves a different vertical, has no governance, and shows limited market traction. It is useful as a positioning reference point rather than a competitive threat.

---

## 5. Adversarial Section: Attacking the Thesis

### Steelman #1: "Governed writes is a feature incumbents add in a quarter, not a moat."

**The argument:** The governance pipeline (propose → confirm → audit) is a product feature, not a structural advantage. Salesforce already has the Einstein Trust Layer with audit trails, scope controls, and rollback. HubSpot, Attio, and Day.ai are all investing in AI write automation. Once any one of them decides governed writes matter for SMBs, they can ship a proposal-confirmation flow in one product cycle. The governance layer doesn't require proprietary technology — it's middleware logic between the AI and the database. Any team with a Salesforce admin or a dev building on Attio's API could implement a similar pattern with prompt engineering and webhook logic.

**Supporting evidence:** Salesforce Agentforce's Einstein Trust Layer shipped as infrastructure, not a standalone product — it's baked into every Agentforce agent by default. This suggests Salesforce views governance as table stakes for AI agents, not a premium feature. The EU AI Act's Article 12 (full enforcement August 2, 2026) requires queryable records of AI-driven decisions, which will push every enterprise AI product toward governed write paths as a compliance mandate rather than a differentiator.

**Assessment:** This is the second-most dangerous argument. The governance pipeline is genuinely replicable. The defense is speed-to-market for the target segment: incumbents will build governance for enterprise first (Salesforce already has), then mid-market, then SMB — and the last mile (non-technical firms on Excel + Outlook) is the hardest for them to reach because their governance assumes a CRM admin exists. The product's advantage is governance designed for firms without a CRM admin, which buys 18–24 months before incumbents get there.

### Steelman #2: "Microsoft Copilot gets there by default and the target client already pays for it."

**The argument:** The target client (10–50-person real-estate shop, private lender, investment firm) already has Microsoft 365. They already use Excel, Outlook, and SharePoint. Copilot Business costs $21/user/month on top of what they already pay. As of April 2026, Copilot edits Excel with highlighted changes and plan-mode transparency. May 2026 added federated MCP connectors pulling live data from HubSpot and Notion into Copilot. The trajectory is clear: within 12–18 months, a user will be able to type into Outlook or Teams, "Dave confirmed the Maple St listing — update the tracker to under-contract and schedule Friday follow-up," and Copilot will update the Excel workbook through Power Automate. No new vendor, no new contract, no new login.

**Supporting evidence:** Copilot Business bundles for new M365 customers start at $22/user/month total (Standard + Copilot). Microsoft explicitly targets SMBs with up to 300 seats. The March 2026 Excel update was described as "one of the moments when spreadsheets stopped being static grids and started becoming active participants in the workflow." GPT-5.5 and Claude Opus 4.7 models are now available inside Excel Copilot — the AI capability is already frontier-grade.

**Assessment:** This is the MOST dangerous argument. Microsoft doesn't need to build a CRM agent platform — they need to make Excel smart enough that the target client never looks for one. The defense must be concrete and immediate: (1) Copilot has no SMS capture channel — it can't receive "just got out of a meeting with Dave" as a text and route it to the right workbook; (2) Copilot has no semantic contract — it doesn't know which fields AI may write or which require confirmation; (3) Copilot has no multi-tenant CRM semantics — identity resolution, alias management, deduplication, relationship graphs. But the question is whether the target client cares about those things enough to buy a new product, or whether "good enough inside Excel" wins.

### Steelman #3: "Small firms don't buy trust pipelines, they buy magic. The governance story wins IT reviews but loses deals."

**The argument:** A 15-person real-estate shop doesn't have an IT review process. They don't have a compliance officer. They don't audit AI changes. They want to text an AI and have things happen. The governed write pipeline — propose, confirm, audit — adds friction to a buyer who is fleeing friction. They left their CRM for Excel precisely because CRMs were too process-heavy. Pitching governance to this buyer is like selling seatbelts to someone who drives a motorcycle because they don't like being inside a car. Structurely and Carmen win deals because they're magic: text in, action out, no confirmation screens. The governance story resonates with enterprise buyers who have procurement, legal, and security teams — not with a real-estate broker who manages their business from text messages.

**Supporting evidence:** Structurely's "under 60 seconds" lead response is the pitch that converts real-estate teams. Phoenix Rising AI's entire positioning is "no apps, no downloads, just speak." The most common CRM complaint in Ring 4 reviews isn't "not enough governance" — it's "too complicated," "too many features I don't use," "interface stuck in 2015." Users want less process, not more.

**Assessment:** This is the third-most dangerous argument, but it may be the most operationally important. It directly impacts GTM messaging and product design. The defense: the confirmation policy must be configurable. "Confirm-each" mode for cautious users, "auto-apply with weekly report" for magic-seekers. The weekly report — a readable audit of what the AI did — is the bridge: it delivers magic daily and trust weekly. The pitch should lead with magic ("text the AI, things happen") and close with safety ("and here's your weekly report showing everything it did, so nothing slips through"). If the pitch leads with governance, this argument is correct and deals will be lost.

**Ranking:** Steelman #2 (Microsoft gets there by default) is the most dangerous because it's a distribution argument, not a feature argument. You can out-build a competitor; you cannot out-distribute Microsoft to users who already log in to Outlook every morning.

---

## 6. Pitch Ammunition

**Ring 1 — "Why not just use Carmen/Structurely/an AI SDR?"**
"Those tools fire-and-forget: the AI writes to your CRM and you hope it's right. When it's wrong — and it will be wrong — you find out when a deal falls apart. We propose every change, you confirm or auto-accept with a full audit trail, and your data stays in a workbook your team already knows how to read."

**Ring 2 — "Why not just use Attio/Day.ai/Folk?"**
"Those are CRMs for tech startups that already think in pipeline stages and opportunity objects. Your business runs on a spreadsheet with your own column names and your own rules. We start from your spreadsheet, not theirs."

**Ring 3 — "Why not just use Airtable?"**
"Airtable gives you a custom database, but no AI agent that listens to a text message, interprets it against your business rules, and updates the right record with a confirmation step. You'd need to bolt on an SMS gateway, build custom AI logic, and train your team off Excel. We hand back a live Excel surface."

**Ring 3 — "Why not just use Copilot in Excel?"**
"Copilot can edit your spreadsheet when you're sitting at your computer. We catch the update from a text you send while walking out of a meeting — 'Dave's ready on Maple St, bump it to under-contract, follow-up Friday' — validate it against your business rules, and either apply it or ask you to confirm. Copilot is your desktop assistant; we're your field assistant."

**Ring 4 — "Why not just use Follow Up Boss?"**
"Follow Up Boss is a great CRM if you're willing to switch out of your spreadsheets. But your business already runs on workbooks that track deals, contacts, and pipeline in your own way. We keep your workbooks live and add an AI that understands them. No migration, no retraining, no losing your formulas."

**Ring 4 — "Why not just use kvCORE?"**
"kvCORE costs $499/month, takes months to configure, and users complain about glitches and slow processing. Their AI texts leads without asking you first. We cost under $40/seat, start from your existing spreadsheets, and every AI change comes through a trust pipeline."

---

## 7. Source Log

| URL | Note |
|---|---|
| phoenixrisingai.com | Phoenix Rising AI homepage — Carmen product details, architecture, team claims |
| linkedin.com/company/phoenix-rising-ai-llc | Phoenix Rising AI LinkedIn — company existence verification |
| dashly.io/blog/ai-sdr | AI SDR market overview, Structurely/Conversica/11x positioning |
| saleshandy.com/blog/ai-sdr-tools | AI SDR tools comparison 2026 |
| aircall.io/blog/ai-sdr-tools | Voice AI SDR landscape, CRM sync details |
| retellai.com/blog/best-ai-tools-real-estate-agents | Structurely pricing/features, real estate AI tools |
| v7labs.com/blog/best-ai-tools-for-real-estate | Structurely pricing tiers confirmed |
| salesforge.ai/directory/sales-tools/attio | Attio feature overview and pricing |
| stacksync.com/blog/attio-crm-2025-review | Attio integration gaps |
| coffee.ai/articles/attio-crm-pricing-vs-coffee | Attio pricing details, SOC 2 Enterprise-only |
| marketbetter.ai/blog/attio-crm-pricing-breakdown-2026 | Attio pricing tiers verified |
| syncgtm.com/blog/attio-review | Attio AI Attributes description |
| webpronews.com/day-ai-secures-20m-series-a | Day.ai $20M Sequoia funding, product description |
| coffee.ai/articles/day-ai-crm-reviews-2026 | Day.ai hands-on testing results |
| toolchase.com/blog/folk-crm-review-2026 | Folk CRM comprehensive review |
| syncgtm.com/blog/folk-crm-review | Folk pricing, G2 rating, features |
| efficient.app/apps/folk | Folk Magic Fields AI description |
| comparedge.com/tools/folk/pricing | Folk pricing tiers verified May 2026 |
| lindy.ai/blog/clay-review | Clay positioning as not-a-CRM |
| warmly.ai/p/blog/clay-pricing | Clay pricing details and credit model |
| salesforge.ai/blog/clay-pricing | Clay 2026 pricing changes |
| cotera.co/articles/airtable-ai-agent-guide | Airtable Superagent limitations, AI field per-record |
| ai-cmo.net/tools/airtable | Airtable 2026 feature recap, HyperDB, pricing |
| business-automated.com/tutorials/airtable-pricing-explained | Airtable pricing all tiers |
| saaspricepulse.com/blog/airtable-free-plan-limits-2026 | Airtable free plan limits, pricing history |
| techcommunity.microsoft.com/blog/excelblog/whats-new-in-excel-april-2026 | Edit with Copilot, Python, change highlighting |
| techcommunity.microsoft.com/blog/microsoft365copilotblog/whats-new-april-2026 | Copilot April 2026 updates |
| aguidetocloud.com/blog/microsoft-365-copilot-may-2026-updates | 53 Copilot updates May 2026, MCP connectors |
| windowsforum.com/threads/excel-march-2026-update | Excel March 2026 Work IQ analysis |
| copilot-experts.com/microsoft-copilot-pricing-guide | Copilot pricing all tiers verified |
| copilot-experts.com/microsoft-copilot-cost-per-user | Copilot Business $18-21/user/mo |
| copilot-experts.com/microsoft-copilot-pricing-for-small-business | SMB promotional pricing details |
| layer3labs.io/guides/ai-real-estate-crm | Real estate CRM comparison with pricing |
| reaistack.com/compare/follow-up-boss-vs-kvcore | FUB vs kvCORE feature comparison |
| aiandrealtors.com/review-kvcore | kvCORE/BoldTrail detailed review |
| theprotoolkit.com/boldtrail-review-2026 | BoldTrail $499/month pricing confirmed |
| realestatebees.com/software/kvcore | kvCORE complaints compiled |
| g2.com/products/boldtrail/reviews | BoldTrail G2 reviews, user complaints |
| capterra.com/p/176447/BoldTrail/reviews | BoldTrail Capterra reviews |
| agentadvice.com/lofty-review | Lofty feature deep-dive |
| aiandrealtors.com/review-lofty | Lofty pricing, rating, AI features |
| hubspot.com/sales/ai-crm-real-estate | Lofty CRM features summary |
| inboundrem.com/follow-up-boss-pros-and-cons | FUB review corpus analysis |
| keetechnology.com/blog/follow-up-boss-reviews-2026 | FUB 2026 review with Zillow acquisition context |
| g2.com/sellers/follow-up-boss | FUB G2 reviews (115 at 4.6) |
| capterra.com/p/130020/Follow-Up-Boss | FUB Capterra data |
| prospeo.io/s/wise-agent-pricing-reviews-pros-and-cons | Wise Agent pricing, review analysis |
| luxurypresence.com/blogs/wise-agent-review | Wise Agent Forbes awards, growth ceiling |
| salesrobot.co/blogs/conversica-review | Conversica $2,999/mo pricing, features |
| marketbetter.ai/blog/conversica-review-2026 | Conversica limitations, setup time |
| enginy.ai/blog/11x-vs-conversica-ai-sales-assistant | Conversica vs 11x governance comparison |
| ekfrazo.com/resources/blogs/salesforce-agentforce-what-it-does | Agentforce Einstein Trust Layer details |
| ekfrazo.com/resources/blogs/salesforce-agentforce-pricing-2026 | Agentforce Flex Credits pricing |
| prospeo.io/s/ai-sdr-salesforce | Agentforce pricing comparison table |
| captiwate.com/post/best-qualified-alternatives-in-2026 | Salesforce acquiring Qualified |
| theaiagentindex.com/agents/qualified | Qualified SOC 2, PiperX announcement |
| syncgtm.com/blog/qualified-review | Qualified $40-68K/year, limitations |
| knock-ai.com/blog/qualified-pricing | Qualified $42K starting, enterprise only |
| ainora.lt/blog/ai-voice-agent-real-estate-agencies-2026 | AI voice agent CRM write-back mechanics |
| moxiworks.com/blog/ai-tools-for-real-estate-agents | MoxiWorks RISE CRM description |
| bounti.ai/real-estate-blog/best-crm-for-real-estate-agents | Real estate CRM pricing landscape |
| aiproductivity.ai/tools/smartsheet | Smartsheet AI features (Smart Flows, Smart Agents) |
| automationatlas.io/answers/smartsheet-pricing-explained-2026 | Smartsheet pricing tiers |
| dev.to/.../ai-agent-audit-trail-before-august-2 | EU AI Act Article 12 enforcement context |
| isaca.org/.../the-ai-audit-trail | AI audit trail vs. governance distinction |

---

*Document prepared June 10, 2026. All claims tagged as verified, inferred, or unknown per verification discipline. Pricing reflects published rates as of search date — verify before citing in pitch materials.*
