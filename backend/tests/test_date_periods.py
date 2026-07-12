import unittest
from datetime import date

from services.expense_analyzer import ExpenseAnalyzer
from utils.date_periods import resolve_date_period


class DatePeriodResolverTest(unittest.TestCase):
    def test_compact_rolling_day_phrases_share_the_same_range(self):
        today = date(2026, 7, 4)
        expected_start = date(2026, 6, 5)

        for query in ('last 30 days', 'last 30days', 'last30days', 'past 30 days', 'previous30-days'):
            with self.subTest(query=query):
                period = resolve_date_period(query, today=today)
                self.assertEqual(expected_start, period.start)
                self.assertEqual(today, period.end)
                self.assertTrue(period.explicit)

    def test_rule_based_analyzer_uses_the_shared_parser(self):
        start, end, label = ExpenseAnalyzer().extract_time_period('spending in last 30days')

        self.assertEqual(29, (end.date() - start.date()).days)
        self.assertEqual('last 30 days', label)

    def test_so_far_keeps_a_more_specific_period(self):
        today = date(2026, 7, 4)

        year_period = resolve_date_period('how much did I spend this year so far', today=today)
        month_period = resolve_date_period('my spending this month till now', today=today)

        self.assertEqual(date(2026, 1, 1), year_period.start)
        self.assertEqual(date(2026, 7, 1), month_period.start)
        self.assertEqual(today, year_period.end)
        self.assertEqual(today, month_period.end)


if __name__ == '__main__':
    unittest.main()
