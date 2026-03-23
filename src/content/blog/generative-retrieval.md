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

Google has been applying language model techniques to recommendation through several projects. Their **P5** framework [[paper]](https://arxiv.org/abs/2203.13366) (RecSys 2022) framed five recommendation tasks — rating prediction, sequential recommendation, explanation generation, review summarization, and direct recommendation — as text-to-text generation using T5.

For YouTube specifically, Google has been moving toward unified models that jointly learn retrieval and ranking. Their **Monolithic Recommender** work explores replacing the multi-stage pipeline with a single large model, accepting higher inference cost in exchange for better joint optimization.

Google's scale (billions of YouTube users, hundreds of billions of videos) makes full generative retrieval expensive. Their approach tends to favor **generative re-ranking** — using a generative model for the final stage where the candidate set is already small — over pure generative retrieval from the full item corpus.

### Alibaba / Taobao

Alibaba has been at the forefront of applying large models to e-commerce recommendation. Their **TIGER** system [[paper]](https://arxiv.org/abs/2305.05065) (NeurIPS 2023) adapts ideas from document retrieval to product search and recommendation.

A distinctive challenge in e-commerce: items have rich structured attributes (price, category, brand, seller) that should inform both the semantic codes and the generation process. Alibaba's work on **semantic ID generation** for products specifically addresses how to incorporate structured metadata into the codebook learning process.

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

ByteDance's recommendation infrastructure is arguably the most studied from the outside, given TikTok's cultural impact. While they haven't published as much technical detail as Meta or Kuaishou, their patents and engineering blog posts suggest heavy use of:

- **Long-sequence modeling**: TikTok's user sessions can be extremely long. ByteDance has published work on efficient attention mechanisms specifically for recommendation-length sequences.
- **Multi-modal item representations**: Items are encoded from video, audio, text, and engagement signals jointly, creating richer semantic codes.
- **Reinforcement learning from human feedback (RLHF) for recommendation**: Framing recommendation quality as a reward signal and using RL to optimize the generative model beyond next-item prediction.

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
