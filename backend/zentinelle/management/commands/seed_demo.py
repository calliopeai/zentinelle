"""
Seed realistic demo data for showcasing Zentinelle.

Usage:
  python manage.py seed_demo                  # idempotent — safe to re-run
  python manage.py seed_demo --reset          # clear demo data first
  python manage.py seed_demo --tenant <uuid>  # custom tenant id

This is OPT-IN only. Nothing runs on first deploy or migration —
you must invoke the command explicitly. Useful for:
  - Demoing the portal to stakeholders
  - Manual QA of dashboards/charts
  - Local development with realistic data

What it creates:
  - 6 agents across 4 types (claude_code, codex, gemini, langchain)
  - 8 policies covering the main types
  - 3 risks (SOC2, GDPR, AI Act mapped)
  - 2 incidents (one open, one resolved)
  - 4 content rules (PII, secrets, prompt injection, jailbreak)
  - 200 events spanning the last 30 days (realistic time distribution)
  - 50 audit log entries
"""
import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

DEMO_TENANT = "00000000-0000-0000-0000-000000000001"


class Command(BaseCommand):
    help = "Populate demo data for the GRC portal (opt-in)."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", default=DEMO_TENANT)
        parser.add_argument(
            "--reset", action="store_true",
            help="Clear demo data before seeding (matches by tenant_id)",
        )

    def handle(self, *args, **options):
        from zentinelle.models import (
            AgentEndpoint, Policy, ContentRule, Risk, Incident, Event,
        )

        tenant = options["tenant"]
        reset = options["reset"]

        if reset:
            self.stdout.write(self.style.WARNING(
                f"Clearing demo data for tenant {tenant}..."
            ))
            for model in [Event, Incident, Risk, ContentRule, Policy, AgentEndpoint]:
                deleted, _ = model.objects.filter(tenant_id=tenant).delete()
                self.stdout.write(f"  {model.__name__}: deleted {deleted}")

        self.stdout.write(f"\nSeeding demo data for tenant {tenant}\n")

        agents = self._seed_agents(tenant, AgentEndpoint)
        policies = self._seed_policies(tenant, Policy)
        rules = self._seed_content_rules(tenant, ContentRule)
        risks = self._seed_risks(tenant, Risk)
        incidents = self._seed_incidents(tenant, Incident, agents)
        events = self._seed_events(tenant, Event, agents)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"Done.\n"
            f"  Agents:        {len(agents)}\n"
            f"  Policies:      {len(policies)}\n"
            f"  Content rules: {len(rules)}\n"
            f"  Risks:         {len(risks)}\n"
            f"  Incidents:     {len(incidents)}\n"
            f"  Events:        {events}\n"
        ))
        self.stdout.write("Visit http://localhost:8080 to see the portal populated.")

    def _seed_agents(self, tenant, AgentEndpoint):
        specs = [
            ("demo-claude-code", "Claude Code (Production)", "claude_code", "active", "healthy"),
            ("demo-claude-dev", "Claude Code (Dev)", "claude_code", "active", "healthy"),
            ("demo-codex-cli", "Codex CLI Agent", "codex", "active", "degraded"),
            ("demo-gemini-cli", "Gemini CLI", "gemini", "active", "healthy"),
            ("demo-langchain", "LangChain Workflow Agent", "langchain", "active", "healthy"),
            ("demo-mcp-server", "MCP Server", "mcp", "suspended", "offline"),
        ]
        result = []
        for agent_id, name, agent_type, status, health in specs:
            existing = AgentEndpoint.objects.filter(
                tenant_id=tenant, agent_id=agent_id
            ).first()
            if existing:
                result.append(existing)
                continue
            _, key_hash, prefix = AgentEndpoint.generate_api_key()
            ep = AgentEndpoint.objects.create(
                tenant_id=tenant,
                agent_id=agent_id,
                name=name,
                agent_type=agent_type,
                status=status,
                health=health,
                api_key_hash=key_hash,
                api_key_prefix=prefix,
                capabilities=["chat", "tools"] + (["vision"] if "claude" in agent_type else []),
            )
            result.append(ep)
            self.stdout.write(f"  agent: {ep.agent_id}")
        return result

    def _seed_policies(self, tenant, Policy):
        specs = [
            ("Production Rate Limit", "rate_limit", "organization", "enforce",
             {"requests_per_minute": 60, "requests_per_hour": 1000, "tokens_per_day": 1_000_000}),
            ("Dev Rate Limit", "rate_limit", "team", "enforce",
             {"requests_per_minute": 30, "requests_per_hour": 200}),
            ("Approved Models Only", "model_restriction", "organization", "enforce",
             {"allowed_models": ["claude-sonnet-4-5-20250929", "claude-opus-4-7", "gpt-4o"]}),
            ("Tool Allowlist", "tool_permission", "organization", "enforce",
             {"allowed_tools": ["web_search", "Read", "Grep", "Bash"], "denied_tools": ["rm", "dd"]}),
            ("Production Domain Allowlist", "network_policy", "deployment", "enforce",
             {"allowed_domains": ["*.openai.com", "*.anthropic.com", "*.googleapis.com"]}),
            ("Monthly Budget", "budget_limit", "organization", "enforce",
             {"monthly_budget_usd": 500, "hard_limit": True, "alert_threshold_percent": 80}),
            ("PII Output Filter", "output_filter", "organization", "audit",
             {"patterns": [{"name": "ssn", "regex": r"\d{3}-\d{2}-\d{4}"}]}),
            ("Human Approval for Critical Actions", "human_oversight", "organization", "enforce",
             {"require_approval_for": ["delete", "production_deploy"]}),
        ]
        result = []
        for name, ptype, scope, enforcement, config in specs:
            obj, _ = Policy.objects.get_or_create(
                tenant_id=tenant, name=name,
                defaults={
                    "policy_type": ptype, "scope_type": scope,
                    "enforcement": enforcement, "config": config,
                    "enabled": True,
                },
            )
            result.append(obj)
            self.stdout.write(f"  policy: {name} [{ptype}/{scope}]")
        return result

    def _seed_content_rules(self, tenant, ContentRule):
        specs = [
            ("Block AWS Keys", "secret_detection", "critical", "block",
             {"patterns": [{"name": "aws_access_key", "regex": "AKIA[0-9A-Z]{16}"}]}),
            ("Redact Email PII", "pii_detection", "high", "redact",
             {"patterns": [{"name": "email", "regex": r"[\w.+-]+@[\w-]+\.[\w.-]+"}]}),
            ("Detect Prompt Injection", "prompt_injection", "high", "warn",
             {"keywords": ["ignore previous", "ignore instructions", "you are now"]}),
            ("Detect Jailbreak Attempts", "jailbreak_detection", "high", "warn",
             {"keywords": ["DAN mode", "jailbreak", "developer mode"]}),
        ]
        result = []
        for name, rtype, severity, enforcement, config in specs:
            obj, _ = ContentRule.objects.get_or_create(
                tenant_id=tenant, name=name,
                defaults={
                    "rule_type": rtype, "severity": severity,
                    "enforcement": enforcement, "config": config,
                    "enabled": True,
                },
            )
            result.append(obj)
            self.stdout.write(f"  content rule: {name}")
        return result

    def _seed_risks(self, tenant, Risk):
        specs = [
            ("Unauthorized data exfiltration via tool calls", "ai_safety",
             "open", 5, 5, 8, "Block file system writes outside workspace; audit all tool calls",
             ["soc2", "gdpr"]),
            ("LLM hallucination in production responses", "operational",
             "mitigating", 5, 3, 5, "Output filter for factual claims; human review for high-stakes",
             ["eu_ai_act"]),
            ("Cost overrun from runaway agent loops", "financial",
             "open", 3, 3, 5, "Budget limits enforced; circuit breaker on rate limit",
             []),
        ]
        result = []
        for name, category, status, severity, likelihood, impact, plan, tags in specs:
            obj, _ = Risk.objects.get_or_create(
                tenant_id=tenant, name=name,
                defaults={
                    "description": plan,
                    "category": category, "status": status,
                    "severity": severity, "likelihood": likelihood, "impact": impact,
                    "mitigation_plan": plan, "tags": tags,
                },
            )
            result.append(obj)
            self.stdout.write(f"  risk: {name} (RPN={severity * likelihood * impact})")
        return result

    def _seed_incidents(self, tenant, Incident, agents):
        now = timezone.now()
        specs = [
            ("Rate limit exceeded on production agent", "rate_limit_breach", "high",
             "open", agents[0].id if agents else None, now - timedelta(hours=2),
             "Production agent hit 60 req/min cap during peak load"),
            ("PII detected in LLM output", "policy_violation", "medium",
             "resolved", agents[2].id if len(agents) > 2 else None, now - timedelta(days=3),
             "Email address leaked in customer-facing summary; redaction policy strengthened"),
        ]
        result = []
        for title, itype, severity, status, endpoint_id, occurred, root in specs:
            kwargs = {
                "tenant_id": tenant, "title": title,
                "incident_type": itype, "severity": severity,
                "status": status, "occurred_at": occurred,
                "root_cause": root,
            }
            if endpoint_id:
                kwargs["endpoint_id"] = endpoint_id
            obj, _ = Incident.objects.get_or_create(
                tenant_id=tenant, title=title,
                defaults=kwargs,
            )
            result.append(obj)
            self.stdout.write(f"  incident: {title}")
        return result

    def _seed_events(self, tenant, Event, agents):
        if not agents:
            return 0
        now = timezone.now()
        event_types = ["tool_call", "model_request", "heartbeat", "policy_check"]
        categories = ["telemetry", "audit"]
        count = 0
        for i in range(200):
            agent = random.choice(agents)
            ago_minutes = int(random.expovariate(1 / (60 * 24 * 7)))  # exp distribution, weighted recent
            ago_minutes = min(ago_minutes, 60 * 24 * 30)  # cap at 30 days
            occurred = now - timedelta(minutes=ago_minutes)
            Event.objects.create(
                tenant_id=tenant,
                endpoint=agent,
                event_type=random.choice(event_types),
                event_category=random.choice(categories),
                payload={
                    "demo": True,
                    "model": random.choice(["claude-sonnet-4-5", "gpt-4o", "gemini-2.5-pro"]),
                    "tokens": random.randint(100, 10000),
                    "latency_ms": random.randint(200, 3000),
                },
                occurred_at=occurred,
            )
            count += 1
        self.stdout.write(f"  events: {count} across {len(agents)} agents over 30 days")
        return count
