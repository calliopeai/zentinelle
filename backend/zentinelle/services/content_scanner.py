"""
Content Scanning Service.

Provides configurable content scanning for:
- Secret/credential detection
- PII/PHI detection
- Custom pattern matching
- Prompt injection detection
- Jailbreak attempt detection
- Cost/usage threshold monitoring

Supports both real-time (inline) and async (background) scanning modes.
"""
import re
import hashlib
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import timedelta

from django.utils import timezone
from django.db.models import Q

from zentinelle.models import (
    ContentRule,
    ContentScan,
    ContentViolation,
    ComplianceAlert,
    AgentEndpoint,
)

logger = logging.getLogger(__name__)


@dataclass
class DetectionResult:
    """Result of a single detection check."""
    detected: bool
    rule_type: str
    severity: str
    category: str = ''
    matched_text: str = ''
    matched_pattern: str = ''
    match_start: int = None
    match_end: int = None
    confidence: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ScanResult:
    """Complete result of scanning content."""
    has_violations: bool
    violations: List[DetectionResult]
    action: str  # 'allow', 'block', 'warn', 'redact'
    redacted_content: Optional[str] = None
    scan_duration_ms: int = 0
    max_severity: str = None


class ContentScanner:
    """
    Main content scanning service.

    Usage:
        scanner = ContentScanner(organization)
        result = scanner.scan(content, user_id, endpoint)

        if result.action == 'block':
            raise ContentBlockedError(result.violations)
        elif result.action == 'redact':
            content = result.redacted_content
    """

    def __init__(self, organization):
        self.organization = organization
        self._rules_cache = None
        self._rules_cache_time = None
        self._cache_ttl = timedelta(minutes=5)

    def get_effective_rules(
        self,
        user_id: Optional[str] = None,
        endpoint: Optional[AgentEndpoint] = None,
        scan_mode: str = None,
    ) -> List[ContentRule]:
        """
        Get effective content rules for this context.

        Rules are resolved with inheritance:
        Organization → SubOrganization → Deployment → Endpoint → User
        """
        # Check cache
        if self._rules_cache and self._rules_cache_time:
            if timezone.now() - self._rules_cache_time < self._cache_ttl:
                rules = self._rules_cache
                if scan_mode:
                    rules = [r for r in rules if r.scan_mode in [scan_mode, ContentRule.ScanMode.BOTH]]
                return rules

        # Build query
        base_filter = {
            'organization': self.organization,
            'enabled': True,
        }

        # Get all potentially applicable rules
        rules = list(ContentRule.objects.filter(**base_filter).order_by('-priority'))

        # Filter by scope (more specific scopes override broader ones)
        effective_rules = {}

        for rule in rules:
            # Check if rule applies to this context
            if not self._rule_applies(rule, user_id, endpoint):
                continue

            # Use rule_type as key - more specific scope wins
            key = rule.rule_type
            existing = effective_rules.get(key)

            if existing is None:
                effective_rules[key] = rule
            elif self._is_more_specific(rule, existing):
                effective_rules[key] = rule

        result = list(effective_rules.values())

        # Cache results
        self._rules_cache = result
        self._rules_cache_time = timezone.now()

        # Filter by scan mode if specified
        if scan_mode:
            result = [r for r in result if r.scan_mode in [scan_mode, ContentRule.ScanMode.BOTH]]

        return result

    def _rule_applies(
        self,
        rule: ContentRule,
        user_id: Optional[str],
        endpoint: Optional[AgentEndpoint]
    ) -> bool:
        """Check if a rule applies to the given context."""
        if rule.scope_type == ContentRule.ScopeType.ORGANIZATION:
            return True

        if rule.scope_type == ContentRule.ScopeType.USER:
            if user_id and rule.scope_user:
                return rule.scope_user.username == user_id
            return False

        if rule.scope_type == ContentRule.ScopeType.ENDPOINT:
            if endpoint and rule.scope_endpoint:
                return rule.scope_endpoint_id == endpoint.id
            return False

        if rule.scope_type == ContentRule.ScopeType.DEPLOYMENT:
            if endpoint and endpoint.deployment and rule.scope_deployment:
                return rule.scope_deployment_id == endpoint.deployment_id
            return False

        if rule.scope_type == ContentRule.ScopeType.SUB_ORGANIZATION:
            if not rule.scope_sub_organization:
                return False
            if not user_id:
                return False

            # Look up user's sub-org membership
            from organization.models import OrganizationMember
            from django.contrib.auth import get_user_model
            User = get_user_model()

            try:
                user = User.objects.get(username=user_id)
                membership = OrganizationMember.objects.filter(
                    member=user,
                    organization=self.organization,
                    is_active=True,
                    status=OrganizationMember.Status.ACTIVE,
                ).first()

                if not membership or not membership.sub_organization:
                    return False

                # Check if user's sub-org is the target or a descendant
                target_sub_org = rule.scope_sub_organization
                user_sub_org = membership.sub_organization

                # Direct match
                if user_sub_org.id == target_sub_org.id:
                    return True

                # Check if user's sub-org is a descendant of target
                current = user_sub_org.parent
                while current:
                    if current.id == target_sub_org.id:
                        return True
                    current = current.parent

                return False
            except User.DoesNotExist:
                return False

        return True

    def _is_more_specific(self, rule1: ContentRule, rule2: ContentRule) -> bool:
        """Check if rule1 is more specific than rule2."""
        scope_priority = {
            ContentRule.ScopeType.USER: 5,
            ContentRule.ScopeType.ENDPOINT: 4,
            ContentRule.ScopeType.DEPLOYMENT: 3,
            ContentRule.ScopeType.SUB_ORGANIZATION: 2,
            ContentRule.ScopeType.ORGANIZATION: 1,
        }
        p1 = scope_priority.get(rule1.scope_type, 0)
        p2 = scope_priority.get(rule2.scope_type, 0)

        if p1 != p2:
            return p1 > p2

        # Same scope, use priority
        return rule1.priority > rule2.priority

    def scan(
        self,
        content: str,
        user_id: str,
        endpoint: Optional[AgentEndpoint] = None,
        content_type: str = ContentScan.ContentType.USER_INPUT,
        scan_mode: str = ContentRule.ScanMode.REALTIME,
        session_id: str = '',
        request_id: str = '',
        ip_address: str = None,
        token_count: int = None,
        estimated_cost: float = None,
    ) -> Tuple[ScanResult, ContentScan]:
        """
        Scan content against all applicable rules.

        Returns:
            Tuple of (ScanResult, ContentScan record)
        """
        import time
        start_time = time.time()

        # Get applicable rules
        rules = self.get_effective_rules(user_id, endpoint, scan_mode)

        # Create scan record
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        scan = ContentScan.objects.create(
            organization=self.organization,
            endpoint=endpoint,
            deployment=endpoint.deployment if endpoint else None,
            user_identifier=user_id,
            content_type=content_type,
            content_hash=content_hash,
            content_length=len(content),
            content_preview=content[:500],  # First 500 chars
            scan_mode=scan_mode,
            status=ContentScan.ScanStatus.SCANNING,
            session_id=session_id,
            request_id=request_id,
            ip_address=ip_address,
            token_count=token_count,
            estimated_cost_usd=estimated_cost,
        )

        # Run detections
        violations = []
        for rule in rules:
            detections = self._run_detector(rule, content)
            for detection in detections:
                if detection.detected:
                    violations.append(detection)

                    # Create violation record
                    ContentViolation.objects.create(
                        scan=scan,
                        rule=rule,
                        rule_type=detection.rule_type,
                        severity=detection.severity,
                        enforcement=rule.enforcement,
                        matched_pattern=detection.matched_pattern,
                        matched_text=self._redact_sensitive(detection.matched_text),
                        match_start=detection.match_start,
                        match_end=detection.match_end,
                        confidence=detection.confidence,
                        category=detection.category,
                        metadata=detection.metadata,
                    )

        # Determine action and max severity
        action = 'allow'
        max_severity = None
        severity_order = ['info', 'low', 'medium', 'high', 'critical']

        for v in violations:
            # Find the rule that triggered this violation
            rule = next((r for r in rules if r.rule_type == v.rule_type), None)
            if rule:
                if rule.enforcement == ContentRule.Enforcement.BLOCK:
                    action = 'block'
                elif rule.enforcement == ContentRule.Enforcement.WARN and action != 'block':
                    action = 'warn'
                elif rule.enforcement == ContentRule.Enforcement.REDACT and action not in ['block', 'warn']:
                    action = 'redact'

            # Track max severity
            if max_severity is None:
                max_severity = v.severity
            elif severity_order.index(v.severity) > severity_order.index(max_severity):
                max_severity = v.severity

        # Handle redaction
        redacted_content = None
        if action == 'redact':
            redacted_content = self._redact_content(content, violations)

        # Calculate duration
        duration_ms = int((time.time() - start_time) * 1000)

        # Update scan record
        scan.status = ContentScan.ScanStatus.COMPLETED
        scan.scanned_at = timezone.now()
        scan.scan_duration_ms = duration_ms
        scan.has_violations = len(violations) > 0
        scan.violation_count = len(violations)
        scan.max_severity = max_severity
        scan.action_taken = action if action != 'allow' else None
        scan.was_blocked = action == 'block'
        scan.was_redacted = action == 'redact'
        if redacted_content:
            scan.redacted_content = redacted_content
        scan.save()

        # Create alerts for critical violations
        if max_severity in ['high', 'critical']:
            self._create_alert(scan, violations)

        result = ScanResult(
            has_violations=len(violations) > 0,
            violations=violations,
            action=action,
            redacted_content=redacted_content,
            scan_duration_ms=duration_ms,
            max_severity=max_severity,
        )

        return result, scan

    def _run_detector(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Run the appropriate detector for a rule type."""
        detectors = {
            ContentRule.RuleType.SECRET_DETECTION: self._detect_secrets,
            ContentRule.RuleType.PII_DETECTION: self._detect_pii,
            ContentRule.RuleType.PHI_DETECTION: self._detect_phi,
            ContentRule.RuleType.CUSTOM_PATTERN: self._detect_custom_pattern,
            ContentRule.RuleType.KEYWORD_BLOCK: self._detect_keywords,
            ContentRule.RuleType.PROMPT_INJECTION: self._detect_prompt_injection,
            ContentRule.RuleType.JAILBREAK_ATTEMPT: self._detect_jailbreak,
            ContentRule.RuleType.PROFANITY_FILTER: self._detect_profanity,
            ContentRule.RuleType.OFF_TOPIC: self._detect_off_topic,
            ContentRule.RuleType.COST_THRESHOLD: self._check_cost_threshold,
            ContentRule.RuleType.TOKEN_LIMIT: self._check_token_limit,
        }

        detector = detectors.get(rule.rule_type)
        if detector:
            return detector(rule, content)
        return []

    # =========================================================================
    # Secret Detection
    # =========================================================================

    SECRET_PATTERNS = {
        'aws_access_key': (r'AKIA[0-9A-Z]{16}', 'AWS Access Key'),
        'aws_secret_key': (r'[A-Za-z0-9/+=]{40}', 'AWS Secret Key'),
        'github_token': (r'gh[pousr]_[A-Za-z0-9_]{36,}', 'GitHub Token'),
        'github_pat': (r'github_pat_[A-Za-z0-9_]{22,}', 'GitHub PAT'),
        'slack_token': (r'xox[baprs]-[0-9a-zA-Z]{10,}', 'Slack Token'),
        'stripe_key': (r'sk_live_[0-9a-zA-Z]{24,}', 'Stripe Secret Key'),
        'stripe_test': (r'sk_test_[0-9a-zA-Z]{24,}', 'Stripe Test Key'),
        'openai_key': (r'sk-[A-Za-z0-9]{48,}', 'OpenAI API Key'),
        'anthropic_key': (r'sk-ant-[A-Za-z0-9-]{40,}', 'Anthropic API Key'),
        'gcp_api_key': (r'AIza[0-9A-Za-z-_]{35}', 'GCP API Key'),
        'azure_key': (r'[A-Za-z0-9+/]{86}==', 'Azure Key'),
        'private_key': (r'-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----', 'Private Key'),
        'jwt_token': (r'eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*', 'JWT Token'),
        'basic_auth': (r'[Aa]uthorization:\s*[Bb]asic\s+[A-Za-z0-9+/=]+', 'Basic Auth Header'),
        'bearer_token': (r'[Bb]earer\s+[A-Za-z0-9-_.]+', 'Bearer Token'),
        'password_field': (r'["\']?password["\']?\s*[=:]\s*["\'][^"\']+["\']', 'Password in Code'),
        'connection_string': (r'(mongodb|postgresql|mysql|redis):\/\/[^\s"\']+', 'Connection String'),
        'api_key_generic': (r'["\']?api[_-]?key["\']?\s*[=:]\s*["\'][A-Za-z0-9-_]{16,}["\']', 'API Key'),
    }

    def _detect_secrets(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Detect secrets and credentials in content."""
        results = []
        config = rule.config or {}

        # Determine which patterns to use
        patterns_to_check = {}

        if config.get('detect_aws_keys', True):
            patterns_to_check['aws_access_key'] = self.SECRET_PATTERNS['aws_access_key']
            patterns_to_check['aws_secret_key'] = self.SECRET_PATTERNS['aws_secret_key']

        if config.get('detect_api_keys', True):
            for key in ['openai_key', 'anthropic_key', 'gcp_api_key', 'api_key_generic',
                        'github_token', 'github_pat', 'slack_token', 'stripe_key', 'stripe_test']:
                if key in self.SECRET_PATTERNS:
                    patterns_to_check[key] = self.SECRET_PATTERNS[key]

        if config.get('detect_tokens', True):
            patterns_to_check['jwt_token'] = self.SECRET_PATTERNS['jwt_token']
            patterns_to_check['bearer_token'] = self.SECRET_PATTERNS['bearer_token']
            patterns_to_check['basic_auth'] = self.SECRET_PATTERNS['basic_auth']

        if config.get('detect_private_keys', True):
            patterns_to_check['private_key'] = self.SECRET_PATTERNS['private_key']

        if config.get('detect_passwords', True):
            patterns_to_check['password_field'] = self.SECRET_PATTERNS['password_field']

        if config.get('detect_connection_strings', True):
            patterns_to_check['connection_string'] = self.SECRET_PATTERNS['connection_string']

        # Add custom patterns
        for custom in config.get('custom_patterns', []):
            patterns_to_check[f'custom_{len(patterns_to_check)}'] = (custom, 'Custom Pattern')

        # Run detection
        for pattern_name, (pattern, description) in patterns_to_check.items():
            try:
                for match in re.finditer(pattern, content, re.IGNORECASE):
                    results.append(DetectionResult(
                        detected=True,
                        rule_type=ContentRule.RuleType.SECRET_DETECTION,
                        severity=rule.severity,
                        category=pattern_name,
                        matched_text=match.group(),
                        matched_pattern=pattern,
                        match_start=match.start(),
                        match_end=match.end(),
                        confidence=0.95,
                        metadata={'description': description},
                    ))
            except re.error as e:
                logger.warning(f"Invalid regex pattern {pattern}: {e}")

        return results

    # =========================================================================
    # PII Detection
    # =========================================================================

    PII_PATTERNS = {
        'email': (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', 'Email Address'),
        'phone_us': (r'\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', 'US Phone Number'),
        'phone_intl': (r'\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}', 'International Phone'),
        'ssn': (r'\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b', 'Social Security Number'),
        'credit_card': (r'\b(?:\d{4}[-.\s]?){3}\d{4}\b', 'Credit Card Number'),
        'credit_card_amex': (r'\b3[47]\d{2}[-.\s]?\d{6}[-.\s]?\d{5}\b', 'Amex Card'),
        'dob': (r'\b(0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])[-/](19|20)\d{2}\b', 'Date of Birth'),
        'ip_address': (r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', 'IP Address'),
        'passport': (r'\b[A-Z]{1,2}\d{6,9}\b', 'Passport Number'),
        'drivers_license': (r'\b[A-Z]\d{7,8}\b', 'Drivers License'),
        'zip_code': (r'\b\d{5}(-\d{4})?\b', 'ZIP Code'),
    }

    def _detect_pii(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Detect PII in content."""
        results = []
        config = rule.config or {}

        patterns_to_check = {}

        if config.get('detect_emails', True):
            patterns_to_check['email'] = self.PII_PATTERNS['email']

        if config.get('detect_phones', True):
            patterns_to_check['phone_us'] = self.PII_PATTERNS['phone_us']
            patterns_to_check['phone_intl'] = self.PII_PATTERNS['phone_intl']

        if config.get('detect_ssn', True):
            patterns_to_check['ssn'] = self.PII_PATTERNS['ssn']

        if config.get('detect_credit_cards', True):
            patterns_to_check['credit_card'] = self.PII_PATTERNS['credit_card']
            patterns_to_check['credit_card_amex'] = self.PII_PATTERNS['credit_card_amex']

        if config.get('detect_dob', True):
            patterns_to_check['dob'] = self.PII_PATTERNS['dob']

        if config.get('detect_passport', True):
            patterns_to_check['passport'] = self.PII_PATTERNS['passport']

        for pattern_name, (pattern, description) in patterns_to_check.items():
            try:
                for match in re.finditer(pattern, content):
                    # Additional validation for some patterns
                    if pattern_name == 'credit_card' and not self._luhn_check(match.group()):
                        continue
                    if pattern_name == 'ssn' and not self._validate_ssn(match.group()):
                        continue

                    results.append(DetectionResult(
                        detected=True,
                        rule_type=ContentRule.RuleType.PII_DETECTION,
                        severity=rule.severity,
                        category=pattern_name,
                        matched_text=match.group(),
                        matched_pattern=pattern,
                        match_start=match.start(),
                        match_end=match.end(),
                        confidence=0.9,
                        metadata={'description': description},
                    ))
            except re.error as e:
                logger.warning(f"Invalid regex pattern {pattern}: {e}")

        return results

    def _luhn_check(self, card_number: str) -> bool:
        """Validate credit card number using Luhn algorithm."""
        digits = [int(d) for d in re.sub(r'[-.\s]', '', card_number) if d.isdigit()]
        if len(digits) < 13 or len(digits) > 19:
            return False

        total = 0
        for i, digit in enumerate(reversed(digits)):
            if i % 2 == 1:
                digit *= 2
                if digit > 9:
                    digit -= 9
            total += digit
        return total % 10 == 0

    def _validate_ssn(self, ssn: str) -> bool:
        """Basic SSN validation."""
        digits = re.sub(r'[-.\s]', '', ssn)
        if len(digits) != 9:
            return False
        # Area number cannot be 000, 666, or 900-999
        area = int(digits[:3])
        if area == 0 or area == 666 or area >= 900:
            return False
        # Group number cannot be 00
        if digits[3:5] == '00':
            return False
        # Serial number cannot be 0000
        if digits[5:] == '0000':
            return False
        return True

    # =========================================================================
    # PHI Detection
    # =========================================================================

    def _detect_phi(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Detect Protected Health Information."""
        results = []
        config = rule.config or {}

        # Medical terminology patterns
        medical_patterns = {
            'diagnosis': r'\b(diagnosed with|diagnosis:?|dx:?)\s+[A-Za-z\s]+',
            'medication': r'\b(prescribed|taking|medication:?|rx:?)\s+[A-Za-z\s]+\s*\d*\s*(mg|ml)?',
            'medical_record': r'\b(MRN|medical record|patient id):?\s*[A-Za-z0-9-]+',
            'insurance_id': r'\b(insurance id|member id|policy):?\s*[A-Za-z0-9-]+',
        }

        if config.get('detect_diagnoses', True):
            for match in re.finditer(medical_patterns['diagnosis'], content, re.IGNORECASE):
                results.append(DetectionResult(
                    detected=True,
                    rule_type=ContentRule.RuleType.PHI_DETECTION,
                    severity=rule.severity,
                    category='diagnosis',
                    matched_text=match.group(),
                    matched_pattern=medical_patterns['diagnosis'],
                    match_start=match.start(),
                    match_end=match.end(),
                ))

        if config.get('detect_medications', True):
            for match in re.finditer(medical_patterns['medication'], content, re.IGNORECASE):
                results.append(DetectionResult(
                    detected=True,
                    rule_type=ContentRule.RuleType.PHI_DETECTION,
                    severity=rule.severity,
                    category='medication',
                    matched_text=match.group(),
                    matched_pattern=medical_patterns['medication'],
                    match_start=match.start(),
                    match_end=match.end(),
                ))

        return results

    # =========================================================================
    # Custom Pattern Detection
    # =========================================================================

    def _detect_custom_pattern(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Detect custom regex patterns."""
        results = []
        config = rule.config or {}

        patterns = config.get('patterns', [])
        case_sensitive = config.get('case_sensitive', False)
        flags = 0 if case_sensitive else re.IGNORECASE

        for pattern in patterns:
            try:
                for match in re.finditer(pattern, content, flags):
                    results.append(DetectionResult(
                        detected=True,
                        rule_type=ContentRule.RuleType.CUSTOM_PATTERN,
                        severity=rule.severity,
                        category='custom',
                        matched_text=match.group(),
                        matched_pattern=pattern,
                        match_start=match.start(),
                        match_end=match.end(),
                    ))
            except re.error as e:
                logger.warning(f"Invalid custom pattern {pattern}: {e}")

        return results

    # =========================================================================
    # Keyword Blocklist
    # =========================================================================

    def _detect_keywords(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Detect blocked keywords."""
        results = []
        config = rule.config or {}

        keywords = config.get('keywords', [])
        phrases = config.get('phrases', [])
        case_sensitive = config.get('case_sensitive', False)

        check_content = content if case_sensitive else content.lower()

        for keyword in keywords:
            check_keyword = keyword if case_sensitive else keyword.lower()
            # Use word boundaries for keywords
            pattern = r'\b' + re.escape(check_keyword) + r'\b'
            for match in re.finditer(pattern, check_content):
                results.append(DetectionResult(
                    detected=True,
                    rule_type=ContentRule.RuleType.KEYWORD_BLOCK,
                    severity=rule.severity,
                    category='keyword',
                    matched_text=keyword,
                    matched_pattern=pattern,
                    match_start=match.start(),
                    match_end=match.end(),
                ))

        for phrase in phrases:
            check_phrase = phrase if case_sensitive else phrase.lower()
            if check_phrase in check_content:
                start = check_content.find(check_phrase)
                results.append(DetectionResult(
                    detected=True,
                    rule_type=ContentRule.RuleType.KEYWORD_BLOCK,
                    severity=rule.severity,
                    category='phrase',
                    matched_text=phrase,
                    match_start=start,
                    match_end=start + len(phrase),
                ))

        return results

    # =========================================================================
    # Prompt Injection Detection
    # =========================================================================

    INJECTION_PATTERNS = [
        # Ignore previous instructions
        r'ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)',
        r'disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)',
        r'forget\s+(everything|all)\s+(you\s+)?(know|were told|learned)',

        # Role switching
        r'you\s+are\s+(now|no longer)\s+(a|an|the)\s+',
        r'pretend\s+(to be|you are)\s+',
        r'act\s+as\s+(if\s+)?(you are|you\'re)\s+',
        r'roleplay\s+as\s+',
        r'from\s+now\s+on,?\s+(you\s+)?(are|will|should)',

        # System prompt extraction
        r'(show|reveal|tell|display|print|output)\s+(me\s+)?(your|the)\s+(system\s+)?prompt',
        r'what\s+(is|are)\s+your\s+(instructions?|rules?|guidelines?|prompt)',
        r'repeat\s+(your\s+)?initial\s+(instructions?|prompt)',

        # Developer mode / DAN
        r'(enable|activate|enter)\s+(developer|dev|jailbreak|dan)\s+mode',
        r'\bDAN\b',
        r'do\s+anything\s+now',

        # Encoding attacks
        r'base64\s*:\s*[A-Za-z0-9+/=]+',
        r'decode\s+(this|the following)\s*:',
    ]

    def _detect_prompt_injection(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Detect prompt injection attempts."""
        results = []
        config = rule.config or {}

        patterns_to_check = self.INJECTION_PATTERNS.copy()

        # Add custom signatures
        patterns_to_check.extend(config.get('custom_signatures', []))

        sensitivity = config.get('sensitivity', 'medium')

        for pattern in patterns_to_check:
            try:
                for match in re.finditer(pattern, content, re.IGNORECASE):
                    confidence = 0.8 if sensitivity == 'low' else 0.9 if sensitivity == 'medium' else 0.95

                    results.append(DetectionResult(
                        detected=True,
                        rule_type=ContentRule.RuleType.PROMPT_INJECTION,
                        severity=rule.severity,
                        category='prompt_injection',
                        matched_text=match.group(),
                        matched_pattern=pattern,
                        match_start=match.start(),
                        match_end=match.end(),
                        confidence=confidence,
                    ))
            except re.error as e:
                logger.warning(f"Invalid injection pattern {pattern}: {e}")

        return results

    # =========================================================================
    # Jailbreak Detection
    # =========================================================================

    JAILBREAK_PATTERNS = [
        # DAN and variations
        r'\bDAN\b',
        r'do\s+anything\s+now',
        r'jailbreak(ed)?',
        r'bypass\s+(safety|content|filter|restriction)',

        # Hypothetical framing
        r'hypothetically\s+(speaking\s+)?(if|what if)',
        r'in\s+(a\s+)?fiction(al)?\s+(world|scenario|story)',
        r'imagine\s+(a\s+)?(world|scenario)\s+where',
        r'for\s+(educational|research|academic)\s+purposes',
        r'purely\s+(theoretical|hypothetical)',

        # Roleplay attacks
        r'you\s+are\s+(an?\s+)?(evil|uncensored|unrestricted|unfiltered)',
        r'pretend\s+there\s+are\s+no\s+(rules|restrictions|limits)',
        r'without\s+(any\s+)?(restrictions|limitations|filters)',
    ]

    def _detect_jailbreak(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Detect jailbreak attempts."""
        results = []
        config = rule.config or {}

        patterns_to_check = self.JAILBREAK_PATTERNS.copy()
        patterns_to_check.extend(config.get('custom_signatures', []))

        for pattern in patterns_to_check:
            try:
                for match in re.finditer(pattern, content, re.IGNORECASE):
                    results.append(DetectionResult(
                        detected=True,
                        rule_type=ContentRule.RuleType.JAILBREAK_ATTEMPT,
                        severity=rule.severity,
                        category='jailbreak',
                        matched_text=match.group(),
                        matched_pattern=pattern,
                        match_start=match.start(),
                        match_end=match.end(),
                        confidence=0.85,
                    ))
            except re.error as e:
                logger.warning(f"Invalid jailbreak pattern {pattern}: {e}")

        return results

    # =========================================================================
    # Profanity Filter
    # =========================================================================

    def _detect_profanity(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Detect profanity (placeholder - would use a proper library)."""
        # In production, use a library like better_profanity or profanity_check
        results = []
        # Placeholder implementation
        return results

    # =========================================================================
    # Off-Topic Detection
    # =========================================================================

    def _detect_off_topic(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Detect off-topic/personal use."""
        results = []
        config = rule.config or {}

        personal_keywords = config.get('personal_keywords', [
            'personal', 'private', 'dating', 'relationship', 'game',
            'entertainment', 'movie', 'music', 'joke', 'funny',
        ])

        blocked_topics = config.get('blocked_topics', [])

        content_lower = content.lower()

        for keyword in personal_keywords + blocked_topics:
            if keyword.lower() in content_lower:
                results.append(DetectionResult(
                    detected=True,
                    rule_type=ContentRule.RuleType.OFF_TOPIC,
                    severity=rule.severity,
                    category='personal_use' if keyword in personal_keywords else 'blocked_topic',
                    matched_text=keyword,
                    confidence=0.7,
                ))

        return results

    # =========================================================================
    # Cost/Usage Threshold Checks
    # =========================================================================

    def _check_cost_threshold(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Check cost thresholds (requires usage context)."""
        # This would be implemented with actual usage tracking
        return []

    def _check_token_limit(self, rule: ContentRule, content: str) -> List[DetectionResult]:
        """Check token limits."""
        results = []
        config = rule.config or {}

        max_input_tokens = config.get('max_input_tokens')
        if max_input_tokens:
            # Rough estimate: ~4 chars per token
            estimated_tokens = len(content) // 4
            if estimated_tokens > max_input_tokens:
                results.append(DetectionResult(
                    detected=True,
                    rule_type=ContentRule.RuleType.TOKEN_LIMIT,
                    severity=rule.severity,
                    category='input_token_limit',
                    metadata={
                        'estimated_tokens': estimated_tokens,
                        'limit': max_input_tokens,
                    },
                ))

        return results

    # =========================================================================
    # Helpers
    # =========================================================================

    def _redact_sensitive(self, text: str, max_length: int = 50) -> str:
        """Redact sensitive matched text for storage."""
        if len(text) <= 8:
            return '*' * len(text)
        return text[:4] + '*' * (min(len(text), max_length) - 8) + text[-4:]

    def _redact_content(self, content: str, violations: List[DetectionResult]) -> str:
        """Redact all violations from content."""
        redacted = content

        # Sort by position descending to avoid offset issues
        sorted_violations = sorted(
            [v for v in violations if v.match_start is not None],
            key=lambda v: v.match_start,
            reverse=True
        )

        for v in sorted_violations:
            if v.match_start is not None and v.match_end is not None:
                redaction = '[REDACTED]'
                redacted = redacted[:v.match_start] + redaction + redacted[v.match_end:]

        return redacted

    def _create_alert(self, scan: ContentScan, violations: List[DetectionResult]):
        """Create a compliance alert for serious violations."""
        max_severity = max(violations, key=lambda v: ['info', 'low', 'medium', 'high', 'critical'].index(v.severity))

        ComplianceAlert.objects.create(
            organization=self.organization,
            alert_type=ComplianceAlert.AlertType.SINGLE_VIOLATION if len(violations) == 1 else ComplianceAlert.AlertType.REPEATED_VIOLATIONS,
            severity=max_severity.severity,
            title=f"Content violation detected: {max_severity.rule_type}",
            description=f"A {max_severity.severity} severity violation was detected for user {scan.user_identifier}",
            user_identifier=scan.user_identifier,
            endpoint=scan.endpoint,
            violation_count=len(violations),
            first_violation_at=scan.created_at,
            last_violation_at=scan.created_at,
        )
