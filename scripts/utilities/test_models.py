
import os
import sys
import time

# Add project root to path (scripts/utilities -> pfm)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

try:
    from openai import OpenAI
    from dotenv import load_dotenv
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

# Load env from project root
load_dotenv(os.path.join(PROJECT_ROOT, 'backend/.env'))
api_key = os.getenv('NVIDIA_API_KEY')
if not api_key:
    print("No NVIDIA_API_KEY configured")
    sys.exit(1)

client = OpenAI(base_url=os.getenv('NVIDIA_NIM_BASE_URL', 'https://integrate.api.nvidia.com/v1'), api_key=api_key)
models_to_test = [
    os.getenv('NVIDIA_NIM_MODEL', 'nvidia/nemotron-3-super-120b-a12b'),
    'nvidia/llama-3.3-nemotron-super-49b-v1.5',
]

for model_name in models_to_test:
    print(f"\nTesting model: {model_name}")
    try:
        start = time.time()
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": "Parse this expense briefly: rice cooker 4000"}],
            max_tokens=100,
            stream=False,
        )
        print(f"Success! Time: {time.time() - start:.2f}s")
        print(f"Response: {response.choices[0].message.content}")
    except Exception as e:
        print(f"Failed: {e}")
