"""
Tests for zentinelle.services.usage_tracking.UsageTrackingService.

Exercises cost calculation for known models, unknown models,
and exact model ID matching. No database required.
"""
import unittest
from decimal import Decimal

from zentinelle.services.usage_tracking import UsageTrackingService


class TestCalculateCostKnownModels(unittest.TestCase):
    """calculate_cost for models that exist in MODEL_PRICING."""

    def test_gpt4o_cost(self):
        # gpt-4o: input=$2.50/M, output=$10.00/M
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='gpt-4o',
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        self.assertEqual(input_cost, Decimal('2.50'))
        self.assertEqual(output_cost, Decimal('10.00'))

    def test_gpt4o_small_request(self):
        # 1000 input tokens, 500 output tokens
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='gpt-4o',
            input_tokens=1000,
            output_tokens=500,
        )
        # 1000/1M * 2.50 = 0.0025
        expected_input = Decimal('1000') / Decimal('1000000') * Decimal('2.50')
        # 500/1M * 10.00 = 0.005
        expected_output = Decimal('500') / Decimal('1000000') * Decimal('10.00')
        self.assertEqual(input_cost, expected_input)
        self.assertEqual(output_cost, expected_output)

    def test_claude_sonnet_4_5(self):
        # claude-sonnet-4-5-20250929: input=$3.00/M, output=$15.00/M
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='claude-sonnet-4-5-20250929',
            input_tokens=500_000,
            output_tokens=100_000,
        )
        expected_input = Decimal('500000') / Decimal('1000000') * Decimal('3.00')
        expected_output = Decimal('100000') / Decimal('1000000') * Decimal('15.00')
        self.assertEqual(input_cost, expected_input)
        self.assertEqual(output_cost, expected_output)

    def test_gpt4_turbo(self):
        # gpt-4-turbo: input=$10.00/M, output=$30.00/M
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='gpt-4-turbo',
            input_tokens=2_000_000,
            output_tokens=500_000,
        )
        expected_input = Decimal('2000000') / Decimal('1000000') * Decimal('10.00')
        expected_output = Decimal('500000') / Decimal('1000000') * Decimal('30.00')
        self.assertEqual(input_cost, expected_input)
        self.assertEqual(output_cost, expected_output)

    def test_claude_opus_4_1(self):
        # claude-opus-4-1-20250805: input=$15.00/M, output=$75.00/M
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='claude-opus-4-1-20250805',
            input_tokens=100_000,
            output_tokens=50_000,
        )
        expected_input = Decimal('100000') / Decimal('1000000') * Decimal('15.00')
        expected_output = Decimal('50000') / Decimal('1000000') * Decimal('75.00')
        self.assertEqual(input_cost, expected_input)
        self.assertEqual(output_cost, expected_output)

    def test_gpt4o_mini(self):
        # gpt-4o-mini: input=$0.15/M, output=$0.60/M
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='gpt-4o-mini',
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        self.assertEqual(input_cost, Decimal('0.15'))
        self.assertEqual(output_cost, Decimal('0.60'))

    def test_zero_tokens(self):
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='gpt-4o',
            input_tokens=0,
            output_tokens=0,
        )
        self.assertEqual(input_cost, Decimal('0'))
        self.assertEqual(output_cost, Decimal('0'))


class TestCalculateCostUnknownModel(unittest.TestCase):
    """An unpriced model's cost is unknown (None), never zero."""

    def test_completely_unknown_model(self):
        self.assertEqual(UsageTrackingService.calculate_cost(
            model='some-hypothetical-model-v99', input_tokens=1_000_000, output_tokens=1_000_000,
        ), (None, None))

    def test_empty_model_name(self):
        self.assertEqual(UsageTrackingService.calculate_cost(model='', input_tokens=1000, output_tokens=1000),
                         (None, None))


class TestCalculateCostExactMatching(unittest.TestCase):
    """Model IDs match exactly; a snapshot is priced only when listed."""

    def test_listed_gpt4o_snapshot(self):
        """'gpt-4o-2024-08-06' is listed in the catalog at the gpt-4o price."""
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='gpt-4o-2024-08-06',
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        self.assertEqual(input_cost, Decimal('2.50'))
        self.assertEqual(output_cost, Decimal('10.00'))

    def test_unlisted_variant_is_unpriced(self):
        """A name that only contains a priced ID is not priced as it."""
        self.assertEqual(UsageTrackingService.calculate_cost(
            model='claude-sonnet-4-5-20250929-v2', input_tokens=1_000_000, output_tokens=1_000_000,
        ), (None, None))


class TestCostReturnType(unittest.TestCase):
    """Cost values should always be Decimal (not float)."""

    def test_returns_decimal_pair(self):
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='gpt-4o',
            input_tokens=100,
            output_tokens=100,
        )
        self.assertIsInstance(input_cost, Decimal)
        self.assertIsInstance(output_cost, Decimal)

    def test_unknown_returns_none_pair(self):
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='unknown',
            input_tokens=100,
            output_tokens=100,
        )
        self.assertIsNone(input_cost)
        self.assertIsNone(output_cost)
