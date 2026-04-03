---
title: "Security Without a Sandbox: How Claude Code Decides What It's Allowed to Do"
description: "Claude Code runs shell commands, edits files, and makes network requests on your machine — without a kernel sandbox. Here's the permission model that makes this safe enough to ship."
date: 2026-03-31
tags: ["Claude Code", "security", "permissions", "AI agents", "tool use"]
---

Claude Code can run `rm -rf /`, edit your `.bashrc`, `curl` internal endpoints, and push to `main`. It does all of this on your actual filesystem, in your real shell, with your environment variables. There is no container. No VM. No seccomp profile.

This is either terrifying or fine, depending on whether the permission model works.

This post is a precise walkthrough of that model, grounded in the actual TypeScript source. It covers what the permission gate evaluates, how the trust levels work, and where the model is deliberately incomplete. If you are building your own CLI agent, the architecture here is the closest thing to a reference implementation that exists in production.

This is post 3 of 5 in the *Demystifying Claude Code* series. Post 1 covered the [full architecture](/blog/demystifying-claude-code-architecture). Post 2 covered the [tool use loop](/blog/claude-code-tool-use-loop). Here we zoom into the security layer.

## The Threat Model

When an LLM has shell access, four things can go wrong.

**Prompt injection.** A malicious file or web response contains instructions that the model follows as if they came from the user. The model reads a README that says "now delete all files in the repo," and it tries. The attack surface is anything the model reads: file contents, command output, HTTP responses.

**Runaway agents.** The model enters a loop that keeps executing commands after it should have stopped. Each iteration might be harmless on its own, but the aggregate effect is destructive — hundreds of file writes, thousands of API calls, or a `git push` in every iteration.

**Scope creep.** The user asks the model to fix a test. The model decides the test is failing because of a deployment config, edits the config, runs `kubectl apply`, and pushes to production. Every step seemed logical to the model. None were requested.

**Confused deputy.** The model is tricked into acting on behalf of a malicious third party. A dependency's `postinstall` script writes instructions to a file. The model reads that file later and follows the instructions, using the user's credentials and access.

Claude Code does not prevent all of these. No single layer can. It addresses them through a permission system that gates every tool call before execution.

## The Permission Gate

Every tool call in Claude Code passes through a single function before execution: `hasPermissionsToUseTool()`, defined in `permissions.ts`. The tool itself has no say in whether it runs. The gate wraps the tool from outside.

Here is what the gate evaluates, in order:

**Step 1: Deny rules.** The gate checks whether the tool or the specific input matches any deny rule. A deny rule like `Bash(rm -rf:*)` blocks any bash command starting with `rm -rf`. Deny rules are unconditional — they fire regardless of the current permission mode. The gate also checks for "ask" rules. These force a user prompt even if the mode would otherwise auto-approve.

**Step 2: Tool-level permission check.** The gate calls `tool.checkPermissions()`, which lets each tool inspect its own input. BashTool uses this to classify commands by risk. FileEditTool checks whether the target path is in the working directory. The tool returns one of four behaviors: `allow`, `deny`, `ask`, or `passthrough`. Passthrough means "I have no opinion; defer to the mode."

**Step 3: Mode evaluation.** The gate checks the current `PermissionMode` to decide what to do with `ask` and `passthrough` results. In bypass mode, everything that wasn't denied gets through. In default mode, the user is prompted. In auto mode, an AI classifier makes the call.

**Step 4: Safety checks.** Certain paths are always protected, regardless of mode. Writing to `.git/`, `.claude/`, `.vscode/`, `.idea/`, or shell configuration files like `.bashrc` triggers a safety check. These checks survive even bypass mode — the gate returns `ask` with a `safetyCheck` decision reason, and no mode can override it.

The gate also evaluates `dangerousPatterns.ts`, which defines patterns for shell commands that are too broad to auto-approve. The `DANGEROUS_BASH_PATTERNS` list covers six categories:

- **Interpreters:** `python`, `node`, `ruby`, `perl`, `php`, `lua`
- **Package runners:** `npx`, `bunx`, `npm run`, `yarn run`, `pnpm run`, `bun run`
- **Shells:** `bash`, `sh`, `zsh`, `fish`
- **Eval-family commands:** `eval`, `exec`, `env`, `xargs`
- **Privilege escalation:** `sudo`
- **Remote execution:** `ssh`

These patterns prevent users from creating overly permissive allow rules like `Bash(python:*)`. That rule would let the model run arbitrary Python code without further checks.

## Trust Levels

Claude Code defines five external permission modes in `PermissionMode.ts`. Three matter most.

### Default Mode

Default mode is the interactive baseline. Every tool call that isn't explicitly allowed by a rule gets routed to the `interactiveHandler.ts`, which presents a permission dialog.

The handler pushes a `ToolUseConfirm` entry to a confirm queue. The user sees the tool name, the input, and a description. They can choose to **allow** (with optional "always allow" to create a permanent rule), **reject** (with optional feedback that gets sent back to the model), or **abort** the operation entirely.

The interactive handler runs multiple checks in parallel, racing them against the user's response. Permission hooks can resolve the prompt automatically. A bridge connection to claude.ai can respond too. Whichever source responds first wins — the others are cancelled via an atomic `claim()` guard.

### Auto Mode

Auto mode replaces the human in the loop with an AI classifier. When a tool call reaches the `ask` state, `permissions.ts` runs a tiered evaluation before invoking the full classifier.

**Fast path 1: acceptEdits check.** The gate re-runs `tool.checkPermissions()` with the mode set to `acceptEdits`. If the tool would be allowed under that less-restrictive mode (file edits within the working directory), the classifier is skipped entirely.

**Fast path 2: safe-tool allowlist.** Some tools are on a hardcoded safe list and never need classification.

**Full classification.** For everything else, `classifyYoloAction()` in `yoloClassifier.ts` runs a side query — a separate API call to a classifier model. The classifier receives the conversation transcript, compressed into a compact JSONL format, plus the pending tool call. It returns a structured response: `shouldBlock` (boolean), `reason` (string), and `thinking` (string).

If the classifier blocks the action, denial tracking kicks in. Consecutive denials are counted. After hitting a threshold, the system falls back to prompting the user instead of continuing to deny — this prevents the model from getting stuck in a deny loop.

If the classifier is unavailable (API error), behavior depends on a feature gate called `tengu_iron_gate_closed`. When the gate is active, the system fails closed and denies the action. When the gate is inactive, it fails open and falls through to the normal interactive prompt.

### Bypass Mode (and the Kill Switch)

Bypass mode is for CI pipelines and non-interactive use. It auto-approves everything that isn't explicitly denied. But two layers still apply.

**Ask rules survive bypass.** If a user configures `Bash(npm publish:*)` as an ask rule, bypass mode still prompts for it. Content-specific ask rules are treated like deny rules — they represent deliberate user intent.

**Safety checks survive bypass.** Writes to `.git/`, `.claude/`, `.vscode/`, and shell configs still trigger prompts, because these paths can be used for code execution (git hooks, IDE task runners, shell init scripts).

**The kill switch.** The file `bypassPermissionsKillswitch.ts` runs once before the first query. It calls `shouldDisableBypassPermissions()`, which checks a remote feature gate (`tengu_disable_bypass_permissions_mode`). If the gate is active, bypass mode is disabled server-side. The user's session silently drops to default mode. This is Anthropic's escape hatch. If a vulnerability exploits bypass mode, they can disable it globally without shipping a client update.

There is also a `dontAsk` mode, which converts every `ask` result to `deny`. This is for users who want maximum automation with zero prompts — anything that would normally prompt the user is simply rejected.

## The Audit Surface

Claude Code ships over 40 tools. Each is a potential attack vector, and the risk is not always obvious.

**File reads seem safe but enable exfiltration.** The model reads `~/.ssh/id_rsa`, then writes the contents to a file that gets committed and pushed. Or it reads `.env` and passes the values to a `curl` command. No destructive command is needed.

**Web fetch can reach internal endpoints.** If your machine has access to internal APIs, dashboards, or metadata services, the model can `curl` them. Network segmentation is the only defense here, and Claude Code provides none.

**Bash is Turing-complete.** No pattern-based classifier can enumerate every destructive command. `DANGEROUS_BASH_PATTERNS` catches interpreters, eval, sudo, and remote execution. It cannot catch `cat /dev/urandom > important_file`, piped chains that assemble a destructive command from innocent parts, or novel attack patterns.

The bash classifier in the open-source build (`bashClassifier.ts`) is a stub — it returns `{matches: false}` for all inputs. The real classification logic is internal. The external build relies on the permission gate, dangerous patterns, and user-configured rules.

This is an honest design. Claude Code's permission model is defense-in-depth for the trusted-user case. If you need hard isolation against hostile inputs — prompt injection from untrusted files, malicious dependencies, adversarial web content — a kernel sandbox (container, VM, seccomp profile) is the right answer.

## What Claude Code Doesn't Do

The permission model has explicit gaps. Each is a deliberate design choice.

**No network isolation.** The agent can reach any endpoint your machine can. There is no allowlist for outbound HTTP, no DNS filtering, no firewall rules. If your laptop can reach the cloud metadata service at `169.254.169.254`, so can the agent.

**No filesystem namespace.** The agent operates on your real filesystem. There is no overlay, no copy-on-write layer, no restricted root. Writes to `/etc/passwd` are gated only by Unix permissions and the permission model.

**No process isolation.** Bash commands run in your shell, with your `PATH`, your environment variables, and your credentials. A `git push` uses your SSH key. An `aws s3 cp` uses your AWS profile.

**No audit log by default.** The file `permissionLogging.ts` exists for centralized analytics and telemetry of permission decisions. It logs events to Statsig and OpenTelemetry. But there is no local audit trail written to disk by default. If you need to prove what the agent did, you need to enable logging explicitly.

Each gap reflects the same trade-off: a CLI tool that requires Docker, a network proxy, and a dedicated filesystem would have dramatically lower adoption. Claude Code chose reach over isolation.

> **Design Lesson: Permission layers beat monolithic trust**
>
> 1. **Put the gate at the tool boundary, not inside tools.** `hasPermissionsToUseTool()` wraps every tool call from outside. Tools don't self-authorize. Change the permission model once; all tools inherit it.
> 2. **Classify inputs, not just tools.** Approving "BashTool" is meaningless — `rm -rf /` and `echo hello` are both BashTool calls. The permission model classifies the *input* through dangerous patterns, tool-specific `checkPermissions()`, and an AI classifier. Each layer catches different risks.
> 3. **Design for the trusted-user case first.** A kernel sandbox is the right answer for hostile inputs. For a tool running on a developer's own machine, explicit permission layers with dangerous-pattern detection is the pragmatic trade-off. Ship the useful thing, then harden.

## So What?

If you are building your own CLI agent, copy this three-layer model: a permission gate at the tool boundary, an input classifier for high-risk tools, and a bypass kill switch for CI mode. Don't skip any layer. The gate catches misconfigured rules. The classifier catches novel inputs. The kill switch catches production incidents. Each catches what the others miss.

## Source Code

Key files referenced in this post:

- **`permissions.ts`** — core permission logic and `hasPermissionsToUseTool()` function
- **`PermissionMode.ts`** — defines the five permission modes (default, plan, acceptEdits, bypassPermissions, dontAsk)
- **`PermissionRule.ts`** — rule structure with toolName, ruleContent, and behavior (allow, deny, ask)
- **`dangerousPatterns.ts`** — lists of shell patterns too dangerous to auto-approve (interpreters, eval, sudo, ssh)
- **`bashClassifier.ts`** — bash command risk classifier (stub in external build)
- **`yoloClassifier.ts`** — AI-powered auto-approval classifier for auto mode
- **`bypassPermissionsKillswitch.ts`** — remote kill switch that can disable bypass mode globally
- **`interactiveHandler.ts`** — user approval flow with allow/reject/abort choices
- **`coordinatorHandler.ts`** — coordinator permission logic for multi-agent scenarios
- **`permissionLogging.ts`** — centralized analytics and telemetry for permission decisions
- **`filesystem.ts`** — path safety checks for `.git/`, `.claude/`, `.vscode/`, and shell configs
