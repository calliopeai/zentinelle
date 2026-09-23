"""The one ordered action set shared by policies and content rules (#396).

A rule names what happens when it matches. The set is ordered from least to
most disruptive, which is what lets escalation only go up, lets a policy's
mode cap it, and lets the strongest decision across several matched rules win.
"""
from django.db import models


class Action(models.TextChoices):
    LOG = 'log', 'Log (record only)'
    ALERT = 'alert', 'Alert (record and notify owners)'
    WARN = 'warn', 'Warn (allow with a visible warning)'
    STEER = 'steer', 'Steer (inject a correcting message)'
    REDACT = 'redact', 'Redact (remove the matched content)'
    REQUIRE_APPROVAL = 'require_approval', 'Require approval'
    BLOCK = 'block', 'Block'


class BlockLevel(models.TextChoices):
    TOOL_CALL = 'tool_call', 'Block the tool call'
    TURN = 'turn', 'Cancel the turn'
    REVOKE_KEY = 'revoke_key', 'Revoke the gateway key'
    STOP = 'stop', 'Stop the task or box'
    QUARANTINE = 'quarantine', 'Quarantine the agent or spec'


ACTION_ORDER = [choice.value for choice in Action]
BLOCK_LEVEL_ORDER = [choice.value for choice in BlockLevel]
SEVERITY_ORDER = ['info', 'low', 'medium', 'high', 'critical']

# Content rules stored these before #396. Anything else they could hold had
# no effect in the scanner, which is what `log` does.
CONTENT_RULE_ACTION_FROM_ENFORCEMENT = {
    'block': Action.BLOCK,
    'warn': Action.WARN,
    'log_only': Action.LOG,
    'redact': Action.REDACT,
    'require_approval': Action.REQUIRE_APPROVAL,
}
# The nearest legacy value for each action, for records and API fields that
# still speak the old vocabulary.
LEGACY_ENFORCEMENT_FOR_ACTION = {
    Action.LOG: 'log_only',
    Action.ALERT: 'log_only',
    Action.WARN: 'warn',
    Action.STEER: 'warn',
    Action.REDACT: 'redact',
    Action.REQUIRE_APPROVAL: 'require_approval',
    Action.BLOCK: 'block',
}
