import os
import re
from collections import defaultdict
from datetime import datetime, date
from datetime import timedelta
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

try:
    from openai import OpenAI
    NIM_AVAILABLE = True
except ImportError:
    NIM_AVAILABLE = False
    OpenAI = None

load_dotenv()

DEFAULT_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_NIM_MODEL = "nvidia/nemotron-3-super-120b-a12b"

class RAGService:
    """Grounded financial Q&A using transaction context and NVIDIA NIM."""
    
    def __init__(self):
        self._setup_nim()
    
    def _setup_nim(self):
        """Set up NVIDIA NIM through its OpenAI-compatible API."""
        self.nim_available = False
        self.client = None
        self.model = os.getenv("NVIDIA_NIM_MODEL", DEFAULT_NIM_MODEL)

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

    def _period_from_query(self, query: str) -> tuple:
        """Resolve a natural-language period into an inclusive date range."""
        query_lower = (query or '').lower()
        today = date.today()

        if 'today' in query_lower:
            return today, today, f"today ({today.isoformat()})"
        if 'yesterday' in query_lower:
            yesterday = today - timedelta(days=1)
            return yesterday, yesterday, f"yesterday ({yesterday.isoformat()})"
        if 'this week' in query_lower:
            start = today - timedelta(days=today.weekday())
            return start, today, f"this week ({start.isoformat()} to {today.isoformat()})"
        if 'last week' in query_lower:
            end = today - timedelta(days=today.weekday() + 1)
            start = end - timedelta(days=6)
            return start, end, f"last week ({start.isoformat()} to {end.isoformat()})"
        if 'this month' in query_lower:
            start = today.replace(day=1)
            return start, today, f"this month ({today.strftime('%B %Y')})"
        if 'last month' in query_lower:
            end = today.replace(day=1) - timedelta(days=1)
            start = end.replace(day=1)
            return start, end, f"last month ({start.strftime('%B %Y')})"
        if 'this year' in query_lower:
            return date(today.year, 1, 1), today, f"this year ({today.year})"
        if 'last year' in query_lower:
            year = today.year - 1
            return date(year, 1, 1), date(year, 12, 31), f"last year ({year})"

        days_match = re.search(r'\blast\s+(\d+)\s+days?\b', query_lower)
        if days_match:
            days = max(int(days_match.group(1)), 1)
            start = today - timedelta(days=days - 1)
            return start, today, f"last {days} days"

        year_match = re.search(r'\b(20\d{2})\b', query_lower)
        month_names = {
            'january': 1, 'february': 2, 'march': 3, 'april': 4,
            'may': 5, 'june': 6, 'july': 7, 'august': 8,
            'september': 9, 'october': 10, 'november': 11, 'december': 12,
        }
        for month_name, month_number in month_names.items():
            if month_name in query_lower:
                year = int(year_match.group(1)) if year_match else today.year
                start = date(year, month_number, 1)
                if month_number == 12:
                    end = date(year + 1, 1, 1) - timedelta(days=1)
                else:
                    end = date(year, month_number + 1, 1) - timedelta(days=1)
                return start, end, f"{month_name.title()} {year}"
        if year_match:
            year = int(year_match.group(1))
            return date(year, 1, 1), date(year, 12, 31), f"year {year}"

        return None, None, "all recorded time"

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
        monthly_totals = defaultdict(float)
        for transaction in expenses:
            category = transaction.get('category') or 'Other'
            category_totals[category] += self._amount(transaction)
            category_counts[category] += 1
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
            'monthly_totals': dated_months,
        }

    def _describe_transaction(self, transaction: Optional[Dict]) -> str:
        if not transaction:
            return "none"
        amount = self._money(self._amount(transaction))
        item = transaction.get('item') or transaction.get('remarks') or 'unspecified item'
        category = transaction.get('category') or 'Other'
        transaction_date = transaction.get('date') or transaction.get('created_at') or 'date not recorded'
        return f"{amount} for {item} [{category}] on {transaction_date}"

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
        if facts['monthly_totals']:
            lines.append("Monthly expense totals in scope:")
            for month, total in facts['monthly_totals'][:12]:
                lines.append(f"  - {month}: {self._money(total)}")
        return "\n".join(lines)

    def grounded_fallback_answer(self, query: str, expenses_data: List[Dict], user_name: str) -> Optional[str]:
        """Provide accurate answers to key data questions when generation is unavailable."""
        facts = self._retrieve_finance_facts(expenses_data, query)
        query_lower = (query or '').lower()
        greeting = f"Hi {user_name}!"
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
        
        # Check for item-specific query first
        item_match = None
        if query:
            item_match = self._find_item_matches(query, retrieved_facts['rows'])
        
        # Separate expenses, income, and loans
        expenses = [e for e in expenses_data if e.get('amount', 0) > 0 and (e.get('category') or '').lower() not in ['income', 'loan']]
        income = [e for e in expenses_data if (e.get('category') or '').lower() == 'income' or (e.get('amount', 0) < 0 and (e.get('category') or '').lower() != 'loan')]
        loans = [e for e in expenses_data if (e.get('category') or '').lower() == 'loan']
        
        # Build context
        context_parts = [self._retrieved_facts_context(retrieved_facts)]
        
        # Current date context
        context_parts.append(f"TODAY'S DATE: {today.strftime('%Y-%m-%d')} ({today.strftime('%A, %B %d, %Y')})")
        context_parts.append(f"CURRENT YEAR: {today.year}")
        context_parts.append(f"CURRENT MONTH: {today.strftime('%B %Y')}")
        
        # --- ALL-TIME Summary ---
        total_expense = sum(e.get('amount', 0) for e in expenses)
        total_income = sum(abs(e.get('amount', 0)) for e in income)
        net_balance = total_income - total_expense
        
        context_parts.append(f"\n=== ALL-TIME SUMMARY ===")
        context_parts.append(f"Total Expenses (all time): Rs.{total_expense}")
        context_parts.append(f"Total Income (all time): Rs.{total_income}")
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
        
        # --- Monthly Breakdown (current year) ---
        monthly_data = {}
        for exp in expenses:
            d = self._parse_date(exp.get('date') or exp.get('created_at'))
            if d and d.year == today.year:
                month_key = d.strftime('%Y-%m')
                month_name = d.strftime('%B %Y')
                cat = exp.get('category', 'Other')
                if month_key not in monthly_data:
                    monthly_data[month_key] = {'name': month_name, 'total': 0, 'categories': {}, 'count': 0}
                monthly_data[month_key]['total'] += exp.get('amount', 0)
                monthly_data[month_key]['count'] += 1
                monthly_data[month_key]['categories'][cat] = monthly_data[month_key]['categories'].get(cat, 0) + exp.get('amount', 0)
        
        if monthly_data:
            context_parts.append(f"\n=== MONTHLY BREAKDOWN ({today.year}) ===")
            for mk in sorted(monthly_data.keys(), reverse=True):
                md = monthly_data[mk]
                context_parts.append(f"\n{md['name']}: Rs.{md['total']} ({md['count']} transactions)")
                for cat, amt in sorted(md['categories'].items(), key=lambda x: x[1], reverse=True):
                    context_parts.append(f"  {cat}: Rs.{amt}")
        
        # Category breakdown (all time)
        categories = {}
        for exp in expenses:
            cat = exp.get('category', 'Other')
            categories[cat] = categories.get(cat, 0) + exp.get('amount', 0)
        
        if categories:
            context_parts.append("\n=== ALL-TIME CATEGORY BREAKDOWN ===")
            for cat, amt in sorted(categories.items(), key=lambda x: x[1], reverse=True):
                count = len([e for e in expenses if e.get('category') == cat])
                context_parts.append(f"  {cat}: Rs.{amt} ({count} transactions)")
        
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
            context_parts.append(f"Total spent on {match_label.lower()} '{item_name}' (all time): Rs.{total_amt} across {count} transactions")
            
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
        
        # ALL transactions with dates (for time-based queries)
        all_non_loan = [e for e in expenses_data if (e.get('category') or '').lower() != 'loan']
        if all_non_loan:
            context_parts.append(f"\n=== ALL TRANSACTIONS ({len(all_non_loan)} total) ===")
            for exp in all_non_loan[:100]:  # Cap at 100 to avoid token overflow
                amt = exp.get('amount', 0)
                item = exp.get('item', 'item')
                cat = exp.get('category', 'Other')
                exp_date = exp.get('date', exp.get('created_at', 'N/A'))
                paid_by = exp.get('paid_by', '')
                paid_info = f" (paid by {paid_by})" if paid_by else ""
                context_parts.append(f"  Rs.{amt} - {item} [{cat}] on {exp_date}{paid_info}")
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
    ) -> Optional[str]:
        """Answer user-finance questions with records as grounded context."""
        fallback_response = self.grounded_fallback_answer(query, expenses_data, user_name)
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
            
            # Build RAG prompt
            prompt = f"""You are a careful, analytical personal finance assistant. Give a high-quality answer to the user's finance question using retrieved financial facts.

USER: {user_name}
QUERY: "{query}"
TODAY'S DATE: {today.strftime('%Y-%m-%d')} ({today.strftime('%A, %B %d, %Y')})
CURRENT YEAR: {today.year}

RECENT CONVERSATION CONTEXT (only to understand follow-up references):
{history_context}

EXPENSE DATA:
{expense_context}

INSTRUCTIONS:
1. The QUERY-RELEVANT RETRIEVED FACTS section is authoritative. For personalized statements and calculations, use ONLY supplied facts and exact numbers.
   Conversation history may clarify the question, but it is never authoritative financial data.
2. For general finance questions (budgeting, saving, debt concepts, emergency funds, financial habits), answer helpfully even if there are no records. Clearly state when advice is general rather than based on this user's data.
3. Never invent the user's transactions, income, balance, budget, goals, interest rates, or risk tolerance.
4. Be conversational and friendly - start with "Hi {user_name}!"
5. Use exact numbers from the data whenever answering about recorded activity.
6. **CRITICAL: TIME-BASED QUERIES**:
   - "this year" / "this year so far" = only transactions in {today.year}
   - "last year" = only transactions in {today.year - 1}
   - "in 2025" = only transactions in year 2025
   - "this month" = only transactions in {today.strftime('%B %Y')}
   - "all time" / "total" / "ever" / "up to now" = sum of ALL transactions across all years
   - Use the YEARLY BREAKDOWN and MONTHLY BREAKDOWN sections to get accurate time-filtered totals
   - When asked about a specific year, use ONLY that year's data from the yearly breakdown
   - If a year has no data, say "You don't have any recorded expenses for that period"
7. **FOR ITEM QUERIES**: If you see an item or category match section,
   use that section. It includes year-by-year breakdowns for the item.
   For time-filtered item queries, use only the matching year's data from within that section.
8. If asked about multiple categories (e.g., "food and grocery"), combine totals
9. For LOAN queries:
   - Use ONLY the "Loan Details by Person" section
   - Look for "YOU OWE" or "THEY OWE"
10. For INCOME/BALANCE queries:
   - "Income remaining" = Net Balance = Total Income - Total Expenses
   - "How much money left" = Net Balance
11. If data is missing for the requested time period, clearly state that.
12. For high-stakes investment, tax, credit, insurance, or legal decisions, provide general education and suggest qualified professional guidance when appropriate.
13. Format currency as Rs.X only; do not switch to another currency symbol.
14. Match depth to the question. For an analytical or advisory question, structure the response with a direct answer, supporting breakdown, and a short useful insight or next step. For a simple lookup, answer directly without filler.
15. Use enough detail to be useful, normally up to 450 words. Include transaction count and scope when relevant.
16. Do not use emoji. For emergency funds, favor an accessible low-risk cash or savings option unless the user asks about other products.
17. For detailed answers, use clean Markdown with brief section headings, bullet points, numbered action steps, and compact tables when comparing transactions. Avoid decorative formatting and avoid repeating the question.

Provide a helpful response:"""
            
            request_options = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "max_tokens": int(os.getenv("NVIDIA_NIM_MAX_TOKENS", "1200")),
                "stream": False,
            }
            if self.model.startswith("nvidia/nemotron-3-"):
                request_options["extra_body"] = {"reasoning_effort": "low"}
            response = self.client.chat.completions.create(**request_options)
            if response and response.choices and response.choices[0].message.content:
                return response.choices[0].message.content.strip()
            
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

Categories: Food, Transport, Groceries, Shopping, Utilities, Entertainment, Rent, Loan, Income, Medical, Education, Travel, Electronics, Personal Care, Fitness, Other

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
