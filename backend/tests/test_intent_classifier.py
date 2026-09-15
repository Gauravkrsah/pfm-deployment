import asyncio
import unittest

from services.nlp_service import NLPService


class IntentClassifierTest(unittest.TestCase):
    def setUp(self):
        self.service = NLPService.__new__(NLPService)
        self.service.nim_available = False

    def classify(self, text):
        return asyncio.run(self.service.classify_intent(text))['intent']

    def test_terse_item_and_amount_is_an_expense(self):
        self.assertEqual('expense', self.classify('rice plate 300'))

    def test_expense_overrides_current_income_mode_when_intent_is_enabled(self):
        result = asyncio.run(
            self.service.classify_intent('spend of petrol 500', current_mode='income')
        )
        self.assertEqual('expense', result['intent'])

    def test_ambiguous_money_received_from_person_requires_confirmation(self):
        result = asyncio.run(self.service.classify_intent('Hari gave me 6000'))
        self.assertTrue(result['needs_confirmation'])
        self.assertEqual(['income', 'loan'], result['candidates'])

    def test_ambiguous_transfer_continues_selected_loan_context(self):
        result = asyncio.run(
            self.service.classify_intent('Hari gave me 6000', current_mode='loan')
        )

        self.assertEqual('loan', result['intent'])
        self.assertFalse(result.get('needs_confirmation', False))
        self.assertTrue(result['context_applied'])

    def test_ambiguous_transfer_continues_selected_income_context(self):
        result = asyncio.run(
            self.service.classify_intent('Hari gave me 6000', current_mode='income')
        )

        self.assertEqual('income', result['intent'])
        self.assertFalse(result.get('needs_confirmation', False))

    def test_explicit_repayment_overrides_income_context(self):
        result = asyncio.run(
            self.service.classify_intent('Hari paid me back 6000', current_mode='income')
        )

        self.assertEqual('loan', result['intent'])

    def test_person_returned_amount_is_a_loan_repayment(self):
        result = asyncio.run(
            self.service.classify_intent('Salman returned 5000', current_mode='expense')
        )

        self.assertEqual('loan', result['intent'])
        self.assertFalse(result.get('needs_confirmation', False))

    def test_spend_wording_is_an_expense(self):
        self.assertEqual('expense', self.classify('spend on petrol 600'))

    def test_financial_questions_stay_in_chat_even_with_amounts(self):
        questions = (
            'how much did I spend this month?',
            'did I spend 300 on rice?',
            'what loans do I have?',
            'show me income above 5000',
            'total spent this month',
            'my income this month',
            'expenses above 500',
        )
        for question in questions:
            with self.subTest(question=question):
                self.assertEqual('chat', self.classify(question))

    def test_income_and_loan_statements_choose_their_entry_modes(self):
        self.assertEqual('income', self.classify('salary 50000'))
        self.assertEqual('income', self.classify('record freelance payment 12000'))
        self.assertEqual('loan', self.classify('lent 1000 to Ram'))
        self.assertEqual('loan', self.classify('borrowed 500 from Sita'))
        self.assertEqual('loan', self.classify('I took 1000 from Ram'))

    def test_courteous_add_command_is_not_mistaken_for_a_question(self):
        self.assertEqual('expense', self.classify('can you add coffee 80?'))


if __name__ == '__main__':
    unittest.main()
