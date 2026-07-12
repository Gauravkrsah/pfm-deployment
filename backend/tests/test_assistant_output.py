import asyncio
import unittest

from services.rag_service import RAGService
from services.nlp_service import ExpenseParser
from utils.assistant_output import final_answer_only
from utils.text_normalization import clean_spoken_text, first_name


class AssistantOutputContractTest(unittest.TestCase):
    def test_reasoning_trace_is_reduced_to_final_answer(self):
        leaked = (
            "We need to answer the user's query. The user says this is a follow-up. "
            "The context is food spending. So answer: Yes. The Rs.1,600 food total was for this week."
        )
        self.assertEqual(
            "Yes. The Rs.1,600 food total was for this week.",
            final_answer_only(leaked),
        )

    def test_unclosed_reasoning_without_an_answer_is_rejected(self):
        leaked = "We need to answer the user's query. The context is ambiguous and we need to inspect it."
        self.assertIsNone(final_answer_only(leaked))

    def test_short_follow_up_uses_previous_question_and_answer(self):
        history = [
            {"role": "user", "content": "how much I spend on food this week"},
            {"role": "assistant", "content": "You spent Rs.1600 on food."},
        ]
        service = RAGService.__new__(RAGService)
        answer = asyncio.run(service.query_expenses(
            "in this week or not",
            [],
            conversation_history=history,
            voice_mode=True,
        ))
        self.assertEqual("Yes. Rs.1600 food total was for this week.", answer)

    def test_follow_up_period_is_merged_with_previous_topic(self):
        resolved, answer = RAGService._contextual_follow_up(
            "what about last month",
            [{"role": "user", "content": "how much did I spend on food?"}],
        )
        self.assertIsNone(answer)
        self.assertEqual("How much did I spend on food last month?", resolved)

    def test_user_greeting_uses_first_name_only(self):
        self.assertEqual("Gaurav", first_name("Gaurav Sah"))
        self.assertEqual("Gaurav", first_name("gaurav.sah@example.com"))

    def test_spoken_text_removes_fillers_and_repeated_words(self):
        self.assertEqual(
            "can you add 500 on my income",
            clean_spoken_text("um can you can you actually add 500 on my income"),
        )

    def test_command_words_do_not_become_expense_item_or_remark(self):
        parser = ExpenseParser()
        expenses, reply = parser.parse("can you add the rice plate in expense for 500")
        self.assertEqual(1, len(expenses))
        self.assertEqual("rice plate", expenses[0]["item"].lower())
        self.assertEqual("Rice Plate", expenses[0]["remarks"])
        self.assertIn("rice plate", reply.lower())

    def test_amount_on_item_cleans_leading_on(self):
        parser = ExpenseParser()
        expenses, _ = parser.parse("add 500 on tea")
        self.assertEqual("tea", expenses[0]["item"].lower())
        self.assertEqual("Tea", expenses[0]["remarks"])


if __name__ == "__main__":
    unittest.main()
