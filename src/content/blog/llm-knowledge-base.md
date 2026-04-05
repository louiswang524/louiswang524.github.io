---
title: "Building a Self-Improving Personal Knowledge Base Powered by LLM"
description: "Inspired by Andrej Karpathy's post on LLM knowledge bases, I built a system where Claude Code skills manage a personal wiki end-to-end — ingesting raw content, compiling concept articles, synthesizing connections, and answering questions. You never touch the wiki. The LLM owns it."
date: 2026-04-05
tags: ["LLM", "knowledge management", "Claude Code", "AI agents", "personal tools"]
---

Andrej Karpathy wrote a post recently that stuck with me:

> *"Instead of getting answers in text/terminal, I like to have it render markdown files for me... I rarely ever write or edit the wiki manually, it's the domain of the LLM."*

He described using LLMs not just to answer questions, but to build and maintain a personal knowledge base — a wiki where the model does all the organizational work. You feed it raw content. It compiles, tags, links, and indexes everything. You just ask questions.

This pattern — LLM as knowledge curator, not just knowledge retriever — is fundamentally different from the way most people use AI tools today. Most people use LLMs as smart search engines. Karpathy's insight is that you can use them as librarians who own the library.

I spent the past few days building exactly this. The result is an open-source system of Claude Code skills that manages a personal wiki in Obsidian, fully autonomous after initial setup. This post is a technical walkthrough of how it works, what I learned, and where I think this pattern leads.

---

## The Problem With How We Manage Knowledge Today

Personal knowledge management is a solved problem in theory and a disaster in practice.

The theory: capture everything, tag it, link it, review it regularly. Tools like Notion, Roam, Obsidian, and Zotero exist precisely for this. They're powerful.

The practice: most people's second brains are graveyards of half-finished notes, inconsistently tagged links, and articles clipped six months ago that never got read. The bottleneck isn't storage — it's the cognitive overhead of maintaining the system. Tagging takes effort. Writing summaries takes effort. Finding connections across 400 notes takes effort. Most people give up somewhere between "this is promising" and "why do I have three different notes about attention mechanisms."

The insight in Karpathy's post is that this overhead is exactly what LLMs are good at eliminating. The model doesn't get tired of tagging. It doesn't forget to add backlinks. It can read 50 articles and find the thread connecting them in one pass.

The question is: how do you wire this up so it actually works?

---

## Architecture Overview

The system has three layers:

**1. Raw storage** — everything you ingest goes into `raw/`. Web articles, PDFs, images, notes. Nothing is processed here; it's just a staging area. You feed this layer.

**2. The wiki** — a compiled, LLM-managed collection of markdown files in Obsidian format. Every concept gets its own article. Every source gets a summary. Everything is linked with Obsidian `[[wikilinks]]`. The LLM owns this layer entirely.

**3. Outputs** — Q&A answers, synthesis reports, lint reports, slides, charts. These get filed back into the wiki so future queries can reference them.

```
raw/        →  compile  →  wiki/concepts/
                             wiki/sources/
                             wiki/index.md
                                  ↓
                             /kb-reflect  (auto)
                                  ↓
                             synthesis articles
```

The system ships as seven Claude Code skills — plain markdown files that tell Claude how to behave when you type a trigger command. Install once, use from any Claude Code session.

---

## The Seven Skills

### `/kb-ingest` — Staged Intake

Every ingestion workflow needs a staging area. The rule: capture first, process later. `/kb-ingest` takes any source and writes it to `raw/` with metadata frontmatter:

```yaml
---
source: https://arxiv.org/abs/1706.03762
ingested_at: 2026-04-05T10:00:00Z
type: web
status: uncompiled
---
```

Four input types are handled differently:
- **URLs**: fetched with WebFetch, main content extracted, navigation and ads stripped
- **PDFs**: read with Claude's document understanding, text extracted to a sidecar `.md`
- **Images**: read visually, Claude writes a detailed description sidecar
- **Notes**: written directly as freeform text

The key design decision here is that ingestion never triggers processing. You can ingest 20 articles and compile them all at once, or compile after each one. The manifest tracks what's been processed:

```json
{
  "raw/web/attention-is-all-you-need.md": {
    "status": "uncompiled",
    "ingested_at": "2026-04-05T10:00:00Z",
    "type": "web"
  }
}
```

### `/kb-compile` — The Wiki Compiler

This is the core skill. For each uncompiled raw file, the LLM:

1. Reads the content
2. Writes `wiki/sources/<slug>.md` — a structured summary with tags, key concepts, and notable details
3. Extracts concepts and creates or updates `wiki/concepts/<concept>.md`, adding `[[backlinks]]` to the source
4. Appends one-line entries to `wiki/index.md`
5. Updates the manifest to `status: compiled`

The concept deduplication step is important. If `wiki/concepts/attention.md` already exists when you compile a new source about attention, the LLM reads the existing article and updates it with new information rather than creating a duplicate. The wiki converges — it doesn't fragment.

The `wiki/index.md` file is the navigation layer. It's a single file with one-line summaries of every article in the wiki:

```markdown
## Concepts
- [[concepts/attention]] — mechanism allowing models to weigh token relevance dynamically
- [[concepts/transformers]] — foundational architecture for sequence modeling using self-attention

## Sources
- [[sources/attention-is-all-you-need]] — Vaswani et al. 2017, original transformer paper
```

This is what makes Q&A work at scale without RAG — the LLM reads the index first, picks the 3-5 most relevant articles, and reads only those. It never needs to load the entire wiki.

### `/kb-ask` — Index-First Q&A

The Q&A pattern is the most interesting architectural decision in the system.

The naive approach to Q&A over a large document collection is RAG: embed everything, embed the query, find nearest neighbors, retrieve chunks, answer. This works, but it has a fundamental problem — the retrieval is semantic but dumb. It finds chunks that look like the query without understanding the structure of the knowledge base.

The approach here is different: maintain a compact, human-readable index that the LLM uses to navigate. The index is always in context. The LLM selects which full articles to read. The full articles are in context for the answer.

This is essentially what a human expert does: they don't search their entire memory for every question. They navigate a mental index of what they know, then recall the relevant details.

```
/kb-ask how does RLHF relate to chain-of-thought prompting?

→ reads wiki/index.md
→ selects: concepts/rlhf.md, concepts/chain-of-thought.md, sources/instructgpt.md
→ synthesizes answer with [[wiki-link]] citations
→ saves to outputs/2026-04-05-rlhf-chain-of-thought.md
→ files output back into index.md
```

Answers are indexed back in. This is the first compounding mechanism: every answer you ask makes the wiki richer for future queries.

### `/kb-reflect` — The Self-Improvement Engine

This is the part that goes beyond Karpathy's description. After every compile, the system automatically runs a two-stage reflection pass:

**Stage 1 — Discovery (index only):** Read the full `index.md`. Using only the one-line summaries, identify 3-5 connection candidates:
- **Cross-cutting themes** — a concept that appears across multiple unrelated sources
- **Implicit relationships** — two concepts that seem related but have no link between them
- **Contradictions** — sources that appear to take opposing positions
- **Gaps** — a theme implied by many sources but with no dedicated article

**Stage 2 — Synthesis (targeted deep read):** For each candidate, read the relevant articles and write a new `type: synthesis` concept article if the evidence is strong enough.

```markdown
---
tags: [synthesis, rlhf, attention]
type: synthesis
created_by: kb-reflect
---

# Scoring Mechanisms in RLHF and Attention

Both RLHF and attention mechanisms fundamentally solve the same problem: 
how to assign a scalar score to represent relevance or quality...
```

The synthesis articles are second-order knowledge — knowledge generated from knowledge. They capture connections that no single source would have articulated. This is the self-improvement loop: the wiki gets smarter not just by ingesting more content, but by reasoning across what it already has.

State is tracked in `.kb/reflect_state.json`. Incremental runs only consider newly compiled content as primary candidates, though the full index is always scanned for discovery.

### `/kb-lint` — Health Checks

Wikis accumulate technical debt: stubs that never got expanded, concepts referenced but never written, near-duplicate articles that diverged over time. `/kb-lint` runs five checks:

1. **Thin articles** — concept articles with fewer than 3 substantive sentences
2. **Missing concepts** — `[[concepts/X]]` links in sources with no corresponding article
3. **Broken wikilinks** — links pointing to files that don't exist
4. **Duplicate concepts** — near-duplicate slugs (`attention` and `attention-mechanism`)
5. **New article suggestions** — gaps in the wiki, with optional web search to impute missing data

Output: terminal summary + a full report in `outputs/` filed back into the wiki.

### `/kb-merge` — Concept Consolidation

Lint tells you what's broken. Merge fixes one specific class of problem: duplicate concepts.

Given two concept articles, the LLM reads both, writes a clean merged article incorporating all substantive content from each, updates all backlinks across `wiki/` and `outputs/`, and archives the absorbed article to `wiki/archive/` with a redirect note. One git commit per merge pair for clean history.

This keeps the concept space tight. As the wiki grows, merge is what prevents it from fragmenting into 40 slightly-different articles about attention.

### `/kb-output` — Rendering

Sometimes you want a deliverable, not just an answer. `/kb-output` takes either a question or an existing output file and renders it as:

- **Marp slides** — a `---`-separated markdown slideshow, one concept per slide, viewable with the Marp plugin in Obsidian
- **Matplotlib chart** — Claude picks the right chart type (network graph, timeline, bar chart, histogram) based on the content, writes a self-contained Python script, executes it, saves the PNG

```bash
/kb-output --slides what is the transformer architecture?
/kb-output --chart compare attention mechanisms across papers
```

---

## The Search Engine

For large wikis, the index-first navigation pattern starts to strain when the index itself becomes long. I added `kb_search.py` — a Python CLI tool the LLM can call during queries:

```bash
python3 ~/knowledge-base/kb_search.py "attention mechanism" --top 5
```

Output is JSON, easy to parse. Two modes:

1. **Keyword search** — TF-IDF scoring with 3x title boost, fast, no dependencies
2. **Semantic fallback** — if keyword confidence is below threshold, encode the query with `sentence-transformers` (all-MiniLM-L6-v2) and cosine-similarity against cached embeddings

The search index is cached at `.kb/search_index.json` and rebuilt after every `/kb-compile`. This means searches are instant — no embedding at query time.

The semantic fallback matters for the kind of queries a knowledge base gets. "How do transformers handle long sequences?" should find articles about attention, positional encoding, and sparse attention even if those exact words don't appear in the query.

---

## What the Full Loop Looks Like

Once everything is running, the workflow is:

```bash
# Feed content — takes 30 seconds per source
/kb-ingest https://lilianweng.github.io/posts/2023-06-23-agent/
/kb-ingest https://arxiv.org/abs/2005.14165
/kb-ingest "My intuition: RLHF works because human preference labels act as a soft prior on policy behavior"

# Compile — processes everything, auto-reflects
/kb-compile

# Query
/kb-ask what are the key components of an LLM agent?
/kb-ask how does RLHF relate to chain-of-thought prompting?

# Maintain
/kb-lint
/kb-merge
```

After a few compile cycles, the wiki starts to feel like a domain expert you can query. The synthesis articles surface connections you hadn't made explicit. Answers reference each other. The knowledge compounds.

---

## Design Decisions Worth Discussing

**Why Claude Code skills instead of a Python application?**

Skills are markdown files — plain text with step-by-step instructions. They're readable, debuggable, and modifiable by anyone without running any code. When something doesn't work right, you edit the skill file and the behavior changes on the next invocation. There's no deployment step, no package to install, no server to run. The tradeoff is that the execution is probabilistic (LLM following instructions) rather than deterministic (code), but for knowledge management tasks that involve judgment calls, that's actually a feature.

**Why Obsidian as the frontend?**

Obsidian's graph view is a free visualization of everything the LLM built — every `[[wikilink]]` the LLM wrote becomes an edge in the graph. You get a live map of your knowledge base without building anything. The Marp plugin turns `/kb-output --slides` results into viewable slideshows. The backlinks panel shows everything that references any given concept.

**Why index-first instead of RAG?**

RAG retrieves chunks without understanding structure. The index-first pattern lets the LLM navigate the knowledge base the way a human expert would — using a table of contents, not a vector search. It also means the retrieval step is interpretable: you can see which articles the LLM chose to read, and why. The limitation is that the index needs to stay compact enough to always fit in context. At ~100-200 articles this is fine; beyond that, the search engine becomes the primary navigation tool.

**Why git?**

Every compile, reflect, merge, and Q&A session commits to git. This gives you a complete history of how your understanding evolved — every synthesis article that was created, every concept that was merged, every question that was asked. `git blame` on a concept article tells you which source triggered its creation. `git diff` shows how an article changed when a new source was compiled. The wiki is version-controlled knowledge.

---

## What's Next

The obvious next steps:

**Staleness detection** — articles have no freshness signal. A source from 2021 describing "state of the art" is now outdated. Need date-aware lint checks.

**Proactive discovery** — the system currently waits for you to ingest. It should tell you what to ingest next based on gaps it detected.

**Finetuning** — Karpathy mentioned this at the end of his post. Once the wiki is large enough, you could use it as training data to bake domain knowledge into a model's weights rather than always loading it into context. That's the endgame: a model that genuinely knows your knowledge base, not one that reads it on every query.

---

## Getting Started

The repo is open source. Everything installs with one command:

```bash
git clone https://github.com/louiswang524/llm-knowledge-base.git
cd llm-knowledge-base
bash setup.sh ~/knowledge-base
```

You need Claude Code and an Obsidian installation. Python dependencies for charts and semantic search are optional:

```bash
pip install -r requirements.txt
```

Then open `~/knowledge-base` as an Obsidian vault and start ingesting.

The thing that surprised me most building this: the synthesis articles. I didn't expect the reflect pass to produce anything interesting on a small wiki. But even with 10-15 sources compiled, the LLM found connections I hadn't made explicit — and wrote them up as standalone articles that immediately became the most useful things in the wiki.

That's the part that feels qualitatively different from search. Search finds what you know is there. This surfaces what you didn't know you knew.
