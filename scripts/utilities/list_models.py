
import os
import sys
from openai import OpenAI
from dotenv import load_dotenv

# Add project root to path (scripts/utilities -> pfm)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

# Load env from project root
load_dotenv(os.path.join(PROJECT_ROOT, 'backend/.env'))

api_key = os.getenv('NVIDIA_API_KEY')
if not api_key:
    print("No API Key")
    sys.exit(1)

client = OpenAI(base_url=os.getenv('NVIDIA_NIM_BASE_URL', 'https://integrate.api.nvidia.com/v1'), api_key=api_key)

print("Listing models...")
try:
    for model in client.models.list().data:
        print(f"- {model.id}")
except Exception as e:
    print(f"Error: {e}")
