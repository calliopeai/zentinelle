"""
Fallback provider/model list when the AIModel registry hasn't been synced.

These represent the current generation of chat-capable models with
function calling support. Used by /assistant/providers when the registry
is empty.
"""

FALLBACK_PROVIDERS = {
    'anthropic': [
        {
            'value': 'claude-opus-4-20250514',
            'label': 'Claude Opus 4',
            'capabilities': ['chat', 'function_calling', 'vision', 'long_context'],
            'contextWindow': 200000,
            'releaseDate': '2025-05-14',
            'supportsTools': True,
            'supportsVision': True,
            'riskLevel': 'limited',
        },
        {
            'value': 'claude-sonnet-4-20250514',
            'label': 'Claude Sonnet 4',
            'capabilities': ['chat', 'function_calling', 'vision', 'long_context'],
            'contextWindow': 200000,
            'releaseDate': '2025-05-14',
            'supportsTools': True,
            'supportsVision': True,
            'riskLevel': 'limited',
        },
        {
            'value': 'claude-3-5-haiku-20241022',
            'label': 'Claude 3.5 Haiku',
            'capabilities': ['chat', 'function_calling'],
            'contextWindow': 200000,
            'releaseDate': '2024-10-22',
            'supportsTools': True,
            'supportsVision': False,
            'riskLevel': 'limited',
        },
    ],
    'openai': [
        {
            'value': 'gpt-4o',
            'label': 'GPT-4o',
            'capabilities': ['chat', 'function_calling', 'vision', 'long_context'],
            'contextWindow': 128000,
            'releaseDate': '2024-05-13',
            'supportsTools': True,
            'supportsVision': True,
            'riskLevel': 'limited',
        },
        {
            'value': 'gpt-4o-mini',
            'label': 'GPT-4o Mini',
            'capabilities': ['chat', 'function_calling', 'vision'],
            'contextWindow': 128000,
            'releaseDate': '2024-07-18',
            'supportsTools': True,
            'supportsVision': True,
            'riskLevel': 'limited',
        },
        {
            'value': 'o3-mini',
            'label': 'o3-mini',
            'capabilities': ['chat', 'function_calling'],
            'contextWindow': 200000,
            'releaseDate': '2025-01-31',
            'supportsTools': True,
            'supportsVision': False,
            'riskLevel': 'limited',
        },
    ],
    'google': [
        {
            'value': 'gemini-2.5-pro',
            'label': 'Gemini 2.5 Pro',
            'capabilities': ['chat', 'function_calling', 'vision', 'long_context'],
            'contextWindow': 1048576,
            'releaseDate': '2025-03-25',
            'supportsTools': True,
            'supportsVision': True,
            'riskLevel': 'limited',
        },
        {
            'value': 'gemini-2.5-flash',
            'label': 'Gemini 2.5 Flash',
            'capabilities': ['chat', 'function_calling', 'vision'],
            'contextWindow': 1048576,
            'releaseDate': '2025-03-25',
            'supportsTools': True,
            'supportsVision': True,
            'riskLevel': 'limited',
        },
    ],
    'mistral': [
        {'value': 'mistral-large-latest', 'label': 'Mistral Large', 'capabilities': ['chat', 'function_calling'], 'contextWindow': 128000, 'releaseDate': '2024-11-15', 'supportsTools': True, 'supportsVision': False, 'riskLevel': 'limited'},
    ],
    'deepseek': [
        {'value': 'deepseek-chat', 'label': 'DeepSeek Chat', 'capabilities': ['chat', 'function_calling'], 'contextWindow': 64000, 'releaseDate': '2024-12-26', 'supportsTools': True, 'supportsVision': False, 'riskLevel': 'limited'},
        {'value': 'deepseek-reasoner', 'label': 'DeepSeek R1', 'capabilities': ['chat', 'function_calling'], 'contextWindow': 64000, 'releaseDate': '2025-01-20', 'supportsTools': True, 'supportsVision': False, 'riskLevel': 'limited'},
    ],
    'groq': [
        {'value': 'llama-3.3-70b-versatile', 'label': 'Llama 3.3 70B (Groq)', 'capabilities': ['chat', 'function_calling'], 'contextWindow': 128000, 'releaseDate': '2024-12-06', 'supportsTools': True, 'supportsVision': False, 'riskLevel': 'limited'},
    ],
    'cerebras': [
        {'value': 'llama3.3-70b', 'label': 'Llama 3.3 70B (Cerebras)', 'capabilities': ['chat', 'function_calling'], 'contextWindow': 128000, 'releaseDate': '2024-12-06', 'supportsTools': True, 'supportsVision': False, 'riskLevel': 'limited'},
    ],
    'xai': [
        {'value': 'grok-2-latest', 'label': 'Grok 2', 'capabilities': ['chat', 'function_calling'], 'contextWindow': 131072, 'releaseDate': '2024-08-13', 'supportsTools': True, 'supportsVision': False, 'riskLevel': 'limited'},
    ],
    'ollama': [
        {'value': 'llama3.3', 'label': 'Llama 3.3 (local)', 'capabilities': ['chat'], 'contextWindow': 128000, 'releaseDate': '2024-12-06', 'supportsTools': False, 'supportsVision': False, 'riskLevel': 'unknown'},
        {'value': 'qwen2.5', 'label': 'Qwen 2.5 (local)', 'capabilities': ['chat'], 'contextWindow': 32000, 'releaseDate': '2024-09-19', 'supportsTools': False, 'supportsVision': False, 'riskLevel': 'unknown'},
    ],
    'lmstudio': [
        {'value': 'local-model', 'label': 'Local Model', 'capabilities': ['chat'], 'contextWindow': 8192, 'releaseDate': None, 'supportsTools': False, 'supportsVision': False, 'riskLevel': 'unknown'},
    ],
}
