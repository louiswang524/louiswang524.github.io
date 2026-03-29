---
name: Attention Diagrams
description: Design spec for three theme-aware SVG diagrams added to the attention variants blog post via MDX conversion and Astro components
type: project
---

# Attention Diagrams — Design Spec

**Date:** 2026-03-28
**Target post:** `src/content/blog/attention-variants.mdx` (renamed from `.md`)

## Overview

Add three theme-aware inline SVG diagrams to the attention variants blog post. Diagrams are Astro components that use the site's CSS custom properties (`--bg`, `--bg-subtle`, `--border`, `--text`, `--text-muted`, `--accent`) so they respond correctly to the site's light/dark theme toggle (`[data-theme='dark']` on `<html>`).

## Infrastructure Changes

### 1. Install `@astrojs/mdx`

```bash
npx astro add mdx
```

This auto-updates `astro.config.mjs` to include the MDX integration. No other config changes needed.

### 2. Rename blog post

```bash
mv src/content/blog/attention-variants.md src/content/blog/attention-variants.mdx
```

Frontmatter and all content remain identical. Add component imports at the top of the file (after frontmatter) and component usage inline in the prose.

## CSS Variables Reference

From `public/global.css`:

| Variable | Light | Dark |
|---|---|---|
| `--bg` | `#ffffff` | `#0f0f0f` |
| `--bg-subtle` | `#f7f7f7` | `#1a1a1a` |
| `--border` | `#e5e5e5` | `#2e2e2e` |
| `--text` | `#1a1a1a` | `#e8e8e8` |
| `--text-muted` | `#666666` | `#888888` |
| `--accent` | `#0070f3` | `#4da3ff` |

## Diagram Components

### Diagram 1 — Attention Patterns

**File:** `src/components/diagrams/AttentionPatterns.astro`
**Placement:** After the "Sliding Window Attention" subsection in Section 4, before the next `##` heading.
**Import line:** `import AttentionPatterns from '../../components/diagrams/AttentionPatterns.astro';`
**Usage:** `<AttentionPatterns />`

**Design:**

Three 8×8 grids side by side, each labeled below. Grid dimensions: each cell ~28px, grids separated by 24px gap. Total SVG width: fits within 740px max-width container.

- **Full Attention** — all 64 cells filled with `--accent` at 80% opacity; cells near the diagonal at 100% opacity, cells far from diagonal at 40% opacity (visual gradient suggesting attention weight decay with distance)
- **Sparse Attention** — cells filled if within local band (|i−j| ≤ 2) OR at strided column (j % 3 === 0); unfilled cells use `--bg-subtle`
- **Sliding Window (W=3)** — cells filled only if |i−j| ≤ 2 (causal: j ≤ i also); hard cutoff outside window

Grid lines: `--border` (0.5px stroke). Filled cells: `--accent`. Empty cells: `--bg-subtle`. Labels below each grid: `--text-muted`, font-size 13px. Axes labels (row = "Query token", col = "Key token"): `--text-muted`, font-size 11px. Entire SVG background: transparent (inherits `--bg` from page).

Caption below diagram: *Figure 1: Attention patterns for an 8-token sequence. Dark cells indicate attended positions.*

---

### Diagram 2 — Head Structure

**File:** `src/components/diagrams/HeadStructure.astro`
**Placement:** After the GQA comparison table in Section 3, before the "Uptraining from MHA" paragraph.
**Import line:** `import HeadStructure from '../../components/diagrams/HeadStructure.astro';`
**Usage:** `<HeadStructure />`

**Design:**

Three columns (MHA, MQA, GQA with G=2), each showing 8 query heads and their K/V connections. Each column is ~200px wide.

**Per column layout (top to bottom):**
1. Row of 8 small circles (r=10px) = query heads, filled `--accent`
2. Connecting lines from each query circle down to its K/V rectangle, stroke `--border`
3. One or more rectangles (24px × 16px) = K/V head pairs, filled `--bg-subtle`, stroke `--text-muted`
4. Label: column title in `--text`, bold, 14px
5. Sublabel: memory reduction vs MHA in `--text-muted`, 12px

**Column specifics:**
- **MHA:** 8 K/V rectangles (1:1 mapping), label "Multi-Head Attention", sublabel "1× cache (baseline)"
- **MQA:** 1 K/V rectangle (all 8 queries converge), label "Multi-Query Attention", sublabel "8× smaller cache"
- **GQA (G=2):** 2 K/V rectangles (4 queries per group), label "Group Query Attention", sublabel "4× smaller cache"

Caption: *Figure 2: How MHA, MQA, and GQA differ in their key/value head structure. Circles = query heads, rectangles = K/V head pairs.*

---

### Diagram 3 — Flash Attention Memory

**File:** `src/components/diagrams/FlashMemory.astro`
**Placement:** After the "Result" bullet points in Section 6, before "### Subsequent Versions".
**Import line:** `import FlashMemory from '../../components/diagrams/FlashMemory.astro';`
**Usage:** `<FlashMemory />`

**Design:**

Two side-by-side panels ("Standard Attention" and "Flash Attention"), each ~320px wide, 220px tall.

**Per panel layout:**
- GPU chip outline: rounded rectangle, stroke `--border`, fill `--bg-subtle`, labeled "GPU" top-left in `--text-muted`
- SRAM box (top, small ~60px tall): fill `--bg`, stroke `--accent`, label "SRAM\n(fast, small)" in `--text`
- HBM box (bottom, larger ~90px tall): fill `--bg`, stroke `--border`, label "HBM\n(slow, large)" in `--text`

**Standard panel specifics:**
- Large n×n block in HBM colored `--accent` at 20% opacity, labeled "n×n matrix"
- Three double-headed arrows between SRAM and HBM, labeled "3 round-trips" in `--text-muted`

**Flash panel specifics:**
- Small tiled block in SRAM colored `--accent` at 60% opacity, labeled "tiles"
- Single downward arrow from SRAM to HBM labeled "output O only" in `--text-muted`
- No n×n block in HBM

Caption: *Figure 3: Standard attention makes 3 round-trips over the n×n matrix. Flash Attention keeps tiles in SRAM and writes only the output to HBM.*

---

## File Structure

| Action | Path |
|---|---|
| Install dep | `@astrojs/mdx` via `npx astro add mdx` |
| Rename | `src/content/blog/attention-variants.md` → `.mdx` |
| Create | `src/components/diagrams/AttentionPatterns.astro` |
| Create | `src/components/diagrams/HeadStructure.astro` |
| Create | `src/components/diagrams/FlashMemory.astro` |
| Modify | `src/content/blog/attention-variants.mdx` (add imports + component usage) |

## Placement in Post

```
Section 3: Problem 1 (MQA/GQA)
  ...GQA comparison table...
  <HeadStructure />          ← after table, before uptraining paragraph
  ...uptraining paragraph...

Section 4: Problem 2 (Sparse/Sliding Window)
  ...Sliding Window subsection...
  <AttentionPatterns />      ← after the Mistral effective context equation, before next ##

Section 6: Problem 4 (Flash Attention)
  ...result bullet points...
  <FlashMemory />            ← after result bullets, before ### Subsequent Versions
```

## Writing Constraints

- SVG must use `var(--css-variable)` syntax throughout — no hardcoded hex colors
- All text in SVG uses `font-family: var(--font-sans)`
- SVG `width="100%"` with fixed `viewBox` for responsive scaling
- No JavaScript inside SVG components
- Captions use italic markdown below each component: `*Figure N: ...*`
