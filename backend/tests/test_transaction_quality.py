import asyncio
import unittest

from services.nlp_service import ExpenseParser, NLPService


class TransactionQualityTest(unittest.TestCase):
    def setUp(self):
        self.service = NLPService.__new__(NLPService)
        self.service.nim_available = False
        self.service.parser = ExpenseParser()

    def test_category_keywords_match_whole_words_only(self):
        self.assertEqual('Other', self.service.parser._categorize('i have spent rupees'))
        self.assertEqual('Food', self.service.parser._categorize('coffee'))
        self.assertEqual('Food', self.service.parser._categorize('dahi'))
        self.assertEqual('Education', self.service.parser._categorize('school fee'))

    def test_computer_peripherals_are_electronics(self):
        response = asyncio.run(
            self.service.parse_expense('mouse 300, keyboard 400, monitor 1500', 'expense')
        )

        self.assertEqual(3, len(response['expenses']))
        self.assertEqual(
            ['Electronics', 'Electronics', 'Electronics'],
            [expense['category'] for expense in response['expenses']],
        )
        self.assertFalse(any(expense['needs_confirmation'] for expense in response['expenses']))

    def test_appliance_and_tableware_use_clear_categories(self):
        response = asyncio.run(
            self.service.parse_expense('rice cooker 4000, plates 500, glass 400', 'expense')
        )

        self.assertEqual(3, len(response['expenses']))
        self.assertEqual(
            ['Electronics', 'Kitchenware', 'Kitchenware'],
            [expense['category'] for expense in response['expenses']],
        )
        self.assertFalse(any(expense['needs_confirmation'] for expense in response['expenses']))

    def test_food_served_by_the_plate_stays_food(self):
        response = asyncio.run(self.service.parse_expense('2 plates momo 350', 'expense'))

        self.assertEqual(1, len(response['expenses']))
        self.assertEqual('Food', response['expenses'][0]['category'])
        self.assertEqual(350, response['expenses'][0]['amount'])

    def test_common_home_items_use_specific_categories(self):
        response = asyncio.run(self.service.parse_expense(
            'water bottle 500, chair 1000, shampoo 300, broom 250, '
            'dog food 600, website hosting 1000',
            'expense',
        ))

        self.assertEqual(
            [
                'Kitchenware', 'Furniture', 'Personal Care',
                'Household Cleaning', 'Pet Supplies', 'Software Services',
            ],
            [expense['category'] for expense in response['expenses']],
        )
        self.assertFalse(any(expense['needs_confirmation'] for expense in response['expenses']))

    def test_clear_appliance_and_tableware_override_bad_model_categories(self):
        self.service.nim_entry_model = 'test-entry-model'
        self.service.get_nim_response = lambda *args, **kwargs: '''{
            "expenses": [
                {"amount": 4000, "item": "Rice Cooker", "category": "Food"},
                {"amount": 500, "item": "Plates", "category": "Other"},
                {"amount": 400, "item": "Glass", "category": "Shopping"}
            ]
        }'''

        response = asyncio.run(
            self.service._ai_enhanced_parse('rice cooker 4000, plates 500, glass 400', 'expense')
        )

        self.assertEqual(
            ['Electronics', 'Kitchenware', 'Kitchenware'],
            [expense['category'] for expense in response['expenses']],
        )
        self.assertFalse(any(expense['needs_confirmation'] for expense in response['expenses']))

    def test_clear_electronics_override_bad_model_categories(self):
        self.service.nim_entry_model = 'test-entry-model'
        self.service.get_nim_response = lambda *args, **kwargs: '''{
            "expenses": [
                {"amount": 300, "item": "Mouse", "category": "Shopping"},
                {"amount": 400, "item": "Keyboard", "category": "Other"},
                {"amount": 1500, "item": "Monitor", "category": "Office Supplies"}
            ]
        }'''

        response = asyncio.run(
            self.service._ai_enhanced_parse('mouse 300, keyboard 400, monitor 1500', 'expense')
        )

        self.assertEqual(
            ['Electronics', 'Electronics', 'Electronics'],
            [expense['category'] for expense in response['expenses']],
        )
        self.assertFalse(any(expense['needs_confirmation'] for expense in response['expenses']))

    def test_money_sentence_without_item_is_not_saved(self):
        response = asyncio.run(self.service.parse_expense('I have spent 1000 rupees', 'expense'))

        self.assertEqual([], response['expenses'])
        self.assertIn('could not identify', response['reply'].lower())

    def test_multiple_expense_reply_lists_saved_details(self):
        expenses = [
            {'item': 'Rice Curry', 'amount': 300, 'category': 'Food'},
            {'item': 'Petrol', 'amount': 500, 'category': 'Transport'},
            {'item': 'Fan', 'amount': 1000, 'category': 'Electronics'},
        ]

        reply = self.service._format_entry_reply(expenses, 'expense')

        self.assertIn('Saved 3 expense entries:', reply)
        self.assertIn('Rice Curry: Rs.300, Food', reply)
        self.assertIn('Petrol: Rs.500, Transport', reply)
        self.assertIn('Fan: Rs.1,000, Electronics', reply)
        self.assertNotIn('–', reply)
        self.assertNotIn('—', reply)

    def test_person_returned_amount_is_parsed_as_incoming_loan_repayment(self):
        response = asyncio.run(self.service.parse_expense('Salman returned 5000', 'loan'))

        self.assertEqual(1, len(response['expenses']))
        transaction = response['expenses'][0]
        self.assertEqual(-5000, transaction['amount'])
        self.assertEqual('Loan', transaction['category'])
        self.assertEqual('Salman', transaction['paid_by'])
        self.assertEqual('loan received back', transaction['item'])
        self.assertFalse(transaction['needs_confirmation'])

    def test_user_returned_amount_is_parsed_as_outgoing_loan_repayment(self):
        for text in ('I returned Salman 5000', 'returned 5000 to Salman'):
            with self.subTest(text=text):
                response = asyncio.run(self.service.parse_expense(text, 'loan'))
                transaction = response['expenses'][0]
                self.assertEqual(5000, transaction['amount'])
                self.assertEqual('Salman', transaction['paid_by'])
                self.assertEqual('loan repayment', transaction['item'])
                self.assertFalse(transaction['needs_confirmation'])

    def test_quantity_is_context_not_a_second_expense(self):
        response = asyncio.run(self.service.parse_expense('2ltr petrol 400', 'expense'))

        self.assertEqual(1, len(response['expenses']))
        self.assertEqual(400, response['expenses'][0]['amount'])
        self.assertEqual('Transport', response['expenses'][0]['category'])
        self.assertIn('petrol', response['expenses'][0]['item'].lower())

    def test_spaced_quantity_is_not_expanded_as_lakh(self):
        response = asyncio.run(self.service.parse_expense('2 l petrol 400', 'expense'))

        self.assertEqual(1, len(response['expenses']))
        self.assertEqual(400, response['expenses'][0]['amount'])

    def test_model_cannot_turn_quantity_into_a_second_record(self):
        self.service.nim_entry_model = 'test-entry-model'
        self.service.get_nim_response = lambda *args, **kwargs: '''{
            "expenses": [
                {"amount": 2, "item": "Petrol", "category": "Transport"},
                {"amount": 400, "item": "Ltr", "category": "Other"}
            ]
        }'''

        response = asyncio.run(self.service._ai_enhanced_parse('2ltr petrol 400', 'expense'))

        self.assertEqual(1, len(response['expenses']))
        self.assertEqual(400, response['expenses'][0]['amount'])
        self.assertEqual('Transport', response['expenses'][0]['category'])

    def test_quantity_and_headcount_are_context_not_prices(self):
        text = '5kg rice for 10 peoples 5000'

        self.assertEqual(
            [5000.0],
            [float(match.group(0)) for match in self.service._monetary_number_matches(text)],
        )
        response = asyncio.run(self.service.parse_expense(text, 'expense'))

        self.assertEqual(1, len(response['expenses']))
        self.assertEqual(5000, response['expenses'][0]['amount'])
        self.assertEqual('Food', response['expenses'][0]['category'])
        self.assertIn('rice', response['expenses'][0]['item'].lower())

    def test_multiple_entries_ignore_each_item_quantity(self):
        entries = self.service._split_item_amount_entries('rice 2kg 300 and petrol 2ltr 400')

        self.assertEqual([300.0, 400.0], [entry['amount'] for entry in entries])

        response = asyncio.run(
            self.service.parse_expense('rice 2kg 300 and petrol 2ltr 400', 'expense')
        )
        self.assertEqual([300, 400], [entry['amount'] for entry in response['expenses']])
        self.assertEqual(['Food', 'Transport'], [entry['category'] for entry in response['expenses']])

    def test_media_category_uses_item_evidence_over_bad_model_guess(self):
        transactions = self.service._normalise_media_transactions([{
            'amount': 300,
            'item': 'tea',
            'category': 'Education',
            'remarks': 'Education: Tea',
            'transaction_type': 'expense',
            'confidence': 0.95,
        }], 'expense')

        self.assertEqual(1, len(transactions))
        self.assertEqual('Food', transactions[0]['category'])
        self.assertEqual('Tea', transactions[0]['remarks'])

    def test_media_rejects_generic_item_labels(self):
        transactions = self.service._normalise_media_transactions([{
            'amount': 500,
            'item': 'expense entry: I have spent rupees',
            'category': 'Education',
            'transaction_type': 'expense',
            'confidence': 0.99,
        }], 'expense')

        self.assertEqual([], transactions)


if __name__ == '__main__':
    unittest.main()
