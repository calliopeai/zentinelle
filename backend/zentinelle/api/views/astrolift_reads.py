"""
What an Astrolift install reads back about its own agents (#390).

Install credential (`Authorization: Bearer sk_astroinst_...`), never a
portal session:

    GET astrolift/usage?tenant_id=&since=&deployment_id=...
        {"usage": [{deployment_id, provider, model, requests, input_tokens,
                    output_tokens, cost_usd}]}
    GET astrolift/policies?tenant_id=&deployment_id=...
        {"policies": [{id, name, policy_type, enforcement, scope_type,
                       priority, description}]}
    GET astrolift/audit?tenant_id=&since=&until=&cursor=&limit=&deployment_id=...
        {"events": [{id, timestamp, action, resource_type, resource_id,
                     resource_name, deployment_id, agent_id, ext_user_id}],
         "next_cursor": ...}

`tenant_id` must be one the install was connected for. Each read answers
only for the agents this install minted keys for in that tenant
(astrolift/agents); an agent anyone else registered is never in it.
`deployment_id`, repeatable, is what the install sent when it minted a key,
and narrows the read to those agents. Policies are the tenant's
organization-wide ones plus those scoped to one of the install's agents, its
deployment or its sub-organization. Audit records are the ones about one of
the install's agents: the agent itself, an approval or enforcement for it,
or a provider key released to it. Audit pages run oldest first; the cursor
is the last record of a full page, so each one is strictly after the one
before and the last page carries none.
"""
import base64
import binascii
import json
import uuid
from datetime import timezone as dt_timezone
from decimal import Decimal

from django.db.models import Q, Sum
from django.db.models.expressions import RawSQL
from django.utils.dateparse import parse_datetime
from rest_framework.response import Response

from zentinelle.api.views.astrolift_clusters import _InstallView
from zentinelle.models import (AgentEndpoint, AstroliftEnforcement, AuditLog,
                               Policy, UsageMetric)

AUDIT_PAGE_DEFAULT = 100
AUDIT_PAGE_MAX = 500

USAGE_METRICS = {
    UsageMetric.MetricType.AI_REQUESTS: 'requests',
    UsageMetric.MetricType.AI_INPUT_TOKENS: 'input_tokens',
    UsageMetric.MetricType.AI_OUTPUT_TOKENS: 'output_tokens',
}

# The per-call cost record_usage keeps on each of the call's rows; summed on
# its request row only, and only where it is a number.
CALL_COST = RawSQL(
    "CASE WHEN jsonb_typeof(metadata->'total_estimated_cost') = 'number' "
    "THEN (metadata->>'total_estimated_cost')::numeric END", [])


class _ReadRefused(Exception):
    def __init__(self, code, detail, status=400):
        super().__init__(detail)
        self.code, self.detail, self.status = code, detail, status


def _refused(error):
    return Response({'error': error.code, 'detail': error.detail}, status=error.status)


def _iso(value):
    return value.isoformat() if value else None


def _when(params, name, required=False):
    raw = params.get(name, '')
    if not raw:
        if required:
            raise _ReadRefused('invalid_request', f'{name} is required.')
        return None
    try:
        value = parse_datetime(raw)
    except ValueError:
        value = None
    if value is None:
        raise _ReadRefused('invalid_request', f'{name} must be an ISO 8601 date and time.')
    return value if value.tzinfo else value.replace(tzinfo=dt_timezone.utc)


class _InstallReadView(_InstallView):
    def _tenant(self):
        tenant_id = self.request.query_params.get('tenant_id', '')
        tenants = self.install.tenant_ids
        if tenant_id:
            if tenant_id not in tenants:
                raise _ReadRefused('tenant_not_in_install_scope',
                                   'This install was not connected for that tenant.', status=403)
            return tenant_id
        if len(tenants) != 1:
            raise _ReadRefused('tenant_required', 'This install serves several tenants; name the tenant_id.')
        return tenants[0]

    def _deployments(self):
        """The deployment ids asked for, or None for all of the install's agents."""
        params = self.request.query_params
        if 'deployment_id' not in params:
            return None
        named = sorted({value for value in params.getlist('deployment_id') if value})
        if not named:
            raise _ReadRefused('invalid_request', 'deployment_id must not be empty.')
        return named

    def _agents(self, tenant_id, deployments=None):
        """{pk: agent} for the agents this install minted in the tenant."""
        agents = AgentEndpoint.objects.filter(tenant_id=tenant_id, astrolift_install=self.install)
        if deployments is not None:
            agents = agents.filter(deployment_id_ext__in=deployments)
        return {agent.pk: agent for agent in agents.only(
            'id', 'agent_id', 'deployment_id_ext', 'sub_organization_id_ext')}

    def get(self, request):
        try:
            return Response(self.read(self._tenant(), self._deployments()))
        except _ReadRefused as error:
            return _refused(error)


class AstroliftUsageView(_InstallReadView):
    """Model usage and cost since `since`, per deployment, provider and model."""

    def read(self, tenant_id, deployments):
        since = _when(self.request.query_params, 'since', required=True)
        agents = self._agents(tenant_id)
        rows = UsageMetric.objects.filter(
            tenant_id=tenant_id, endpoint_id__in=list(agents), category=UsageMetric.Category.API_TOKENS,
            metric_type__in=list(USAGE_METRICS), occurred_at__gte=since)
        if deployments is not None:
            # A row carries the deployment its call was made under; an older
            # row without one is its agent's.
            unstamped = [pk for pk, agent in agents.items() if agent.deployment_id_ext in deployments]
            rows = rows.filter(Q(deployment_id_ext__in=deployments) | Q(deployment_id_ext='', endpoint_id__in=unstamped))
        totals = {}
        grouped = rows.values('endpoint_id', 'deployment_id_ext', 'ai_provider', 'ai_model', 'metric_type').annotate(
            total=Sum('value'), cost=Sum(CALL_COST))
        for row in grouped:
            deployment = row['deployment_id_ext'] or agents[row['endpoint_id']].deployment_id_ext
            entry = totals.setdefault((deployment, row['ai_provider'], row['ai_model']), {
                'requests': 0, 'input_tokens': 0, 'output_tokens': 0, 'cost_usd': Decimal('0')})
            entry[USAGE_METRICS[row['metric_type']]] += int(row['total'] or 0)
            if row['metric_type'] == UsageMetric.MetricType.AI_REQUESTS:
                entry['cost_usd'] += row['cost'] or Decimal('0')
        return {'usage': [
            {'deployment_id': deployment, 'provider': provider, 'model': model, **entry,
             'cost_usd': float(entry['cost_usd'])}
            for (deployment, provider, model), entry in sorted(totals.items())]}


class AstroliftPoliciesView(_InstallReadView):
    """The policies in effect for the install's agents in the tenant."""

    def read(self, tenant_id, deployments):
        agents = self._agents(tenant_id, deployments).values()
        scope = Q(scope_type=Policy.ScopeType.ORGANIZATION)
        scope |= Q(scope_type=Policy.ScopeType.SUB_ORGANIZATION,
                   scope_sub_organization_id_ext__in={a.sub_organization_id_ext for a in agents} - {''})
        scope |= Q(scope_type=Policy.ScopeType.DEPLOYMENT,
                   scope_deployment_id_ext__in={a.deployment_id_ext for a in agents} - {''})
        scope |= Q(scope_type=Policy.ScopeType.ENDPOINT, scope_endpoint_id__in=[a.pk for a in agents])
        policies = Policy.objects.filter(scope, tenant_id=tenant_id, enabled=True).exclude(
            enforcement=Policy.Enforcement.DISABLED).order_by('-priority', 'name', 'id')
        return {'policies': [{
            'id': str(policy.id), 'name': policy.name, 'policy_type': policy.policy_type,
            'enforcement': policy.enforcement, 'scope_type': policy.scope_type,
            'priority': policy.priority, 'description': policy.description,
        } for policy in policies]}


def _encode_cursor(record):
    raw = json.dumps([record.timestamp.isoformat(), str(record.id)]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def _decode_cursor(cursor):
    try:
        timestamp, record_id = json.loads(base64.urlsafe_b64decode(cursor + '=' * (-len(cursor) % 4)))
        when = parse_datetime(timestamp)
        record_id = uuid.UUID(record_id)
    except (AttributeError, binascii.Error, TypeError, ValueError):
        when = None
    if when is None or when.tzinfo is None:
        raise _ReadRefused('invalid_cursor', 'cursor is not one this endpoint returned.')
    return when, record_id


class AstroliftAuditView(_InstallReadView):
    """One page of the audit records about the install's agents, oldest first."""

    def read(self, tenant_id, deployments):
        params = self.request.query_params
        since, until = _when(params, 'since'), _when(params, 'until')
        try:
            limit = int(params.get('limit', AUDIT_PAGE_DEFAULT))
        except ValueError:
            raise _ReadRefused('invalid_request', 'limit must be a whole number.') from None
        limit = max(1, min(limit, AUDIT_PAGE_MAX))
        agents = self._agents(tenant_id, deployments)
        if not agents:
            return {'events': [], 'next_cursor': None}
        by_pk = {str(pk): agent for pk, agent in agents.items()}
        by_agent_id = {agent.agent_id: agent for agent in agents.values()}
        enforcements = {str(pk): by_pk[str(endpoint)] for pk, endpoint in AstroliftEnforcement.objects.filter(
            tenant_id=tenant_id, install=self.install, endpoint_id__in=list(agents)).values_list('id', 'endpoint_id')}
        about = (Q(resource_type__in=('agent_endpoint', 'endpoint'), resource_id__in=list(by_pk))
                 | Q(resource_type='agent_enforcement', resource_id__in=list(enforcements))
                 | Q(metadata__endpoint_id__in=list(by_pk))
                 | Q(metadata__agent_id__in=list(by_agent_id)))
        records = AuditLog.objects.filter(about, tenant_id=tenant_id)
        if since is not None:
            records = records.filter(timestamp__gte=since)
        if until is not None:
            records = records.filter(timestamp__lt=until)
        cursor = params.get('cursor', '')
        if cursor:
            when, record_id = _decode_cursor(cursor)
            records = records.filter(Q(timestamp__gt=when) | Q(timestamp=when, id__gt=record_id))
        page = list(records.order_by('timestamp', 'id')[:limit])
        events = []
        for record in page:
            agent = self._agent_of(record, by_pk, by_agent_id, enforcements)
            events.append({
                'id': str(record.id), 'timestamp': _iso(record.timestamp), 'action': record.action,
                'resource_type': record.resource_type, 'resource_id': record.resource_id,
                'resource_name': record.resource_name, 'deployment_id': agent.deployment_id_ext if agent else '',
                'agent_id': agent.agent_id if agent else '', 'ext_user_id': record.ext_user_id,
            })
        return {'events': events, 'next_cursor': _encode_cursor(page[-1]) if len(page) == limit else None}

    @staticmethod
    def _agent_of(record, by_pk, by_agent_id, enforcements):
        metadata = record.metadata if isinstance(record.metadata, dict) else {}
        if record.resource_type in ('agent_endpoint', 'endpoint') and record.resource_id in by_pk:
            return by_pk[record.resource_id]
        if record.resource_type == 'agent_enforcement' and record.resource_id in enforcements:
            return enforcements[record.resource_id]
        return by_pk.get(str(metadata.get('endpoint_id', ''))) or by_agent_id.get(str(metadata.get('agent_id', '')))
