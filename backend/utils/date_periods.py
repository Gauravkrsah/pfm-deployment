import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional


@dataclass(frozen=True)
class DatePeriod:
    start: Optional[date]
    end: Optional[date]
    label: str
    explicit: bool


MONTHS = {
    'january': 1, 'jan': 1,
    'february': 2, 'feb': 2,
    'march': 3, 'mar': 3,
    'april': 4, 'apr': 4,
    'may': 5,
    'june': 6, 'jun': 6,
    'july': 7, 'jul': 7,
    'august': 8, 'aug': 8,
    'september': 9, 'sept': 9, 'sep': 9,
    'october': 10, 'oct': 10,
    'november': 11, 'nov': 11,
    'december': 12, 'dec': 12,
}

ALL_TIME_PHRASES = ('all time', 'till now', 'upto now', 'up to now', 'so far', 'ever')


def _contains_phrase(query: str, *phrases: str) -> bool:
    return any(phrase in query for phrase in phrases)


def _month_end(year: int, month: int) -> date:
    if month == 12:
        return date(year + 1, 1, 1) - timedelta(days=1)
    return date(year, month + 1, 1) - timedelta(days=1)


def resolve_date_period(query: str, today: Optional[date] = None) -> DatePeriod:
    """Resolve common natural-language periods into inclusive calendar dates."""
    query_lower = (query or '').lower().strip()
    today = today or date.today()

    if 'today' in query_lower:
        return DatePeriod(today, today, f"today ({today.isoformat()})", True)

    if 'yesterday' in query_lower:
        yesterday = today - timedelta(days=1)
        return DatePeriod(yesterday, yesterday, f"yesterday ({yesterday.isoformat()})", True)

    if _contains_phrase(query_lower, 'this week', 'current week'):
        start = today - timedelta(days=today.weekday())
        return DatePeriod(start, today, f"this week ({start.isoformat()} to {today.isoformat()})", True)

    if _contains_phrase(query_lower, 'last week', 'previous week'):
        end = today - timedelta(days=today.weekday() + 1)
        start = end - timedelta(days=6)
        return DatePeriod(start, end, f"last week ({start.isoformat()} to {end.isoformat()})", True)

    if _contains_phrase(query_lower, 'this month', 'current month'):
        start = today.replace(day=1)
        return DatePeriod(start, today, f"this month ({today.strftime('%B %Y')})", True)

    if _contains_phrase(query_lower, 'last month', 'previous month'):
        end = today.replace(day=1) - timedelta(days=1)
        start = end.replace(day=1)
        return DatePeriod(start, end, f"last month ({start.strftime('%B %Y')})", True)

    if _contains_phrase(query_lower, 'this year', 'current year'):
        return DatePeriod(date(today.year, 1, 1), today, f"this year ({today.year})", True)

    if _contains_phrase(query_lower, 'last year', 'previous year'):
        year = today.year - 1
        return DatePeriod(date(year, 1, 1), date(year, 12, 31), f"last year ({year})", True)

    # Accept conversational spacing: "last 30 days", "last 30days", and "last30days".
    rolling_days_match = re.search(
        r'\b(?:last|past|previous)\s*(\d+)\s*[-\s]*days?\b',
        query_lower,
    )
    if rolling_days_match:
        days = max(int(rolling_days_match.group(1)), 1)
        start = today - timedelta(days=days - 1)
        return DatePeriod(start, today, f"last {days} days", True)

    year_match = re.search(r'\b(20\d{2})\b', query_lower)
    for month_name, month_number in MONTHS.items():
        if not re.search(rf'\b{re.escape(month_name)}\b', query_lower):
            continue

        year = int(year_match.group(1)) if year_match else today.year
        if not year_match and month_number > today.month:
            year -= 1
        start = date(year, month_number, 1)
        end = _month_end(year, month_number)
        if year == today.year and month_number == today.month:
            end = today
        return DatePeriod(start, end, f"{start.strftime('%B %Y')}", True)

    if year_match:
        year = int(year_match.group(1))
        end = today if year == today.year else date(year, 12, 31)
        return DatePeriod(date(year, 1, 1), end, f"year {year}", True)

    # Keep this after specific periods so phrases such as "this year so far"
    # retain their narrower year/month/week scope.
    if _contains_phrase(query_lower, *ALL_TIME_PHRASES):
        return DatePeriod(None, None, 'all recorded time', True)

    return DatePeriod(None, None, 'all recorded time', False)
