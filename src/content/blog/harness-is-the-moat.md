---
title: "The Harness Is the Moat: Why Autonomous AI Agents Live or Die by Their Architecture"
description: "Model quality is commoditising. The durable competitive advantage in 2026 is harness architecture — the deterministic enclosures that make probabilistic agents reliable. A deep analysis of the four architectural primitives every production harness must implement, and how Autoresearch, Ralph Loop, Superpowers, and GSD each solve them differently."
date: 2026-03-25
tags: ["AI agents", "harness engineering", "LLM", "autonomous systems", "machine learning"]
---

A ten-step autonomous workflow where each step succeeds with 85% probability has an end-to-end success rate of:

$$P(\text{success}) = 0.85^{10} \approx 0.197$$

Less than 20%. Extend it to 20 steps and you're at 3.9%. To 50 steps: 0.03%.

This is not a model quality problem. It is a systems architecture problem. And the solution is not a smarter model — it is an enclosure that resets the probability vector at each step through deterministic verification.

This realization has produced the defining engineering discipline of 2026: **harness engineering**. The thesis of this post is direct: the competitive moat in agentic AI no longer lives in model parameters. It lives in the architecture wrapped around them.

---

## What a Harness Is

The word "harness" gets used loosely. Let's be precise.

A harness is the complete software enclosure that wraps around an LLM, managing tool execution, memory, state persistence, context compaction, and output verification — while treating the model itself as a pluggable, stateless reasoning component.

The distinction matters:

- A **prompt** is not a harness. Instructions given to a model are advisory; a harness is structural.
- A **framework** (LangChain, CrewAI, AutoGen) is not automatically a harness. It is a toolkit for building one.
- The **model** is the engine. The harness is everything else: the intake, the exhaust, the governor, and the brakes.

Architecturally, a production harness consists of nested layers, each with a distinct responsibility:

```
┌─────────────────────────────────────────────┐
│             Orchestration Layer             │
│  (task scheduling, agent dispatch, routing) │
│  ┌───────────────────────────────────────┐  │
│  │        Memory / State Layer           │  │
│  │  (filesystem, git, structured logs)   │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │       Verification Layer        │  │  │
│  │  │  (linters, tests, audit agents) │  │  │
│  │  │  ┌───────────────────────────┐  │  │  │
│  │  │  │   Tool Execution Layer    │  │  │  │
│  │  │  │  (sandboxed, sanitised)   │  │  │  │
│  │  │  │  ┌─────────────────────┐  │  │  │  │
│  │  │  │  │   Model (LLM)       │  │  │  │  │
│  │  │  │  │  (pluggable, state- │  │  │  │  │
│  │  │  │  │   less, reasoning)  │  │  │  │  │
│  │  │  │  └─────────────────────┘  │  │  │  │
│  │  │  └───────────────────────────┘  │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

This architecture is not novel — it mirrors how any reliable system wraps an unreliable component. The model is treated like an external API: powerful but untrustworthy by default, operating inside a boundary that sanitises inputs, validates outputs, and manages failure modes.

What is novel is how this is now the primary locus of competitive differentiation in AI systems.

---

## The Four Architectural Primitives

Every production harness must implement these four primitives. They are not optional layers — each one addresses a failure mode that will manifest in production if omitted.

### 1. Deterministic Fences

The core insight from OpenAI's Codex team, who used agents to build a [one-million-line production codebase](https://openai.com/index/harness-engineering/) over five months: architectural drift is inevitable without mechanical enforcement. Models are trained to be helpful; they will find the path of least resistance, which frequently means violating architectural boundaries in ways that are locally plausible but globally destructive.

A deterministic fence is a mechanically verifiable boundary. The canonical pattern is Domain-Driven Design layering enforced by a custom linter: types → config → repo → service → runtime → UI, with each layer permitted only to import from layers below it. When the agent generates a cross-layer import, the harness does not merely log a failure — it intercepts the error message and rewrites it as a targeted remediation instruction, injected into the agent's next context. The violation becomes a self-healing feedback signal.

Two properties distinguish a fence from a prompt instruction:
1. **It fails deterministically.** The boundary cannot be circumvented through model confidence or creative re-interpretation.
2. **It operates outside the model's output.** The fence evaluates the artifact, not the model's description of the artifact.

**Failure mode if omitted:** architectural entropy. Codebases built by agents without fences exhibit a characteristic pattern — locally coherent commits, globally incoherent structure. By commit 200, you have three error handling patterns, two state management approaches, and utility functions that do subtly different versions of the same thing. No single commit introduced this; it accumulated.

### 2. Verification Ladder

The verification ladder is a sequential pipeline where each rung must pass before the next executes. Its function is to reset the probability vector at regular intervals, preventing error accumulation across steps.

A complete ladder has six rungs:

1. **Static analysis** — syntax validity, file existence, import resolution
2. **Deterministic linters** — style, convention enforcement, custom architectural rules
3. **Compilation checks** — type safety, interface compliance
4. **Unit test execution** — behavioral correctness at the function level
5. **Headless UI testing** — end-to-end correctness via Puppeteer or Playwright; catches regressions invisible at the code level
6. **LLM-based audit** — a secondary agent, operating in an independent context window, reviews the implementation against the original specification

A note on rung six: the secondary auditor does not fully reset the error probability — it introduces its own — but because it operates on an independent context with no shared state, it catches a distinct class of failures: semantic drift from the original spec, overcomplicated implementations, and silent behavioral changes. The combination of rungs 1–5 (deterministic) and rung 6 (probabilistic but independent) addresses both classes of failure.

Datadog's observability data [documents the production consequence of skipping this](https://www.anthropic.com/engineering/harness-design-long-running-apps): AI can produce software exponentially faster than human engineers can review it. The verification ladder is how you replace human review with automated verification at scale.

**Failure mode if omitted:** code that passes visual inspection but fails behaviorally at runtime. The bottleneck shifts to human review and stays there.

### 3. Externalised State & Context Compaction

Foundation models are stateless. Every new inference begins with total amnesia. The prevailing and incorrect strategy for handling this is to append everything — chat history, tool outputs, error logs — into an expanding context window.

Modern models have context windows exceeding one million tokens. This does not solve the problem. As a context window saturates, systems encounter the "Lost in the Middle" phenomenon: instructions buried in dense logs are ignored, the model fixates on stale data, and behavior degrades into loops. More practically, flooding the context window increases latency and inference costs, making continuous 24/7 operation economically unviable.

The correct model: treat the context window as a CPU register (fast, volatile, small) and the filesystem + git as persistent storage (slow, durable, unbounded). This implies an explicit compaction protocol at each loop boundary:

- At loop end: distill critical decisions, unresolved blockers, and implementation state to structured markdown files (`STATE.md`, `NOTES.md`, `PROJECT.md`). Discard raw tool outputs and logs.
- At loop start: read the state files. The agent's full context of the project is loaded from persistent storage, not reconstructed from memory.
- Per completed task: atomic git commit. Git becomes the memory substrate. A new session reads the commit history to understand what has been done; it does not need the previous session's context.

[Anthropic's research on long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) confirms that separating the session-state concern from the execution concern is the primary lever for enabling multi-hour autonomous workflows without coherence degradation.

**Failure mode if omitted:** context rot. Agents that perform well in short sessions develop looping behavior, hallucinated progress claims, and contradictory decisions as sessions extend. The longer the session, the worse the degradation — exponentially, not linearly.

### 4. Loop Termination Guarantees

The worst production failure mode for an agentic system is not a crash — it is an infinite loop. A crashed agent stops spending money. A looping agent burns tokens indefinitely while making no progress.

Standard timeout mechanisms are insufficient. They terminate execution but leave the underlying state unresolved. On resumption, the agent re-enters the same trap.

A production harness requires three-layer circuit breakers:

**Layer 1 — Budget-aware runtimes.** Hard limits on token consumption and cost per task, linked to execution state. When the budget is hit, the harness does not simply halt; it writes the current state and marks the task as incomplete for retry under a new budget.

**Layer 2 — Cycle detection middleware.** Semantic similarity analysis of consecutive tool calls. If the agent attempts an identical failed strategy across two or more iterations — same tool, same parameters, same error — the middleware halts execution, marks the task incomplete, and injects a diagnostic prompt into the next context window explicitly forbidding the previous approach.

**Layer 3 — Durable execution checkpointing.** [Temporal's durable execution model](https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai) applies directly here: every step and its consequence are immutably logged, surviving process deaths and infrastructure failures. When an agent enters a loop, engineers can pinpoint the exact divergence point in the execution history, fork the state at that node, and spawn parallel recovery branches — without re-running any prior completed work.

**Failure mode if omitted:** runaway token burn with no progress signal. Blunt timeouts that guarantee re-entry into the trap.

---

### Primitive Summary

| Primitive | What it prevents | Minimum viable implementation |
|---|---|---|
| Deterministic Fences | Architectural entropy, spaghetti dependencies | Custom linter + fail-on-violation CI step |
| Verification Ladder | Silent behavioral regressions, human review bottleneck | Static analysis + unit tests + headless UI tests |
| State Externalisation | Context rot, session amnesia, spiraling costs | `STATE.md` compaction + atomic git commits per task |
| Loop Termination | Infinite loops, runaway token burn | Token budget limit + cycle detection on consecutive tool calls |

---

## Four Frameworks as Case Studies

The practitioner community has converged on four prominent open-source harness implementations. Each solves the same four primitives but from a different starting philosophy. Examining them against the taxonomy above reveals what trade-offs each engineering team made and why.

### Autoresearch — The Ratchet Loop

*Origin: Andrej Karpathy; extended by the open-source community (autoresearch-win-rtx, AutoResearchClaw, and others).*

Autoresearch is the purest expression of metric-driven continuous execution. Its architecture is deliberately minimal: three files, one loop, one ungameable metric.

```
program.md          ← human-authored: constraints, priorities, available tools
prepare.py          ← immutable: dataset and evaluation metric (agent cannot touch this)
train.py            ← agent sandbox: the only file the agent modifies
results.tsv         ← ledger: every experiment's outcome
```

**Execution loop:**

```
Read program.md → Review results.tsv → Formulate hypothesis
→ Modify train.py → git commit to feature branch
→ Train for exactly 5 minutes (wall-clock budget enforced)
→ Evaluate val_bpb
    → Improved? Retain commit. Update results.tsv.
    → Degraded? git revert. Try again.
```

**Primary primitive — Verification.** The ungameability of the success metric is the architectural insight. `val_bpb` (validation bits per byte) is vocabulary-independent: the agent cannot inflate it by adjusting tokenisation or vocabulary size. It is measured on a fixed evaluation set in `prepare.py`, which the agent is structurally forbidden from modifying. This is a deterministic fence around the evaluation oracle — the one thing that must remain trustworthy for the loop to be meaningful.

**Where it excels:** autonomous ML experimentation over hundreds of unsupervised iterations. Shopify adapted this pattern to optimize their Liquid template engine, achieving a 53% faster parse rate through 93 consecutive autonomous commits.

**Where it falls short:** domain-specific. The ratchet loop assumes a scalar, single-valued metric and a sandbox file that can be reset by revert. It does not generalise cleanly to software engineering tasks with multi-dimensional success criteria.

---

### Ralph Loop — Filesystem-First Persistence

*Origin: Geoffrey Huntley. [Open-source bash harness.](https://ghuntley.com/specs/)*

Ralph Loop (sometimes called the Ralph Wiggum Technique) starts from a different axiom: context is always wrong, so never trust it. Instead of managing context, throw it away at every iteration.

**Execution loop:**

```
Read tasks.json → Select highest-priority incomplete task
→ Spin up fresh context window (no history)
→ Agent receives: SUMMARY.md + PROMPT.md + current codebase
→ Agent implements
→ Run: Vitest + ESLint + TypeScript + headless browser screenshot
    → All pass? Agent outputs <promise>COMPLETE</promise>
    → Blocked? Agent outputs <promise>BLOCKED:reason</promise>
    → Needs input? Agent outputs <promise>DECIDE:question</promise>
→ Update tasks.json → Loop
```

**Primary primitive — State Externalisation.** Ralph implements the most aggressive version of the filesystem-as-memory pattern. Conversational history is not summarised — it is discarded. The filesystem is the only memory. `tasks.json` tracks progress; `STEERING.md` is a file the human can write to at any point to inject a correction that the agent will pick up at the next iteration start. The agent never carries state across iterations except through files.

The Promise Tags (`<promise>COMPLETE</promise>`, `<promise>BLOCKED:reason</promise>`, `<promise>DECIDE:question</promise>`) are a clean solution to the human-in-the-loop interface problem: the non-deterministic agent signals its terminal state to the deterministic bash loop using a structured XML protocol. The bash loop branches on these signals. No ambiguity.

**Where it excels:** sequential feature engineering, bug resolution, any task where human course-correction mid-run is a feature, not a bug. Well-suited for Docker sandbox deployment to prevent destructive host commands.

**Where it falls short:** inherently sequential. No parallel execution. Long-horizon tasks require many iterations with limited batching opportunity.

---

### Superpowers — Methodological Enforcement

*Origin: Jesse Vincent. [Open-source skill library.](https://github.com/anthropics/claude-code)*

Superpowers takes a different view: the failure mode of agentic systems is not missing infrastructure — it is agent behavior. Models are trained to be helpful, which makes them rush: generate implementation before asking questions, skip tests, declare completion without evidence. Superpowers is a behavioral enforcer.

**Execution flow:**

```
Task received
→ BLOCKED: must invoke brainstorming skill
→ Socratic design refinement with human
→ Human approves design
→ Create git worktree (isolated branch)
→ Verify baseline test suite passes before any changes
→ For each micro-task:
    → TDD enforcement: write failing test → execute → confirm RED
    → Implement minimal code to pass
    → Execute → confirm GREEN
    → Refactor
    → Secondary agent reviews against spec
    → Critical issues? Block. Non-critical? Continue.
→ Implementation code written before test? Delete implementation.
```

**Primary primitive — Deterministic Fences.** The fence here is process: the RED-GREEN-REFACTOR cycle is enforced mechanically, not by instruction. If the harness detects that implementation code was written before test code, it deletes the implementation. The fence operates on the artifact, not the model's description of intent.

The `<session-start-hook>` injection deserves note: Superpowers embeds directives with absolute language ("you MUST", "not optional", "if there is even a 1% chance") into the system prompt. This is an explicit acknowledgment that models will rationalize their way out of soft constraints. The absolute language strips the model's autonomy to bypass the framework.

**Where it excels:** greenfield architecture, quality-critical systems, any context where a human wants structured approval gates before execution proceeds.

**Where it falls short:** not fully autonomous by design. The brainstorming gate and multi-stage review require human participation. This is a feature for some use cases and a constraint for others.

---

### GSD (Get Shit Done) — Parallel Wave Orchestration

*Origin: TÂCHES, operating on the Pi SDK. [Open-source orchestration framework.](https://github.com/pibossanova/gsd)*

GSD is architected for scale. Where Ralph Loop serialises everything and Superpowers enforces human gates, GSD parallelises aggressively — and manages context rot by ensuring worker agents are always amnesiac.

**State machine:**

```
DISCUSS
  → requirements elicitation, architecture decisions
  → output: PROJECT.md, DECISIONS.md

PLAN
  → Nyquist validation: each plan item must map to a terminal test command
  → plan-checker rejects any item without automated verification
  → output: M001-ROADMAP.md with per-task test commands

EXECUTE
  → Orchestrator groups tasks into independent waves
  → Per wave: dispatch N executor subagents simultaneously
  → Each subagent receives:
      - fresh 200k-token context window
      - only its specific task slice
      - dependency summary
      - isolated git worktree (no file-lock collisions)
  → Orchestrator context utilisation stays at 30-40%

VERIFY
  → Verifier agent checks results
  → Unexpected systemic changes? Recalculate roadmap.
  → Update STATE.md
  → Loop to next wave
```

**Primary primitive — State Externalisation via context isolation.** The architectural insight is inverting the context management problem: instead of trying to compress a long-running context, GSD never accumulates one. The orchestrator maintains sparse state; workers are stateless by construction. Each worker gets exactly the context it needs for its task, nothing more. Context rot is structurally impossible because context is never shared across workers.

The Nyquist validation layer is an independent contribution: every plan item must have a corresponding terminal test command before execution is authorised. Plans without verifiable completion criteria are rejected. This enforces the Verification Ladder primitive at the planning stage, before any code is written.

**Where it excels:** large-scale deployments with independent parallel task streams. Multi-feature milestones where tasks can be executed simultaneously without shared state dependencies.

**Where it falls short:** coordination overhead. For small or inherently sequential tasks, the orchestrator-worker architecture introduces latency and complexity that outweigh the parallelism benefit.

---

### Framework Comparison

| Framework | Primitive Strength | State Mechanism | Parallelism | Human Gates | Best Fit |
|---|---|---|---|---|---|
| Autoresearch | Verification (ungameable metric) | `results.tsv` + git branches | None | None | ML experimentation, metric optimisation |
| Ralph Loop | State externalisation | `tasks.json` + git + `STEERING.md` | None | Via `DECIDE` tag | Sequential engineering, mid-run steering |
| Superpowers | Deterministic fences (TDD) | `PLAN.md` + git worktrees | None | Brainstorm + review gates | Architecture design, quality-critical builds |
| GSD | Context isolation at scale | `STATE.md` + `PROJECT.md` + git worktrees | Wave-parallel | Discuss phase | Large-scale multi-feature deployments |

No framework dominates across all four primitives. The choice is a function of task structure, team tolerance for human gates, and the scale of parallelism required.

---

## Practical Guidance

Six decisions that determine whether a production harness works or fails, ordered by priority.

### 1. Define "done" before writing any prompts

The most common failure pattern: teams instrument the agent loop first and bolt on verification later. Invert this. Before writing a single prompt, define the ground truth signal: what automated test, metric, or artifact must exist for a task to be considered complete?

If you cannot state "done" in terms an automated process can evaluate, you do not have a closed loop — you have an open-ended generation task. The agent will declare completion when its output *looks* finished. Only an external, automated verifier catches the difference.

### 2. Treat your context window like a CPU register

Design explicit compaction checkpoints from the first day of implementation, not as a retrofit. At each loop boundary, decide explicitly: what gets written to persistent state, and what gets discarded?

The discipline: the information a new session needs to continue the work correctly should fit in a structured markdown file that takes under 30 seconds to read. If it does not, the compaction is insufficient. Raw tool outputs, error logs, and conversational history are almost never needed in the next session. Distilled decisions, current blockers, and structural state almost always are.

### 3. Pick one ungameable success metric before shipping to production

This principle generalises from Autoresearch's `val_bpb` to any agentic system: any metric the agent controls the evaluation of is gameable, and it will be gamed — not through intent, but because the model optimises for the signal it can observe.

In ML tasks: use a metric computed on a held-out set in code the agent cannot modify (the `prepare.py` pattern). In software engineering tasks: use an external integration test suite the agent does not have write access to. The ungameability is architectural, not instructional.

### 4. Enforce architectural boundaries with linters, not prompts

A custom linter that fails the build is a fence. A prompt that says "please follow our layered architecture" is a suggestion the model will override whenever it finds it convenient.

The investment is real: writing custom linters and structural tests takes time. The payoff is proportional to the number of agent commits that will run against the codebase. At 100 commits, a fence pays for itself. At 1000, it is indispensable.

When an agent violates a fence, the harness should not simply emit a pass/fail signal — it should rewrite the error into a targeted remediation instruction. This converts the fence from a blocker into a self-teaching feedback loop.

### 5. Budget your circuit breakers before the first production run

The three parameters that must be defined before deployment:

- **Max token budget per task** — what is the upper bound on cost before a task is marked incomplete and returned for retry?
- **Max retry count** — how many consecutive failures before the task is escalated to human review?
- **Cycle detection threshold** — at what semantic similarity score between consecutive tool calls does the harness halt and diagnose?

These are not defaults you discover in a production incident. By the time an infinite loop has consumed meaningful resources, the damage is done. Define the circuit breakers in the harness configuration before running any live workloads.

### 6. Log state transitions to git, not to stdout

Every completed task should produce an atomic git commit with a message that captures what was done and why. This has two effects:

First, it gives you time-travel debugging at zero additional cost. To understand why the agent made a decision at step 47, read the commit at step 47. The diff is the evidence; the message is the reasoning. No logging infrastructure required.

Second, it makes durable execution recovery tractable without requiring Temporal or a dedicated workflow engine. A new session that reads the commit history can determine exactly where work stopped and resume from that point. The git log is the execution log.

---

## Open Problems

Harness engineering is a young discipline. The four primitives above are the current state of the art — necessary but not sufficient for all production scenarios. Four problems remain substantially unsolved.

### Trust verification at scale

Datadog's "scalability inversion" observation: AI systems can produce code faster than human engineers can review it. Verification ladders address this for syntactic and behavioral correctness, but they do not address semantic correctness — whether the agent built the right thing, not just a thing that passes tests.

LLM-based auditors (rung 6 of the verification ladder) are the current best answer. Their reliability ceiling is unknown. An auditor agent reviewing an implementor agent's output introduces a second probabilistic component into a system that is already struggling with compounding probability. The field lacks a rigorous framework for quantifying how much trust the audit rung actually buys.

### Identity and governance

A 24/7 autonomous agent with filesystem access and API credentials is a significant attack surface. If the agent is compromised, misdirected, or enters a destructive loop, the blast radius can extend to data, infrastructure, and external services.

[Enterprise identity frameworks](https://www.okta.com/blog/2024/07/introducing-oktas-blueprint-for-secure-enterprise-agentic-ai/) are beginning to treat autonomous agents as non-human identities: distinct principals with enumerated permissions, discoverable via directory services, and subject to instant credential revocation. This is the correct framing — but the tooling is nascent. Most production deployments today rely on ad hoc sandboxing rather than principled identity management.

### Entropy management

Deterministic fences prevent individual boundary violations. They do not reverse accumulated drift. A codebase that receives 1,000 agent commits, each individually valid, will still exhibit structural decay — conventions that erode at the margins, abstractions that gradually shift meaning, documentation that falls out of sync with implementation.

The proposed solution — scheduled refactoring agents that run as "garbage collectors" against the codebase — exists in prototypes but has no established production pattern. Defining a metric for codebase health that a refactoring agent can optimise without introducing new instabilities is an open research problem.

### Standardisation

Every team builds bespoke harness primitives. There is no agreed interface between verification ladders, no standard schema for state files, no common protocol for circuit breaker signals. The Ralph Loop's Promise Tags, Superpowers' skill invocation protocol, and GSD's Nyquist validation layer are each isolated inventions solving the same underlying problems.

The field needs what CI/CD pipelines brought to deployment: standardised interfaces that decouple the primitives from specific implementations, enabling composition and interoperability. That standardisation does not yet exist.

---

## Closing

The model is commoditising. Claude 4, GPT-5, Gemini 3.1 — each successive generation improves reasoning capability while costs decline. Within a few years, raw model quality will be table stakes, not a differentiator.

The harness is where advantage compounds. Teams that have invested in deterministic fences, verification ladders, externalised state, and loop termination guarantees have built infrastructure that persists across model generations. When they swap to a newer model, their harness continues to constrain, verify, and recover. Teams that have not built this infrastructure do not benefit from model improvements — they are still limited by the reliability floor of unconstrained generation.

The inflection point is now. The four primitives are understood. The frameworks exist. The unsolved problems are known. The teams that build production-grade harnesses in 2026 are not just shipping better agentic systems — they are building the moat.

---

*References and further reading:*

- *OpenAI: [Harness engineering — leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)*
- *Anthropic: [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)*
- *Anthropic: [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)*
- *Temporal: [Durable execution meets AI](https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai)*
- *Temporal: [Production-ready agents with the OpenAI Agents SDK + Temporal](https://temporal.io/blog/announcing-openai-agents-sdk-integration)*
- *Aakash Gupta: [2025 Was Agents. 2026 Is Agent Harnesses.](https://aakashgupta.medium.com/2025-was-agents-2026-is-agent-harnesses-heres-why-that-changes-everything-073e9877655e)*
- *Epsilla: [Harness Engineering — Why the Focus is Shifting from Models to Agent Control Systems](https://www.epsilla.com/blogs/2026-03-12-harness-engineering)*
- *Okta: [Blueprint for Secure Enterprise Agentic AI](https://www.okta.com/blog/2024/07/introducing-oktas-blueprint-for-secure-enterprise-agentic-ai/)*
- *Infinite Agent Loop failure patterns: [agentpatterns.tech](https://www.agentpatterns.tech/en/failures/infinite-loop)*
