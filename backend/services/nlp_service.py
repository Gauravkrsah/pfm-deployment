import re
import json
import os
from typing import List, Dict, Any, Optional

# pyre-ignore[21]
from dotenv import load_dotenv

try:
    # pyre-ignore[21]
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    genai = None

load_dotenv()

class ExpenseParser:
    def __init__(self):
        self.categories = {
            'food': ['biryani', 'pizza', 'restaurant', 'meal', 'lunch', 'dinner', 'food', 'cafe', 'snack', 'tea', 'coffee', 'breakfast', 'momo', 'momos', 'noodles', 'chowmein', 'chowmin', 'chow', 'ramen', 'pasta', 'rice', 'dal', 'curry', 'khana', 'khaana', 'chiya', 'chai', 'dudh', 'milk', 'bhat', 'daal', 'tarkari', 'sabji', 'machha', 'fish', 'chicken', 'mutton', 'buff', 'pork', 'egg', 'anda', 'roti', 'chapati', 'paratha', 'samosa', 'pakoda', 'chaat', 'lassi', 'lasi', 'juice', 'paani', 'water', 'drink', 'beverage', 'ice cream', 'dessert', 'sweets', 'mithai', 'masala', 'paneer', 'veg', 'non-veg', 'burger', 'sandwich', 'roll', 'wrap', 'kathi', 'tikka', 'kebab', 'tandoori'],
            'transport': ['petrol', 'fuel', 'taxi', 'uber', 'bus', 'train', 'auto', 'rickshaw', 'metro', 'flight', 'travel', 'tempo', 'microbus', 'bike', 'scooter', 'car', 'gaadi', 'diesel', 'parking', 'garage', 'toll', 'service', 'repair', 'ac', 'cooler', 'pump', 'motor'],
            'groceries': ['grocery', 'groceries', 'vegetables', 'fruits', 'market', 'supermarket', 'store', 'milk', 'bread', 'apple', 'garlic', 'potato', 'onion', 'tomato', 'sabji', 'tarkari', 'fruits', 'phal', 'alu', 'pyaj', 'lasun', 'dhaniya', 'hariyo', 'green', 'oil', 'salt', 'sugar', 'spices', 'shampoo', 'soap', 'detergent', 'paste', 'brush', 'oil', 'cream', 'powder', 'tissue', 'paper', 'napkin', 'sanitizer', 'bucket', 'mug', 'mop', 'broom'],
            'shopping': ['clothes', 'shoes', 'shopping', 'shirt', 'dress', 'bag', 'accessories', 'kapada', 'jutta', 'chappals', 'sandals', 'pant', 'jeans', 'tshirt', 'jacket', 'watch', 'belt', 'perfume', 'deo', 'makeup', 'lipstick', 'liner', 'mascara', 'polish', 'remover', 'gift', 'present'],
            'utilities': ['electricity', 'water', 'internet', 'phone', 'mobile', 'wifi', 'bill', 'current', 'paani', 'net', 'recharge', 'tv', 'dish', 'gas', 'waste', 'broadband', 'cable', 'wire', 'switch', 'socket', 'bulb', 'light', 'battery', 'inverter', 'topup', 'data', 'plan', 'subscription'],
            'electronics': ['heater', 'fan', 'fridge', 'microwave', 'oven', 'stove', 'chimney', 'charger', 'remote', 'speaker', 'headphone', 'earphone', 'laptop', 'tablet', 'radio', 'iron', 'geyser', 'blender', 'mixer', 'toaster', 'kettle', 'purifier', 'filter', 'vacuum', 'cleaner', 'machine'],
            'medical': ['medicine', 'pill', 'tablet', 'syrup', 'drop', 'injection', 'bandage', 'plaster', 'test', 'scan', 'xray', 'doctor', 'nurse', 'fees', 'mask', 'glove', 'hospital', 'clinic', 'pharmacy', 'medical', 'health'],
            'entertainment': ['movie', 'game', 'party', 'cinema', 'show', 'concert', 'film', 'picture', 'khel', 'outing', 'club', 'pub', 'netflix', 'spotify'],
            'accommodation': ['hotel', 'stay', 'booking', 'resort', 'lodge', 'guest house', 'airbnb'],
            'rent': ['rent', 'house', 'apartment', 'room', 'ghar', 'kotha', 'bhada'],
            'loan': ['loan', 'lend', 'lent', 'borrow', 'borrowed', 'debt', 'rin', 'gave', 'diye', 'liye', 'udhar', 'qarz', 'paid back', 'repaid'],
            'income': ['salary', 'bonus', 'incentive', 'refund', 'income', 'earning', 'dividend', 'profit'],
            'education': ['admission', 'fee', 'tuition', 'school', 'college', 'university', 'course', 'class', 'book', 'study', 'education', 'exam', 'test', 'stationary', 'pen', 'pencil', 'notebook']
        }
        
        # Build keyword set for person detection
        self.all_keywords = set()
        for kws in self.categories.values():
            for kw in kws:
                self.all_keywords.add(kw.lower())
                # Add individual words from multi-word keywords
                if ' ' in kw:
                    for part in kw.split():
                        if len(part) > 2:
                            self.all_keywords.add(part.lower())
        
        # Additional non-person words that might appear in descriptions
        self.non_person_words = {
            'blue', 'red', 'green', 'black', 'white', 'small', 'large', 'big', 'new', 'old',
            'purchased', 'bought', 'spent', 'payment', 'paid', 'cost', 'price', 'total',
            'kg', 'gm', 'ltr', 'ml', 'unit', 'piece', 'set', 'pack', 'bottle', 'can',
            'with', 'and', 'from', 'for', 'the', 'this', 'that', 'at', 'to', 'of',
            'airport', 'office', 'home', 'work', 'shop', 'store', 'market', 'mall', 'gym',
            'bank', 'school', 'college', 'hospital', 'pharmacy', 'clinic', 'dentist',
            'had', 'took', 'got', 'ate', 'eaten', 'drank', 'drunk', 'bought', 'buy', 'ordered',
            # Appliances & Electronics
            'heater', 'fan', 'ac', 'cooler', 'fridge', 'microwave', 'oven', 'stove', 'chimney',
            'inverter', 'battery', 'bulb', 'light', 'switch', 'socket', 'wire', 'cable',
            'charger', 'remote', 'speaker', 'headphone', 'earphone', 'laptop', 'mobile',
            'phone', 'tablet', 'tv', 'radio', 'iron', 'geyser', 'pump', 'motor', 'machine',
            'blender', 'mixer', 'toaster', 'kettle', 'purifier', 'filter', 'vacuum', 'cleaner',
            # Household & Containers
            'mop', 'broom', 'bucket', 'mug', 'tap', 'sink', 'basin', 'shower', 'tub', 'towel',
            'jar', 'box', 'bag', 'case', 'container', 'tin', 'tray', 'plate', 'bowl', 'cup', 'glass',
            'soap', 'shampoo', 'paste', 'brush', 'comb', 'oil', 'cream', 'powder', 'perfume',
            'deo', 'makeup', 'lipstick', 'liner', 'mascara', 'polish', 'remover', 'cotton',
            'tissue', 'paper', 'napkin', 'diaper', 'pad', 'sanitizer', 'mask', 'glove',
            # Medical & Professional
            'medicine', 'pill', 'tablet', 'syrup', 'drop', 'injection', 'bandage', 'plaster',
            'test', 'scan', 'xray', 'doctor', 'nurse', 'fees',
            # Financial & Other
            'rent', 'bill', 'recharge', 'topup', 'data', 'plan', 'subscription', 'membership',
            'donation', 'charity', 'gift', 'present', 'tax', 'fine', 'penalty', 'interest',
            'emi', 'loan', 'debt', 'salary', 'wages', 'bonus', 'incentive'
        }
    
    def parse(self, text):
        expenses = []
        text = text.strip()
        
        # FIRST: Normalize numbers with commas (100,000 -> 100000)
        # Match patterns like 100,000 or 1,00,000 (Indian format)
        text = re.sub(r'(\d{1,3}),(\d{3})\b', r'\1\2', text)  # 100,000 -> 100000
        text = re.sub(r'(\d{1,2}),(\d{2}),(\d{3})\b', r'\1\2\3', text)  # 1,00,000 -> 100000
        text = re.sub(r'(\d),(\d{2}),(\d{2}),(\d{3})\b', r'\1\2\3\4', text)  # 1,00,00,000 -> 10000000
        
        # Split by comma (now safe) or 'and' and process each part
        parts = re.split(r',|\band\b', text, flags=re.IGNORECASE)
        parts = [part.strip() for part in parts if part.strip()]
        
        for part in parts:
            expense = self._parse_single_expense(part)
            if expense:
                expenses.append(expense)
        
        reply = self._generate_reply(expenses)
        return expenses, reply
    
    def _parse_single_expense(self, text):
        """Parse a single expense from text with multiple pattern matching"""
        text = text.strip()
        
        # ============== LOAN REPAYMENT PATTERNS (4 scenarios) ==============
        # 1. BORROWED: I borrow from someone (money comes in, I owe them)
        # 2. LENT: I lend to someone (money goes out, they owe me)
        # 3. PAID: I pay back loan I borrowed (money goes out, my debt reduces)
        # 4. RECEIVED: Someone pays back loan they borrowed from me (money comes in, their debt reduces)
        
        # ===== PAID PATTERNS (I'm repaying a loan I borrowed) =====
        
        # Pattern: "paid loan to person amount" - I'm paying back loan to person
        # Example: "paid loan to hari 400" = I'm returning Rs.400 to Hari (I had borrowed from him)
        paid_loan_to_pattern = r'^paid\s+(?:back\s+)?(?:the\s+)?loan\s+to\s+([a-zA-Z]+)\s+(\d+)$'
        paid_loan_to_match = re.match(paid_loan_to_pattern, text, re.IGNORECASE)
        if paid_loan_to_match:
            person, amount = paid_loan_to_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Positive = money going out (I'm paying back)
                    'item': 'loan repayment',
                    'category': 'Loan',
                    'remarks': f"Paid back loan to {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "paid person money i took/borrowed from him/her amount"
        # Example: "paid hari money i took from him 5000" = I'm returning Rs.5000 to Hari
        paid_money_took_pattern = r'^paid\s+([a-zA-Z]+)\s+(?:the\s+)?(?:money|loan|amount)\s+(?:i|that\s+i)\s+(?:took|borrowed)\s+(?:from\s+(?:him|her|them))?\s*(\d+)$'
        paid_money_took_match = re.match(paid_money_took_pattern, text, re.IGNORECASE)
        if paid_money_took_match:
            person, amount = paid_money_took_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Positive = money going out (I'm repaying)
                    'item': 'loan repayment',
                    'category': 'Loan',
                    'remarks': f"Paid back money taken from {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "repaid person amount" or "repaid amount to person"
        # Example: "repaid hari 500" = I'm returning Rs.500 to Hari
        repaid_pattern = r'^repaid\s+([a-zA-Z]+)\s+(\d+)$'
        repaid_match = re.match(repaid_pattern, text, re.IGNORECASE)
        if repaid_match:
            person, amount = repaid_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Positive = money going out
                    'item': 'loan repayment',
                    'category': 'Loan',
                    'remarks': f"Repaid loan to {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "repaid amount to person"
        repaid_to_pattern = r'^repaid\s+(\d+)\s+to\s+([a-zA-Z]+)$'
        repaid_to_match = re.match(repaid_to_pattern, text, re.IGNORECASE)
        if repaid_to_match:
            amount, person = repaid_to_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Positive = money going out
                    'item': 'loan repayment',
                    'category': 'Loan',
                    'remarks': f"Repaid loan to {person.title()}",
                    'paid_by': person.title()
                }
        
        # ===== RECEIVED PATTERNS (Person is paying back loan they borrowed from me) =====
        
        # Pattern: "paid to person his/her loan amount" - Person paid back their loan
        # Example: "paid to hari his loan 500" = Hari returned Rs.500 he had borrowed from me
        paid_to_his_loan_pattern = r'^paid\s+to\s+([a-zA-Z]+)\s+(?:his|her|their)\s+loan\s+(\d+)$'
        paid_to_his_loan_match = re.match(paid_to_his_loan_pattern, text, re.IGNORECASE)
        if paid_to_his_loan_match:
            person, amount = paid_to_his_loan_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in (they're repaying me)
                    'item': 'loan received back',
                    'category': 'Loan',
                    'remarks': f"{person.title()} paid back their loan",
                    'paid_by': person.title()
                }
        
        # Pattern: "person paid his/her loan amount" - Person returned loan
        # Example: "hari paid his loan 400" = Hari returned Rs.400 he had borrowed from me
        person_paid_his_loan_pattern = r'^([a-zA-Z]+)\s+paid\s+(?:back\s+)?(?:his|her|their)\s+loan\s+(\d+)$'
        person_paid_his_loan_match = re.match(person_paid_his_loan_pattern, text, re.IGNORECASE)
        if person_paid_his_loan_match:
            person, amount = person_paid_his_loan_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in
                    'item': 'loan received back',
                    'category': 'Loan',
                    'remarks': f"{person.title()} paid back their loan",
                    'paid_by': person.title()
                }
        
        # Pattern: "received loan back from person amount"
        # Example: "received loan back from hari 500" = Hari returned Rs.500
        received_loan_back_pattern = r'^received\s+(?:the\s+)?loan\s+back\s+from\s+([a-zA-Z]+)\s+(\d+)$'
        received_loan_back_match = re.match(received_loan_back_pattern, text, re.IGNORECASE)
        if received_loan_back_match:
            person, amount = received_loan_back_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in
                    'item': 'loan received back',
                    'category': 'Loan',
                    'remarks': f"Received loan back from {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "got loan back from person amount"
        got_loan_back_pattern = r'^got\s+(?:the\s+)?loan\s+back\s+from\s+([a-zA-Z]+)\s+(\d+)$'
        got_loan_back_match = re.match(got_loan_back_pattern, text, re.IGNORECASE)
        if got_loan_back_match:
            person, amount = got_loan_back_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in
                    'item': 'loan received back',
                    'category': 'Loan',
                    'remarks': f"Got loan back from {person.title()}",
                    'paid_by': person.title()
                }
        
        # ============== LOAN PATTERNS FIRST (before generic patterns) ==============
        
        # Pattern 1: "Person lent [me] amount" - Explicit Loan
        person_lent_pattern = r'^([a-zA-Z]+)\s+(?:lent)(?:\s+me)?\s+(\d+)$'
        person_lent_match = re.match(person_lent_pattern, text, re.IGNORECASE)
        if person_lent_match:
            person, amount = person_lent_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount), # Negative = money coming in (I received)
                    'item': 'loan from',
                    'category': 'Loan',
                    'remarks': f"Loan from {person.title()}",
                    'paid_by': person.title()
                }

        # Pattern 2: "Person gave/sent/send [me] amount" - Ambiguous
        person_gave_pattern = r'^([a-zA-Z]+)\s+(?:gave|sent|send)(?:\s+me)?\s+(\d+)$'
        person_gave_match = re.match(person_gave_pattern, text, re.IGNORECASE)
        if person_gave_match:
            person, amount = person_gave_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount), # Negative = money coming in
                    'item': 'received from',
                    'category': 'Other', # Ambiguous - let user decide
                    'remarks': f"Received from {person.title()}",
                    'paid_by': person.title()
                }

        # Pattern: "i gave/lent person amount" like "i gave sonu 500" - needs confirmation (LENT or PAID?)
        i_gave_pattern = r'^i\s+(?:gave|lent|sent)\s+([a-zA-Z]+)\s+(\d+)$'
        i_gave_match = re.match(i_gave_pattern, text, re.IGNORECASE)
        if i_gave_match:
            person, amount = i_gave_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Will be corrected by user
                    'item': 'i gave',  # Hint for frontend
                    'category': 'Other',  # Triggers confirmation
                    'remarks': f"I gave {person.title()} Rs.{amount}",
                    'paid_by': person.title()
                }
        
        # Pattern: "i borrowed/took amount from person" like "i borrowed 500 from sonu"
        i_borrowed_pattern = r'^i\s+(?:borrowed|took)\s+(\d+)\s+from\s+([a-zA-Z]+)$'
        i_borrowed_match = re.match(i_borrowed_pattern, text, re.IGNORECASE)
        if i_borrowed_match:
            amount, person = i_borrowed_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in (debt)
                    'item': 'borrowed from',
                    'category': 'Loan',
                    'remarks': f"Borrowed from {person.title()}",
                    'paid_by': person.title()
                }
        

        
        # Pattern: "person borrowed amount" like "hari borrowed 400" (you lent to them)
        person_borrowed_pattern = r'^([a-zA-Z]+)\s+(?:borrowed|took)\s+(\d+)$'
        person_borrowed_match = re.match(person_borrowed_pattern, text, re.IGNORECASE)
        if person_borrowed_match:
            person, amount = person_borrowed_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Positive = money going out (you lent)
                    'item': 'lent to',
                    'category': 'Loan',
                    'remarks': f"Lent to {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "person paid amount" like "hari paid 400" (they paid back)
        person_paid_pattern = r'^([a-zA-Z]+)\s+paid\s+(\d+)$'
        person_paid_match = re.match(person_paid_pattern, text, re.IGNORECASE)
        if person_paid_match:
            person, amount = person_paid_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in (repayment)
                    'item': 'received from',
                    'category': 'Loan',
                    'remarks': f"Paid back by {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "amount received/got from person" like "100 received from rahul"
        amount_received_pattern = r'^(\d+)\s+(?:received|got|returned)\s+from\s+([a-zA-Z]+)'
        amount_received_match = re.match(amount_received_pattern, text, re.IGNORECASE)
        if amount_received_match:
            amount, person = amount_received_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in
                    'item': 'received from',
                    'category': 'Loan',
                    'remarks': f"Received from {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "got/received amount from person" like "got 400 from ram" (verb first)
        verb_received_pattern = r'^(?:got|received|returned)\s+(\d+)\s+from\s+([a-zA-Z]+)'
        verb_received_match = re.match(verb_received_pattern, text, re.IGNORECASE)
        if verb_received_match:
            amount, person = verb_received_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in
                    'item': 'received from',
                    'category': 'Loan',
                    'remarks': f"Received from {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "amount paid to person" like "500 paid to ram"
        amount_paid_pattern = r'^(\d+)\s+paid\s+to\s+([a-zA-Z]+)'
        amount_paid_match = re.match(amount_paid_pattern, text, re.IGNORECASE)
        if amount_paid_match:
            amount, person = amount_paid_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Positive = money going out
                    'item': 'paid to',
                    'category': 'Loan',
                    'remarks': f"Paid to {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "amount borrowed/took from person" like "5000 borrowed from sonu"
        amount_borrowed_pattern = r'^(\d+)\s+(?:borrowed|took)\s+from\s+([a-zA-Z]+)'
        amount_borrowed_match = re.match(amount_borrowed_pattern, text, re.IGNORECASE)
        if amount_borrowed_match:
            amount, person = amount_borrowed_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in (debt)
                    'item': 'borrowed from',
                    'category': 'Loan',
                    'remarks': f"Borrowed from {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "amount lent/gave to person" like "100 lent to rahul"
        amount_lent_pattern = r'^(\d+)\s+(?:lent|gave|lend|sent)\s+to\s+([a-zA-Z]+)'
        amount_lent_match = re.match(amount_lent_pattern, text, re.IGNORECASE)
        if amount_lent_match:
            amount, person = amount_lent_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Positive = money going out
                    'item': 'lent to',
                    'category': 'Loan',
                    'remarks': f"Lent to {person.title()}",
                    'paid_by': person.title()
                }
        
        # ============== AMBIGUOUS PATTERNS (need confirmation) ==============
        
        # Pattern: "got gift/money from person amount" - AMBIGUOUS, needs confirmation
        # Could be a gift (income) or a loan (debt)
        got_something_pattern = r'^(?:got|received)\s+(gift|money|cash|amount|fund|funds)\s+from\s+([a-zA-Z]+)\s+(\d+)$'
        got_something_match = re.match(got_something_pattern, text, re.IGNORECASE)
        if got_something_match:
            what, person, amount = got_something_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in
                    'item': f'{what} from person',  # Hint for frontend
                    'category': 'Other',  # Triggers confirmation popup
                    'remarks': f"Received {what} from {person.title()}",
                    'paid_by': person.title(),
                    'needs_confirmation': True,
                    'confirmation_options': [
                        {'category': 'Gift Income', 'label': 'Gift (no repayment needed)', 'remarks': f'Gift from {person.title()}'},
                        {'category': 'Loan', 'label': 'Loan (need to repay)', 'remarks': f'Loan received from {person.title()}'}
                    ]
                }
        
        # Pattern: "got gift/money amount from person" - alternate order
        got_amount_pattern = r'^(?:got|received)\s+(gift|money|cash|amount|fund|funds)\s+(\d+)\s+from\s+([a-zA-Z]+)$'
        got_amount_match = re.match(got_amount_pattern, text, re.IGNORECASE)
        if got_amount_match:
            what, amount, person = got_amount_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in
                    'item': f'{what} from person',  # Hint for frontend
                    'category': 'Other',  # Triggers confirmation popup
                    'remarks': f"Received {what} from {person.title()}",
                    'paid_by': person.title(),
                    'needs_confirmation': True,
                    'confirmation_options': [
                        {'category': 'Gift Income', 'label': 'Gift (no repayment needed)', 'remarks': f'Gift from {person.title()}'},
                        {'category': 'Loan', 'label': 'Loan (need to repay)', 'remarks': f'Loan received from {person.title()}'}
                    ]
                }
        
        # Pattern: "amount from person" - ambiguous, could be received OR borrowed
        ambiguous_from_pattern = r'^(\d+)\s+from\s+([a-zA-Z]+)$'
        ambiguous_from_match = re.match(ambiguous_from_pattern, text, re.IGNORECASE)
        if ambiguous_from_match:
            amount, person = ambiguous_from_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Will be corrected by user
                    'item': 'from person',  # Hint for frontend (money coming in)
                    'category': 'Other',  # Triggers confirmation
                    'remarks': f"Rs.{amount} from {person.title()}",
                    'paid_by': person.title()  # Important! Sets person for UI
                }
        
        # Pattern: "amount to person" - ambiguous, could be lent OR paid
        ambiguous_to_pattern = r'^(\d+)\s+to\s+([a-zA-Z]+)$'
        ambiguous_to_match = re.match(ambiguous_to_pattern, text, re.IGNORECASE)
        if ambiguous_to_match:
            amount, person = ambiguous_to_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Will be corrected by user
                    'item': 'to person',  # Hint for frontend (money going out)
                    'category': 'Other',  # Triggers confirmation
                    'remarks': f"Rs.{amount} to {person.title()}",
                    'paid_by': person.title()  # Important! Sets person for UI
                }
        
        # ============== GIFT EXPENSE PATTERNS ==============
        
        # Pattern: "got/bought gift for person amount" like "got gift for sonu 400"
        # This is an EXPENSE (buying a gift for someone), NOT income
        gift_for_pattern = r'^(?:got|bought|get|buy|purchased)\s+(?:a\s+)?gift\s+for\s+([a-zA-Z]+)\s+(\d+)$'
        gift_for_match = re.match(gift_for_pattern, text, re.IGNORECASE)
        if gift_for_match:
            person, amount = gift_for_match.groups()
            return {
                'amount': int(amount),
                'item': 'gift',
                'category': 'Shopping',
                'remarks': f"Gift for {person.title()}",
                'paid_by': None  # NOT paid_by - this is an expense I'm making
            }
        
        # Pattern: "gift for person amount" like "gift for sonu 400"
        gift_for_pattern2 = r'^gift\s+for\s+([a-zA-Z]+)\s+(\d+)$'
        gift_for_match2 = re.match(gift_for_pattern2, text, re.IGNORECASE)
        if gift_for_match2:
            person, amount = gift_for_match2.groups()
            return {
                'amount': int(amount),
                'item': 'gift',
                'category': 'Shopping',
                'remarks': f"Gift for {person.title()}",
                'paid_by': None  # NOT paid_by - this is an expense I'm making
            }
        
        # ============== INSTITUTION LOAN PATTERNS (before generic) ==============
        
        # Pattern: "amount borrowed from bank/institution [for purpose]"
        # Handles: "100000 borrowed from bank for home renovation"
        institution_borrow_pattern = r'^(\d+)\s+(?:borrowed|took|loan)\s+from\s+(bank|finance|company|app|nabil|nic|global|ime|sanima|himalayan|prabhu|laxmi|siddhartha|sunrise|kumari|machhapuchhre|agricultural|ncb|citizens)(?:\s+(?:for|to)\s+(.+))?$'
        institution_borrow_match = re.match(institution_borrow_pattern, text, re.IGNORECASE)
        if institution_borrow_match:
            amount = institution_borrow_match.group(1)
            institution = institution_borrow_match.group(2)
            purpose = institution_borrow_match.group(3)
            
            remark = f"Borrowed from {institution.title()}"
            if purpose:
                remark += f" for {purpose.title()}"
            
            return {
                'amount': -int(amount),  # NEGATIVE = I owe money (debt)
                'item': 'bank loan',
                'category': 'Loan',
                'remarks': remark,
                'paid_by': institution.title()
            }
        
        # ============== GENERIC PATTERNS (fallback) ==============
        
        # "amount item" pattern (most common) - AFTER loan patterns
        simple_pattern = r'^(\d+)\s+(.+)$'
        simple_match = re.match(simple_pattern, text)
        if simple_match:
            amount, item = simple_match.groups()
            item = self._clean_item_name(item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': self._generate_detailed_remark(item, category),
                'paid_by': None
            }
        
        # Pattern 0d: "person owes amount to person" with fuzzy matching
        # Check this FIRST to catch debt patterns before other matches
        debt_keywords = r'(?:owes?|ows?|owe|owz|owse|debt|borrows?|lends?|udhar|qarz)'
        owes_pattern = rf'([a-zA-Z]+)\s+{debt_keywords}\s+(\d+)\s+(?:to|from)\s+([a-zA-Z]+)'
        owes_match = re.search(owes_pattern, text, re.IGNORECASE)
        if owes_match:
            debtor, amount, creditor = owes_match.groups()
            if self._is_likely_person(debtor) and self._is_likely_person(creditor):
                return {
                    'amount': int(amount),
                    'item': f'{debtor.lower()} owes {creditor.lower()}',
                    'category': 'Loan',
                    'remarks': f"{debtor.title()} owes {creditor.title()}",
                    'paid_by': debtor.title()
                }
        
        # Pattern 0a: "got/received salary amount" like "got salary 100000" or "got salary today 50000"
        salary_pattern = r'^(?:got|received)\s+salary\s+(?:today\s+)?(\d+)$'
        salary_match = re.match(salary_pattern, text, re.IGNORECASE)
        if salary_match:
            amount = salary_match.group(1)
            return {
                'amount': -int(amount),  # Negative for income
                'item': 'salary',
                'category': 'Income',
                'remarks': 'Got Salary Today' if 'today' in text.lower() else 'Salary received',
                'paid_by': None
            }
        
        # Pattern 0b: "salary amount received" like "salary 100000 received"
        salary_pattern2 = r'^salary\s+(\d+)\s+(?:received|got)$'
        salary_match2 = re.match(salary_pattern2, text, re.IGNORECASE)
        if salary_match2:
            amount = salary_match2.group(1)
            return {
                'amount': -int(amount),  # Negative for income
                'item': 'salary',
                'category': 'Income',
                'remarks': 'Salary received',
                'paid_by': None
            }
        
        # Pattern 0c: General income patterns like "bonus 5000", "incentive 2000", "refund 1000"
        income_pattern = r'^(salary|bonus|incentive|refund|income|earning|payment|received)\s+(\d+)$'
        income_match = re.match(income_pattern, text, re.IGNORECASE)
        if income_match:
            income_type, amount = income_match.groups()
            return {
                'amount': -int(amount),  # Negative for income
                'item': income_type.lower(),
                'category': 'Income',
                'remarks': f'{income_type.title()} received',
                'paid_by': None
            }
        
        # Pattern 0d: "got back/received amount from person" like "got back 400 from sonu" or "received 100 from rahul"
        repayment_pattern = r'^(?:got\s+back|received|returned)\s+(\d+)\s+from\s+([a-zA-Z]+)'
        repayment_match = re.match(repayment_pattern, text, re.IGNORECASE)
        if repayment_match:
            amount, person = repayment_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in
                    'item': 'received from',
                    'category': 'Loan',
                    'remarks': f"Received from {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern 0d2: "amount received from person" like "100 received from rahul"
        amount_received_pattern = r'^(\d+)\s+(?:received|got|returned)\s+from\s+([a-zA-Z]+)'
        amount_received_match = re.match(amount_received_pattern, text, re.IGNORECASE)
        if amount_received_match:
            amount, person = amount_received_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative = money coming in
                    'item': 'received from',
                    'category': 'Loan',
                    'remarks': f"Received from {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern 0d3: "paid amount to person" like "paid 500 to ram"
        paid_to_pattern = r'^paid\s+(\d+)\s+to\s+([a-zA-Z]+)'
        paid_to_match = re.match(paid_to_pattern, text, re.IGNORECASE)
        if paid_to_match:
            amount, person = paid_to_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Positive = money going out
                    'item': 'paid to',
                    'category': 'Loan',
                    'remarks': f"Paid to {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern 0d4: "amount paid to person" like "500 paid to ram"
        amount_paid_pattern = r'^(\d+)\s+paid\s+to\s+([a-zA-Z]+)'
        amount_paid_match = re.match(amount_paid_pattern, text, re.IGNORECASE)
        if amount_paid_match:
            amount, person = amount_paid_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),  # Positive = money going out
                    'item': 'paid to',
                    'category': 'Loan',
                    'remarks': f"Paid to {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern 0e: "took/borrowed/received [back] [loan] from person amount"
        # Handles: "recived back loan from hari 100000"
        borrow_pattern = r'^(?:took|borrowed|received|recived|recieved|got)(?:\s+back)?\s+(?:loan\s+)?from\s+([a-zA-Z]+)\s+(\d+)'
        borrow_match = re.match(borrow_pattern, text, re.IGNORECASE)
        if borrow_match:
            person, amount = borrow_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative for loan taken/repaid
                    'item': 'loan transaction',
                    'category': 'Loan',
                    'remarks': f"Loan transaction with {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern: "amount borrowed from bank/institution [for purpose]"
        # Handles: "1 lakh borrowed from bank for home renovation", "100000 borrowed from bank"
        # Institution names: bank, finance, company, app, etc.
        institution_borrow_pattern = r'^(\d+)\s+(?:borrowed|took|loan)\s+from\s+(bank|finance|company|app|nabil|nic|global|ime|sanima|himalayan|prabhu|laxmi|siddhartha|sunrise|kumari|machhapuchhre|agricultural|ncb|citizens)(?:\s+(?:for|to)\s+(.+))?$'
        institution_borrow_match = re.match(institution_borrow_pattern, text, re.IGNORECASE)
        if institution_borrow_match:
            amount = institution_borrow_match.group(1)
            institution = institution_borrow_match.group(2)
            purpose = institution_borrow_match.group(3)
            
            remark = f"Borrowed from {institution.title()}"
            if purpose:
                remark += f" for {purpose.title()}"
            
            return {
                'amount': -int(amount),  # NEGATIVE = I owe money (debt)
                'item': 'bank loan',
                'category': 'Loan',
                'remarks': remark,
                'paid_by': institution.title()
            }
        
        # Pattern: "borrowed amount from bank [for purpose]" (verb first)
        institution_borrow_pattern2 = r'^(?:borrowed|took)\s+(\d+)\s+from\s+(bank|finance|company|app|nabil|nic|global|ime|sanima|himalayan|prabhu|laxmi|siddhartha|sunrise|kumari|machhapuchhre|agricultural|ncb|citizens)(?:\s+(?:for|to)\s+(.+))?$'
        institution_borrow_match2 = re.match(institution_borrow_pattern2, text, re.IGNORECASE)
        if institution_borrow_match2:
            amount = institution_borrow_match2.group(1)
            institution = institution_borrow_match2.group(2)
            purpose = institution_borrow_match2.group(3)
            
            remark = f"Borrowed from {institution.title()}"
            if purpose:
                remark += f" for {purpose.title()}"
            
            return {
                'amount': -int(amount),  # NEGATIVE = I owe money (debt)
                'item': 'bank loan',
                'category': 'Loan',
                'remarks': remark,
                'paid_by': institution.title()
            }

        # Pattern 0f: "took/borrowed amount from person" like "borrowed 5000 from sonu"
        borrow_pattern_2 = r'^(?:took|borrowed)\s+(\d+)\s+(?:loan\s+)?from\s+([a-zA-Z]+)'
        borrow_match_2 = re.match(borrow_pattern_2, text, re.IGNORECASE)
        if borrow_match_2:
            amount, person = borrow_match_2.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative for loan taken
                    'item': 'borrowed from',
                    'category': 'Loan',
                    'remarks': f"Borrowed from {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern 0f2: "amount borrowed from person" like "5000 borrowed from sonu"
        amount_borrowed_pattern = r'^(\d+)\s+(?:borrowed|took)\s+from\s+([a-zA-Z]+)'
        amount_borrowed_match = re.match(amount_borrowed_pattern, text, re.IGNORECASE)
        if amount_borrowed_match:
            amount, person = amount_borrowed_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': -int(amount),  # Negative for loan taken
                    'item': 'borrowed from',
                    'category': 'Loan',
                    'remarks': f"Borrowed from {person.title()}",
                    'paid_by': person.title()
                }

        # Pattern 1a: "lent/gave amount to person" like "lent 100 to Rahul"
        lent_to_pattern = r'^(?:lent|gave|lend|sent)\s+(\d+)\s+to\s+([a-zA-Z]+)'
        lent_to_match = re.match(lent_to_pattern, text, re.IGNORECASE)
        if lent_to_match:
            amount, person = lent_to_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),
                    'item': 'loan given',
                    'category': 'Loan',
                    'remarks': f"Lent to {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern 1b: "gave person amount for duration" like "gave sonu 400 for a week"
        gave_duration_pattern = r'^(?:gave|lend|lent)\s+([a-zA-Z]+)\s+(\d+)\s+for\s+(.+)$'
        gave_duration_match = re.match(gave_duration_pattern, text, re.IGNORECASE)
        if gave_duration_match:
            person, amount, duration = gave_duration_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),
                    'item': 'loan given',
                    'category': 'Loan',
                    'remarks': f"Lent to {person.title()} for {duration}",
                    'paid_by': person.title()
                }
        
        # Pattern 1b: "gave person amount loan" like "gave gaurav 300 loan"
        loan_pattern = r'^(?:gave|lend|lent)\s+([a-zA-Z]+)\s+(\d+)\s*(?:loan|rin|udhar)?$'
        loan_match = re.match(loan_pattern, text, re.IGNORECASE)
        if loan_match:
            person, amount = loan_match.groups()
            if self._is_likely_person(person):
                return {
                    'amount': int(amount),
                    'item': 'loan',
                    'category': 'Loan',
                    'remarks': f"Loan given to {person.title()}",
                    'paid_by': person.title()
                }
        
        # Pattern 1c: "loan paid amount" like "loan paid 400"
        loan_paid_pattern = r'^loan\s+paid\s+(\d+)$'
        loan_paid_match = re.match(loan_paid_pattern, text, re.IGNORECASE)
        if loan_paid_match:
            amount = loan_paid_match.group(1)
            return {
                'amount': int(amount),
                'item': 'loan given',
                'category': 'Loan',
                'remarks': 'Loan given',
                'paid_by': None
            }
        
        # Pattern 2: "item person amount" like "rent sonu 20000" or "tea gaurav 100"
        pattern1 = r'^([a-zA-Z\s]+?)\s+([a-zA-Z]+)\s+(\d+)$'
        match1 = re.match(pattern1, text)
        if match1:
            item, potential_person, amount = match1.groups()
            
            # Use improved person detection
            if self._is_likely_person(potential_person, context_word=item.strip().split()[-1] if item.strip() else None):
                item = self._clean_item_name(item)
                category = self._categorize(item)
                return {
                    'amount': int(amount),
                    'item': item.lower(),
                    'category': category,
                    'remarks': f"{item.title()} - Paid by {potential_person.title()}",
                    'paid_by': potential_person.title()
                }
            else:
                # If not a person, the whole thing is the item
                full_item = f"{item} {potential_person}"
                item = self._clean_item_name(full_item)
                category = self._categorize(item)
                return {
                    'amount': int(amount),
                    'item': item.lower(),
                    'category': category,
                    'remarks': self._generate_detailed_remark(item, category),
                    'paid_by': None
                }
        
        # Pattern 3: "item for/on context amount" like "samosa for lunch 80"
        pattern2a = r'^([a-zA-Z\s]+?)\s+(?:for|on)\s+([a-zA-Z\s]+?)\s+(\d+)$'
        match2a = re.match(pattern2a, text)
        if match2a:
            item, context, amount = match2a.groups()
            full_item = f"{item} for {context}"
            item = self._clean_item_name(full_item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': self._generate_detailed_remark(item, category),
                'paid_by': None
            }
        
        # Pattern 3b: "amount for/on item" like "500 for petrol" or "100 on tea"
        pattern2 = r'^(\d+)\s+(?:for|on)\s+(?:the\s+)?(.+)$'
        match2 = re.match(pattern2, text)
        if match2:
            amount, item = match2.groups()
            item = self._clean_item_name(item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': self._generate_detailed_remark(item, category),
                'paid_by': None
            }
        
        # Pattern 4: "spend amount on item" like "spend 100 on tea"
        pattern3 = r'^spend\s+(\d+)\s+on\s+(?:the\s+)?(.+)$'
        match3 = re.match(pattern3, text, re.IGNORECASE)
        if match3:
            amount, item = match3.groups()
            item = self._clean_item_name(item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': item.title()
            }
        
        # Pattern 4b: "paid/payed amount for item" like "paid 5000 for hotel"
        paid_pattern = r'^(?:paid|payed)\s+(\d+)\s+for\s+(?:the\s+)?(.+)$'
        paid_match = re.match(paid_pattern, text, re.IGNORECASE)
        if paid_match:
            amount, item = paid_match.groups()
            item = self._clean_item_name(item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': item.title()
            }
        
        # Pattern 5: "amount spend on item" like "150 spend on momo"
        pattern3b = r'^(\d+)\s+spend\s+on\s+(?:the\s+)?(.+)$'
        match3b = re.match(pattern3b, text, re.IGNORECASE)
        if match3b:
            amount, item = match3b.groups()
            item = self._clean_item_name(item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': item.title()
            }
        
        # Pattern 6a: "item - paid by person amount" like "Purchased Phone - Paid by Case 500"
        pattern4a = r'^(.+?)\s*-\s*paid\s+by\s+([a-zA-Z]+)\s+(\d+)$'
        match4a = re.match(pattern4a, text, re.IGNORECASE)
        if match4a:
            item, person, amount = match4a.groups()
            item = self._clean_item_name(item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': f"{item.title()} - Paid by {person.title()}",
                'paid_by': person.title()
            }
        
        # Pattern 6: "item amount paid by person" like "rent 20000 paid by sonu"
        pattern4 = r'^([a-zA-Z\s]+?)\s+(\d+)\s+paid\s+by\s+([a-zA-Z]+)$'
        match4 = re.match(pattern4, text, re.IGNORECASE)
        if match4:
            item, amount, person = match4.groups()
            item = self._clean_item_name(item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': f"{item.title()} - Paid by {person.title()}",
                'paid_by': person.title()
            }
        
        # Pattern 6b: "item cost/costs amount" like "fan cost 4000" or "ac costs 200000"
        cost_pattern = r'^([a-zA-Z\s]+?)\s+costs?\s+(\d+)$'
        cost_match = re.match(cost_pattern, text, re.IGNORECASE)
        if cost_match:
            item, amount = cost_match.groups()
            item = self._clean_item_name(item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': self._generate_detailed_remark(item, category)
            }
        
        # Pattern 6c: "item of amount" like "Purchased Phone of 500"
        pattern4c = r'^(.+?)\s+of\s+(\d+)$'
        match4c = re.match(pattern4c, text, re.IGNORECASE)
        if match4c:
            item, amount = match4c.groups()
            item = self._clean_item_name(item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': self._generate_detailed_remark(item, category)
            }
        
        # Pattern 7: "item amount" like "grocery 300" or "biryani 500"
        pattern5 = r'^([a-zA-Z\s]+?)\s+(\d+)$'
        match5 = re.match(pattern5, text)
        if match5:
            item, amount = match5.groups()
            # Special handling for loan transactions
            if item.lower().strip() == 'loan':
                return {
                    'amount': int(amount),
                    'item': 'loan given',
                    'category': 'Loan',
                    'remarks': 'Loan given',
                    'paid_by': None
                }
            
            item = self._clean_item_name(item)
            category = self._categorize(item)
            return {
                'amount': int(amount),
                'item': item.lower(),
                'category': category,
                'remarks': self._generate_detailed_remark(item, category),
                'paid_by': None
            }
        
        # FALLBACK: Extract any standalone number and treat rest as item
        number_match = re.search(r'\b(\d+)\b', text)
        if number_match:
            amount = int(number_match.group(1))
            # Remove the number and clean the remaining text
            item = re.sub(r'\b\d+\b', '', text).strip()
            
            # Anti-gibberish check: Reject if item still contains numbers or is just a single letter
            if item and len(item) > 1 and not re.search(r'\d', item):
                item = self._clean_item_name(item)
                category = self._categorize(item)
                return {
                    'amount': amount,
                    'item': item.lower(),
                    'category': category,
                    'remarks': self._generate_detailed_remark(item, category),
                    'paid_by': None
                }
        
        # Fallback 2: Extract explicit "Rs.X" and treat rest as item
        amount_match = re.search(r'\bRs\.?\s*(\d+)\b', text, re.IGNORECASE)
        if amount_match:
            amount = int(amount_match.group(1))
            description = re.sub(r'\bRs\.?\s*\d+\b', '', text, flags=re.IGNORECASE)
            description = re.sub(r'\b(on|for|spent|the|paid|by)\b', '', description, flags=re.IGNORECASE)
            description = re.sub(r'\s+', ' ', description).strip()
            
            if description and len(description) > 1 and not re.search(r'\d', description):
                description = self._clean_item_name(description)
                category = self._categorize(description)
                return {
                    'amount': amount,
                    'item': description.lower(),
                    'category': category,
                    'remarks': self._generate_detailed_remark(description, category)
                }
        
        return None
    
    def _is_likely_person(self, word, context_word=None):
        """Check if a word is likely a person's name using smart heuristics"""
        word_lower = word.lower()
        
        # 1. Too short to be a name
        if len(word) < 3:
            return False
        
        # 2. If it's a known category keyword, it's not a person
        if word_lower in self.all_keywords:
            return False
        
        # 3. If in our explicit non-person list, it's not a person
        if word_lower in self.non_person_words:
            return False
        
        # 4. Check category lists
        for keywords in self.categories.values():
            if word_lower in keywords:
                return False
        
        # 5. SMART HEURISTIC: If context word (the previous word) is a known category item,
        # then this word is likely part of a compound item, not a person
        if context_word:
            context_lower = context_word.lower()
            # Check if context is a known item category word
            for keywords in self.categories.values():
                if context_lower in keywords:
                    # The previous word is a known item, so this word might be a descriptor
                    # e.g., "water jar" - water is known, jar is likely part of the item
                    return False
            # Check if context is in all_keywords
            if context_lower in self.all_keywords:
                return False
        
        # 6. SMART HEURISTIC: Common object/container/descriptor patterns 
        # These are so common they should never be mistaken for names
        common_objects = {
            # Containers
            'jar', 'box', 'bag', 'pack', 'packet', 'bottle', 'can', 'tin', 'case', 'tray',
            'plate', 'bowl', 'cup', 'glass', 'mug', 'pot', 'pan', 'container', 'carton',
            # Sizes/quantities  
            'small', 'medium', 'large', 'big', 'mini', 'extra', 'double', 'triple',
            'half', 'full', 'empty', 'single', 'pair', 'set', 'dozen', 'kilo', 'litre',
            # Colors
            'red', 'blue', 'green', 'yellow', 'black', 'white', 'pink', 'brown', 'grey', 'gray', 'orange', 'purple',
            # Common descriptors
            'new', 'old', 'fresh', 'hot', 'cold', 'dry', 'wet', 'raw', 'cooked', 'fried', 'boiled',
            'sweet', 'spicy', 'sour', 'salty', 'plain', 'mixed', 'special', 'regular', 'normal',
            # Common things
            'bill', 'card', 'ticket', 'pass', 'fee', 'charge', 'cost', 'price', 'rate',
            'service', 'repair', 'work', 'job', 'trip', 'ride', 'fare', 'wash', 'clean',
            # More items
            'cover', 'sheet', 'roll', 'tube', 'stick', 'piece', 'slice', 'unit', 'item'
        }
        if word_lower in common_objects:
            return False
        
        # 7. If word contains numbers, it's not a person
        if any(c.isdigit() for c in word):
            return False
        
        # 8. Very long words (>10 chars) are rarely names in casual input
        if len(word) > 10:
            return False
        
        # Default: assume it could be a person
        return True

    def _generate_detailed_remark(self, item, category):
        """Generate a more professional remark based on category"""
        item_title = item.title()
        item_lower = item.lower()
        cat_lower = category.lower()
        
        if cat_lower == 'food':
            return f"Food: {item_title}" if 'food' in item_lower else f"Spent on {item_title}"
        elif cat_lower == 'shopping':
            return f"Purchased {item_title}"
        elif cat_lower == 'transport':
            return f"Travelled by {item_title}" if any(w in item_lower for w in ['taxi', 'bus', 'uber']) else f"Spent on {item_title}"
        elif cat_lower == 'groceries':
            return f"Grocery: {item_title}"
        elif cat_lower == 'utilities':
            return f"Paid {item_title}" if 'bill' in item_lower else f"Paid {item_title} Bill"
        elif cat_lower == 'entertainment':
            return f"Entertainment: {item_title}"
        elif cat_lower == 'education':
            return f"Education: {item_title}"
        
        return item_title

    def _clean_item_name(self, item):
        """Clean and normalize item names"""
        item = item.strip()
        # Strip common verbs/articles from start
        item = re.sub(r'^(had|ate|took|got|bought|buy|ordered|spent|paid|for|on)\s+', '', item, flags=re.IGNORECASE)
        item = re.sub(r'\b(the|a|an)\b', '', item, flags=re.IGNORECASE)
        item = re.sub(r'\s+', ' ', item).strip()
        
        nepali_mappings = {
            'chowmin': 'chowmein', 'chow min': 'chowmein',
            'khana': 'food', 'khaana': 'food',
            'chiya': 'tea', 'chai': 'tea',
            'dudh': 'milk', 'paani': 'water',
            'bhat': 'rice', 'daal': 'dal',
            'tarkari': 'vegetables', 'sabji': 'vegetables',
            'machha': 'fish', 'anda': 'egg',
            'lasi': 'lassi', 'phal': 'fruits',
            'alu': 'potato', 'pyaj': 'onion',
            'kapada': 'clothes', 'jutta': 'shoes',
            'ghar': 'house', 'kotha': 'room',
            'gaadi': 'vehicle', 'current': 'electricity',
            'admission fee': 'admission fee', 'fee': 'fee'
        }
        
        item_lower = item.lower()
        item_lower = item.lower()
        for nepali, english in nepali_mappings.items():
            # Use word boundaries to avoid partial matches (e.g. "anda" in "chandan")
            if re.search(r'\b' + re.escape(nepali) + r'\b', item_lower):
                item_lower = re.sub(r'\b' + re.escape(nepali) + r'\b', english, item_lower)
                # Update item to reflect changes but maintain case if possible (difficult here so we use lower)
                item = item_lower
                break
        
        return item
    
    def _categorize(self, description):
        description_lower = description.lower()
        
        # Check existing categories first
        for category, keywords in self.categories.items():
            if any(keyword in description_lower for keyword in keywords):
                return category.title()
        
        # Smart category creation for unknown items
        return self._smart_categorize(description_lower)
    
    def _smart_categorize(self, description):
        """Create intelligent categories for unknown items"""
        # Electronics & Appliances
        if any(word in description for word in ['fan', 'ac', 'tv', 'fridge', 'laptop', 'phone', 'mobile', 'computer', 'tablet', 'camera', 'speaker', 'headphone', 'charger', 'appliance', 'electronic']):
            return 'Electronics'
        
        # Travel & Accommodation
        if any(word in description for word in ['hotel', 'stay', 'booking', 'resort', 'lodge', 'airbnb', 'hostel']):
            return 'Travel'
        
        # Medical & Health
        if any(word in description for word in ['doctor', 'medicine', 'hospital', 'clinic', 'pharmacy', 'medical', 'health']):
            return 'Medical'
        
        # Education - Enhanced
        if any(word in description for word in ['admission', 'fee', 'tuition', 'school', 'college', 'university', 'course', 'class', 'book', 'study', 'education', 'exam', 'test']):
            return 'Education'
        
        # Beauty & Personal Care
        if any(word in description for word in ['salon', 'haircut', 'beauty', 'cosmetic', 'spa', 'massage']):
            return 'Personal Care'
        
        # Gifts & Donations
        if any(word in description for word in ['gift', 'present', 'donation', 'charity', 'birthday']):
            return 'Gifts'
        
        # Insurance & Finance
        if any(word in description for word in ['insurance', 'premium', 'policy', 'bank', 'fee', 'charge']):
            return 'Finance'
        
        # Maintenance & Repair
        if any(word in description for word in ['repair', 'fix', 'maintenance', 'service', 'cleaning']):
            return 'Maintenance'
        
        # Sports & Fitness
        if any(word in description for word in ['gym', 'fitness', 'sport', 'exercise', 'yoga', 'swimming']):
            return 'Fitness'
        
        # Food/Drinks - catch common items
        if any(word in description for word in ['chiya', 'chai', 'tea', 'coffee', 'drink', 'beverage', 'snack']):
            return 'Food'
        
        return 'Other'
    
    def _generate_reply(self, expenses):
        if not expenses:
            return "ERROR: No expenses found. Try: '500 on biryani, 400 on grocery'"
        
        reply_parts = []
        for expense in expenses:
            amount = expense['amount']
            needs_confirmation = expense.get('needs_confirmation', False)
            
            # Handle confirmation cases
            if needs_confirmation:
                options = expense.get('confirmation_options', [])
                person = expense.get('paid_by', 'someone')
                options_text = " or ".join([opt.get('label', opt.get('category', '')) for opt in options])
                # pyre-ignore[6]
                reply_parts.append(str(f"CONFIRM: Rs.{abs(amount)} from {person} - Is this a {options_text}?"))
            elif amount < 0:  # Income
                # pyre-ignore[6]
                reply_parts.append(str(f"SUCCESS: Added Rs.{abs(amount)} -> {expense['category']} ({expense['remarks']})"))
            else:  # Expense
                # pyre-ignore[6]
                reply_parts.append(str(f"SUCCESS: Added Rs.{amount} -> {expense['category']} ({expense['remarks']})"))
        
        return '\n'.join(reply_parts)

class NLPService:
    def __init__(self):
        self.gemini_available = False
        self.model = None
        self.parser = ExpenseParser()
        self._setup_gemini()
        # Initialize RAG service
        try:
            # pyre-ignore[21]
            from services.rag_service import RAGService
            self.rag_service = RAGService()
        except Exception as e:
            print(f"RAG Service initialization failed: {e}")
            self.rag_service = None
    
    def _setup_gemini(self):
        """Setup Gemini AI with error handling"""
        self.gemini_available = False
        self.model = None
        
        if not GENAI_AVAILABLE:
            print("WARNING: google-generativeai not installed")
            return
        
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if gemini_api_key and gemini_api_key.strip():
            try:
                # pyre-ignore[16]
                genai.configure(api_key=gemini_api_key)
                # gemini-2.5-flash found to be more stable on free tier than 2.0-flash
                # pyre-ignore[16]
                self.model = genai.GenerativeModel('gemini-2.5-flash')
                self.gemini_available = True
                print("SUCCESS: Gemini API configured (gemini-2.5-flash)")
            except Exception as e:
                print(f"ERROR: Gemini API setup failed: {e}")
    
    def get_gemini_response(self, prompt: str) -> Optional[str]:
        """Get response from Gemini with error handling and retries"""
        if not self.model or not self.gemini_available:
            return None
        
        # Retry configuration
        max_retries = 3
        base_delay = 2
        
        import time
        
        for attempt in range(max_retries + 1):
            try:
                # pyre-ignore[16]
                response = self.model.generate_content(prompt)
                if response and response.text:
                    return response.text.strip()
            except Exception as e:
                error_str = str(e).lower()
                # Check for rate limit errors (429 or quota exceeded)
                if '429' in error_str or 'quota' in error_str:
                    if attempt < max_retries:
                        delay = base_delay * (2 ** attempt) # Exponential backoff: 2, 4, 8 sent
                        print(f"Gemini Rate Limit (429). Retrying in {delay}s... (Attempt {attempt+1}/{max_retries})")
                        time.sleep(delay)
                        continue
                    else:
                        print(f"Gemini Rate Limit Exceeded after {max_retries} retries.")
                else:
                    print(f"Gemini API error: {e}")
                    # Non-retryable error
                    break
        
        return None
    
    async def _ai_enhanced_parse(self, text):
        """Use AI to intelligently parse expense text"""
        try:
            prompt = f"""
You are an intelligent personal finance assistant. Parse the following text into structured transaction data.
Your goal is to "understand" the intent behind the transaction and categorize it accurately.

Text to Parse: "{text}"

LOGIC & REASONING RULES:
1. **GIFT FOR vs GIFT FROM (IMPORTANT)**:
   - "gift FOR [person]", "bought gift for [person]" = **EXPENSE** (Shopping). I'm spending money to buy a gift.
     - Remark: "Gift for [Person]". DO NOT set paid_by.
   - "gift FROM [person]", "got gift from [person]" = **AMBIGUOUS** (needs confirmation).
     - Set "needs_confirmation": true with options for Gift Income or Loan.

2. **PAID_BY RULES (CRITICAL)**:
   - Set "paid_by" ONLY when text EXPLICITLY says "paid by [person]" or in loan transactions.
   - For regular expenses like "gift for sonu", "food for party", etc. - DO NOT set paid_by.
   - "paid_by": null for most personal expenses.

3. **AMBIGUOUS CASES - ASK FOR CONFIRMATION**:
   - If text contains "got gift", "received gift", "got money", "received money" FROM A PERSON, this is AMBIGUOUS.
   - Set "needs_confirmation": true and provide "confirmation_options" array.

4. **Clear Loans (NO AMBIGUITY)**:
   - "borrowed", "took loan" FROM A PERSON = **LOAN (Debt)**. Amount is **NEGATIVE**.
   - "lent", "gave loan" TO A PERSON = **LOAN GIVEN**. Amount is **POSITIVE**.

5. **Clear Income (NO AMBIGUITY)**:
   - "Salary", "Bonus", "Refund", "Incentive" = **INCOME** (Negative amount).

6. **Categories (DYNAMIC)**:
   - Use specific categories: "Shopping" (for gifts), "Food", "Utilities", etc.
   - **Do not limit yourself to a fixed list. Create a category if it fits better.**

7. **Numbers & Units**:
   - "k" = 1,000, "Lakh"/"L" = 100,000, "Cr" = 10,000,000.

8. **Formatting**:
   - "paid_by": Set to null for personal expenses. Only set for explicit "paid by" or loan transactions.
   - "remarks": Generate a short, clear summary e.g. "Gift for Sonu", "Lunch expense".

9. **Gibberish / Invalid Text (CRITICAL)**:
   - If the text is random keyboard mashing (e.g., "asdf 123", "asvasfvava aer 43q413") or does not logically describe a financial transaction, MUST RETURN an empty expenses array `{"expenses": []}`.

Return ONLY valid JSON structure:
Example 1 - Regular expense (gift FOR someone):
{{
  "expenses": [
    {{"amount": 400, "item": "gift", "category": "Shopping", "remarks": "Gift for Sonu", "paid_by": null}}
  ]
}}

Example 2 - Ambiguous case (gift FROM someone):
{{
  "expenses": [
    {{"amount": -4000, "item": "gift from person", "category": "Other", "remarks": "Received gift from Sonu", "paid_by": "Sonu", "needs_confirmation": true, "confirmation_options": [{{"category": "Gift Income", "label": "Gift (no repayment needed)", "remarks": "Gift from Sonu"}}, {{"category": "Loan", "label": "Loan (need to repay)", "remarks": "Loan received from Sonu"}}]}}
  ]
}}
"""

            
            response = self.get_gemini_response(prompt)
            if response:
                # Clean response and extract JSON
                response = response.strip()
                if response.startswith('```json'):
                    response = response[7:-3]
                elif response.startswith('```'):
                    response = response[3:-3]
                
                # Find JSON in response
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                    parsed_data = json.loads(json_str)
                    
                    # Validate and fix structure
                    if 'expenses' not in parsed_data or not parsed_data['expenses']:
                        return {'status': 'error', 'message': "I didn't understand that transaction. Please provide a clear amount and item (e.g., '100 for tea')."}
                        
                    # Generate structured reply like regex parser
                    reply_parts: list[str] = []
                    for exp in parsed_data['expenses']:
                        amount = exp.get('amount', 0)
                        category = exp.get('category', 'Other')
                        remarks = exp.get('remarks', '')
                        needs_confirmation = exp.get('needs_confirmation', False)
                        
                        # Ensure category is Title Case
                        category = category.title()
                        exp['category'] = category
                        
                        # Handle confirmation cases
                        if needs_confirmation:
                            options = exp.get('confirmation_options', [])
                            person = exp.get('paid_by', 'someone')
                            options_text = " or ".join([opt.get('label', opt.get('category', '')) for opt in options])
                            reply_parts.append(f"CONFIRM: Rs.{abs(amount)} from {person} - Is this a {options_text}?")
                        elif amount < 0:
                            reply_parts.append(f"SUCCESS: Added Rs.{abs(amount)} -> {category} ({remarks})")
                        else:
                            reply_parts.append(f"SUCCESS: Added Rs.{amount} -> {category} ({remarks})")
                            
                    parsed_data['reply'] = '\n'.join(reply_parts)
                    return parsed_data
            
            return None
            
        except Exception as e:
            print(f"[AI_PARSE] Error: {e}")
            return None
    
    def _preprocess_text(self, text):
        """Pre-process text to handle units like k, lakh, crore"""
        if not text:
            return text
            
        text = text.lower()
        
        def replace_match(match):
            number = float(match.group(1))
            unit = match.group(2).lower()
            
            if 'c' in unit: # crore, cr
                return str(int(number * 10000000))
            elif 'l' in unit: # lakh, lac
                return str(int(number * 100000))
            elif 'k' in unit:
                return str(int(number * 1000))
            return match.group(0)

        # Pattern for decimal numbers followed by unit
        # 1.5k, 10 lakh, 1.25 cr
        # Added strict word boundary or whitespace check to avoid matching inside words if needed, 
        # but the unit list is specific enough with the order fix.
        pattern = r'(\d+(?:\.\d+)?)\s*(k|lakh|lac|l|crore|cr)\b'
        
        try:
            processed_text = re.sub(pattern, replace_match, text, flags=re.IGNORECASE)
            return processed_text
        except Exception as e:
            print(f"[PREPROCESS] Error: {e}")
            return text

    async def parse_expense(self, text: str):
        """Parse expense text and return structured data"""
        try:
            print(f"[PARSE] Processing: {text}")
            
            # Pre-process text to handle units
            text = self._preprocess_text(text)
            print(f"[PARSE] Pre-processed: {text}")
            
            # OPTIMIZATION: Try fast regex-based parser FIRST
            print(f"[PARSE] Using fast rule-based parser...")
            expenses, reply = self.parser.parse(text)
            
            # If regex parser succeeded with valid results, return immediately (FAST PATH)
            if expenses:
                # Check if any expense needs confirmation - if so, return it for user to choose
                needs_ai = False
                for exp in expenses:
                    if exp.get('needs_confirmation'):
                        # Has confirmation options, return directly for user choice
                        print(f"[PARSE] Regex found ambiguous case, returning for confirmation")
                        return {"expenses": expenses, "reply": reply}
                    # Only use AI if category is 'Other' with no confirmation (truly unknown)
                    if exp.get('category', '').lower() == 'other' and not exp.get('needs_confirmation'):
                        needs_ai = True
                
                # If all expenses are well-categorized, return fast
                if not needs_ai:
                    print(f"[PARSE] Fast regex parsed {len(expenses)} expenses successfully")
                    return {"expenses": expenses, "reply": reply}
            
            # SLOW PATH: Only use AI for complex/unknown cases
            if self.gemini_available:
                print(f"[PARSE] Trying AI for complex case...")
                ai_result = await self._ai_enhanced_parse(text)
                if ai_result and ai_result.get('expenses'):
                    print(f"[PARSE] AI successfully parsed {len(ai_result['expenses'])} expenses")
                    return ai_result
                else:
                    print(f"[PARSE] AI parsing failed")
            
            # Last resort: Return regex result even if category is 'Other'
            if expenses:
                print(f"[PARSE] Returning regex result as fallback")
                return {"expenses": expenses, "reply": reply}
            
            # Final fallback: simple extraction
            print(f"[PARSE] Trying simple extraction...")
            simple_expense = self._simple_extract(text)
            if simple_expense:
                expenses = [simple_expense]
                reply = f"SUCCESS: Added Rs.{simple_expense['amount']} -> {simple_expense['category']} ({simple_expense['remarks']})"
            
            return {
                "expenses": expenses,
                "reply": reply
            }
            
        except Exception as e:
            print(f"[ERROR] Parse error: {e}")
            return {
                "expenses": [],
                "reply": f"ERROR: Error parsing expenses: {str(e)}"
            }
    
    def _simple_extract(self, text):
        """Simple extraction as last resort"""
        try:
            # Find any number in the text
            number_match = re.search(r'(\d+)', text)
            if number_match:
                amount = int(number_match.group(1))
                # Remove number and clean text for item
                item = re.sub(r'\d+', '', text).strip()
                if not item:
                    item = 'expense'
                
                # Clean item name
                item = self.parser._clean_item_name(item)
                category = self.parser._categorize(item)
                
                return {
                    'amount': amount,
                    'item': item.lower(),
                    'category': category,
                    'remarks': self.parser._generate_detailed_remark(item, category),
                    'paid_by': None
                }
        except Exception as e:
            print(f"[SIMPLE_EXTRACT] Error: {e}")
        return None
    
    def _parse_multi_expenses(self, text):
        """Parse multiple expenses from comma-separated format"""
        try:
            parts = [p.strip() for p in text.split(',')]
            expenses = []
            
            i: int = 0
            while i < len(parts):
                amount_part = -1
                amount = 0
                found_amount = False
                
                # Look for Rs.Amount pattern
                # pyre-ignore[58]
                for j in range(i, min(i + 3, len(parts))):
                    amount_match = re.search(r'Rs\.?(\d+)', parts[j], re.IGNORECASE)
                    if amount_match:
                        # pyre-ignore[16]
                        amount = int(amount_match.group(1))
                        amount_part = int(j)
                        found_amount = True
                        break
                
                if not found_amount or amount_part == -1:
                    # pyre-ignore[58]
                    i += 1
                    continue
                
                # Get item (before amount)
                # pyre-ignore[58]
                item = parts[i] if i < amount_part else 'item'
                
                # Get category (after amount)
                # pyre-ignore[58]
                category = parts[amount_part + 1] if amount_part + 1 < len(parts) else 'Other'
                
                # Clean up
                item = re.sub(r'Rs\.?\d+', '', item, flags=re.IGNORECASE).strip()
                category = re.sub(r'Rs\.?\d+', '', category, flags=re.IGNORECASE).strip()
                
                if not item:
                    item = 'item'
                if not category:
                    category = 'Other'
                
                expenses.append({
                    'amount': amount,
                    'item': item.lower(),
                    'category': category.title(),
                    'remarks': self.parser._generate_detailed_remark(item, category),
                    'paid_by': None
                })
                
                # pyre-ignore[58]
                i = amount_part + 2
            
            return expenses if expenses else None
            
        except Exception as e:
            print(f"[MULTI_PARSE] Error: {e}")
            return None
    
    async def chat_about_expenses(self, request):
        """Handle chat requests about expenses using RAG with Gemini"""
        try:
            # pyre-ignore[21]
            from services.expense_analyzer import ExpenseAnalyzer
            
            analyzer = ExpenseAnalyzer()
            
            # Extract user name
            user_name = "there"
            if request.user_name and str(request.user_name).strip():
                user_name = str(request.user_name).strip()
            elif request.user_email:
                email_name = request.user_email.split('@')[0]
                user_name = email_name.capitalize()
            
            # Determine context and prepare data
            is_group_mode = bool(request.group_name and request.group_expenses_data)
            table_data = request.group_expenses_data if is_group_mode else (request.expenses_data or [])
            context_type = f"group '{request.group_name}'" if is_group_mode else "personal"
            
            if not table_data:
                response = f"Hi {user_name}! You don't have any {context_type} expenses recorded yet. Start by adding some expenses to get insights!"
                return {"reply": response}
            
            # Try RAG service first (enhanced with better context)
            if self.rag_service and self.rag_service.gemini_available:
                print(f"[CHAT] Using RAG service for query: {request.text}")
                rag_response = await self.rag_service.query_expenses(request.text, table_data, user_name)
                if rag_response:
                    print(f"[CHAT] RAG service provided response")
                    return {"reply": rag_response}
                else:
                    print(f"[CHAT] RAG service failed, trying legacy Gemini")
            
            # Analyze expenses for fallback
            analysis = analyzer.analyze_expenses(table_data)
            
            # Try legacy Gemini RAG if RAG service unavailable
            if self.gemini_available and not (self.rag_service and self.rag_service.gemini_available):
                print(f"[CHAT] Using legacy Gemini RAG")
                gemini_response = await self._gemini_rag_query(request.text, table_data, analysis, user_name)
                if gemini_response:
                    return {"reply": gemini_response}
            
            # Fallback to rule-based processing
            print(f"[CHAT] Using rule-based analyzer")
            processed_response = analyzer.process_query(request.text, analysis, context_type, table_data)
            final_response = f"Hi {user_name}! {processed_response}"
            return {"reply": final_response}
            
        except Exception as e:
            print(f"[ERROR] Chat error: {e}")
            error_name = user_name if 'user_name' in locals() else 'there'
            return {
                "reply": f"Hi {error_name}! Sorry, I encountered an error processing your question. Please try again.",
                "error": True
            }
    
    async def _gemini_rag_query(self, query: str, expenses_data: list, analysis: dict, user_name: str) -> Optional[str]:
        """Use Gemini with RAG (Retrieval Augmented Generation) for intelligent responses"""
        try:
            # Prepare structured data summary
            categories_summary = "\n".join([f"  - {cat.title()}: Rs.{amount}" for cat, amount in analysis['categories'].items()])
            
            # Get recent transactions safely preventing list slice type errors for Pyre
            # pyre-ignore[16]
            recent_txns = list(expenses_data)[:10] if int(len(expenses_data)) > 10 else list(expenses_data)
            transactions_text = "\n".join([
                f"  - Rs.{txn.get('amount', 0)} on {txn.get('item', 'item')} ({txn.get('category', 'Other')}) on {txn.get('date', 'N/A')}"
                for txn in recent_txns
            ])
            
            prompt = f"""
You are a personal finance assistant. Answer the user's question based on their financial data.

User: {user_name}
Query: "{query}"

FINANCIAL DATA:

Total Expenses: Rs.{analysis['total']}
Total Transactions: {analysis['count']}
Income: Rs.{analysis.get('total_income', 0)}
Net Balance: Rs.{analysis.get('net_balance', 0)}

Category Breakdown:
{categories_summary}

Recent Transactions:
{transactions_text}

INSTRUCTIONS:
1. Answer naturally and conversationally
2. Use the exact numbers from the data provided
3. If asked about multiple categories (e.g., "food and grocery"), combine the totals
4. Start response with "Hi {user_name}!"
5. Be concise but informative
6. If data is missing, say so politely

Provide a helpful, accurate response:
"""
            
            response = self.get_gemini_response(prompt)
            if response:
                return response.strip()
            
            return None
            
        except Exception as e:
            print(f"[GEMINI_RAG] Error: {e}")
            return None