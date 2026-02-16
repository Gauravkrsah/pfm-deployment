
import os
import sys
import google.generativeai as genai
from dotenv import load_dotenv

# Add project root to path (scripts/utilities -> pfm)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

# Load env from project root
load_dotenv(os.path.join(PROJECT_ROOT, 'backend/.env'))

api_key = os.getenv('GEMINI_API_KEY')
if not api_key:
    print("No API Key")
    sys.exit(1)

genai.configure(api_key=api_key)

print("Listing models...")
try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"- {m.name}")
except Exception as e:
    print(f"Error: {e}")
