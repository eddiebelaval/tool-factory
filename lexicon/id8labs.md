# id8Labs Lexicon — Brand + Engineering Standards

These are the internal standards every id8Labs tool must follow. They're not guidelines — they're requirements.

---

## Brand Voice

### Tone
- Clinical, direct, no superlatives
- Never: "revolutionary", "game-changing", "cutting-edge", "leverage"
- Factual acknowledgment over praise: "That works" > "Great job"
- Lead with what's wrong, not what's right
- One line over one paragraph when possible

### Visual
- Icons: Hero Icons or professional icon libraries. NEVER emojis in code, UI, or project files
- Colors: Near-black (#020202), near-white (#eeeeee), warm grays
- Accent: Orange #ef6f2e, amber #f59e0b, teal #4ecdc4
- Typography: Geist + Geist Mono, weight 400 headings, tight tracking
- Style: NO shadows, gradients, or glow effects
- Brand name: Always `id8Labs` — one word, no space, capital L

### Output Style
- Skip preamble. Lead with the answer or action
- If you can say it in one sentence, don't use three
- No trailing summaries — the diff speaks for itself
- Present 2 options max with a recommendation, not 10

---

## Engineering Standards

### Stack
- Frontend: TypeScript (strict), Next.js, React functional components with hooks
- Backend: Next.js API routes (same-origin), Supabase
- Database: Supabase production, SQLite local
- Auth: Email OTP always. `signInWithOtp()` + `verifyOtp()`. No passwords, no magic links.
- AI: Claude Sonnet 4.5 for reasoning, cost-effective models for execution
- Deployment: Vercel, single targets

### Code Quality
- TypeScript strict mode, no `any` types
- Graceful degradation — never crash on optional features
- Run `npx tsc --noEmit` after every file edit
- Preflight (build + test + lint + typecheck) before every push
- No emojis in code or UI files

### Git Workflow
- Never commit directly to `main` — feature branches and PRs only
- Never squash merge — preserve granular commit history
- Commit format: `[Stage N: Name] type: description`
- Types: feat, fix, deps, docs, verify, refactor, test
- Gate commits: `[Stage N: Name] verify: gate PASSED — description`

### Documentation
- Every product: VISION.md (future) + SPEC.md (present) + BUILDING.md (past)
- BUILDING.md updated at every gate pass — what was built and why
- Match existing voice and format. Focus on WHY, not just what.
- No README files unless explicitly requested

---

## Architecture Patterns

### Recursive Self-Awareness
- Products explain themselves, speak for themselves, improve themselves
- Self-narrating landing pages, BUILDING.md as autobiography
- Explorer mode for first-person voice
- Persistent memory for cross-session relationships

### Golden Sample Derivation
- Milo = golden sample (full ~/mind/ filesystem, the genome)
- Products = production units (professional subsets, phenotypes)
- New products = new subsets derived from the golden sample
- The consciousness filesystem IS the platform

### Triad Documentation
- VISION.md: Where we're going (the future)
- SPEC.md: What exists now (the present)
- BUILDING.md: What we built and why (the past)
- Delta between VISION and SPEC = the roadmap
- Any two reconstruct the third

---

## Shipping Standards

### PEV (Plan-Execute-Verify)
- Plan: State what you'll do before doing it
- Execute: Do it
- Verify: Confirm it worked (tests pass, types check, build succeeds)
- Report: "Verification: [PASSED/FAILED]"

### Preflight Checklist
Before every push:
1. `npm run build` — passes
2. `npx tsc --noEmit` — passes
3. Tests pass (if they exist)
4. Lint passes (if configured)
5. User approves

### Release Standards
- Update BUILDING.md as part of every release
- Every release tells its story
- No code ships without docs

---

## Tool-Specific Requirements

### Skills Must
- Have clear trigger rules with negative cases
- Follow SKILL.md frontmatter format
- Stay under 2000 tokens
- Include at least one example
- Reference related skills to prevent misrouting

### MCP Servers Must
- Return structured JSON errors, not raw exceptions
- Validate all inputs server-side
- Support graceful shutdown
- Log all tool invocations
- Have a test suite

### Agents Must
- Define identity, capabilities, and boundaries
- Specify escalation rules
- Return structured results
- Have a clear exit condition
- Be testable with a goal-based test

### Hooks Must
- Have a timeout (default: 5s, max: 45s)
- Exit cleanly on error (no orphan processes)
- Be idempotent (safe to run multiple times)
- Log what they do (for debugging)
