# OpenAI Lexicon — Cross-Compatible Patterns

These patterns ensure tools work well across model providers, not just Claude.

---

## Function Calling / Tool Schemas

### Schema Design
- Parameter descriptions are the most important field — models rely on them heavily
- Include examples in descriptions: `"The user's email address (e.g., user@example.com)"`
- Use `enum` for any parameter with <20 valid values
- Default values should be documented in the description, not just the schema
- Nest objects sparingly — flat schemas are easier for models to fill correctly

### Parameter Naming
- Use snake_case for all parameter names (cross-platform standard)
- Boolean params: prefix with `is_`, `has_`, `should_` for clarity
- Array params: use plural names (`tags`, `ids`, `items`)
- Avoid abbreviations: `description` not `desc`, `configuration` not `config`

### Error Responses
- Always return JSON errors: `{ "error": { "code": "string", "message": "string" } }`
- Use standard HTTP-style codes: 400 (bad input), 404 (not found), 500 (server error)
- Include actionable messages: "Parameter 'email' must be a valid email address"
- Never expose stack traces or internal paths in error responses

---

## Structured Output

### JSON Mode
- When expecting JSON output, specify the exact schema in the prompt
- Include a complete example of the expected output format
- Use TypeScript-style type annotations in descriptions for clarity
- Validate output against schema before using it

### Constrained Generation
- For categorical outputs, enumerate all valid values in the prompt
- For numerical outputs, specify range and precision
- For lists, specify min/max length
- Always include a "confidence" or "certainty" field for analytical outputs

---

## Agent / Handoff Patterns

### Swarm-Style Delegation
- Each agent owns a narrow domain with 3-7 tools max
- Handoffs include: target agent, reason, and context summary
- Context windows are not shared — pass relevant state explicitly
- Return control to the orchestrator, not directly to another agent

### Context Passing
- Summarize before passing — don't dump raw history
- Include: what was attempted, what succeeded, what failed, what's needed next
- Preserve key decisions and their rationale
- Strip tool call details — pass results, not the calls themselves

### Routing
- Route by intent classification, not keyword matching
- Fallback to a general agent, not an error
- Log routing decisions for debugging misroutes
- Track routing accuracy — misroutes are a top friction source

---

## Evaluation Patterns

### Rubric-Based Scoring
- Define 3-5 criteria with clear scoring levels (1-5 or pass/fail)
- Weight criteria by importance for the use case
- Include negative criteria: "Penalize if X"
- Use a separate model call for evaluation (avoid self-eval bias)

### A/B Comparison
- Present both outputs side-by-side to the evaluator
- Randomize order to prevent position bias
- Ask for preference AND reasoning
- Run minimum 20 comparisons for statistical significance

### Regression Testing
- Store golden outputs for critical test cases
- Compare new outputs against golden set on every change
- Track: exact match rate, semantic similarity, rubric score delta
- Alert on any regression >5% on any metric

---

## Token Optimization

### Prompt Compression
- Remove redundant instructions — if it's in the system prompt, don't repeat in user
- Use references: "Follow the format from Example 1" instead of repeating the format
- Abbreviate context: summarize background instead of including full documents
- Measure input tokens — set a budget and stick to it

### Response Length Control
- Specify desired length in the prompt: "Respond in 2-3 sentences"
- Use `max_tokens` as a safety net, not the primary control
- For structured output, the schema itself constrains length
- Monitor average response tokens — drift indicates prompt degradation

---

## Multi-Model Routing

### When to Use Fast Models
- Classification and routing decisions
- Simple extraction from structured data
- Format conversion (JSON to CSV, etc.)
- Validation checks (is this valid JSON? is this a URL?)

### When to Use Capable Models
- Code generation and review
- Complex analysis requiring reasoning
- Creative content that needs nuance
- Multi-step planning with dependencies
- Anything that touches security or payments
