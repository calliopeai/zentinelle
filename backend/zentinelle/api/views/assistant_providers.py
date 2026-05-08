"""
GET /api/zentinelle/v1/assistant/providers

Returns the list of LLM providers that have API keys configured,
along with their available models. Used by the chat assistant UI to
populate the model selector dynamically.
"""
import os
from django.http import JsonResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from zentinelle.services.llm_provider import OPENAI_COMPAT_PROVIDERS

PROVIDER_MODELS = {
    'anthropic': [
        {'value': 'claude-opus-4-20250514', 'label': 'Claude Opus 4'},
        {'value': 'claude-sonnet-4-20250514', 'label': 'Claude Sonnet 4'},
        {'value': 'claude-3-5-haiku-20241022', 'label': 'Claude 3.5 Haiku'},
    ],
    'openai': [
        {'value': 'gpt-4o', 'label': 'GPT-4o'},
        {'value': 'gpt-4o-mini', 'label': 'GPT-4o Mini'},
        {'value': 'o1', 'label': 'o1'},
        {'value': 'o3-mini', 'label': 'o3-mini'},
    ],
    'google': [
        {'value': 'gemini-2.5-pro', 'label': 'Gemini 2.5 Pro'},
        {'value': 'gemini-2.5-flash', 'label': 'Gemini 2.5 Flash'},
    ],
    'mistral': [
        {'value': 'mistral-large-latest', 'label': 'Mistral Large'},
        {'value': 'mistral-small-latest', 'label': 'Mistral Small'},
    ],
    'deepseek': [
        {'value': 'deepseek-chat', 'label': 'DeepSeek Chat'},
        {'value': 'deepseek-reasoner', 'label': 'DeepSeek Reasoner'},
    ],
    'fireworks': [
        {'value': 'accounts/fireworks/models/llama-v3p3-70b-instruct', 'label': 'Llama 3.3 70B'},
        {'value': 'accounts/fireworks/models/qwen2p5-72b-instruct', 'label': 'Qwen 2.5 72B'},
    ],
    'together': [
        {'value': 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'label': 'Llama 3.3 70B'},
        {'value': 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'label': 'Qwen 2.5 72B'},
    ],
    'groq': [
        {'value': 'llama-3.3-70b-versatile', 'label': 'Llama 3.3 70B (Groq)'},
        {'value': 'mixtral-8x7b-32768', 'label': 'Mixtral 8x7B'},
    ],
    'cerebras': [
        {'value': 'llama3.3-70b', 'label': 'Llama 3.3 70B (Cerebras)'},
        {'value': 'llama3.1-8b', 'label': 'Llama 3.1 8B (Cerebras)'},
    ],
    'sambanova': [
        {'value': 'Meta-Llama-3.3-70B-Instruct', 'label': 'Llama 3.3 70B (SambaNova)'},
    ],
    'xai': [
        {'value': 'grok-2-latest', 'label': 'Grok 2'},
    ],
    'openrouter': [
        {'value': 'openrouter/auto', 'label': 'Auto-route'},
        {'value': 'anthropic/claude-sonnet-4', 'label': 'Claude Sonnet 4 (via OpenRouter)'},
    ],
    'ollama': [
        {'value': 'llama3.3', 'label': 'Llama 3.3 (local)'},
        {'value': 'qwen2.5', 'label': 'Qwen 2.5 (local)'},
        {'value': 'deepseek-r1', 'label': 'DeepSeek R1 (local)'},
    ],
    'lmstudio': [
        {'value': 'local-model', 'label': 'Local Model (LM Studio)'},
    ],
    'perplexity': [
        {'value': 'sonar', 'label': 'Sonar'},
        {'value': 'sonar-pro', 'label': 'Sonar Pro'},
    ],
    'cohere': [
        {'value': 'command-r-plus', 'label': 'Command R+'},
        {'value': 'command-r', 'label': 'Command R'},
    ],
    'nvidia': [
        {'value': 'meta/llama-3.3-70b-instruct', 'label': 'Llama 3.3 70B (NVIDIA)'},
    ],
}

PROVIDER_LABELS = {
    'anthropic': 'Anthropic',
    'openai': 'OpenAI',
    'google': 'Google',
    'mistral': 'Mistral AI',
    'deepseek': 'DeepSeek',
    'fireworks': 'Fireworks',
    'together': 'Together',
    'groq': 'Groq',
    'cerebras': 'Cerebras',
    'sambanova': 'SambaNova',
    'xai': 'xAI',
    'openrouter': 'OpenRouter',
    'ollama': 'Ollama',
    'lmstudio': 'LM Studio',
    'perplexity': 'Perplexity',
    'cohere': 'Cohere',
    'nvidia': 'NVIDIA',
    'litellm': 'LiteLLM',
    'huggingface': 'Hugging Face',
}


def _has_credentials(provider: str) -> bool:
    """Check if a provider has API keys configured."""
    if provider == 'anthropic':
        return bool(os.environ.get('ANTHROPIC_API_KEY'))
    if provider == 'google':
        return bool(os.environ.get('GOOGLE_API_KEY'))
    # Local providers don't need keys
    if provider in ('ollama', 'lmstudio'):
        return True
    config = OPENAI_COMPAT_PROVIDERS.get(provider, {})
    env_var = config.get('env')
    if not env_var:
        return False
    return bool(os.environ.get(env_var))


@method_decorator(csrf_exempt, name='dispatch')
class AssistantProvidersView(View):
    """List providers that have API keys configured."""

    def get(self, request):
        providers = []
        for provider, models in PROVIDER_MODELS.items():
            if _has_credentials(provider):
                providers.append({
                    'id': provider,
                    'name': PROVIDER_LABELS.get(provider, provider),
                    'models': models,
                })
        return JsonResponse({'providers': providers})
