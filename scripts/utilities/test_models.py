
import os
import sys
import time

# Add project root to path (scripts/utilities -> pfm)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

try:
    import google.generativeai as genai
    from dotenv import load_dotenv
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

# Load env from project root
load_dotenv(os.path.join(PROJECT_ROOT, 'backend/.env'))
api_key = os.getenv('GEMINI_API_KEY')
genai.configure(api_key=api_key)

models_to_test = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash-lite']

for model_name in models_to_test:
    print(f"\nTesting model: {model_name}")
    try:
        model = genai.GenerativeModel(model_name)
        start = time.time()
        response = model.generate_content("Parse this: rice coocker 4000")
        print(f"Success! Time: {time.time() - start:.2f}s")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Failed: {e}")
