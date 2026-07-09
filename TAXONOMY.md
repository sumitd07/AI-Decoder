# Decoder taxonomy — the ~1,200-term map

The backbone the content pipeline batches against. Twelve domains, each with subtopics, a target count, and representative candidate terms. Targets are a first horizon, not a ceiling — expand any bucket later. The existing 15 are mapped in under **[have]**.

Two fields on every term drive delivery: `domain` (which bucket) and `priority` (higher ships in the static core bundle; the rest are reachable via live search). Rule of thumb: **Core**/**Rising** status → high priority (static); **Fading**/**Historical** and niche terms → low priority (long tail).

Totals below sum to **~1,205**.

---

## 1. Foundations — 120
The vocabulary everything else assumes.

- **Text as numbers:** tokens **[have]**, tokenization, BPE, subword, vocabulary, embeddings **[have]**, vector, dimensionality
- **Model basics:** parameters, weights, biases, neural network, activation, layer, hidden state, logits, softmax, probability distribution
- **The window:** context window **[have]**, context length, positional encoding, attention span
- **Generation knobs:** temperature **[have]**, top-p, top-k, sampling, greedy decoding, beam search, repetition penalty, max tokens, stop sequence, seed
- **What a model is:** LLM, foundation model, frontier model, base model, model weights, checkpoint, model card

## 2. Training & fine-tuning — 150
How models are made and adapted.

- **Pretraining:** pretraining, self-supervised learning, next-token prediction, corpus, data mixture, epoch, batch size, learning rate, gradient descent, backpropagation, loss function, overfitting, scaling laws, compute-optimal, Chinchilla
- **Alignment:** RLHF, RLAIF, reward model, preference data, DPO, constitutional AI, instruction tuning, SFT (supervised fine-tuning), alignment
- **Adaptation:** fine-tuning **[have]**, LoRA, QLoRA, PEFT, adapter, distillation, quantization-aware training, continued pretraining, catastrophic forgetting
- **Data:** synthetic data, data augmentation, labeling, annotation, data contamination, deduplication, curriculum learning

## 3. Architectures — 100
The shapes under the hood.

- **Transformers:** transformer, attention **[partial via chain of thought? no]**, self-attention, cross-attention, multi-head attention, feed-forward, residual connection, layer norm, encoder, decoder, encoder-decoder
- **Efficiency variants:** mixture of experts (MoE), sparse attention, flash attention, sliding window attention, grouped-query attention, KV cache
- **Other families:** diffusion model, GAN, VAE, RNN, LSTM, CNN, state space model, Mamba, RWKV
- **Reasoning shapes:** reasoning model, chain of thought **[have]**, tree of thought, test-time compute

## 4. Agents & tools — 120
Systems that act, not just answer.

- **Core:** agents **[have]**, agentic, tool use, function calling, ReAct, planning, orchestration, multi-agent, agent loop, autonomy
- **Protocols & plumbing:** MCP **[have]**, tool schema, API calling, code interpreter, computer use, browser agent
- **Patterns:** router, supervisor, worker, handoff, scratchpad, memory (agent), reflection, self-correction
- **Coding agents:** agentic coding, vibe coding **[have]**, copilot, code generation, SWE agent

## 5. Retrieval & memory — 90
Getting the right context in front of the model.

- **RAG stack:** RAG **[have]**, retrieval, chunking, chunk overlap, vector database, semantic search, similarity search, cosine similarity, reranking, hybrid search, BM25, top-k retrieval
- **Indexing:** embedding model, vector index, HNSW, ANN (approximate nearest neighbor), metadata filtering
- **Memory:** long-term memory, short-term memory, conversation history, summarization memory, knowledge base, GraphRAG

## 6. Safety, security & alignment — 130
Where things go wrong and how you contain them.

- **Failure modes:** hallucination **[have]**, confabulation, sycophancy, bias, toxicity, refusal, over-refusal, jailbreak, reward hacking, specification gaming
- **Attacks:** prompt injection **[have]**, indirect prompt injection, data poisoning, model extraction, adversarial example, jailbreak prompt
- **Defenses:** guardrails, content filter, red teaming, sandboxing, human in the loop **[have]**, output validation, moderation, alignment tax
- **Governance:** AI safety, existential risk, interpretability, mechanistic interpretability, model welfare, responsible AI, watermarking

## 7. Evaluation & quality — 80
Proving something actually works.

- **Methods:** evals **[have]**, benchmark, LLM-as-judge, rubric grading, exact match, pass@k, A/B test, human eval, gold set, ground truth
- **Named benchmarks:** MMLU, HumanEval, GSM8K, HellaSwag, ARC, GPQA, SWE-bench, MT-Bench
- **Metrics:** accuracy, precision, recall, F1, perplexity, BLEU, ROUGE, win rate, latency, throughput
- **Concepts:** regression testing, eval set, contamination, overfitting to benchmarks

## 8. Infrastructure & serving — 110
Running models in production.

- **Inference:** inference, serving, latency, throughput, time to first token, tokens per second, batching, continuous batching, speculative decoding
- **Compression:** quantization, INT8, INT4, pruning, distillation, model compression
- **Hardware:** GPU, TPU, VRAM, CUDA, accelerator, cluster, node
- **Ops:** API, endpoint, rate limit, cost per token, caching, prompt caching, cold start, autoscaling, MLOps, LLMOps, observability

## 9. Multimodal — 90
Beyond text.

- **Vision:** vision model, VLM, image encoder, OCR, object detection, segmentation, image captioning, CLIP
- **Generation:** image generation, text-to-image, diffusion, Stable Diffusion, inpainting, ControlNet, upscaling
- **Audio & video:** speech-to-text, ASR, text-to-speech, TTS, voice cloning, text-to-video, video generation
- **Fusion:** multimodal, any-to-any, cross-modal, modality

## 10. Prompting & interaction — 65
How people talk to models.

- **Techniques:** prompt engineering **[have]**, system prompt, few-shot, zero-shot, in-context learning, prompt template, role prompting, chain of thought **[cross-listed]**, self-consistency
- **Patterns:** structured output, JSON mode, output parsing, grounding, citation, guardrail prompt, meta-prompting, prompt chaining
- **Interaction:** chatbot, conversational AI, turn, multi-turn, assistant, persona

## 11. Ecosystem, products & orgs — 150
The names people actually say in meetings.

- **Labs:** OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral, Cohere, xAI, Hugging Face
- **Model families:** GPT, Claude, Gemini, Llama, Mistral, Grok, Phi, Qwen, DeepSeek
- **Tooling:** LangChain, LlamaIndex, vector DB names (Pinecone, Weaviate, Chroma, pgvector), Ollama, vLLM, transformers library
- **Concepts as products:** copilot, assistant, GPTs, custom instructions, API platform, playground
- **Business/context:** open weights, open source AI, closed model, model licensing, inference provider, AI wrapper, moat

## 12. History & deprecated — 60
Terms that faded, renamed, or matured — filed so lookups still resolve.

- vibe coding **[have]**, prompt engineering **[have, fading]**, expert systems, symbolic AI, GOFAI, chatbot (classic), Turing test, Eliza, word2vec, n-gram, bag of words, TF-IDF, seq2seq, attention-is-all-you-need era, AGI (as hype term), prompt marketplace, jailbreak-as-a-hobby

---

## Cross-cutting notes

- **Cross-listing:** a few terms live in two buckets (e.g. chain of thought in Architectures + Prompting). Store one canonical `domain`; use `tags` for the secondary bucket so it surfaces in both.
- **Priority split:** roughly the top ~250–300 terms (all Core/Rising + the most-searched Fading) ship in the static core bundle; the remaining ~900 are long-tail live-search only. Tune the threshold after seeing real usage.
- **Batch order:** suggest generating in this domain order — Foundations → Retrieval → Agents → Safety → Evaluation → the rest — so the highest-traffic, most-cross-linked terms exist early and later batches can link to them cleanly.
