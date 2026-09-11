"""
Zentinelle API Views.

Agent governance and compliance views. Deployment operations have
moved to deployments.api.views.
"""
from zentinelle.api.views.agent_control import AgentControlView
from zentinelle.api.views.agent_summary import \
    AgentSummaryView  # noqa: E402,F401
from zentinelle.api.views.audit import AuditChainVerifyView
from zentinelle.api.views.audit_export import AuditExportView
from zentinelle.api.views.compliance import (AcknowledgeAlertView,
                                             AlertsListView, AsyncScanView,
                                             ComplianceReportSummaryView,
                                             ExportComplianceReportCSVView,
                                             ExportViolationsCSVView,
                                             LogInteractionView,
                                             ResolveAlertView, ScanContentView,
                                             ScanResultView,
                                             ViolationsListView)
from zentinelle.api.views.config import ConfigView
from zentinelle.api.views.deregister import DeregisterView
from zentinelle.api.views.evaluate import EvaluateView
from zentinelle.api.views.events import EventsView
from zentinelle.api.views.heartbeat import HeartbeatView
from zentinelle.api.views.incidents import (IncidentCommentView,
                                            IncidentDetailView,
                                            IncidentEvidenceView,
                                            IncidentListView)
from zentinelle.api.views.policy import EffectivePolicyView, SystemPromptsView
from zentinelle.api.views.policy_change import (
    PolicyChangeAcknowledgementView, PolicyChangeSetListView,
    PolicyChangeSetTransitionView)
from zentinelle.api.views.policy_copilot import (PolicyCopilotDiffView,
                                                PolicyCopilotDraftView,
                                                PolicyCopilotExplainView,
                                                 PolicyCopilotStageView,
                                                 PolicyCopilotStatusView)
from zentinelle.api.views.policy_history import (PolicyDiffView,
                                                 PolicyHistoryListView)
from zentinelle.api.views.register import RegisterView
from zentinelle.api.views.reports import (ReportCreateView, ReportDownloadView,
                                          ReportStatusView)
from zentinelle.api.views.retention_status import PrivacyEraseView, RetentionStatusView
from zentinelle.api.views.risks_trend import RiskTrendView
from zentinelle.api.views.secrets import SecretsView
from zentinelle.api.views.runtime_settings import (RuntimeSettingsChangesView,
                                                    RuntimeSettingsChangeTransitionView,
                                                    RuntimeSettingsRollbackView)
from zentinelle.api.views.telemetry_health import TelemetryDeliveryHealthView
from zentinelle.api.views.control_evidence import ControlEvidenceView
from zentinelle.api.views.budget_showback import BudgetShowbackView
from zentinelle.api.views.model_route_canary import ModelRouteCanaryView
from zentinelle.api.views.brocs import BrocsControlMapView

__all__ = [
    'RegisterView',
    'ConfigView',
    'AgentControlView',
    'SecretsView',
    'EventsView',
    'HeartbeatView',
    'EvaluateView',
    'DeregisterView',
    'EffectivePolicyView',
    'SystemPromptsView',
    # Compliance
    'ScanContentView',
    'AsyncScanView',
    'ScanResultView',
    'ViolationsListView',
    'AlertsListView',
    'AcknowledgeAlertView',
    'ResolveAlertView',
    'LogInteractionView',
    # Compliance Export
    'ExportViolationsCSVView',
    'ExportComplianceReportCSVView',
    'ComplianceReportSummaryView',
    # Audit
    'AuditChainVerifyView',
    'AuditExportView',
    # Retention
    'RetentionStatusView',
    'PrivacyEraseView',
    # Risk
    'RiskTrendView',
    # Policy History
    'PolicyHistoryListView',
    'PolicyChangeSetListView',
    'PolicyChangeSetTransitionView',
    'PolicyChangeAcknowledgementView',
    'PolicyCopilotStatusView',
    'PolicyCopilotDraftView',
    'PolicyCopilotDiffView',
    'PolicyCopilotStageView',
    'PolicyCopilotExplainView',
    'PolicyDiffView',
    # Incidents
    'IncidentListView',
    'IncidentDetailView',
    'IncidentEvidenceView',
    'IncidentCommentView',
    # Reports
    'ReportCreateView',
    'ReportStatusView',
    'ReportDownloadView',
    'TelemetryDeliveryHealthView',
    'RuntimeSettingsRollbackView',
    'RuntimeSettingsChangesView',
    'RuntimeSettingsChangeTransitionView',
    'ControlEvidenceView',
    'BudgetShowbackView',
    'ModelRouteCanaryView',
    'BrocsControlMapView',
]
