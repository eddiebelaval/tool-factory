# Shipped. Pipeline

The build system for the **Shipped.** weekly magazine. Scrapes Anthropic releases, renders the magazine HTML, verifies every claim against its source, and stages for human-gated git push.

**Never auto-publishes.** The human at `git push` is the final gate.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    THE WEEKLY PIPELINE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  THU PM   /shipped --draft                                  │
│           writes knowledge/series/shipped/issue-NN.md       │
│           (markdown copy, hand-curated by Claude + Eddie)   │
│                                                             │
│  FRI 7AM  pnpm scrape                                       │
│           fetches @claudedevs tweets from past 7d           │
│           writes output/x-claudedevs/{date}.json            │
│                                                             │
│  FRI 8AM  /shipped --refresh-log                            │
│           merges scraper output into Release Log            │
│                                                             │
│  FRI 8:30 Eddie reviews markdown on his terms               │
│                                                             │
│  FRI 8:55 pnpm publish issue-NN.md                          │
│           = scrape (cached) + render + verify + stage       │
│           ↳ render → id8labs/public/shipped/NN/index.html   │
│           ↳ verify → blocks if any claim fails attestation  │
│           ↳ stage  → git add (NEVER commit, NEVER push)     │
│                                                             │
│  FRI 9AM  Eddie git commit + push (HUMAN GATE)              │
│           Vercel auto-deploys ~2 min later                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Components

| Module | Path | Purpose |
|---|---|---|
| **Renderer** | `src/render/` | Markdown → HTML magazine. Template extracted from MOCKUP-FINAL.html. |
| **Verifier** | `src/verify/` | The lying-prevention layer. URL liveness, number-claim attestation, quote attestation, date attestation. Blocks publish on any failure. |
| **Scraper** | `src/scrape/` | @claudedevs X feed → JSON output. Cross-references against existing Release Log. |
| **Orchestrator** | `src/orchestrate/` | Chains scrape → render → verify → stage. The `pnpm publish` entry point. |

## Scripts

```bash
pnpm install           # First-time setup
pnpm scrape            # Run X scraper standalone
pnpm render <file.md>  # Render an issue without verifying
pnpm verify <file.md>  # Run verification gates only
pnpm publish <file.md> # Full pipeline: scrape + render + verify + stage
pnpm test              # Run test suite (verifier and renderer)
```

## Environment

```
X_API_BEARER_TOKEN=...        # X API v2 read-only token (optional, falls back to Nitter)
SHIPPED_DEPLOY_PATH=...       # Default: ../../../id8labs/public/shipped
SHIPPED_KNOWLEDGE_PATH=...    # Default: ../../../knowledge/series/shipped
```

## The verification gates

Every gate must pass for `pnpm publish` to stage changes. Any failure exits non-zero with details printed.

| Gate | What it does |
|---|---|
| **URL liveness** | HEAD-requests every link in the issue. Fails on 4xx/5xx. |
| **Number attestation** | For each numeric claim with a source link nearby, fetches the source and confirms the number appears (with tolerance). |
| **Quote attestation** | For each quoted attribution, fetches the source and fuzzy-matches the quote string. |
| **Date attestation** | For each "shipped on YYYY-MM-DD" claim, confirms the source page mentions that date. |
| **Voice gate** | Scans for STYLE.md forbidden phrases. EPIC, "thrilled to," etc. |
| **"X isn't Y" overuse** | Counts the formula. Fails if more than 1 occurrence. |
| **Orange budget** | Counts orange-rendered objects. Fails if budget exceeded. |

## Failure modes

- **Verifier fails:** Stage is aborted. Eddie reviews the failure log, fixes the markdown, re-runs.
- **Scraper API key missing:** Logged warning, returns empty array, pipeline continues with primary sources only.
- **Renderer template missing:** Hard fail. Pipeline can't proceed.
- **Git working tree dirty in id8labs:** Hard fail. Pipeline refuses to stage on top of unrelated changes.

## What this pipeline does NOT do

- Does not commit. Ever.
- Does not push. Ever.
- Does not auto-deploy.
- Does not modify the original markdown in `knowledge/series/shipped/` (read-only source).
- Does not call Anthropic's API for generation. The writer agent (Claude) generates the markdown via `/shipped`; this pipeline only renders + verifies it.

## Versioning

| Version | Status | Notes |
|---|---|---|
| 0.1.0 | Foundation laid | Tonight (Apr 16). Skeleton for renderer, verifier, scraper. |
| 0.2.0 | Verifier shippable | Target: Tue Apr 21. URL + number + quote attestation working. |
| 0.3.0 | Renderer shippable | Target: Wed Apr 22. End-to-end render of Issue #01 markdown matches hand-built HTML. |
| 0.4.0 | Scraper integrated | Target: Thu Apr 23. @claudedevs tweets in source pool. |
| 1.0.0 | First autonomous run | Target: Fri Apr 24. Issue #02 ships via `pnpm publish` + Eddie's `git push`. |
