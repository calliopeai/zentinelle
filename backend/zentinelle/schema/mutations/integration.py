"""
Client Cove integration mutations.

Allows standalone Zentinelle tenants to connect to Calliope AI Client Cove
for delegated auth. Credentials are stored in DB and the connection is
tested before saving.
"""
import graphene
import httpx

from zentinelle.schema.types import (
    TestClientCoveConnectionPayload,
    SaveClientCoveConfigPayload,
    ClientCoveIntegrationType,
    DisconnectClientCovePayload,
    TestWebhookPayload,
)


def _test_connection(base_url: str, api_key: str) -> tuple[bool, str]:
    """
    Ping the Client Cove internal API. Returns (ok, message).
    A 200 JSON response (even with valid=false) confirms the endpoint is
    reachable and the service key is accepted.
    """
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
        'X-Service': 'zentinelle',
    }
    try:
        resp = httpx.post(
            f'{base_url}/internal/zentinelle/auth/validate/',
            headers=headers,
            json={'token': 'znt_handshake_probe'},
            timeout=10.0,
        )
        if resp.status_code == 401:
            return False, 'Authentication failed — check the API key'
        if resp.status_code == 404:
            return False, 'Endpoint not found — verify the Client Cove URL'
        if resp.status_code >= 500:
            return False, f'Client Cove server error ({resp.status_code})'
        # 200: connection is good (token itself is invalid, that's expected)
        return True, 'Connection successful'
    except httpx.ConnectError:
        return False, f'Could not reach {base_url} — check the URL and network'
    except httpx.TimeoutException:
        return False, f'Connection timed out — check the URL and network'
    except Exception as exc:
        return False, str(exc)


class TestClientCoveConnection(graphene.Mutation):
    """Test Client Cove credentials without saving them."""

    class Arguments:
        url = graphene.String(required=True)
        api_key = graphene.String(required=True)

    Output = TestClientCoveConnectionPayload

    @staticmethod
    def mutate(root, info, url, api_key):
        ok, message = _test_connection(url.rstrip('/'), api_key)
        return TestClientCoveConnectionPayload(success=ok, message=message)


class SaveClientCoveConfig(graphene.Mutation):
    """Test and save Client Cove credentials for this tenant."""

    class Arguments:
        url = graphene.String(required=True)
        api_key = graphene.String(required=True)

    Output = SaveClientCoveConfigPayload

    @staticmethod
    def mutate(root, info, url, api_key):
        from zentinelle.models.integration import ClientCoveIntegration
        from zentinelle.schema.auth_helpers import get_request_tenant_id
        from django.utils import timezone

        tenant_id = get_request_tenant_id(info.context.user) or 'default'
        base_url = url.rstrip('/')

        ok, message = _test_connection(base_url, api_key)
        status = ClientCoveIntegration.Status.CONNECTED if ok else ClientCoveIntegration.Status.FAILED

        integration, _ = ClientCoveIntegration.objects.update_or_create(
            tenant_id=tenant_id,
            defaults={
                'client_cove_url': base_url,
                'api_key': api_key,
                'is_active': ok,
                'status': status,
                'status_message': message,
                'last_tested_at': timezone.now(),
            },
        )
        return SaveClientCoveConfigPayload(
            success=ok,
            message=message,
            integration=integration,
        )


class TestWebhook(graphene.Mutation):
    """Send a test payload to a webhook URL to verify it is reachable."""

    class Arguments:
        url = graphene.String(required=True)

    Output = TestWebhookPayload

    @staticmethod
    def mutate(root, info, url):
        try:
            resp = httpx.post(
                url,
                json={"text": "Zentinelle webhook test — connection is operational"},
                timeout=10.0,
            )
            ok = 200 <= resp.status_code < 300
            return TestWebhookPayload(
                success=ok,
                message='Webhook is operational' if ok else f'Webhook returned HTTP {resp.status_code}',
                status_code=resp.status_code,
            )
        except httpx.ConnectError:
            return TestWebhookPayload(success=False, message=f'Could not reach {url}', status_code=None)
        except httpx.TimeoutException:
            return TestWebhookPayload(success=False, message='Request timed out', status_code=None)
        except Exception as exc:
            return TestWebhookPayload(success=False, message=str(exc), status_code=None)


class DisconnectClientCove(graphene.Mutation):
    """Remove Client Cove integration config for this tenant."""

    Output = DisconnectClientCovePayload

    @staticmethod
    def mutate(root, info):
        from zentinelle.models.integration import ClientCoveIntegration
        from zentinelle.schema.auth_helpers import get_request_tenant_id

        tenant_id = get_request_tenant_id(info.context.user) or 'default'
        ClientCoveIntegration.objects.filter(tenant_id=tenant_id).delete()
        return DisconnectClientCovePayload(success=True)
