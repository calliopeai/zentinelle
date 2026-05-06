"""
Deployment Operations GraphQL Mutations.

Infrastructure operations for managed deployments:
- Restart, scale, sync, import, drift detection
"""
import logging
from datetime import datetime
from typing import Optional

import strawberry
from strawberry.scalars import JSON
from asgiref.sync import async_to_sync
from graphql_relay import from_global_id

from deployments.models import Deployment
from zentinelle.schema.types import DeploymentType
from deployments.services import (
    DeploymentManager,
    SyncDirection,
)

logger = logging.getLogger(__name__)


def get_deployment_by_id(deployment_id):
    """Get deployment by ID, handling both Relay global IDs and raw UUIDs."""
    try:
        # Try to decode as Relay global ID first
        type_name, uuid_str = from_global_id(deployment_id)
        if type_name == 'DeploymentType':
            return Deployment.objects.get(id=uuid_str)
    except Exception:
        pass
    # Fall back to raw UUID
    return Deployment.objects.get(id=deployment_id)


# =============================================================================
# Result Types
# =============================================================================

@strawberry.type
class RestartResultType:
    success: bool
    message: Optional[str] = None
    deployment_id: Optional[str] = None
    triggered_at: Optional[datetime] = None


@strawberry.type
class ScaleResultType:
    success: bool
    message: Optional[str] = None
    previous_count: Optional[int] = None
    desired_count: Optional[int] = None


@strawberry.type
class SyncResultType:
    success: bool
    message: Optional[str] = None
    direction: Optional[str] = None
    synced_at: Optional[datetime] = None
    drift_detected: Optional[bool] = None
    changes: Optional[JSON] = None


@strawberry.type
class ImportResultType:
    success: bool
    message: Optional[str] = None
    imported_at: Optional[datetime] = None
    config_imported: Optional[bool] = None
    secrets_imported: Optional[bool] = None
    config_keys: Optional[list[str]] = None
    secrets_keys: Optional[list[str]] = None


@strawberry.type
class LogEntryType:
    timestamp: Optional[datetime] = None
    message: Optional[str] = None
    container: Optional[str] = None
    stream: Optional[str] = None


@strawberry.type
class DeploymentLogsType:
    success: bool
    error: Optional[str] = None
    logs: Optional[list[LogEntryType]] = None
    log_group: Optional[str] = None
    next_token: Optional[str] = None


@strawberry.type
class ServiceMetricsType:
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    memory_mb: Optional[float] = None
    network_rx_bytes: Optional[float] = None
    network_tx_bytes: Optional[float] = None
    running_count: Optional[int] = None
    desired_count: Optional[int] = None
    collected_at: Optional[datetime] = None


@strawberry.type
class DeploymentStatusType:
    success: bool
    error: Optional[str] = None
    deployment_id: Optional[str] = None
    state: Optional[str] = None
    running_count: Optional[int] = None
    desired_count: Optional[int] = None
    pending_count: Optional[int] = None
    deployment_state: Optional[str] = None
    last_deployment_at: Optional[datetime] = None
    metrics: Optional[ServiceMetricsType] = None
    drift_detected: Optional[bool] = None
    config_in_sync: Optional[bool] = None
    secrets_healthy: Optional[bool] = None


@strawberry.type
class DriftStatusType:
    success: bool
    error: Optional[str] = None
    drift_detected: Optional[bool] = None
    config_drift: Optional[bool] = None
    secrets_drift: Optional[bool] = None
    desired_config_hash: Optional[str] = None
    last_config_hash: Optional[str] = None
    desired_secrets_hash: Optional[str] = None
    last_secrets_hash: Optional[str] = None
    drift_detected_at: Optional[datetime] = None


@strawberry.type
class DeprovisionResultType:
    success: bool
    message: Optional[str] = None
    provision_id: Optional[str] = None
    triggered_at: Optional[datetime] = None


@strawberry.type
class AdminDeploymentResultType:
    success: bool
    message: Optional[str] = None
    previous_status: Optional[str] = None
    new_status: Optional[str] = None


# =============================================================================
# Mutation Payloads
# =============================================================================

@strawberry.type
class RestartDeploymentPayload:
    result: Optional[RestartResultType] = None
    deployment: Optional[DeploymentType] = None


@strawberry.type
class ScaleDeploymentPayload:
    result: Optional[ScaleResultType] = None
    deployment: Optional[DeploymentType] = None


@strawberry.type
class SyncDeploymentPayload:
    result: Optional[SyncResultType] = None
    deployment: Optional[DeploymentType] = None


@strawberry.type
class ImportDeploymentStatePayload:
    result: Optional[ImportResultType] = None
    deployment: Optional[DeploymentType] = None


@strawberry.type
class GetDeploymentStatusPayload:
    result: Optional[DeploymentStatusType] = None


@strawberry.type
class GetDeploymentLogsPayload:
    result: Optional[DeploymentLogsType] = None


@strawberry.type
class CheckDeploymentDriftPayload:
    result: Optional[DriftStatusType] = None
    deployment: Optional[DeploymentType] = None


@strawberry.type
class ClearDeploymentDriftPayload:
    success: Optional[bool] = None
    error: Optional[str] = None
    deployment: Optional[DeploymentType] = None


@strawberry.type
class DeprovisionDeploymentPayload:
    result: Optional[DeprovisionResultType] = None
    deployment: Optional[DeploymentType] = None


@strawberry.type
class AdminSuspendDeploymentPayload:
    result: Optional[AdminDeploymentResultType] = None
    deployment: Optional[DeploymentType] = None


@strawberry.type
class AdminReactivateDeploymentPayload:
    result: Optional[AdminDeploymentResultType] = None
    deployment: Optional[DeploymentType] = None


@strawberry.type
class AdminTerminateDeploymentPayload:
    result: Optional[DeprovisionResultType] = None
    deployment: Optional[DeploymentType] = None


# =============================================================================
# Mutations
# =============================================================================

def restart_deployment(info: strawberry.types.Info, deployment_id: strawberry.ID, reason: Optional[str] = None, force: Optional[bool] = False) -> RestartDeploymentPayload:
    if not info.context.request.user.is_authenticated:
        return RestartDeploymentPayload(
            result=RestartResultType(success=False, message="Authentication required")
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return RestartDeploymentPayload(
            result=RestartResultType(success=False, message="Deployment not found")
        )

    manager = DeploymentManager()
    restart_result = async_to_sync(manager.restart)(
        deployment,
        reason=reason or "Manual restart via portal",
        force=force
    )

    return RestartDeploymentPayload(
        result=RestartResultType(
            success=restart_result.success,
            message=restart_result.message,
            deployment_id=restart_result.deployment_id,
            triggered_at=restart_result.triggered_at,
        ),
        deployment=deployment,
    )


def scale_deployment(info: strawberry.types.Info, deployment_id: strawberry.ID, desired_count: int) -> ScaleDeploymentPayload:
    if not info.context.request.user.is_authenticated:
        return ScaleDeploymentPayload(
            result=ScaleResultType(success=False, message="Authentication required")
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return ScaleDeploymentPayload(
            result=ScaleResultType(success=False, message="Deployment not found")
        )

    manager = DeploymentManager()
    scale_result = async_to_sync(manager.scale)(deployment, desired_count)

    return ScaleDeploymentPayload(
        result=ScaleResultType(
            success=scale_result.success,
            message=scale_result.message,
            previous_count=scale_result.previous_count,
            desired_count=scale_result.desired_count,
        ),
        deployment=deployment,
    )


def sync_deployment(info: strawberry.types.Info, deployment_id: strawberry.ID, direction: str, restart_after: Optional[bool] = False) -> SyncDeploymentPayload:
    if not info.context.request.user.is_authenticated:
        return SyncDeploymentPayload(
            result=SyncResultType(success=False, message="Authentication required")
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return SyncDeploymentPayload(
            result=SyncResultType(success=False, message="Deployment not found")
        )

    try:
        sync_dir = SyncDirection(direction.lower())
    except ValueError:
        return SyncDeploymentPayload(
            result=SyncResultType(
                success=False,
                message=f"Invalid direction: {direction}. Use 'push' or 'import'"
            )
        )

    manager = DeploymentManager()

    if sync_dir == SyncDirection.PUSH:
        sync_result = async_to_sync(manager.push_config)(
            deployment, restart=restart_after
        )
    else:
        import_result = async_to_sync(manager.import_current_state)(deployment)
        sync_result = type('SyncResult', (), {
            'success': import_result.success,
            'message': import_result.message,
            'synced_at': import_result.imported_at,
            'direction': sync_dir,
            'drift_detected': False,
            'changes': {
                'config_keys': import_result.config_keys,
                'secrets_keys': import_result.secrets_keys,
            },
        })()

    return SyncDeploymentPayload(
        result=SyncResultType(
            success=sync_result.success,
            message=sync_result.message,
            direction=sync_result.direction.value if hasattr(sync_result.direction, 'value') else str(sync_result.direction),
            synced_at=sync_result.synced_at,
            drift_detected=sync_result.drift_detected,
            changes=sync_result.changes,
        ),
        deployment=deployment,
    )


def import_deployment_state(info: strawberry.types.Info, deployment_id: strawberry.ID) -> ImportDeploymentStatePayload:
    if not info.context.request.user.is_authenticated:
        return ImportDeploymentStatePayload(
            result=ImportResultType(success=False, message="Authentication required")
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return ImportDeploymentStatePayload(
            result=ImportResultType(success=False, message="Deployment not found")
        )

    manager = DeploymentManager()
    import_result = async_to_sync(manager.import_current_state)(deployment)

    return ImportDeploymentStatePayload(
        result=ImportResultType(
            success=import_result.success,
            message=import_result.message,
            imported_at=import_result.imported_at,
            config_imported=import_result.config_imported,
            secrets_imported=import_result.secrets_imported,
            config_keys=import_result.config_keys,
            secrets_keys=import_result.secrets_keys,
        ),
        deployment=deployment,
    )


def get_deployment_status(info: strawberry.types.Info, deployment_id: strawberry.ID) -> GetDeploymentStatusPayload:
    if not info.context.request.user.is_authenticated:
        return GetDeploymentStatusPayload(
            result=DeploymentStatusType(success=False, error="Authentication required")
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return GetDeploymentStatusPayload(
            result=DeploymentStatusType(success=False, error="Deployment not found")
        )

    manager = DeploymentManager()
    try:
        status = async_to_sync(manager.get_status)(deployment)

        return GetDeploymentStatusPayload(
            result=DeploymentStatusType(
                success=True,
                deployment_id=status.deployment_id,
                state=status.service_status.state.value,
                running_count=status.service_status.running_count,
                desired_count=status.service_status.desired_count,
                pending_count=status.service_status.pending_count,
                deployment_state=status.service_status.deployment_state.value if status.service_status.deployment_state else None,
                last_deployment_at=status.service_status.last_deployment_at,
                drift_detected=status.drift_detected,
                config_in_sync=status.config_in_sync,
                secrets_healthy=status.secrets_healthy,
            )
        )
    except Exception as e:
        logger.exception(f"Error getting deployment status: {e}")
        return GetDeploymentStatusPayload(
            result=DeploymentStatusType(success=False, error="Failed to get deployment status")
        )


def get_deployment_logs(info: strawberry.types.Info, deployment_id: strawberry.ID, lines: Optional[int] = 100, container: Optional[str] = None, start_time: Optional[datetime] = None, end_time: Optional[datetime] = None) -> GetDeploymentLogsPayload:
    if not info.context.request.user.is_authenticated:
        return GetDeploymentLogsPayload(
            result=DeploymentLogsType(success=False, error="Authentication required")
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return GetDeploymentLogsPayload(
            result=DeploymentLogsType(success=False, error="Deployment not found")
        )

    manager = DeploymentManager()
    try:
        logs = async_to_sync(manager.get_logs)(
            deployment,
            lines=lines,
            container=container,
            start_time=start_time,
            end_time=end_time,
        )

        return GetDeploymentLogsPayload(
            result=DeploymentLogsType(
                success=True,
                logs=[
                    LogEntryType(
                        timestamp=log.timestamp,
                        message=log.message,
                        container=log.container,
                        stream=log.stream,
                    )
                    for log in logs
                ],
            )
        )
    except Exception as e:
        logger.exception(f"Error getting deployment logs: {e}")
        return GetDeploymentLogsPayload(
            result=DeploymentLogsType(success=False, error="Failed to get deployment logs")
        )


def check_deployment_drift(info: strawberry.types.Info, deployment_id: strawberry.ID) -> CheckDeploymentDriftPayload:
    if not info.context.request.user.is_authenticated:
        return CheckDeploymentDriftPayload(
            result=DriftStatusType(success=False, error="Authentication required")
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return CheckDeploymentDriftPayload(
            result=DriftStatusType(success=False, error="Deployment not found")
        )

    manager = DeploymentManager()
    try:
        has_drift = async_to_sync(manager.check_drift)(deployment)
        deployment.refresh_from_db()

        config_drift = (
            deployment.desired_config_hash and
            deployment.last_config_hash and
            deployment.desired_config_hash != deployment.last_config_hash
        )
        secrets_drift = (
            deployment.desired_secrets_hash and
            deployment.last_secrets_hash and
            deployment.desired_secrets_hash != deployment.last_secrets_hash
        )

        return CheckDeploymentDriftPayload(
            result=DriftStatusType(
                success=True,
                drift_detected=has_drift,
                config_drift=config_drift,
                secrets_drift=secrets_drift,
                desired_config_hash=deployment.desired_config_hash,
                last_config_hash=deployment.last_config_hash,
                desired_secrets_hash=deployment.desired_secrets_hash,
                last_secrets_hash=deployment.last_secrets_hash,
                drift_detected_at=deployment.drift_detected_at,
            ),
            deployment=deployment,
        )
    except Exception as e:
        logger.exception(f"Error checking deployment drift: {e}")
        return CheckDeploymentDriftPayload(
            result=DriftStatusType(success=False, error="Failed to check deployment drift")
        )


def clear_deployment_drift(info: strawberry.types.Info, deployment_id: strawberry.ID) -> ClearDeploymentDriftPayload:
    if not info.context.request.user.is_authenticated:
        return ClearDeploymentDriftPayload(success=False, error="Authentication required")

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return ClearDeploymentDriftPayload(success=False, error="Deployment not found")

    manager = DeploymentManager()
    try:
        async_to_sync(manager.clear_drift)(deployment)
        deployment.refresh_from_db()

        return ClearDeploymentDriftPayload(success=True, deployment=deployment)
    except Exception as e:
        logger.exception(f"Error clearing deployment drift: {e}")
        return ClearDeploymentDriftPayload(success=False, error="Failed to clear deployment drift")


def deprovision_deployment(info: strawberry.types.Info, deployment_id: strawberry.ID, confirm: bool, reason: Optional[str] = None) -> DeprovisionDeploymentPayload:
    if not info.context.request.user.is_authenticated:
        return DeprovisionDeploymentPayload(
            result=DeprovisionResultType(success=False, message="Authentication required")
        )

    # Require confirmation for destructive operation
    if not confirm:
        return DeprovisionDeploymentPayload(
            result=DeprovisionResultType(
                success=False,
                message="Destructive operation requires confirm=True"
            )
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return DeprovisionDeploymentPayload(
            result=DeprovisionResultType(success=False, message="Deployment not found")
        )

    # Check if deployment can be deprovisioned
    if deployment.status == Deployment.Status.TERMINATED:
        return DeprovisionDeploymentPayload(
            result=DeprovisionResultType(
                success=False,
                message="Deployment is already terminated"
            )
        )

    try:
        from deployments.models import TerraformProvision
        from django.utils import timezone

        # Create deprovisioning record and trigger
        provision = TerraformProvision.create_for_deprovision(
            deployment=deployment,
            trigger_method='webhook',
            reason=reason or f'manual_deprovision:{info.context.request.user.email}',
        )

        # Trigger the deprovision
        if provision.trigger():
            logger.info(
                f"Triggered deprovision for {deployment.name} "
                f"(org: {deployment.organization.name}, provision: {provision.id})"
            )
            return DeprovisionDeploymentPayload(
                result=DeprovisionResultType(
                    success=True,
                    message=f"Deprovisioning triggered for {deployment.name}",
                    provision_id=str(provision.id),
                    triggered_at=timezone.now(),
                ),
                deployment=deployment,
            )
        else:
            return DeprovisionDeploymentPayload(
                result=DeprovisionResultType(
                    success=False,
                    message=f"Failed to trigger deprovision: {provision.error_message}",
                    provision_id=str(provision.id),
                ),
                deployment=deployment,
            )

    except Exception as e:
        logger.exception(f"Error triggering deprovision for {deployment_id}: {e}")
        return DeprovisionDeploymentPayload(
            result=DeprovisionResultType(
                success=False,
                message=f"Error: {str(e)}"
            )
        )


# =============================================================================
# Admin Operations (Staff Only)
# =============================================================================

def admin_suspend_deployment(info: strawberry.types.Info, deployment_id: strawberry.ID, reason: str, notify_customer: Optional[bool] = True) -> AdminSuspendDeploymentPayload:
    user = info.context.request.user
    if not user.is_authenticated or not user.is_staff:
        return AdminSuspendDeploymentPayload(
            result=AdminDeploymentResultType(
                success=False,
                message="Staff authentication required"
            )
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return AdminSuspendDeploymentPayload(
            result=AdminDeploymentResultType(success=False, message="Deployment not found")
        )

    # Validate current status
    if deployment.status == Deployment.Status.SUSPENDED:
        return AdminSuspendDeploymentPayload(
            result=AdminDeploymentResultType(
                success=False,
                message="Deployment is already suspended"
            ),
            deployment=deployment,
        )

    if deployment.status == Deployment.Status.TERMINATED:
        return AdminSuspendDeploymentPayload(
            result=AdminDeploymentResultType(
                success=False,
                message="Cannot suspend a terminated deployment"
            ),
            deployment=deployment,
        )

    previous_status = deployment.status
    deployment.status = Deployment.Status.SUSPENDED
    deployment.save(update_fields=['status', 'updated_at'])

    logger.info(
        f"Admin {user.email} suspended deployment {deployment.name}: {reason}"
    )

    # Send notification if requested
    if notify_customer:
        try:
            from zentinelle.services.alert_service import AlertService
            alert_service = AlertService()
            alert_service._create_notification(
                organization=deployment.organization,
                title="Deployment Suspended",
                message=f"Your deployment '{deployment.name}' has been suspended. Reason: {reason}",
                notification_type='deployment_suspended',
                severity='warning',
                metadata={'deployment_id': str(deployment.id), 'reason': reason},
            )
        except Exception as e:
            logger.error(f"Failed to send suspension notification: {e}")

    return AdminSuspendDeploymentPayload(
        result=AdminDeploymentResultType(
            success=True,
            message=f"Deployment suspended: {reason}",
            previous_status=previous_status,
            new_status=Deployment.Status.SUSPENDED,
        ),
        deployment=deployment,
    )


def admin_reactivate_deployment(info: strawberry.types.Info, deployment_id: strawberry.ID, reason: Optional[str] = None, notify_customer: Optional[bool] = True) -> AdminReactivateDeploymentPayload:
    user = info.context.request.user
    if not user.is_authenticated or not user.is_staff:
        return AdminReactivateDeploymentPayload(
            result=AdminDeploymentResultType(
                success=False,
                message="Staff authentication required"
            )
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return AdminReactivateDeploymentPayload(
            result=AdminDeploymentResultType(success=False, message="Deployment not found")
        )

    if deployment.status != Deployment.Status.SUSPENDED:
        return AdminReactivateDeploymentPayload(
            result=AdminDeploymentResultType(
                success=False,
                message=f"Deployment is not suspended (status: {deployment.status})"
            ),
            deployment=deployment,
        )

    previous_status = deployment.status
    deployment.status = Deployment.Status.ACTIVE
    deployment.save(update_fields=['status', 'updated_at'])

    logger.info(
        f"Admin {user.email} reactivated deployment {deployment.name}: {reason or 'No reason provided'}"
    )

    if notify_customer:
        try:
            from zentinelle.services.alert_service import AlertService
            alert_service = AlertService()
            alert_service._create_notification(
                organization=deployment.organization,
                title="Deployment Reactivated",
                message=f"Your deployment '{deployment.name}' has been reactivated and is now active.",
                notification_type='deployment_reactivated',
                severity='success',
                metadata={'deployment_id': str(deployment.id)},
            )
        except Exception as e:
            logger.error(f"Failed to send reactivation notification: {e}")

    return AdminReactivateDeploymentPayload(
        result=AdminDeploymentResultType(
            success=True,
            message="Deployment reactivated",
            previous_status=previous_status,
            new_status=Deployment.Status.ACTIVE,
        ),
        deployment=deployment,
    )


def admin_terminate_deployment(info: strawberry.types.Info, deployment_id: strawberry.ID, reason: str, notify_customer: Optional[bool] = True, skip_terraform: Optional[bool] = False) -> AdminTerminateDeploymentPayload:
    from deployments.models import TerraformProvision
    from django.utils import timezone

    user = info.context.request.user
    if not user.is_authenticated or not user.is_staff:
        return AdminTerminateDeploymentPayload(
            result=DeprovisionResultType(
                success=False,
                message="Staff authentication required"
            )
        )

    try:
        deployment = get_deployment_by_id(deployment_id)
    except Deployment.DoesNotExist:
        return AdminTerminateDeploymentPayload(
            result=DeprovisionResultType(success=False, message="Deployment not found")
        )

    if deployment.status == Deployment.Status.TERMINATED:
        return AdminTerminateDeploymentPayload(
            result=DeprovisionResultType(
                success=False,
                message="Deployment is already terminated"
            ),
            deployment=deployment,
        )

    logger.warning(
        f"Admin {user.email} initiating termination for {deployment.name}: {reason}"
    )

    if skip_terraform:
        # Just update status without triggering Terraform
        deployment.status = Deployment.Status.TERMINATED
        deployment.save(update_fields=['status', 'updated_at'])

        return AdminTerminateDeploymentPayload(
            result=DeprovisionResultType(
                success=True,
                message=f"Deployment marked as terminated (Terraform skipped): {reason}",
                triggered_at=timezone.now(),
            ),
            deployment=deployment,
        )

    try:
        # Create deprovisioning record
        provision = TerraformProvision.create_for_deprovision(
            deployment=deployment,
            trigger_method='admin_action',
            reason=f'admin_terminated:{user.email}:{reason}',
        )

        if provision.trigger():
            if notify_customer:
                try:
                    from zentinelle.services.alert_service import AlertService
                    alert_service = AlertService()
                    alert_service._create_notification(
                        organization=deployment.organization,
                        title="Deployment Terminated",
                        message=f"Your deployment '{deployment.name}' has been terminated. Reason: {reason}",
                        notification_type='deployment_terminated',
                        severity='error',
                        metadata={'deployment_id': str(deployment.id), 'reason': reason},
                    )
                except Exception as e:
                    logger.error(f"Failed to send termination notification: {e}")

            return AdminTerminateDeploymentPayload(
                result=DeprovisionResultType(
                    success=True,
                    message=f"Termination triggered: {reason}",
                    provision_id=str(provision.id),
                    triggered_at=timezone.now(),
                ),
                deployment=deployment,
            )
        else:
            return AdminTerminateDeploymentPayload(
                result=DeprovisionResultType(
                    success=False,
                    message=f"Failed to trigger termination: {provision.error_message}",
                    provision_id=str(provision.id),
                ),
                deployment=deployment,
            )

    except ValueError as e:
        # Validation error from create_for_deprovision
        return AdminTerminateDeploymentPayload(
            result=DeprovisionResultType(
                success=False,
                message=str(e)
            ),
            deployment=deployment,
        )
    except Exception as e:
        logger.exception(f"Error terminating deployment {deployment_id}: {e}")
        return AdminTerminateDeploymentPayload(
            result=DeprovisionResultType(
                success=False,
                message=f"Error: {str(e)}"
            )
        )
