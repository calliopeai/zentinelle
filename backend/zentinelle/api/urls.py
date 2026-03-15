"""
Zentinelle API URL routing.

Agent governance and compliance endpoints:

Agent-facing REST endpoints:
- POST /api/zentinelle/v1/register
- POST /api/zentinelle/v1/deregister
- GET  /api/zentinelle/v1/config/{agent_id}
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

Compliance Export endpoints:
- GET /api/zentinelle/v1/export/violations.csv
- GET /api/zentinelle/v1/export/compliance-report.csv
- GET /api/zentinelle/v1/export/summary.json

Note: Deployment operations and provisioner callbacks have moved to:
- /api/deployments/v1/...
"""
from django.urls import path
from zentinelle.api.views import (
    RegisterView,
    ConfigView,
    EventsView,
    HeartbeatView,
    EvaluateView,
    DeregisterView,
    EffectivePolicyView,
    SystemPromptsView,
    ScanContentView,
    AsyncScanView,
    ScanResultView,
    ViolationsListView,
    AlertsListView,
    AcknowledgeAlertView,
    ResolveAlertView,
    LogInteractionView,
    ExportViolationsCSVView,
    ExportComplianceReportCSVView,
    ComplianceReportSummaryView,
    AuditChainVerifyView,
)

app_name = 'zentinelle'

urlpatterns = [
    # Agent-facing endpoints
    path('register', RegisterView.as_view(), name='register'),
    path('deregister', DeregisterView.as_view(), name='deregister'),
    path('config/<str:agent_id>', ConfigView.as_view(), name='config'),
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
]
