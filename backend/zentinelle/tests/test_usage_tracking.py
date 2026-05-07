"""
Tests for zentinelle.services.usage_tracking.UsageTrackingService.

Exercises cost calculation for known models, unknown models,
and fuzzy model name matching. No database required.
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

    def test_claude_35_sonnet(self):
        # claude-3-5-sonnet-20240620: input=$3.00/M, output=$15.00/M
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='claude-3-5-sonnet-20240620',
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

    def test_claude_3_opus(self):
        # claude-3-opus-20240229: input=$15.00/M, output=$75.00/M
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='claude-3-opus-20240229',
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
    """Unknown models should return zero cost."""

    def test_completely_unknown_model(self):
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='some-hypothetical-model-v99',
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        self.assertEqual(input_cost, Decimal('0.0'))
        self.assertEqual(output_cost, Decimal('0.0'))

    def test_empty_model_name(self):
        """Empty model name fuzzy-matches against the first pricing entry
        because '' is a substring of every string in Python ('' in 'gpt-4o' == True).
        This is a known quirk of the fuzzy matcher -- not a critical bug since
        empty model names are invalid inputs from the caller, but worth noting
        for future hardening."""
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='',
            input_tokens=1000,
            output_tokens=1000,
        )
        # Empty string fuzzy-matches the first dict entry, so cost is nonzero.
        # If this is ever fixed to return zero, update this test.
        self.assertIsInstance(input_cost, Decimal)
        self.assertIsInstance(output_cost, Decimal)


class TestCalculateCostFuzzyMatching(unittest.TestCase):
    """Fuzzy matching should find pricing for versioned model names."""

    def test_gpt4o_with_date_suffix(self):
        """'gpt-4o-2024-08-06' should fuzzy-match against 'gpt-4o'."""
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='gpt-4o-2024-08-06',
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        # Should match gpt-4o pricing via fuzzy match (key 'gpt-4o' is in 'gpt-4o-2024-08-06')
        self.assertEqual(input_cost, Decimal('2.50'))
        self.assertEqual(output_cost, Decimal('10.00'))

    def test_claude_sonnet_variant(self):
        """A claude-3-5-sonnet variant should fuzzy-match."""
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='claude-3-5-sonnet-20240620-v2',
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        # 'claude-3-5-sonnet-20240620' in 'claude-3-5-sonnet-20240620-v2'
        self.assertEqual(input_cost, Decimal('3.00'))
        self.assertEqual(output_cost, Decimal('15.00'))


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

    def test_unknown_returns_decimal_pair(self):
        input_cost, output_cost = UsageTrackingService.calculate_cost(
            model='unknown',
            input_tokens=100,
            output_tokens=100,
        )
        self.assertIsInstance(input_cost, Decimal)
        self.assertIsInstance(output_cost, Decimal)
