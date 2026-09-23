"""What a matched rule does: escalation, the mode ceiling, and fallback (#396).

A policy or content rule names an action from one ordered set (see
`zentinelle.models.actions`). On a match:

1. The rule's action is the starting point. A match that an approval can
   release (the evaluator says so) starts no higher than `require_approval`.
2. Escalation raises it: repeat steps by how often the rule matched for this
   endpoint within a window, severity steps by how severe the match was.
   Steps only ever go up.
3. The policy's mode caps it. `enforce` allows every action. `audit` keeps
   only the log and alert steps the rule reached, so it records, or alerts,
   and never disrupts. `disabled` rules are not evaluated at all.
4. The decided action carries an ordered fallback chain. A target that cannot
   honour an action (steering and interruption depend on the harness) takes
   the first entry it can. Every chain ends with one any caller can honour.
"""
import json
import unicodedata
from dataclasses import dataclass
from string import Formatter
from typing import Any, Dict, Iterable, List, Optional, Tuple

from django.core.cache import cache

from zentinelle.models.actions import (ACTION_ORDER, BLOCK_LEVEL_ORDER,
                                       SEVERITY_ORDER, Action, BlockLevel)

MAX_STEPS = 10
MAX_REPEAT_COUNT = 10000
MAX_WINDOW_SECONDS = 7 * 24 * 3600
MAX_STEER_MESSAGE = 2000
MAX_RENDERED_STEER = 4000
MAX_STEER_VALUE = 200
STEER_FIELDS = ('rule', 'reason', 'action', 'tool', 'agent')
# Characters that break a line or hide text: controls (newlines included),
# format characters such as bidi overrides, surrogates, and the Unicode line
# and paragraph separators.
UNPRINTABLE_CATEGORIES = frozenset({'Cc', 'Cf', 'Cs', 'Zl', 'Zp'})

# What a target has to support to honour an action. Anything absent here
# every caller can do: log and alert happen in Zentinelle, a warning travels
# in the response, and refusing the call is the floor of the contract.
REQUIRES = {
    (Action.STEER.value, None): 'supports_steer',
    (Action.REDACT.value, None): 'supports_redact',
    (Action.REQUIRE_APPROVAL.value, None): 'supports_approval',
    (Action.BLOCK.value, BlockLevel.TURN.value): 'supports_interrupt',
    (Action.BLOCK.value, BlockLevel.REVOKE_KEY.value): 'supports_revoke_key',
    (Action.BLOCK.value, BlockLevel.STOP.value): 'supports_stop',
    (Action.BLOCK.value, BlockLevel.QUARANTINE.value): 'supports_quarantine',
}
CAPABILITIES = frozenset(REQUIRES.values())


@dataclass
class Decision:
    """What one matched rule does, and why."""
    action: str
    block_level: Optional[str]
    mode: str
    configured_action: Optional[str]
    rule: Optional[Dict[str, Any]] = None
    escalation: Optional[Dict[str, Any]] = None
    capped_from: Optional[str] = None
    message: Optional[str] = None


def rank(action: str, block_level: Optional[str] = None) -> Tuple[int, int]:
    """Position in the ordered set; block levels order the blocks."""
    level = BLOCK_LEVEL_ORDER.index(block_level) if action == Action.BLOCK and block_level else -1
    return ACTION_ORDER.index(action), level


def _level_for(action: str, block_level: Optional[str]) -> Optional[str]:
    if action != Action.BLOCK:
        return None
    return block_level or BlockLevel.TOOL_CALL.value


# ---------------------------------------------------------------------------
# Validation, shared by the models, the API and the portal
# ---------------------------------------------------------------------------

def _steps(raw: Any, key: str, floor: Tuple[int, int]) -> List[Dict[str, Any]]:
    if not isinstance(raw, list) or len(raw) > MAX_STEPS:
        raise ValueError(f'escalation {key} steps must be a list of at most {MAX_STEPS}')
    steps: List[Dict[str, Any]] = []
    previous_threshold, previous_rank = None, floor
    for raw_step in raw:
        if not isinstance(raw_step, dict) or set(raw_step) - {key, 'action', 'block_level'}:
            raise ValueError(f'each escalation step takes {key}, action and block_level')
        threshold = raw_step.get(key)
        if key == 'count':
            if not isinstance(threshold, int) or isinstance(threshold, bool) or not 2 <= threshold <= MAX_REPEAT_COUNT:
                raise ValueError(f'repeat count must be a whole number from 2 to {MAX_REPEAT_COUNT}; '
                                 'the rule\'s own action applies to the first match')
            ordinal = threshold
        else:
            if threshold not in SEVERITY_ORDER:
                raise ValueError(f'min_severity must be one of {", ".join(SEVERITY_ORDER)}')
            ordinal = SEVERITY_ORDER.index(threshold)
        action = raw_step.get('action')
        if action not in ACTION_ORDER:
            raise ValueError(f'escalation action must be one of {", ".join(ACTION_ORDER)}')
        level = raw_step.get('block_level')
        if action == Action.BLOCK:
            level = level or BlockLevel.TOOL_CALL.value
            if level not in BLOCK_LEVEL_ORDER:
                raise ValueError(f'block_level must be one of {", ".join(BLOCK_LEVEL_ORDER)}')
        elif level is not None:
            raise ValueError('block_level only applies to block')
        if previous_threshold is not None and ordinal <= previous_threshold:
            raise ValueError(f'escalation {key} thresholds must increase')
        step_rank = rank(action, level)
        if step_rank <= previous_rank:
            raise ValueError('each escalation step must be stronger than the action before it')
        previous_threshold, previous_rank = ordinal, step_rank
        step = {key: threshold, 'action': action}
        if level:
            step['block_level'] = level
        steps.append(step)
    return steps


def normalize_escalation(escalation: Any, action: str, block_level: Optional[str]) -> Dict[str, Any]:
    """The escalation config in canonical form, or ValueError saying what is wrong."""
    if escalation in (None, {}):
        return {}
    if not isinstance(escalation, dict):
        raise ValueError('escalation must be an object')
    unknown = set(escalation) - {'window_seconds', 'repeat', 'severity'}
    if unknown:
        raise ValueError(f'unknown escalation keys: {", ".join(sorted(unknown))}')
    floor = rank(action, _level_for(action, block_level))
    normalized: Dict[str, Any] = {}
    repeat = _steps(escalation.get('repeat', []), 'count', floor)
    if repeat:
        window = escalation.get('window_seconds')
        if not isinstance(window, int) or isinstance(window, bool) or not 1 <= window <= MAX_WINDOW_SECONDS:
            raise ValueError(f'window_seconds must be a whole number from 1 to {MAX_WINDOW_SECONDS}')
        normalized['window_seconds'] = window
        normalized['repeat'] = repeat
    elif 'window_seconds' in escalation:
        raise ValueError('window_seconds applies only to repeat steps')
    severity = _steps(escalation.get('severity', []), 'min_severity', floor)
    if severity:
        normalized['severity'] = severity
    return normalized


def validate_steer_template(template: str) -> None:
    if len(template) > MAX_STEER_MESSAGE:
        raise ValueError(f'steer message must be at most {MAX_STEER_MESSAGE} characters')
    try:
        fields = list(Formatter().parse(template))
    except ValueError as exc:
        raise ValueError(f'steer message is not a valid template: {exc}') from exc
    for _literal, name, spec, conversion in fields:
        if name is None:
            continue
        if name not in STEER_FIELDS or spec or conversion:
            raise ValueError('steer message placeholders are {' + '}, {'.join(STEER_FIELDS) + '}')


def validate_rule_action(action: Any, block_level: Any, steer_message: Any, escalation: Any) -> Dict[str, Any]:
    """Check a rule's action settings together; return the canonical escalation."""
    if action not in ACTION_ORDER:
        raise ValueError(f'action must be one of {", ".join(ACTION_ORDER)}')
    if block_level not in BLOCK_LEVEL_ORDER:
        raise ValueError(f'block_level must be one of {", ".join(BLOCK_LEVEL_ORDER)}')
    if not isinstance(steer_message, str):
        raise ValueError('steer message must be text')
    normalized = normalize_escalation(escalation, action, block_level)
    if steer_message:
        validate_steer_template(steer_message)
    ladder = [action] + [step['action'] for key in ('repeat', 'severity') for step in normalized.get(key, [])]
    if Action.STEER in ladder and not steer_message.strip():
        raise ValueError('a rule that can steer needs a steer message')
    return normalized


def normalize_capabilities(raw: Any) -> Optional[Dict[str, bool]]:
    """Declared target capabilities: booleans only; names we do not know are ignored."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError('target_capabilities must be an object of booleans')
    wrong = sorted(name for name, value in raw.items() if not isinstance(value, bool))
    if wrong:
        raise ValueError(f'target_capabilities values must be true or false: {", ".join(wrong)}')
    return {name: value for name, value in raw.items() if name in CAPABILITIES}


# ---------------------------------------------------------------------------
# Deciding
# ---------------------------------------------------------------------------

def count_match(*, tenant_id: str, kind: str, rule_id: str, scope_id: str,
                window_seconds: int, record: bool = True) -> int:
    """How many times this rule has matched for this scope in the window, this one included.

    The window starts at the first match and lasts window_seconds. A preview
    (dry run, an after-the-fact scan) reads the count without adding to it.
    """
    key = f'zentinelle:escalation:{tenant_id}:{kind}:{rule_id}:{scope_id}'
    if not record:
        return int(cache.get(key) or 0) + 1
    cache.add(key, 0, timeout=window_seconds)
    try:
        return cache.incr(key)
    except ValueError:
        # The window closed between add and incr: this match opens the next.
        cache.set(key, 1, timeout=window_seconds)
        return 1


def decide(*, action: str, block_level: Optional[str], escalation: Dict[str, Any], mode: str,
           count: Optional[int] = None, severity: Optional[str] = None,
           approval_kind: bool = False, rule: Optional[Dict[str, Any]] = None) -> Decision:
    """The action one matched rule takes."""
    current = (action, _level_for(action, block_level))
    if approval_kind and rank(*current) > rank(Action.REQUIRE_APPROVAL):
        current = (Action.REQUIRE_APPROVAL.value, None)
    reached = [current[0]]
    how = None
    if count is not None and escalation.get('repeat'):
        for step in escalation['repeat']:
            if count >= step['count']:
                reached.append(step['action'])
                if rank(step['action'], step.get('block_level')) > rank(*current):
                    current = (step['action'], step.get('block_level'))
                    how = {'by': 'repeat', 'count': count, 'window_seconds': escalation['window_seconds']}
    if severity in SEVERITY_ORDER and escalation.get('severity'):
        for step in escalation['severity']:
            if SEVERITY_ORDER.index(severity) >= SEVERITY_ORDER.index(step['min_severity']):
                reached.append(step['action'])
                if rank(step['action'], step.get('block_level')) > rank(*current):
                    current = (step['action'], step.get('block_level'))
                    how = {'by': 'severity', 'severity': severity}
    decision = Decision(action=current[0], block_level=current[1], mode=mode,
                        configured_action=action, rule=rule, escalation=how)
    if mode != 'enforce':
        capped = Action.ALERT.value if Action.ALERT in reached else Action.LOG.value
        if decision.action != capped:
            decision.capped_from = decision.action
        decision.action, decision.block_level = capped, None
    return decision


def denies(decision: Decision) -> bool:
    """Whether the call must be refused. `allowed` stays safe for callers that read nothing else.

    What a caller declares it can honour never enters this: capabilities pick
    an option from the fallback chain, and must not loosen the decision.
    Redact refuses the call because a policy evaluation has no redacted
    content to hand back in place of the original.
    """
    if decision.mode != 'enforce':
        return False
    return decision.action in (Action.BLOCK, Action.REQUIRE_APPROVAL, Action.REDACT)


def _steer_value(value: Any) -> str:
    """One substituted value: a single quoted line of bounded length.

    The values carry text the caller controls (a tool name, an evaluator's
    reason that quotes it) into a message the harness trusts, so none may
    start a new line, hide text or run on. Quoting with escapes keeps the
    value from closing its own quotes.
    """
    text = ''.join(' ' if unicodedata.category(char) in UNPRINTABLE_CATEGORIES else char
                   for char in str(value or ''))
    return json.dumps(' '.join(text.split())[:MAX_STEER_VALUE], ensure_ascii=False)


def render_steer(template: str, values: Dict[str, Any]) -> str:
    parts = []
    for literal, name, _spec, _conversion in Formatter().parse(template):
        parts.append(literal)
        if name is not None:
            parts.append(_steer_value(values.get(name)))
    return ''.join(parts)[:MAX_RENDERED_STEER]


def fallback_chain(action: str, block_level: Optional[str]) -> List[Dict[str, Any]]:
    """The actions to try, in order, when a target cannot honour this one.

    A block falls back upward through the stronger block levels, then to
    refusing the call. Steer falls back to a warning; redact and approval
    fall back to refusing the call. None of them falls back to letting
    content or a call through that the rule meant to stop.
    """
    if action == Action.BLOCK:
        start = BLOCK_LEVEL_ORDER.index(block_level or BlockLevel.TOOL_CALL.value)
        chain = [(action, level) for level in BLOCK_LEVEL_ORDER[start:]] if start else []
        chain.append((action, BlockLevel.TOOL_CALL.value))
    elif action == Action.STEER:
        chain = [(action, None), (Action.WARN.value, None)]
    elif action in (Action.REDACT, Action.REQUIRE_APPROVAL):
        chain = [(action, None), (Action.BLOCK.value, BlockLevel.TOOL_CALL.value)]
    else:
        chain = [(action, None)]
    return [{'action': a, 'block_level': level, 'requires': REQUIRES.get((a, level))} for a, level in chain]


def select(chain: List[Dict[str, Any]], capabilities: Dict[str, bool]) -> Dict[str, Any]:
    for option in chain:
        if option['requires'] is None or capabilities.get(option['requires']) is True:
            return option
    return chain[-1]


def summarize(decisions: Iterable[Decision], capabilities: Optional[Dict[str, bool]]) -> Dict[str, Any]:
    """The evaluation's decided action: the strongest across matched rules.

    With declared capabilities, `selected` is the first option in the chain
    the target can honour and `fallback` says whether it is not the first.
    Without them the caller picks from `fallback_chain` itself.
    """
    decisions = list(decisions)
    if not decisions:
        return {'action': None, 'block_level': None, 'message': None, 'rule': None, 'mode': None,
                'configured_action': None, 'escalation': None, 'capped_from': None,
                'fallback_chain': [], 'selected': None, 'fallback': None}
    decisive = max(decisions, key=lambda d: rank(d.action, d.block_level))
    chain = fallback_chain(decisive.action, decisive.block_level)
    selected = select(chain, capabilities) if capabilities is not None else None
    return {
        'action': decisive.action,
        'block_level': decisive.block_level,
        'message': decisive.message,
        'rule': decisive.rule,
        'mode': decisive.mode,
        'configured_action': decisive.configured_action,
        'escalation': decisive.escalation,
        'capped_from': decisive.capped_from,
        'fallback_chain': chain,
        'selected': selected,
        'fallback': None if selected is None else selected != chain[0],
    }


def refusal(capabilities: Optional[Dict[str, bool]] = None) -> Dict[str, Any]:
    """The decision for a call refused before any rule decided (bad input, outage, budget)."""
    return summarize([Decision(action=Action.BLOCK.value, block_level=BlockLevel.TOOL_CALL.value,
                               mode='enforce', configured_action=None)], capabilities)
