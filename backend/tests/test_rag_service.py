import asyncio
import os
import unittest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from services.rag_service import RAGService


class RAGServicePeriodTotalsTest(unittest.TestCase):
    def setUp(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('NVIDIA_API_KEY', None)
            self.service = RAGService()
        self.service.nim_available = True
        self.service.client = MagicMock()

        self.today = date.today()
        self.this_month = self.today.replace(day=2 if self.today.day >= 2 else 1).isoformat()
        previous_year = self.today.replace(year=self.today.year - 1).isoformat()
        self.expenses = [
            {'amount': 64, 'category': 'Entertainment', 'date': self.this_month, 'item': 'Movie'},
            {'amount': 50, 'category': 'Groceries', 'date': self.this_month, 'item': 'Broom'},
            {'amount': 300, 'category': 'Food', 'date': self.this_month, 'item': 'Tea'},
            {'amount': 900, 'category': 'Transport', 'date': self.this_month, 'item': 'Taxi'},
            {'amount': 15000, 'category': 'Rent', 'date': self.this_month, 'item': 'Room rent'},
            {'amount': 400, 'category': 'Food', 'date': previous_year, 'item': 'Dinner'},
            {'amount': -500, 'category': 'Income', 'date': self.this_month, 'item': 'Salary'},
            {'amount': 1000, 'category': 'Loan', 'date': self.this_month, 'item': 'Loan'},
        ]

    def test_this_month_total_excludes_older_income_and_loan_rows(self):
        response = asyncio.run(self.service.query_expenses(
            'how much i spend this month',
            self.expenses,
            'Gaurav Sah',
        ))

        self.assertIn('Rs.16,314', response)
        self.assertIn('5 transactions', response)
        self.assertIn(self.today.strftime('%B %Y'), response)
        self.assertNotIn('Rs.16,714', response)
        self.service.client.chat.completions.create.assert_not_called()

    def test_empty_current_month_returns_zero_state_instead_of_all_time(self):
        response = asyncio.run(self.service.query_expenses(
            'what are my expenses this month',
            [self.expenses[5]],
            'Gaurav Sah',
        ))

        self.assertIn('no recorded spending', response.lower())
        self.assertIn(self.today.strftime('%B %Y'), response)
        self.service.client.chat.completions.create.assert_not_called()

    def test_category_period_questions_do_not_return_overall_total(self):
        response = asyncio.run(self.service.query_expenses(
            'how much I spend on travel this month',
            self.expenses,
            'Gaurav Sah',
        ))

        self.assertIn('Transport', response)
        self.assertIn('Rs.900', response)
        self.assertNotIn('Rs.16,314', response)
        self.service.client.chat.completions.create.assert_not_called()

    def test_fooding_alias_uses_food_category(self):
        response = asyncio.run(self.service.query_expenses(
            'how much i spend on fooding',
            self.expenses,
            'Gaurav Sah',
        ))

        self.assertIn('Rs.700', response)
        self.assertIn('Food', response)
        self.assertIn('2 transactions', response)
        self.service.client.chat.completions.create.assert_not_called()

    def test_multiple_category_period_question_combines_only_requested_categories(self):
        response = asyncio.run(self.service.query_expenses(
            'how much did I spend on food and travel this month',
            self.expenses,
            'Gaurav Sah',
        ))

        self.assertIn('Food: Rs.300', response)
        self.assertIn('Transport: Rs.900', response)
        self.assertIn('Combined total: Rs.1,200', response)
        self.assertNotIn('Rent', response)
        self.service.client.chat.completions.create.assert_not_called()

    def test_rent_this_week_uses_rent_not_total_week_spending(self):
        response = asyncio.run(self.service.query_expenses(
            'how much I spend on rent this week',
            self.expenses,
            'Gaurav Sah',
        ))

        self.assertIn('Rent', response)
        self.assertIn('Rs.15,000', response)
        self.assertNotIn('Rs.16,314', response)
        self.service.client.chat.completions.create.assert_not_called()

    def test_unknown_spending_target_does_not_return_period_total(self):
        response = asyncio.run(self.service.query_expenses(
            'how much I spend on trouble this month',
            self.expenses,
            'Gaurav Sah',
        ))

        self.assertIn("couldn't find", response.lower())
        self.assertIn('trouble', response.lower())
        self.assertNotIn('Rs.16,314', response)
        self.service.client.chat.completions.create.assert_not_called()

    def test_last_30_days_accepts_compact_wording_and_uses_inclusive_boundary(self):
        rolling_expenses = [
            {'amount': 64, 'category': 'Entertainment', 'date': self.today.isoformat(), 'item': 'Movie'},
            {'amount': 50, 'category': 'Groceries', 'date': (self.today - timedelta(days=10)).isoformat(), 'item': 'Broom'},
            {'amount': 50, 'category': 'Food', 'date': (self.today - timedelta(days=29)).isoformat(), 'item': 'Tea'},
            {'amount': 400, 'category': 'Food', 'date': (self.today - timedelta(days=30)).isoformat(), 'item': 'Old dinner'},
            {'amount': -500, 'category': 'Income', 'date': self.today.isoformat(), 'item': 'Salary'},
            {'amount': 1000, 'category': 'Loan', 'date': self.today.isoformat(), 'item': 'Loan'},
        ]

        for query in (
            'how much i spend in last 30 days',
            'how much i spend in last 30days',
            'how much i spend in last30days',
            'what was my total spending in the past 30 days',
        ):
            with self.subTest(query=query):
                response = asyncio.run(self.service.query_expenses(query, rolling_expenses, 'Gaurav Sah'))
                self.assertIn('Rs.164', response)
                self.assertIn('3 transactions', response)
                self.assertIn('last 30 days', response)

        self.service.client.chat.completions.create.assert_not_called()

        context = self.service._prepare_expense_context(rolling_expenses, 'show spending in last 30days')
        self.assertIn('REQUESTED PERIOD SUMMARY: last 30 days', context)
        self.assertNotIn('ALL-TIME SUMMARY', context)
        self.assertNotIn('Old dinner', context)


if __name__ == '__main__':
    unittest.main()
