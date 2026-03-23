---
title: "Generative Retrieval: How Big Tech Is Rethinking Recommendation"
description: "From semantic IDs to OneRec Think — a concept-first deep dive into how generative models are replacing two-stage retrieval pipelines, what's in production, and where the field is heading."
date: 2026-03-23
tags: ["recommendation systems", "generative AI", "HSTU", "OneRec"]
---

For two decades, industrial recommendation systems followed the same blueprint: a two-stage pipeline where a lightweight retrieval model narrows millions of candidates down to hundreds, then a heavy ranking model scores them. It worked. But it has a fundamental ceiling — and the industry is now tearing it down.

This post organizes the field by *idea* rather than by company: the semantic ID breakthrough that makes everything else possible, generative retrieval, generative ranking, full pipeline collapse, and reasoning on top. Companies appear where their work belongs conceptually.

## Why Two-Stage Pipelines Hit a Ceiling

The classic funnel — ANN retrieval → re-ranking — has real advantages: it's fast, modular, and independently scalable. But its structure bakes in several hard constraints:

**The retrieval bottleneck.** The retrieval model must be simple enough to run at massive scale, which severely limits its expressiveness. Long user interaction histories, nuanced context signals, and fine-grained item attributes are typically lost here. If the right item isn't retrieved, the ranker — no matter how sophisticated — can never surface it.

**Stage inconsistency.** Retrieval and ranking are trained with different objectives, on different feature sets, with no joint optimization signal. The retrieval model optimizes for recall; the ranker optimizes for precision. These goals can actively conflict, and no amount of independent tuning resolves the mismatch.

**Static representations.** Candidate items are indexed as fixed embeddings computed at index time. The model can't dynamically adapt to a user's evolving context during inference, and long-tail items that never accumulated rich interaction histories tend to get weak embeddings.

Generative recommendation addresses all three by framing recommendation as sequence generation: given a user's context, a single model generates item identifiers token by token. But this requires rethinking how items are represented in the first place.

## The Semantic ID Breakthrough

Before anything else works, items need to be representable as discrete tokens that a generative model can predict. Arbitrary numeric item IDs don't work — they carry no semantic information, so the model can't generalize across related items. You can't expect a model to reason that item `#4,821,033` is similar to item `#4,821,034` because they're adjacent integers.

**Semantic IDs** solve this by learning a codebook that maps items into hierarchical discrete codes based on their content and behavior. The most common approach is **RQ-VAE (Residual Quantized Variational AutoEncoder)**: the item's embedding is quantized through multiple rounds of vector quantization, with each round encoding the residual from the previous. The result is a short sequence of tokens — typically 3–8 — where the first token captures broad category, the second narrows it, and deeper tokens encode finer details. Semantically similar items share code prefixes, which means the generative model generalizes across related content naturally.

This hierarchy is the critical property. A model generating the semantic ID `[sports, basketball, NBA-highlights, ...]` can interpolate to recommend a similar video it has never seen in training, because the code structure encodes the similarity directly. With arbitrary IDs, there is no such structure to exploit.

LinkedIn's generative retrieval work [[blog]](https://www.linkedin.com/blog/engineering/feed/engineering-the-next-generation-of-linkedins-feed) identified a related problem on the feature encoding side: LLMs don't inherently understand raw numerical magnitudes. Feeding a raw engagement count like "4,382 likes" as a number is largely meaningless to an LLM encoder. Their solution — converting continuous engagement counts into **percentile buckets wrapped in special tokens** — resulted in a **30× increase in correlation** between popularity features and item embeddings. This is the same principle: translate continuous signals into discrete, learnable tokens that the model can reason about.

Semantic IDs are now the shared foundation across virtually every generative recommendation system: Google (PLUM), Kuaishou (OneRec), Alibaba (TIGER), and Meta (HSTU) all rely on some form of learned item tokenization. The specific encoding varies, but the insight is the same.

## Generative Retrieval: Replacing the First Stage

With items tokenized, the retrieval problem becomes: given a user's history, generate the semantic ID tokens of the next relevant item. This is now a standard sequence-to-sequence problem — the same structure as machine translation or code generation.

**Meta's HSTU** [[paper]](https://arxiv.org/abs/2402.17152) (ICML 2024) is the most influential production deployment of this idea. It powers Reels recommendation at billion-user scale. HSTU frames the user's full interaction history — watched videos, liked posts, search queries — as an input sequence, and generates item identifiers as output. Three architectural choices make it work at scale:

- **Hierarchical temporal encoding**: interactions across different time scales (last minute vs. last month) carry different signals. HSTU encodes time hierarchically, allowing the model to attend across timescales without conflating them.
- **Relative position biases**: unlike language, recommendation sequences have rich temporal and categorical structure. Learned relative biases replace absolute positional encodings.
- **Efficient attention for long sequences**: user histories in production span thousands of interactions. HSTU uses linear-complexity attention to keep this tractable.

**Google's PLUM** [[paper]](https://arxiv.org/abs/2510.07784) (2024) takes the same generative retrieval approach but adapts Gemini as the backbone. Items are tokenized via RQ-VAE, and Gemini is adapted to the recommendation domain through **Continued Pre-Training (CPT)** on user watch sequences — teaching it a "language of YouTube videos" on top of its existing world knowledge. In live A/B testing on YouTube Shorts, this delivered a **+4.96% CTR lift**. The gains are particularly strong for cold-start scenarios where collaborative filtering has no signal — new users, fresh videos — because the LLM backbone's world knowledge can reason about item content even without interaction history. The production deployment uses aggressive offline pre-computation to reduce serving cost by over 95%.

**Alibaba's TIGER** [[paper]](https://arxiv.org/abs/2305.05065) (NeurIPS 2023) applies generative retrieval to e-commerce, where items have rich structured attributes (category, price tier, brand, seller type) that content embeddings alone miss. TIGER's semantic ID codebook incorporates this structured metadata directly, so products sharing a category and price range land in the same region of the code space — enabling cross-sell and substitute recommendations for items the user has never encountered.

The trade-off versus two-tower retrieval is real: generative retrieval is slower at inference time due to autoregressive decoding, and constrained decoding (using a prefix tree of valid item codes to avoid generating invalid IDs) adds engineering complexity. But the recall quality gains, especially for long-tail and cold-start items, are consistently large enough to justify the cost.

## Generative Ranking: Replacing the Second Stage

Replacing retrieval alone still leaves the ranking model as a discriminative scorer trained separately from retrieval. A growing body of work targets the ranking stage directly with large sequence models — not generating item IDs, but modeling the user's full interaction history autoregressively to produce better ranking scores.

**LinkedIn's generative ranking model** [[blog]](https://www.linkedin.com/blog/engineering/feed/engineering-the-next-generation-of-linkedins-feed) (2026) is the clearest industrial example. Their ranker is a transformer with causal attention that processes over 1,000 historical user interactions as a unified chronological sequence — a GPT-style model applied to user history. Post-action pairs are interleaved during training, and the transformer output is combined via late fusion with count and affinity features, feeding into a Multi-gate Mixture-of-Experts (MMoE) prediction head. LinkedIn keeps this as the second stage of a two-stage pipeline (with an LLM-enhanced two-tower retrieval model upstream), but the ranking model itself is now a large sequence model rather than a shallow DNN.

The comparison table:

| Approach | Retrieval | Ranking | Pipeline |
|---|---|---|---|
| Traditional | Shallow two-tower | DLRM / shallow DNN | Two-stage |
| **LinkedIn** | **LLM two-tower** | **Large sequence transformer** | **Two-stage (upgraded)** |
| Meta HSTU | Generative | — | Retrieval replaced |
| Kuaishou OneRec | Generative | Generative | Fully collapsed |

**Alibaba's LUM (Large User Model)** [[paper]](https://arxiv.org/abs/2502.08309) (2026) takes a pragmatic deployment stance. Rather than replacing the existing DLRM ranking stack, LUM is a large generative model (up to 7B parameters) that runs *alongside* it: pre-trained on tokenized behavior sequences, then queried via condition tokens representing task context (e.g. "homepage feed, mobile, morning"), and its output representations injected as supplementary features into the existing ranker. The large model runs offline — outputs are cached — making deployment practical without rewriting the serving infrastructure. LUM demonstrated power-law scaling improvements up to 7B parameters and a **+2.9% CTR gain** in live A/B testing on Taobao.

**ByteDance's HLLM** [[paper]](https://arxiv.org/abs/2409.12740) (2024) uses a hierarchical approach to make LLM-based ranking tractable. An **Item LLM** processes each item's text and emits a compact embedding via a special `[ITEM]` token. A **User LLM** then processes the sequence of item embeddings (not text tokens), retaining pretrained transformer weights but bypassing word-level processing. This compresses behavior sequences to 1/6–1/4 of their text-token equivalent length, cutting the compute cost of applying a large model to long user histories. Performance improved over SASRec (Recall@5: 6.129 vs. 5.142) and continued scaling up to 7B parameters.

Scaling generative ranking models in production is its own engineering challenge. ByteDance's **RankMixer** [[paper]](https://arxiv.org/abs/2507.15551) (CIKM 2024) found that standard transformer attention achieves only ~4.5% GPU utilization for recommendation workloads due to memory-bandwidth constraints. Their hardware-aware architecture replaces attention with parameter-free token mixing operations and a sparse MoE layer, pushing GPU utilization to 45% and enabling a **70× parameter scale-up** (16M → 1B) with no latency regression. Its successor, **TokenMixer-Large** [[paper]](https://arxiv.org/abs/2602.06563) (2026), scales to **7–15 billion parameters** with documented online gains of **+1.66% orders in e-commerce** and **+2.0% ADSS in advertising** on Douyin.

## Collapsing the Pipeline: End-to-End Generation

The deepest architectural change is eliminating the two-stage boundary entirely — training a single model end-to-end for retrieval, ranking, and re-ranking jointly.

**Kuaishou's OneRec** [[paper]](https://arxiv.org/abs/2502.18965) (2025) is the most complete production deployment of this idea. A single autoregressive model generates an ordered list of recommendations directly from user context. The semantic ID structure is critical here: because items are encoded as hierarchical token sequences, generating a ranked list is simply generating a sequence of (item-code, item-code, ...) tuples — the same operation as text generation.

**OneRec V2** [[paper]](https://arxiv.org/abs/2508.20900) (2025) addressed the practical challenges of the first version: training instability, codebook quality, and inference latency. Key improvements:

- **Two-stage codebook learning**: first learning content-based codes, then fine-tuning on engagement signals — producing codes that are both semantically meaningful and behaviorally discriminative.
- **Beam search decoding**: generating multiple candidate lists and selecting the best, directly analogous to how LLMs improve output quality with search at inference time.
- **Constrained decoding**: a prefix tree (trie) of valid item codes prevents the model from generating invalid identifiers.

**ByteDance's LONGER** [[paper]](https://arxiv.org/abs/2505.04421) (RecSys 2025) takes a different path to the same destination. Rather than starting from a generative framing, it attacks the two-stage inconsistency problem directly: the model that retrieves candidates and the model that ranks them are trained separately, so the features and objectives never fully align. LONGER is a single end-to-end transformer over ultra-long user sequences, using a **global token mechanism** and a token merge module to handle the quadratic complexity of attention at sequence lengths that span entire user histories. No separate retrieval step — no inconsistency. It now serves billions of users across 10+ ByteDance scenarios.

The end-to-end approach also makes item representation richer. **ByteDance's LEMUR** [[paper]](https://arxiv.org/abs/2511.10962) (2025) is the first large-scale end-to-end multimodal recommender trained directly from raw video, audio, and text — not from pre-extracted features. Prior systems extracted multimodal features separately, introducing alignment gaps and staleness. For a short-video platform where the item *is* the content, this is the right inductive bias. Deployed in Douyin Search, LEMUR delivered **+0.81% QAUC improvement**, with particularly strong gains on cold-start items.

## Reasoning Before Recommending

The most recent frontier is adding explicit reasoning before generating recommendations — giving the model "scratch space" to think through what a user might want before committing to a recommendation.

**Kuaishou's OneRec Think** [[paper]](https://arxiv.org/abs/2510.11639) (2025) is the clearest example. The model first generates an explicit reasoning trace — a structured summary of the user's inferred interests, mood, and context — and then generates recommendations conditioned on that trace. By externalizing reasoning as tokens, the model can weigh factors that are hard to capture in a single forward pass:

- *"This user watches cooking content in the evenings but exercise content in the mornings — it's 7am"*
- *"They've seen this creator's last 5 videos; novelty likely matters here"*
- *"They just watched something emotionally heavy; upbeat content may underperform"*

This is the recommendation equivalent of chain-of-thought prompting in LLMs. The key insight — that complex multi-step reasoning becomes possible when you give the model room to generate intermediate steps — transfers directly from language to recommendation. OneRec Think showed significant gains on Kuaishou's long-form video platform, particularly for users with complex or evolving interests where shallow models historically struggled most.

The broader implication: at this level of sophistication, a recommender system starts to look less like a lookup table and more like an agent — explicitly modeling user state, inferring intent, and making decisions. The line between "recommendation" and "intelligent assistant" is blurring.

## Key Technical Challenges

Despite the impressive results, several hard problems remain unsolved:

**Inference latency.** Autoregressive generation is inherently sequential. At YouTube or TikTok scale, sub-100ms recommendation requires speculative decoding, model distillation, hardware-aware beam search, and careful batching. Systems like vLLM [[paper]](https://arxiv.org/abs/2309.06180) (SOSP 2023), which introduced PagedAttention for efficient KV cache management, are directly applicable — but the recommendation setting has different access patterns than language generation.

**Item churn.** New items are added to platforms continuously. A generative model must learn valid semantic codes for new items quickly without full retraining. The codebook is particularly brittle here: periodic updates require re-indexing the entire item corpus and fine-tuning the decoder. There is no clean solution yet.

**Exploration vs. exploitation.** Generative models trained on historical engagement strongly tend to over-exploit popular items and known user preferences. Semantic code structure helps generalize to related long-tail items, but principled exploration — surfacing genuinely novel content — remains an active research area.

**Evaluation.** Standard metrics (NDCG, hit rate, AUC) measure next-item prediction accuracy, not recommendation quality. A generated list that is accurate but redundant, or accurate but promotes echo-chamber dynamics, scores well on offline metrics but harms users long-term. New evaluation frameworks accounting for diversity, novelty, and long-horizon user satisfaction are needed.

## The Future

The convergence between recommendation and language modeling is not slowing down. A few directions that will define the next three to five years:

**Unified user models.** A single model that understands a user's context across search, feed, notifications, and ads — generating recommendations for different surfaces by conditioning on context rather than running separate models for each. Generative retrieval is the natural architecture: the same generation process, different context tokens.

**Reasoning as a first-class citizen.** OneRec Think shows that chain-of-thought reasoning improves recommendation quality. As inference costs continue to fall, explicit reasoning traces will become standard — and more sophisticated: multi-step user intent modeling, counterfactual reasoning ("what would they want if they hadn't seen those 10 videos yesterday?"), and preference elicitation through dialogue.

**Scaling laws for recommendation.** LUM and TokenMixer-Large both demonstrate power-law improvements with model scale — the same scaling behavior that defined the LLM revolution. The question is whether recommendation has a "GPT moment": a scale threshold above which emergent capabilities appear that no amount of feature engineering can match.

**From retrieval to generation to agents.** The trajectory — retrieval → ranking → reasoning → acting — points toward recommendation systems that don't just surface content but actively manage a user's information environment. The technical groundwork is being laid now.

The two-stage pipeline served the industry well for two decades. Generative retrieval has demonstrated — at production scale, at the world's largest platforms — that a better architecture exists. The question is no longer whether to move, but how fast.

---

## References

- Zhai et al. (Meta, 2024). [Actions Speak Louder than Words: Trillion-Parameter Sequential Transducers for Generative Recommendations (HSTU)](https://arxiv.org/abs/2402.17152). ICML 2024.
- Kuaishou Team (2025). [OneRec: Unifying Retrieve and Rank with Generative Recommender and Iterative Preference Alignment](https://arxiv.org/abs/2502.18965).
- Kuaishou Team (2025). [OneRec-V2 Technical Report](https://arxiv.org/abs/2508.20900).
- Kuaishou Team (2025). [OneRec-Think: In-Text Reasoning for Generative Recommendation](https://arxiv.org/abs/2510.11639).
- Rajput et al. (Google, 2024). [PLUM: Adapting Pre-trained Language Models for Generative Recommendations](https://arxiv.org/abs/2510.07784).
- Rajput et al. (Alibaba, 2023). [Recommender Systems with Generative Retrieval (TIGER)](https://arxiv.org/abs/2305.05065). NeurIPS 2023.
- Alibaba (2026). [Large User Model (LUM)](https://arxiv.org/abs/2502.08309).
- Danchev, H. (LinkedIn, 2026). [Engineering the Next Generation of LinkedIn's Feed](https://www.linkedin.com/blog/engineering/feed/engineering-the-next-generation-of-linkedins-feed).
- Geng et al. (2022). [Recommendation as Language Processing (P5)](https://arxiv.org/abs/2203.13366). RecSys 2022.
- ByteDance (2024). [HLLM: Hierarchical Large Language Models for Recommendation](https://arxiv.org/abs/2409.12740).
- ByteDance (2025). [LONGER: Long-Sequence Recommendation with Global Token](https://arxiv.org/abs/2505.04421). RecSys 2025.
- ByteDance (2024). [RankMixer: Hardware-Aware Ranking Model](https://arxiv.org/abs/2507.15551). CIKM 2024.
- ByteDance (2026). [TokenMixer-Large: Extreme-Scale Ranking](https://arxiv.org/abs/2602.06563).
- ByteDance (2025). [LEMUR: Large-Scale End-to-End Multimodal Recommender](https://arxiv.org/abs/2511.10962).
- Kwon et al. (2023). [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180). SOSP 2023.
