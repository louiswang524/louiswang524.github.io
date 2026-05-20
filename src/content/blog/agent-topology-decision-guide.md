---
title: "Picking the Wrong Agent Topology Is Your Most Expensive Mistake"
description: "Five multi-agent design patterns — with a decision guide for when each one earns its complexity and when it will burn you."
date: 2026-05-19
tags: ["AI agents", "multi-agent systems", "LLM", "software architecture", "harness engineering"]
---

Most debates about multi-agent systems start with the wrong question: which model should each agent use? The real question is how the agents are wired together. Pick the wrong topology and you get coordination overhead you can't debug, or silent failures that look like success. Worst case: agents burn tokens in reactive loops and never converge.

This post is a synthesis of a presentation by [Alex Koren](https://www.linkedin.com/in/alexekoren/) on agent harness architectures. It covers five design patterns, a decision guide for choosing between them, and the failure modes each one introduces.

## Why Multi-Agent Systems at All?

Before choosing a topology, justify the investment. Three distinct problems make multi-agent systems worth their coordination cost.

**Context protection.** A task that fills the main context window with data only that task needs pollutes the reasoning environment for everything else. Run that task in a subagent — a separate, isolated agent instance — and return a 50-token summary. The main agent stays clean.

**Specialization.** Some tasks have conflicting requirements — different personas, different tool permissions, different system constraints. A single agent cannot hold contradictory instructions without degrading. Separate agents can each be configured for one job.

**Parallelization.** A single agent explores one path at a time. Multiple agents can explore a larger search space simultaneously — the benefit is thoroughness, not just speed.

The practical rule that follows from these three: *divide the work by context, not problem type.* The question is not "what kind of task is this?" It is "what context does this task need, and does it conflict with anything else?"

## The Five Patterns

### 1. Orchestration Agent

One agent controls everything. The orchestrator receives the task, breaks it into subtasks, dispatches each to a worker agent, and collects results. Workers do not communicate with each other — all coordination flows through the center.

**Canonical use case:** A customer support pipeline. The orchestrator receives an inbound message and dispatches a classification agent to identify intent, a retrieval agent to pull relevant knowledge, a response agent to draft an answer, and a quality agent to approve it. Each worker sees only its slice of the problem.

**Use when:**
- The workflow is predetermined and sequential
- You need a single point of accountability for auditing or debugging
- Worker tasks have clear input/output contracts and no dependency on each other

**Avoid when:**
- The orchestrator itself becomes a bottleneck (high-throughput systems with many concurrent tasks)
- Tasks are truly independent and gain nothing from central routing
- Failure of the orchestrator takes down the entire pipeline

### 2. Generator-Verifier

One agent generates a candidate output. A second agent verifies whether it meets the acceptance criterion. If it fails, the generator tries again — with the verifier's feedback in context. The loop runs until the output passes or a budget (token or iteration) is exhausted.

**Canonical use case:** Web search. A generator agent proposes a search query and synthesizes results. A verifier agent checks whether the answer actually addresses the original question. If not, the generator reformulates the query. The loop converges on a grounded answer.

**Use when:**
- Output quality is binary or near-binary (correct / incorrect, safe / unsafe)
- Verification is significantly cheaper than generation
- You have a clear, automatable acceptance criterion the verifier can apply

**Avoid when:**
- The verifier is weak — a poor verifier just rubber-stamps bad output and the loop provides false confidence
- There is no clear acceptance criterion, so the loop has no exit condition
- Verification cost is comparable to generation cost, making iteration prohibitively expensive

### 3. Agent Team

Multiple agents work in parallel on non-overlapping subtasks. A coordinator assigns work and collects results, but agents do not share state or communicate with each other during execution. Each agent works in isolation.

**Canonical use case:** Codebase migration. A coordinator identifies 20 modules to migrate. It assigns each module to a separate agent. Each agent migrates its module independently, with no awareness of what the others are doing. The coordinator collects and integrates the results.

**Use when:**
- Tasks are genuinely independent — no shared resources, no shared state, no ordering dependencies
- Work is long-running and isolation improves reliability (a failure in one agent does not cascade)
- The problem space is too large for one agent's context window

**Avoid when:**
- Tasks share a resource (a database, a file, a config) — contention will corrupt results or cause failures
- The coordination overhead exceeds the parallelization gain for small task counts
- One agent's output is another agent's input — that dependency makes this an orchestration problem, not a team problem

### 4. Message Bus

There is no central coordinator. Agents publish events to a shared bus and subscribe to the topics they care about. The workflow is not hardcoded — it emerges from the event subscriptions. Adding a new agent means wiring up its subscriptions, not rewriting the orchestration logic.

**Canonical use case:** Security operations. An alert fires and an agent publishes a `new-alert` event. A triage agent subscribed to that topic picks it up, assesses severity, and publishes a `triaged-alert` event. An enrichment agent subscribed to high-severity alerts fetches threat intelligence and publishes an `enriched-alert` event. Each agent is unaware of the others — it only knows its input topic and output topic.

**Use when:**
- The agent ecosystem is growing and the relationships between agents are still evolving
- The workflow is not fully predetermined — new agents should be able to join without rewiring existing ones
- Loose coupling between agents matters more than execution traceability

**Avoid when:**
- You need deterministic execution order that is easy to audit
- Silent misroutes are dangerous — a misconfigured subscription means an agent never fires, with no error
- Cascade failures are hard to diagnose — an event that triggers three downstream agents can produce failures that are difficult to trace to a root cause

### 5. Shared State

Agents write their findings directly to a shared store — a document, a knowledge base, a structured log — that is visible to all agents immediately. There is no routing layer. The accumulated state is the output.

**Canonical use case:** Research synthesis. A coordinator spawns agents to explore different angles of a research question. Each agent reads the shared document as it grows, builds on what others have written, and adds its own findings. The final document is a synthesis no single agent could have produced alone.

**Use when:**
- The output is accumulated knowledge, not a single decision or verified answer
- Agents benefit from seeing each other's findings in real time
- The value of the system comes from combination, not from any individual agent's output

**Avoid when:**
- Agents reactively respond to each other's writes and trigger further writes — this creates feedback loops that burn tokens without converging
- There is no convergence criterion — the system needs an explicit stopping condition (iteration limit, quality threshold, human review gate)
- Write conflicts produce inconsistent state — concurrent writes to the same section require a coordination mechanism the pattern does not provide by default

## How to Choose

Three diagnostic questions narrow the field before you read the full pattern descriptions.

**1. Is the workflow predetermined, or does it emerge from events?**
If you can draw the sequence of steps before runtime, you're in orchestration, generator-verifier, or agent team territory. If the workflow depends on what each agent finds and publishes, look at message bus.

**2. Do tasks share state, or are they fully independent?**
Independent tasks point to agent team. Tasks that build on a shared artifact point to shared state. Tasks that flow through a central coordinator point to orchestration.

**3. Is the output a verified answer, or accumulated findings?**
A verified answer — correct code, a confirmed fact, an approved response — suggests generator-verifier. Accumulated findings — a research document, a threat report, an innovation brief — suggest shared state.

| Pattern | Coupling | Output | Best for | Watch out for |
|---|---|---|---|---|
| Orchestration | Tight (via orchestrator) | Directed result | Linear, predictable pipelines | Orchestrator as bottleneck |
| Generator-Verifier | Looped | Verified answer | Quality-gated output | Weak verifier approves bad output |
| Agent Team | Loose | Parallel results | Long-running independent tasks | Shared resource contention |
| Message Bus | Decoupled | Event stream | Growing event-driven ecosystems | Silent misroutes, cascade failures |
| Shared State | Coupled to store | Accumulated findings | Research synthesis | Reactive loops, no convergence |

## Closing
