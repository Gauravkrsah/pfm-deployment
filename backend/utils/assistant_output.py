import re
from typing import Optional


_REASONING_SIGNALS = (
    "we need to answer",
    "the user's query",
    "the user says",
    "likely they are asking",
    "possibly they want",
    "we need to",
    "the context is",
    "the instruction",
)


def final_answer_only(value: object) -> Optional[str]:
    """Return user-facing content and reject unclosed/internal reasoning traces."""
    text = str(value or "").replace("\r\n", "\n").strip()
    if not text:
        return None

    if "</think>" in text.lower():
        text = re.split(r"</think>", text, flags=re.IGNORECASE)[-1].strip()
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()

    marker_matches = list(re.finditer(
        r"(?:^|\n|\b)(?:so\s+)?(?:final\s+)?answer\s*:\s*",
        text,
        flags=re.IGNORECASE,
    ))
    if marker_matches:
        text = text[marker_matches[-1].end():].strip()

    text = re.sub(r"^(?:assistant|response)\s*:\s*", "", text, flags=re.IGNORECASE).strip()
    text = text.strip("` \n")
    if not text:
        return None

    lowered = text.lower()
    signal_count = sum(signal in lowered for signal in _REASONING_SIGNALS)
    if signal_count >= 2 or lowered.startswith(("analysis:", "reasoning:", "we need to answer")):
        return None
    return text
