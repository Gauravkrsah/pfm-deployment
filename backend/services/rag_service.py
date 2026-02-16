import os
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    genai = None

load_dotenv()

class RAGService:
    """RAG (Retrieval Augmented Generation) service for intelligent expense queries"""
    
    def __init__(self):
        self._setup_gemini()
    
    def _setup_gemini(self):
        """Setup Gemini AI"""
        self.gemini_available = False
        self.model = None
        
        if not GENAI_AVAILABLE:
            print("[X] RAG Service: google-generativeai not installed")
            return
        
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if gemini_api_key and gemini_api_key.strip():
            try:
                genai.configure(api_key=gemini_api_key)
                self.model = genai.GenerativeModel('gemini-2.0-flash-exp')
                self.gemini_available = True
                print("[OK] RAG Service: Gemini configured")
            except Exception as e:
                print(f"[X] RAG Service: Gemini setup failed: {e}")
    
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

    def _prepare_expense_context(self, expenses_data: List[Dict], query: str = None) -> str:
        """Prepare structured expense data for RAG with time-aware grouping"""
        if not expenses_data:
            return "No expense data available."
        
        today = date.today()
        
        # Check for item-specific query first
        item_match = None
        if query:
            item_match = self._find_item_matches(query, expenses_data)
        
        # Separate expenses, income, and loans
        expenses = [e for e in expenses_data if e.get('amount', 0) > 0 and (e.get('category') or '').lower() not in ['income', 'loan']]
        income = [e for e in expenses_data if (e.get('category') or '').lower() == 'income' or (e.get('amount', 0) < 0 and (e.get('category') or '').lower() != 'loan')]
        loans = [e for e in expenses_data if (e.get('category') or '').lower() == 'loan']
        
        # Build context
        context_parts = []
        
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
    
    async def query_expenses(self, query: str, expenses_data: List[Dict], user_name: str = "there") -> Optional[str]:
        """Query expenses using RAG with Gemini"""
        if not self.gemini_available or not self.model:
            return None
        
        try:
            # Prepare context from expense data (pass query for item-specific filtering)
            expense_context = self._prepare_expense_context(expenses_data, query)
            
            today = date.today()
            
            # Build RAG prompt
            prompt = f"""You are a personal finance assistant analyzing expense data.

USER: {user_name}
QUERY: "{query}"
TODAY'S DATE: {today.strftime('%Y-%m-%d')} ({today.strftime('%A, %B %d, %Y')})
CURRENT YEAR: {today.year}

EXPENSE DATA:
{expense_context}

INSTRUCTIONS:
1. Answer the user's question accurately using ONLY the data provided above
2. Be conversational and friendly - start with "Hi {user_name}!"
3. Use exact numbers from the data
4. **CRITICAL: TIME-BASED QUERIES**:
   - "this year" / "this year so far" = only transactions in {today.year}
   - "last year" = only transactions in {today.year - 1}
   - "in 2025" = only transactions in year 2025
   - "this month" = only transactions in {today.strftime('%B %Y')}
   - "all time" / "total" / "ever" / "up to now" = sum of ALL transactions across all years
   - Use the YEARLY BREAKDOWN and MONTHLY BREAKDOWN sections to get accurate time-filtered totals
   - When asked about a specific year, use ONLY that year's data from the yearly breakdown
   - If a year has no data, say "You don't have any recorded expenses for that period"
5. **FOR ITEM QUERIES**: If you see "*** ITEM-SPECIFIC MATCH ***", 
   use that section. It includes year-by-year breakdowns for the item.
   For time-filtered item queries, use only the matching year's data from within that section.
6. If asked about multiple categories (e.g., "food and grocery"), combine totals
7. For LOAN queries:
   - Use ONLY the "Loan Details by Person" section
   - Look for "YOU OWE" or "THEY OWE"
8. For INCOME/BALANCE queries:
   - "Income remaining" = Net Balance = Total Income - Total Expenses
   - "How much money left" = Net Balance
9. If data is missing for the requested time period, clearly state that
10. Format currency as Rs.X
11. Be concise but informative. Include transaction count when relevant.

Provide a helpful response:"""
            
            # Get Gemini response
            response = self.model.generate_content(prompt)
            if response and response.text:
                return response.text.strip()
            
            return None
            
        except Exception as e:
            print(f"[RAG] Query error: {e}")
            return None
    
    async def smart_categorize(self, item_description: str) -> Optional[str]:
        """Use Gemini to intelligently categorize an expense"""
        if not self.gemini_available or not self.model:
            return None
        
        try:
            prompt = f"""Categorize this expense item into ONE category:

Item: "{item_description}"

Categories: Food, Transport, Groceries, Shopping, Utilities, Entertainment, Rent, Loan, Income, Medical, Education, Travel, Electronics, Personal Care, Fitness, Other

Return ONLY the category name, nothing else."""
            
            response = self.model.generate_content(prompt)
            if response and response.text:
                category = response.text.strip()
                return category
            
            return None
            
        except Exception as e:
            print(f"[RAG] Categorize error: {e}")
            return None
