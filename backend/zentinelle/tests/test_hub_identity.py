"""Real HTTP identity verification plus tenant-scoped policy attribution."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from django.urls import reverse
from django.utils import timezone

from zentinelle.models import Event
from zentinelle.tests.test_agent_host import AgentHostTestCase, host_tool_call


class HubIdentityTests(AgentHostTestCase):
    def setUp(self):
        super().setUp()
        owner = self
        self.model = {'kind': 'user', 'name': 'leo',
                      'scopes': ['access:servers!server=leo/agenthost']}
        self.code = 200
        self.tokens = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                owner.tokens.append((self.path, self.headers.get('Authorization')))
                self.send_response(owner.code)
                self.end_headers()
                self.wfile.write(json.dumps(owner.model).encode())

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host.config = {'hub_identity': {
            'hub_id': 'hub-one', 'api_url': f'http://127.0.0.1:{self.server.server_port}/hub/api'}}
        self.host.save(update_fields=['config'])
        self.addCleanup(self.stop_hub)

    def stop_hub(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def call(self, token='user-secret'):
        body = host_tool_call(hub_id='spoofed', hub_user='alice')
        body['user_id'] = 'alice'
        return self.as_agent(self.key).post(reverse('zentinelle:evaluate'), body,
                                            format='json', HTTP_X_JUPYTERHUB_USER_TOKEN=token)

    def test_verified_identity_replaces_claims_and_is_not_cached(self):
        response = self.call()
        self.assertEqual(response.status_code, 200, response.json())
        event = Event.objects.get(tenant_id=self.host.tenant_id, endpoint=self.host)
        self.assertEqual(event.user_identifier, 'hub:hub-one:leo')
        self.assertEqual(event.payload['context']['hub_user'], 'leo')
        self.assertEqual(event.payload['context']['hub_id'], 'hub-one')
        self.assertEqual(self.tokens, [('/hub/api/user', 'token user-secret')])
        self.code = 403
        self.assertEqual(self.call().status_code, 401)
        self.assertEqual(len(self.tokens), 2)

    def test_missing_service_foreign_scope_and_redirect_tokens_are_refused(self):
        self.assertEqual(self.call('').status_code, 401)
        for model in ({'kind': 'service', 'name': 'leo', 'scopes': ['access:servers']},
                      {'kind': 'user', 'name': 'leo', 'scopes': ['access:servers!server=alice/agenthost']},
                      {'kind': 'user', 'name': 'leo', 'scopes': []}):
            with self.subTest(model=model):
                self.model = model
                self.assertEqual(self.call().status_code, 401)
        self.code = 302
        self.assertEqual(self.call().status_code, 401)
        self.assertFalse(Event.objects.filter(tenant_id=self.host.tenant_id, endpoint=self.host).exists())

    def test_unconfigured_endpoint_cannot_accept_a_hub_identity_header(self):
        self.host.config = {}
        self.host.save(update_fields=['config'])
        self.assertEqual(self.call().status_code, 401)
        self.assertEqual(self.evaluate(host_tool_call()).status_code, 200)

    def test_approval_holds_are_private_to_the_verified_user(self):
        self.require_approval_for('Bash')
        response = self.call()
        self.assertEqual(response.status_code, 200, response.json())
        request_id = response.json()['approval']['request_id']
        path = reverse('zentinelle:approval-request', kwargs={'request_id': request_id})
        self.model = {'kind': 'user', 'name': 'alice',
                      'scopes': ['access:servers!server=alice/agenthost']}
        foreign = self.as_agent(self.key).get(path, HTTP_X_JUPYTERHUB_USER_TOKEN='alice-token')
        self.assertEqual(foreign.status_code, 404)
        self.model = {'kind': 'user', 'name': 'leo',
                      'scopes': ['access:servers!server=leo/agenthost']}
        own = self.as_agent(self.key).get(path, HTTP_X_JUPYTERHUB_USER_TOKEN='leo-token')
        self.assertEqual(own.status_code, 200)

    def test_telemetry_cannot_claim_another_user(self):
        response = self.as_agent(self.key).post(reverse('zentinelle:events'), {'events': [{
            'type': 'hub.test', 'timestamp': timezone.now().isoformat(),
            'user_id': 'alice', 'payload': {}}]}, format='json',
            HTTP_X_JUPYTERHUB_USER_TOKEN='leo-token')
        self.assertEqual(response.status_code, 202, response.json())
        event = Event.objects.get(tenant_id=self.host.tenant_id, endpoint=self.host)
        self.assertEqual(event.user_identifier, 'hub:hub-one:leo')

    def test_uuid_approval_references_are_not_partially_redacted(self):
        from zentinelle.services.content_capture import capture_payload

        reference = 'de606746-8cb9-43ce-9bd0-e57b4566b2f8'
        self.assertEqual(capture_payload({'approval_request_id': reference}, self.host.tenant_id),
                         {'approval_request_id': reference})
        self.assertNotIn('approval_token', capture_payload({'approval_token': reference},
                                                           self.host.tenant_id))
