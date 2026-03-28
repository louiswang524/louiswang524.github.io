# Attention Variants Blog Post Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write a technically deep blog post tracing the evolution of attention mechanisms through 8 sections, from vanilla MHA to Flash Attention 3, with full equations and paper citations.

**Architecture:** Single markdown file at `src/content/blog/attention-variants.md`. Sections are written and committed incrementally. KaTeX renders math — use `$...$` for inline, `$$...$$` for display math. Escape literal dollar signs (money) as `\$`.

**Tech Stack:** Astro static site, KaTeX for math, GitHub Actions deploy on push to main.

**Spec:** `docs/superpowers/specs/2026-03-28-attention-variants-design.md`

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/content/blog/attention-variants.md` | The entire blog post |

---

### Task 1: Frontmatter + Hook (Section 1)

**Files:**
- Create: `src/content/blog/attention-variants.md`

- [ ] **Step 1: Create file with frontmatter and hook**

Write the following to `src/content/blog/attention-variants.md`:

```markdown
---
title: "The Attention Bottleneck: How Modern LLMs Solved a Problem That Nearly Broke the Transformer"
description: "From vanilla multi-head attention to Flash Attention 3 — the engineering bottlenecks that drove every major attention variant and the math behind each fix."
date: 2026-03-28
tags: ["transformers", "attention", "LLM", "deep learning", "GQA", "flash attention", "linear attention"]
---

Every modern large language model — GPT-4, Llama 3, Gemini, Mistral — is a transformer. Every transformer is built around attention. But the attention mechanism described in "Attention Is All You Need" (Vaswani et al., 2017) cannot run a 128K-token context on any GPU that exists today.

The math makes the problem concrete. The attention matrix for a single layer has $n^2$ entries, where $n$ is sequence length. At $n = 32{,}768$ tokens in FP16, that matrix occupies roughly 2 GB of GPU memory — for one layer. With 32 layers, attention matrices alone require 64 GB. The H100, the most powerful production GPU available, has 80 GB of HBM in total.

This post traces how the field solved that problem — not once, but four separate times, each addressing a different bottleneck. The variants covered here are not academic curiosities. They are prerequisites for every LLM running at scale today.
```

- [ ] **Step 2: Verify file was created**

Run: `ls -la src/content/blog/attention-variants.md`
Expected: file exists with nonzero size.

- [ ] **Step 3: Commit**

```bash
git add src/content/blog/attention-variants.md
git commit -m "feat(blog): start attention variants post — hook"
```

---

### Task 2: Baseline — SDPA and Multi-Head Attention (Section 2)

**Files:**
- Modify: `src/content/blog/attention-variants.md`

- [ ] **Step 1: Append Section 2**

Append to `src/content/blog/attention-variants.md`:

```markdown

## The Baseline: Scaled Dot-Product Attention

Before examining the variants, we need a precise definition of what they are varying from. Scaled dot-product attention takes three matrices as input — queries $Q \in \mathbb{R}^{n \times d_k}$, keys $K \in \mathbb{R}^{n \times d_k}$, and values $V \in \mathbb{R}^{n \times d_v}$ — and produces a weighted sum of values:

$$\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right) V$$

The $\sqrt{d_k}$ scaling prevents dot products from growing large in magnitude, which would push softmax into regions with near-zero gradients.

**Multi-head attention (MHA)** runs $H$ independent attention computations in parallel, each projecting into a lower-dimensional subspace:

$$\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \ldots, \text{head}_H)\, W^O$$
$$\text{head}_i = \text{Attention}(Q W^Q_i,\; K W^K_i,\; V W^V_i)$$

where $W^Q_i, W^K_i \in \mathbb{R}^{d_{\text{model}} \times d_k}$, $W^V_i \in \mathbb{R}^{d_{\text{model}} \times d_v}$, and $d_k = d_v = d_{\text{model}} / H$.

### Complexity

Computing $QK^\top$ produces an $n \times n$ matrix. Time complexity is $O(n^2 d)$; memory to store the attention matrix is $O(n^2)$. This quadratic dependence on $n$ is the root cause of every problem in the sections that follow.

### The KV Cache

During autoregressive inference — generating one token at a time — the model must recompute keys and values for every previous token at each step unless they are cached. In practice, they are always cached: after computing $K$ and $V$ for position $i$, they are stored and reused for all future positions.

The cache size per transformer layer is:

$$\text{Cache} = 2 \times n_{\text{seq}} \times H \times d_{\text{head}} \times \text{bytes per value}$$

For a 70B-parameter model with $H = 64$ heads, $d_{\text{head}} = 128$, FP16 (2 bytes), and $n_{\text{seq}} = 32{,}768$:

$$\text{Cache per layer} = 2 \times 32768 \times 64 \times 128 \times 2 \approx 1\text{ GB}$$

With 80 layers: 80 GB — the entire memory of an H100, before weights, activations, or any other state. The KV cache is the first wall.
```

- [ ] **Step 2: Commit**

```bash
git add src/content/blog/attention-variants.md
git commit -m "feat(blog): add section 2 — MHA baseline and KV cache"
```

---

### Task 3: Problem 1 — MQA and GQA (Section 3)

**Files:**
- Modify: `src/content/blog/attention-variants.md`

- [ ] **Step 1: Append Section 3**

Append to `src/content/blog/attention-variants.md`:

```markdown

## Problem 1: The KV Cache Explodes

The KV cache grows with every attention head — and standard MHA has a lot of heads. The fix is to ask: do all those heads actually need their own keys and values?

### Multi-Query Attention

**Multi-Query Attention (MQA)** (Shazeer, 2019) answers no. It keeps $H$ query heads but collapses keys and values to a single shared head:

$$\text{head}_i = \text{Attention}(Q W^Q_i,\; K W^K,\; V W^V)$$

A single $W^K$ and $W^V$ replaces the $H$ separate projections. The KV cache shrinks by $H\times$. For $H = 64$, that is a 64× memory reduction at inference time.

The quality cost is real but small. Shazeer found perplexity increases of roughly 1–2% on language modeling tasks — acceptable for most applications, especially when the alternative is running out of memory.

### Group Query Attention

**Group Query Attention (GQA)** (Ainslie et al., 2023) generalizes MQA. Rather than collapsing to one K/V head, it creates $G$ groups. Each group of $H/G$ query heads shares one K/V head:

$$\text{head}_i = \text{Attention}(Q W^Q_i,\; K W^K_{g(i)},\; V W^V_{g(i)})$$

where $g(i) = \lfloor i \cdot G / H \rfloor$ maps each query head to its group.

MHA is GQA with $G = H$. MQA is GQA with $G = 1$. GQA interpolates between them:

| Variant | K/V heads | Cache vs. MHA | Quality vs. MHA |
|---|---|---|---|
| MHA | $H$ | $1\times$ | Baseline |
| GQA ($G$ groups) | $G$ | $H/G\times$ smaller | Near-identical |
| MQA | $1$ | $H\times$ smaller | Small degradation |

**Uptraining from MHA:** To convert an existing MHA checkpoint to GQA, Ainslie et al. propose mean-pooling the $H/G$ K/V head projections within each group to initialize the shared GQA head, then continuing training for a short period. This avoids training GQA models from scratch.

GQA is now the default in most production LLMs: Llama 2 70B, Llama 3, Mistral 7B, and Gemma all use it.
```

- [ ] **Step 2: Commit**

```bash
git add src/content/blog/attention-variants.md
git commit -m "feat(blog): add section 3 — MQA and GQA"
```

---

### Task 4: Problem 2 — Sparse and Sliding Window Attention (Section 4)

**Files:**
- Modify: `src/content/blog/attention-variants.md`

- [ ] **Step 1: Append Section 4**

Append to `src/content/blog/attention-variants.md`:

```markdown

## Problem 2: The Sequence Length Wall

GQA and MQA reduce the KV cache. They do not reduce the cost of computing attention itself. The $QK^\top$ matrix is still $n \times n$. At $n = 100{,}000$ tokens, that is $10^{10}$ entries — approximately 20 GB at FP16, per layer, before any K/V cache optimizations apply.

The question becomes: does every token need to attend to every other token?

### Sparse Attention

**Sparse Transformer** (Child et al., 2019) applies a binary mask $M \in \{0,1\}^{n \times n}$ to restrict which positions attend to each other:

$$\text{Attention}_{\text{sparse}}(Q, K, V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}} + \log M\right) V$$

where $\log M$ is zero at allowed positions and $-\infty$ at masked positions (which become zero after softmax). Three patterns proved most useful:

- **Local window:** $M_{ij} = 1$ iff $|i - j| \leq w$. Each token attends to its $2w$ nearest neighbors.
- **Strided:** $M_{ij} = 1$ iff $(i - j) \bmod k = 0$. Every $k$-th token is globally visible.
- **Combined:** local + strided, covering $O(n\sqrt{n})$ pairs instead of $O(n^2)$.

### Sliding Window Attention

**Sliding Window Attention**, used in Longformer (Beltagy et al., 2020) and Mistral 7B (Jiang et al., 2023), is the causal special case of local windowing: each token attends only to the $W$ most recent positions:

$$M_{ij} = \mathbf{1}[i - W \leq j \leq i]$$

Complexity drops from $O(n^2)$ to $O(n \cdot W)$.

**Effective receptive field across layers:** Although each layer sees only a window of size $W$, information propagates across layers. A token at position $i$ can receive information from position $j$ in $\lceil (i - j) / W \rceil$ layers. With $L$ layers stacked, the effective receptive field is $W \times L$.

Mistral 7B uses $W = 4{,}096$ with $L = 32$ transformer layers:

$$\text{Effective context} = 4{,}096 \times 32 = 131{,}072 \text{ tokens}$$

This is why Mistral achieves strong long-context performance despite attending to a small local window per layer.
```

- [ ] **Step 2: Commit**

```bash
git add src/content/blog/attention-variants.md
git commit -m "feat(blog): add section 4 — sparse and sliding window attention"
```

---

### Task 5: Problem 3 — Linear Attention (Section 5)

**Files:**
- Modify: `src/content/blog/attention-variants.md`

- [ ] **Step 1: Append Section 5**

Append to `src/content/blog/attention-variants.md`:

```markdown

## Problem 3: Even $O(n \cdot W)$ Has Limits

Sparse and sliding window patterns reduce the constant but do not change the complexity class. For very long sequences — or tasks where important context is globally distributed — fixed sparsity patterns miss signal. The deeper question is: can we reduce the complexity of attention from $O(n^2)$ to $O(n)$?

### The Kernel Decomposition

The obstacle is the softmax. Written out explicitly, the $i$-th output of attention is:

$$\text{Attention}(Q, K, V)_i = \frac{\sum_j \exp(q_i^\top k_j / \sqrt{d})\, v_j}{\sum_j \exp(q_i^\top k_j / \sqrt{d})}$$

The denominator sums over all $j$ — the positions are coupled. You cannot compute the outputs independently.

Linear attention replaces the exponential kernel with a decomposable kernel $\kappa(q, k) = \phi(q)^\top \phi(k)$ for some feature map $\phi : \mathbb{R}^d \to \mathbb{R}^r$:

$$\text{Attention}_{\text{linear}}(Q, K, V)_i = \frac{\phi(q_i)^\top \sum_j \phi(k_j)\, v_j^\top}{\phi(q_i)^\top \sum_j \phi(k_j)}$$

Now factor the computation. Define:

$$S = \sum_j \phi(k_j)\, v_j^\top \in \mathbb{R}^{r \times d}, \qquad z = \sum_j \phi(k_j) \in \mathbb{R}^r$$

Compute $S$ and $z$ once in $O(nr)$ time. Then each query is: $\phi(q_i)^\top S \;/\; \phi(q_i)^\top z$ in $O(r)$ time. Total: $O(nr)$ — linear in sequence length.

### Linear Transformer

**Linear Transformer** (Katharopoulos et al., 2020) uses $\phi(x) = \text{elu}(x) + 1$, which ensures positivity (required for the kernel interpretation). The causal variant accumulates $S$ and $z$ as prefix sums, making it equivalent to an RNN — enabling $O(1)$ per-step inference once the recurrence is unrolled.

### Performer (FAVOR+)

Rather than replacing softmax with an arbitrary kernel, **Performer** (Choromanski et al., 2020) approximates the softmax kernel itself using random features (FAVOR+: Fast Attention Via positive Orthogonal Random features):

$$\exp(q^\top k / \sqrt{d}) \approx \mathbb{E}_\omega\!\left[\phi_\omega(q)^\top \phi_\omega(k)\right]$$

where $\phi_\omega(x) = \frac{1}{\sqrt{m}}\exp\!\left(\omega_r^\top x - \tfrac{\|x\|^2}{2}\right)$ for random directions $\omega_r \sim \mathcal{N}(0, I_d)$ drawn as orthogonal vectors. Orthogonality reduces estimator variance by approximately $d\times$ compared to i.i.d. sampling.

### Quality Trade-off

Linear attention approximates softmax — it loses the sharp, peaked attention distributions that standard attention learns. For tasks requiring precise token recall (e.g. copying a specific value from earlier in the context), the approximation gap is measurable. For tasks that aggregate information over long spans, linear attention is often competitive with standard attention at a fraction of the compute.
```

- [ ] **Step 2: Commit**

```bash
git add src/content/blog/attention-variants.md
git commit -m "feat(blog): add section 5 — linear attention and FAVOR+"
```

---

### Task 6: Problem 4 — Flash Attention (Section 6)

**Files:**
- Modify: `src/content/blog/attention-variants.md`

- [ ] **Step 1: Append Section 6**

Append to `src/content/blog/attention-variants.md`:

```markdown

## Problem 4: The GPU I/O Wall

By 2022, practitioners using sparse and linear attention noticed something unexpected: profiling showed that standard attention was not compute-bound. The GPU's tensor cores were sitting idle. The real bottleneck was memory bandwidth — the time spent moving data between different parts of the GPU's memory hierarchy.

### The GPU Memory Hierarchy

Modern GPUs have two relevant memory tiers:

- **SRAM (shared memory, on-chip):** ~20 MB on an A100, bandwidth ~19 TB/s
- **HBM (high-bandwidth memory, off-chip):** 40–80 GB on an A100, bandwidth ~2 TB/s

SRAM is roughly 10× faster than HBM but 2,000× smaller. Standard attention reads $Q$, $K$, $V$ from HBM, computes $QK^\top$ (an $n \times n$ matrix), writes it to HBM, reads it back for softmax, writes again, reads again for the $V$ multiplication. That is three round-trips over $O(n^2)$ data — dominated by HBM bandwidth, not arithmetic.

### Flash Attention

**Flash Attention** (Dao et al., 2022) achieves the same mathematical output as standard attention while never materializing the full $n \times n$ matrix in HBM. It does this with three ideas:

**1. Tiling.** Partition $Q$, $K$, $V$ into blocks of size $B_r \times B_c$ that fit in SRAM. Process one block at a time, keeping all intermediate values on-chip.

**2. Online softmax.** Softmax over a full row requires seeing all scores first. The online softmax algorithm computes a numerically stable result using running statistics. For each new block of key-value pairs, update:

$$m^{\text{new}} = \max(m^{\text{old}},\; \text{rowmax}(S_{\text{block}}))$$
$$\ell^{\text{new}} = e^{m^{\text{old}} - m^{\text{new}}} \cdot \ell^{\text{old}} + \text{rowsum}\!\left(e^{S_{\text{block}} - m^{\text{new}}}\right)$$
$$O^{\text{new}} = \text{diag}\!\left(e^{m^{\text{old}} - m^{\text{new}}}\right) O^{\text{old}} + e^{S_{\text{block}} - m^{\text{new}}} V_{\text{block}}$$

After all blocks: $O_{\text{final}} = \text{diag}(1/\ell^{\text{new}}) \cdot O^{\text{new}}$.

This produces the exact same result as computing softmax over all scores at once.

**3. Recomputation.** The backward pass normally needs the $n \times n$ attention matrix to compute gradients. Flash Attention discards it and recomputes from the saved output $O$ and softmax statistics $(\ell, m)$ during backprop. This trades extra FLOPs for drastically less HBM traffic.

**Result:** IO complexity drops from $O(n^2)$ to $O(n^2 / M)$ where $M$ is SRAM size. On an A100:

- **2–4×** wall-clock speedup over PyTorch standard attention
- **5–20×** reduction in GPU memory usage for the attention operation

The mathematical output is bit-for-bit identical to standard attention.

### Subsequent Versions

- **Flash Attention 2** (Dao, 2023): restructures work partitioning across GPU warps to reduce non-matmul FLOPs and improve parallelism. Roughly 2× faster than FA1.
- **Flash Attention 3** (Shah et al., 2024): targets the H100's Hopper architecture specifically — uses warp-specialized pipelines, asynchronous memory copies, and FP8 precision. Achieves up to 75% of the H100's theoretical FP8 peak FLOPS.
```

- [ ] **Step 2: Commit**

```bash
git add src/content/blog/attention-variants.md
git commit -m "feat(blog): add section 6 — flash attention"
```

---

### Task 7: Synthesis Table and "So What" (Section 7)

**Files:**
- Modify: `src/content/blog/attention-variants.md`

- [ ] **Step 1: Append Section 7**

Append to `src/content/blog/attention-variants.md`:

```markdown

## How Modern LLMs Combine These

No single variant won. Production models stack them because the bottlenecks they address are independent:

| Model | KV Reduction | Long Context | IO Efficiency |
|---|---|---|---|
| GPT-3 (2020) | MHA — none | — | Standard |
| PaLM (2022) | MQA | — | Standard |
| Llama 2 70B (2023) | GQA | — | Flash Attention 2 |
| Mistral 7B (2023) | GQA | Sliding Window ($W = 4096$) | Flash Attention 2 |
| Llama 3 8B/70B (2024) | GQA | — | Flash Attention 2 |
| Gemma 7B (2024) | GQA | — | Flash Attention 2 |

The combinations are not arbitrary. Each technique addresses a different bottleneck:

- **GQA** attacks the KV cache — the memory cost per sequence during inference.
- **Sliding Window Attention** attacks the per-layer compute cost for long inputs.
- **Flash Attention** attacks GPU memory bandwidth — it applies regardless of which attention variant you use.

The practical decision tree: if you are building or fine-tuning a model and hitting KV cache memory limits → add GQA. If you are hitting sequence length limits → add sliding window or linear attention. If you are hitting training throughput → enable Flash Attention. These fixes do not conflict.

**What this post does not cover:** state-space models (Mamba, S4) and hybrid architectures (Jamba, Zamba) represent a different branch of the scaling tree — replacing attention with selective state transitions rather than approximating it. That is a separate post.
```

- [ ] **Step 2: Commit**

```bash
git add src/content/blog/attention-variants.md
git commit -m "feat(blog): add section 7 — synthesis and production usage table"
```

---

### Task 8: References Section (Section 8)

**Files:**
- Modify: `src/content/blog/attention-variants.md`

- [ ] **Step 1: Append References**

Append to `src/content/blog/attention-variants.md`:

```markdown

## References

1. Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I. (2017). [Attention Is All You Need](https://arxiv.org/abs/1706.03762). *NeurIPS 2017*.

2. Shazeer, N. (2019). [Fast Transformer Decoding: One Write-Head is All You Need](https://arxiv.org/abs/1911.02150). *arXiv:1911.02150*.

3. Ainslie, J., Lee-Thorp, J., de Jong, M., Zemlyanskiy, Y., Lebrón, F., & Sanghai, S. (2023). [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://arxiv.org/abs/2305.13245). *EMNLP 2023*.

4. Child, R., Gray, S., Radford, A., & Sutskever, I. (2019). [Generating Long Sequences with Sparse Transformers](https://arxiv.org/abs/1904.10509). *arXiv:1904.10509*.

5. Beltagy, I., Peters, M. E., & Cohan, A. (2020). [Longformer: The Long-Document Transformer](https://arxiv.org/abs/2004.05150). *arXiv:2004.05150*.

6. Jiang, A. Q., Sablayrolles, A., Mensch, A., Bamford, C., Chaplot, D. S., de las Casas, D., Bressand, F., Lengyel, G., Lample, G., Saulnier, L., Lavaud, L. R., Lachaux, M.-A., Stock, P., Le Scao, T., Lavril, T., Wang, T., Lacroix, T., & El Sayed, W. (2023). [Mistral 7B](https://arxiv.org/abs/2310.06825). *arXiv:2310.06825*.

7. Katharopoulos, A., Vyas, A., Pappas, N., & Fleuret, F. (2020). [Transformers are RNNs: Fast Autoregressive Transformers with Linear Attention](https://arxiv.org/abs/2006.16236). *ICML 2020*.

8. Choromanski, K., Likhosherstov, V., Dohan, D., Song, X., Gane, A., Sarlos, T., Hawkins, P., Davis, J., Mohiuddin, A., Kaiser, Ł., Belanger, D., Colwell, L., & Weller, A. (2020). [Rethinking Attention with Performers](https://arxiv.org/abs/2009.14794). *ICLR 2021*.

9. Dao, T., Fu, D. Y., Ermon, S., Rudra, A., & Ré, C. (2022). [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135). *NeurIPS 2022*.

10. Dao, T. (2023). [FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning](https://arxiv.org/abs/2307.08691). *ICLR 2024*.

11. Shah, J., Bikshandi, G., Zhang, Y., Thakkar, V., Ramani, P., & Dao, T. (2024). [FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision](https://arxiv.org/abs/2407.08608). *arXiv:2407.08608*.
```

- [ ] **Step 2: Commit**

```bash
git add src/content/blog/attention-variants.md
git commit -m "feat(blog): add references section"
```

---

### Task 9: Logic Pass + KaTeX Check + Fact-Check

**Files:**
- Modify: `src/content/blog/attention-variants.md` (corrections only)

- [ ] **Step 1: Logic pass — verify narrative flow**

Read through the full post. Check each transition:
- Section 2 → 3: does Section 3 open by referencing the KV cache problem established in Section 2? If not, add a one-sentence bridge.
- Section 3 → 4: does Section 4 open by stating GQA reduced the cache but not the computation? It should.
- Section 4 → 5: does Section 5 open by acknowledging sparse patterns still have limits? It should.
- Section 5 → 6: does Section 6 frame the I/O problem as separate from algorithmic complexity? It should say "even with sparse/linear attention, profiling revealed a different bottleneck."
- If any transition is missing, add a one-sentence bridge paragraph.

- [ ] **Step 2: KaTeX scan — find unescaped literal dollar signs**

Run: `grep -n '\$' src/content/blog/attention-variants.md | grep -v '\\\$' | grep -v '^\$\$' | grep -v '\$[A-Za-z\\{]'`

Any hit that refers to a dollar amount (money) rather than a math expression must be changed to `\$`. Math expressions starting with `$` followed by a letter, `{`, or `\` are correct.

- [ ] **Step 3: Verify all paper citations have arXiv links**

Run: `grep -n '\[' src/content/blog/attention-variants.md | grep -v 'http'`

Any citation without a URL: check against the References section. If the body text cites a paper without linking to it, the link is in the References section — that is acceptable; no change needed.

- [ ] **Step 4: Verify model names and dates**

Confirm these facts are correct in the post:
- Llama 2 70B uses GQA ✓ (Touvron et al. 2023)
- Mistral 7B uses GQA + sliding window W=4096 ✓ (Jiang et al. 2023)
- Flash Attention 2 paper: ICLR 2024 ✓
- PaLM uses MQA ✓ (Chowdhery et al. 2022)
- Flash Attention 3 targets H100 Hopper ✓

If any fact in the post contradicts the above, correct it.

- [ ] **Step 5: Commit corrections (if any)**

```bash
git add src/content/blog/attention-variants.md
git commit -m "fix(blog): logic pass and fact-check on attention variants post"
```

If no changes were needed, skip this step.

---

### Task 10: Deploy

**Files:**
- No file changes.

- [ ] **Step 1: Final render check — run local build**

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds with no errors. If KaTeX errors appear, they will reference the specific line — fix the malformed expression and re-run.

- [ ] **Step 2: Push to deploy**

Run: `git push origin main`

GitHub Actions will deploy to GitHub Pages. Confirm the post appears at the expected URL.

- [ ] **Step 3: Verify post is live**

Run: `git log --oneline -8`
Expected: all 7 commits from this plan appear in history.
