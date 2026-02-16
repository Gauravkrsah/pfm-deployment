from typing import List, Dict, Any
from datetime import datetime, timedelta
import re

class ExpenseAnalyzer:
    """Advanced expense analysis and query processing"""

    def __init__(self):
        self.months = {
            'january': 1, 'jan': 1,
            'february': 2, 'feb': 2,
            'march': 3, 'mar': 3,
            'april': 4, 'apr': 4,
            'may': 5,
            'june': 6, 'jun': 6,
            'july': 7, 'jul': 7,
            'august': 8, 'aug': 8,
            'september': 9, 'sep': 9, 'sept': 9,
            'october': 10, 'oct': 10,
            'november': 11, 'nov': 11,
            'december': 12, 'dec': 12
        }
        self.categories = {
            'food': ['food', 'biryani', 'pizza', 'restaurant', 'hotel', 'meal', 'lunch', 'dinner', 'eat', 'cafe', 'snack', 'breakfast', 'tea', 'coffee', 'momo', 'chicken', 'lassi', 'chiya', 'chai'],
            'groceries': ['grocery', 'groceries', 'vegetables', 'fruits', 'market', 'supermarket', 'store', 'milk', 'bread'],
            'transport': ['petrol', 'fuel', 'taxi', 'uber', 'bus', 'train', 'auto', 'rickshaw', 'metro', 'flight', 'travel'],
            'shopping': ['clothes', 'shoes', 'shopping', 'shirt', 'dress', 'bag', 'accessories'],
            'utilities': ['electricity', 'water', 'internet', 'phone', 'mobile', 'wifi', 'bill'],
            'entertainment': ['movie', 'game', 'party', 'cinema', 'show', 'concert', 'entertainment'],
            'rent': ['rent', 'house', 'apartment', 'room'],
            'medical': ['doctor', 'medicine', 'hospital', 'medical', 'health', 'pharmacy'],
            'other': []
        }

    def analyze_expenses(self, expenses_data: List[Dict]) -> Dict[str, Any]:
        """Comprehensive analysis of expense data"""
        if not expenses_data:
            return {
                'total': 0,
                'count': 0,
                'categories': {},
                'recent_expenses': [],
                'top_categories': [],
                'average_per_day': 0,
                'total_income': 0,
                'income_count': 0,
                'net_balance': 0
            }

        # Separate expenses and income (Exclude loans from expenses)
        expenses = [exp for exp in expenses_data if exp.get('amount', 0) > 0 and exp.get('category', '').lower() not in ['income', 'loan']]
        income_transactions = [exp for exp in expenses_data if exp.get('amount', 0) < 0 or exp.get('category', '').lower() == 'income']
        loan_transactions_given = [exp for exp in expenses_data if exp.get('amount', 0) > 0 and exp.get('category', '').lower() == 'loan']
        loan_transactions_received = [exp for exp in expenses_data if exp.get('amount', 0) < 0 and exp.get('category', '').lower() == 'loan']
        
        total_expenses = sum(exp.get('amount', 0) for exp in expenses)
        total_income = sum(abs(exp.get('amount', 0)) for exp in income_transactions)
        total_loans_given = sum(exp.get('amount', 0) for exp in loan_transactions_given)
        total_loans_received = sum(abs(exp.get('amount', 0)) for exp in loan_transactions_received)
        
        expense_count = len(expenses)
        income_count = len(income_transactions)
        loan_given_count = len(loan_transactions_given)
        loan_received_count = len(loan_transactions_received)
        
        net_balance = total_income - total_expenses

        # Category breakdown (only expenses)
        categories = {}
        for exp in expenses:
            category = exp.get('category', 'Other').lower()
            categories[category] = categories.get(category, 0) + exp.get('amount', 0)

        # Sort categories by amount
        top_categories = sorted(categories.items(), key=lambda x: x[1], reverse=True)[:5]

        # Recent expenses (last 5 expenses only)
        recent_expenses = expenses[:5] if len(expenses) >= 5 else expenses

        # Calculate average per day (assuming data spans multiple days)
        dates = set()
        for exp in expenses_data:
            date_val = exp.get('date') or exp.get('created_at')
            if date_val:
                # Handle different date formats
                if isinstance(date_val, str):
                    # Extract date part if it's a datetime string
                    date_part = date_val.split('T')[0] if 'T' in date_val else date_val.split(' ')[0]
                    dates.add(date_part)
                else:
                    dates.add(str(date_val))

        days_count = len(dates) if dates else 1
        average_per_day = total_expenses / days_count if days_count > 0 else 0

        return {
            'total': total_expenses,
            'count': expense_count,
            'categories': categories,
            'recent_expenses': recent_expenses,
            'top_categories': top_categories,
            'average_per_day': round(average_per_day, 2),
            'days_tracked': days_count,
            'total_income': total_income,
            'income_count': income_count,
            'net_balance': net_balance,
            'total_loans_given': total_loans_given,
            'total_loans_received': total_loans_received,
            'loan_given_count': loan_given_count,
            'loan_received_count': loan_received_count,
            'net_loan': total_loans_given - total_loans_received
        }

    def find_specific_item(self, query: str, expenses_data: List[Dict]) -> Dict[str, Any]:
        """Find specific item or category expenses from the data"""
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
        # Comprehensive stop words that should never be item keywords
        stop_words = ['i', 'my', 'how', 'much', 'spend', 'spent', 'on', 'for', 'the', 'a', 'an', 
                     'did', 'do', 'have', 'has', 'what', 'is', 'are', 'was', 'were', 'money', 
                     'expenses', 'expense', 'to', 'from', 'with', 'at', 'in', 'of', 'and', 'or',
                     'this', 'that', 'it', 'me', 'you', 'we', 'they', 'he', 'she', 'am', 'be',
                     'now', 'ever', 'last', 'current', 'past', 'recent', 'till', 'until',
                     'income', 'salary', 'earning', 'loan', 'lend', 'borrow', 'owe', 'debt']
        
        # Look for "on [item]" or "for [item]" patterns
        for i, word in enumerate(words):
            if word in ['on', 'for'] and i + 1 < len(words):
                next_word = words[i + 1]
                if (next_word not in aggregate_keywords and 
                    next_word not in stop_words and 
                    next_word not in time_words and
                    len(next_word) > 2):
                    item_keywords.append(next_word)
        
        # Also check for remaining content words
        if not item_keywords:
            for word in words:
                if (word not in stop_words and word not in aggregate_keywords 
                    and word not in time_words and len(word) > 2):
                    item_keywords.append(word)
        
        if not item_keywords:
            return None
        
        # Collect all unique categories from data
        all_categories = set()
        for expense in expenses_data:
            cat = expense.get('category', '')
            if cat:
                all_categories.add(cat.lower())
        
        # PRIORITY 1: Check if any keyword matches a CATEGORY name
        # "food" should match ALL items in the "Food" category
        # BUT skip "income" and "loan" — process_query has dedicated handlers for those
        skip_categories = {'income', 'loan'}
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
                'total_amount': total_amount,
                'count': len(matching_expenses),
                'expenses': matching_expenses
            }
        
        return None

    def filter_by_date_range(self, expenses_data: List[Dict], start_date: datetime = None, end_date: datetime = None) -> List[Dict]:
        """Filter expenses by date range"""
        if not expenses_data:
            return []
        
        filtered = []
        for exp in expenses_data:
            date_val = exp.get('date') or exp.get('created_at')
            if not date_val:
                continue
            
            try:
                # Parse date string
                if isinstance(date_val, str):
                    date_part = date_val.split('T')[0] if 'T' in date_val else date_val.split(' ')[0]
                    exp_date = datetime.strptime(date_part, '%Y-%m-%d')
                else:
                    exp_date = datetime.fromisoformat(str(date_val))
                
                # Check if within range
                if start_date and exp_date < start_date:
                    continue
                if end_date and exp_date > end_date:
                    continue
                
                filtered.append(exp)
            except:
                continue
        
        return filtered
    
    def extract_time_period(self, query: str) -> tuple:
        """Extract time period from query and return (start_date, end_date, period_name)"""
        query_lower = query.lower()
        now = datetime.now()
        
        # "all time" / "total" / "ever" / "till now" = no filter (return everything)
        if any(phrase in query_lower for phrase in ['all time', 'till now', 'upto now', 'up to now', 'so far', 'ever']):
            return (None, None, 'all time')
        
        # This year
        if 'this year' in query_lower or 'current year' in query_lower:
            start = datetime(now.year, 1, 1)
            return (start, now, f'this year ({now.year})')
        
        # Last year
        if 'last year' in query_lower or 'previous year' in query_lower:
            start = datetime(now.year - 1, 1, 1)
            end = datetime(now.year, 1, 1) - timedelta(seconds=1)
            return (start, end, f'last year ({now.year - 1})')
        
        # Specific year like "in 2025" or just "2025"
        year_match = re.search(r'\b(20\d{2})\b', query_lower)
        if year_match:
            year = int(year_match.group(1))
            start = datetime(year, 1, 1)
            end = datetime(year, 12, 31, 23, 59, 59)
            return (start, end, f'year {year}')
        
        # This month
        if 'this month' in query_lower or 'current month' in query_lower:
            start = datetime(now.year, now.month, 1)
            return (start, now, 'this month')
        
        # Last month
        if 'last month' in query_lower or 'previous month' in query_lower:
            if now.month == 1:
                start = datetime(now.year - 1, 12, 1)
                end = datetime(now.year, 1, 1) - timedelta(days=1)
            else:
                start = datetime(now.year, now.month - 1, 1)
                end = datetime(now.year, now.month, 1) - timedelta(days=1)
            return (start, end, 'last month')
        
        # Specific month name
        for month_name, month_num in self.months.items():
            if month_name in query_lower:
                # Determine year
                year = now.year
                if month_num > now.month:
                    year = now.year - 1
                
                start = datetime(year, month_num, 1)
                if month_num == 12:
                    end = datetime(year + 1, 1, 1) - timedelta(days=1)
                else:
                    end = datetime(year, month_num + 1, 1) - timedelta(days=1)
                
                return (start, end, f"{month_name.title()} {year}")
        
        # This week
        if 'this week' in query_lower or 'current week' in query_lower:
            start = now - timedelta(days=now.weekday())
            return (start, now, 'this week')
        
        # Last week
        if 'last week' in query_lower or 'previous week' in query_lower:
            start = now - timedelta(days=now.weekday() + 7)
            end = now - timedelta(days=now.weekday() + 1)
            return (start, end, 'last week')
        
        # Today
        if 'today' in query_lower:
            start = datetime(now.year, now.month, now.day)
            return (start, now, 'today')
        
        # Yesterday
        if 'yesterday' in query_lower:
            yesterday = now - timedelta(days=1)
            start = datetime(yesterday.year, yesterday.month, yesterday.day)
            end = start + timedelta(days=1) - timedelta(seconds=1)
            return (start, end, 'yesterday')
        
        # Last N days
        days_match = re.search(r'last (\d+) days?', query_lower)
        if days_match:
            days = int(days_match.group(1))
            start = now - timedelta(days=days)
            return (start, now, f'last {days} days')
        
        return (None, None, None)

    def _handle_loan_query(self, query_lower: str, analysis: Dict[str, Any], time_context: str, expenses_data: List[Dict]) -> str:
        """Handle loan-related queries"""
        # Check for specific people matches first
        mentioned_people = []
        if expenses_data:
            loan_people = set()
            for exp in expenses_data:
                if exp.get('category', '').lower() == 'loan' and exp.get('paid_by'):
                    loan_people.add(exp['paid_by'].lower())
            
            mentioned_people = [p for p in loan_people if p in query_lower]
        
        # If specific people are mentioned, return stats just for them
        if mentioned_people:
            f_given = 0
            f_received = 0
            f_people_stats = {}
            
            for exp in expenses_data:
                if exp.get('category', '').lower() == 'loan' and exp.get('paid_by', '').lower() in mentioned_people:
                    person = exp['paid_by'].title()
                    amount = exp.get('amount', 0)
                    
                    if person not in f_people_stats:
                        f_people_stats[person] = 0
                    
                    if amount > 0:
                        f_given += amount
                        f_people_stats[person] += amount
                    else:
                        f_received += abs(amount)
                        f_people_stats[person] -= abs(amount)
            
            # Format detailed string for these people
            people_status = []
            for p, net in f_people_stats.items():
                if net > 0:
                    people_status.append(f"{p}: owes you Rs.{net}")
                elif net < 0:
                    people_status.append(f"{p}: you owe Rs.{abs(net)}")
                else:
                    people_status.append(f"{p}: settled")
            
            return f"Loan status for {', '.join([p.title() for p in mentioned_people])}: {'; '.join(people_status)}."

        given = analysis.get('total_loans_given', 0)
        received = analysis.get('total_loans_received', 0)
        net_loan = analysis.get('net_loan', 0)
        
        if given == 0 and received == 0:
            return f"No loan transactions found{time_context}."
        
        # Check if user wants detailed breakdown
        wants_details = any(word in query_lower for word in ['detail', 'breakdown', 'who', 'everyone', 'person', 'list', 'each'])
        
        if wants_details and expenses_data:
            person_map = {}
            for exp in expenses_data:
                if exp.get('category', '').lower() == 'loan':
                    person = exp.get('paid_by')
                    if not person:
                        # Try to extract from remarks if paid_by is missing
                        remarks = exp.get('remarks', '')
                        if ' to ' in remarks:
                            person = remarks.split(' to ')[1].split()[0]
                        elif ' from ' in remarks:
                            person = remarks.split(' from ')[1].split()[0]
                        elif ' by ' in remarks:
                            person = remarks.split(' by ')[1].split()[0]
                        else:
                            person = 'Unknown'
                    
                    person = person.title()
                    if person not in person_map:
                        person_map[person] = {'given': 0, 'received': 0}
                    
                    amount = exp.get('amount', 0)
                    if amount > 0:
                        person_map[person]['given'] += amount
                    else:
                        person_map[person]['received'] += abs(amount)
            
            details = []
            for person, data in person_map.items():
                p_given = data['given']
                p_received = data['received']
                p_net = p_given - p_received
                
                status = ""
                if p_net > 0:
                    status = f"owes you Rs.{p_net}"
                elif p_net < 0:
                    status = f"you owe Rs.{abs(p_net)}"
                else:
                    status = "settled"
                    
                details.append(f"{person}: {status}")
            
            return f"Loan Details{time_context}:\n" + "\n".join(details)

        parts = []
        if given > 0:
            parts.append(f"Given: Rs.{given} ({analysis.get('loan_given_count', 0)} txn)")
        if received > 0:
            parts.append(f"Received: Rs.{received} ({analysis.get('loan_received_count', 0)} txn)")
        
        parts.append(f"Net Position: Rs.{abs(net_loan)} ({'You are owed' if net_loan >= 0 else 'You owe'})")
        return f"Loan Summary{time_context}: {'; '.join(parts)}. Ask 'who owes me' for details."

    def process_query(self, query: str, analysis: Dict[str, Any], context: str = "personal", expenses_data: List[Dict] = None) -> str:
        """Process natural language queries about expenses with advanced pattern matching"""
        query_lower = query.lower()
        
        # Extract time period if present
        start_date, end_date, period_name = self.extract_time_period(query_lower)
        
        # Filter expenses by date if time period detected
        if start_date and expenses_data:
            filtered_expenses = self.filter_by_date_range(expenses_data, start_date, end_date)
            
            if not filtered_expenses:
                return f"You haven't spent anything in {period_name}."
            
            # Re-analyze with filtered data
            analysis = self.analyze_expenses(filtered_expenses)
            expenses_data = filtered_expenses
            
            # Update context to include period
            time_context = f" in {period_name}"
        else:
            time_context = ""
        
        # INCOME QUERIES — check before item matching
        if any(word in query_lower for word in ['income', 'salary', 'earning', 'received', 'got']):
            if analysis.get('total_income', 0) > 0:
                return f"Your total income{time_context}: Rs.{analysis['total_income']} across {analysis['income_count']} transactions. Net balance: Rs.{analysis['net_balance']} ({'surplus' if analysis['net_balance'] >= 0 else 'deficit'})."
            else:
                return f"No income recorded{time_context}."
        
        # LOAN QUERIES — check before item matching
        if any(word in query_lower for word in ['loan', 'lend', 'lent', 'borrow', 'owe', 'debt', 'udhar', 'own', 'payable', 'receiveable']):
            return self._handle_loan_query(query_lower, analysis, time_context, expenses_data)
        
        # ITEM-SPECIFIC QUERIES - Check these FIRST before category matching
        # This ensures "tea" matches the tea item, not the food category that contains "tea" as a keyword
        if expenses_data:
            item_result = self.find_specific_item(query_lower, expenses_data)
            if item_result:
                item_name = item_result['item_name'].title()
                total = item_result['total_amount']
                count = item_result['count']
                
                if count == 1:
                    expense = item_result['expenses'][0]
                    date_info = f" on {expense.get('date', 'unknown date')}" if expense.get('date') else ""
                    paid_by = f" (paid by {expense.get('paid_by')})" if expense.get('paid_by') else ""
                    return f"You spent Rs.{total} on {item_name}{date_info}{paid_by}{time_context}."
                else:
                    return f"You spent Rs.{total} on {item_name} across {count} transactions{time_context}."
        
        # Check for multiple categories in query (e.g., "food and grocery")
        matched_categories = []
        
        # Check actual categories from data first
        for actual_category in analysis['categories'].keys():
            if actual_category in query_lower:
                if actual_category not in matched_categories:
                    matched_categories.append(actual_category)
        
        # Check predefined category keywords
        for category, keywords in self.categories.items():
            cat_lower = category.lower()
            if cat_lower not in matched_categories:
                # Check if category name or any keyword is in query
                if cat_lower in query_lower or any(keyword in query_lower for keyword in keywords):
                    matched_categories.append(cat_lower)
        
        # Handle multiple categories
        if len(matched_categories) > 1:
            total_amount = 0
            total_count = 0
            category_details = []
            
            for cat in matched_categories:
                amount = analysis['categories'].get(cat, 0)
                if amount > 0:
                    count = len([exp for exp in expenses_data if exp.get('category', '').lower() == cat and exp.get('amount', 0) > 0])
                    total_amount += amount
                    total_count += count
                    category_details.append(f"{cat.title()}: Rs.{amount} ({count} txn)")
            
            if category_details:
                categories_str = " and ".join(matched_categories)
                details_str = ", ".join(category_details)
                return f"You've spent Rs.{total_amount} on {categories_str} across {total_count} transactions{time_context}. Breakdown: {details_str}."
        
        # Single category query
        if len(matched_categories) == 1:
            category = matched_categories[0]
            amount = analysis['categories'].get(category, 0)
            if amount > 0:
                cat_count = len([exp for exp in expenses_data if exp.get('category', '').lower() == category and exp.get('amount', 0) > 0])
                if cat_count > 1:
                    return f"You've spent Rs.{amount} on {category} across {cat_count} transactions{time_context}."
                else:
                    return f"You've spent Rs.{amount} on {category}{time_context}."
            else:
                if analysis['total'] > 0:
                    top_cat = analysis['top_categories'][0][0] if analysis['top_categories'] else 'other categories'
                    return f"You haven't spent anything on {category}{time_context}. Your main spending has been on {top_cat} (Rs.{analysis['top_categories'][0][1] if analysis['top_categories'] else 0})."
                else:
                    return f"You haven't spent anything on {category}{time_context}."
        
        # Income queries
        if any(word in query_lower for word in ['income', 'salary', 'earning', 'received', 'got']):
            if analysis.get('total_income', 0) > 0:
                return f"Your total income{time_context}: Rs.{analysis['total_income']} across {analysis['income_count']} transactions. Net balance: Rs.{analysis['net_balance']} ({'surplus' if analysis['net_balance'] >= 0 else 'deficit'})."
            else:
                return f"No income recorded{time_context}."

        # Total/Summary queries
        if any(word in query_lower for word in ['total', 'all', 'overall', 'everything', 'entire', 'whole']):
            income_summary = f" Income: Rs.{analysis.get('total_income', 0)}." if analysis.get('total_income', 0) > 0 else ""
            loan_summary = ""
            if analysis.get('total_loans_given', 0) > 0 or analysis.get('total_loans_received', 0) > 0:
                loan_summary = f" Loans: Given Rs.{analysis.get('total_loans_given', 0)}, Received Rs.{analysis.get('total_loans_received', 0)}."
            
            base_response = f"You spent Rs.{analysis['total']} (excluding loans)"
            
            if period_name:
                return f"{base_response} in {period_name} across {analysis['count']} transactions.{income_summary}{loan_summary}"
            elif any(word in query_lower for word in ['till now', 'so far', 'upto now', 'up to now']):
                return f"{base_response} across {analysis['count']} transactions.{income_summary}{loan_summary}"
            else:
                return f"{base_response} across {analysis['count']} transactions{time_context}.{income_summary}{loan_summary}"
        
        # General spending queries
        if any(word in query_lower for word in ['spent', 'expense', 'much']):
            income_info = f" Income: Rs.{analysis.get('total_income', 0)}." if analysis.get('total_income', 0) > 0 else ""
            if period_name:
                return f"You spent Rs.{analysis['total']} in {period_name} across {analysis['count']} transactions.{income_info}"
            else:
                return f"You spent Rs.{analysis['total']} across {analysis['count']} transactions{time_context}.{income_info}"

        # Breakdown/Category analysis
        if any(word in query_lower for word in ['category', 'breakdown', 'categories', 'distribution']):
            if analysis['top_categories']:
                breakdown = []
                for cat, amount in analysis['top_categories']:
                    percentage = (amount / analysis['total'] * 100) if analysis['total'] > 0 else 0
                    breakdown.append(f"• {cat.title()}: Rs.{amount} ({percentage:.1f}%)")
                return f"Your {context} expense breakdown:\n" + "\n".join(breakdown)

        # Recent expenses
        if any(word in query_lower for word in ['recent', 'last', 'latest']):
            if analysis['recent_expenses']:
                recent = []
                for exp in analysis['recent_expenses'][:3]:
                    date_str = f" on {exp.get('date', 'unknown date')}" if exp.get('date') else ""
                    recent.append(f"• Rs.{exp.get('amount', 0)} on {exp.get('item', 'item')} ({exp.get('category', 'other')}){date_str}")
                return f"Your recent {context} expenses:\n" + "\n".join(recent)

        # Average/Daily spending
        if any(word in query_lower for word in ['average', 'daily', 'per day']):
            income_avg = analysis.get('total_income', 0) / analysis['days_tracked'] if analysis['days_tracked'] > 0 and analysis.get('total_income', 0) > 0 else 0
            income_info = f" Daily income average: Rs.{round(income_avg, 2)}." if income_avg > 0 else ""
            return f"Your average daily {context} spending is Rs.{analysis['average_per_day']} over {analysis['days_tracked']} days.{income_info}"

        # Comparison queries
        if 'most' in query_lower and ('spent' in query_lower or 'expensive' in query_lower):
            if analysis['top_categories']:
                top_cat, top_amount = analysis['top_categories'][0]
                return f"You've spent the most on {top_cat.title()} with Rs.{top_amount} in your {context} expenses."

        # Count queries
        if any(word in query_lower for word in ['how many', 'count', 'number']):
            income_info = f" and {analysis.get('income_count', 0)} income transactions (Rs.{analysis.get('total_income', 0)})" if analysis.get('total_income', 0) > 0 else ""
            return f"You have {analysis['count']} expense transactions totaling Rs.{analysis['total']}{income_info} in your {context} records."

        # Who paid queries
        if any(word in query_lower for word in ['who paid', 'who payed', 'paid by', 'payed by']):
            category_found = None
            for category in self.categories.keys():
                if category in query_lower:
                    category_found = category
                    break
            
            if category_found:
                category_expenses = [exp for exp in analysis['recent_expenses'] 
                                   if exp.get('category', '').lower() == category_found]
                if category_expenses:
                    recent_with_payer = [exp for exp in category_expenses if exp.get('paid_by')]
                    if recent_with_payer:
                        latest = recent_with_payer[0]
                        return f"The last {category_found} expense was Rs.{latest.get('amount', 0)} for {latest.get('item', 'item')} paid by {latest.get('paid_by', 'unknown')}."
                    else:
                        return f"I found recent {category_found} expenses but no payment information is recorded."
                else:
                    return f"No recent {category_found} expenses found."
            else:
                recent_with_payer = [exp for exp in analysis['recent_expenses'] if exp.get('paid_by')]
                if recent_with_payer:
                    latest = recent_with_payer[0]
                    return f"The most recent expense with payment info: Rs.{latest.get('amount', 0)} for {latest.get('item', 'item')} paid by {latest.get('paid_by', 'unknown')}."
                else:
                    return f"No recent expenses have payment information recorded."

        # Help/What can I ask queries
        if any(word in query_lower for word in ['help', 'what can', 'options']):
            return f"You can ask me about:\n• Total expenses ('What are my expenses till now?')\n• Income tracking ('What's my total income?')\n• Net balance ('What's my balance?')\n• Category breakdowns ('Show me my food expenses')\n• Recent transactions ('What are my recent expenses?')\n• Daily averages ('What's my daily spending?')\n• Comparisons ('What did I spend the most on?')\n• Who paid ('Who paid for grocery last time?')"

        # Balance/Net queries
        if any(word in query_lower for word in ['balance', 'net', 'left', 'remaining', 'save', 'saved']):
            if analysis.get('total_income', 0) > 0:
                return f"Your net balance{time_context}: Rs.{analysis['net_balance']} ({'surplus' if analysis['net_balance'] >= 0 else 'deficit'}). Income: Rs.{analysis['total_income']}, Expenses: Rs.{analysis['total']}."
            else:
                return f"No income data available to calculate balance. Total expenses: Rs.{analysis['total']}."
        
        # Default comprehensive response with better analysis
        if analysis['top_categories']:
            top_category, top_amount = analysis['top_categories'][0]
            percentage = (top_amount / analysis['total'] * 100) if analysis['total'] > 0 else 0
            income_info = f" Income: Rs.{analysis.get('total_income', 0)} ({analysis.get('income_count', 0)} txn)." if analysis.get('total_income', 0) > 0 else ""
            return f"You spent Rs.{analysis['total']}{time_context} across {analysis['count']} transactions. Top spending: {top_category.title()} (Rs.{top_amount}, {percentage:.1f}%).{income_info}"
        else:
            income_info = f" Income: Rs.{analysis.get('total_income', 0)} ({analysis.get('income_count', 0)} txn)." if analysis.get('total_income', 0) > 0 else ""
            return f"You spent Rs.{analysis['total']}{time_context} across {analysis['count']} transactions.{income_info}"