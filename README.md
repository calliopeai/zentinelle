# Zentinelle

**Runtime governance, risk, and compliance for AI agents.**

Zentinelle gives you policy enforcement, audit logging, content scanning, and compliance dashboards for any AI agent — regardless of framework or LLM provider.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What It Does

- **Policy enforcement** — rate limits, cost controls, model restrictions, PII blocking. Evaluated before your agent executes.
- **Observability** — token usage, cost metering, interaction logs, real-time health monitoring.
- **Content scanning** — PII detection, toxicity scoring, jailbreak/prompt injection detection.
- **Compliance** — SOC2, GDPR, HIPAA, EU AI Act, NIST AI RMF dashboards and exportable reports.
- **Risk management** — risk register, incident tracking, anomaly alerting.

## Quick Start (Self-Hosted)

```bash
git clone https://github.com/calliopeai/zentinelle
cd zentinelle
cp .env.example .env                    # fill in SECRET_KEY, POSTGRES_PASSWORD
docker compose up -d

# First run: create tables and an admin user
docker compose exec backend python manage.py migrate --database=zentinelle
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

The GRC portal runs at `http://localhost:8080`.
The GraphQL API runs at `http://localhost:8080/gql/zentinelle/`.
The agent REST API runs at `http://localhost:8080/api/zentinelle/`.

## SDK

Agents integrate via a lightweight SDK (no agent code changes required beyond initialization):

```python
# Python
from zentinelle import ZentinelleClient

client = ZentinelleClient(api_key="zk_...", endpoint="https://your-zentinelle.example.com")
client.register(capabilities=["llm:invoke", "tool:search"])

# Before each LLM call
decision = client.evaluate({"model": "gpt-4o", "tokens_requested": 2000})
if not decision.allowed:
    raise PolicyViolation(decision.reason)

# After each call
client.emit({"type": "llm.response", "tokens_used": 1847, "cost_usd": 0.037})
```

```typescript
// TypeScript / Node
import { ZentinelleClient } from 'zentinelle';

const client = new ZentinelleClient({ apiKey: 'zk_...', endpoint: 'https://...' });
await client.register({ capabilities: ['llm:invoke'] });
```

**Supported languages:** Python · TypeScript · Go · Java · C#
**Framework plugins:** LangChain · LlamaIndex · CrewAI · Vercel AI SDK · Microsoft Agent Framework · n8n

See [zentinelle-sdk](https://github.com/calliopeai/zentinelle-sdk) for full SDK documentation.

## Supported LLM Providers

Works with all 21 providers: Anthropic · OpenAI · AWS Bedrock · Google Vertex AI · Gemini · Mistral · Cohere · Groq · Together · Fireworks · Perplexity · SambaNova · Cerebras · DeepSeek · xAI · HuggingFace · Ollama · LiteLLM · AI21 · NVIDIA · OpenRouter

## Deployment Options

| Option | Description |
|--------|-------------|
| **Self-hosted** | Docker Compose or Kubernetes. Free. MIT licensed. |
| **Managed cloud** | We host and operate it for you. |
| **BYOC** | Deploy in your cloud, we manage it remotely. |
| **Forward deployed** | Calliope engineer embedded in your infra for regulated industries. |

## Documentation

- [Architecture](docs/wiki/architecture.md)
- [API Reference](docs/wiki/api.md)
- [SDK Guide](docs/wiki/sdk.md)
- [Policy Reference](docs/wiki/policies.md)
- [Compliance Frameworks](docs/wiki/compliance.md)
- [Self-Hosting Guide](docs/wiki/deployment.md)
- [Development Guide](docs/wiki/development.md)

## License

MIT — see [LICENSE](LICENSE). Free to self-host, modify, and distribute.

---

Built by [Calliope Labs](https://calliope.ai) · [zentinelle.ai](https://zentinelle.ai)
