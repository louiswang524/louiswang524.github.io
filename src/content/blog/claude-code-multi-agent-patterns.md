---
title: "Multi-Agent Patterns: Swarm, Teammates, and the Coordinator"
description: "Claude Code can run multiple Claude instances in parallel within the same process. Here's how in-process teammates, permission sync, and coordinator mode work — and what it means for building your own multi-agent system."
date: 2026-03-31
tags: ["Claude Code", "multi-agent", "AI agents", "concurrency", "software architecture"]
---

Some tasks are genuinely parallelizable. Write tests while refactoring the implementation. Research three libraries at once. Have one agent write code while another reviews it. Claude Code supports this with in-process teammates — multiple Claude instances running in the same Node.js process, coordinated by a leader.

This is not the same as spawning child processes or making parallel API calls from a script. In-process teammates share memory, communicate via message-passing, and synchronize on permissions through a mailbox protocol. Understanding how this works reveals a design template for any multi-agent system.

This is post 4 of 5 in the *Demystifying Claude Code* series. Post 1 covered the [full architecture](/blog/demystifying-claude-code-architecture). Post 2 covered the [tool use loop](/blog/claude-code-tool-use-loop). Post 3 covered the [permission model](/blog/claude-code-security-permissions). Here we zoom into multi-agent coordination.

## Why Multiple Agents?

Three distinct motivations justify the complexity of a multi-agent system.

**Speed.** Independent subtasks can run in parallel. A task that takes three minutes sequentially might take one minute with three workers. The constraint is independence — tasks that share state or depend on each other's output cannot meaningfully parallelize.

**Specialization.** Different agents can have different tool access, different system prompts, and different areas of the codebase. A coordinator that only synthesizes results has a cleaner context window than one that also executes every bash command along the way.

**Isolation.** Each agent has its own context window. A worker that reads 10,000 lines of test output does not pollute the leader's context. When a worker's task is complete, its context is discarded. The leader only sees the result.

These benefits come with real costs: coordination overhead, permission complexity, and harder debugging. Multi-agent architecture is worth it for large, parallelizable tasks. It is overkill for anything that fits in a single context window.

## In-Process Teammates via AsyncLocalStorage

The key technical question: how do multiple agents run in the same Node.js process without their state colliding?

Node.js is single-threaded. Two agents running "in parallel" are interleaved via the event loop, not truly concurrent. But their state — conversation history, active tools, permission context — must stay separate. If Agent A reads from Agent B's conversation history, the results are meaningless.

Claude Code solves this with `AsyncLocalStorage`, a Node.js API introduced in v12. AsyncLocalStorage creates a storage slot that is scoped to an async call chain. Every `await`, `Promise`, and callback spawned within a given `run()` call sees the same storage slot. Async contexts spawned outside that `run()` see a different slot, or none at all.

`spawnInProcess.ts` creates a new teammate by cloning the current AppState and wrapping the teammate's execution inside `runWithTeammateContext()`. This wrapper calls `asyncLocalStorage.run(teammateContext, callback)`, where `teammateContext` is the cloned state. From that point forward, any state read or write within the teammate's async chain — no matter how deeply nested — accesses the teammate's context, not the leader's.

Here is the mental model: each teammate owns a thread-local store for its async subtree. The Node.js runtime ensures that the chain of awaits, callbacks, and event handlers all resolve to the same slot. There is no shared mutable state between leader and worker. State updates to one context are invisible to the other.

Why in-process rather than spawning a new process? Three reasons: no inter-process communication overhead, shared memory for read-only data (the tool registry, skill definitions, configuration), and no startup cost for initializing a new Claude Code session. A new child process would need to reload all configuration and re-establish connections. In-process teammates are ready immediately.

## The Permission Sync Problem

In-process teammates cannot prompt the user directly. The user is interacting with the leader's terminal. If a worker needs permission to run a dangerous command, it must route the request through the leader.

`permissionSync.ts` implements a mailbox protocol for this. When a worker reaches the `ask` state on a tool call, it does not block waiting for the interactive handler. Instead, it writes a permission request to a shared mailbox — a data structure in the leader's context. The request includes the tool name, input, and the worker's identifier.

The leader polls the mailbox as part of its normal operation. When it finds a pending request, it presents the user with the standard permission dialog: allow once, allow always, deny, abort. The user's response is written back to the mailbox, tagged with the worker's identifier.

The worker, meanwhile, polls the same mailbox for a response. When the response arrives, it resolves the permission check and continues execution (or stops, if denied).

This is an async request/response pattern over shared memory. The key constraint: the leader cannot be blocked on its own tool execution when a worker needs permission. If the leader is waiting for a bash command to complete, and a worker is waiting for the leader's response to a permission request, the system deadlocks.

Claude Code avoids this by keeping the permission mailbox check non-blocking. The leader's permission handler yields control when there is nothing to process. The event loop continues, the worker's permission request arrives, and the leader picks it up on its next tick.

## Coordinator Mode

The permission mailbox handles individual permission requests from workers. A higher-level pattern handles the overall orchestration: coordinator mode.

In coordinator mode, one Claude instance acts as an orchestrator whose job is to plan tasks, spawn workers, and synthesize results. It never executes bash commands or edits files itself. `coordinatorMode.ts` implements this through three mechanisms.

**System prompt differentiation.** The coordinator receives a system prompt that explicitly defines its role: plan, delegate, synthesize. Worker agents receive a different system prompt: execute, report, stop. This role separation is the most important part. Without it, every agent tries to do everything — the coordinator starts editing files, workers start spawning sub-workers, and the system becomes unpredictable.

**Tool restriction for workers.** Workers receive a restricted tool set. Team management tools (the tools used to spawn additional agents) are removed from worker tool lists. This prevents unbounded recursion: a worker cannot spawn its own sub-workers unless explicitly granted permission. The tool restriction is enforced at session initialization, before any task begins.

**Task notification format.** Workers report completion by emitting a structured notification to the coordinator. The notification includes the task identifier, a status (completed, failed, partial), and a result summary. The coordinator reads these notifications, tracks which tasks are done, and decides whether to synthesize results or spawn additional workers.

The notification format is defined in the source as a structured message that the coordinator parses to update its task tracking state. This creates an explicit contract between workers and coordinator: workers do not need to know how the coordinator will use their output, and the coordinator does not need to know how the worker implemented its task.

## Task Lifecycle Tracking

Whether in coordinator mode or not, every background agent execution is tracked as a task in AppState.

`InProcessTeammateTask` represents a teammate running in the same process. `RemoteAgentTask` represents an agent running in a separate process (used by the bridge for remote sessions). Both implement the same task interface and follow the same lifecycle: pending → running → completed | failed | killed.

The task identifier links the AppState entry to the worker's execution context. If a worker fails, the task entry captures the error. The coordinator — or the user — can inspect task state at any point. Completed workers can be garbage-collected from memory without losing their output, because the output is stored in the task entry in AppState.

This lifecycle model is a prerequisite for any multi-agent system. If you cannot track which agents are running, which have finished, and which have failed, you cannot safely coordinate them.

## Design Lesson

> **Design Lesson: Multi-agent means distributed systems**
>
> 1. **Solve coordination explicitly.** Claude Code's mailbox pattern for permission sync is a simple message-passing system. It is not elegant — it is a polling loop over shared memory. But it is auditable: every permission request and response is a discrete message that can be logged, debugged, and reasoned about. Don't share mutable state between agents. Pass messages.
>
> 2. **Restrict worker capabilities with an allowlist, not a blocklist.** A worker that can spawn sub-workers, modify team configuration, or bypass permissions is a stability and security risk. Claude Code removes team management tools from worker tool lists at session initialization. Define what workers *can* do, not what they *cannot* do.
>
> 3. **Design the task model before the agent model.** How do you track which agents are running? How do you capture failures? How do you garbage-collect completed agents? Claude Code's answer is AppState task entries with a defined lifecycle. Build this first — before the agent communication protocol, before the UI.

## So What?

If you are building a multi-agent system, the technology for running agents in parallel is the easy part — a few `Promise.all` calls or async workers. The hard part is coordination: how agents communicate, how permissions flow, and how the system recovers from failures.

Claude Code's answer is explicit and auditable: a shared mailbox for permissions, defined task lifecycle in a central store, and system prompt differentiation that tells each agent its role. None of these are novel distributed systems techniques. They are old patterns applied to a new domain. That is exactly the right approach.

## Source Code

Key files referenced in this post:

- **`utils/swarm/spawnInProcess.ts`** — creates an in-process teammate using AsyncLocalStorage context wrapping
- **`utils/swarm/inProcessRunner.ts`** — runs the teammate's query loop within the isolated context
- **`utils/swarm/permissionSync.ts`** — mailbox protocol for routing permission requests from workers to the leader
- **`utils/swarm/teamHelpers.ts`** — team management utilities: listing, stopping, and querying active teammates
- **`coordinator/coordinatorMode.ts`** — coordinator system prompt, worker tool restrictions, and task notification format
- **`tasks/InProcessTeammateTask/`** — task type for in-process agents with pending/running/completed lifecycle
- **`tasks/RemoteAgentTask/`** — task type for agents running in remote processes (bridge sessions)
- **`tools/AgentTool/`** — the LLM-callable tool that spawns agents in response to model requests
