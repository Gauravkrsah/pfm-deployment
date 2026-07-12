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
        self.assertEqual('Education', self.service.parser._categorize('school fee'))

    def test_money_sentence_without_item_is_not_saved(self):
        response = asyncio.run(self.service.parse_expense('I have spent 1000 rupees', 'expense'))

        self.assertEqual([], response['expenses'])
        self.assertIn('could not identify', response['reply'].lower())

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
