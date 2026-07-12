import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from services.nlp_service import DEFAULT_TTS_URL, DEFAULT_TTS_VOICE, NLPService
from services.rag_service import RAGService


class _AsyncClientContext:
    def __init__(self, client):
        self.client = client

    async def __aenter__(self):
        return self.client

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class VoiceSynthesisTest(unittest.TestCase):
    def setUp(self):
        self.service = NLPService.__new__(NLPService)
        self.service.nim_tts_url = DEFAULT_TTS_URL
        self.service.nim_tts_voice = DEFAULT_TTS_VOICE

    def test_spoken_text_removes_markdown_without_changing_numbers(self):
        spoken = self.service._prepare_spoken_text("## Total\nYou spent **Rs.1,250** this month.")
        self.assertEqual("Total You spent rupees 1,250 this month.", spoken)

    def test_magpie_request_returns_neural_audio(self):
        response = MagicMock()
        response.content = b"RIFF" + (b"\x00" * 64)
        response.raise_for_status.return_value = None
        client = MagicMock()
        client.post = AsyncMock(return_value=response)

        with patch.dict(os.environ, {"NVIDIA_API_KEY": "test-key"}), patch(
            "services.nlp_service.httpx.AsyncClient",
            return_value=_AsyncClientContext(client),
        ):
            audio = asyncio.run(self.service.synthesize_voice("Saved Rs.300 for tea."))

        self.assertTrue(audio.startswith(b"RIFF"))
        request = client.post.call_args
        self.assertEqual(DEFAULT_TTS_URL, request.args[0])
        self.assertEqual("Bearer test-key", request.kwargs["headers"]["Authorization"])
        self.assertEqual(DEFAULT_TTS_VOICE, request.kwargs["files"]["voice"][1])

    def test_voice_chat_uses_low_latency_model_and_short_budget(self):
        service = RAGService.__new__(RAGService)
        service.nim_available = True
        service.model = "slow-text-model"
        service.voice_model = "nvidia/nemotron-3-nano-30b-a3b"
        service.client = MagicMock()
        service.client.chat.completions.create.return_value = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="You spent rupees 300."))]
        )
        service.grounded_fallback_answer = MagicMock(return_value=None)
        service._prepare_expense_context = MagicMock(return_value="grounded facts")

        reply = asyncio.run(service.query_expenses(
            "How much did I spend?",
            [],
            voice_mode=True,
        ))

        self.assertEqual("You spent rupees 300.", reply)
        request = service.client.chat.completions.create.call_args.kwargs
        self.assertEqual("nvidia/nemotron-3-nano-30b-a3b", request["model"])
        self.assertEqual(220, request["max_tokens"])
        self.assertFalse(request["extra_body"]["chat_template_kwargs"]["enable_thinking"])


if __name__ == "__main__":
    unittest.main()
