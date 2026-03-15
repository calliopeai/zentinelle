"""
Network Policy Evaluator.
Controls outbound network access for agents (domains, IPs, general outbound).
"""
import ipaddress
from fnmatch import fnmatch
from typing import Dict, Any, Optional
from urllib.parse import urlparse

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult


class NetworkPolicyEvaluator(BasePolicyEvaluator):
    """
    Evaluates network_policy policies.

    Config schema:
    {
        "allowed_domains": ["api.openai.com", "*.anthropic.com"],
        "blocked_domains": ["*.deepseek.com"],
        "allowed_ips": ["10.0.0.0/8"],
        "blocked_ips": [],
        "allow_outbound": true,
    }

    Context required:
    - "url": str     — (optional) full URL being accessed
    - "domain": str  — (optional) domain being accessed
    - "ip": str      — (optional) IP address being accessed

    Wildcard domain matching is supported via fnmatch (e.g. "*.anthropic.com").
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

        url = context.get('url')
        domain = context.get('domain')
        ip = context.get('ip')

        # Extract domain from URL if domain not explicitly provided
        if url and not domain:
            try:
                parsed = urlparse(url)
                domain = parsed.hostname
            except Exception:
                pass

        # If no network target is in context, check allow_outbound
        if not domain and not ip:
            allow_outbound = config.get('allow_outbound', True)
            if not allow_outbound:
                return PolicyResult(
                    passed=False,
                    message="Outbound network access is disabled by policy",
                )
            return PolicyResult(passed=True)

        # Check blocked domains
        blocked_domains = config.get('blocked_domains', [])
        if domain and self._matches_domain(domain, blocked_domains):
            return PolicyResult(
                passed=False,
                message=f"Domain '{domain}' is blocked by network policy",
            )

        # Check blocked IPs
        blocked_ips = config.get('blocked_ips', [])
        if ip and self._matches_ip(ip, blocked_ips):
            return PolicyResult(
                passed=False,
                message=f"IP address '{ip}' is blocked by network policy",
            )

        # Check allowed domains (if specified, must match)
        allowed_domains = config.get('allowed_domains', [])
        if allowed_domains and domain:
            if not self._matches_domain(domain, allowed_domains):
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Domain '{domain}' is not in the allowed domains list"
                    ),
                )

        # Check allowed IPs (if specified, must match)
        allowed_ips = config.get('allowed_ips', [])
        if allowed_ips and ip:
            if not self._matches_ip(ip, allowed_ips):
                return PolicyResult(
                    passed=False,
                    message=f"IP address '{ip}' is not in the allowed IP ranges",
                )

        # Check general outbound permission
        allow_outbound = config.get('allow_outbound', True)
        if not allow_outbound:
            return PolicyResult(
                passed=False,
                message="Outbound network access is disabled by policy",
            )

        return PolicyResult(passed=True)

    def _matches_domain(self, domain: str, patterns: list) -> bool:
        """Return True if domain matches any pattern in the list (supports wildcards)."""
        domain = domain.lower()
        for pattern in patterns:
            if fnmatch(domain, pattern.lower()):
                return True
        return False

    def _matches_ip(self, ip: str, ranges: list) -> bool:
        """Return True if ip falls within any CIDR range or matches exactly."""
        try:
            target = ipaddress.ip_address(ip)
        except ValueError:
            return False

        for entry in ranges:
            try:
                if '/' in entry:
                    if target in ipaddress.ip_network(entry, strict=False):
                        return True
                else:
                    if target == ipaddress.ip_address(entry):
                        return True
            except ValueError:
                continue

        return False
