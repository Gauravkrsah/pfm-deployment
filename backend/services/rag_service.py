import os
import re
from collections import defaultdict
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from utils.date_periods import resolve_date_period
from utils.assistant_output import final_answer_only
from utils.text_normalization import first_name

try:
    from openai import OpenAI
    NIM_AVAILABLE = True
except ImportError:
    NIM_AVAILABLE = False
    OpenAI = None

load_dotenv()

DEFAULT_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_NIM_MODEL = "nvidia/nemotron-3-super-120b-a12b"
DEFAULT_NIM_VOICE_MODEL = "nvidia/nemotron-3-nano-30b-a3b"

class RAGService:
    """Grounded financial Q&A using transaction context and NVIDIA NIM."""

    CATEGORY_ALIASES = {
        "food": ["Food"],
        "fooding": ["Food"],
        "meal": ["Food"],
        "meals": ["Food"],
        "restaurant": ["Food"],
        "tea": ["Food"],
        "coffee": ["Food"],
        "grocery": ["Groceries"],
        "groceries": ["Groceries"],
        "travel": ["Travel", "Transport"],
        "travels": ["Travel", "Transport"],
        "transport": ["Transport"],
        "transportation": ["Transport"],
        "petrol": ["Transport"],
        "fuel": ["Transport"],
        "bus": ["Transport"],
        "taxi": ["Transport"],
        "rent": ["Rent"],
        "shopping": ["Shopping"],
        "medical": ["Medical"],
        "health": ["Medical"],
        "education": ["Education"],
        "entertainment": ["Entertainment"],
        "utilities": ["Utilities"],
        "utility": ["Utilities"],
        "water": ["Water Supply", "Utilities"],
        "electricity": ["Utilities"],
        "electronics": ["Electronics"],
        "personal use": ["Personal Use"],
        "personal": ["Personal Use"],
    }
    
    def __init__(self):
        self._setup_nim()

    @staticmethod
    def _contextual_follow_up(query: str, conversation_history: Optional[List[Dict]]):
        """Resolve short follow-ups from the previous turn without asking a model to infer intent."""
        normalized = re.sub(r"\s+", " ", str(query or "").strip().lower())
        history = list(conversation_history or [])
        previous_user = next((
            str(turn.get("content") or "").strip()
            for turn in reversed(history)
            if str(turn.get("role") or "").lower() == "user" and str(turn.get("content") or "").strip()
        ), "")
        previous_assistant = next((
            str(turn.get("content") or "").strip()
            for turn in reversed(history)
            if str(turn.get("role") or "").lower() == "assistant" and str(turn.get("content") or "").strip()
        ), "")
        if not normalized or not previous_user or len(normalized.split()) > 10:
            return str(query or ""), None

        period_pattern = r"\b(?:today|yesterday|this\s+(?:week|month|year)|last\s+(?:week|month|year|\d+\s*days?))\b"
        current_period_match = re.search(period_pattern, normalized)
        previous_period_match = re.search(period_pattern, previous_user.lower())
        categories = (
            "food", "groceries", "transport", "utilities", "rent", "shopping",
            "medical", "entertainment", "education", "travel", "income", "loan",
        )
        previous_topic = next((category for category in categories if re.search(rf"\b{category}\b", previous_user.lower())), None)
        current_topic = next((category for category in categories if re.search(rf"\b{category}\b", normalized)), None)

        if current_period_match and previous_period_match:
            current_period = current_period_match.group(0)
            previous_period = previous_period_match.group(0)
            asks_confirmation = bool(re.search(r"\b(or\s+not|is\s+that|was\s+that|does\s+that|in\s+this)\b", normalized))
            if asks_confirmation and current_period == previous_period:
                amount_match = re.search(r"Rs\.?\s*[\d,]+(?:\.\d+)?", previous_assistant, flags=re.IGNORECASE)
                amount = amount_match.group(0) if amount_match else "That"
                topic = f" {previous_topic}" if previous_topic else ""
                subject = f"{amount}{topic} total" if amount_match else "That answer"
                return str(query or ""), f"Yes. {subject} was for {current_period}."

        if current_period_match and previous_topic:
            return f"How much did I spend on {previous_topic} {current_period_match.group(0)}?", None
        if current_topic and previous_period_match:
            return f"How much did I spend on {current_topic} {previous_period_match.group(0)}?", None
        return str(query or ""), None
    
    def _setup_nim(self):
        """Set up NVIDIA NIM through its OpenAI-compatible API."""
        self.nim_available = False
        self.client = None
        self.model = os.getenv("NVIDIA_NIM_MODEL", DEFAULT_NIM_MODEL)
        self.voice_model = os.getenv("NVIDIA_NIM_VOICE_CHAT_MODEL", DEFAULT_NIM_VOICE_MODEL)

        if not NIM_AVAILABLE:
            print("[X] RAG Service: openai package not installed")
            return
        
        api_key = os.getenv("NVIDIA_API_KEY")
        if api_key and api_key.strip():
            try:
                self.client = OpenAI(
                    base_url=os.getenv("NVIDIA_NIM_BASE_URL", DEFAULT_NIM_BASE_URL),
                    api_key=api_key,
                    timeout=45.0,
                    max_retries=0,
                )
                self.nim_available = True
                print(f"[OK] RAG Service: NVIDIA NIM configured ({self.model})")
            except Exception as e:
                print(f"[X] RAG Service: NVIDIA NIM setup failed: {e}")
    
    def _find_item_matches(self, query: str, expenses_data: List[Dict]) -> Dict[str, Any]:
        """Find expenses matching specific items or categories mentioned in the query"""
        if not query:
            return None
            
        query_lower = query.lower()
        
        # Extract potential item keywords from query
        item_keywords = []
        words = query_lower.split()
        
        # Time-related words to skip
        time_words = ['year', 'month', 'week', 'day', 'today', 'yesterday', 'january', 'february',
                     'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
                     'november', 'december', 'upto', 'time', '2024', '2025', '2026', '2027']
        # Words that indicate aggregate queries, not specific items
        aggregate_keywords = ['total', 'all', 'everything', 'overall', 'sum', 'entire', 'whole', 'complete']
        # Comprehensive stop words - words that should never be item keywords
        stop_words = ['i', 'my', 'how', 'much', 'spend', 'spent', 'on', 'for', 'the', 'a', 'an', 
                     'did', 'do', 'have', 'has', 'what', 'is', 'are', 'was', 'were', 'money', 
                     'expenses', 'expense', 'to', 'from', 'with', 'at', 'in', 'of', 'and', 'or',
                     'this', 'that', 'it', 'me', 'you', 'we', 'they', 'he', 'she', 'am', 'be',
                     'now', 'ever', 'last', 'current', 'past', 'recent', 'till', 'until']
        
        # Look for "on [item]" or "for [item]" patterns
        for i, word in enumerate(words):
            if word in ['on', 'for'] and i + 1 < len(words):
                next_word = words[i + 1]
                if (next_word not in aggregate_keywords and 
                    next_word not in stop_words and 
                    next_word not in time_words and
                    len(next_word) > 2):
                    item_keywords.append(next_word)
        
        # Also check for remaining content words that might be item/category names
        if not item_keywords:
            for word in words:
                if (word not in stop_words and word not in aggregate_keywords 
                    and word not in time_words and len(word) > 2):
                    item_keywords.append(word)
        
        if not item_keywords:
            return None
        
        # Collect all unique categories from data for matching
        all_categories = set()
        for expense in expenses_data:
            cat = expense.get('category', '')
            if cat:
                all_categories.add(cat.lower())
        
        # PRIORITY 1: Check if any keyword matches a CATEGORY name
        # This is critical — "food" should match ALL items in the "Food" category,
        # not just items literally named "food"
        # BUT skip "income" and "loan" — they have dedicated handlers
        skip_categories = {'income', 'loan'}
        category_matches = []
        matched_category = None
        for keyword in item_keywords:
            for cat in all_categories:
                if cat in skip_categories:
                    continue
                if keyword in cat or cat in keyword:
                    matched_category = cat
                    break
            if matched_category:
                break
        
        if matched_category:
            matching_expenses = []
            total_amount = 0
            for expense in expenses_data:
                exp_cat = (expense.get('category') or '').lower()
                if exp_cat == matched_category:
                    matching_expenses.append(expense)
                    total_amount += expense.get('amount', 0)
            
            if matching_expenses:
                return {
                    'item_name': matched_category,
                    'match_type': 'category',
                    'keywords': item_keywords,
                    'total_amount': total_amount,
                    'count': len(matching_expenses),
                    'expenses': matching_expenses
                }
        
        # PRIORITY 2: Check item names and remarks
        matching_expenses = []
        total_amount = 0
        
        for expense in expenses_data:
            item_name = expense.get('item') or ''
            remarks = expense.get('remarks') or ''
            
            for keyword in item_keywords:
                if keyword in item_name.lower() or keyword in remarks.lower():
                    matching_expenses.append(expense)
                    total_amount += expense.get('amount', 0)
                    break
        
        if matching_expenses:
            return {
                'item_name': item_keywords[0],
                'match_type': 'item',
                'keywords': item_keywords,
                'total_amount': total_amount,
                'count': len(matching_expenses),
                'expenses': matching_expenses
            }
        
        return None

    def _parse_date(self, date_str) -> date:
        """Parse date string into date object"""
        if not date_str or date_str == 'N/A':
            return None
        try:
            if isinstance(date_str, date):
                return date_str
            if isinstance(date_str, datetime):
                return date_str.date()
            # Try common formats
            for fmt in ['%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S.%f%z']:
                try:
                    return datetime.strptime(str(date_str)[:26].rstrip('Z'), fmt.rstrip('%z')).date()
                except ValueError:
                    continue
            # Last resort: take first 10 chars as YYYY-MM-DD
            return datetime.strptime(str(date_str)[:10], '%Y-%m-%d').date()
        except Exception:
            return None

    def _amount(self, transaction: Dict) -> float:
        """Return an amount safely even if the stored value is a string."""
        try:
            return float(transaction.get('amount') or 0)
        except (TypeError, ValueError):
            return 0

    def _money(self, amount: float) -> str:
        """Format currency consistently for prompt facts and fallback replies."""
        if float(amount).is_integer():
            return f"Rs.{int(amount):,}"
        return f"Rs.{amount:,.2f}"

    def _is_simple_period_spending_query(self, query: str, expenses_data: List[Dict]) -> bool:
        """Identify simple spending totals that should use deterministic period facts."""
        query_lower = (query or '').lower()
        start, end, _ = self._period_from_query(query)
        if not start and not end:
            return False

        asks_about_spending = bool(re.search(r'\b(spend|spent|spending|expense|expenses)\b', query_lower))
        asks_for_total = bool(re.search(r'\bhow much\b|\btotal\b|\bwhat\b', query_lower))
        if not asks_about_spending or not asks_for_total:
            return False

        analytical_terms = [
            'average', 'daily', 'category', 'categories', 'breakdown', 'distribution',
            'biggest', 'largest', 'highest', 'smallest', 'lowest', 'most expensive',
            'least expensive', 'compare', 'comparison', 'list', 'show', 'recent',
            'income', 'salary', 'loan', 'borrow', 'owe', 'balance', 'remaining',
        ]
        if any(term in query_lower for term in analytical_terms):
            return False

        # Item/category totals need their own scoped calculation rather than the overall total.
        if (
            self._category_names_for_query(query, expenses_data)
            or self._find_item_matches(query, expenses_data)
            or self._has_unmatched_spending_target(query, expenses_data)
        ):
            return False

        return True

    def _existing_expense_categories(self, expenses_data: List[Dict]) -> Dict[str, str]:
        categories = {}
        for transaction in self._expense_rows(expenses_data):
            category = str(transaction.get('category') or '').strip()
            if category:
                categories.setdefault(category.lower(), category)
        return categories

    def _category_names_for_query(self, query: str, expenses_data: List[Dict]) -> List[str]:
        """Return category names explicitly requested by the user, including common aliases."""
        query_lower = re.sub(r"\s+", " ", str(query or "").lower()).strip()
        if not query_lower:
            return []

        existing = self._existing_expense_categories(expenses_data)
        matches = []

        def add_category(category_name: str):
            stored = existing.get(str(category_name or "").lower())
            if stored and stored not in matches:
                matches.append(stored)

        # Direct stored-category match, including multi-word categories.
        for category in sorted(existing.values(), key=len, reverse=True):
            pattern = r"(?<!\w)" + r"\s+".join(re.escape(part) for part in category.lower().split()) + r"(?!\w)"
            if re.search(pattern, query_lower):
                add_category(category)

        # User-friendly aliases: "travel" usually maps to stored Transport in this app.
        for alias, category_options in self.CATEGORY_ALIASES.items():
            pattern = r"(?<!\w)" + r"\s+".join(re.escape(part) for part in alias.split()) + r"(?!\w)"
            if not re.search(pattern, query_lower):
                continue
            for category_name in category_options:
                add_category(category_name)

        return matches

    def _category_spending_facts(self, query: str, expenses_data: List[Dict]) -> Optional[Dict[str, Any]]:
        categories = self._category_names_for_query(query, expenses_data)
        if not categories:
            return None

        start, end, scope_label = self._period_from_query(query)
        category_keys = {category.lower() for category in categories}
        matching_by_category = {category: [] for category in categories}
        for transaction in self._expense_rows(expenses_data):
            category = str(transaction.get('category') or '').strip()
            if category.lower() not in category_keys:
                continue
            transaction_date = self._parse_date(transaction.get('date') or transaction.get('created_at'))
            if start or end:
                if not transaction_date:
                    continue
                if start and transaction_date < start:
                    continue
                if end and transaction_date > end:
                    continue
            canonical = next((name for name in categories if name.lower() == category.lower()), category)
            matching_by_category.setdefault(canonical, []).append(transaction)

        breakdown = []
        for category in categories:
            rows = matching_by_category.get(category, [])
            breakdown.append({
                'category': category,
                'transactions': rows,
                'total': sum(self._amount(transaction) for transaction in rows),
                'count': len(rows),
            })

        return {
            'scope_label': scope_label,
            'categories': categories,
            'breakdown': breakdown,
            'total': sum(item['total'] for item in breakdown),
            'count': sum(item['count'] for item in breakdown),
        }

    def _spending_target_terms(self, query: str) -> List[str]:
        """Extract the thing after 'spend on/for X' so unknown targets don't become total-spend queries."""
        query_lower = re.sub(r"\s+", " ", str(query or "").lower())
        matches = re.findall(
            r"\b(?:spend|spent|spending|expenses?)\s+(?:on|for)\s+(.+?)(?:\b(?:today|yesterday|this|last|past|current)\b|$)",
            query_lower,
        )
        if not matches:
            matches = re.findall(
                r"\b(?:on|for)\s+(.+?)(?:\b(?:today|yesterday|this|last|past|current)\b|$)",
                query_lower,
            )
        terms = []
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'my', 'all', 'total', 'expense', 'expenses',
            'spend', 'spent', 'spending', 'money', 'rs', 'rupees', 'month', 'week', 'year',
        }
        for match in matches:
            for term in re.split(r"\band\b|,|/|&", match):
                cleaned = re.sub(r"[^a-zA-Z\s]", " ", term)
                cleaned = re.sub(r"\b(?:month|week|year|days?|date|time)\b", " ", cleaned)
                words = [word for word in cleaned.split() if word not in stop_words and len(word) > 2]
                if words:
                    terms.append(" ".join(words))
        return terms

    def _has_unmatched_spending_target(self, query: str, expenses_data: List[Dict]) -> bool:
        if not self._spending_target_terms(query):
            return False
        return not self._category_names_for_query(query, expenses_data) and not self._find_item_matches(query, expenses_data)

    def _normalize_name(self, value: Any) -> str:
        """Normalize display names for matching casual group questions."""
        return re.sub(r'[^a-z0-9]', '', str(value or '').lower())

    def _expense_rows(self, rows: List[Dict]) -> List[Dict]:
        """Positive non-income, non-loan transactions count as spending."""
        return [
            transaction for transaction in rows or []
            if self._amount(transaction) > 0
            and (transaction.get('category') or '').lower() not in {'income', 'loan'}
        ]

    def _extract_person_query(self, query: str, expenses_data: List[Dict]) -> Optional[Dict[str, Any]]:
        """Find the group member being asked about, using the added_by field."""
        query_lower = (query or '').lower()
        if not any(word in query_lower for word in ['spend', 'spent', 'expense', 'expenses', 'paid']):
            return None

        spenders = {}
        for transaction in self._expense_rows(expenses_data):
            added_by = str(transaction.get('added_by') or '').strip()
            if not added_by:
                continue
            key = self._normalize_name(added_by)
            if key:
                spenders.setdefault(key, added_by)

        if not spenders:
            return None

        normalized_query = self._normalize_name(query_lower)
        for key, display_name in spenders.items():
            if key and key in normalized_query:
                return {'key': key, 'display_name': display_name}

        words = [
            self._normalize_name(word)
            for word in re.findall(r'[a-zA-Z][a-zA-Z0-9._-]*', query_lower)
        ]
        stop_words = {
            'how', 'much', 'did', 'do', 'does', 'has', 'have', 'spent', 'spend',
            'expense', 'expenses', 'paid', 'pay', 'money', 'total', 'all', 'in',
            'this', 'that', 'group', 'trip', 'the', 'a', 'an', 'by', 'for', 'on',
        }
        for word in words:
            if not word or word in stop_words:
                continue
            for key, display_name in spenders.items():
                if word == key or key.startswith(word) or word.startswith(key):
                    return {'key': key, 'display_name': display_name}

        return None

    def _person_spending_facts(self, query: str, expenses_data: List[Dict]) -> Optional[Dict[str, Any]]:
        person = self._extract_person_query(query, expenses_data)
        if not person:
            return None

        start, end, scope_label = self._period_from_query(query)
        matching_rows = []
        for transaction in self._expense_rows(expenses_data):
            if self._normalize_name(transaction.get('added_by')) != person['key']:
                continue
            transaction_date = self._parse_date(transaction.get('date') or transaction.get('created_at'))
            if start or end:
                if not transaction_date:
                    continue
                if start and transaction_date < start:
                    continue
                if end and transaction_date > end:
                    continue
            matching_rows.append(transaction)

        total = sum(self._amount(transaction) for transaction in matching_rows)
        return {
            'person': person['display_name'],
            'scope_label': scope_label,
            'transactions': matching_rows,
            'total': total,
        }

    def _period_from_query(self, query: str) -> tuple:
        """Resolve a natural-language period into an inclusive date range."""
        period = resolve_date_period(query)
        return period.start, period.end, period.label

    def _retrieve_finance_facts(self, expenses_data: List[Dict], query: str) -> Dict[str, Any]:
        """Calculate authoritative facts for the period implied by the question."""
        start, end, scope_label = self._period_from_query(query)
        all_rows = list(expenses_data or [])
        scoped_rows = []
        for transaction in all_rows:
            transaction_date = self._parse_date(transaction.get('date') or transaction.get('created_at'))
            if start or end:
                if not transaction_date:
                    continue
                if start and transaction_date < start:
                    continue
                if end and transaction_date > end:
                    continue
            scoped_rows.append(transaction)

        expenses = [
            transaction for transaction in scoped_rows
            if self._amount(transaction) > 0
            and (transaction.get('category') or '').lower() not in {'income', 'loan'}
        ]
        incomes = [
            transaction for transaction in scoped_rows
            if (transaction.get('category') or '').lower() == 'income'
            or (
                self._amount(transaction) < 0
                and (transaction.get('category') or '').lower() != 'loan'
            )
        ]
        loans = [
            transaction for transaction in scoped_rows
            if (transaction.get('category') or '').lower() == 'loan'
        ]
        sorted_expenses = sorted(expenses, key=self._amount, reverse=True)
        category_totals = defaultdict(float)
        category_counts = defaultdict(int)
        member_totals = defaultdict(float)
        member_counts = defaultdict(int)
        monthly_totals = defaultdict(float)
        for transaction in expenses:
            category = transaction.get('category') or 'Other'
            category_totals[category] += self._amount(transaction)
            category_counts[category] += 1
            added_by = transaction.get('added_by') or 'Unknown'
            member_totals[added_by] += self._amount(transaction)
            member_counts[added_by] += 1
            transaction_date = self._parse_date(transaction.get('date') or transaction.get('created_at'))
            if transaction_date:
                monthly_totals[transaction_date.strftime('%Y-%m')] += self._amount(transaction)

        loan_given = sum(self._amount(transaction) for transaction in loans if self._amount(transaction) > 0)
        loan_received = sum(abs(self._amount(transaction)) for transaction in loans if self._amount(transaction) < 0)
        total_expenses = sum(self._amount(transaction) for transaction in expenses)
        total_income = sum(abs(self._amount(transaction)) for transaction in incomes)
        dated_months = sorted(monthly_totals.items(), reverse=True)

        return {
            'scope_label': scope_label,
            'scope_start': start,
            'scope_end': end,
            'rows': scoped_rows,
            'expenses': expenses,
            'incomes': incomes,
            'loans': loans,
            'total_expenses': total_expenses,
            'total_income': total_income,
            'net_balance': total_income - total_expenses,
            'loan_given': loan_given,
            'loan_received': loan_received,
            'largest_expense': sorted_expenses[0] if sorted_expenses else None,
            'smallest_expense': sorted_expenses[-1] if sorted_expenses else None,
            'ranked_expenses': sorted_expenses,
            'ranked_categories': sorted(category_totals.items(), key=lambda item: item[1], reverse=True),
            'category_counts': category_counts,
            'ranked_members': sorted(member_totals.items(), key=lambda item: item[1], reverse=True),
            'member_counts': member_counts,
            'monthly_totals': dated_months,
        }

    def _describe_transaction(self, transaction: Optional[Dict]) -> str:
        if not transaction:
            return "none"
        amount = self._money(self._amount(transaction))
        item = transaction.get('item') or transaction.get('remarks') or 'unspecified item'
        category = transaction.get('category') or 'Other'
        transaction_date = transaction.get('date') or transaction.get('created_at') or 'date not recorded'
        added_by = transaction.get('added_by')
        member_info = f" by {added_by}" if added_by else ""
        return f"{amount} for {item} [{category}] on {transaction_date}{member_info}"

    def _retrieved_facts_context(self, facts: Dict[str, Any]) -> str:
        """Serialize precise calculations for the LLM without asking it to infer them."""
        lines = [
            "=== QUERY-RELEVANT RETRIEVED FACTS (AUTHORITATIVE) ===",
            f"Requested scope: {facts['scope_label']}",
            f"Records in scope: {len(facts['rows'])}",
            "Definition: personal expenses are positive transactions excluding Income and Loan categories.",
            f"Personal expenses: {self._money(facts['total_expenses'])} across {len(facts['expenses'])} transactions",
            f"Income: {self._money(facts['total_income'])} across {len(facts['incomes'])} transactions",
            f"Income minus personal expenses: {self._money(facts['net_balance'])}",
            f"Loans given: {self._money(facts['loan_given'])}; loans received: {self._money(facts['loan_received'])}",
        ]
        if facts['expenses']:
            lines.extend([
                f"Largest individual expense: {self._describe_transaction(facts['largest_expense'])}",
                f"Smallest individual expense: {self._describe_transaction(facts['smallest_expense'])}",
                "Largest individual expenses ranked:",
            ])
            for transaction in facts['ranked_expenses'][:5]:
                lines.append(f"  - {self._describe_transaction(transaction)}")
            lines.append("Smallest individual expenses ranked:")
            for transaction in reversed(facts['ranked_expenses'][-5:]):
                lines.append(f"  - {self._describe_transaction(transaction)}")
        if facts['ranked_categories']:
            lines.append("Category totals ranked:")
            for category, amount in facts['ranked_categories']:
                count = facts['category_counts'][category]
                lines.append(f"  - {category}: {self._money(amount)} across {count} transactions")
        if facts.get('ranked_members'):
            lines.append("Group member spending totals by added_by:")
            for member, amount in facts['ranked_members']:
                count = facts['member_counts'][member]
                lines.append(f"  - {member}: {self._money(amount)} across {count} transactions")
        if facts['monthly_totals']:
            lines.append("Monthly expense totals in scope:")
            for month, total in facts['monthly_totals'][:12]:
                lines.append(f"  - {month}: {self._money(total)}")
        return "\n".join(lines)

    def grounded_fallback_answer(self, query: str, expenses_data: List[Dict], user_name: str) -> Optional[str]:
        """Provide accurate answers to key data questions when generation is unavailable."""
        facts = self._retrieve_finance_facts(expenses_data, query)
        query_lower = (query or '').lower()
        greeting = f"Hi {first_name(user_name)}!"

        person_spending = self._person_spending_facts(query, expenses_data)
        if person_spending:
            person = person_spending['person']
            total = person_spending['total']
            transactions = person_spending['transactions']
            if not transactions:
                return f"{greeting} {person} has no recorded expenses for {person_spending['scope_label']}."
            details = "; ".join(
                f"{self._money(self._amount(transaction))} on {transaction.get('item') or transaction.get('remarks') or 'item'}"
                for transaction in transactions[:5]
            )
            return (
                f"{greeting} {person} spent {self._money(total)} for {person_spending['scope_label']} "
                f"across {len(transactions)} transaction{'s' if len(transactions) != 1 else ''}. "
                f"Breakdown: {details}."
            )

        category_spending = self._category_spending_facts(query, expenses_data)
        if category_spending:
            breakdown = category_spending['breakdown']
            if not category_spending['count']:
                category_list = " and ".join(item['category'] for item in breakdown)
                return f"{greeting} You have no recorded {category_list} spending for {category_spending['scope_label']}."

            if len(breakdown) == 1:
                item = breakdown[0]
                return (
                    f"{greeting} You spent {self._money(item['total'])} on {item['category']} "
                    f"for {category_spending['scope_label']} across {item['count']} "
                    f"transaction{'s' if item['count'] != 1 else ''}."
                )

            details = "; ".join(
                f"{item['category']}: {self._money(item['total'])} across {item['count']} transaction{'s' if item['count'] != 1 else ''}"
                for item in breakdown
            )
            return (
                f"{greeting} For {category_spending['scope_label']}, {details}. "
                f"Combined total: {self._money(category_spending['total'])} across "
                f"{category_spending['count']} transaction{'s' if category_spending['count'] != 1 else ''}."
            )

        if self._has_unmatched_spending_target(query, expenses_data):
            target = ", ".join(self._spending_target_terms(query))
            return (
                f"{greeting} I couldn't find any recorded spending category or item matching "
                f"\"{target}\" for {facts['scope_label']}."
            )

        if self._is_simple_period_spending_query(query, expenses_data):
            if not facts['expenses']:
                return f"{greeting} You have no recorded spending for {facts['scope_label']}."
            return (
                f"{greeting} You spent {self._money(facts['total_expenses'])} for {facts['scope_label']} "
                f"across {len(facts['expenses'])} transaction{'s' if len(facts['expenses']) != 1 else ''}."
            )

        if not facts['expenses']:
            return None

        asks_extrema = (
            any(word in query_lower for word in ['biggest', 'largest', 'highest', 'smallest', 'lowest', 'most expensive', 'least expensive'])
            and any(word in query_lower for word in ['expense', 'spent', 'spend', 'transaction'])
        )
        if asks_extrema:
            return (
                f"{greeting} For {facts['scope_label']}, your biggest expense was "
                f"{self._describe_transaction(facts['largest_expense'])}. Your smallest expense was "
                f"{self._describe_transaction(facts['smallest_expense'])}. "
                f"This comparison excludes income and loans; it covers {len(facts['expenses'])} expense transactions "
                f"totaling {self._money(facts['total_expenses'])}."
            )

        if any(word in query_lower for word in ['category', 'breakdown', 'distribution', 'most']):
            top_categories = facts['ranked_categories'][:5]
            details = "; ".join(
                f"{category}: {self._money(amount)}" for category, amount in top_categories
            )
            return (
                f"{greeting} Your top spending categories for {facts['scope_label']} are {details}. "
                f"Total personal spending was {self._money(facts['total_expenses'])} "
                f"across {len(facts['expenses'])} transactions."
            )
        return None

    def _prepare_expense_context(self, expenses_data: List[Dict], query: str = None) -> str:
        """Prepare structured expense data for RAG with time-aware grouping"""
        if not expenses_data:
            return "=== QUERY-RELEVANT RETRIEVED FACTS (AUTHORITATIVE) ===\nNo recorded transactions available."
        
        today = date.today()
        retrieved_facts = self._retrieve_finance_facts(expenses_data, query or '')
        has_date_scope = bool(retrieved_facts['scope_start'] or retrieved_facts['scope_end'])
        context_rows = retrieved_facts['rows']
        
        # Check for item-specific query first
        item_match = None
        if query:
            item_match = self._find_item_matches(query, retrieved_facts['rows'])
        
        # Keep the model's supporting context inside the requested period. Mixing in
        # all-time totals here makes otherwise-correct date retrieval ambiguous.
        expenses = retrieved_facts['expenses']
        income = retrieved_facts['incomes']
        loans = retrieved_facts['loans']
        
        # Build context
        context_parts = [self._retrieved_facts_context(retrieved_facts)]
        
        # Current date context
        context_parts.append(f"TODAY'S DATE: {today.strftime('%Y-%m-%d')} ({today.strftime('%A, %B %d, %Y')})")
        context_parts.append(f"CURRENT YEAR: {today.year}")
        context_parts.append(f"CURRENT MONTH: {today.strftime('%B %Y')}")
        
        # --- Scope Summary ---
        total_expense = sum(self._amount(e) for e in expenses)
        total_income = sum(abs(self._amount(e)) for e in income)
        net_balance = total_income - total_expense

        summary_title = (
            f"REQUESTED PERIOD SUMMARY: {retrieved_facts['scope_label']}"
            if has_date_scope else "ALL-TIME SUMMARY"
        )
        context_parts.append(f"\n=== {summary_title} ===")
        context_parts.append(f"Total Expenses in scope: Rs.{total_expense}")
        context_parts.append(f"Total Income in scope: Rs.{total_income}")
        context_parts.append(f"Net Balance: Rs.{net_balance}")
        context_parts.append(f"Savings Rate: {int((net_balance/total_income*100) if total_income > 0 else 0)}%")
        
        # --- Yearly Breakdown ---
        yearly_data = {}
        for exp in expenses:
            d = self._parse_date(exp.get('date') or exp.get('created_at'))
            if d:
                year = d.year
                cat = exp.get('category', 'Other')
                if year not in yearly_data:
                    yearly_data[year] = {'total': 0, 'categories': {}, 'count': 0}
                yearly_data[year]['total'] += exp.get('amount', 0)
                yearly_data[year]['count'] += 1
                yearly_data[year]['categories'][cat] = yearly_data[year]['categories'].get(cat, 0) + exp.get('amount', 0)
        
        if yearly_data:
            context_parts.append(f"\n=== YEARLY BREAKDOWN ===")
            for year in sorted(yearly_data.keys(), reverse=True):
                yd = yearly_data[year]
                context_parts.append(f"\nYear {year}: Rs.{yd['total']} total ({yd['count']} transactions)")
                for cat, amt in sorted(yd['categories'].items(), key=lambda x: x[1], reverse=True):
                    cat_count = len([e for e in expenses if (self._parse_date(e.get('date') or e.get('created_at')) or today).year == year and e.get('category') == cat])
                    context_parts.append(f"  {cat}: Rs.{amt} ({cat_count} txns)")
        
        # --- Monthly Breakdown ---
        monthly_data = {}
        for exp in expenses:
            d = self._parse_date(exp.get('date') or exp.get('created_at'))
            if d:
                month_key = d.strftime('%Y-%m')
                month_name = d.strftime('%B %Y')
                cat = exp.get('category', 'Other')
                if month_key not in monthly_data:
                    monthly_data[month_key] = {'name': month_name, 'total': 0, 'categories': {}, 'count': 0}
                monthly_data[month_key]['total'] += exp.get('amount', 0)
                monthly_data[month_key]['count'] += 1
                monthly_data[month_key]['categories'][cat] = monthly_data[month_key]['categories'].get(cat, 0) + exp.get('amount', 0)
        
        if monthly_data:
            context_parts.append("\n=== MONTHLY BREAKDOWN IN REQUESTED SCOPE ===")
            for mk in sorted(monthly_data.keys(), reverse=True):
                md = monthly_data[mk]
                context_parts.append(f"\n{md['name']}: Rs.{md['total']} ({md['count']} transactions)")
                for cat, amt in sorted(md['categories'].items(), key=lambda x: x[1], reverse=True):
                    context_parts.append(f"  {cat}: Rs.{amt}")
        
        # Category breakdown for the requested scope
        categories = {}
        for exp in expenses:
            cat = exp.get('category', 'Other')
            categories[cat] = categories.get(cat, 0) + exp.get('amount', 0)
        
        if categories:
            context_parts.append("\n=== CATEGORY BREAKDOWN IN REQUESTED SCOPE ===")
            for cat, amt in sorted(categories.items(), key=lambda x: x[1], reverse=True):
                count = len([e for e in expenses if e.get('category') == cat])
                context_parts.append(f"  {cat}: Rs.{amt} ({count} transactions)")

        member_totals = {}
        for exp in expenses:
            member = exp.get('added_by') or 'Unknown'
            if member not in member_totals:
                member_totals[member] = {'total': 0, 'count': 0}
            member_totals[member]['total'] += exp.get('amount', 0)
            member_totals[member]['count'] += 1

        if member_totals:
            context_parts.append("\n=== GROUP MEMBER SPENDING BY ADDED_BY IN REQUESTED SCOPE ===")
            context_parts.append("Use this section for questions like 'how much did Nirmal spend'.")
            for member, values in sorted(member_totals.items(), key=lambda x: x[1]['total'], reverse=True):
                context_parts.append(f"  {member}: Rs.{values['total']} ({values['count']} transactions)")
        
        # Loan breakdown by person
        if loans:
            context_parts.append("\nLoan Details by Person:")
            person_loans = {}
            for loan in loans:
                person = loan.get('paid_by', '').lower().strip()
                amt = loan.get('amount', 0)
                
                if person:
                    person_clean = person.replace('s', '').replace('n', '')[:3]
                    person_normalized = None
                    for existing_key in person_loans.keys():
                        existing_clean = existing_key.replace('s', '').replace('n', '')[:3]
                        if person_clean == existing_clean:
                            person_normalized = existing_key
                            break
                    
                    if not person_normalized:
                        person_normalized = person
                    
                    if person_normalized not in person_loans:
                        person_loans[person_normalized] = {'given': 0, 'taken': 0, 'original_name': person}
                    else:
                        person_loans[person_normalized]['original_name'] = person
                    
                    if amt > 0:
                        person_loans[person_normalized]['given'] += amt
                    else:
                        person_loans[person_normalized]['taken'] += abs(amt)
            
            for person_key, amounts in person_loans.items():
                person_name = amounts['original_name'].title()
                given = amounts['given']
                taken = amounts['taken']
                
                if taken > given:
                    net_owed = taken - given
                    context_parts.append(f"  {person_name}: Borrowed Rs.{taken} from them, Repaid Rs.{given} = YOU OWE Rs.{net_owed}")
                elif given > taken:
                    net_owed = given - taken
                    context_parts.append(f"  {person_name}: Lent Rs.{given} to them, Received back Rs.{taken} = THEY OWE Rs.{net_owed}")
                else:
                    context_parts.append(f"  {person_name}: Settled (borrowed Rs.{taken}, repaid Rs.{given})")
        
        # ITEM/CATEGORY MATCHING
        if item_match:
            item_name = item_match['item_name'].title()
            match_type = item_match.get('match_type', 'item')
            total_amt = item_match['total_amount']
            count = item_match['count']
            keywords = item_match.get('keywords', [item_match['item_name']])
            
            match_label = "CATEGORY" if match_type == 'category' else "ITEM"
            context_parts.append(f"\n*** {match_label} MATCH: '{item_name}' (USE THIS FOR {match_label} QUERIES) ***")
            context_parts.append(f"Match type: {match_label} (matched '{item_name}' {match_type})")
            context_parts.append(
                f"Total spent on {match_label.lower()} '{item_name}' for {retrieved_facts['scope_label']}: "
                f"Rs.{total_amt} across {count} transactions"
            )
            
            # Group item matches by year
            item_by_year = {}
            for exp in item_match['expenses']:
                d = self._parse_date(exp.get('date') or exp.get('created_at'))
                yr = d.year if d else 'Unknown'
                if yr not in item_by_year:
                    item_by_year[yr] = {'total': 0, 'count': 0, 'transactions': []}
                item_by_year[yr]['total'] += exp.get('amount', 0)
                item_by_year[yr]['count'] += 1
                item_by_year[yr]['transactions'].append(exp)
            
            for yr in sorted(item_by_year.keys(), key=lambda x: str(x), reverse=True):
                yd = item_by_year[yr]
                context_parts.append(f"\n  Year {yr}: Rs.{yd['total']} ({yd['count']} transactions)")
                for exp in yd['transactions']:
                    amt = exp.get('amount', 0)
                    item = exp.get('item', 'item')
                    cat = exp.get('category', 'Other')
                    exp_date = exp.get('date', 'N/A')
                    context_parts.append(f"    - Rs.{amt} on {item} [{cat}] ({exp_date})")
            
            context_parts.append(f"\n*** END {match_label} MATCH ***")
        
        # Transactions with dates inside the same retrieved scope
        all_non_loan = [e for e in context_rows if (e.get('category') or '').lower() != 'loan']
        if all_non_loan:
            context_parts.append(f"\n=== TRANSACTIONS IN REQUESTED SCOPE ({len(all_non_loan)} total) ===")
            for exp in all_non_loan[:100]:  # Cap at 100 to avoid token overflow
                amt = exp.get('amount', 0)
                item = exp.get('item', 'item')
                cat = exp.get('category', 'Other')
                exp_date = exp.get('date', exp.get('created_at', 'N/A'))
                paid_by = exp.get('paid_by', '')
                added_by = exp.get('added_by', '')
                paid_info = f" paid_by={paid_by}" if paid_by else ""
                added_info = f" added_by={added_by}" if added_by else ""
                context_parts.append(f"  Rs.{amt} - {item} [{cat}] on {exp_date}{added_info}{paid_info}")
            if len(all_non_loan) > 100:
                context_parts.append(f"  ... and {len(all_non_loan) - 100} more transactions")
        
        context_str = "\n".join(context_parts)
        return context_str
    
    async def query_expenses(
        self,
        query: str,
        expenses_data: List[Dict],
        user_name: str = "there",
        conversation_history: Optional[List[Dict]] = None,
        voice_mode: bool = False,
    ) -> Optional[str]:
        """Answer user-finance questions with records as grounded context."""
        user_name = first_name(user_name)
        query, contextual_answer = self._contextual_follow_up(query, conversation_history)
        if contextual_answer:
            return contextual_answer
        fallback_response = self.grounded_fallback_answer(query, expenses_data, user_name)
        if fallback_response and (
            self._person_spending_facts(query, expenses_data)
            or self._category_spending_facts(query, expenses_data)
            or self._has_unmatched_spending_target(query, expenses_data)
            or self._is_simple_period_spending_query(query, expenses_data)
        ):
            return fallback_response
        if not self.nim_available or not self.client:
            return fallback_response
        
        try:
            # Prepare context from expense data (pass query for item-specific filtering)
            expense_context = self._prepare_expense_context(expenses_data, query)
            history_lines = []
            for turn in (conversation_history or [])[-8:]:
                role = str(turn.get('role', '')).lower()
                content = str(turn.get('content', '')).strip()
                if role in {'user', 'assistant'} and content:
                    history_lines.append(f"{role.title()}: {content[:500]}")
            history_context = "\n".join(history_lines) if history_lines else "No previous messages."
            
            today = date.today()
            response_mode = (
                "Live voice: answer naturally in one or two short sentences. Lead with the answer. "
                "Do not use headings, lists, tables, greetings, or filler."
                if voice_mode else
                "Text chat: follow the depth and formatting instructions below."
            )
            conversation_instruction = (
                "Be conversational and direct; do not begin with a greeting in a live voice turn."
                if voice_mode else
                f"Be conversational and friendly - start with \"Hi {user_name}!\""
            )
            
            # Build RAG prompt
            prompt = f"""You are a careful, analytical personal finance assistant. Give a high-quality answer to the user's finance question using retrieved financial facts.

USER: {user_name}
QUERY: "{query}"
TODAY'S DATE: {today.strftime('%Y-%m-%d')} ({today.strftime('%A, %B %d, %Y')})
CURRENT YEAR: {today.year}
RESPONSE MODE: {response_mode}

RECENT CONVERSATION CONTEXT (only to understand follow-up references):
{history_context}

EXPENSE DATA:
{expense_context}

INSTRUCTIONS:
1. The QUERY-RELEVANT RETRIEVED FACTS section is authoritative. For personalized statements and calculations, use ONLY supplied facts and exact numbers.
   Conversation history may clarify the question, but it is never authoritative financial data.
2. For general finance questions (budgeting, saving, debt concepts, emergency funds, financial habits), answer helpfully even if there are no records. Clearly state when advice is general rather than based on this user's data.
3. Never invent the user's transactions, income, balance, budget, goals, interest rates, or risk tolerance.
4. {conversation_instruction}
5. Use exact numbers from the data whenever answering about recorded activity.
6. **CRITICAL: TIME-BASED QUERIES**:
   - "this year" / "this year so far" = only transactions in {today.year}
   - "last year" = only transactions in {today.year - 1}
   - "in 2025" = only transactions in year 2025
   - "this month" = only transactions in {today.strftime('%B %Y')}
   - "last N days", including compact wording such as "last 30days", = only the query-relevant retrieved period
   - "all time" / "total" / "ever" / "up to now" = sum of ALL transactions across all years
   - The QUERY-RELEVANT RETRIEVED FACTS and all supporting sections are already filtered to the requested period
   - Never claim transaction dates are unavailable when a requested-period summary is supplied
   - Use the YEARLY BREAKDOWN and MONTHLY BREAKDOWN sections to get accurate time-filtered totals
   - When asked about a specific year, use ONLY that year's data from the yearly breakdown
   - If a year has no data, say "You don't have any recorded expenses for that period"
7. **FOR ITEM QUERIES**: If you see an item or category match section,
   use that section. It includes year-by-year breakdowns for the item.
   For time-filtered item queries, use only the matching year's data from within that section.
8. If asked about multiple categories (e.g., "food and grocery"), combine totals
9. For GROUP MEMBER spending queries:
   - Use "GROUP MEMBER SPENDING BY ADDED_BY" or "Group member spending totals by added_by"
   - `added_by` means the member who recorded/spent the expense
   - Do not use `paid_by` for ordinary group spending; `paid_by` is mainly for loan counterparties
10. For LOAN queries:
   - Use ONLY the "Loan Details by Person" section
   - Look for "YOU OWE" or "THEY OWE"
11. For INCOME/BALANCE queries:
   - "Income remaining" = Net Balance = Total Income - Total Expenses
   - "How much money left" = Net Balance
12. If data is missing for the requested time period, clearly state that.
13. For high-stakes investment, tax, credit, insurance, or legal decisions, provide general education and suggest qualified professional guidance when appropriate.
14. Format currency as Rs.X only; do not switch to another currency symbol.
15. Match depth to the question. For an analytical or advisory question, structure the response with a direct answer, supporting breakdown, and a short useful insight or next step. For a simple lookup, answer directly without filler.
16. Use enough detail to be useful, normally up to 450 words. Include transaction count and scope when relevant.
17. Do not use emoji. For emergency funds, favor an accessible low-risk cash or savings option unless the user asks about other products.
18. For detailed answers, use clean Markdown with brief section headings, bullet points, numbered action steps, and compact tables when comparing transactions. Avoid decorative formatting and avoid repeating the question.

Provide a helpful response:"""
            
            selected_model = self.voice_model if voice_mode else self.model
            request_options = {
                "model": selected_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "max_tokens": 220 if voice_mode else int(os.getenv("NVIDIA_NIM_MAX_TOKENS", "1200")),
                "stream": False,
            }
            if selected_model.startswith("nvidia/nemotron-3-"):
                request_options["extra_body"] = {
                    "top_k": 1,
                    "chat_template_kwargs": {"enable_thinking": False},
                }
            response = self.client.chat.completions.create(**request_options)
            if response and response.choices and response.choices[0].message.content:
                return final_answer_only(response.choices[0].message.content) or fallback_response
            
            return fallback_response
            
        except Exception as e:
            print(f"[RAG] Query error: {e}")
            return fallback_response
    
    async def smart_categorize(self, item_description: str) -> Optional[str]:
        """Use NVIDIA NIM to intelligently categorize an expense."""
        if not self.nim_available or not self.client:
            return None
        
        try:
            prompt = f"""Categorize this expense item into ONE category:

Item: "{item_description}"

Categories: Food, Transport, Groceries, Kitchenware, Shopping, Utilities, Entertainment, Rent, Loan, Income, Medical, Education, Travel, Electronics, Personal Care, Fitness, Other

Return ONLY the category name, nothing else."""
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=20,
                stream=False,
            )
            if response and response.choices and response.choices[0].message.content:
                category = response.choices[0].message.content.strip()
                return category
            
            return None
            
        except Exception as e:
            print(f"[RAG] Categorize error: {e}")
            return None
