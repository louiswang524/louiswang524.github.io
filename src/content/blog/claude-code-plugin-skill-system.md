---
title: "Designing for Extensibility: How Claude Code's Plugin and Skill System Works"
description: "Claude Code has two extension points: skills (slash commands that inject prompt content) and plugins (packages that contribute commands, MCP servers, and hooks). Here's how each works and why they're designed differently."
date: 2026-03-31
tags: ["Claude Code", "plugins", "skills", "MCP", "extensibility", "software architecture"]
---

When you type `/simplify` in Claude Code, a skill runs. When you install a plugin, it can add new slash commands, connect external tools via the Model Context Protocol (MCP), and hook into lifecycle events. These are two very different extension mechanisms built for two different user types.

Understanding why they are separate — and where each mechanism draws its boundaries — is the design lesson. This post explains both from the source up.

This is post 5 of 5 in the *Demystifying Claude Code* series. Post 1 covered the [full architecture](/blog/demystifying-claude-code-architecture). Post 2 covered the [tool use loop](/blog/claude-code-tool-use-loop). Post 3 covered the [permissions model](/blog/claude-code-security-permissions). Post 4 covered [multi-agent patterns](/blog/claude-code-multi-agent-patterns). Here we close with extensibility.

## Skills — Prompt Injection as Extension

A skill is a named piece of prompt content. When you invoke `/simplify`, the `SkillTool` looks up the skill by name, retrieves its content, and injects it into the Claude conversation as a user message. Claude reads the skill content and acts on it. Nothing more happens at the code level — the execution is entirely driven by Claude following the injected instructions.

This design is deliberate. A skill is not a plugin, not a script, not an API call. It is a mini-prompt that encodes a workflow in natural language. `simplify.ts` defines a skill that asks Claude to review recently changed code for quality, reuse, and efficiency, then fix any issues found. The skill content itself is a structured prompt with specific instructions for how to approach the task.

The `loop.ts` bundled skill implements a recurring execution pattern: run a command on a fixed interval, continue until stopped. It encodes this behavior entirely in natural language instructions to the model.

What makes skills powerful is what they are *not* doing. They do not execute code. They do not call APIs. They do not modify the agent's behavior at the TypeScript level. They give Claude a new task framing, and Claude's general capability does the rest.

This matters for security. A skill loaded from an untrusted source can give Claude bad instructions. That is bad. But it cannot exfiltrate data, spawn processes, or modify the agent's permission model. The worst-case blast radius of a malicious skill is bounded by what Claude itself is allowed to do — which is itself bounded by the permission model. Skills are sandboxed by Claude.

## The Skill Registry and SkillTool

Skills reach the user through a pipeline that starts at session initialization.

**Registration.** `bundledSkills.ts` registers all built-in skills at startup. In parallel, `loadSkillsDir.ts` scans `~/.claude/skills/` for user-created or plugin-installed skill files. Each file becomes an entry in the skill registry, keyed by the skill's name (derived from the filename or a `name` field in the skill's frontmatter).

**Invocation.** When the user types `/simplify`, the command is routed to `SkillTool`. The tool receives the skill name as its `skill` parameter, looks it up in the registry, and retrieves the skill content.

**Injection.** `prompt.ts` formats the skill content as a user message and returns it to `SkillTool`. `SkillTool` injects this message into the current conversation. Claude sees the skill instructions as if the user had typed them directly.

**Execution.** Claude reads the injected content and acts on it using its standard tool-use loop. The skill content may instruct Claude to call specific tools in a specific order, apply specific criteria, or produce a specific output format. The model follows these instructions using the same tool use machinery described in Post 2.

The skill system is composable: a skill can instruct Claude to invoke another skill via a tool call. A skill can also reference external resources, ask Claude to read specific files, or perform multi-step workflows. The entire workflow is encoded in the skill's prompt content.

The bundled skills in Claude Code include `/simplify` (code quality review), `/loop` (recurring execution), `/remember` (save facts to memory), `/verify` (verification before claiming completion), and others. Each is a named workflow — a reusable task framing that any user can invoke.

## Plugins — Packages That Extend the Agent

A plugin is an installable package. Where a skill contributes a single prompt-based workflow, a plugin can contribute three types of extension: **commands**, **MCP servers**, and **hooks**.

**Commands** are slash commands that function like skills but are distributed as part of a package. A plugin named `code-review` might contribute a `/review` command. The command's behavior is defined by the plugin and can include both prompt content (like a skill) and MCP-backed tool calls.

**MCP servers** are the plugin's most powerful contribution type. A plugin can register one or more MCP servers, which are external processes that expose tools via the Model Context Protocol. When the plugin is installed and loaded, Claude Code starts the MCP server processes and registers their tools in the tool registry. Claude can then call those tools exactly like built-in tools.

**Hooks** allow plugins to run code at specific points in the agent lifecycle: session start, post-compact (after the context window is compressed), and other defined events. A plugin hook can initialize external connections, load configuration, or modify agent settings before the session begins.

The plugin lifecycle is managed by `PluginInstallationManager.ts`. When a plugin is installed, the manager discovers it from the plugin registry (by name, URL, or local path), validates its manifest, and adds it to the local plugin store. When a session starts, the manager loads all installed plugins, validates their manifests against the expected schema, and registers their contributions — commands into the command registry, MCP servers into the MCP client manager, hooks into the hook dispatcher.

Validation catches structural errors: missing required fields, unsupported contribution types, malformed MCP server configurations. It does not validate the semantic content of contributions (whether the commands do what they claim, whether MCP servers behave correctly). That is a trust question, not a schema question.

## MCP — The Open Protocol

Model Context Protocol (MCP) is an open standard published by Anthropic for external tool integration. An MCP server exposes tools in a standardized JSON schema format. Any MCP-compatible client — including Claude Code — can discover and call those tools without knowing anything about the server's implementation language or runtime.

In practice: you implement an MCP server in Python, Rust, Go, or any other language. The server exposes a list of tools via the MCP protocol. A user adds the server to their Claude Code settings. Claude Code starts the server process, queries its tool list, and registers those tools alongside the built-in TypeScript tools. From Claude's perspective, an MCP tool is indistinguishable from a built-in tool — same JSON Schema input, same tool_result output format.

Why does this matter for extensibility? It removes language and team lock-in. Building a Claude Code plugin that contributes MCP-backed tools does not require writing TypeScript or understanding Claude Code internals. You implement a server in your preferred language, expose the MCP protocol, and register the server. Any team with an internal service can expose it as an MCP server and make it available to Claude.

It also enables a shared ecosystem. An MCP server built for one MCP-compatible client works with any other MCP-compatible client. Infrastructure built for Claude Code can be reused in other agents that support the protocol.

The MCP client in Claude Code lives in `services/mcp/`. It manages the lifecycle of server processes, handles connection failures, and maintains the tool registry entry for each server's contributed tools. MCP connections are tracked in AppState alongside other agent state, which means they are subject to the same serialization and inspection as everything else in the agent.

The MCP specification is published at [modelcontextprotocol.io](https://modelcontextprotocol.io).

## Design Lesson

> **Design Lesson: Extension points have a cost — design fewer and make them composable**
>
> 1. **Different extension points for different users.** Skills target prompt engineers: write a markdown file, get a slash command. Plugins target developers: write a package, get deep integration including external processes and lifecycle hooks. Don't conflate them. They have different distribution models (file vs. package), different security models (prompt-bounded vs. process-execution), and different maintenance costs.
>
> 2. **Injection over modification.** Skills do not modify agent code — they inject content into the conversation. This makes them safe to load from untrusted sources, because their blast radius is bounded by what Claude is allowed to do. Extensions that need to modify agent internals (hooks, MCP servers) require higher trust and go through the plugin lifecycle, not the skill system.
>
> 3. **Use open protocols where possible.** MCP means Claude Code's tool ecosystem is not limited to what Anthropic builds. Any team can build an MCP server. Any MCP-compatible agent can use it. Open protocols compound — each server built once becomes available to every compatible client. Proprietary plugin APIs don't.

## So What?

If you are building an extensible agent, resist the urge to have one extension mechanism that does everything. Skills and plugins exist because the use cases diverge: one serves prompt writers who want to encode workflows, the other serves developers who want to integrate services. Conflating them would make both worse.

Design skills — or their equivalent — as pure prompt artifacts with no code execution. Keep the blast radius small. Design plugins — or their equivalent — as packages with a declared manifest, a lifecycle, and a contribution schema. Register contributions explicitly; don't let plugins reach into internals.

And for tool integration, use MCP or an equivalent open protocol. Your agent's utility scales with its tool ecosystem, and open protocols let others build that ecosystem for you.

## Source Code

Key files referenced in this post:

- **`skills/bundledSkills.ts`** — registers all built-in skills (simplify, loop, remember, verify, etc.) at session startup
- **`skills/bundled/simplify.ts`** — concrete bundled skill: code quality review workflow encoded as prompt content
- **`skills/bundled/loop.ts`** — concrete bundled skill: recurring command execution with configurable interval
- **`skills/loadSkillsDir.ts`** — scans `~/.claude/skills/` for user and plugin-installed skill files
- **`tools/SkillTool/SkillTool.ts`** — the LLM-callable tool that executes skill invocations
- **`tools/SkillTool/prompt.ts`** — formats skill content as a user message for injection into the conversation
- **`services/plugins/PluginInstallationManager.ts`** — plugin lifecycle: discover, validate, install, load, register
- **`services/plugins/pluginOperations.ts`** — plugin installation and removal operations
- **`services/mcp/`** — MCP client manager: server process lifecycle, tool registration, connection handling
