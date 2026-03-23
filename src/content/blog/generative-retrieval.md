---
title: "Generative Retrieval: How Big Tech Is Rethinking Recommendation"
description: "From HSTU to OneRec Think — a deep dive into how generative models are replacing traditional two-stage retrieval pipelines, what's already in production, and where the field is heading."
date: 2026-03-23
tags: ["recommendation systems", "generative AI", "HSTU", "OneRec"]
---

For two decades, industrial recommendation systems followed the same blueprint: a two-stage pipeline where a lightweight retrieval model narrows millions of candidates down to hundreds, and a heavy ranking model scores them. It worked. But it has a fundamental ceiling — the retrieval stage is a bottleneck that the ranker can never fully compensate for. If the right item isn't retrieved, it will never be recommended.

Generative retrieval proposes a different answer: instead of retrieving and then ranking, *generate* the recommendation directly. This post traces the evolution of that idea from academic novelty to production infrastructure at the world's largest platforms.

## The Problem with Two-Stage Pipelines

The classic funnel — ANN retrieval → re-ranking — has real advantages. It's fast, modular, and independently scalable. But its structure bakes in several compromises:

- **The retrieval bottleneck**: The retrieval model must be simple enough to run at scale, which limits its expressiveness. Complex user signals and long interaction histories are often lost here.
- **Stage inconsistency**: Retrieval and ranking are trained with different objectives, on different feature sets, with no joint optimization signal.
- **Fixed representation**: Candidate items are indexed as static embeddings. The model can't dynamically generate novel combinations or surface long-tail content that never built up a strong embedding.

Generative retrieval sidesteps these by collapsing the pipeline: given a user's context, a single autoregressive model directly outputs item identifiers, token by token.

## HSTU: The Architecture That Changed the Game

Meta's **HSTU (Hierarchical Sequential Transduction Unit)** [[paper]](https://arxiv.org/abs/2402.17152), published in 2024, is the most influential industrial generative retrieval architecture to date. It powers Meta's Reels recommendation at billion-user scale.

The core insight is that recommendation can be framed as a sequence-to-sequence problem. A user's interaction history — watched videos, liked posts, search queries — forms an input sequence. The model generates the next recommended item identifier as output.

HSTU's architecture borrows heavily from transformers but makes several adaptations for recommendation:

**Hierarchical temporal encoding.** User interactions happen at different time scales — items watched in the last minute vs. last year carry different signals. HSTU encodes time hierarchically, allowing the model to attend across timescales efficiently.

**Relative position biases.** Unlike language, where token order is fixed, recommendation sequences have rich temporal and categorical structure. HSTU uses learned relative position biases rather than absolute positional encodings.

**Efficient attention for long sequences.** User histories in production can span thousands of interactions. HSTU uses a form of linear attention that keeps complexity manageable without losing the expressive power of full attention over long contexts.

The results Meta reported were striking: HSTU outperformed their previous retrieval system significantly on engagement metrics, and it simplified the overall system architecture by reducing the number of specialized retrieval models needed.

## OneRec: Kuaishou's End-to-End Generative Recommender

While Meta's HSTU focuses on retrieval, Kuaishou (the Chinese short-video platform) went further with **OneRec** [[paper]](https://arxiv.org/abs/2502.18965) — an attempt to unify retrieval, ranking, and re-ranking into a single generative model trained end-to-end.

The core idea: instead of a funnel, use a single autoregressive model that generates an ordered list of recommendations directly from user context. This is closer in spirit to large language model generation than traditional recommendation.

OneRec represents items using **semantic identifiers** — hierarchical codes learned through vector quantization of item content embeddings. Rather than a lookup table of arbitrary item IDs, items are assigned structured codes that encode semantic similarity. Semantically similar items have similar code prefixes, which allows the model to generalize across the item space more effectively than with random IDs.

### OneRec V2: Scaling and Quality

OneRec V2 [[paper]](https://arxiv.org/abs/2508.20900) addressed the practical challenges of the first version: training instability at scale, the difficulty of learning good semantic item codes, and inference latency.

Key improvements in V2:
- **Better code learning**: V2 uses a two-stage codebook learning process, first learning content-based codes and then fine-tuning them on engagement signals. This produces codes that are both semantically meaningful and behaviorally discriminative.
- **Beam search decoding**: Rather than greedy generation, V2 uses beam search to generate multiple candidate lists and select the best one — a direct analogy to how LLMs improve output quality with search at inference time.
- **Constrained decoding**: To avoid generating invalid item identifiers, V2 uses a prefix tree (trie) of valid item codes to constrain the decoding process.

### OneRec Think: Reasoning Before Recommending

OneRec Think [[paper]](https://arxiv.org/abs/2510.11639) is the most recent and most ambitious step: adding a chain-of-thought reasoning step before generating recommendations.

The model first generates an explicit "reasoning trace" — a structured natural language summary of the user's inferred interests, mood, and context — and then generates recommendations conditioned on that trace.

This addresses a known weakness of pure autoregressive recommendation: the model has limited "scratch space" for complex multi-step reasoning about what a user might want. By externalizing reasoning as tokens, the model can consider factors like:

- "This user tends to watch cooking content in the evenings but exercise content in the mornings — it's 7am"
- "They just watched a sad video; upbeat content might see lower engagement"
- "They've seen this creator's last 5 videos; novelty is likely important"

OneRec Think showed significant gains on Kuaishou's long-form video platform, particularly for users with complex or evolving interests where shallow retrieval methods historically underperformed.

## What Other Big Tech Platforms Are Doing

### Google / YouTube

Google's generative retrieval work centers on **semantic IDs** — replacing arbitrary item IDs with structured, learnable token codes that encode content meaning. Their **PLUM framework** [[paper]](https://arxiv.org/abs/2510.07784) (2024), built on a Gemini backbone, treats recommendation as a pure generation task: given a user's context, the model autoregressively generates the semantic ID tokens of the next recommended video, rather than doing a dot-product lookup against item embeddings.

Items are tokenized using **RQ-VAE (Residual Quantized Variational AutoEncoder)**, which produces a hierarchical code: the first token captures broad category ("sports"), the second narrows it ("basketball"), and deeper tokens encode finer-grained content details. This hierarchy is the key advantage over arbitrary IDs — semantically similar videos share code prefixes, allowing the generative model to generalize across related content and surface long-tail items it has never seen in training. The model is adapted from Gemini via **Continued Pre-Training (CPT)** on user watch sequences, teaching it a "language of YouTube videos" on top of its existing world knowledge.

In live A/B testing on YouTube Shorts, PLUM delivered a **+4.96% lift in panel CTR** — an exceptionally large gain at YouTube's scale. It is particularly strong for cold-start scenarios: new users with thin history, and fresh videos with no engagement signals yet. These are exactly the cases where traditional collaborative filtering fails, because there is no interaction data to form meaningful embeddings.

The central production challenge is latency: autoregressive token generation is sequential and expensive at billions of users. Google's solution was aggressive **offline pre-computation** — pre-generating candidate lists for known user contexts and caching them — reducing serving cost by over 95% while preserving most of the quality gain from the generative approach.

### Alibaba / Taobao

Alibaba's generative recommendation work is notable for tackling a challenge unique to e-commerce: **items have rich structured attributes** (category, price tier, brand, seller type) that pure content embeddings often fail to capture well. Their **TIGER** system [[paper]](https://arxiv.org/abs/2305.05065) (NeurIPS 2023) addresses this directly. Like PLUM and OneRec, TIGER assigns items hierarchical semantic IDs via RQ-VAE and uses a transformer to autoregressively generate the next item's tokens. The key e-commerce twist: TIGER's codebook learning explicitly incorporates structured product metadata alongside content embeddings, so that products sharing a category and price range land in the same region of the code space. This is critical for cross-sell and substitute recommendations — where the right item may be one the user has never seen but is structurally similar to what they've bought before.

On the ranking side, **LUM (Large User Model)** [[paper]](https://arxiv.org/abs/2502.08309) (2026) takes a different architectural stance than OneRec's end-to-end approach. Rather than replacing the existing DLRM stack, LUM is a large generative model that runs *alongside* it: pre-trained on tokenized user behavior sequences with a generative objective, then queried via condition tokens that represent task context (e.g. "homepage feed, mobile, morning"), and its output representations injected as supplementary features into the production ranking model. This decoupled design means the large model's compute runs entirely offline — its outputs are cached — making deployment practical without rewriting the serving stack. LUM demonstrated power-law scaling improvements up to **7B parameters** and delivered a **+2.9% CTR improvement** in live A/B testing on Taobao.

The two systems reflect a deliberate strategy: use generative retrieval (TIGER) to get better candidates, use a generative pre-trained user model (LUM) to score them better, while keeping both as drop-in improvements rather than a full pipeline replacement.

### LinkedIn

LinkedIn's approach [[blog]](https://www.linkedin.com/blog/engineering/feed/engineering-the-next-generation-of-linkedins-feed) (March 2026) is the clearest example of the **modernized pipeline** strategy — rather than collapsing retrieval and ranking into a single generative model, they upgraded each stage independently with modern LLM and transformer technology.

**Retrieval: LLM-enhanced two-tower.** LinkedIn replaced their shallow dual encoder with an LLM-backbone two-tower model, trained with InfoNCE loss and hard negative mining. The architecture is still two-tower at heart, but the expressive power of the LLM encoder closes much of the quality gap with end-to-end approaches. Hard negative mining alone contributed a **3.6% improvement in recall**, and the full system achieved **+15% recall@10** over the legacy retrieval.

A particularly interesting insight: LLMs don't inherently understand raw numerical magnitudes. Feeding a raw engagement count like "4,382 likes" as a number is largely meaningless to an LLM encoder. LinkedIn's solution — converting continuous engagement counts into **percentile buckets wrapped in special tokens** — resulted in a **30× increase in correlation** between popularity features and embedding similarity.

**Ranking: large sequence transformer.** The ranking model is a transformer with causal attention that processes over 1,000 historical user interactions as a unified chronological sequence — essentially a GPT-style model applied to user history. Post-action pairs are interleaved during training, and the transformer output is combined via late fusion with count and affinity features, feeding into a Multi-gate Mixture-of-Experts (MMoE) prediction head.

**Production engineering.** At 1.3 billion professionals, LinkedIn built substantial custom infrastructure: GRMIS (a custom Flash Attention variant delivering **2× speedup** over PyTorch's standard implementation), custom CUDA kernels for multi-label AUC computation, and a disaggregated CPU/GPU serving architecture that achieves **sub-50ms retrieval** at thousands of queries per second.

The LinkedIn approach sits between the traditional pipeline and pure generative retrieval:

| Approach | Retrieval | Ranking | Pipeline |
|---|---|---|---|
| Traditional | Shallow two-tower | GBDT / shallow DNN | Two-stage |
| **LinkedIn** | **LLM two-tower** | **Large sequence transformer** | **Two-stage (upgraded)** |
| Meta HSTU | Generative model | — | Collapsed |
| Kuaishou OneRec | Generative model | Generative model | Fully collapsed |

This incremental strategy has a real advantage: it's far less risky to upgrade each stage independently than to replace the entire pipeline at once, especially at LinkedIn's scale. The tradeoff is that joint optimization across retrieval and ranking remains out of reach — the two stages are still trained separately with different objectives.

### ByteDance / TikTok

ByteDance's generative recommendation work is defined by two parallel tracks: making the sequence model itself larger and more expressive, and making the item representations richer through multimodal signals.

On sequence modeling, **HLLM (Hierarchical Large Language Models)** [[paper]](https://arxiv.org/abs/2409.12740) (2024) adapts LLMs for recommendation by splitting the problem into two stages. An **Item LLM** processes each item's text description and emits a compact embedding via a special `[ITEM]` token — essentially compressing the item's content into a single dense vector. A **User LLM** then processes the sequence of item embeddings (not text tokens), discarding word embeddings but retaining all other pretrained transformer weights. This hierarchical design compresses behavior sequences to 1/6–1/4 of their text-token length, making LLM-scale sequence modeling feasible in production. In online A/B tests, HLLM outperformed SASRec (Recall@5: 6.129 vs. 5.142) with performance continuing to improve up to 7B parameters.

For purely end-to-end sequence ranking without a two-stage search step, ByteDance published **LONGER** [[paper]](https://arxiv.org/abs/2505.04421) (RecSys 2025). Standard full attention is quadratic in sequence length — infeasible for TikTok's ultra-long user sessions. LONGER's solution is a **global token mechanism** combined with a token merge module that progressively compresses sequence length while preserving long-range dependencies. Critically, LONGER eliminates the two-stage retrieval step entirely: the same model handles both candidate selection and ranking end-to-end, removing the train-serve inconsistency that cascaded pipelines always suffer from. It now serves billions of users across 10+ ByteDance scenarios.

Scaling the ranking model itself is addressed by **RankMixer** [[paper]](https://arxiv.org/abs/2507.15551) (CIKM 2024) and its successor **TokenMixer-Large** [[paper]](https://arxiv.org/abs/2602.06563) (2026). Standard transformer attention achieves only ~4.5% GPU utilization for recommendation workloads due to memory-bandwidth constraints. RankMixer replaces attention with hardware-aware token mixing operations and a sparse MoE layer, pushing utilization to 45% and enabling a **70× parameter scale-up** (16M → 1B) with no latency regression. TokenMixer-Large extends this to **7–15 billion parameters** with documented production gains of **+1.66% orders in e-commerce** and **+2.0% ADSS in advertising** on Douyin.

On the item representation side, **LEMUR** [[paper]](https://arxiv.org/abs/2511.10962) (2025) is ByteDance's first fully end-to-end multimodal generative recommender — trained jointly from raw video, audio, and text rather than from pre-extracted features. Prior systems extracted multimodal features separately and fed them into the ranker, introducing alignment gaps and feature staleness. LEMUR uses a memory bank that accumulates historical multimodal representations across training steps, enabling the model to learn directly from the raw signal. For TikTok specifically, where item content *is* the product, this is the right inductive bias: the model that ranks videos should understand videos, not just their pre-digested feature vectors. Deployed in Douyin Search, LEMUR delivered **+0.81% QAUC improvement** — particularly strong on cold-start items where behavioral signals are absent.

## The Key Technical Challenges

Despite the impressive results, several open problems remain:

**Inference latency.** Autoregressive generation is inherently sequential — each token depends on the previous one. At TikTok or YouTube scale, generating recommendations in under 100ms requires careful engineering: speculative decoding, model distillation, hardware-aware beam search, and careful batching strategies. Systems like vLLM [[paper]](https://arxiv.org/abs/2309.06180) (SOSP 2023), which introduced PagedAttention for efficient KV cache management, are directly applicable here.

**Item churn.** New items are added to platforms continuously. A generative model must learn valid item codes for new items quickly, without full retraining. Current approaches include periodically updating the codebook and fine-tuning the decoder, but there's no clean solution yet.

**Exploration vs. exploitation.** Generative models trained on historical engagement tend to over-exploit popular items. The semantic structure of item codes helps somewhat, but building in principled exploration remains an active research area.

**Evaluation.** Standard recommendation metrics (NDCG, hit rate, AUC) don't fully capture the quality of a generated list. New evaluation frameworks that account for diversity, novelty, and long-term user satisfaction are needed.

## The Future

The trajectory is clear: recommendation is converging with language modeling. The techniques being applied — autoregressive generation, semantic tokenization, chain-of-thought reasoning, RLHF — are the same techniques that drove the LLM revolution, now adapted for user interaction sequences and item corpora.

A few directions I think will define the next three to five years:

**Unified user models.** Rather than separate models for search, feed, and notifications, platforms will converge on a single user model that understands context across all surfaces. Generative retrieval is the natural architecture for this — the same model can generate recommendations for different surfaces by conditioning on context.

**LLM backbones for recommendation.** As inference costs fall, using a pretrained LLM backbone (rather than a transformer trained from scratch on interaction data) will become practical. The LLM's world knowledge can help with cold-start items and complex preference inference that pure collaborative filtering misses.

**Real-time reasoning.** Systems like OneRec Think externalize reasoning as tokens. As this scales, recommendation will start to look like an agent — explicitly modeling the user's state, goals, and context before each decision rather than applying a fixed function.

**Causal and counterfactual modeling.** Generative models can, in principle, reason counterfactually: "what would this user have engaged with if they hadn't seen those 10 videos yesterday?" This is hard with traditional recommenders but natural to express in a generative framework. Expect to see this used to reduce feedback loops and popularity bias.

The two-stage pipeline served the industry well for two decades. But generative retrieval has demonstrated — at production scale, at the largest platforms in the world — that a better architecture exists. The question now is not whether to adopt it, but how fast.

---

## References

- Zhai et al. (Meta, 2024). [Actions Speak Louder than Words: Trillion-Parameter Sequential Transducers for Generative Recommendations](https://arxiv.org/abs/2402.17152). ICML 2024.
- Kuaishou Team (2025). [OneRec: Unifying Retrieve and Rank with Generative Recommender and Iterative Preference Alignment](https://arxiv.org/abs/2502.18965).
- Kuaishou Team (2025). [OneRec-V2 Technical Report](https://arxiv.org/abs/2508.20900).
- Kuaishou Team (2025). [OneRec-Think: In-Text Reasoning for Generative Recommendation](https://arxiv.org/abs/2510.11639).
- Geng et al. (2022). [Recommendation as Language Processing (P5)](https://arxiv.org/abs/2203.13366). RecSys 2022.
- Rajput et al. (Alibaba, 2023). [Recommender Systems with Generative Retrieval (TIGER)](https://arxiv.org/abs/2305.05065). NeurIPS 2023.
- Kwon et al. (2023). [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180). SOSP 2023.
- Danchev, H. (LinkedIn, 2026). [Engineering the Next Generation of LinkedIn's Feed](https://www.linkedin.com/blog/engineering/feed/engineering-the-next-generation-of-linkedins-feed).
- Rajput et al. (Google, 2024). [PLUM: Adapting Pre-trained Language Models for Generative Recommendations](https://arxiv.org/abs/2510.07784).
- Alibaba (2023). [Recommender Systems with Generative Retrieval (TIGER)](https://arxiv.org/abs/2305.05065). NeurIPS 2023.
- Alibaba (2026). [Large User Model (LUM)](https://arxiv.org/abs/2502.08309).
- ByteDance (2024). [HLLM: Hierarchical Large Language Models for Recommendation](https://arxiv.org/abs/2409.12740).
- ByteDance (2025). [LONGER: Long-Sequence Recommendation with Global Token](https://arxiv.org/abs/2505.04421). RecSys 2025.
- ByteDance (2024). [RankMixer: Hardware-Aware Ranking Model](https://arxiv.org/abs/2507.15551). CIKM 2024.
- ByteDance (2026). [TokenMixer-Large: Extreme-Scale Ranking](https://arxiv.org/abs/2602.06563).
- ByteDance (2025). [LEMUR: Large-Scale End-to-End Multimodal Recommender](https://arxiv.org/abs/2511.10962).
