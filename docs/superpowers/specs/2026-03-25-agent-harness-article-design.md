# Article Design: The Harness Is the Moat

**Date:** 2026-03-25
**Type:** Blog post
**Platform:** btw personal blog
**Audience:** ML engineers / practitioners
**Tone:** Neutral analytical — thesis-driven, architecture-level, no working code
**Approach:** Thesis-first pyramid (Approach B)

---

## Title

> *The Harness Is the Moat: Why Autonomous AI Agents Live or Die by Their Architecture*

---

## Thesis

The competitive advantage of agentic systems in 2026 no longer lives in model parameters — it lives in the architecture wrapped around them. A production-grade harness, not a better model, is what enables reliable continuous autonomous execution.

---

## Article Structure

### Section 1: Thesis Hook

Opens with the multiplicative probability decay argument stated mathematically:

- A 10-step autonomous workflow at 85% per-step success yields ~19.7% end-to-end success rate
- Generalised: P(success) = p^n degrades rapidly as n (number of steps) grows
- The solution is not a smarter model — it is an enclosure that resets the probability vector deterministically at each step

**Thesis stated explicitly:** The competitive moat of 2026 is harness architecture, not model quality.

**Goal:** Hook the reader with a concrete, falsifiable argument before any definitions.

---

### Section 2: Defining the Harness

Precise definition: a harness is the complete software enclosure wrapping an LLM — managing tool execution, memory, state persistence, context compaction, and verification — while treating the model as a pluggable reasoning component.

**Key distinctions:**
- A prompt is not a harness
- A framework (LangChain, CrewAI) is not automatically a harness — it is a tool for building one
- The model is the engine; the harness is everything else

**Visual:** Mermaid architecture diagram showing concentric layers:
```
Orchestration Layer
  └── Memory / State Layer (filesystem, git)
        └── Verification Layer (ladder)
              └── Tool Execution Layer (sandboxed)
                    └── Model (pluggable reasoning component)
```

---

### Section 3: The Four Architectural Primitives

Every production harness must implement these four primitives, regardless of framework choice.

#### 3.1 Deterministic Fences
- Structural linters, dependency layer enforcement (DDD-style unidirectional imports), ArchUnit-style boundary tests
- The harness intercepts violations and rewrites them as targeted remediation instructions — turning failures into self-healing feedback
- **Failure mode if omitted:** architectural entropy, spaghetti dependencies, silent correctness degradation over time

#### 3.2 Verification Ladder
A sequential verification pipeline where each rung resets the probability vector before the next step:
1. Static analysis (syntax, file existence)
2. Deterministic linters
3. Compilation checks
4. Unit test execution
5. Headless UI testing (Puppeteer / Playwright)
6. LLM-based audit (secondary agent reviewing against original spec, operating in an independent context window — reduces accumulated error but does not fully reset it, as the auditor introduces its own error rate)

- **Failure mode if omitted:** code ships that passes visual inspection but fails behaviorally; human review becomes the bottleneck (Datadog "scalability inversion")

#### 3.3 Externalised State & Context Compaction
- Treat the context window as volatile RAM; treat filesystem + git as persistent storage
- Compaction technique: at the end of each loop, distill critical decisions, unresolved bugs, and implementation state into structured markdown files (STATE.md, NOTES.md, PROJECT.md); discard raw logs
- Each completed task results in an atomic git commit — git becomes the memory substrate
- **Failure mode if omitted:** "Lost in the Middle" degradation, looping behaviors, spiraling inference costs, context rot across sessions

#### 3.4 Loop Termination Guarantees
Three-layer circuit breaker architecture:
1. **Budget-aware runtimes** — hard token/cost limits linked to execution state
2. **Cycle detection middleware** — semantic similarity analysis of consecutive tool calls; blocks identical failed strategies
3. **Durable execution checkpointing** — Temporal-style immutable step logs; enables forking execution at the exact divergence point and replaying parallel recovery branches

- **Failure mode if omitted:** infinite loops drain infrastructure budget; blunt timeout mechanisms guarantee re-entry into the trap

**Visual:** Comparison table mapping each primitive to its failure mode if omitted.

---

### Section 4: Four Frameworks as Case Studies

Each framework is analysed as evidence of how different engineering philosophies solve the same underlying four primitives. All four are open-source / publicly documented harness implementations that emerged from the practitioner community in 2024–2025.

| Framework | Origin | Core Philosophy | Primitive Strength | Best Fit |
|---|---|---|---|---|
| Autoresearch | Andrej Karpathy; open-source, community-extended | Metric-driven ratchet loop | Verification (ungameable scalar metric: val_bpb) | ML experimentation, architecture search |
| Ralph Loop | Geoffrey Huntley; open-source bash harness | Filesystem-first, context-purge-per-iteration | State externalisation, mechanical backpressure via CI | Sequential feature engineering, bug resolution |
| Superpowers | Jesse Vincent; open-source skill library | Methodological enforcement (TDD mandatory) | Deterministic fences (deletes code written before tests), brainstorming gate | Greenfield architecture, quality-critical systems |
| GSD | TÂCHES / Pi SDK; open-source orchestration framework | Parallel wave orchestration | Context isolation per worker (fresh 200k window), Nyquist validation | Large-scale multi-feature deployments |

Trade-offs are sourced from public documentation and community write-ups — no proprietary or unverifiable claims.

Each framework sub-section covers:
- **Architecture diagram** (Mermaid state machine of its execution loop)
- **Primary primitive it excels at**
- **The failure mode it was specifically designed to prevent**
- **Where it falls short** (neutral, analytical — not ranking, just trade-offs)

#### 4.1 Autoresearch
- 3-file system: program.md (constraints), prepare.py (immutable evaluator), train.py (agent sandbox)
- Ratchet loop: propose → train (fixed 5-min wall-clock budget) → evaluate → keep/revert
- Primitive strength: verification via val_bpb prevents reward hacking
- Limitation: domain-specific (ML training); not generalised to software engineering tasks
- **Attribution note:** Autoresearch was originally designed by Andrej Karpathy for autonomous ML experimentation; the version discussed here refers to the public open-source implementation and its community-extended forks (e.g. autoresearch-win-rtx, AutoResearchClaw). The article should acknowledge this attribution chain clearly.

#### 4.2 Ralph Loop
- while-true bash loop; context purged at every iteration
- State in tasks.json + git commit history; STEERING.md for human injection mid-run
- Promise Tags for semantic signaling: `<promise>COMPLETE</promise>`, `<promise>BLOCKED:reason</promise>`
- Primitive strength: mechanical backpressure (Vitest, ESLint, TypeScript, headless screenshots)
- Limitation: sequential by design; no parallel execution

#### 4.3 Superpowers
- Skill-based behavioral enforcement: brainstorming gate, TDD enforcement, mandatory git worktree isolation
- If implementation code precedes test code, the harness deletes the implementation
- Primitive strength: deterministic fences via process (RED-GREEN-REFACTOR is mechanically enforced)
- Limitation: requires human approval gates; not fully autonomous

#### 4.4 GSD (Get Shit Done)
- Four-phase state machine: Discuss → Plan → Execute → Verify
- Parallel worker subagents each receive a fresh 200k-token context window with only their task slice
- Nyquist validation: every plan item must map to a terminal test command before execution begins
- Orchestrator maintains 30-40% context utilisation; workers are amnesiac
- Primitive strength: context isolation eliminates context rot at scale
- Limitation: orchestration complexity; high coordination overhead for small tasks

---

### Section 5: Practical Guidance for ML Engineers

Architecture-level action items, ordered by priority. Each item includes the failure mode it prevents. **Tone note:** this section intentionally permits one level of concreteness beyond pure architecture (e.g. "log to git" rather than "use an immutable audit log") to make the guidance actionable for practitioners. It should not descend to code snippets or implementation recipes.

1. **Start with the verification ladder, not the agent loop**
   - Define your "done" signal (what automated test must pass?) before writing any prompts
   - Failure mode prevented: agents that "complete" tasks with no ground truth for success

2. **Treat your context window like a CPU register, not a database**
   - Design explicit compaction checkpoints from day one
   - Decide what gets written to STATE.md vs. discarded after each loop
   - Failure mode prevented: context rot, "Lost in the Middle", spiraling inference costs

3. **Pick one ungameable success metric before you ship**
   - If the agent can delete tests to make tests pass, it will
   - ML example: val_bpb (vocabulary-independent, agent cannot manipulate it). Software engineering analogue: an external integration test suite the agent cannot modify.
   - The principle generalises: any metric the agent controls the evaluation of is gameable
   - Failure mode prevented: reward hacking, Goodhart's Law in agentic loops

4. **Enforce architectural boundaries mechanically, not through prompts**
   - A linter that fails the build is a fence; a prompt that says "follow layered architecture" is not
   - Failure mode prevented: silent architectural entropy over hundreds of agent commits

5. **Budget your circuit breakers explicitly before the first production run**
   - Define: max token budget, max retry count, semantic similarity threshold for cycle detection
   - These are not defaults you discover in an incident
   - Failure mode prevented: runaway token burn, infinite loops draining infrastructure budgets

6. **Log every state transition to git, not just stdout**
   - Atomic commits per completed task give you free time-travel debugging
   - Makes durable execution recovery tractable without requiring Temporal
   - Failure mode prevented: inability to recover from mid-workflow failures without full restart

---

### Section 6: Open Problems

Neutral analytical close — unsolved challenges, not predictions.

1. **Trust verification at scale (Scalability Inversion)**
   - AI ships code exponentially faster than humans can review it
   - Current verification ladders are necessary but not sufficient
   - LLM-based auditors reviewing LLM-generated code: unknown reliability ceiling

2. **Identity and governance**
   - Non-human agent identities require new access control primitives
   - Shadow agent discovery, per-tool permission mapping, enterprise kill switches
   - The security surface of 24/7 autonomous systems with filesystem + API access is largely unsolved

3. **Entropy management**
   - Codebases degrade over time even with fences (technical debt accumulates across thousands of agent commits)
   - This is an extension of the Deterministic Fences primitive (Section 3): fences prevent immediate violations but do not reverse accumulated drift
   - Scheduled refactoring agents ("garbage collection agents") have been proposed but have no established production pattern; this is an open research direction with no current solution

4. **Standardisation gap**
   - No agreed interface between harness primitives
   - Every team builds bespoke verification ladders, compaction strategies, and circuit breakers
   - The field needs something analogous to what CI/CD pipelines did for deployment

**Closing restatement of thesis:** The model is commoditising. The harness is where durable engineering advantage compounds.

---

## Visual Artifacts Required

1. Concentric-layer architecture diagram (Section 2)
2. Primitive → failure mode comparison table (Section 3)
3. Mermaid state machine per framework — Autoresearch, Ralph Loop, Superpowers, GSD (Section 4)
4. Framework comparison table (Section 4)

---

## What This Article Is Not

- Not a tutorial (no copy-paste code)
- Not a product review or ranking
- Not predictions — only present-state analysis and open problems

---

## Sources to Reference

- OpenAI: Harness Engineering / Codex 1M-line experiment
- Anthropic: Harness design for long-running applications; Effective harnesses for long-running agents
- Temporal: Durable execution for AI agents
- Datadog: Scalability inversion / observability in agentic systems
- Okta: Non-human identity framework for agentic enterprise
- Autoresearch (Karpathy), Ralph Loop (Geoffrey Huntley), Superpowers (Jesse Vincent), GSD (TÂCHES / Pi SDK)
