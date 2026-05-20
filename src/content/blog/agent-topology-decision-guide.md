---
title: "Picking the Wrong Agent Topology Is Your Most Expensive Mistake"
description: "Five multi-agent design patterns — with a decision guide for when each one earns its complexity and when it will burn you."
date: 2026-05-19
tags: ["AI agents", "multi-agent systems", "LLM", "software architecture", "harness engineering"]
---

Most debates about multi-agent systems start with the wrong question: which model should each agent use? The real question is how the agents are wired together. Pick the wrong topology and you get coordination overhead you can't debug, silent failures that look like success, or reactive loops that never converge.

This post is a synthesis of a presentation by [Alex Koren](https://www.linkedin.com/in/alexekoren/) on agent harness architectures. It covers five design patterns, a decision guide for choosing between them, and the failure modes each one introduces.

## Why Multi-Agent Systems at All?

Before choosing a topology, justify the investment. Three distinct problems make multi-agent systems worth their coordination cost.

**Context protection.** A task that fills the main context window with data only that task needs pollutes the reasoning environment for everything else. Run that task in a subagent and return a 50-token summary. The main agent stays clean.

**Specialization.** Some tasks have conflicting requirements — different personas, different tool permissions, different system constraints. A single agent cannot hold contradictory instructions without degrading. Separate agents can each be configured for one job.

**Parallelization.** A single agent explores one path at a time. Multiple agents can explore a larger search space simultaneously — the benefit is thoroughness, not just speed.

The practical rule that follows from these three: *divide the work by context, not problem type.* The question is not "what kind of task is this?" It is "what context does this task need, and does it conflict with anything else?"

## The Five Patterns

### 1. Orchestration Agent

### 2. Generator-Verifier

### 3. Agent Team

### 4. Message Bus

### 5. Shared State

## How to Choose

## Closing
