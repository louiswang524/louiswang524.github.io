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

Google's recommendation history is in many ways the origin story of modern industrial RecSys. Their 2016 YouTube DNN paper [[paper]](https://dl.acm.org/doi/10.1145/2959100.2959190) established the two-stage retrieve-then-rank blueprint that the entire industry has followed since: a candidate generation network that reduces millions of videos to ~200 candidates, followed by a ranking network that scores them with richer features. One non-obvious design choice that proved highly influential: optimizing for **watch time** rather than click-through rate, which directly reduced clickbait and aligned the model with user satisfaction.

The two-tower architecture was formalized in their 2019 work [[paper]](https://dl.acm.org/doi/abs/10.1145/3298689.3346996), which introduced a critical fix for a subtle but important problem: **sampling bias in in-batch negatives**. When you use other items in a training batch as negatives, popular items appear disproportionately often — the model learns to downrank them even when they are genuinely relevant. Their solution was a streaming frequency estimator that corrects for this bias on the fly, without requiring a fixed item vocabulary. This correction alone substantially improved recommendation quality for YouTube's corpus of tens of millions of videos.

Multi-task learning was the next major evolution. Their MMoE system [[paper]](https://dl.acm.org/doi/10.1145/3298689.3346997) (RecSys 2019) tackled the tension between optimizing for engagement (clicks, watch time) and satisfaction (likes, shares, ratings) simultaneously. The key insight: a single shared network forces both tasks to compete for the same parameters, degrading both. **Multi-gate Mixture-of-Experts (MMoE)** gives each task its own gating network that learns to selectively weight shared expert modules, allowing positive transfer where tasks align and independence where they diverge. This architecture has since been adopted across almost every major platform (including LinkedIn's ranking model above).

The most recent and ambitious step is adapting Gemini for YouTube retrieval. The **PLUM framework** [[paper]](https://arxiv.org/abs/2510.07784) (2024) treats recommendation as generative retrieval: rather than doing a dot-product lookup against item embeddings, a Gemini-based model autoregressively generates **semantic ID tokens** that identify the next video. Items are tokenized using RQ-VAE (Residual Quantized Variational AutoEncoder), which creates hierarchical codes where the first token captures broad category ("sports"), the second narrows it ("basketball"), and subsequent tokens encode finer details. This structure lets the model generalize across related content in a way that arbitrary item IDs cannot. In live A/B testing on YouTube Shorts, this approach delivered a **+4.96% lift in panel CTR** — a very large gain at YouTube's scale. The system is particularly strong for cold-start users and fresh content where collaborative filtering signals are sparse.

Production deployment required solving a hard latency problem: autoregressive generation is sequential and expensive. Google's solution was aggressive offline pre-computation — pre-generating candidate semantic ID sequences for known user contexts — which reduced serving costs by over 95% while preserving most of the quality gain.

### Alibaba / Taobao

Alibaba's journey illustrates the most complete evolution from classical deep learning to generative recommendation of any single company.

The first major innovation was **DIN (Deep Interest Network)** [[paper]](https://arxiv.org/abs/1706.06978) (KDD 2018), which challenged a core assumption in recommendation models: that a user's interest can be compressed into a single fixed-length vector. DIN introduced a local activation unit — essentially an attention mechanism — that computes a query-conditioned representation of the user's history relative to each candidate item. Instead of "what does this user generally like?", the model asks "which of this user's past behaviors are relevant to *this specific product*?". Deployed on Alibaba's display advertising system across 2+ billion training samples, it became one of the most cited applied RecSys papers.

**DIEN (Deep Interest Evolution Network)** [[paper]](https://arxiv.org/abs/1809.03672) (AAAI 2019) extended DIN by modeling how user interests *change over time*. A user who was researching gaming keyboards last week may be interested in headphones today — their interest didn't disappear, it evolved. DIEN uses a two-layer GRU architecture: the first layer extracts latent interest states from behavior sequences with an auxiliary supervision signal, and the second models how those interests evolve toward the current candidate. The result was a **20.7% CTR improvement** over DIN in Taobao's advertising system.

As user histories grew into the tens of thousands of items, attention-based models became computationally infeasible. Alibaba's answer was **SIM (Search-based Interest Model)** [[paper]](https://arxiv.org/abs/2006.05639) (RecSys 2020), which treats long-sequence interest modeling as a search problem. A General Search Unit first filters the full behavior history (up to **54,000 items**, a 54× increase over prior SOTA) using the candidate item as a query, producing a compact sub-sequence. An Exact Search Unit then models the precise relationship between the candidate and that sub-sequence with full attention. This cascaded design was deployed at Alibaba since 2019, delivering a **7.1% CTR lift and 4.4% RPM lift** in production.

On the generative side, **TIGER** [[paper]](https://arxiv.org/abs/2305.05065) (NeurIPS 2023) brought document-retrieval ideas into e-commerce. Items are assigned hierarchical semantic IDs through RQ-VAE quantization, and a transformer model generates the next item's semantic tokens autoregressively. A key e-commerce-specific challenge: product attributes (category, price tier, brand, seller type) are highly structured, and TIGER's codebook learning explicitly incorporates this metadata so that semantically and functionally similar products share code prefixes.

Most recently, Alibaba's **LUM (Large User Model)** [[paper]](https://arxiv.org/abs/2502.08309) (2026) introduced a three-step paradigm for unlocking scaling laws in industrial recommendation: pre-train a large model on tokenized behavior sequences with generative learning, use condition tokens as prompts to query task-specific knowledge, then inject the model's outputs as supplementary features into the existing DLRM stack. This decoupled design — the large model runs offline, its outputs cached — demonstrated power-law improvements up to 7B parameters and delivered a **2.9% CTR improvement** in live A/B testing on Taobao.

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

ByteDance's approach stands apart for its emphasis on infrastructure and scaling — publishing some of the most practically detailed engineering papers in the field.

The foundation is **Monolith** [[paper]](https://arxiv.org/abs/2209.07663) (RecSys 2022), a real-time online training system that addressed a critical limitation of standard ML frameworks: PyTorch and TensorFlow were designed for offline batch training, not for a platform where viral trends emerge and die within hours. Monolith introduced a **collisionless embedding table** with expirable embeddings and frequency filtering, allowing the ranking model to adapt to user behavior within minutes of it occurring. The architecture deliberately trades away perfect consistency for low-latency model updates — a design choice that directly supports TikTok's defining characteristic: its uncanny ability to learn individual user tastes extremely quickly.

For long-sequence modeling, ByteDance published **LONGER** [[paper]](https://arxiv.org/abs/2505.04421) (RecSys 2025), which solves the quadratic attention complexity problem without resorting to the two-stage search approach used by Alibaba's SIM. LONGER introduces a **global token mechanism** that stabilizes attention across extended contexts, paired with a token merge module that reduces sequence length via lightweight InnerTransformers and hybrid attention patterns. Critically, LONGER is end-to-end — there is no separate retrieval step, eliminating the train-serve inconsistency that plagues two-stage long-sequence approaches. It is now deployed across 10+ recommendation scenarios at ByteDance serving billions of users.

On the ranking side, **RankMixer** [[paper]](https://arxiv.org/abs/2507.15551) (CIKM 2024) tackled a hard hardware efficiency problem: how do you scale a ranking model to 1B+ parameters without blowing up inference latency? Standard transformers are memory-bandwidth bound, achieving only ~4.5% GPU utilization for recommendation workloads. RankMixer's solution is a hardware-aware architecture combining parameter-free multi-head token mixing (replacing expensive attention), per-token feed-forward networks (preventing high-frequency features from dominating shared parameters), and a sparse Mixture-of-Experts layer with ReLU-based routing. This pushed GPU utilization from 4.5% to 45%, enabling a **70× parameter increase** (16M → 1B) while maintaining serving latency. The result: **+0.3% improvement in user active days and +1.08% in total in-app duration** on Douyin. Its successor, **TokenMixer-Large** [[paper]](https://arxiv.org/abs/2602.06563) (2026), scales this to **7–15 billion parameters** with documented online gains of +1.66% orders in e-commerce and +2.0% ADSS in advertising.

For multimodal content, **LEMUR** [[paper]](https://arxiv.org/abs/2511.10962) (2025) is ByteDance's first large-scale end-to-end multimodal recommender, trained directly from raw video, audio, and text data. Prior systems used a decoupled pipeline where multimodal feature extraction and ranking were trained separately, introducing alignment gaps and staleness. LEMUR uses a memory bank mechanism that incrementally accumulates historical multimodal representations across training steps, enabling joint optimization from raw modalities to final ranking scores. Deployed in Douyin Search, it achieved a **0.843% reduction in query change rate decay and +0.81% QAUC improvement** — particularly meaningful for cold-start items that lack behavioral signals.

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
- Covington et al. (Google, 2016). [Deep Neural Networks for YouTube Recommendations](https://dl.acm.org/doi/10.1145/2959100.2959190). RecSys 2016.
- Yi et al. (Google, 2019). [Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations](https://dl.acm.org/doi/abs/10.1145/3298689.3346996). RecSys 2019.
- Zhao et al. (Google, 2019). [Recommending What Video to Watch Next: A Multitask Ranking System](https://dl.acm.org/doi/10.1145/3298689.3346997). RecSys 2019.
- Rajput et al. (Google, 2024). [PLUM: Adapting Pre-trained Language Models for Generative Recommendations](https://arxiv.org/abs/2510.07784).
- Zhou et al. (Alibaba, 2018). [Deep Interest Network for Click-Through Rate Prediction (DIN)](https://arxiv.org/abs/1706.06978). KDD 2018.
- Zhou et al. (Alibaba, 2019). [Deep Interest Evolution Network for Click-Through Rate Prediction (DIEN)](https://arxiv.org/abs/1809.03672). AAAI 2019.
- Pi et al. (Alibaba, 2020). [Search-based User Interest Modeling with Lifelong Sequential Behavior (SIM)](https://arxiv.org/abs/2006.05639). RecSys 2020.
- Alibaba (2026). [Large User Model (LUM)](https://arxiv.org/abs/2502.08309).
- Liu et al. (ByteDance, 2022). [Monolith: Real Time Recommendation System With Collisionless Embedding Table](https://arxiv.org/abs/2209.07663). RecSys 2022.
- ByteDance (2025). [LONGER: Long-Sequence Recommendation with Global Token](https://arxiv.org/abs/2505.04421). RecSys 2025.
- ByteDance (2024). [RankMixer: Hardware-Aware Ranking Model](https://arxiv.org/abs/2507.15551). CIKM 2024.
- ByteDance (2026). [TokenMixer-Large: Extreme-Scale Ranking](https://arxiv.org/abs/2602.06563).
- ByteDance (2025). [LEMUR: Large-Scale End-to-End Multimodal Recommender](https://arxiv.org/abs/2511.10962).
