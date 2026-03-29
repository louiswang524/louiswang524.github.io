# Attention Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three theme-aware SVG diagrams to the attention variants blog post by installing MDX support, converting the post to `.mdx`, and creating three Astro components.

**Architecture:** Each diagram is a standalone Astro component in `src/components/diagrams/` that renders inline SVG using CSS custom properties (`var(--accent)`, `var(--text)`, etc.) from `public/global.css`. The blog post is converted from `.md` to `.mdx` so it can import and render these components. No JavaScript in diagrams — pure SVG + CSS variables, so theme switching works automatically via `[data-theme='dark']` on `<html>`.

**Tech Stack:** Astro 4.x, `@astrojs/mdx`, inline SVG, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-03-28-attention-diagrams-design.md`

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Install | `@astrojs/mdx` | Enables `.mdx` content files |
| Rename | `src/content/blog/attention-variants.md` → `.mdx` | Allow component imports in post |
| Create | `src/components/diagrams/AttentionPatterns.astro` | Full / Sparse / Sliding Window grids |
| Create | `src/components/diagrams/HeadStructure.astro` | MHA vs MQA vs GQA head diagrams |
| Create | `src/components/diagrams/FlashMemory.astro` | SRAM/HBM memory flow panels |
| Modify | `src/content/blog/attention-variants.mdx` | Add imports + 3 component usages |

---

### Task 1: Install MDX and rename post

**Files:**
- Modify: `astro.config.mjs`
- Rename: `src/content/blog/attention-variants.md` → `src/content/blog/attention-variants.mdx`

- [ ] **Step 1: Install `@astrojs/mdx`**

Run in `/mnt/c/Users/louis/Documents/dev/louiswang524.github.io`:

```bash
npx astro add mdx --yes
```

Expected: installs `@astrojs/mdx`, auto-updates `astro.config.mjs` to include `import mdx from '@astrojs/mdx'` and `integrations: [mdx()]`.

- [ ] **Step 2: Verify astro.config.mjs was updated**

Run: `cat astro.config.mjs`

Expected output must include:
```
import mdx from '@astrojs/mdx';
```
and
```
integrations: [mdx()],
```

If not present, manually add them:

```js
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://louiswang524.github.io',
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'wrap' }],
      rehypeKatex,
    ],
  },
});
```

- [ ] **Step 3: Rename the blog post**

```bash
mv src/content/blog/attention-variants.md src/content/blog/attention-variants.mdx
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build 2>&1 | tail -15
```

Expected: build completes with no errors. If KaTeX errors appear in MDX, add `extendMarkdownConfig: true` to the `mdx()` call: `mdx({ extendMarkdownConfig: true })`.

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs src/content/blog/attention-variants.mdx
git commit -m "feat: install @astrojs/mdx and convert attention post to .mdx"
```

---

### Task 2: Create AttentionPatterns component

**Files:**
- Create: `src/components/diagrams/AttentionPatterns.astro`
- Modify: `src/content/blog/attention-variants.mdx`

- [ ] **Step 1: Create the diagrams directory and component**

Create `src/components/diagrams/AttentionPatterns.astro` with this exact content:

```astro
---
const CELL = 28;
const N = 8;
const GAP = 26;
const GRID_W = CELL * N;
const PAD_X = 14;
const LABEL_H = 28;
const AXIS_H = 22;
const TOTAL_W = PAD_X + 3 * GRID_W + 2 * GAP + PAD_X;
const GRID_Y = LABEL_H;
const TOTAL_H = GRID_Y + GRID_W + AXIS_H + 10;

interface CellData {
  i: number;
  j: number;
  fill: string;
  opacity: number;
}

function buildCells(kind: 'full' | 'sparse' | 'slide'): CellData[] {
  const out: CellData[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const d = Math.abs(i - j);
      let fill = 'var(--accent)';
      let opacity: number;
      if (kind === 'full') {
        opacity = Math.max(0.2, 1 - d * 0.1);
      } else if (kind === 'sparse') {
        const active = d <= 2 || j % 3 === 0;
        fill = active ? 'var(--accent)' : 'var(--bg-subtle)';
        opacity = active ? 0.85 : 1;
      } else {
        const active = d <= 2;
        fill = active ? 'var(--accent)' : 'var(--bg-subtle)';
        opacity = active ? 0.85 : 1;
      }
      out.push({ i, j, fill, opacity });
    }
  }
  return out;
}

const grids = [
  { label: 'Full Attention',   x: PAD_X,                      cells: buildCells('full')   },
  { label: 'Sparse Attention', x: PAD_X + GRID_W + GAP,        cells: buildCells('sparse') },
  { label: 'Sliding Window',   x: PAD_X + 2 * (GRID_W + GAP), cells: buildCells('slide')  },
];
---

<figure style="margin: 2rem 0; overflow-x: auto;">
  <svg
    width="100%"
    viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
    xmlns="http://www.w3.org/2000/svg"
    style="display: block; max-width: 100%;"
    aria-label="Attention pattern comparison: full, sparse, and sliding window"
  >
    {grids.map((grid) => (
      <g>
        <text
          x={grid.x + GRID_W / 2}
          y={LABEL_H - 6}
          text-anchor="middle"
          font-family="var(--font-sans)"
          font-size="13"
          font-weight="600"
          fill="var(--text)"
        >{grid.label}</text>

        {grid.cells.map((cell) => (
          <rect
            x={grid.x + cell.j * CELL}
            y={GRID_Y + cell.i * CELL}
            width={CELL - 1}
            height={CELL - 1}
            fill={cell.fill}
            fill-opacity={cell.opacity}
            rx="2"
          />
        ))}

        <rect
          x={grid.x - 0.5}
          y={GRID_Y - 0.5}
          width={GRID_W + 1}
          height={GRID_W + 1}
          fill="none"
          stroke="var(--border)"
          stroke-width="1"
        />

        <text
          x={grid.x + GRID_W / 2}
          y={GRID_Y + GRID_W + AXIS_H - 4}
          text-anchor="middle"
          font-family="var(--font-sans)"
          font-size="11"
          fill="var(--text-muted)"
        >← Key tokens →</text>
      </g>
    ))}
  </svg>
  <figcaption style="text-align: center; font-style: italic; color: var(--text-muted); font-size: 0.875rem; margin-top: 0.5rem;">
    Figure 1: Attention patterns for an 8-token sequence. Colored cells = attended positions.
  </figcaption>
</figure>
```

- [ ] **Step 2: Add import to attention-variants.mdx**

Open `src/content/blog/attention-variants.mdx`. Find the closing `---` of the frontmatter (the second `---` line). Add the import immediately after it:

Find:
```
tags: ["transformers", "attention", "LLM", "deep learning", "GQA", "flash attention", "linear attention"]
---
```

Replace with:
```
tags: ["transformers", "attention", "LLM", "deep learning", "GQA", "flash attention", "linear attention"]
---

import AttentionPatterns from '../../components/diagrams/AttentionPatterns.astro';
```

- [ ] **Step 3: Insert component usage in the post**

In `src/content/blog/attention-variants.mdx`, find this exact text (end of Section 4, the last paragraph of the Sliding Window section):

```
This is why Mistral achieves strong long-context performance despite attending to a small local window per layer.
```

Add `<AttentionPatterns />` on a blank line immediately after it:

```
This is why Mistral achieves strong long-context performance despite attending to a small local window per layer.

<AttentionPatterns />
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build 2>&1 | tail -15
```

Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/diagrams/AttentionPatterns.astro src/content/blog/attention-variants.mdx
git commit -m "feat: add AttentionPatterns diagram to attention variants post"
```

---

### Task 3: Create HeadStructure component

**Files:**
- Create: `src/components/diagrams/HeadStructure.astro`
- Modify: `src/content/blog/attention-variants.mdx`

- [ ] **Step 1: Create the component**

Create `src/components/diagrams/HeadStructure.astro` with this exact content:

```astro
---
const H = 8;
const COL_W = 195;
const COL_GAP = 25;
const PAD = 15;
const TOTAL_W = PAD + 3 * COL_W + 2 * COL_GAP + PAD;
const TOTAL_H = 210;

const QY = 60;
const KVY = 148;
const CR = 9;
const RW = 30;
const RH = 20;

function qx(i: number): number {
  return 12 + i * ((COL_W - 24) / (H - 1));
}

interface ColDef {
  title: string;
  sublabel: string;
  x: number;
  lines: { from: number; to: number }[];
  rects: number[];
}

function makeLines(kind: 'mha' | 'mqa' | 'gqa'): { from: number; to: number }[] {
  return Array.from({ length: H }, (_, i) => ({
    from: qx(i),
    to: kind === 'mha' ? qx(i)
      : kind === 'mqa' ? COL_W / 2
      : i < H / 2 ? COL_W / 4 : 3 * COL_W / 4,
  }));
}

const cols: ColDef[] = [
  {
    title: 'MHA',
    sublabel: '1× cache (baseline)',
    x: PAD,
    lines: makeLines('mha'),
    rects: Array.from({ length: H }, (_, i) => qx(i)),
  },
  {
    title: 'MQA',
    sublabel: `${H}× smaller cache`,
    x: PAD + COL_W + COL_GAP,
    lines: makeLines('mqa'),
    rects: [COL_W / 2],
  },
  {
    title: 'GQA (G=2)',
    sublabel: '4× smaller cache',
    x: PAD + 2 * (COL_W + COL_GAP),
    lines: makeLines('gqa'),
    rects: [COL_W / 4, 3 * COL_W / 4],
  },
];
---

<figure style="margin: 2rem 0; overflow-x: auto;">
  <svg
    width="100%"
    viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
    xmlns="http://www.w3.org/2000/svg"
    style="display: block; max-width: 100%;"
    aria-label="MHA vs MQA vs GQA head structure comparison"
  >
    {cols.map((col) => (
      <g transform={`translate(${col.x}, 0)`}>
        <text
          x={COL_W / 2}
          y="18"
          text-anchor="middle"
          font-family="var(--font-sans)"
          font-size="14"
          font-weight="600"
          fill="var(--text)"
        >{col.title}</text>

        <text
          x={COL_W / 2}
          y={QY - 16}
          text-anchor="middle"
          font-family="var(--font-sans)"
          font-size="11"
          fill="var(--text-muted)"
        >Q heads</text>

        {Array.from({ length: H }, (_, i) => (
          <circle
            cx={qx(i)}
            cy={QY}
            r={CR}
            fill="var(--accent)"
            fill-opacity="0.8"
          />
        ))}

        {col.lines.map((ln) => (
          <line
            x1={ln.from}
            y1={QY + CR + 1}
            x2={ln.to}
            y2={KVY - 2}
            stroke="var(--border)"
            stroke-width="1.5"
          />
        ))}

        <text
          x={COL_W / 2}
          y={KVY - 8}
          text-anchor="middle"
          font-family="var(--font-sans)"
          font-size="11"
          fill="var(--text-muted)"
        >K/V heads</text>

        {col.rects.map((cx) => (
          <rect
            x={cx - RW / 2}
            y={KVY}
            width={RW}
            height={RH}
            rx="3"
            fill="var(--bg-subtle)"
            stroke="var(--text-muted)"
            stroke-width="1.5"
          />
        ))}

        <text
          x={COL_W / 2}
          y={KVY + RH + 22}
          text-anchor="middle"
          font-family="var(--font-sans)"
          font-size="12"
          fill="var(--text-muted)"
        >{col.sublabel}</text>
      </g>
    ))}
  </svg>
  <figcaption style="text-align: center; font-style: italic; color: var(--text-muted); font-size: 0.875rem; margin-top: 0.5rem;">
    Figure 2: Head structure comparison (H=8). Circles = query heads; rectangles = K/V head pairs.
  </figcaption>
</figure>
```

- [ ] **Step 2: Add import to attention-variants.mdx**

Find the existing import line at the top of the file (after frontmatter):
```
import AttentionPatterns from '../../components/diagrams/AttentionPatterns.astro';
```

Add the HeadStructure import on the next line:
```
import AttentionPatterns from '../../components/diagrams/AttentionPatterns.astro';
import HeadStructure from '../../components/diagrams/HeadStructure.astro';
```

- [ ] **Step 3: Insert component usage in the post**

In `src/content/blog/attention-variants.mdx`, find this exact text (end of GQA comparison table, before the uptraining paragraph):

```
| MQA | $1$ | $H\times$ smaller | Small degradation |

**Uptraining from MHA:**
```

Replace with:

```
| MQA | $1$ | $H\times$ smaller | Small degradation |

<HeadStructure />

**Uptraining from MHA:**
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build 2>&1 | tail -15
```

Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/diagrams/HeadStructure.astro src/content/blog/attention-variants.mdx
git commit -m "feat: add HeadStructure diagram to attention variants post"
```

---

### Task 4: Create FlashMemory component

**Files:**
- Create: `src/components/diagrams/FlashMemory.astro`
- Modify: `src/content/blog/attention-variants.mdx`

- [ ] **Step 1: Create the component**

Create `src/components/diagrams/FlashMemory.astro` with this exact content:

```astro
---
const PW = 290;
const PH = 195;
const PAD = 20;
const GAP = 40;
const TITLE_H = 22;
const TOTAL_W = PAD + 2 * PW + GAP + PAD;
const TOTAL_H = TITLE_H + PH + 10;

const GPU  = { x: 0, y: TITLE_H,      w: PW,  h: PH,  rx: 8 };
const SRAM = { x: 70, y: TITLE_H + 18, w: 150, h: 52 };
const HBM  = { x: 25, y: TITLE_H + 112, w: 240, h: 58 };

const P1X = PAD;
const P2X = PAD + PW + GAP;
---

<figure style="margin: 2rem 0; overflow-x: auto;">
  <svg
    width="100%"
    viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
    xmlns="http://www.w3.org/2000/svg"
    style="display: block; max-width: 100%;"
    aria-label="Flash Attention memory access comparison: standard vs flash"
  >
    <defs>
      <marker id="fa-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <polygon points="0 0, 7 3.5, 0 7" fill="var(--text-muted)" />
      </marker>
      <marker id="fa-arr-rev" markerWidth="7" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
        <polygon points="0 0, 7 3.5, 0 7" fill="var(--text-muted)" />
      </marker>
    </defs>

    {/* ── Panel 1: Standard Attention ── */}
    <g transform={`translate(${P1X}, 0)`}>
      <text x={PW / 2} y="16" text-anchor="middle" font-family="var(--font-sans)" font-size="13" font-weight="600" fill="var(--text)">Standard Attention</text>

      <rect x={GPU.x} y={GPU.y} width={GPU.w} height={GPU.h} rx={GPU.rx} fill="var(--bg-subtle)" stroke="var(--border)" stroke-width="1.5" />
      <text x="8" y={GPU.y + 13} font-family="var(--font-sans)" font-size="10" fill="var(--text-muted)">GPU</text>

      <rect x={SRAM.x} y={SRAM.y} width={SRAM.w} height={SRAM.h} rx="4" fill="var(--bg)" stroke="var(--accent)" stroke-width="2" />
      <text x={SRAM.x + SRAM.w / 2} y={SRAM.y + 20} text-anchor="middle" font-family="var(--font-sans)" font-size="12" font-weight="600" fill="var(--text)">SRAM</text>
      <text x={SRAM.x + SRAM.w / 2} y={SRAM.y + 36} text-anchor="middle" font-family="var(--font-sans)" font-size="10" fill="var(--text-muted)">(fast, ~20 MB)</text>

      <rect x={HBM.x} y={HBM.y} width={HBM.w} height={HBM.h} rx="4" fill="var(--bg)" stroke="var(--border)" stroke-width="1.5" />
      <text x={HBM.x + HBM.w / 2} y={HBM.y + 20} text-anchor="middle" font-family="var(--font-sans)" font-size="12" font-weight="600" fill="var(--text)">HBM</text>
      <text x={HBM.x + HBM.w / 2} y={HBM.y + 36} text-anchor="middle" font-family="var(--font-sans)" font-size="10" fill="var(--text-muted)">(slow, 40–80 GB)</text>

      <rect x={HBM.x + 55} y={HBM.y + 8} width={HBM.w - 110} height={HBM.h - 16} rx="2" fill="var(--accent)" fill-opacity="0.15" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3,2" />
      <text x={HBM.x + HBM.w / 2} y={HBM.y + HBM.h / 2 + 5} text-anchor="middle" font-family="var(--font-sans)" font-size="9" fill="var(--accent)">n×n matrix</text>

      {[0, 1, 2].map((k) => (
        <line
          x1={SRAM.x + 28 + k * 32}
          y1={SRAM.y + SRAM.h + 2}
          x2={SRAM.x + 28 + k * 32}
          y2={HBM.y - 2}
          stroke="var(--text-muted)"
          stroke-width={k === 0 ? 2 : 1.5}
          marker-end="url(#fa-arr)"
          marker-start="url(#fa-arr-rev)"
          stroke-dasharray={k > 0 ? '4,3' : undefined}
        />
      ))}
      <text x={SRAM.x + SRAM.w / 2} y={SRAM.y + SRAM.h + 30} text-anchor="middle" font-family="var(--font-sans)" font-size="11" fill="var(--text-muted)">3 round-trips</text>
    </g>

    {/* ── Panel 2: Flash Attention ── */}
    <g transform={`translate(${P2X}, 0)`}>
      <text x={PW / 2} y="16" text-anchor="middle" font-family="var(--font-sans)" font-size="13" font-weight="600" fill="var(--text)">Flash Attention</text>

      <rect x={GPU.x} y={GPU.y} width={GPU.w} height={GPU.h} rx={GPU.rx} fill="var(--bg-subtle)" stroke="var(--border)" stroke-width="1.5" />
      <text x="8" y={GPU.y + 13} font-family="var(--font-sans)" font-size="10" fill="var(--text-muted)">GPU</text>

      <rect x={SRAM.x} y={SRAM.y} width={SRAM.w} height={SRAM.h} rx="4" fill="var(--bg)" stroke="var(--accent)" stroke-width="2" />
      <text x={SRAM.x + SRAM.w / 2} y={SRAM.y + 20} text-anchor="middle" font-family="var(--font-sans)" font-size="12" font-weight="600" fill="var(--text)">SRAM</text>
      <text x={SRAM.x + SRAM.w / 2} y={SRAM.y + 36} text-anchor="middle" font-family="var(--font-sans)" font-size="10" fill="var(--text-muted)">(fast, ~20 MB)</text>

      <rect x={HBM.x} y={HBM.y} width={HBM.w} height={HBM.h} rx="4" fill="var(--bg)" stroke="var(--border)" stroke-width="1.5" />
      <text x={HBM.x + HBM.w / 2} y={HBM.y + 20} text-anchor="middle" font-family="var(--font-sans)" font-size="12" font-weight="600" fill="var(--text)">HBM</text>
      <text x={HBM.x + HBM.w / 2} y={HBM.y + 36} text-anchor="middle" font-family="var(--font-sans)" font-size="10" fill="var(--text-muted)">(slow, 40–80 GB)</text>

      {[0, 1, 2, 3].map((k) => (
        <rect
          x={SRAM.x + 16 + (k % 2) * 36}
          y={SRAM.y + 8 + Math.floor(k / 2) * 18}
          width={30}
          height={14}
          rx="2"
          fill="var(--accent)"
          fill-opacity="0.7"
        />
      ))}
      <text x={SRAM.x + SRAM.w - 8} y={SRAM.y + 28} text-anchor="end" font-family="var(--font-sans)" font-size="9" fill="var(--accent)">tiles</text>

      <line
        x1={SRAM.x + SRAM.w / 2}
        y1={SRAM.y + SRAM.h + 2}
        x2={HBM.x + HBM.w / 2}
        y2={HBM.y - 2}
        stroke="var(--text-muted)"
        stroke-width="2"
        marker-end="url(#fa-arr)"
      />
      <text x={SRAM.x + SRAM.w / 2} y={SRAM.y + SRAM.h + 30} text-anchor="middle" font-family="var(--font-sans)" font-size="11" fill="var(--text-muted)">output O only</text>
    </g>
  </svg>
  <figcaption style="text-align: center; font-style: italic; color: var(--text-muted); font-size: 0.875rem; margin-top: 0.5rem;">
    Figure 3: Standard attention makes 3 HBM round-trips over the n×n matrix. Flash Attention keeps tiles in SRAM and writes only output O to HBM.
  </figcaption>
</figure>
```

- [ ] **Step 2: Add import to attention-variants.mdx**

Find the existing import lines at the top of the file:
```
import AttentionPatterns from '../../components/diagrams/AttentionPatterns.astro';
import HeadStructure from '../../components/diagrams/HeadStructure.astro';
```

Add the FlashMemory import on the next line:
```
import AttentionPatterns from '../../components/diagrams/AttentionPatterns.astro';
import HeadStructure from '../../components/diagrams/HeadStructure.astro';
import FlashMemory from '../../components/diagrams/FlashMemory.astro';
```

- [ ] **Step 3: Insert component usage in the post**

In `src/content/blog/attention-variants.mdx`, find this exact text (after the result bullets in Section 6):

```
The mathematical output is bit-for-bit identical to standard attention.

### Subsequent Versions
```

Replace with:

```
The mathematical output is bit-for-bit identical to standard attention.

<FlashMemory />

### Subsequent Versions
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build 2>&1 | tail -15
```

Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/diagrams/FlashMemory.astro src/content/blog/attention-variants.mdx
git commit -m "feat: add FlashMemory diagram to attention variants post"
```

---

### Task 5: Final build check and deploy

**Files:** No changes.

- [ ] **Step 1: Full build verification**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds, 6 pages indexed (was 5 before; same page count since this is a rename not a new post).

- [ ] **Step 2: Verify git log shows all commits**

```bash
git log --oneline -6
```

Expected commits (most recent first):
```
feat: add FlashMemory diagram to attention variants post
feat: add HeadStructure diagram to attention variants post
feat: add AttentionPatterns diagram to attention variants post
feat: install @astrojs/mdx and convert attention post to .mdx
```

- [ ] **Step 3: Push to deploy**

```bash
git push origin main
```

GitHub Actions deploys to GitHub Pages. All three diagrams will be live and theme-responsive.
