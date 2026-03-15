"""
Prompt injection detection evaluator.

Covers both attack surfaces:

  Direct injection  — malicious instructions in the user's own input
  Indirect injection — malicious instructions embedded in content the agent
                       processes: tool outputs, RAG chunks, retrieved documents

This is OWASP LLM Top 10 #1 (LLM01).

Pattern library is shared with ContentScanner to avoid duplication.
Custom patterns can be added per-policy via config.
"""
import re
import logging
from typing import Dict, Any, Optional, List, Tuple

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)


def _load_patterns() -> Tuple[List[re.Pattern], List[re.Pattern]]:
    """
    Load compiled injection and jailbreak patterns from ContentScanner.
    Returns (injection_patterns, jailbreak_patterns) as compiled regex lists.
    Lazy-loaded to avoid circular imports at module load time.
    """
    from zentinelle.services.content_scanner import ContentScanner
    injection = [
        re.compile(p, re.IGNORECASE)
        for p in ContentScanner.INJECTION_PATTERNS
    ]
    jailbreak = [
        re.compile(p, re.IGNORECASE)
        for p in ContentScanner.JAILBREAK_PATTERNS
    ]
    return injection, jailbreak


# Additional indirect-injection patterns — instructions that make sense in
# injected *tool output* or *retrieved content* but not in direct user input.
INDIRECT_INJECTION_PATTERNS = [
    # Explicit redirect attempts in returned content
    re.compile(r'note\s+to\s+(assistant|ai|model|agent)\s*:', re.IGNORECASE),
    re.compile(r'\[INST\]|\[\/INST\]|<\|system\|>|<\|user\|>|<\|assistant\|>', re.IGNORECASE),
    re.compile(r'<\s*system\s*>.*?<\s*/\s*system\s*>', re.IGNORECASE | re.DOTALL),
    # Markdown/HTML header injection attempts
    re.compile(r'^#{1,6}\s*(system|instruction|override|new\s+task)', re.IGNORECASE | re.MULTILINE),
    # Instruction continuation tricks
    re.compile(r'---+\s*(end\s+of\s+(document|content|context)|new\s+instructions?)', re.IGNORECASE),
    re.compile(r'ignore\s+the\s+(above|previous|prior)\s+(text|content|document)', re.IGNORECASE),
    # Common indirect exfiltration triggers in tool outputs
    re.compile(r'print\s+(your\s+)?(api\s+key|system\s+prompt|secret|password|token)', re.IGNORECASE),
    re.compile(r'send\s+(all|the)\s+(conversation|chat|history|context)\s+to', re.IGNORECASE),
]


class PromptInjectionEvaluator(BasePolicyEvaluator):
    """
    Evaluates prompt_injection policies.

    Config schema:
    {
        "scan_user_input": true,
        "scan_tool_outputs": true,
        "scan_rag_context": true,
        "sensitivity": "medium",           # "low" | "medium" | "high" | "paranoid"
        "pattern_categories": ["jailbreak", "override", "delimiter", "indirect"],
        "custom_patterns": ["my pattern"],
        "disabled_patterns": [],           # pattern strings to skip
        "action_on_detect": "block"        # "block" (default) | "warn"
    }

    Context keys:
        "input_text"      str            — direct user input
        "tool_outputs"    list[str]|str  — tool call results (indirect surface)
        "rag_context"     list[str]|str  — retrieved document chunks (indirect surface)
        "system_prompt"   str            — active system prompt (structural attack surface)

    Sensitivity levels:
        low      — only high-confidence patterns (fewer false positives)
        medium   — standard pattern set (default)
        high     — standard + low-confidence contextual patterns
        paranoid — all patterns including structural/delimiter attacks
    """

    def evaluate(
        self,
        policy: Policy,
        action: str,
        user_id: Optional[str],
        context: Dict[str, Any],
        dry_run: bool = False,
    ) -> PolicyResult:
        config = policy.config
        warnings = []

        sensitivity = config.get('sensitivity', 'medium')
        action_on_detect = config.get('action_on_detect', 'block')

        # Load pattern libraries (lazy, cached after first call)
        injection_patterns, jailbreak_patterns = _load_patterns()

        # Compile any custom patterns
        custom_raw = config.get('custom_patterns', [])
        custom_patterns = []
        for raw in custom_raw:
            try:
                custom_patterns.append(re.compile(raw, re.IGNORECASE))
            except re.error:
                logger.warning("PromptInjectionEvaluator: invalid custom pattern: %s", raw)

        disabled = set(config.get('disabled_patterns', []))

        # Build active pattern set based on sensitivity
        active_direct = []
        active_indirect = list(INDIRECT_INJECTION_PATTERNS)

        categories = config.get('pattern_categories', ['jailbreak', 'override', 'delimiter', 'indirect'])

        if 'override' in categories or 'jailbreak' in categories:
            active_direct.extend(injection_patterns)
        if 'jailbreak' in categories:
            active_direct.extend(jailbreak_patterns)
        if 'delimiter' in categories and sensitivity in ('high', 'paranoid'):
            # Delimiter attacks only surface at higher sensitivity
            active_direct.extend(INDIRECT_INJECTION_PATTERNS)
        if 'indirect' not in categories:
            active_indirect = []

        active_direct.extend(custom_patterns)

        # Filter disabled patterns
        active_direct = [p for p in active_direct if p.pattern not in disabled]
        active_indirect = [p for p in active_indirect if p.pattern not in disabled]

        # ── Surface 1: Direct user input ──────────────────────────────────────
        if config.get('scan_user_input', True):
            input_text = context.get('input_text', '')
            if input_text:
                hit = self._scan(input_text, active_direct, sensitivity)
                if hit:
                    msg = (
                        f"Prompt injection detected in user input "
                        f"(policy '{policy.name}'): matched '{hit}'"
                    )
                    if action_on_detect == 'block':
                        return PolicyResult(passed=False, message=msg)
                    warnings.append(f"[PromptInjection] {msg}")

        # ── Surface 2: Tool outputs (indirect) ───────────────────────────────
        if config.get('scan_tool_outputs', True):
            tool_outputs = context.get('tool_outputs', [])
            if isinstance(tool_outputs, str):
                tool_outputs = [tool_outputs]
            for i, output in enumerate(tool_outputs or []):
                hit = self._scan(output, active_direct + active_indirect, sensitivity)
                if hit:
                    msg = (
                        f"Indirect prompt injection detected in tool output #{i} "
                        f"(policy '{policy.name}'): matched '{hit}'"
                    )
                    if action_on_detect == 'block':
                        return PolicyResult(passed=False, message=msg)
                    warnings.append(f"[PromptInjection/indirect] {msg}")

        # ── Surface 3: RAG / retrieved context (indirect) ────────────────────
        if config.get('scan_rag_context', True):
            rag_context = context.get('rag_context', [])
            if isinstance(rag_context, str):
                rag_context = [rag_context]
            for i, chunk in enumerate(rag_context or []):
                hit = self._scan(chunk, active_direct + active_indirect, sensitivity)
                if hit:
                    msg = (
                        f"Indirect prompt injection detected in RAG context chunk #{i} "
                        f"(policy '{policy.name}'): matched '{hit}'"
                    )
                    if action_on_detect == 'block':
                        return PolicyResult(passed=False, message=msg)
                    warnings.append(f"[PromptInjection/rag] {msg}")

        return PolicyResult(passed=True, warnings=warnings)

    def _scan(
        self,
        text: str,
        patterns: List[re.Pattern],
        sensitivity: str,
    ) -> Optional[str]:
        """
        Scan text against patterns. Returns the matched string on first hit,
        None if clean. At 'low' sensitivity only returns short, high-confidence
        matches to reduce false positives.
        """
        for pattern in patterns:
            try:
                m = pattern.search(text)
                if m:
                    matched = m.group()
                    # Low sensitivity: skip very short matches (likely false positive)
                    if sensitivity == 'low' and len(matched) < 10:
                        continue
                    return matched[:120]  # truncate for safe logging
            except Exception:
                continue
        return None
