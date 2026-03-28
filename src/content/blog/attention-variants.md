---
title: "The Attention Bottleneck: How Modern LLMs Solved a Problem That Nearly Broke the Transformer"
description: "From vanilla multi-head attention to Flash Attention 3 — the engineering bottlenecks that drove every major attention variant and the math behind each fix."
date: 2026-03-28
tags: ["transformers", "attention", "LLM", "deep learning", "GQA", "flash attention", "linear attention"]
---

Every modern large language model — GPT-4, Llama 3, Gemini, Mistral — is a transformer. Every transformer is built around attention. But the original mechanism from "Attention Is All You Need" (Vaswani et al., 2017) cannot scale to those lengths. No GPU that exists today can run it at 128K tokens.

The math makes the problem concrete. The attention matrix for a single layer has $n^2$ entries, where $n$ is sequence length. At $n = 32{,}768$ tokens in FP16, that matrix occupies roughly 2 GB of GPU memory — for one layer. With 32 layers, attention matrices alone require 64 GB. The H100, the most powerful production GPU available, has 80 GB of HBM in total.

This post traces how the field solved that problem — not once, but four separate times, each addressing a different bottleneck. The variants covered here are not academic curiosities. They are prerequisites for every LLM running at scale today.

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
