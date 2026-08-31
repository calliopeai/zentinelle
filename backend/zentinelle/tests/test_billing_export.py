"""Usage export to Calliope AI billing (#245).

Most of these are about the failure modes rather than the happy path, because
this is a billing path and the ways it can be quietly wrong all cost somebody
money:

- exporting when nobody switched it on
- marking rows exported when the receiver never accepted them
- sending the same usage twice with nothing to dedupe on
- billing a BYOK customer for tokens they already paid their own provider for
"""
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from zentinelle.models.usage import UsageMetric
from zentinelle.services import billing_export

TENANT_A = "00000000-0000-0000-0000-00000000000a"
TENANT_B = "00000000-0000-0000-0000-00000000000b"

ENABLED = dict(
    BILLING_EXPORT_ENABLED=True,
    BILLING_EXPORT_URL="https://billing.example/ingest",
    BILLING_EXPORT_TOKEN="token",
)


def _metric(tenant_id, metric_type, value, request_id="req-1",
            provider="openai", model="gpt-5", occurred_at=None):
    return UsageMetric.objects.create(
        tenant_id=tenant_id,
        category=UsageMetric.Category.API_TOKENS,
        metric_type=metric_type,
        value=Decimal(str(value)),
        unit="tokens",
        ai_provider=provider,
        ai_model=model,
        ai_request_id=request_id,
        occurred_at=occurred_at or timezone.now(),
    )


class _Response:
    def __init__(self, status_code=202):
        self.status_code = status_code


class BillingExportTest(TestCase):

    # ---- the switch --------------------------------------------------

    def test_nothing_is_exported_when_the_feature_is_off(self):
        """A self-hosted deployment must not start posting usage on upgrade."""
        _metric(TENANT_A, "ai_input_tokens", 100)

        with patch("zentinelle.services.billing_export.httpx.post") as post:
            result = billing_export.export_pending()

        self.assertFalse(result["enabled"])
        self.assertEqual(result["exported"], 0)
        post.assert_not_called()

    @override_settings(BILLING_EXPORT_ENABLED=True, BILLING_EXPORT_URL="")
    def test_enabled_without_a_url_is_still_off(self):
        self.assertFalse(billing_export.is_enabled())

    # ---- grouping ----------------------------------------------------

    @override_settings(**ENABLED)
    def test_one_call_becomes_one_billing_row(self):
        """One row per metric type is stored; billing wants one per call."""
        now = timezone.now()
        _metric(TENANT_A, "ai_input_tokens", 120, occurred_at=now)
        _metric(TENANT_A, "ai_output_tokens", 45, occurred_at=now)

        rows, metric_ids = billing_export.collect_pending()

        self.assertEqual(len(rows), 1)
        self.assertEqual(len(metric_ids), 2)
        self.assertEqual(rows[0]["input_tokens"], 120)
        self.assertEqual(rows[0]["output_tokens"], 45)
        self.assertEqual(rows[0]["total_tokens"], 165)

    @override_settings(**ENABLED)
    def test_different_tenants_never_merge(self):
        now = timezone.now()
        _metric(TENANT_A, "ai_input_tokens", 10, occurred_at=now)
        _metric(TENANT_B, "ai_input_tokens", 20, occurred_at=now)

        rows, _ = billing_export.collect_pending()

        organizations = sorted(r["organization"] for r in rows)
        self.assertEqual(organizations, sorted([TENANT_A, TENANT_B]))

    @override_settings(**ENABLED)
    def test_the_derived_total_is_not_imported(self):
        """`ai_total_tokens` is recomputed, not read.

        Importing both a sum and its parts lets them disagree after a partial
        write, and the disagreement would show up as a billing discrepancy.
        """
        now = timezone.now()
        _metric(TENANT_A, "ai_input_tokens", 10, occurred_at=now)
        _metric(TENANT_A, "ai_output_tokens", 5, occurred_at=now)
        _metric(TENANT_A, "ai_total_tokens", 999, occurred_at=now)

        rows, _ = billing_export.collect_pending()

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["total_tokens"], 15)

    @override_settings(**ENABLED)
    def test_infrastructure_metrics_are_not_exported(self):
        """This path bills governance, not the customer's own hardware."""
        UsageMetric.objects.create(
            tenant_id=TENANT_A,
            category=UsageMetric.Category.INFRASTRUCTURE,
            metric_type="cpu_hours",
            value=Decimal("8"),
            occurred_at=timezone.now(),
        )

        rows, _ = billing_export.collect_pending()

        self.assertEqual(rows, [])

    # ---- the money question ------------------------------------------

    @override_settings(**ENABLED, BILLING_MODE="governance_only")
    def test_governance_mode_never_marks_up_tokens(self):
        """A BYOK customer paid their own provider already.

        Cost is zero and the mode travels with the batch, so the receiver
        prices the control plane rather than the tokens.
        """
        _metric(TENANT_A, "ai_input_tokens", 1000)

        rows, _ = billing_export.collect_pending()

        self.assertEqual(rows[0]["cost"], "0")
        self.assertEqual(rows[0]["billing_mode"], "governance_only")

    def test_the_default_mode_is_the_safe_one(self):
        self.assertEqual(billing_export.billing_mode(), "governance_only")

    # ---- delivery ----------------------------------------------------

    @override_settings(**ENABLED)
    def test_a_successful_export_marks_its_rows(self):
        _metric(TENANT_A, "ai_input_tokens", 100)

        with patch("zentinelle.services.billing_export.httpx.post",
                   return_value=_Response(202)) as post:
            result = billing_export.export_pending()

        self.assertEqual(result["exported"], 1)
        post.assert_called_once()
        self.assertEqual(
            UsageMetric.objects.filter(
                billing_exported_at__isnull=True).count(), 0
        )

    @override_settings(**ENABLED)
    def test_exported_rows_are_not_sent_again(self):
        _metric(TENANT_A, "ai_input_tokens", 100)

        with patch("zentinelle.services.billing_export.httpx.post",
                   return_value=_Response(202)):
            billing_export.export_pending()
            second = billing_export.export_pending()

        self.assertEqual(second["exported"], 0)

    @override_settings(**ENABLED)
    def test_a_refused_batch_leaves_its_rows_unexported(self):
        """The usage must survive the receiver being down.

        Marking before the response is accepted would lose a customer's usage
        permanently on a 500, and it would look like nothing had happened.
        """
        _metric(TENANT_A, "ai_input_tokens", 100)

        with patch("zentinelle.services.billing_export.httpx.post",
                   return_value=_Response(500)):
            with self.assertRaises(billing_export.BillingExportError):
                billing_export.export_pending()

        self.assertEqual(
            UsageMetric.objects.filter(
                billing_exported_at__isnull=True).count(), 1
        )

    @override_settings(**ENABLED)
    def test_an_unreachable_ingest_leaves_its_rows_unexported(self):
        import httpx

        _metric(TENANT_A, "ai_input_tokens", 100)

        with patch("zentinelle.services.billing_export.httpx.post",
                   side_effect=httpx.ConnectError("no route")):
            with self.assertRaises(billing_export.BillingExportError):
                billing_export.export_pending()

        self.assertEqual(
            UsageMetric.objects.filter(
                billing_exported_at__isnull=True).count(), 1
        )

    # ---- idempotency -------------------------------------------------

    @override_settings(**ENABLED)
    def test_the_same_call_always_gets_the_same_event_id(self):
        """Delivery is at-least-once; the receiver dedupes on this.

        A random id would make a retry look like new usage, and the customer
        would be billed twice for one call.
        """
        now = timezone.now()
        _metric(TENANT_A, "ai_input_tokens", 10, occurred_at=now)
        first, _ = billing_export.collect_pending()

        UsageMetric.objects.all().update(billing_exported_at=None)
        second, _ = billing_export.collect_pending()

        self.assertEqual(first[0]["event_id"], second[0]["event_id"])

    @override_settings(**ENABLED)
    def test_different_calls_get_different_event_ids(self):
        now = timezone.now()
        _metric(TENANT_A, "ai_input_tokens", 10, request_id="req-1",
                occurred_at=now)
        _metric(TENANT_A, "ai_input_tokens", 10, request_id="req-2",
                occurred_at=now)

        rows, _ = billing_export.collect_pending()

        self.assertEqual(len({r["event_id"] for r in rows}), 2)

    # ---- shape -------------------------------------------------------

    @override_settings(**ENABLED)
    def test_rows_carry_the_AIUsage_fields(self):
        """Mirrors Client Cove's billing.AIUsage, so it reconciles into the
        same ledger the Managed path feeds."""
        _metric(TENANT_A, "ai_input_tokens", 10)

        rows, _ = billing_export.collect_pending()

        for field in ("organization", "provider", "model", "input_tokens",
                      "output_tokens", "total_tokens", "cost", "timestamp"):
            self.assertIn(field, rows[0])

    # ---- dry run -----------------------------------------------------

    def test_a_dry_run_works_while_the_export_is_off(self):
        """Seeing what would be sent is most useful before switching it on."""
        _metric(TENANT_A, "ai_input_tokens", 100)

        with patch("zentinelle.services.billing_export.httpx.post") as post:
            result = billing_export.export_pending(dry_run=True)

        self.assertEqual(result["would_export"], 1)
        post.assert_not_called()

    @override_settings(**ENABLED)
    def test_a_dry_run_marks_nothing(self):
        _metric(TENANT_A, "ai_input_tokens", 100)

        with patch("zentinelle.services.billing_export.httpx.post"):
            billing_export.export_pending(dry_run=True)

        self.assertEqual(
            UsageMetric.objects.filter(
                billing_exported_at__isnull=True).count(), 1
        )

    # ---- the task ----------------------------------------------------

    @override_settings(**ENABLED)
    def test_the_task_swallows_a_failure_and_leaves_the_work(self):
        """A retry storm against a struggling ingest helps nobody.

        The rows stay unexported either way, so the next scheduled run picks
        them up.
        """
        from zentinelle.tasks.billing import export_usage_to_billing

        _metric(TENANT_A, "ai_input_tokens", 100)

        with patch("zentinelle.services.billing_export.httpx.post",
                   return_value=_Response(503)):
            result = export_usage_to_billing(limit=10)

        self.assertEqual(result["exported"], 0)
        self.assertIn("error", result)
        self.assertEqual(
            UsageMetric.objects.filter(
                billing_exported_at__isnull=True).count(), 1
        )
