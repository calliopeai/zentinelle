"""
Zentinelle API URL routing.

Agent governance and compliance endpoints:

Agent-facing REST endpoints:
- POST /api/zentinelle/v1/register
- POST /api/zentinelle/v1/deregister
- GET  /api/zentinelle/v1/config/{agent_id}
- GET  /api/zentinelle/v1/secrets
- GET  /api/zentinelle/v1/secrets/{agent_id}
- POST /api/zentinelle/v1/events
- POST /api/zentinelle/v1/heartbeat
- POST /api/zentinelle/v1/evaluate
- GET  /api/zentinelle/v1/effective-policy/{user_id}
- GET  /api/zentinelle/v1/prompts
- GET  /api/zentinelle/v1/prompts/{service}

Compliance & Content Scanning endpoints:
- POST /api/zentinelle/v1/scan
- POST /api/zentinelle/v1/scan/async
- GET  /api/zentinelle/v1/scan/{scan_id}
- GET  /api/zentinelle/v1/violations
- GET  /api/zentinelle/v1/alerts
- POST /api/zentinelle/v1/alerts/{alert_id}/acknowledge
- POST /api/zentinelle/v1/alerts/{alert_id}/resolve
- POST /api/zentinelle/v1/interaction

AI Assistant endpoints:
- POST /api/zentinelle/v1/assistant/chat

Compliance Export endpoints:
- GET /api/zentinelle/v1/export/violations.csv
- GET /api/zentinelle/v1/export/compliance-report.csv
- GET /api/zentinelle/v1/export/summary.json

SIEM & Retention endpoints:
- GET /api/zentinelle/v1/audit/export/
- GET /api/zentinelle/v1/retention/status/

Risk register endpoints:
- GET /api/zentinelle/v1/risks/trend

Note: Deployment operations and provisioner callbacks have moved to:
- /api/deployments/v1/...
"""
from django.urls import path

from zentinelle.api.views import (AcknowledgeAlertView, AlertsListView,
                                  AsyncScanView, AuditChainVerifyView,
                                  AuditExportView, ComplianceReportSummaryView,
                                  ConfigView, DeregisterView,
                                  EffectivePolicyView, EvaluateView,
                                  EventsView, ExportComplianceReportCSVView,
                                  ExportViolationsCSVView, HeartbeatView,
                                  IncidentCommentView, IncidentDetailView,
                                  IncidentListView, LogInteractionView,
                                  PolicyDiffView, PolicyHistoryListView,
                                  RegisterView, ReportCreateView,
                                  ReportDownloadView, ReportStatusView,
                                  ResolveAlertView, RetentionStatusView,
                                  RiskTrendView, ScanContentView,
                                  ScanResultView, SecretsView,
                                  SystemPromptsView, ViolationsListView)
from zentinelle.api.views.assistant import AssistantChatView
from zentinelle.api.views.assistant_providers import AssistantProvidersView
from zentinelle.api.views.llm_provider_keys import (LLMProviderKeyDeleteView,
                                                    LLMProviderKeysView)
from zentinelle.api.views.auth import LoginView, LogoutView, MeView
from zentinelle.api.views.health import HealthView, ReadyView
from zentinelle.auth.oidc import OIDCCallbackView, OIDCLoginView

app_name = 'zentinelle'

urlpatterns = [
    # Platform health (Kubernetes probes)
    path('health', HealthView.as_view(), name='health'),
    path('ready', ReadyView.as_view(), name='ready'),

    # Portal auth (session-based, httpOnly cookies)
    path('auth/login', LoginView.as_view(), name='auth-login'),
    path('auth/logout', LogoutView.as_view(), name='auth-logout'),
    path('auth/me', MeView.as_view(), name='auth-me'),
    path('auth/oidc/login', OIDCLoginView.as_view(), name='auth-oidc-login'),
    path('auth/oidc/callback', OIDCCallbackView.as_view(), name='auth-oidc-callback'),

    # AI assistant (portal, session-authenticated)
    path('assistant/chat', AssistantChatView.as_view(), name='assistant-chat'),
    path('assistant/providers', AssistantProvidersView.as_view(), name='assistant-providers'),

    # LLM provider key management (encrypted at rest, per-tenant)
    path('settings/llm-providers', LLMProviderKeysView.as_view(), name='llm-provider-keys'),
    path('settings/llm-providers/<str:provider>', LLMProviderKeyDeleteView.as_view(), name='llm-provider-key-delete'),

    # Agent-facing endpoints
    path('register', RegisterView.as_view(), name='register'),
    path('deregister', DeregisterView.as_view(), name='deregister'),
    path('config/<str:agent_id>', ConfigView.as_view(), name='config'),
    path('secrets', SecretsView.as_view(), name='secrets'),
    path('secrets/<str:agent_id>', SecretsView.as_view(), name='secrets-agent'),
    path('events', EventsView.as_view(), name='events'),
    path('heartbeat', HeartbeatView.as_view(), name='heartbeat'),
    path('evaluate', EvaluateView.as_view(), name='evaluate'),

    # Policy endpoints
    path('effective-policy', EffectivePolicyView.as_view(), name='effective-policy'),
    path('effective-policy/<str:user_id>', EffectivePolicyView.as_view(), name='effective-policy-user'),
    path('prompts', SystemPromptsView.as_view(), name='prompts'),
    path('prompts/<str:service>', SystemPromptsView.as_view(), name='prompts-service'),

    # Compliance & Content Scanning endpoints
    path('scan', ScanContentView.as_view(), name='scan'),
    path('scan/async', AsyncScanView.as_view(), name='scan-async'),
    path('scan/<uuid:scan_id>', ScanResultView.as_view(), name='scan-result'),
    path('violations', ViolationsListView.as_view(), name='violations'),
    path('alerts', AlertsListView.as_view(), name='alerts'),
    path('alerts/<uuid:alert_id>/acknowledge', AcknowledgeAlertView.as_view(), name='alert-acknowledge'),
    path('alerts/<uuid:alert_id>/resolve', ResolveAlertView.as_view(), name='alert-resolve'),
    path('interaction', LogInteractionView.as_view(), name='interaction'),

    # Compliance export endpoints
    path('export/violations.csv', ExportViolationsCSVView.as_view(), name='export-violations-csv'),
    path('export/compliance-report.csv', ExportComplianceReportCSVView.as_view(), name='export-compliance-csv'),
    path('export/summary.json', ComplianceReportSummaryView.as_view(), name='export-summary'),

    # Audit chain verification
    path('audit/verify', AuditChainVerifyView.as_view(), name='audit-verify'),

    # SIEM audit export
    path('audit/export/', AuditExportView.as_view(), name='audit-export'),

    # Retention status
    path('retention/status/', RetentionStatusView.as_view(), name='retention-status'),

    # Risk register trend
    path('risks/trend', RiskTrendView.as_view(), name='risks-trend'),

    # Policy version history & diff
    path('policies/<int:policy_id>/history/', PolicyHistoryListView.as_view(), name='policy-history'),
    path('policies/<int:policy_id>/diff/', PolicyDiffView.as_view(), name='policy-diff'),

    # Incident management
    path('incidents/', IncidentListView.as_view(), name='incident-list'),
    path('incidents/<int:incident_id>/', IncidentDetailView.as_view(), name='incident-detail'),
    path('incidents/<int:incident_id>/comments/', IncidentCommentView.as_view(), name='incident-comments'),

    # Compliance report export
    path('reports/', ReportCreateView.as_view(), name='report-create'),
    path('reports/<int:report_id>/', ReportStatusView.as_view(), name='report-status'),
    path('reports/<int:report_id>/download/', ReportDownloadView.as_view(), name='report-download'),
]
