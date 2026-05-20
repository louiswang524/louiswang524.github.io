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

### 4. Message Bus

### 5. Shared State

## How to Choose

## Closing
