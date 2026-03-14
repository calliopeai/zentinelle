"""
Prompt Testing Service

Provides AI-powered prompt testing and improvement suggestions using a cheap model.
This helps users validate and refine their prompts before deployment.

IMPORTANT GUARDRAILS:
- One-shot only, no conversation history
- Rate limited per user
- Focused on prompt testing/optimization only
- Output size limits enforced
- Test inputs must be realistic samples, not chat requests
"""

import json
import logging
import hashlib
import httpx
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime, timedelta
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)


# =============================================================================
# Constants & Guardrails
# =============================================================================

# Rate limits
MAX_TESTS_PER_USER_PER_HOUR = 20
MAX_ANALYSES_PER_USER_PER_HOUR = 10

# Input limits
MAX_PROMPT_LENGTH = 8000  # ~2k tokens
MAX_TEST_INPUT_LENGTH = 500  # Short test input only
MIN_PROMPT_LENGTH = 20
MAX_OUTPUT_TOKENS = 512  # Keep responses short for testing

# Cost controls
ALLOWED_MODELS = {'gpt-4o-mini'}  # Only cheap models allowed

# Abuse detection keywords (block chat-like requests)
CHAT_ABUSE_PATTERNS = [
    'tell me a joke',
    'write me a story',
    'what do you think',
    'how are you',
    'who are you',
    'what can you do',
    'help me with',
    'can you',
    'please',
    'thanks',
    'explain',
    'describe',
]


@dataclass
class TestResult:
    """Result from testing a prompt."""
    success: bool
    response: str
    model_used: str
    input_tokens: int
    output_tokens: int
    error: Optional[str] = None


@dataclass
class ImprovementSuggestion:
    """A suggested improvement to the prompt."""
    category: str  # 'clarity', 'specificity', 'structure', 'safety', 'efficiency'
    original_text: str
    suggested_text: str
    explanation: str
    severity: str  # 'info', 'warning', 'important'


@dataclass
class PromptAnalysis:
    """Analysis of a prompt with improvement suggestions."""
    success: bool
    overall_score: int  # 1-100
    strengths: List[str]
    improvements: List[ImprovementSuggestion]
    token_efficiency: str  # 'optimal', 'verbose', 'too_brief'
    error: Optional[str] = None


# =============================================================================
# Rate Limiting & Validation
# =============================================================================

def get_rate_limit_key(user_id: str, action: str) -> str:
    """Generate a cache key for rate limiting."""
    hour = datetime.now().strftime('%Y%m%d%H')
    return f"prompt_tester:{action}:{user_id}:{hour}"


def check_rate_limit(user_id: str, action: str, limit: int) -> tuple[bool, int]:
    """
    Check if user has exceeded rate limit.

    Returns:
        (allowed, remaining_count)
    """
    key = get_rate_limit_key(user_id, action)
    current = cache.get(key, 0)

    if current >= limit:
        return False, 0

    # Increment counter
    cache.set(key, current + 1, timeout=3600)  # 1 hour TTL
    return True, limit - current - 1


def validate_prompt_for_testing(prompt_text: str) -> tuple[bool, str]:
    """
    Validate that a prompt is suitable for testing.

    Returns:
        (valid, error_message)
    """
    if not prompt_text or not prompt_text.strip():
        return False, "Prompt text is required"

    if len(prompt_text) < MIN_PROMPT_LENGTH:
        return False, f"Prompt must be at least {MIN_PROMPT_LENGTH} characters"

    if len(prompt_text) > MAX_PROMPT_LENGTH:
        return False, f"Prompt exceeds maximum length of {MAX_PROMPT_LENGTH} characters"

    return True, ""


def validate_test_input(test_input: str) -> tuple[bool, str]:
    """
    Validate that test input is a legitimate test case, not a chat request.

    Returns:
        (valid, error_message)
    """
    if not test_input or not test_input.strip():
        return False, "Test input is required"

    if len(test_input) > MAX_TEST_INPUT_LENGTH:
        return False, f"Test input exceeds maximum length of {MAX_TEST_INPUT_LENGTH} characters. Keep it brief - this is for testing, not chatting."

    # Check for chat-like abuse patterns
    test_lower = test_input.lower()
    for pattern in CHAT_ABUSE_PATTERNS:
        if pattern in test_lower and len(test_input) < 100:
            return False, "Test input should be a realistic sample of what users would send to your AI agent, not a general chat request. Try something specific to your prompt's purpose."

    return True, ""


# =============================================================================
# Prompt Tester Service
# =============================================================================

class PromptTester:
    """
    Service for testing prompts with AI and getting improvement suggestions.

    Uses GPT-4o-mini by default (very cheap: ~$0.15/1M input, $0.60/1M output).

    GUARDRAILS:
    - Only one-shot testing (no conversation)
    - Rate limited per user
    - Input/output size limits
    - Only approved cheap models
    """

    DEFAULT_MODEL = 'gpt-4o-mini'
    ANALYSIS_MODEL = 'gpt-4o-mini'

    def __init__(self, api_key: Optional[str] = None):
        """Initialize the prompt tester."""
        self.api_key = api_key or getattr(settings, 'OPENAI_API_KEY', None)
        self.base_url = 'https://api.openai.com/v1'

    async def test_prompt(
        self,
        system_prompt: str,
        user_message: str,
        user_id: str,
        model: Optional[str] = None,
        temperature: float = 0.7,
    ) -> TestResult:
        """
        Test a system prompt with a sample user message.

        This is ONE-SHOT only - no conversation history.

        Args:
            system_prompt: The system prompt to test
            user_message: A sample user message to test with
            user_id: User ID for rate limiting
            model: Model to use (must be in ALLOWED_MODELS)
            temperature: Temperature for generation

        Returns:
            TestResult with the AI response
        """
        # Rate limit check
        allowed, remaining = check_rate_limit(user_id, 'test', MAX_TESTS_PER_USER_PER_HOUR)
        if not allowed:
            return TestResult(
                success=False,
                response='',
                model_used='',
                input_tokens=0,
                output_tokens=0,
                error=f'Rate limit exceeded. You can test {MAX_TESTS_PER_USER_PER_HOUR} prompts per hour.',
            )

        # Validate inputs
        valid, error = validate_prompt_for_testing(system_prompt)
        if not valid:
            return TestResult(
                success=False, response='', model_used='', input_tokens=0, output_tokens=0, error=error
            )

        valid, error = validate_test_input(user_message)
        if not valid:
            return TestResult(
                success=False, response='', model_used='', input_tokens=0, output_tokens=0, error=error
            )

        # Ensure only allowed models
        model = model if model in ALLOWED_MODELS else self.DEFAULT_MODEL

        if not self.api_key:
            return TestResult(
                success=False,
                response='',
                model_used='',
                input_tokens=0,
                output_tokens=0,
                error='AI testing not configured. Contact your administrator.',
            )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f'{self.base_url}/chat/completions',
                    headers={
                        'Authorization': f'Bearer {self.api_key}',
                        'Content-Type': 'application/json',
                    },
                    json={
                        'model': model,
                        'messages': [
                            {'role': 'system', 'content': system_prompt},
                            {'role': 'user', 'content': user_message},
                        ],
                        'max_tokens': MAX_OUTPUT_TOKENS,
                        'temperature': min(temperature, 1.0),  # Cap temperature
                    },
                )
                response.raise_for_status()
                data = response.json()

                return TestResult(
                    success=True,
                    response=data['choices'][0]['message']['content'],
                    model_used=model,
                    input_tokens=data['usage']['prompt_tokens'],
                    output_tokens=data['usage']['completion_tokens'],
                )

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error testing prompt: {e}")
            return TestResult(
                success=False,
                response='',
                model_used=model,
                input_tokens=0,
                output_tokens=0,
                error='Failed to test prompt. Please try again.',
            )
        except Exception as e:
            logger.error(f"Error testing prompt: {e}")
            return TestResult(
                success=False,
                response='',
                model_used=model,
                input_tokens=0,
                output_tokens=0,
                error='An unexpected error occurred.',
            )

    async def analyze_prompt(
        self,
        prompt_text: str,
        user_id: str,
        prompt_type: str = 'system',
        target_providers: Optional[List[str]] = None,
    ) -> PromptAnalysis:
        """
        Analyze a prompt and provide improvement suggestions.

        This is for prompt optimization, not chatting.

        Args:
            prompt_text: The prompt to analyze
            user_id: User ID for rate limiting
            prompt_type: Type of prompt (system, persona, task, etc.)
            target_providers: Target AI providers (for compatibility notes)

        Returns:
            PromptAnalysis with score, strengths, and improvements
        """
        # Rate limit check
        allowed, remaining = check_rate_limit(user_id, 'analyze', MAX_ANALYSES_PER_USER_PER_HOUR)
        if not allowed:
            return PromptAnalysis(
                success=False,
                overall_score=0,
                strengths=[],
                improvements=[],
                token_efficiency='',
                error=f'Rate limit exceeded. You can analyze {MAX_ANALYSES_PER_USER_PER_HOUR} prompts per hour.',
            )

        # Validate input
        valid, error = validate_prompt_for_testing(prompt_text)
        if not valid:
            return PromptAnalysis(
                success=False, overall_score=0, strengths=[], improvements=[],
                token_efficiency='', error=error
            )

        if not self.api_key:
            return PromptAnalysis(
                success=False,
                overall_score=0,
                strengths=[],
                improvements=[],
                token_efficiency='',
                error='AI analysis not configured. Contact your administrator.',
            )

        analysis_prompt = f"""You are an expert prompt engineer. Analyze the following {prompt_type} prompt and provide specific, actionable feedback to improve it.

PROMPT TO ANALYZE:
```
{prompt_text}
```

TARGET PROVIDERS: {', '.join(target_providers) if target_providers else 'All providers'}

Provide your analysis as a JSON object with this exact structure:
{{
    "overall_score": <number 1-100>,
    "strengths": ["<strength 1>", "<strength 2>"],
    "improvements": [
        {{
            "category": "<clarity|specificity|structure|safety|efficiency>",
            "original_text": "<exact text from prompt that could be improved>",
            "suggested_text": "<improved version>",
            "explanation": "<brief why>",
            "severity": "<info|warning|important>"
        }}
    ],
    "token_efficiency": "<optimal|verbose|too_brief>"
}}

Focus on practical improvements:
- CLARITY: Is intent clear to the AI?
- SPECIFICITY: Are instructions precise?
- STRUCTURE: Is it well-organized?
- SAFETY: Are guardrails appropriate?
- EFFICIENCY: Could it be more concise?

Limit to 5 most important improvements. Return ONLY valid JSON."""

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(
                    f'{self.base_url}/chat/completions',
                    headers={
                        'Authorization': f'Bearer {self.api_key}',
                        'Content-Type': 'application/json',
                    },
                    json={
                        'model': self.ANALYSIS_MODEL,
                        'messages': [
                            {'role': 'system', 'content': 'You are a prompt engineering expert. Return only valid JSON.'},
                            {'role': 'user', 'content': analysis_prompt},
                        ],
                        'max_tokens': 1500,
                        'temperature': 0.3,
                        'response_format': {'type': 'json_object'},
                    },
                )
                response.raise_for_status()
                data = response.json()
                content = data['choices'][0]['message']['content']

                # Parse the JSON response
                analysis = json.loads(content)

                improvements = [
                    ImprovementSuggestion(
                        category=imp.get('category', 'general'),
                        original_text=imp.get('original_text', ''),
                        suggested_text=imp.get('suggested_text', ''),
                        explanation=imp.get('explanation', ''),
                        severity=imp.get('severity', 'info'),
                    )
                    for imp in analysis.get('improvements', [])[:5]  # Limit to 5
                ]

                return PromptAnalysis(
                    success=True,
                    overall_score=min(100, max(1, analysis.get('overall_score', 50))),
                    strengths=analysis.get('strengths', [])[:5],
                    improvements=improvements,
                    token_efficiency=analysis.get('token_efficiency', 'unknown'),
                )

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse analysis response: {e}")
            return PromptAnalysis(
                success=False, overall_score=0, strengths=[], improvements=[],
                token_efficiency='', error='Failed to analyze prompt. Please try again.'
            )
        except Exception as e:
            logger.error(f"Error analyzing prompt: {e}")
            return PromptAnalysis(
                success=False, overall_score=0, strengths=[], improvements=[],
                token_efficiency='', error='An unexpected error occurred.'
            )


# =============================================================================
# Sync Wrappers (for GraphQL mutations)
# =============================================================================

def test_prompt_sync(
    system_prompt: str,
    user_message: str,
    user_id: str,
    model: str = 'gpt-4o-mini',
) -> TestResult:
    """Synchronous wrapper for test_prompt."""
    import asyncio
    tester = PromptTester()
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(tester.test_prompt(system_prompt, user_message, user_id, model))


def analyze_prompt_sync(
    prompt_text: str,
    user_id: str,
    prompt_type: str = 'system',
    target_providers: Optional[List[str]] = None,
) -> PromptAnalysis:
    """Synchronous wrapper for analyze_prompt."""
    import asyncio
    tester = PromptTester()
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(tester.analyze_prompt(prompt_text, user_id, prompt_type, target_providers))
