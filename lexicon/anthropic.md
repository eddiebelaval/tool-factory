# Anthropic Lexicon — Claude Best Practices

These rules are enforced by the Tool Factory validator. Non-compliance is a build failure.

---

## Prompt Engineering

### System Prompt Structure
- Use XML tags to delimit sections: `<context>`, `<instructions>`, `<constraints>`, `<examples>`
- Role definition goes first: who the model is, what it does, what it does NOT do
- Constraints follow instructions — the model processes them in order
- Use `<example>` blocks with realistic input/output pairs
- Prefer few-shot over zero-shot for structured output tasks

### Tool Use Patterns
- Every tool parameter MUST have a description that guides the model
- Use `enum` constraints wherever the valid set is finite
- Required vs optional: only mark truly required params as required
- Tool descriptions should state WHAT the tool does, not HOW to use it
- Return structured JSON from tools — never raw text when structure is possible

### Thinking Blocks
- Use extended thinking for: multi-step reasoning, code generation, complex analysis
- Skip thinking for: simple lookups, single-turn Q&A, formatting tasks
- Budget tokens: set `max_tokens` thinking budget proportional to task complexity

### Prefill Technique
- Start the assistant turn with the expected format to guide output
- Example: prefill `{"result":` to force JSON output
- Use sparingly — heavy prefill can constrain useful model reasoning

### Prompt Caching
- Place stable content (system prompt, examples, context) at the beginning
- Variable content (user query, dynamic context) at the end
- Cache breakpoints align with message boundaries
- Reuse system prompts across calls for cache hits

---

## MCP Protocol

### Server Requirements
- Implement proper capability negotiation in `initialize`
- Declare all tools with complete JSON Schema definitions
- Handle `tools/list` and `tools/call` at minimum
- Return structured errors with codes, not raw exception strings
- Support cancellation via `$/cancelRequest` for long-running operations

### Transport
- stdio: Default for local servers. Use for CLI tools and local integrations
- HTTP+SSE: For remote servers. Implement proper auth (API key or OAuth)
- WebSocket: For bidirectional real-time. Implement heartbeat/reconnect

### Schema Design
- Every tool input schema must have a `description` at the top level
- Use `additionalProperties: false` to prevent schema drift
- Enum all categorical parameters
- Date/time: ISO 8601 format always
- IDs: string type, not number (future-proof)

### Security
- Never expose raw database access — always wrap in application logic
- Validate all inputs server-side, even if the client validates
- Rate limit tool calls per session
- Log all tool invocations for auditability

---

## Skill Conventions (Claude Code)

### File Structure
```
skill-name/
  SKILL.md          # Entry point — frontmatter + instructions
  [supporting files] # Optional: templates, examples, configs
```

### Frontmatter
```yaml
---
name: skill-name
description: One-line purpose (used for trigger matching)
trigger: When/how this skill activates
---
```

### Trigger Rules
- Be specific: "When the user asks to X" > "For X-related tasks"
- Include negative triggers: "Do NOT use for Y"
- Reference related skills: "For Z, use skill-name-z instead"

### Instructions
- Lead with the core task, not background
- Use imperative voice: "Generate...", "Analyze...", "Create..."
- Include output format specification
- Define error/edge case handling
- Keep under 2000 tokens — longer prompts dilute focus

---

## Agent Design

### System Prompts
- Define identity, capabilities, and boundaries up front
- Specify what tools the agent has access to and when to use each
- Include escalation rules: when to ask the user vs decide autonomously
- Set output style expectations (format, length, tone)

### Multi-Turn Reasoning
- Use tool results to inform next steps, don't plan everything upfront
- Prefer sequential tool calls over parallel when order matters
- Summarize intermediate results to maintain context coherence

### Delegation
- Delegate when: task is well-scoped, agent has right tools, main context benefits
- Don't delegate when: task requires cross-cutting context, results need synthesis
- Always return structured results from sub-agents, not raw tool output
