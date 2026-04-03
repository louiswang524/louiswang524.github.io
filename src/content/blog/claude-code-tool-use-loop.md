---
title: "The Tool Use Loop: How Claude Code Executes Code, Edits Files, and Talks Back"
description: "A tool call is a structured JSON request from the LLM to run a named function. Here's exactly how Claude Code handles the full lifecycle — from API call to file edit to loop continuation."
date: 2026-03-31
tags: ["Claude Code", "tool use", "LLM", "AI agents", "Anthropic API"]
---

You ask Claude Code to fix a bug. Within seconds, it reads a file, edits a function, runs `npm test`, reads the failing output, edits again, and re-runs the tests. All from one prompt.

How does a language model — a system that only generates text — do all of that?

The answer is **tool use**: a protocol where the LLM outputs structured JSON requests to run named functions, and the agent host decides whether to execute them. The model never touches your filesystem directly. It asks. The agent acts.

This post is a precise walkthrough of that loop, grounded in the actual Claude Code TypeScript source. It is post 2 of 5 in the *Demystifying Claude Code* series. Post 1 covered the [full architecture](/blog/demystifying-claude-code-architecture). Here we zoom into the engine room.

## What a Tool Is

A tool in Claude Code is a TypeScript object that conforms to the `Tool` type defined in `Tool.ts`. Four fields matter most.

**`name`** is the string identifier the LLM uses when it wants to call the tool. For example, the shell executor is `"Bash"` (defined in `toolName.ts`). The file editor is `"Edit"` (defined in `constants.ts`).

**`description`** is natural language the model reads to decide *when* to use the tool. This field is load-bearing. A vague description means the model will pick the wrong tool — or never pick the right one. BashTool's description returns `"Run shell command"`. FileEditTool returns `"A tool for editing files"`. Each tool also has a longer `prompt()` method that provides detailed usage instructions in the system prompt.

**`inputSchema`** defines the parameters the tool accepts, using Zod (a TypeScript validation library). FileEditTool accepts `file_path`, `old_string`, `new_string`, and an optional `replace_all` boolean. BashTool accepts a `command` string and optional `timeout` and `description` fields.

**`call`** is the function that actually executes. It receives the parsed input and a `ToolUseContext` object that carries the conversation history, abort controller, and app state. It also receives a `canUseTool` permission callback. The return value is a `ToolResult` containing the output data.

Here is the real FileEditTool input schema from `types.ts`:

```typescript
z.strictObject({
  file_path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().default(false).optional(),
})
```

The LLM sees a JSON Schema version of this. When it decides to edit a file, it emits a `tool_use` content block with `name: "Edit"` and an `input` object matching this shape. The agent validates the input against the schema before execution.

## The Query-Stream-Tool Loop

The core loop lives in `query.ts`, inside an `async function* queryLoop` that runs as a `while (true)` loop. Here is what happens on each iteration.

**Step 1: Send messages to Claude.** The agent assembles the full conversation — system prompt, user messages, prior assistant messages, and prior tool results — and streams it to the Claude API. The tool definitions are included so the model knows what it can call.

**Step 2: Stream the response.** Claude streams back content blocks: text blocks (the model's words) and `tool_use` blocks (structured function call requests). Each `tool_use` block contains a `name`, an `input` object, and a unique `id`.

**Step 3: Collect tool use blocks.** As `tool_use` blocks arrive during streaming, they are pushed into a `toolUseBlocks` array. A `needsFollowUp` flag is set to `true` whenever at least one tool use block exists. This flag is the signal that the loop should continue.

**Step 4: Execute tools.** After streaming completes, the agent runs each tool — or, with `StreamingToolExecutor`, as soon as each block arrives during streaming (covered in Section 4). For every `tool_use` block, it looks up the matching tool by name using `findToolByName`, calls the permission gate (the `canUseTool` callback), and — if approved — calls the tool's `call` method.

**Step 5: Handle denials.** If the permission gate denies a tool call, the agent does *not* silently drop it. Instead, it constructs a `tool_result` message with `is_error: true` and a denial message sourced from the `REJECT_MESSAGE` constant in the source. This structured error result is returned to the LLM just like a successful result. The model sees the denial and can adapt — try a different approach, ask the user, or stop.

**Step 6: Append results to history.** Each tool result (success or denial) becomes a user message with a `tool_result` content block, linked to the original `tool_use` by `tool_use_id`. These are pushed into the `toolResults` array.

**Step 7: Check for loop continuation.** If `needsFollowUp` is true (tool use blocks existed), the agent builds the next iteration's message array:

```typescript
messages: [...messagesForQuery, ...assistantMessages, ...toolResults]
```

This becomes the input for the next `while (true)` iteration. The model sees the full conversation including what each tool returned and can decide what to do next.

**Step 8: Exit condition.** If no `tool_use` blocks were present in the response (`needsFollowUp` is false), the loop exits with `{ reason: 'completed' }`. The model said everything it wanted to say without requesting any tool calls.

The key insight: **the LLM never directly executes anything.** It makes requests. The agent decides whether to honor them. This separation is what makes tool use safe to build on.

## Parallel vs. Serial Execution

When Claude returns multiple `tool_use` blocks in one response, Claude Code does not simply run them all in parallel or all in series. It does something smarter.

The `toolOrchestration.ts` file contains a `partitionToolCalls` function that groups consecutive tool calls into **batches**. Each tool declares whether it is "concurrency safe" via an `isConcurrencySafe` method. Read-only operations (file reads, grep, glob) return `true`. Write operations (file edits, shell commands that modify state) return `false`.

Consecutive concurrency-safe tools are batched and run in parallel. Non-concurrency-safe tools each get their own batch and run serially. The code:

```typescript
if (isConcurrencySafe && acc[acc.length - 1]?.isConcurrencySafe) {
  acc[acc.length - 1]!.blocks.push(toolUse)
} else {
  acc.push({ isConcurrencySafe, blocks: [toolUse] })
}
```

Parallel batches run through `runToolsConcurrently`, which uses an async generator to interleave results. Serial batches run through `runToolsSerially`, which awaits each tool in sequence.

There is also a `StreamingToolExecutor` class that can start executing tools *while the model is still streaming*. When a `tool_use` block arrives in the stream, it is immediately queued for execution. This overlaps tool execution with the remaining stream, reducing total latency. The executor enforces the same concurrency rules: concurrent-safe tools run in parallel, non-concurrent-safe tools require exclusive access.

The tradeoff is clear. Parallel execution is faster — three file reads in parallel take the time of one. But parallel writes can conflict when they touch overlapping paths.

## Streaming UX

The model's response streams to the terminal in real time via Ink (a React-based terminal UI). You see text appearing token by token as the model generates it.

But tool calls create a different UX pattern. A `tool_use` block only becomes actionable once its complete JSON input has arrived. You cannot run `Edit` on a file until you have the full `old_string` and `new_string`. So the user experience has a natural rhythm:

1. Text appears in real time as the model explains what it will do.
2. A pause occurs while tools execute (the agent runs the requested operations).
3. More text appears as the model processes the results and continues.

With the `StreamingToolExecutor`, step 2 can overlap with step 1. If the model emits a `tool_use` block and then continues generating text, the tool starts executing immediately. By the time the model finishes streaming, some or all tool results may already be available.

The agent tracks in-progress tool IDs via `setInProgressToolUseIDs` so the UI can render spinners for tools that are still running. Completed results are yielded to the stream as they finish.

## Design Lesson

> **Design Lesson: Tools are your agent's API surface**
>
> 1. **Schema design is load-bearing.** The LLM selects tools based on description and input schema. Write tool descriptions like API documentation, not internal comments. Wrong description = tool never called, or called when it shouldn't be.
> 2. **Tools should do one thing.** Claude Code has 40+ tools, each narrowly scoped: `BashTool` runs shell commands, `FileEditTool` makes targeted edits, `FileReadTool` reads files. A tool that does three things forces the LLM to reason about three things at once.
> 3. **Denials are data.** When a tool call is denied, Claude Code returns a structured `tool_result` with `is_error: true` and a denial message from the `REJECT_MESSAGE` constant, explaining the operation was denied. The LLM can adapt — try a different approach, ask the user, or stop. Silently swallowing a denial leaves the LLM confused about why its plan didn't work.

## So What?

If you are building your own LLM-powered agent, the tool loop is the skeleton. Get this right first — before the UI, before multi-agent orchestration, before streaming optimizations.

Define tools with precise schemas and honest descriptions. Return structured results for both success and failure. Let the loop re-submit after every tool execution. That is the minimum viable agent.

The quality of your tool descriptions and schemas determines how reliably your agent behaves. Everything else is optimization.

## Source Code

Key files referenced in this post:

- **`Tool.ts`** — The `Tool` type definition, `buildTool` helper, and `ToolUseContext` type
- **`query.ts`** — The main `queryLoop` function: streaming, tool collection, re-submission logic
- **`services/tools/toolOrchestration.ts`** — Parallel/serial partitioning and batch execution
- **`services/tools/StreamingToolExecutor.ts`** — Concurrent tool execution during streaming
- **`services/tools/toolExecution.ts`** — Individual tool execution: permission check, call, result construction
- **`tools/BashTool/BashTool.tsx`** — Concrete tool example (shell command execution)
- **`tools/FileEditTool/FileEditTool.ts`** — Concrete tool example (targeted file editing)
- **`hooks/toolPermission/PermissionContext.ts`** — Permission gate context and deny/allow decision flow
