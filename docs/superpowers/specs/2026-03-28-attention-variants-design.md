---
name: Attention Variants Blog Post
description: Design spec for a technical blog post tracing the evolution of attention mechanisms from vanilla MHA through MQA, GQA, Sparse, Sliding Window, Linear, and Flash Attention
type: project
---

# Attention Variants Blog Post — Design Spec

**Date:** 2026-03-28
**Target file:** `src/content/blog/attention-variants.md`

## Overview

A technically deep blog post tracing the evolution of transformer attention as a sequence of engineering problems and solutions. The narrative arc: vanilla attention doesn't scale → each bottleneck gets its own section, its solution, and the full math.

## Angle & Audience

- **Angle:** Evolution narrative — each section opens with a concrete bottleneck, then introduces the variant that solved it
- **Audience:** Technically literate ML readers who understand transformers but haven't studied attention variants in depth
- **Math depth:** Full equations — formulas, complexity derivations, kernel approximations

## Frontmatter

```yaml
title: "The Attention Bottleneck: How Modern LLMs Solved a Problem That Nearly Broke the Transformer"
description: "From vanilla MHA to Flash Attention 3 — the engineering problems that drove every major attention variant and the math behind each fix."
date: 2026-03-28
tags: ["transformers", "attention", "LLM", "deep learning", "GQA", "flash attention", "linear attention"]
```

## Section-by-Section Spec

### Section 1 — Hook

**Goal:** Establish that vanilla attention is genuinely unusable at modern context lengths.

**Content:**
- Every modern LLM is a transformer; every transformer is built around attention
- Concrete memory math: at 32K tokens, the attention matrix ≈ 4 GB for a single layer; doubling context → 4× memory
- Thesis: the variants covered in this post aren't academic curiosities — they're prerequisites for any LLM running today

**No equations yet. One or two concrete numbers to anchor the problem.**

---

### Section 2 — Baseline: Scaled Dot-Product Attention & Multi-Head Attention

**Goal:** Establish the math baseline everything else is measured against.

**Content:**

Scaled dot-product attention:
```
Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) * V
```
where Q ∈ R^{n×d_k}, K ∈ R^{n×d_k}, V ∈ R^{n×d_v}.

Multi-head attention:
```
MultiHead(Q, K, V) = Concat(head_1, ..., head_H) W^O
head_i = Attention(Q W^Q_i, K W^K_i, V W^V_i)
```

**Complexity:** Time O(n²d), memory O(n² + nd). Explain *why*: computing QK^T produces an n×n matrix.

**KV cache mechanics:** During autoregressive inference, K and V for all previous tokens are cached to avoid recomputation. Cache size per layer = `2 * seq_len * num_heads * head_dim * dtype_bytes`. This grows linearly with sequence length — setup for Section 3.

**Papers:** Vaswani et al., "Attention Is All You Need," NeurIPS 2017

---

### Section 3 — Problem 1: The KV Cache Explodes → Multi-Query Attention → Group Query Attention

**Goal:** Show how head-level redundancy in K/V is eliminated without hurting quality much.

**The problem:** For a 65B-parameter model at 32K context with H=64 heads, d_head=128, FP16: KV cache = `2 * 32K * 64 * 128 * 2 bytes * num_layers` → tens of GB per sequence. Inference is memory-bandwidth-bound.

**Multi-Query Attention (MQA) — Shazeer 2019:**
- Single shared K and V projection across all H query heads
```
head_i = Attention(Q W^Q_i, K W^K, V W^V)   # one W^K, W^V for all i
```
- KV cache shrinks by H×
- Quality: small perplexity increase; empirically acceptable for most tasks

**Group Query Attention (GQA) — Ainslie et al. 2023:**
- G groups; each group of H/G query heads shares one K/V head
```
head_i = Attention(Q W^Q_i, K W^K_{g(i)}, V W^V_{g(i)})
```
where g(i) = floor(i * G / H).
- MHA = GQA with G=H; MQA = GQA with G=1; GQA interpolates
- Memory savings: H/G× vs. MHA
- Uptraining recipe: mean-pool MHA K/V heads within each group to initialize GQA from existing checkpoints

**Comparison table:**
| Variant | K/V heads | Cache vs. MHA | Quality |
|---|---|---|---|
| MHA | H | 1× | Baseline |
| GQA (G groups) | G | H/G× smaller | Near-MHA |
| MQA | 1 | H× smaller | Small degradation |

**Papers:**
- Shazeer, "Fast Transformer Decoding: One Write-Head is All You Need," 2019
- Ainslie et al., "GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints," EMNLP 2023

**Deployed in:** PaLM (MQA), Llama 2 70B (GQA), Mistral 7B (GQA), Gemma (GQA)

---

### Section 4 — Problem 2: The Sequence Length Wall → Sparse Attention → Sliding Window Attention

**Goal:** Show how restricting which positions attend to each other breaks the O(n²) compute wall.

**The problem:** GQA/MQA reduced KV cache size but not attention *computation*. The QK^T matrix is still O(n²). At n=100K tokens: 10 billion entries, ~20 GB at FP16 for a single layer.

**Sparse Transformer — Child et al. 2019:**
- Apply a binary sparsity mask M ∈ {0,1}^{n×n} before softmax:
```
Attention_sparse(Q, K, V) = softmax((QK^T / sqrt(d_k)) + log(M)) * V
```
where M_{ij} = 1 if position i attends to j, else 0 (→ -∞ before softmax).
- Patterns:
  - **Local window:** M_{ij} = 1 iff |i-j| ≤ w
  - **Strided:** M_{ij} = 1 iff (i-j) mod k = 0
  - **Combined:** local + strided, covering O(n * sqrt(n)) pairs
- Complexity: O(n * s) where s is the number of non-zero entries per row (<<n)

**Sliding Window Attention:**
- Pure local window with window size W (causal: [i-W, i])
```
M_{ij} = 1 iff i - W ≤ j ≤ i
```
- Complexity: O(n * W)
- **Effective context depth:** with L layers stacked, information from position j can reach position i in ceil((i-j)/W) layers → effective receptive field = W × L
- Mistral 7B uses W=4096 with L=32 layers → effective context of ~131K tokens despite per-layer window of 4K

**Papers:**
- Child et al., "Generating Long Sequences with Sparse Transformers," 2019
- Beltagy et al., "Longformer: The Long-Document Transformer," 2020
- Jiang et al., "Mistral 7B," 2023

---

### Section 5 — Problem 3: Approximation Limits → Linear Attention

**Goal:** Show how replacing softmax with a kernel function changes the complexity class entirely.

**The problem:** Sparse attention still requires choosing fixed patterns. What if the important positions are spread unpredictably? And O(n * W) is still super-linear. Can we achieve true O(n)?

**The key insight — kernel decomposition:**

Standard attention requires computing softmax over all n positions jointly — the denominator couples every position:
```
Attention(Q, K, V)_i = sum_j [exp(q_i^T k_j / sqrt(d)) * v_j] / sum_j exp(q_i^T k_j / sqrt(d))
```

Replace the exponential kernel with a decomposable kernel k(q, k) = φ(q)^T φ(k):
```
Attention_linear(Q, K, V)_i = [sum_j φ(q_i)^T φ(k_j) * v_j] / sum_j φ(q_i)^T φ(k_j)
                             = φ(q_i)^T [sum_j φ(k_j) v_j^T] / φ(q_i)^T [sum_j φ(k_j)]
```

Compute `S = sum_j φ(k_j) v_j^T ∈ R^{d×d}` and `z = sum_j φ(k_j) ∈ R^d` once → O(nd²).
Then each query: `φ(q_i)^T S / φ(q_i)^T z` → O(d²) per query, O(nd²) total.

**Linear Transformer — Katharopoulos et al. 2020:**
- φ(x) = elu(x) + 1 (ensures positivity for valid kernel)
- Causal version: replace global sum with prefix sum → equivalent to an RNN
- Complexity: O(nd²) vs O(n²d) for standard attention

**Performer (FAVOR+) — Choromanski et al. 2020:**
- Approximate the softmax kernel specifically using random orthogonal features:
```
exp(q^T k / sqrt(d)) ≈ E[φ(q)^T φ(k)]
```
where φ(x) = (1/sqrt(m)) * exp(w_r^T x - ||x||²/2) for random w_r drawn from N(0, I)
- Unbiased estimator with provably low variance via orthogonal random features
- Reduces variance by ~d× vs. i.i.d. random features

**Quality cost:** Linear attention approximates softmax — loses the sharp, peaked attention distributions that help with precise token recall. Quality gap is larger for tasks requiring exact copying or lookup.

**Papers:**
- Katharopoulos et al., "Transformers are RNNs: Fast Autoregressive Transformers with Linear Attention," ICML 2020
- Choromanski et al., "Rethinking Attention with Performers," ICLR 2021

---

### Section 6 — Problem 4: GPU I/O Is the Real Wall → Flash Attention

**Goal:** Show that even exact O(n²) attention can be dramatically accelerated by rethinking *where* computation happens in the GPU memory hierarchy.

**The problem:** Practitioners with GQA, sparse, and linear attention still hit a wall — profiling shows attention is memory-bandwidth-bound, not compute-bound. The GPU spends most of its time moving data, not multiplying.

**The GPU memory hierarchy:**
- **SRAM (shared memory):** ~20 MB on A100, ~192 GB/s bandwidth, fast
- **HBM (high bandwidth memory):** ~40–80 GB on A100, ~2 TB/s bandwidth, "slow" relative to SRAM
- Standard attention writes the full n×n matrix to HBM, then reads it back for softmax, then reads again for the V multiplication: 3 passes over O(n²) memory

**Flash Attention — three ideas (Dao et al. 2022):**

1. **Tiling:** partition Q, K, V into blocks of size B_r × B_c that fit in SRAM. Compute attention block-by-block without ever materializing the full n×n matrix in HBM.

2. **Online softmax (stable):** to compute softmax without seeing all scores at once, maintain running statistics (m = max seen so far, l = sum of exp):
```
For each block:
  m_new = max(m_old, rowmax(S_block))
  l_new = exp(m_old - m_new) * l_old + rowsum(exp(S_block - m_new))
  O_new = diag(exp(m_old - m_new)) * O_old + exp(S_block - m_new) * V_block
```
After all blocks: O_final = diag(1/l_final) * O_new

3. **Recomputation (backward pass):** don't store the n×n attention matrix for backprop. Store only (O, softmax statistics l, m). Recompute attention scores from Q, K, V tiles during the backward pass — trades compute for memory.

**Result:** mathematically identical output to standard attention. IO complexity drops from O(n²) to O(n² / M) where M is SRAM size (typically 10–20× reduction in HBM reads/writes).

**Versions:**
- Flash Attention 1 (2022): 2–4× wall-clock speedup, 5–20× memory reduction vs. standard PyTorch attention
- Flash Attention 2 (2023): better parallelism across warps, reduced non-matmul FLOPs, ~2× faster than FA1
- Flash Attention 3 (2024): FP8 support, warp-specialized pipelines, async memory copies targeting H100 Hopper architecture

**Papers:**
- Dao et al., "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness," NeurIPS 2022
- Dao, "FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning," ICLR 2024
- Shah et al., "FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision," 2024

---

### Section 7 — Synthesis: How Modern LLMs Combine These

**Goal:** Show that these variants compose — production models stack them to solve independent bottlenecks simultaneously.

**Content:**

| Model | KV Reduction | Long Context | Training Speed |
|---|---|---|---|
| GPT-3 | MHA (none) | — | Standard |
| PaLM | MQA | — | — |
| Llama 2 70B | GQA | — | FA2 |
| Mistral 7B | GQA | Sliding Window (W=4096) | FA2 |
| Llama 3 (all sizes) | GQA | — | FA2 |
| Gemma | GQA | — | FA2 |

**Decision framework (the "so what"):**
- Hitting KV cache memory limits at inference → add GQA
- Hitting sequence length limits → add sliding window or linear attention
- Hitting training throughput → enable Flash Attention (always do this)
- These address different bottlenecks and compose without conflict

The field is still evolving: state-space models (Mamba) and hybrid architectures (Jamba, Zamba) represent a different branch — replacing attention with selective state transitions — but that is a separate post.

---

### Section 8 — References

All papers listed above with arXiv/venue links. Formatted per CLAUDE.md: collect into a References section at the end.

---

## Writing Constraints (from CLAUDE.md)

- Escape `$` as `\$` in Markdown (KaTeX interference)
- Title names the core concept explicitly
- Each section answers one question; no jargon stacking
- Sentences under 30 words
- No filler phrases
- Verify all paper dates, author names, and model names before publishing
