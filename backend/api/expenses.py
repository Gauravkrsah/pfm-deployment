from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from services.nlp_service import NLPService
from services.expense_analyzer import ExpenseAnalyzer

router = APIRouter(tags=["expenses"])

class ParseRequest(BaseModel):
    text: str
    mode: str = "expense"

class IntentRequest(BaseModel):
    text: str
    current_mode: str = "chat"

class MediaUnderstandRequest(BaseModel):
    media_type: str
    mime_type: str
    data: str
    prompt: str = ""

class ChatRequest(BaseModel):
    text: str
    user_id: str = None
    user_email: str = None
    user_name: str = None
    expenses_data: list = Field(default_factory=list)
    group_name: str = None
    group_expenses_data: list = Field(default_factory=list)
    conversation_history: list = Field(default_factory=list)
    voice_mode: bool = False

class VoiceSynthesisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)

class BudgetOptimizerRequest(BaseModel):
    target_reduction: int
    total_expense: float
    target_savings: float
    achieved_cuts: float
    suggestions: List[Dict[str, Any]] = Field(default_factory=list)
    categories: Dict[str, float] = Field(default_factory=dict)

# Initialize services
nlp_service = NLPService()
expense_analyzer = ExpenseAnalyzer()


def humanize_agent_reply(result):
    """Keep assistant punctuation simple and conversational in every text response."""
    if isinstance(result, dict) and isinstance(result.get("reply"), str):
        result["reply"] = result["reply"].replace("–", "-").replace("—", "-")
    return result


@router.post("/parse")
async def parse_expense(request: ParseRequest):
    """Parse expense text and return structured expense data"""
    return humanize_agent_reply(await nlp_service.parse_expense(request.text, request.mode))

@router.post("/intent")
async def classify_intent(request: IntentRequest):
    """Classify an input without creating or modifying any financial records."""
    return await nlp_service.classify_intent(request.text, request.current_mode)

@router.post("/media/understand")
async def understand_media(request: MediaUnderstandRequest):
    """Convert supported image/audio input into text for the existing app flows."""
    try:
        return humanize_agent_reply(await nlp_service.understand_media(
            request.media_type,
            request.mime_type,
            request.data,
            request.prompt,
        ))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@router.post("/voice/synthesize")
async def synthesize_voice(request: VoiceSynthesisRequest):
    """Generate natural neural speech for a completed assistant turn."""
    try:
        audio = await nlp_service.synthesize_voice(request.text)
        return Response(
            content=audio,
            media_type="audio/wav",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@router.post("/chat")
async def chat_about_expenses(request: ChatRequest):
    """Chat about expenses with AI assistance"""
    print(f"[API] Chat request: {request.text}")
    print(f"[API] Expenses data count: {len(request.expenses_data)}")
    result = await nlp_service.chat_about_expenses(request)
    result = humanize_agent_reply(result)
    print(f"[API] Response: {result.get('reply', '')[:100]}...")
    return result

@router.post("/budget-optimizer/explain")
async def explain_budget_optimizer(request: BudgetOptimizerRequest):
    """Generate a grounded explanation for greedy budget optimization results"""
    return humanize_agent_reply(await nlp_service.explain_budget_optimizer(request))
