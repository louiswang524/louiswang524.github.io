---
title: "From Vibe Coding to Harness Engineering: How to Actually Ship AI-Assisted Software"
description: "Vibe coding gets you a working prototype in 10 minutes. Harness engineering is how you ship it to production. Here's the difference, why it matters, and how to make the transition."
date: 2026-03-23
tags: ["AI agents", "software engineering", "LLM", "productivity"]
---

You prompted an AI, got a working app in 10 minutes. Then it broke when a second user signed up. Or it collapsed when you added authentication. Or you came back three days later, opened a new chat, and the AI had no idea what it had built.

What happened?

Vibe coding is real and genuinely powerful — but it's a starting point, not a destination. The engineers shipping reliably with AI have learned something the vibe coders haven't yet: the model is the easy part. The hard part is everything around it.

---

## What Vibe Coding Is (And Why It Feels So Good)

Andrej Karpathy coined the term in February 2025: "fully give in to the vibes, embrace exponentials, and forget that the code even exists." He described a workflow where you describe what you want in natural language, accept whatever the AI generates, run it, paste any errors back into the chat, and repeat until something works.

The appeal is obvious. The feedback loop is instant. You feel productive from the first prompt. You're not fighting syntax or APIs or documentation — you're just describing intent and watching code appear.

The market validated this instantly. By early 2025, 25% of Y Combinator's Winter batch had codebases that were 95%+ AI-generated. The global AI code generation market, sitting at $674M in 2024, is projected to hit $15.7B by 2033. 97.5% of companies have integrated AI into their engineering processes in some form.

For certain tasks, vibe coding is genuinely the right approach:

- **Rapid prototyping** — You need a demo by tomorrow. Vibe it.
- **Boilerplate and scaffolding** — Config files, CRUD endpoints, repetitive patterns.
- **Exploration** — You're not sure which approach to take. Generate three and compare.
- **Low-stakes scripts** — Internal tools, one-off data transforms, throwaway code.

In these contexts, vibe coding is efficient and appropriate. The problems start when you try to take it further.

---

## Where It Breaks Down

### 1. Context Amnesia

Every new chat session starts fresh. The AI doesn't remember the architectural decisions from your last session, the naming conventions you established, or why you chose PostgreSQL over SQLite. As a project grows, you spend more and more of each session re-explaining what already exists.

The symptom is code duplication. One analysis of vibe-coded projects found an 8× increase in duplicated logic compared to traditionally-engineered codebases. The AI generates a new implementation of something it already built last week, because it simply doesn't know it built it.

### 2. No Verification Loop

Vibe coding produces code that *looks* correct. The syntax is valid. The logic is plausible. But without tests, you have no way to know whether it actually does what you intended under real conditions.

This is the compounding problem: each new AI-generated change introduces potential errors, and without automated tests to catch regressions, bugs accumulate invisibly. By the time you notice something is wrong, the proximate cause is three layers removed from the actual bug.

Addy Osmani, in his book *Beyond Vibe Coding*, puts it directly: "The single biggest differentiator between agentic engineering and vibe coding is testing. With a solid test suite, an AI agent can iterate in a loop until tests pass, giving you high confidence in the result."

### 3. Architectural Drift

The AI makes locally sensible choices. Each individual decision — this utility function, this component structure, this API shape — seems reasonable in isolation. But over time, these locally-sensible choices accumulate into globally incoherent architecture.

You end up with three different ways of handling errors, two state management patterns in conflict, and utility functions that do slightly different versions of the same thing. No single piece is wrong, but the whole doesn't hold together.

The phrase "tangled architecture" comes up repeatedly in post-mortems on vibe-coded projects that failed. You can't vibe code your way out of a vibe coding mess — at some point, you have to throw it away and start over.

### 4. Production Blindspots

AI-generated code is optimized for plausibility, not production. It generates code that will work on your laptop with a single user and a fresh database. It rarely generates code that handles:

- Caching and performance at scale
- Concurrency and race conditions
- Edge cases with malformed input
- Distributed system failures (network timeouts, partial writes)
- Security boundaries

These aren't exotic requirements. They're the baseline for any service that real users depend on. A vibe-coded MVP that gets traction will eventually hit every one of these gaps.

---

## What Harness Engineering Is

The mental shift is this: **stop thinking about prompting an AI, and start thinking about engineering the environment around an AI**.

Every system has two layers:

- **The brain**: the LLM — Claude, GPT, Gemini, whatever. This is increasingly a commodity. Models are getting better and cheaper every quarter.
- **The harness**: the persistent state, tools, constraints, verification loops, and architectural guardrails that the brain operates within. *This is the engineering.*

The harness is what makes an AI reliable. OpenAI's Codex team captured this precisely: "Increasing trust and reliability required constraining the solution space." You make an AI trustworthy not by making it smarter, but by making it harder for it to go wrong.

Harness engineering isn't a single framework or tool. It's a set of principles for how to structure the relationship between humans, agents, and code.

---

## The Four Pillars of a Good Harness

### 1. Context Engineering

An AI agent can only work with what it can see. Anything it can't access in its context window might as well not exist.

Context engineering is the discipline of curating what the agent sees at each step: the relevant parts of the codebase, the architectural decisions already made, the spec for what it's supposed to build right now, and the history of what it's already done.

This sounds simple but requires deliberate design. You can't just dump your entire codebase into the prompt — that's noisy and expensive. You have to surface the right information at the right time: the API contract when the agent is touching an endpoint, the schema when it's writing a query, the test file when it's implementing a feature.

The practical implication: your documentation, specs, and progress logs are not optional nice-to-haves. They're load-bearing infrastructure for AI reliability.

### 2. Verification Gates

Tests are the spec. Not documentation — tests. Documentation describes intent; tests enforce it.

The pattern that works: write the test before asking the AI to implement. Give the agent a test runner. Tell it to loop until the tests pass. This turns an open-ended "build this feature" prompt into a closed, verifiable task with a clear completion criterion.

This also prevents silent regressions. Each new feature comes with tests that run against everything previously built. The AI can't accidentally break something it already fixed without the tests catching it.

Stripe ships 1,300 AI-written pull requests per week. They don't do this by vibing — they do it by binding agents to tests and API specifications that serve as authoritative contracts. When an agent touches an endpoint, the spec is surfaced as context. The agent either implements to spec or fails explicitly.

### 3. Architectural Constraints

Left unconstrained, AI agents make decisions that are locally optimal and globally messy. The solution is to encode your architectural preferences as enforceable rules.

This means:
- **Typed interfaces and SDKs** that make it impossible to call an API wrong
- **Custom linters** that reject code not matching your conventions
- **CI checks** that enforce naming, structure, and patterns before anything merges
- **Golden rules** embedded in the agent's context — explicit statements of what the codebase does and does not do

With these constraints in place, the agent's solution space is narrowed. It can still be creative within the bounds, but it can't accidentally invent a fourth state management pattern when you've already decided on one.

### 4. State Persistence

A harness doesn't live in one chat session. It persists across sessions, across days, across engineers.

The practical pattern, used by teams at Anthropic and elsewhere:
- A `progress.md` or `CLAUDE.md` file that describes the current state of the project
- Descriptive git commits that explain *why*, not just *what*
- A feature checklist (JSON or markdown) that tracks what's been built and what remains
- Each new session starts by reading these files before writing a single line of code

This is how human engineers work in shifts. You don't re-explain the entire project to a new team member — you hand them the docs and the git history. AI agents need the same thing.

---

## The Spectrum in Practice

These aren't discrete categories — it's a continuous spectrum. Most teams are somewhere in the middle, and the goal isn't to jump straight to full spec-driven development. It's to move deliberately up the ladder as complexity demands it.

| Level | What it looks like | Good for |
|---|---|---|
| **Vibe coding** | Chat → accept → run → paste errors | Scripts, prototypes, exploration |
| **AI-assisted engineering** | Structured prompts + human review + manual testing | Features within a larger system |
| **Agent harness** | Loops + test gates + persistent state | Production services, continuous iteration |
| **Spec-driven development** | Specs as contracts, agents implement to them | Critical systems, regulated industries |

AWS recently reduced a two-week notification feature to two days using spec-driven development. The specs captured requirements precisely; the agents followed them reliably; humans reviewed and approved. The bottleneck shifted from writing code to writing good specs — which turns out to be valuable engineering work, not a workaround.

---

## How to Build Your First Harness

You don't need a new framework or a three-month migration. Start with these five steps:

**1. Write a spec before any AI session.**
Even a paragraph describing what you're building, what decisions have already been made, and what's out of scope. Put it in a file the agent can read. This single change eliminates most context amnesia.

**2. Write the test before the implementation.**
Ask the AI to write a failing test for the thing you want to build. Then ask it to make the test pass. You've just created a verification gate.

**3. Commit at every working state.**
Not "add feature" — write commit messages that explain why. `feat: use Redis for session caching because user auth was hitting DB on every request`. This is your shared memory across sessions.

**4. Give the agent a progress file.**
`PROGRESS.md`: what's been built, what remains, what architectural decisions have been locked in. Start every session by having the agent read it. End every session by having it update the file.

**5. Treat every AI failure as an engineering problem.**
When an agent does something wrong, don't just retry with a better prompt. Figure out why it went wrong and fix the harness: add a constraint, clarify a spec, add a test case. The goal is that the same mistake never happens twice.

---

## The Payoff

None of this makes AI slower. It makes it faster, but in a different dimension — not faster at generating initial code, but faster at building systems that work.

Vibe coding is fast the way a sprint is fast. Harness engineering is fast the way a relay race is fast — the handoffs are designed, the lanes are clear, and each runner knows exactly what they're carrying and where they're going.

The engineers who figure this out early will have a meaningful advantage. They get AI's speed *and* the reliability that complex systems require. They can ship quickly *and* maintain what they shipped.

Vibe coding got everyone excited about what's possible. Harness engineering is how you actually build it.

---

*Further reading: Addy Osmani's [Beyond Vibe Coding](https://beyond.addy.ie/), Martin Fowler's [Harness Engineering](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html), Anthropic's [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), and the OpenAI [Harness Engineering](https://openai.com/index/harness-engineering/) post.*
