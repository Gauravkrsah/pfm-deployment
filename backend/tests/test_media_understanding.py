import asyncio
import base64
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from services.nlp_service import DEFAULT_MULTIMODAL_MODEL, ExpenseParser, NLPService


class MediaUnderstandingTest(unittest.TestCase):
    def setUp(self):
        self.service = NLPService.__new__(NLPService)
        self.service.nim_available = True
        self.service.nim_multimodal_model = DEFAULT_MULTIMODAL_MODEL
        self.service.nim_client = MagicMock()
        self.service.nim_client.with_options.return_value = self.service.nim_client

    def set_model_text(self, text):
        self.service.nim_client.chat.completions.create.return_value = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=text))]
        )

    def test_image_is_sent_to_omni_model_as_a_data_url(self):
        self.service.parser = MagicMock()
        self.service.parser._clean_item_name.side_effect = lambda value: value
        self.service.parser._categorize.return_value = 'Groceries'
        self.service.parser._normalise_remark.side_effect = lambda remark, item, category: remark or item
        self.service._is_meaningful_transaction_item = MagicMock(return_value=True)
        self.set_model_text('''{
          "intent":"expense",
          "message":"Groceries 450",
          "brief":"A grocery receipt totaling Rs.450.",
          "transactions":[{"amount":450,"item":"Groceries","category":"Groceries","remarks":"ABC Store groceries","transaction_type":"expense","confidence":0.96}]
        }''')
        png = b'\x89PNG\r\n\x1a\n' + b'test-image'

        result = asyncio.run(self.service.understand_media(
            'image',
            'image/png',
            base64.b64encode(png).decode('ascii'),
            'add this receipt',
        ))

        self.assertEqual('Groceries 450', result['text'])
        self.assertEqual('Groceries', result['transactions'][0]['category'])
        self.assertIn('1 transaction', result['summary'])
        request = self.service.nim_client.chat.completions.create.call_args.kwargs
        self.assertEqual(DEFAULT_MULTIMODAL_MODEL, request['model'])
        image_part = request['messages'][0]['content'][1]
        self.assertTrue(image_part['image_url']['url'].startswith('data:image/png;base64,'))
        self.assertFalse(request['extra_body']['chat_template_kwargs']['enable_thinking'])
        self.assertEqual({'type': 'json_object'}, request['response_format'])

    def test_wav_audio_is_transcribed_through_the_same_omni_model(self):
        self.set_model_text('lent 1000 to Ram')
        wav = b'RIFF' + b'\x00\x00\x00\x00' + b'WAVE' + b'audio-data'

        result = asyncio.run(self.service.understand_media(
            'audio',
            'audio/wav',
            base64.b64encode(wav).decode('ascii'),
        ))

        self.assertEqual('lent 1000 to Ram', result['text'])
        request = self.service.nim_client.chat.completions.create.call_args.kwargs
        audio_part = request['messages'][0]['content'][1]
        self.assertTrue(audio_part['audio_url']['url'].startswith('data:audio/wav;base64,'))

    def test_explicit_loan_wording_corrects_a_vision_expense_label(self):
        self.service.parser = ExpenseParser()
        self.set_model_text('''{
          "intent":"expense",
          "message":"I took 1000 from Ram",
          "brief":"A handwritten note saying I took 1000 from Ram.",
          "transactions":[{"amount":1000,"item":"cash","category":"Other","remarks":"cash","transaction_type":"expense","confidence":0.91}]
        }''')
        self.service._is_meaningful_transaction_item = lambda value: True
        png = b'\x89PNG\r\n\x1a\n' + b'test-image'

        result = asyncio.run(self.service.understand_media(
            'image',
            'image/png',
            base64.b64encode(png).decode('ascii'),
        ))

        self.assertEqual('loan', result['intent'])
        self.assertEqual('loan', result['transactions'][0]['transaction_type'])
        self.assertEqual('Loan', result['transactions'][0]['category'])
        self.assertEqual(-1000, result['transactions'][0]['amount'])
        self.assertEqual('Ram', result['transactions'][0]['paid_by'])

    def test_explicit_income_wording_corrects_a_vision_expense_label(self):
        self.service.parser = ExpenseParser()
        self.set_model_text('''{
          "intent":"expense",
          "message":"salary 50000",
          "brief":"A note recording salary 50000.",
          "transactions":[{"amount":50000,"item":"salary","category":"Other","remarks":"salary","transaction_type":"expense","confidence":0.91}]
        }''')
        self.service._is_meaningful_transaction_item = lambda value: True
        png = b'\x89PNG\r\n\x1a\n' + b'test-image'

        result = asyncio.run(self.service.understand_media(
            'image',
            'image/png',
            base64.b64encode(png).decode('ascii'),
        ))

        self.assertEqual('income', result['intent'])
        self.assertEqual('income', result['transactions'][0]['transaction_type'])
        self.assertEqual('Income', result['transactions'][0]['category'])
        self.assertEqual(-50000, result['transactions'][0]['amount'])

    def test_rejects_unsupported_or_falsely_labeled_media(self):
        with self.assertRaises(ValueError):
            asyncio.run(self.service.understand_media('image', 'image/webp', 'AAAA'))

        with self.assertRaises(ValueError):
            asyncio.run(self.service.understand_media(
                'image',
                'image/png',
                base64.b64encode(b'not-a-png').decode('ascii'),
            ))


if __name__ == '__main__':
    unittest.main()
