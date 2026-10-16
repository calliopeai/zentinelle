"""The Django proxy meters what the provider bills (audit H8, H7 proxy half).

The response bodies are the gateway's provider fixtures, so the Go and Python
parsers are held to one manifest of real provider shapes.
"""
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import RequestFactory, SimpleTestCase, TestCase

from zentinelle.models import AgentEndpoint
from zentinelle.models.compliance import InteractionLog
from zentinelle.models.usage import UsageMetric
from zentinelle.proxy.views import ProxyView
from zentinelle.services.provider_usage import parse_usage

FIXTURES = Path(__file__).resolve().parents[3] / 'gateway' / 'testdata' / 'provider_usage'
CASES = json.loads((FIXTURES / 'manifest.json').read_text())['cases']


def canonical(case):
    """The manifest counts cached input inside prompt_tokens; canonical input excludes it."""
    return {
        'input_tokens': case['prompt_tokens'] - case['cache_read_input_tokens'] - case['cache_creation_input_tokens'],
        'output_tokens': case['completion_tokens'],
        'cache_read_tokens': case['cache_read_input_tokens'],
        'cache_write_tokens': case['cache_creation_input_tokens'],
        'usage_reported': case['usage_reported'],
    }


class ProviderUsageParserTests(SimpleTestCase):
    def test_every_gateway_fixture(self):
        for case in CASES:
            with self.subTest(case['name']):
                body = (FIXTURES / case['file']).read_bytes()
                self.assertEqual(parse_usage(body, case['provider']), canonical(case))

    def test_vertex_reads_gemini_usage(self):
        body = (FIXTURES / 'gemini_generate_content_thinking.json').read_bytes()
        self.assertEqual(parse_usage(body, 'vertex')['output_tokens'], 910)

    def test_negative_or_fractional_count_is_not_a_credit(self):
        body = json.dumps({'usage': {'input_tokens': -5000, 'output_tokens': 10.5,
                                     'cache_read_input_tokens': True}})
        self.assertEqual(parse_usage(body, 'anthropic'), {
            'input_tokens': 0, 'output_tokens': 0, 'cache_read_tokens': 0,
            'cache_write_tokens': 0, 'usage_reported': True,
        })

    def test_non_gemini_models_on_google_hosts(self):
        # Claude on Vertex (publishers/anthropic) answers in Anthropic's shape.
        claude = json.dumps({'type': 'message', 'usage': {
            'input_tokens': 50, 'output_tokens': 800, 'cache_read_input_tokens': 9000}})
        self.assertEqual(parse_usage(claude, 'vertex'), {
            'input_tokens': 50, 'output_tokens': 800, 'cache_read_tokens': 9000,
            'cache_write_tokens': 0, 'usage_reported': True,
        })
        stream = (b'event: message_start\ndata: {"type":"message_start","message":{"usage":'
                  b'{"input_tokens":12,"cache_creation_input_tokens":300,"output_tokens":1}}}\n\n'
                  b'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":900}}\n\n')
        self.assertEqual(parse_usage(stream, 'vertex'), {
            'input_tokens': 12, 'output_tokens': 900, 'cache_read_tokens': 0,
            'cache_write_tokens': 300, 'usage_reported': True,
        })
        # The OpenAI-compatible chat endpoint on either host.
        compat = json.dumps({'choices': [], 'usage': {
            'prompt_tokens': 5000, 'completion_tokens': 800,
            'prompt_tokens_details': {'cached_tokens': 1000}}})
        for provider in ('google', 'vertex'):
            self.assertEqual(parse_usage(compat, provider), {
                'input_tokens': 4000, 'output_tokens': 800, 'cache_read_tokens': 1000,
                'cache_write_tokens': 0, 'usage_reported': True,
            })

    def test_cut_short_body_reports_nothing(self):
        self.assertFalse(parse_usage(b'{"usage": {"input_tokens": 1', 'anthropic')['usage_reported'])
        self.assertFalse(parse_usage(b'', 'openai')['usage_reported'])


def _upstream(case):
    body = (FIXTURES / case['file']).read_bytes()
    response = MagicMock()
    response.status_code = 200
    response.content = body
    response.headers = {'content-type': case['content_type']}
    response.iter_bytes.return_value = [body[:len(body) // 2], body[len(body) // 2:]]
    response.__enter__ = MagicMock(return_value=response)
    response.__exit__ = MagicMock(return_value=False)
    client = MagicMock()
    client.__enter__ = MagicMock(return_value=client)
    client.__exit__ = MagicMock(return_value=False)
    client.request.return_value = response
    client.stream.return_value = response
    return client


class ProxyMeteringTests(TestCase):
    tenant_id = 'tenant-proxy-usage'

    def setUp(self):
        key, key_hash, prefix = AgentEndpoint.generate_api_key()
        self.key = key
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=self.tenant_id, agent_id='proxy-agent', name='Proxy agent',
            api_key_hash=key_hash, api_key_prefix=prefix,
        )
        self.auth = SimpleNamespace(valid=True, tenant_id=self.tenant_id, user_id=f'agent:{self.endpoint.id}')

    def _proxy(self, case, provider=None, path=None, status=200):
        provider = provider or case['provider']
        path = path or case['path'].lstrip('/').split('?')[0]
        if provider == 'openai':
            path = path.removeprefix('v1/')
        request = RequestFactory().post(
            f'/proxy/{provider}/{path}', data=json.dumps(case['request']),
            content_type='application/json', HTTP_X_ZENTINELLE_KEY=self.key,
        )
        client = _upstream(case)
        with patch('zentinelle.proxy.views.StandaloneTenantResolver._validate_agent_key', return_value=self.auth), \
             patch('httpx.Client', return_value=client):
            response = ProxyView.as_view()(request, provider=provider, path=path)
        self.assertEqual(response.status_code, status)
        return client

    def _metrics(self):
        rows = UsageMetric.objects.filter(endpoint=self.endpoint)
        self.assertEqual(set(rows.values_list('tenant_id', flat=True)), {self.tenant_id})
        return {row.metric_type: int(row.value) for row in rows}

    def _assert_metered(self, case):
        want = canonical(case)
        M = UsageMetric.MetricType
        metrics = self._metrics()
        self.assertEqual(metrics.get(M.AI_INPUT_TOKENS, 0), want['input_tokens'])
        self.assertEqual(metrics.get(M.AI_OUTPUT_TOKENS, 0), want['output_tokens'])
        self.assertEqual(metrics.get(M.AI_CACHE_READ_TOKENS, 0), want['cache_read_tokens'])
        self.assertEqual(metrics.get(M.AI_CACHE_WRITE_TOKENS, 0), want['cache_write_tokens'])
        row = InteractionLog.objects.get(endpoint=self.endpoint)
        self.assertEqual(row.ai_model, case['model'])
        self.assertEqual(row.input_token_count, case['prompt_tokens'])
        self.assertEqual(row.output_token_count, case['completion_tokens'])
        UsageMetric.objects.all().delete()
        InteractionLog.objects.all().delete()

    def test_streams_and_gemini_are_metered(self):
        for name in ('anthropic messages stream, prompt cache', 'openai responses stream',
                     'gemini generateContent, thinking', 'gemini streamGenerateContent, alt=sse',
                     'gemini streamGenerateContent, JSON array', 'anthropic messages, prompt cache',
                     'openai chat stream, include_usage'):
            case = next(c for c in CASES if c['name'] == name)
            with self.subTest(name):
                self._proxy(case)
                self._assert_metered(case)

    def test_gemini_model_comes_from_the_resolved_path(self):
        case = next(c for c in CASES if c['name'] == 'gemini generateContent, thinking')
        captured = {}
        real_evaluate = __import__('zentinelle.services.policy_engine', fromlist=['PolicyEngine']).PolicyEngine.evaluate

        def evaluate(engine, endpoint, action, context=None, **kwargs):
            captured.setdefault('model', (context or {}).get('model'))
            return real_evaluate(engine, endpoint, action, context=context, **kwargs)

        with patch('zentinelle.services.policy_engine.PolicyEngine.evaluate', evaluate):
            client = self._proxy(case, path='v1beta/models/gemini-2.5-flash/../gemini-2.5-pro:generateContent')
        self.assertEqual(captured['model'], 'gemini-2.5-pro')
        self.assertEqual(client.request.call_args.args[1],
                         'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent')
        self._assert_metered(case)

    def test_vertex_path_cannot_leave_the_project(self):
        case = next(c for c in CASES if c['name'] == 'gemini generateContent, thinking')
        with patch.dict('os.environ', {'VERTEX_REGION': 'us-central1', 'VERTEX_PROJECT': 'mine'}):
            client = self._proxy(
                case, provider='vertex',
                path='../../../../projects/other/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent')
        url = client.request.call_args.args[1]
        self.assertTrue(url.startswith('https://us-central1-aiplatform.googleapis.com/v1/projects/mine/locations/us-central1/'))
        self.assertNotIn('..', url)

    def _deny_output(self):
        """An enabled output filter that denies every response (audit H4, proxy half)."""
        from zentinelle.services.policy_engine import EvaluationResult

        def evaluate(engine, endpoint, action, context=None, **kwargs):
            return EvaluationResult(allowed=action != 'llm:response', reason='blocked')

        filters = MagicMock()
        filters.exists.return_value = True
        return patch('zentinelle.services.policy_engine.PolicyEngine.evaluate', evaluate), \
            patch('zentinelle.models.Policy.objects.filter', return_value=filters)

    def test_a_response_the_output_filter_withholds_is_still_metered(self):
        for name in ('anthropic messages stream, prompt cache', 'anthropic messages, prompt cache'):
            case = next(c for c in CASES if c['name'] == name)
            with self.subTest(name):
                evaluate, filters = self._deny_output()
                with evaluate, filters:
                    self._proxy(case, status=403)
                self._assert_metered(case)

    def test_an_oversize_stream_is_still_metered(self):
        case = next(c for c in CASES if c['name'] == 'anthropic messages stream, prompt cache')
        size = len((FIXTURES / case['file']).read_bytes())
        # The first half of the stream (message_start) is read before the cap.
        with patch('zentinelle.proxy.views.MAX_RESPONSE_SIZE', size - 1):
            self._proxy(case, status=502)
        metrics = self._metrics()
        self.assertEqual(metrics[UsageMetric.MetricType.AI_CACHE_READ_TOKENS], case['cache_read_input_tokens'])

    def test_provider_keys_never_reach_the_log(self):
        case = next(c for c in CASES if c['name'] == 'anthropic messages, prompt cache')
        with patch.dict('os.environ', {'MANAGED_ANTHROPIC_API_KEY': 'sk-ant-managed-secret'}), \
                self.assertLogs('zentinelle.proxy.views', level='INFO') as logs:
            client = self._proxy(case)
        self.assertEqual(client.request.call_args.kwargs['headers']['x-api-key'], 'sk-ant-managed-secret')
        self.assertNotIn('sk-ant-managed-secret', '\n'.join(logs.output))
