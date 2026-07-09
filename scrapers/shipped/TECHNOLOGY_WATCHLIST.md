# Technology Watchlist

> Tools we've evaluated but aren't installing yet. The point: solve the "right tool, wrong time → right time, can't find tool" problem without dependency debt.

**How this works.** When we find a promising library that fits a future problem but doesn't earn a slot in `package.json` today, we capture the decision here. Each entry names the tool, the problem it solves, the trigger that would promote it to an install, and the links. Next time the problem lands, open this file — everything is here.

**Format for each entry:**
- **Tool:** name + link
- **Status:** `WATCHING` (not installed) | `INSTALLED` (in use)
- **Solves:** the problem it addresses
- **Trigger:** what has to be true before we install it
- **Notes:** gotchas, version, API stability signal
- **Dated:** when added

---

## @chenglou/pretext

- **Tool:** [chenglou/pretext](https://github.com/chenglou/pretext) — pure-JS multiline text measurement & layout. Bypasses DOM reflow. Supports all scripts (CJK, Arabic RTL, emoji) as a first-class concern.
- **Status:** WATCHING
- **Solves:**
  1. OG card generation across languages — programmatically render the Shipped. magazine-cover masthead for EN/ES/PT with correct line-breaking per script. Same template, measured correctly per language.
  2. Adaptive headline shrinkwrap — find the tightest width that fits N lines. Useful for mobile OG cards and release-log entries where copy length varies.
  3. Server-side text layout without headless Chrome (when their SSR support lands).
- **Trigger:** install when OG card generation becomes programmatic (Issue 04+) or when we need canvas/SVG text rendering. Plain HTML magazine body does NOT need this — browsers render ES/PT fine out of the box.
- **Notes:** 44k stars, v0.x as of 2026-04-17. Expect API churn in next 3-6 months. Pin carefully when we install. Author is Cheng Lou (original React core team).
- **Dated:** 2026-04-17
