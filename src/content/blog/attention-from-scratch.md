---
title: "Implementing Multi-Head Attention from Scratch in PyTorch"
description: "A step-by-step walkthrough of the attention mechanism — the core building block behind every modern transformer model."
date: 2026-02-10
tags: ["deep learning", "PyTorch", "transformers"]
---

Attention is the single most important operation in modern deep learning. Every transformer — GPT, BERT, Llama, Gemini — is built on top of it. This post implements multi-head self-attention from scratch, explaining each step along the way.

## The Intuition

Before the math, the intuition: attention lets each token in a sequence look at every other token and decide how much to "attend" to it when computing its own representation.

If you're processing the sentence *"The cat sat on the mat"* and computing the representation of "sat", attention lets the model say: "the word 'cat' is very relevant here (it's the subject), 'mat' is somewhat relevant (it's where the sitting happens), and 'the' articles are less relevant."

This dynamic, context-dependent weighting is what makes transformers so powerful compared to fixed-window convolutions or sequential RNNs.

## Scaled Dot-Product Attention

The core formula is:

```
Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) · V
```

Where:
- **Q** (queries): what each token is looking for
- **K** (keys): what each token has to offer
- **V** (values): the actual content each token contributes

```python
import torch
import torch.nn.functional as F
import math

def scaled_dot_product_attention(Q, K, V, mask=None):
    d_k = Q.size(-1)

    # (batch, heads, seq, seq)
    scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(d_k)

    if mask is not None:
        scores = scores.masked_fill(mask == 0, float('-inf'))

    weights = F.softmax(scores, dim=-1)
    return torch.matmul(weights, V), weights
```

The `sqrt(d_k)` scaling prevents the dot products from growing too large in magnitude (which would push softmax into regions with tiny gradients).

## Multi-Head Attention

Running attention once gives you one perspective. Multi-head attention runs it in parallel `h` times with different learned projections, then concatenates the results.

```python
import torch.nn as nn

class MultiHeadAttention(nn.Module):
    def __init__(self, d_model: int, num_heads: int):
        super().__init__()
        assert d_model % num_heads == 0

        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads

        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)

    def split_heads(self, x: torch.Tensor) -> torch.Tensor:
        batch, seq, _ = x.size()
        # (batch, seq, d_model) -> (batch, heads, seq, d_k)
        x = x.view(batch, seq, self.num_heads, self.d_k)
        return x.transpose(1, 2)

    def forward(self, x: torch.Tensor, mask=None) -> torch.Tensor:
        Q = self.split_heads(self.W_q(x))
        K = self.split_heads(self.W_k(x))
        V = self.split_heads(self.W_v(x))

        attended, _ = scaled_dot_product_attention(Q, K, V, mask)

        # (batch, heads, seq, d_k) -> (batch, seq, d_model)
        batch, _, seq, _ = attended.size()
        attended = attended.transpose(1, 2).contiguous().view(batch, seq, self.d_model)

        return self.W_o(attended)
```

## Testing It

```python
# Quick sanity check
d_model, num_heads, seq_len, batch = 512, 8, 64, 4

mha = MultiHeadAttention(d_model=d_model, num_heads=num_heads)
x = torch.randn(batch, seq_len, d_model)
out = mha(x)

assert out.shape == (batch, seq_len, d_model)
print(f"Output shape: {out.shape}")  # torch.Size([4, 64, 512])
```

## What Could Break

A few things to watch out for when implementing attention:

1. **Dimension ordering**: PyTorch convention is `(batch, heads, seq, d_k)` — get this wrong and matrix multiplications silently produce garbage.
2. **Causal masking**: For autoregressive models (GPT-style), you need to mask future tokens. Pass a lower-triangular boolean mask.
3. **Numerical stability**: `float('-inf')` in the mask ensures masked positions get zero weight after softmax, but can cause NaN if an entire row is masked.

## Next Steps

This implementation is correct but not fast. Production transformers use:
- Flash Attention (fused CUDA kernel, avoids materializing the full attention matrix)
- Grouped-query attention (GQA) to reduce KV cache memory
- `torch.nn.functional.scaled_dot_product_attention` which dispatches to FlashAttention automatically since PyTorch 2.0
