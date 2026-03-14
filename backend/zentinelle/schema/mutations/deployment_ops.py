"""
Deployment Operations GraphQL Mutations.

Infrastructure operations for managed deployments:
- Restart, scale, sync, import, drift detection
"""
import logging

import graphene
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

class RestartResultType(graphene.ObjectType):
    """Result of a restart operation."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    deployment_id = graphene.String()
    triggered_at = graphene.DateTime()


class ScaleResultType(graphene.ObjectType):
    """Result of a scale operation."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    previous_count = graphene.Int()
    desired_count = graphene.Int()


class SyncResultType(graphene.ObjectType):
    """Result of a sync operation."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    direction = graphene.String()
    synced_at = graphene.DateTime()
    drift_detected = graphene.Boolean()
    changes = graphene.JSONString()


class ImportResultType(graphene.ObjectType):
    """Result of importing state from infrastructure."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    imported_at = graphene.DateTime()
    config_imported = graphene.Boolean()
    secrets_imported = graphene.Boolean()
    config_keys = graphene.List(graphene.String)
    secrets_keys = graphene.List(graphene.String)


class LogEntryType(graphene.ObjectType):
    """A single log entry."""
    timestamp = graphene.DateTime()
    message = graphene.String()
    container = graphene.String()
    stream = graphene.String()


class DeploymentLogsType(graphene.ObjectType):
    """Result of fetching deployment logs."""
    success = graphene.Boolean(required=True)
    error = graphene.String()
    logs = graphene.List(LogEntryType)
    log_group = graphene.String()
    next_token = graphene.String()


class ServiceMetricsType(graphene.ObjectType):
    """Service metrics from infrastructure."""
    cpu_percent = graphene.Float()
    memory_percent = graphene.Float()
    memory_mb = graphene.Float()
    network_rx_bytes = graphene.Float()
    network_tx_bytes = graphene.Float()
    running_count = graphene.Int()
    desired_count = graphene.Int()
    collected_at = graphene.DateTime()


class DeploymentStatusType(graphene.ObjectType):
    """Live status of a deployment from infrastructure."""
    success = graphene.Boolean(required=True)
    error = graphene.String()
    deployment_id = graphene.String()
    state = graphene.String()
    running_count = graphene.Int()
    desired_count = graphene.Int()
    pending_count = graphene.Int()
    deployment_state = graphene.String()
    last_deployment_at = graphene.DateTime()
    metrics = graphene.Field(ServiceMetricsType)
    drift_detected = graphene.Boolean()
    config_in_sync = graphene.Boolean()
    secrets_healthy = graphene.Boolean()


class DriftStatusType(graphene.ObjectType):
    """Drift detection status."""
    success = graphene.Boolean(required=True)
    error = graphene.String()
    drift_detected = graphene.Boolean()
    config_drift = graphene.Boolean()
    secrets_drift = graphene.Boolean()
    desired_config_hash = graphene.String()
    last_config_hash = graphene.String()
    desired_secrets_hash = graphene.String()
    last_secrets_hash = graphene.String()
    drift_detected_at = graphene.DateTime()


# =============================================================================
# Mutations
# =============================================================================

class RestartDeployment(graphene.Mutation):
    """Restart a deployment's infrastructure (ECS service, Docker container, etc.)."""

    class Arguments:
        deployment_id = graphene.ID(required=True)
        reason = graphene.String(description="Reason for restart")
        force = graphene.Boolean(default_value=False, description="Force restart even if unhealthy")

    result = graphene.Field(RestartResultType)
    deployment = graphene.Field(DeploymentType)

    @classmethod
    def mutate(cls, root, info, deployment_id, reason=None, force=False):
        if not info.context.user.is_authenticated:
            return RestartDeployment(
                result=RestartResultType(success=False, message="Authentication required")
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return RestartDeployment(
                result=RestartResultType(success=False, message="Deployment not found")
            )

        manager = DeploymentManager()
        restart_result = async_to_sync(manager.restart)(
            deployment,
            reason=reason or "Manual restart via portal",
            force=force
        )

        return RestartDeployment(
            result=RestartResultType(
                success=restart_result.success,
                message=restart_result.message,
                deployment_id=restart_result.deployment_id,
                triggered_at=restart_result.triggered_at,
            ),
            deployment=deployment,
        )


class ScaleDeployment(graphene.Mutation):
    """Scale a deployment to a desired count."""

    class Arguments:
        deployment_id = graphene.ID(required=True)
        desired_count = graphene.Int(required=True)

    result = graphene.Field(ScaleResultType)
    deployment = graphene.Field(DeploymentType)

    @classmethod
    def mutate(cls, root, info, deployment_id, desired_count):
        if not info.context.user.is_authenticated:
            return ScaleDeployment(
                result=ScaleResultType(success=False, message="Authentication required")
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return ScaleDeployment(
                result=ScaleResultType(success=False, message="Deployment not found")
            )

        manager = DeploymentManager()
        scale_result = async_to_sync(manager.scale)(deployment, desired_count)

        return ScaleDeployment(
            result=ScaleResultType(
                success=scale_result.success,
                message=scale_result.message,
                previous_count=scale_result.previous_count,
                desired_count=scale_result.desired_count,
            ),
            deployment=deployment,
        )


class SyncDeployment(graphene.Mutation):
    """Sync configuration/secrets between Client Cove and infrastructure."""

    class Arguments:
        deployment_id = graphene.ID(required=True)
        direction = graphene.String(
            required=True,
            description="'push' (to infrastructure) or 'import' (from infrastructure)"
        )
        restart_after = graphene.Boolean(
            default_value=False,
            description="Restart service after pushing config"
        )

    result = graphene.Field(SyncResultType)
    deployment = graphene.Field(DeploymentType)

    @classmethod
    def mutate(cls, root, info, deployment_id, direction, restart_after=False):
        if not info.context.user.is_authenticated:
            return SyncDeployment(
                result=SyncResultType(success=False, message="Authentication required")
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return SyncDeployment(
                result=SyncResultType(success=False, message="Deployment not found")
            )

        try:
            sync_dir = SyncDirection(direction.lower())
        except ValueError:
            return SyncDeployment(
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

        return SyncDeployment(
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


class ImportDeploymentState(graphene.Mutation):
    """Import current state from infrastructure into Client Cove."""

    class Arguments:
        deployment_id = graphene.ID(required=True)

    result = graphene.Field(ImportResultType)
    deployment = graphene.Field(DeploymentType)

    @classmethod
    def mutate(cls, root, info, deployment_id):
        if not info.context.user.is_authenticated:
            return ImportDeploymentState(
                result=ImportResultType(success=False, message="Authentication required")
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return ImportDeploymentState(
                result=ImportResultType(success=False, message="Deployment not found")
            )

        manager = DeploymentManager()
        import_result = async_to_sync(manager.import_current_state)(deployment)

        return ImportDeploymentState(
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


class GetDeploymentStatus(graphene.Mutation):
    """Get live status from infrastructure (not cached)."""

    class Arguments:
        deployment_id = graphene.ID(required=True)

    result = graphene.Field(DeploymentStatusType)

    @classmethod
    def mutate(cls, root, info, deployment_id):
        if not info.context.user.is_authenticated:
            return GetDeploymentStatus(
                result=DeploymentStatusType(success=False, error="Authentication required")
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return GetDeploymentStatus(
                result=DeploymentStatusType(success=False, error="Deployment not found")
            )

        manager = DeploymentManager()
        try:
            status = async_to_sync(manager.get_status)(deployment)

            return GetDeploymentStatus(
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
            return GetDeploymentStatus(
                result=DeploymentStatusType(success=False, error="Failed to get deployment status")
            )


class GetDeploymentLogs(graphene.Mutation):
    """Fetch recent logs from deployment infrastructure."""

    class Arguments:
        deployment_id = graphene.ID(required=True)
        lines = graphene.Int(default_value=100)
        container = graphene.String(description="Specific container name")
        start_time = graphene.DateTime(description="Filter logs after this time")
        end_time = graphene.DateTime(description="Filter logs before this time")

    result = graphene.Field(DeploymentLogsType)

    @classmethod
    def mutate(cls, root, info, deployment_id, lines=100, container=None, start_time=None, end_time=None):
        if not info.context.user.is_authenticated:
            return GetDeploymentLogs(
                result=DeploymentLogsType(success=False, error="Authentication required")
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return GetDeploymentLogs(
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

            return GetDeploymentLogs(
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
            return GetDeploymentLogs(
                result=DeploymentLogsType(success=False, error="Failed to get deployment logs")
            )


class CheckDeploymentDrift(graphene.Mutation):
    """Check for configuration drift between desired and actual state."""

    class Arguments:
        deployment_id = graphene.ID(required=True)

    result = graphene.Field(DriftStatusType)
    deployment = graphene.Field(DeploymentType)

    @classmethod
    def mutate(cls, root, info, deployment_id):
        if not info.context.user.is_authenticated:
            return CheckDeploymentDrift(
                result=DriftStatusType(success=False, error="Authentication required")
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return CheckDeploymentDrift(
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

            return CheckDeploymentDrift(
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
            return CheckDeploymentDrift(
                result=DriftStatusType(success=False, error="Failed to check deployment drift")
            )


class ClearDeploymentDrift(graphene.Mutation):
    """Clear drift detection flag after resolving drift."""

    class Arguments:
        deployment_id = graphene.ID(required=True)

    success = graphene.Boolean()
    error = graphene.String()
    deployment = graphene.Field(DeploymentType)

    @classmethod
    def mutate(cls, root, info, deployment_id):
        if not info.context.user.is_authenticated:
            return ClearDeploymentDrift(success=False, error="Authentication required")

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return ClearDeploymentDrift(success=False, error="Deployment not found")

        manager = DeploymentManager()
        try:
            async_to_sync(manager.clear_drift)(deployment)
            deployment.refresh_from_db()

            return ClearDeploymentDrift(success=True, deployment=deployment)
        except Exception as e:
            logger.exception(f"Error clearing deployment drift: {e}")
            return ClearDeploymentDrift(success=False, error="Failed to clear deployment drift")


class DeprovisionResultType(graphene.ObjectType):
    """Result of a deprovision operation."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    provision_id = graphene.String()
    triggered_at = graphene.DateTime()


class DeprovisionDeployment(graphene.Mutation):
    """
    Trigger infrastructure teardown for a deployment.

    This creates a TerraformProvision record with destroy action and triggers
    the provisioner to tear down the infrastructure. Use with caution.
    """

    class Arguments:
        deployment_id = graphene.ID(required=True)
        reason = graphene.String(description="Reason for deprovisioning")
        confirm = graphene.Boolean(
            required=True,
            description="Must be True to confirm destructive operation"
        )

    result = graphene.Field(DeprovisionResultType)
    deployment = graphene.Field(DeploymentType)

    @classmethod
    def mutate(cls, root, info, deployment_id, confirm, reason=None):
        if not info.context.user.is_authenticated:
            return DeprovisionDeployment(
                result=DeprovisionResultType(success=False, message="Authentication required")
            )

        # Require confirmation for destructive operation
        if not confirm:
            return DeprovisionDeployment(
                result=DeprovisionResultType(
                    success=False,
                    message="Destructive operation requires confirm=True"
                )
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return DeprovisionDeployment(
                result=DeprovisionResultType(success=False, message="Deployment not found")
            )

        # Check if deployment can be deprovisioned
        if deployment.status == Deployment.Status.TERMINATED:
            return DeprovisionDeployment(
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
                reason=reason or f'manual_deprovision:{info.context.user.email}',
            )

            # Trigger the deprovision
            if provision.trigger():
                logger.info(
                    f"Triggered deprovision for {deployment.name} "
                    f"(org: {deployment.organization.name}, provision: {provision.id})"
                )
                return DeprovisionDeployment(
                    result=DeprovisionResultType(
                        success=True,
                        message=f"Deprovisioning triggered for {deployment.name}",
                        provision_id=str(provision.id),
                        triggered_at=timezone.now(),
                    ),
                    deployment=deployment,
                )
            else:
                return DeprovisionDeployment(
                    result=DeprovisionResultType(
                        success=False,
                        message=f"Failed to trigger deprovision: {provision.error_message}",
                        provision_id=str(provision.id),
                    ),
                    deployment=deployment,
                )

        except Exception as e:
            logger.exception(f"Error triggering deprovision for {deployment_id}: {e}")
            return DeprovisionDeployment(
                result=DeprovisionResultType(
                    success=False,
                    message=f"Error: {str(e)}"
                )
            )


# =============================================================================
# Admin Operations (Staff Only)
# =============================================================================

class AdminDeploymentResultType(graphene.ObjectType):
    """Result type for admin deployment operations."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    previous_status = graphene.String()
    new_status = graphene.String()


class AdminSuspendDeployment(graphene.Mutation):
    """
    Admin-only: Suspend a deployment without terminating.

    Sets deployment to SUSPENDED state. Can be reactivated later.
    Use for payment issues, policy violations, or temporary holds.
    """

    class Arguments:
        deployment_id = graphene.ID(required=True)
        reason = graphene.String(required=True, description="Reason for suspension")
        notify_customer = graphene.Boolean(default_value=True, description="Send notification to customer")

    result = graphene.Field(AdminDeploymentResultType)
    deployment = graphene.Field(DeploymentType)

    @classmethod
    def mutate(cls, root, info, deployment_id, reason, notify_customer=True):
        user = info.context.user
        if not user.is_authenticated or not user.is_staff:
            return AdminSuspendDeployment(
                result=AdminDeploymentResultType(
                    success=False,
                    message="Staff authentication required"
                )
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return AdminSuspendDeployment(
                result=AdminDeploymentResultType(success=False, message="Deployment not found")
            )

        # Validate current status
        if deployment.status == Deployment.Status.SUSPENDED:
            return AdminSuspendDeployment(
                result=AdminDeploymentResultType(
                    success=False,
                    message="Deployment is already suspended"
                ),
                deployment=deployment,
            )

        if deployment.status == Deployment.Status.TERMINATED:
            return AdminSuspendDeployment(
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

        return AdminSuspendDeployment(
            result=AdminDeploymentResultType(
                success=True,
                message=f"Deployment suspended: {reason}",
                previous_status=previous_status,
                new_status=Deployment.Status.SUSPENDED,
            ),
            deployment=deployment,
        )


class AdminReactivateDeployment(graphene.Mutation):
    """
    Admin-only: Reactivate a suspended deployment.

    Sets deployment back to ACTIVE state.
    """

    class Arguments:
        deployment_id = graphene.ID(required=True)
        reason = graphene.String(description="Reason for reactivation")
        notify_customer = graphene.Boolean(default_value=True)

    result = graphene.Field(AdminDeploymentResultType)
    deployment = graphene.Field(DeploymentType)

    @classmethod
    def mutate(cls, root, info, deployment_id, reason=None, notify_customer=True):
        user = info.context.user
        if not user.is_authenticated or not user.is_staff:
            return AdminReactivateDeployment(
                result=AdminDeploymentResultType(
                    success=False,
                    message="Staff authentication required"
                )
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return AdminReactivateDeployment(
                result=AdminDeploymentResultType(success=False, message="Deployment not found")
            )

        if deployment.status != Deployment.Status.SUSPENDED:
            return AdminReactivateDeployment(
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

        return AdminReactivateDeployment(
            result=AdminDeploymentResultType(
                success=True,
                message="Deployment reactivated",
                previous_status=previous_status,
                new_status=Deployment.Status.ACTIVE,
            ),
            deployment=deployment,
        )


class AdminTerminateDeployment(graphene.Mutation):
    """
    Admin-only: Immediately terminate a deployment.

    This is destructive - triggers infrastructure teardown.
    Use for fraud, abuse, or at customer request.
    """

    class Arguments:
        deployment_id = graphene.ID(required=True)
        reason = graphene.String(required=True, description="Reason for termination")
        notify_customer = graphene.Boolean(default_value=True)
        skip_terraform = graphene.Boolean(
            default_value=False,
            description="Skip Terraform destroy (use if infrastructure already gone)"
        )

    result = graphene.Field(DeprovisionResultType)
    deployment = graphene.Field(DeploymentType)

    @classmethod
    def mutate(cls, root, info, deployment_id, reason, notify_customer=True, skip_terraform=False):
        from deployments.models import TerraformProvision

        user = info.context.user
        if not user.is_authenticated or not user.is_staff:
            return AdminTerminateDeployment(
                result=DeprovisionResultType(
                    success=False,
                    message="Staff authentication required"
                )
            )

        try:
            deployment = get_deployment_by_id(deployment_id)
        except Deployment.DoesNotExist:
            return AdminTerminateDeployment(
                result=DeprovisionResultType(success=False, message="Deployment not found")
            )

        if deployment.status == Deployment.Status.TERMINATED:
            return AdminTerminateDeployment(
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

            return AdminTerminateDeployment(
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

                return AdminTerminateDeployment(
                    result=DeprovisionResultType(
                        success=True,
                        message=f"Termination triggered: {reason}",
                        provision_id=str(provision.id),
                        triggered_at=timezone.now(),
                    ),
                    deployment=deployment,
                )
            else:
                return AdminTerminateDeployment(
                    result=DeprovisionResultType(
                        success=False,
                        message=f"Failed to trigger termination: {provision.error_message}",
                        provision_id=str(provision.id),
                    ),
                    deployment=deployment,
                )

        except ValueError as e:
            # Validation error from create_for_deprovision
            return AdminTerminateDeployment(
                result=DeprovisionResultType(
                    success=False,
                    message=str(e)
                ),
                deployment=deployment,
            )
        except Exception as e:
            logger.exception(f"Error terminating deployment {deployment_id}: {e}")
            return AdminTerminateDeployment(
                result=DeprovisionResultType(
                    success=False,
                    message=f"Error: {str(e)}"
                )
            )
