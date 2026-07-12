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

    def test_courteous_add_command_is_not_mistaken_for_a_question(self):
        self.assertEqual('expense', self.classify('can you add coffee 80?'))


if __name__ == '__main__':
    unittest.main()
