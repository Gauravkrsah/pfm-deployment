import sys
import os
from unittest.mock import MagicMock

# Add project root to path (scripts/nlp_tests -> pfm)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

# Mock dependencies before importing nlp_service
sys.modules['dotenv'] = MagicMock()
sys.modules['google.generativeai'] = MagicMock()

from backend.services.nlp_service import ExpenseParser

parser = ExpenseParser()

test_cases = [
    "rice curry 300",
    "momo 100",
    "petrol 500",
    "shirt 2000",
    "biryani rahul 500",
    "rent sonu 20000",
    "samosa for lunch 80",
    "internet bill 1200",
    "taxi to airport 1500",
]

for text in test_cases:
    expenses, reply = parser.parse(text)
    print(f"Input: {text}")
    for exp in expenses:
        print(f"  Result: amount={exp['amount']}, item='{exp['item']}', category='{exp['category']}', remarks='{exp['remarks']}', paid_by={exp['paid_by']}")
    print(f"  Reply: {reply}")
    print("-" * 20)
