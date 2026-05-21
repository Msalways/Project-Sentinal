# LLM Integration Guide

How to configure, switch, and extend LLM providers in Project Sentinel.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  ProviderRegistry                               │
│                                                 │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  │
│  │ azure-openai │  │  openai  │  │openrouter│  │
│  │              │  │          │  │          │  │
│  │ Azure AI     │  │ OpenAI   │  │ 100+     │  │
│  │ Foundry      │  │ API      │  │ models   │  │
│  └──────────────┘  └──────────┘  └──────────┘  │
│                                                 │
│  ┌──────────────┐  ┌──────────┐                 │
│  │  anthropic   │  │  (add    │                 │
│  │              │  │  yours)  │                 │
│  │ Claude       │  │          │                 │
│  │ models       │  │          │                 │
│  └──────────────┘  └──────────┘                 │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  Deep Agents (LangChain)                        │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │  Main Agent (Supervisor)                 │   │
│  │  ↓                                       │   │
│  │  task() → spawn subagents dynamically    │   │
│  │  ↓                                       │   │
│  │  recon-agent, web-agent, code-agent,     │   │
│  │  network-agent, exploit-agent            │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Key insight:** Sentinel uses LangChain's `ChatOpenAI`, `ChatAnthropic`, etc. as the model layer. The ProviderRegistry creates the right model instance based on your config. Deep Agents handles the multi-agent orchestration on top.

---

## Supported Providers

| Provider | Package | Models | Azure Compatible |
|----------|---------|--------|-----------------|
| Azure OpenAI | `@langchain/openai` | gpt-4o, gpt-4o-mini, o1 | ✅ Native |
| OpenAI | `@langchain/openai` | gpt-4o, gpt-4o-mini, o1 | ✅ Via Azure |
| OpenRouter | `@langchain/openai` | 100+ models (any provider) | ❌ |
| Anthropic | `@langchain/anthropic` | claude-sonnet-4, opus, haiku | ❌ |

---

## Quick Configuration

### Method 1: CLI Init

```bash
npx tsx src/cli/index.ts init --provider <name> [options]
```

### Method 2: Environment Variables

```bash
# Azure OpenAI
export AZURE_OPENAI_API_KEY="your-key"
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
export SENTINEL_PROVIDER="azure-openai"

# OpenAI
export OPENAI_API_KEY="sk-..."
export SENTINEL_PROVIDER="openai"

# OpenRouter
export OPENROUTER_API_KEY="sk-or-..."
export SENTINEL_PROVIDER="openrouter"

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
export SENTINEL_PROVIDER="anthropic"
```

### Method 3: SDK

```typescript
import { createSentinel } from 'project-sentinal';

const sentinel = createSentinel({
  provider: 'azure-openai',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
  modelId: 'gpt-4o',
});
```

---

## Provider Details

### Azure OpenAI

**Best for:** Enterprise deployments, hackathon submissions, compliance requirements.

**Setup:**

1. Go to [Azure AI Foundry](https://ai.azure.com/)
2. Create a new project
3. Deploy `gpt-4o` model
4. Copy the endpoint URL and API key

**Configuration:**

```bash
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"

npx tsx src/cli/index.ts scan \
  --provider azure-openai \
  --model gpt-4o \
  --target https://your-app.com
```

**Available Models on Azure:**
- `gpt-4o` — Best overall (recommended)
- `gpt-4o-mini` — Faster, cheaper, good for testing
- `o1` — Reasoning-heavy tasks (slower, expensive)

**Cost:** ~$5-15 per full security scan (depends on target size).

---

### OpenAI

**Best for:** Quick setup, familiar API, direct access to latest models.

**Setup:**

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Create API key
3. Add credits if needed

**Configuration:**

```bash
export OPENAI_API_KEY="sk-..."

npx tsx src/cli/index.ts scan \
  --provider openai \
  --model gpt-4o \
  --target https://your-app.com
```

**Available Models:**
- `gpt-4o` — Best overall
- `gpt-4o-mini` — Faster, cheaper
- `o1` — Deep reasoning

---

### OpenRouter

**Best for:** Model flexibility, cost optimization, trying different providers.

**Setup:**

1. Go to [openrouter.ai](https://openrouter.ai/)
2. Create API key
3. Choose any model from 100+ options

**Configuration:**

```bash
export OPENROUTER_API_KEY="sk-or-..."

# Use OpenAI's model via OpenRouter
npx tsx src/cli/index.ts scan \
  --provider openrouter \
  --model openai/gpt-4o \
  --target https://your-app.com

# Use Anthropic's Claude via OpenRouter
npx tsx src/cli/index.ts scan \
  --provider openrouter \
  --model anthropic/claude-sonnet-4-20250514 \
  --target https://your-app.com

# Use a cheaper model for testing
npx tsx src/cli/index.ts scan \
  --provider openrouter \
  --model mistralai/mistral-large \
  --target https://your-app.com
```

**Popular Models:**
- `openai/gpt-4o` — Best quality
- `anthropic/claude-sonnet-4-20250514` — Great reasoning
- `google/gemini-2.5-pro` — Good alternative
- `mistralai/mistral-large` — Cost-effective

---

### Anthropic (Claude)

**Best for:** Complex reasoning, code analysis, detailed security reports.

**Setup:**

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create API key
3. Add credits

**Configuration:**

```bash
export ANTHROPIC_API_KEY="sk-ant-..."

npx tsx src/cli/index.ts scan \
  --provider anthropic \
  --model claude-sonnet-4-20250514 \
  --target https://your-app.com
```

**Available Models:**
- `claude-sonnet-4-20250514` — Best balance (recommended)
- `claude-opus-4-20250514` — Most capable (expensive)
- `claude-haiku-3.5-20241022` — Fast, cheap

---

## Switching Providers

Change one line — everything else stays the same.

```bash
# Today: Azure OpenAI
export SENTINEL_PROVIDER="azure-openai"
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_ENDPOINT="..."

# Tomorrow: OpenRouter with Claude
export SENTINEL_PROVIDER="openrouter"
export OPENROUTER_API_KEY="..."
# That's it — modelId auto-detects from provider
```

---

## Model Selection Guide

| Task | Recommended Model | Why |
|------|-------------------|-----|
| Full security scan | `gpt-4o` | Best balance of quality and speed |
| Quick testing | `gpt-4o-mini` | 10x cheaper, 80% quality |
| Code analysis | `claude-sonnet-4` | Better code understanding |
| Deep reasoning | `o1` or `claude-opus-4` | Complex vulnerability chaining |
| Budget scanning | `mistral-large` via OpenRouter | Good quality, low cost |

---

## Adding a Custom Provider

Sentinel's ProviderRegistry makes it easy to add new LLM providers.

### Step 1: Add the Provider

Edit `src/providers/provider-registry.ts`:

```typescript
providerRegistry.register({
  name: 'my-provider',          // Internal name
  label: 'My Provider',          // Display name
  envVars: ['MY_API_KEY'],       // Required env vars
  create: (config) => {
    const { ChatMyProvider } = require('@langchain/my-provider');
    return new ChatMyProvider({
      apiKey: config.apiKey,
      model: config.modelId,
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4096,
    });
  },
});
```

### Step 2: Use It

```bash
export MY_API_KEY="your-key"
export SENTINEL_PROVIDER="my-provider"

npx tsx src/cli/index.ts scan --provider my-provider --model my-model --target https://app.com
```

### Step 3: Verify

```bash
npx tsx src/cli/index.ts providers
```

**Output:**
```
🧠 Available LLM Providers:

  azure-openai (Azure OpenAI)
    Required env: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT

  openai (OpenAI)
    Required env: OPENAI_API_KEY

  openrouter (OpenRouter)
    Required env: OPENROUTER_API_KEY

  anthropic (Anthropic)
    Required env: ANTHROPIC_API_KEY

  my-provider (My Provider)
    Required env: MY_API_KEY
```

---

## How Agents Use the LLM

```
User: "Scan https://shop.example.com"
         ↓
ProviderRegistry creates the model:
  → Azure OpenAI (gpt-4o)
         ↓
Deep Agents creates the supervisor:
  → Main agent with GPT-4o
         ↓
Main agent decides which subagents to spawn:
  → task(name="recon-agent", task="Map attack surface...")
  → task(name="web-agent", task="Test for XSS, SQLi...")
  → task(name="code-agent", task="Scan source code...")
         ↓
Each subagent uses the SAME model (or a custom one):
  → recon-agent calls GPT-4o with recon system prompt
  → web-agent calls GPT-4o with web system prompt
  → code-agent calls GPT-4o with code system prompt
         ↓
All results flow back to main agent for correlation
```

### Per-Agent Model Override

You can give specific agents a different model:

```typescript
// In src/agents/agent-registry.ts

import { ChatOpenAI } from '@langchain/openai';

agentRegistry.register({
  name: 'code-agent',
  description: 'Static code analysis',
  systemPrompt: 'You are a SAST specialist...',
  requiredTools: ['pattern_match'],
  model: new ChatOpenAI({
    model: 'gpt-4o-mini',  // Cheaper model for code scanning
    temperature: 0.1,       // Lower temperature for deterministic analysis
  }),
  tags: ['code', 'sast'],
});
```

---

## Cost Estimation

| Scenario | Model | Estimated Cost |
|----------|-------|---------------|
| Demo mode | mock | $0 |
| Small app (10 endpoints) | gpt-4o | ~$2-5 |
| Medium app (50 endpoints) | gpt-4o | ~$5-15 |
| Large app (200+ endpoints) | gpt-4o | ~$15-40 |
| Code scan (100 files) | gpt-4o | ~$3-8 |
| Full assessment (app + code) | gpt-4o | ~$10-30 |

**Cost optimization tips:**
- Use `gpt-4o-mini` for initial scans (~10x cheaper)
- Use `openrouter` to pick the cheapest model that works
- Run demo mode first to validate setup (free)

---

## Troubleshooting

### "Invalid API key"

- Verify the key is correct and has not expired
- Check that you have credits/balance in your account
- For Azure: ensure the key matches the resource (not the subscription)

### "Model not found"

- For Azure OpenAI: the deployment name must match your `--model` value
- For OpenRouter: use the full model ID (e.g., `openai/gpt-4o`, not just `gpt-4o`)
- For Anthropic: use the exact model ID from their docs

### "Rate limit exceeded"

- Azure OpenAI has TPM (tokens per minute) limits — request a quota increase
- OpenAI has RPM (requests per minute) limits — wait and retry
- OpenRouter has per-model rate limits — try a different model

### "Connection refused" (Azure)

- Verify your endpoint URL is correct (should end with `.openai.azure.com`)
- Check that your Azure resource is in the same region as your deployment
- Ensure network security groups allow outbound HTTPS

---

## Next Steps

- **Getting Started** — see `docs/GETTING_STARTED.md`
- **Architecture** — see `README.md` for system overview
- **Hackathon submission** — see `hackathon/DECK_CONTENT.md`
