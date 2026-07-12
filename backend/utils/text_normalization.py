import re
from typing import Any


def first_name(value: Any, fallback: str = "there") -> str:
    """Return only the first display-name token for user-facing greetings."""
    text = str(value or "").strip()
    if not text:
        return fallback
    if "@" in text:
        text = text.split("@", 1)[0]
    parts = [part for part in re.split(r"[\s._-]+", text) if part]
    if not parts:
        return fallback
    first = parts[0]
    return first[:1].upper() + first[1:]


def clean_spoken_text(value: Any) -> str:
    """Clean speech-recognition artifacts while preserving finance meaning."""
    text = str(value or "").strip()
    if not text:
        return ""

    text = re.sub(r"\s+", " ", text)
    replacements = [
        (r"\b(?:uh+|um+|erm+|er+|ah+|hmm+|mm+)\b", " "),
        (r"\b(?:you know|i mean|kind of|sort of|basically|actually|literally)\b", " "),
        (r"^(?:so|okay|ok|alright|right)\s+", ""),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()

    words = text.split()
    deduped = []
    for word in words:
        normalized = re.sub(r"[^\w]", "", word).lower()
        previous = re.sub(r"[^\w]", "", deduped[-1]).lower() if deduped else ""
        if normalized and normalized == previous:
            continue
        deduped.append(word)

    for size in range(4, 1, -1):
        output = []
        index = 0
        while index < len(deduped):
            current = " ".join(deduped[index:index + size]).lower()
            nxt = " ".join(deduped[index + size:index + size * 2]).lower()
            if current and current == nxt:
                output.extend(deduped[index:index + size])
                index += size * 2
                continue
            output.append(deduped[index])
            index += 1
        deduped = output

    return re.sub(r"\s+", " ", " ".join(deduped)).strip()
