---
title: "The Attention Bottleneck: How Modern LLMs Solved a Problem That Nearly Broke the Transformer"
description: "From vanilla multi-head attention to Flash Attention 3 — the engineering bottlenecks that drove every major attention variant and the math behind each fix."
date: 2026-03-28
tags: ["transformers", "attention", "LLM", "deep learning", "GQA", "flash attention", "linear attention"]
---

Every modern large language model — GPT-4, Llama 3, Gemini, Mistral — is a transformer. Every transformer is built around attention. But the original mechanism from "Attention Is All You Need" (Vaswani et al., 2017) cannot scale to those lengths. No GPU that exists today can run it at 128K tokens.

The math makes the problem concrete. The attention matrix for a single layer has $n^2$ entries, where $n$ is sequence length. At $n = 32{,}768$ tokens in FP16, that matrix occupies roughly 2 GB of GPU memory — for one layer. With 32 layers, attention matrices alone require 64 GB. The H100, the most powerful production GPU available, has 80 GB of HBM in total.

This post traces how the field solved that problem — not once, but four separate times, each addressing a different bottleneck. The variants covered here are not academic curiosities. They are prerequisites for every LLM running at scale today.
