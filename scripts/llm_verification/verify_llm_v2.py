
import os
import sys
import asyncio

# Add project root to path (scripts/llm_verification -> pfm)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

try:
    import openai
    from dotenv import load_dotenv
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

from backend.services.nlp_service import NLPService

# We need real Env - path relative to project root
load_dotenv(os.path.join(PROJECT_ROOT, 'backend/.env'))

async def main():
    service = NLPService()
    
    print("\n[TEST] Checking NVIDIA NIM Availability...")
    if not service.nim_available:
        print("FAILED: NVIDIA NIM not configured")
        return
    else:
        print(f"SUCCESS: NVIDIA NIM available ({service.nim_model})")

    test_cases = [
        "rice coocker 4000",
        "paid 500 to rahul for momos"
    ]

    print("\n[TEST] Running Complex Parsing...")
    for text in test_cases:
        print(f"\nInput: '{text}'")
        result = await service.parse_expense(text)
        
        reply = result.get('reply', 'NO_REPLY')
        print(f"  Reply: {reply}") # This is what we want to verify

        expenses = result.get('expenses', [])
        for exp in expenses:
            print(f"  Parsed: Item='{exp['item']}', Category='{exp['category']}'")

if __name__ == "__main__":
    asyncio.run(main())
