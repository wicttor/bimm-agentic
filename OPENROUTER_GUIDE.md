# OpenRouter Support for bimm-agentic

OpenRouter has been added as a third LLM provider option alongside Anthropic and OpenAI.

## What is OpenRouter?

[OpenRouter](https://openrouter.ai) is an API aggregator that provides unified access to 200+ language models from multiple providers (OpenAI, Anthropic, Meta, Mistral, etc.) through a single OpenAI-compatible API interface.

**Benefits:**

- Supports many models beyond OpenAI's offerings
- Often better pricing than direct provider APIs
- Single integration handles multiple model families
- Easy to experiment with different models

## Getting Started

### 1. Get an OpenRouter API Key

1. Visit [https://openrouter.ai](https://openrouter.ai)
2. Sign up and create a free account
3. Navigate to [https://openrouter.ai/keys](https://openrouter.ai/keys)
4. Generate an API key
5. Copy it to your `.env` file

### 2. Configure Your Environment

Add to `.env`:

```bash
OPENROUTER_API_KEY=your_key_here
```

Or set the provider explicitly:

```bash
OPENROUTER_API_KEY=your_key_here
LLM_PROVIDER=openrouter
```

### 3. Run the Agent

```bash
# Using the default model (z-ai/glm-5.3-flash)
npx ts-node agent/src/index.ts --spec specs/car-inventory.md --provider openrouter --out generated-app

# Using a specific model
npx ts-node agent/src/index.ts --spec specs/car-inventory.md --provider openrouter --model meta-llama/llama-2-70b-chat --out generated-app

# Using anthropic models via OpenRouter
npx ts-node agent/src/index.ts --spec specs/car-inventory.md --provider openrouter --model anthropic/claude-3-5-sonnet --out generated-app
```

## Available Models

The default is `z-ai/glm-5.3-flash`, but OpenRouter supports many models:

**See all models:** https://openrouter.ai/models

## Pricing & Costs

Check [https://openrouter.ai/models](https://openrouter.ai/models) for per-model pricing. Most models are cheaper via OpenRouter than direct provider APIs. OpenRouter shows real-time pricing based on token usage.

## Why Use OpenRouter Instead of OpenAI?

- **Fallback**: OpenAI had issues; OpenRouter lets you try other models on the same spec
- **Cost**: Sometimes significantly cheaper
- **Variety**: Test different model families without changing code
- **Reliability**: Aggregated uptime across multiple providers

## Troubleshooting

### "HTTP 401 — Invalid authentication credentials"

- Check that `OPENROUTER_API_KEY` is set correctly
- Verify the key hasn't expired in the OpenRouter dashboard
- Make sure you're not confusing it with `OPENAI_API_KEY`

### "HTTP 404 — Model not found"

- Model name might be wrong; check [https://openrouter.ai/models](https://openrouter.ai/models)
- OpenRouter model names use the format `provider/model-name`, e.g., `z-ai/glm-5.3-flash`

### High costs

- OpenRouter shows usage + costs in your account dashboard
- Some models (like Opus) are very capable but pricier
- Try GPT-4o or Mistral Large for a good balance

## Implementation Details

- File: `agent/src/llm/openrouter.ts` (new provider adapter)
- Uses OpenAI Chat Completions API format (wire-compatible)
- Adds required `http-referer` and `x-title` headers for OpenRouter
- Integrated into config auto-detection: set `OPENROUTER_API_KEY` and it's auto-selected if no other key is present

## Switching Between Providers

```bash
# OpenAI (default if OPENAI_API_KEY is set)
npx ts-node agent/src/index.ts --spec specs/car-inventory.md --provider openai --out generated-app

# Anthropic
npx ts-node agent/src/index.ts --spec specs/car-inventory.md --provider anthropic --out generated-app

# OpenRouter
npx ts-node agent/src/index.ts --spec specs/car-inventory.md --provider openrouter --out generated-app
```

Or set `LLM_PROVIDER` in `.env` and omit `--provider`:

```bash
export LLM_PROVIDER=openrouter
npx ts-node agent/src/index.ts --spec specs/car-inventory.md --out generated-app
```
