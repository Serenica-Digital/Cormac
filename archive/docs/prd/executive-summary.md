# Cormac Executive Summary

> Status: Draft · Last edited: 2026-06-14

## Overview: 

- Cormac is a CRM-focused AI Agent designed to be a lightweight yet powerful tool targeting two related problems with incumbent CRM platforms
    - They force users onto their proprietary platforms & apps. 
    - Too cumbersome, teams don't keep them up to date over time. 
- Instead, Cormac meets users where they live day to day in order to streamline their time-consuming data-entry
    - Excel
    - SMS Text
    - Claude
    - Email 

## What does working with Cormac look like? 
Divided into 2 complementary stages:

### Initial Set up: 

First, it lifts the workbooks a business is already running on into a proper governed database, keeping the structure and vocabulary the team already knows. 

1. Client uploads their pre-built Excel Workbooks they've been using as an easy way to keep an early-stage CRM to Cormac
2. Cormac will then analyze and **interview** the user about their data structure and their business
    - priority metrics
        - what do you care about monitoring, what relationships between data points matter most to you?
    - workbook sheets / tables organization? 
    - Automated Reports & Reminders, what gets sent out, how often, and to who? 
    - Allow Cormac to upate the CRM directly vs. Require manual confirmation ?
3. Cormac formalizes this plan into a proper database-level "contract" and uses that to steer all the day to day operations. 


### Everyday Use Channels

Then, that "contract" structure directs the agent during all the day-to-day operations. It's what enables the data-entry to be more hands-free (Text Cormac) and addresses the real source of friction without sacrificing reliabiliy. 

1. Text and/or Email
    - Send Cormac the update / search you want it to run for you.  
2. Excel: Microsoft Marketplace Add In
    - Cormac lives in a side panel in Excel
    - can interact and sync directly with your spreadsheets. 
3. Claude.ai : Connect your Claude chats directly to Cormac tools and data. 

## The customer and the market

We're operating in the US small-business CRM segment — an estimated $4–6 billion subset of the ~$50 billion US CRM market. This where we will find the underserved spreadsheet-native slice of the market not comfortable paying for / moving on to the heavier platforms, but who still want to use AI to automatate their mundane data entry. 

We first sell to small businesses that run their operation on spreadsheets, email, text, and Microsoft 365. The first beachhead is small real-estate and real-estate-investing firms: spreadsheet-heavy, relationship-driven, with deal pipelines that live or die on follow-up. Adjacent segments with the same shape include private lenders, brokers, small agencies, and contractors. 

## The wedge and why we win

An AI CRM agent that is **Excel-native** (it works with the spreadsheet you already use), **textable** (you fire off a quick text or email and it files the update for you), and **safe** (it checks every change against your rules and logs it) is a combination nobody else ships.

We went looking for anyone doing all three at once: works in your own spreadsheet, takes an update you text in, and keeps your records without making you leave your files. We couldn't find one. The market splits into three camps, and each is missing a leg:

**1. Smart spreadsheets — Excel-native, but not a CRM and no text-to-update**
- *Who:* Copilot in Excel, Coefficient, Rows, Equals, Sourcetable, Paradigm, Quadratic, Numerous / SheetAI.
- *What we'd want from them:* Live right in your spreadsheet and make it smarter.
- *What's missing:* none is a CRM, and none takes an update you text in. They make your sheet better at analysis and reporting; you'd still have to build your entire CRM-agent and capture/entry layer yourself.

**2. No-setup AI CRMs — auto data-entry, but their app and no text-to-update**
- *Who:* Coffee AI, Streak, Close.
- *What we'd want from them:* they kill manual data entry by quietly updating themselves from your emails and calendar, with no painful setup.
- *What's missing:* the records live in their app (or inside Gmail), not your spreadsheet, and they only update by reading your email in the background. You can't just fire off "talked to Dave, he's interested, follow up Friday" and have it filed. You still work their way, not yours.

**3. Textable CRMs — text-driven updates, but you run everything inside their platform**
- *Who:* the established CRMs (Salesforce, HubSpot, Zoho, Attio, Monday) and the lead-texting tools that bolt onto them (Structurely, kvCORE, Lofty, Salesmessage).
- *What we'd want from them:* the cutting-edge, message-driven updates.
- *What's missing:* you have to leave your spreadsheet and run your whole business inside their CRM, and the "texting" is mostly *their AI texting your leads* and logging the chat, or *you* typing commands inside their app, not *you* firing a quick text from the field that files itself against your own records.

Nobody sits in the middle. And note what changed recently: the text-driven update feature is no longer rare or expensive. Cheap CRMs (Attio at $29, Zoho) now have a version of it too. So our edge isn't "we have a feature they lack." It's that **we are the only one that does it without making you leave your spreadsheet.** Excel-native, textable, safe, and your data stays in your own files: that exact combination is still empty, and it's ours.

## Open Questions

What set/flavor of CRM operations ARE we trying to support **exactly**? Large variety of CRM styles, not all compatible with our model. (Not scraping the Web for leads, or automatically sending reply texts to customers)

What upper bound do we put on the complexity of a workbook a user tries to bring in? Have to avoid trying to build another general purpose spreadsheet agent. 

### Price Point: 

- TBD, an open research question. Requires calibration against actual inference costs for the fully developed agent
- Some Features may be planned for v2, potentially targeting a two tiered distribution model. (Pro vs. Enterprise). V2 would explore developing additional connectors to
    - Video Calls (Teams? Zoom? Google Meet?)
    - Calendars
    - Microsoft Power apps

## Status

### Trademark: 
Intent to Use application filed with USPTO, 6-13 for the name **"Cormac"** as a CRM-focused AI agent. 

Feasibility from early prototypes is promising, 
- live agent that files an update from a plain-English message in about ten seconds for about three cents. 

Finalizing intended architecture suitable for modern, containerized deployment, in partnership with [Juno Innovations](https://www.juno-innovations.com/)