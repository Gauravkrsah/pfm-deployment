import re
import json
import os
import base64
import binascii
import httpx
from typing import List, Dict, Any, Optional
from utils.assistant_output import final_answer_only
from utils.text_normalization import clean_spoken_text, first_name

# pyre-ignore[21]
from dotenv import load_dotenv

try:
    # pyre-ignore[21]
    from openai import OpenAI
    NIM_AVAILABLE = True
except ImportError:
    NIM_AVAILABLE = False
    OpenAI = None

load_dotenv()

DEFAULT_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_NIM_MODEL = "nvidia/nemotron-3-super-120b-a12b"
DEFAULT_NIM_ENTRY_MODEL = "nvidia/nemotron-3-nano-30b-a3b"
DEFAULT_MULTIMODAL_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
DEFAULT_TTS_URL = "https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com/v1/audio/synthesize"
DEFAULT_TTS_VOICE = "Magpie-Multilingual.EN-US.Aria"

class ExpenseParser:
    def __init__(self):
        self.categories = {
            'food': ['biryani', 'pizza', 'restaurant', 'meal', 'lunch', 'dinner', 'food', 'cafe', 'snack', 'tea', 'coffee', 'breakfast', 'momo', 'momos', 'noodles', 'chowmein', 'chowmin', 'chow', 'ramen', 'pasta', 'rice', 'dal', 'curry', 'khana', 'khaana', 'chiya', 'chai', 'dudh', 'milk', 'bhat', 'daal', 'tarkari', 'sabji', 'machha', 'fish', 'chicken', 'mutton', 'buff', 'pork', 'egg', 'anda', 'roti', 'chapati', 'paratha', 'samosa', 'pakoda', 'pakora', 'chaat', 'lassi', 'lasi', 'juice', 'paani', 'water', 'drink', 'beverage', 'ice cream', 'dessert', 'sweets', 'mithai', 'masala', 'paneer', 'veg', 'non-veg', 'burger', 'sandwich', 'roll', 'wrap', 'kathi', 'tikka', 'kebab', 'tandoori', 'thekuwa', 'thekua', 'sel roti', 'yomari', 'chatamari', 'bara', 'wo', 'kwati', 'jeri', 'jerry', 'puri'],
            'household cleaning': ['window cleaner', 'glass cleaner', 'floor cleaner', 'toilet cleaner', 'cleaning supplies'],
            'transport': ['petrol', 'fuel', 'taxi', 'uber', 'bus', 'train', 'auto', 'rickshaw', 'metro', 'flight', 'travel', 'tempo', 'microbus', 'bike', 'scooter', 'car', 'gaadi', 'diesel', 'parking', 'garage', 'toll', 'service', 'repair', 'ac', 'cooler', 'pump', 'motor'],
            'groceries': ['grocery', 'groceries', 'vegetables', 'fruits', 'market', 'supermarket', 'store', 'milk', 'bread', 'apple', 'garlic', 'potato', 'onion', 'tomato', 'sabji', 'tarkari', 'fruits', 'phal', 'alu', 'pyaj', 'lasun', 'dhaniya', 'hariyo', 'green', 'oil', 'salt', 'sugar', 'spices', 'shampoo', 'soap', 'detergent', 'paste', 'brush', 'oil', 'cream', 'powder', 'tissue', 'paper', 'napkin', 'sanitizer', 'bucket', 'mug', 'mop', 'broom'],
            'shopping': ['clothes', 'shoes', 'shopping', 'shirt', 'dress', 'bag', 'accessories', 'kapada', 'jutta', 'chappals', 'sandals', 'pant', 'jeans', 'tshirt', 'jacket', 'watch', 'belt', 'perfume', 'deo', 'makeup', 'lipstick', 'liner', 'mascara', 'polish', 'remover', 'gift', 'present', 'chair', 'furniture'],
            'utilities': ['electricity', 'water', 'internet', 'phone', 'mobile', 'wifi', 'bill', 'current', 'paani', 'net', 'recharge', 'tv', 'dish', 'gas', 'waste', 'broadband', 'cable', 'wire', 'switch', 'socket', 'bulb', 'light', 'battery', 'inverter', 'topup', 'data', 'plan', 'subscription'],
            'electronics': ['heater', 'fan', 'fridge', 'microwave', 'oven', 'stove', 'chimney', 'charger', 'remote', 'speaker', 'headphone', 'earphone', 'laptop', 'tablet', 'radio', 'iron', 'geyser', 'blender', 'mixer', 'toaster', 'kettle', 'purifier', 'filter', 'vacuum', 'machine'],
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

        self.typo_corrections = {
            'petril': 'petrol',
            'petorl': 'petrol',
            'petol': 'petrol',
            'petrel': 'petrol',
            'disel': 'diesel',
            'diseal': 'diesel',
            'resturant': 'restaurant',
            'restaurent': 'restaurant',
            'restrant': 'restaurant',
            'grosary': 'grocery',
            'grocary': 'grocery',
            'grocry': 'grocery',
            'vegitables': 'vegetables',
            'vegitable': 'vegetables',
            'vegtable': 'vegetables',
            'medecine': 'medicine',
            'medicin': 'medicine',
            'electricty': 'electricity',
            'electrcity': 'electricity',
            'intenet': 'internet',
            'interent': 'internet',
            'rechrge': 'recharge',
            'rechage': 'recharge',
            'cofee': 'coffee',
            'coffe': 'coffee',
            'cury': 'curry',
            'biryni': 'biryani',
            'biriyani': 'biryani',
            'rapair': 'repair',
            'maintance': 'maintenance',
        }

    def parse(self, text):
        expenses = []
        text = self._normalise_entry_command(text)
        
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
        text = self._normalise_entry_command(text)
        if not text:
            return None
        
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

        # Pattern: "i paid 5000 for food of ram" / "paid 5000 for ram's food"
        # In loan mode this means the user covered an expense for someone.
        paid_for_person_patterns = [
            r'^(?:i\s+)?(?:paid|payed)\s+(\d+)\s+for\s+([a-zA-Z]+)\s+of\s+(?:his|her|their)\b',
            r'^(?:i\s+)?(?:paid|payed)\s+(\d+)\s+for\s+.+?\s+of\s+([a-zA-Z]+)(?:\s+|$)',
            r'^(?:i\s+)?(?:paid|payed)\s+(\d+)\s+for\s+([a-zA-Z]+)(?:\'s|s)?\s+.+',
        ]
        for paid_for_person_pattern in paid_for_person_patterns:
            paid_for_person_match = re.match(paid_for_person_pattern, text, re.IGNORECASE)
            if paid_for_person_match:
                amount, person = paid_for_person_match.groups()
                if self._is_likely_person(person):
                    return {
                        'amount': int(amount),  # Positive = money going out; they owe me
                        'item': 'lent to',
                        'category': 'Loan',
                        'remarks': f"Paid expense for {person.title()}",
                        'paid_by': person.title(),
                        'needs_confirmation': False
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
        """Use a factual item note instead of inventing context-specific prose."""
        cleaned = self._clean_item_name(str(item or ""))
        if not cleaned:
            return "Transaction note"
        if str(category or "").lower() == "income":
            return f"Income from {cleaned.title()}"
        if str(category or "").lower() == "rent":
            return f"{cleaned.title()} payment"
        return cleaned.title()

    def _normalise_entry_command(self, text):
        """Remove assistant-command wording so only the transaction remains."""
        text = clean_spoken_text(text)
        text = re.sub(r'\s+', ' ', text).strip()
        text = re.sub(
            r'^(?:can|could|would)\s+you\s+(?:please\s+)?',
            '',
            text,
            flags=re.IGNORECASE,
        ).strip()
        text = re.sub(
            r'^(?:please\s+)?(?:add|record|save|log|put|enter)\s+(?:this\s+)?(?:as\s+)?',
            '',
            text,
            flags=re.IGNORECASE,
        ).strip()
        text = re.sub(
            r'\b(?:in|to|as|under)\s+(?:the\s+)?(?:expense|expenses|income|loan|loans)\b',
            ' ',
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r'\b(?:expense|income|loan)\s+(?:entry|transaction|record)\b',
            ' ',
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r'\s+(?:for|of)\s+(?:rs\.?|npr|रु\.?)?\s*(\d[\d,]*(?:\.\d+)?)\s*$',
            r' \1',
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(r'^\s*(?:for|on)\s+', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s+', ' ', text).strip(' \t\r\n-:;,.')
        return text

    def _is_placeholder_remark(self, remark):
        return str(remark or "").strip().lower() in {
            "short summary",
            "summary",
            "brief summary",
            "note",
            "remarks",
            "n/a",
            "na",
            "-",
        }

    def _normalise_remark(self, remark, item, category):
        """Replace generic model placeholders with a note tied to the actual item."""
        if not remark or self._is_placeholder_remark(remark):
            return self._generate_detailed_remark(item, category)
        cleaned = re.sub(
            rf'^\s*{re.escape(str(category or ""))}\s*:\s*',
            '',
            str(remark),
            flags=re.IGNORECASE,
        ).strip(' \t\r\n-:;,.')
        cleaned = re.sub(
            r'^(?:food|groceries|transport|utilities|rent|shopping|medical|entertainment|education|travel|accommodation|electronics|personal care|fitness|gifts|finance|maintenance|income|loan|other)\s*:\s*',
            '',
            cleaned,
            flags=re.IGNORECASE,
        ).strip(' \t\r\n-:;,.')
        if not cleaned or re.search(r'\b(expense entry|transaction entry|short summary)\b', cleaned, re.IGNORECASE):
            return self._generate_detailed_remark(item, category)
        return cleaned[:160]

    def _clean_item_name(self, item):
        """Clean and normalize item names"""
        item = self._normalise_entry_command(item)
        item = re.sub(r'^(?:expense|income|loan)?\s*(?:entry|transaction)\s*:\s*', '', item, flags=re.IGNORECASE)
        # Strip common verbs/articles from start
        item = re.sub(r'^(had|ate|took|got|bought|buy|ordered|spent|paid|for|on|add|record|save|log|enter)\s+', '', item, flags=re.IGNORECASE)
        item = re.sub(r'\b(?:in|to|as|under)\s+(?:the\s+)?(?:expense|expenses|income|loan|loans)\b', ' ', item, flags=re.IGNORECASE)
        item = re.sub(r'\s+(?:for|of)\s+(?:rs\.?|npr|रु\.?)?\s*\d[\d,]*(?:\.\d+)?\s*$', '', item, flags=re.IGNORECASE)
        item = re.sub(r'\b(the|a|an)\b', '', item, flags=re.IGNORECASE)
        item = re.sub(r'\s+', ' ', item).strip(' \t\r\n-:;,.')
        
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
        
        item_lower = self._normalise_typos(item.lower())
        for nepali, english in nepali_mappings.items():
            # Use word boundaries to avoid partial matches (e.g. "anda" in "chandan")
            if re.search(r'\b' + re.escape(nepali) + r'\b', item_lower):
                item_lower = re.sub(r'\b' + re.escape(nepali) + r'\b', english, item_lower)
                # Update item to reflect changes but maintain case if possible (difficult here so we use lower)
                item = item_lower
                break
        
        return item

    def _normalise_typos(self, text):
        """Correct common transaction typos while leaving unknown names alone."""
        if not text:
            return text

        def replace_token(match):
            token = match.group(0)
            lower = token.lower()

            if lower in self.typo_corrections:
                return self.typo_corrections[lower]
            return token

        return re.sub(r'\b[a-zA-Z]+\b', replace_token, text)
    
    def _contains_category_keyword(self, description, keyword):
        """Match complete words/phrases so `pen` never matches `spent`."""
        keyword_pattern = r'\s+'.join(re.escape(part) for part in str(keyword).lower().split())
        return bool(re.search(rf'(?<!\w){keyword_pattern}(?!\w)', str(description).lower()))

    def _contains_any_category_keyword(self, description, keywords):
        return any(self._contains_category_keyword(description, keyword) for keyword in keywords)

    def _categorize(self, description):
        description_lower = description.lower()

        # Action/context words describe why money was spent and should outrank
        # a noun that happens to belong to another category. For example,
        # "fish pond maintenance" is maintenance, not a food purchase.
        if self._contains_any_category_keyword(
            description_lower,
            ['maintenance', 'maintain', 'maintance', 'repair', 'fix', 'servicing', 'cleaning', 'paint', 'painting'],
        ):
            return 'Maintenance'
        
        # Check existing categories first
        for category, keywords in self.categories.items():
            if self._contains_any_category_keyword(description_lower, keywords):
                return category.title()
        
        # Smart category creation for unknown items
        return self._smart_categorize(description_lower)
    
    def _smart_categorize(self, description):
        """Create intelligent categories for unknown items"""
        # Electronics & Appliances
        if self._contains_any_category_keyword(description, ['fan', 'ac', 'tv', 'fridge', 'laptop', 'phone', 'mobile', 'computer', 'tablet', 'camera', 'speaker', 'headphone', 'charger', 'appliance', 'electronic']):
            return 'Electronics'
        
        # Travel & Accommodation
        if self._contains_any_category_keyword(description, ['hotel', 'stay', 'booking', 'resort', 'lodge', 'airbnb', 'hostel']):
            return 'Travel'
        
        # Medical & Health
        if self._contains_any_category_keyword(description, ['doctor', 'medicine', 'hospital', 'clinic', 'pharmacy', 'medical', 'health']):
            return 'Medical'
        
        # Education - Enhanced
        if self._contains_any_category_keyword(description, ['admission', 'fee', 'tuition', 'school', 'college', 'university', 'course', 'class', 'book', 'study', 'education', 'exam', 'test']):
            return 'Education'
        
        # Beauty & Personal Care
        if self._contains_any_category_keyword(description, ['salon', 'haircut', 'beauty', 'cosmetic', 'spa', 'massage']):
            return 'Personal Care'
        
        # Gifts & Donations
        if self._contains_any_category_keyword(description, ['gift', 'present', 'donation', 'charity', 'birthday']):
            return 'Gifts'
        
        # Insurance & Finance
        if self._contains_any_category_keyword(description, ['insurance', 'premium', 'policy', 'bank', 'fee', 'charge']):
            return 'Finance'
        
        # Maintenance & Repair
        if self._contains_any_category_keyword(description, ['repair', 'fix', 'maintenance', 'service', 'cleaning']):
            return 'Maintenance'
        
        # Sports & Fitness
        if self._contains_any_category_keyword(description, ['gym', 'fitness', 'sport', 'exercise', 'yoga', 'swimming']):
            return 'Fitness'
        
        # Food/Drinks - catch common items
        if self._contains_any_category_keyword(description, ['chiya', 'chai', 'tea', 'coffee', 'drink', 'beverage', 'snack']):
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
        self.nim_available = False
        self.nim_client = None
        self.nim_model = os.getenv("NVIDIA_NIM_MODEL", DEFAULT_NIM_MODEL)
        self.nim_entry_model = os.getenv("NVIDIA_NIM_ENTRY_MODEL", DEFAULT_NIM_ENTRY_MODEL)
        self.nim_multimodal_model = os.getenv("NVIDIA_NIM_MULTIMODAL_MODEL", DEFAULT_MULTIMODAL_MODEL)
        self.nim_tts_url = os.getenv("NVIDIA_NIM_TTS_URL", DEFAULT_TTS_URL)
        self.nim_tts_voice = os.getenv("NVIDIA_NIM_TTS_VOICE", DEFAULT_TTS_VOICE)
        self.parser = ExpenseParser()
        self._setup_nim()
        # Initialize RAG service
        try:
            # pyre-ignore[21]
            from services.rag_service import RAGService
            self.rag_service = RAGService()
        except Exception as e:
            print(f"RAG Service initialization failed: {e}")
            self.rag_service = None
    
    def _setup_nim(self):
        """Set up NVIDIA NIM through its OpenAI-compatible API."""
        self.nim_available = False
        self.nim_client = None
        
        if not NIM_AVAILABLE:
            print("WARNING: openai package not installed; NVIDIA NIM is unavailable")
            return
        
        api_key = os.getenv("NVIDIA_API_KEY")
        if api_key and api_key.strip():
            try:
                # pyre-ignore[16]
                self.nim_client = OpenAI(
                    base_url=os.getenv("NVIDIA_NIM_BASE_URL", DEFAULT_NIM_BASE_URL),
                    api_key=api_key,
                    timeout=45.0,
                    max_retries=0,
                )
                self.nim_available = True
                print(f"SUCCESS: NVIDIA NIM configured (chat={self.nim_model}, entry={self.nim_entry_model})")
            except Exception as e:
                print(f"ERROR: NVIDIA NIM setup failed: {e}")

    def _rule_based_intent(self, text: str) -> dict:
        """Classify clear questions and transaction statements without a model call."""
        normalized = re.sub(r"\s+", " ", str(text or "").strip().lower())
        if not normalized:
            return {"intent": "chat", "confidence": 1.0, "reason": "empty input", "source": "rules"}

        has_amount = bool(re.search(r"(?:rs\.?|रु\.?|npr\s*)?\s*\d[\d,]*(?:\.\d+)?", normalized))
        entry_command = bool(re.search(r"\b(add|log|record|save|track|enter)\b", normalized))
        question_start = bool(re.match(
            r"^(how|what|when|where|why|who|which|can|could|would|should|do|did|does|is|are|am|was|were|have|has|show|tell|list|compare)\b",
            normalized,
        ))
        question_phrase = bool(re.search(
            r"\b(how much|how many|do i|did i|have i|what is|what are|show me|tell me|can you|could you)\b",
            normalized,
        ))
        analytical_request = bool(re.search(
            r"\b(total|summary|breakdown|history|average|report|compare|comparison|above|below|over|under|most|least|highest|lowest)\b",
            normalized,
        ))
        period_reference = bool(re.search(
            r"\b(today|yesterday|this\s+(?:week|month|year)|last\s+\d*\s*(?:days?|weeks?|months?|years?))\b",
            normalized,
        ))

        # A courteous command such as "can you add lunch 300" is still an entry.
        if (
            "?" in normalized
            or question_start
            or question_phrase
            or analytical_request
            or (period_reference and not has_amount)
        ) and not (entry_command and has_amount):
            return {"intent": "chat", "confidence": 0.99, "reason": "question wording", "source": "rules"}

        loan_signal = bool(re.search(
            r"\b(loan|lent|lend|borrow|borrowed|owe|owes|repaid|repay|paid\s+(?:me\s+)?back|got\s+back|gave\s+.*\s+to|received\s+back)\b",
            normalized,
        ))
        income_signal = bool(re.search(
            r"\b(salary|salry|sallary|income|wage|wages|bonus|freelance|earned|earning|dividend|commission|paycheck|got\s+paid|payment\s+received|credited)\b",
            normalized,
        ))
        expense_signal = bool(re.search(
            r"\b(spend|spent|bought|purchased|expense|cost|costing|shopping|bill|paid\s+for)\b",
            normalized,
        ))

        # "Alex gave/sent me 500" does not say whether this was a gift,
        # income, a borrowed loan, or a repayment. Never guess and write it.
        ambiguous_received_transfer = bool(re.search(
            r"\b[a-z][a-z.'-]*\s+(?:gave|sent|transferred|paid)\s+me\b", normalized,
        ))
        if ambiguous_received_transfer and has_amount:
            return {
                "intent": "income",
                "confidence": 0.45,
                "reason": "Money received from a person could be income, a gift, a loan, or repayment.",
                "source": "rules",
                "needs_confirmation": True,
                "candidates": ["income", "loan"],
            }

        if loan_signal:
            return {"intent": "loan", "confidence": 0.98, "reason": "loan transaction wording", "source": "rules"}
        if income_signal:
            return {"intent": "income", "confidence": 0.98, "reason": "income source wording", "source": "rules"}
        if expense_signal or (has_amount and entry_command):
            return {"intent": "expense", "confidence": 0.97, "reason": "expense entry wording", "source": "rules"}

        if has_amount:
            transfer_shape = bool(re.search(r"\b(?:to|from)\s+[a-z][a-z.'-]*\b", normalized))
            if transfer_shape:
                return {"intent": "loan", "confidence": 0.65, "reason": "ambiguous person-to-person transfer", "source": "rules"}
            return {"intent": "expense", "confidence": 0.95, "reason": "item and amount entry", "source": "rules"}

        # Transaction-like text gets the relevant tab and its existing amount hint.
        if expense_signal or entry_command:
            return {"intent": "expense", "confidence": 0.88, "reason": "expense wording", "source": "rules"}

        return {"intent": "chat", "confidence": 0.95, "reason": "no transaction entry detected", "source": "rules"}

    async def classify_intent(self, text: str, current_mode: str = "chat") -> dict:
        """Choose a UI input mode only; this method never persists a transaction."""
        rule_result = self._rule_based_intent(text)
        if rule_result.get("needs_confirmation") or rule_result["confidence"] >= 0.85 or not self.nim_available:
            return rule_result

        prompt = f"""Classify this personal-finance input by intent only.
Input: {json.dumps(str(text or ''))}
Current UI mode: {json.dumps(str(current_mode or 'chat'))}

Return JSON only: {{"intent":"chat|expense|income|loan","confidence":0.0,"reason":"short reason"}}

Rules:
- chat: any question, request for analysis, totals, history, advice, or explanation—even if it mentions an amount.
- expense: a statement or command adding a purchase/spend with an amount.
- income: a statement or command adding earnings, salary, bonus, or received income.
- loan: a statement or command recording lending, borrowing, repayment, or money transferred to/from a person.
- Do not extract or calculate transactions. Classify intent only.
"""
        response = self.get_nim_response(
            prompt,
            model=self.nim_entry_model,
            max_tokens=100,
            temperature=0,
            retries=0,
            system_prompt="Return only compact valid JSON. Do not explain or show reasoning.",
            timeout=float(os.getenv("NVIDIA_NIM_ENTRY_TIMEOUT", "8.0")),
        )
        if not response:
            return rule_result

        try:
            match = re.search(r"\{.*\}", response, re.DOTALL)
            parsed = json.loads(match.group(0) if match else response)
            intent = str(parsed.get("intent") or "").lower()
            if intent not in {"chat", "expense", "income", "loan"}:
                return rule_result
            confidence = max(0.0, min(float(parsed.get("confidence", 0.8)), 1.0))
            return {
                "intent": intent,
                "confidence": confidence,
                "reason": str(parsed.get("reason") or "AI intent classification")[:120],
                "source": "nim",
            }
        except (TypeError, ValueError, json.JSONDecodeError, AttributeError):
            return rule_result

    @staticmethod
    def _prepare_spoken_text(text: str) -> str:
        """Convert a UI response into concise, speech-safe text without changing facts."""
        spoken = str(text or "")
        spoken = re.sub(r"```.*?```", " ", spoken, flags=re.DOTALL)
        spoken = re.sub(r"[*#`|_]", " ", spoken)
        spoken = re.sub(r"\bRs\.\s*", "rupees ", spoken, flags=re.IGNORECASE)
        spoken = re.sub(r"\s+", " ", spoken).strip()
        if not spoken:
            raise ValueError("There is no response to speak.")
        return spoken[:1800]

    def _create_voice_script(self, answer: str) -> str:
        """Create a short spoken handoff without adding another model call."""
        source = self._prepare_spoken_text(answer)
        sentences = re.split(r"(?<=[.!?])\s+", source)
        script = " ".join(sentences[:3]).strip() or source
        words = script.split()
        return " ".join(words[:70])

    async def synthesize_voice(self, text: str) -> bytes:
        """Generate natural neural speech with NVIDIA Magpie TTS."""
        api_key = str(os.getenv("NVIDIA_API_KEY") or "").strip()
        if not api_key:
            raise RuntimeError("Neural voice is unavailable because NVIDIA NIM is not configured.")

        spoken_text = self._create_voice_script(text)
        form = {
            "text": (None, spoken_text),
            "language": (None, "en-US"),
            "voice": (None, self.nim_tts_voice),
            "encoding": (None, "LINEAR_PCM"),
            "sample_rate_hz": (None, "44100"),
        }
        try:
            timeout_seconds = float(os.getenv("NVIDIA_NIM_TTS_TIMEOUT", "7"))
            async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_seconds, connect=3.0)) as client:
                response = await client.post(
                    self.nim_tts_url,
                    headers={"Authorization": f"Bearer {api_key}", "Accept": "audio/wav"},
                    files=form,
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            print(f"[VOICE] NVIDIA Magpie TTS error: {exc}")
            raise RuntimeError("The neural voice service could not generate speech. Please try again.") from exc

        audio = bytes(response.content)
        if len(audio) < 44:
            raise RuntimeError("The neural voice service returned incomplete audio.")
        return audio

    def _normalise_media_transactions(self, raw_transactions: list, default_intent: str) -> list:
        """Validate visual extraction without reparsing model prose as user input."""
        normalised = []
        seen = set()

        for raw in list(raw_transactions or [])[:20]:
            try:
                amount_text = re.sub(r'[^\d.\-]', '', str(raw.get("amount") or ""))
                amount_value = float(amount_text)
                amount = int(amount_value) if amount_value.is_integer() else round(amount_value, 2)
            except (TypeError, ValueError):
                continue
            if not amount:
                continue

            item = self.parser._clean_item_name(str(raw.get("item") or ""))
            if not self._is_meaningful_transaction_item(item):
                continue

            transaction_type = str(raw.get("transaction_type") or default_intent or "expense").lower()
            if transaction_type not in {"expense", "income", "loan"}:
                transaction_type = "expense"

            proposed_category = self._safe_model_category(raw.get("category"))
            local_category = self.parser._categorize(item)
            if transaction_type == "income":
                category = "Income"
                amount = -abs(amount)
            elif transaction_type == "loan":
                category = "Loan"
            else:
                category = proposed_category or (
                    local_category if local_category.lower() != "other" else self._custom_category_from_item(item)
                )
                amount = abs(amount)

            try:
                confidence = max(0.0, min(float(raw.get("confidence", 0.0)), 1.0))
            except (TypeError, ValueError):
                confidence = 0.0

            paid_by = str(raw.get("paid_by") or "").strip().title() or None
            remarks = self.parser._normalise_remark(raw.get("remarks"), item, category)
            needs_confirmation = (
                bool(raw.get("needs_confirmation"))
                or confidence < 0.8
                or category == "Other"
            )
            fingerprint = (item.lower(), abs(float(amount)), transaction_type)
            if fingerprint in seen:
                continue
            seen.add(fingerprint)

            normalised.append({
                "amount": amount,
                "item": item.title(),
                "category": category,
                "remarks": remarks,
                "paid_by": paid_by,
                "needs_confirmation": needs_confirmation,
                "transaction_type": transaction_type,
                "confidence": confidence,
                "ai_classified": True,
                "media_extracted": True,
            })

        return normalised

    def _media_transaction_summary(self, transactions: list, media_type: str) -> str:
        if not transactions:
            return "I reviewed the image but did not find a complete transaction with both an item and amount."
        details = ", ".join(
            f"{transaction['item']} ({self._money_for_reply(abs(transaction['amount']))}, {transaction['category']})"
            for transaction in transactions[:4]
        )
        extra = len(transactions) - 4
        if extra > 0:
            details += f", and {extra} more"
        source = "image" if media_type == "image" else "voice message"
        return f"From the {source}, I found {len(transactions)} transaction{'s' if len(transactions) != 1 else ''}: {details}."

    def _money_for_reply(self, amount) -> str:
        value = float(amount or 0)
        return f"Rs.{value:,.0f}" if value.is_integer() else f"Rs.{value:,.2f}"

    async def understand_media(self, media_type: str, mime_type: str, data: str, prompt: str = "") -> dict:
        """Turn image/audio input into a safe text message for existing intent routing."""
        media_type = str(media_type or "").strip().lower()
        mime_type = str(mime_type or "").strip().lower()
        prompt = str(prompt or "").strip()[:1000]

        allowed_types = {
            "image": {"image/jpeg", "image/png"},
            "audio": {"audio/wav", "audio/x-wav"},
        }
        if media_type not in allowed_types or mime_type not in allowed_types[media_type]:
            raise ValueError("Unsupported media format. Use a JPG/PNG image or WAV audio.")

        encoded_data = str(data or "")
        if encoded_data.startswith("data:"):
            encoded_data = encoded_data.split(",", 1)[-1]
        try:
            media_bytes = base64.b64decode(encoded_data, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("The attached media could not be read.") from exc

        max_size = 5 * 1024 * 1024 if media_type == "image" else 2 * 1024 * 1024
        if not media_bytes or len(media_bytes) > max_size:
            size_label = "5 MB" if media_type == "image" else "2 MB"
            raise ValueError(f"The {media_type} must be smaller than {size_label}.")

        is_jpeg = mime_type == "image/jpeg" and media_bytes.startswith(b"\xff\xd8\xff")
        is_png = mime_type == "image/png" and media_bytes.startswith(b"\x89PNG\r\n\x1a\n")
        is_wav = media_type == "audio" and media_bytes.startswith(b"RIFF") and media_bytes[8:12] == b"WAVE"
        if media_type == "image" and not (is_jpeg or is_png):
            raise ValueError("The image contents do not match a supported JPG or PNG file.")
        if media_type == "audio" and not is_wav:
            raise ValueError("The recording is not a valid WAV audio file.")

        if not self.nim_available or not self.nim_client:
            raise RuntimeError("Media understanding is unavailable because NVIDIA NIM is not configured.")

        canonical_mime = "audio/wav" if media_type == "audio" else mime_type
        data_url = f"data:{canonical_mime};base64,{base64.b64encode(media_bytes).decode('ascii')}"
        if media_type == "audio":
            instruction = (
                "Transcribe the spoken audio accurately. Return only the transcript, preserving the speaker's "
                "financial wording, names, amounts, and whether money was spent, earned, lent, or borrowed."
            )
            media_content = {"type": "audio_url", "audio_url": {"url": data_url}}
        else:
            user_context = prompt or "No additional text was supplied."
            instruction = f"""Analyze this image for a personal finance app and return one JSON object only.
User text: {user_context}

Schema:
{{"intent":"chat|expense|income|loan","message":"self-contained text for the existing workflow","brief":"one short factual description of the image","transactions":[{{"amount":450,"item":"Groceries","category":"Groceries","remarks":"Groceries from ABC Store","paid_by":null,"transaction_type":"expense","confidence":0.95,"needs_confirmation":false}}]}}

Rules:
- Preserve whether the user is asking a question or recording a transaction.
- Allowed categories: Food, Groceries, Transport, Utilities, Rent, Shopping, Medical, Entertainment, Education, Travel, Accommodation, Electronics, Personal Care, Fitness, Gifts, Finance, Maintenance, Income, Loan, Other.
- Extract a transaction only when both its item/purpose and amount are clearly visible.
- Never use filler such as "expense entry", "transaction", "money", or "rupees" as the item.
- Remarks must state only useful visible context such as merchant and item; do not repeat category labels or invent context.
- For an itemized receipt, return reliable line items OR one receipt total, never both. Do not double-count subtotal, tax, and total.
- Set confidence below 0.8 and needs_confirmation true when text, amount, category, or loan direction is uncertain.
- If the image is not a financial record or the user asks a question, transactions must be empty and message must preserve the question plus essential visual facts.
- Never invent unreadable text or amounts."""
            media_content = {"type": "image_url", "image_url": {"url": data_url}}

        try:
            media_request = {
                "model": self.nim_multimodal_model,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": instruction},
                        media_content,
                    ],
                }],
                "temperature": 0.2,
                "top_p": 0.95,
                "max_tokens": 600,
                "stream": False,
                "extra_body": {"chat_template_kwargs": {"enable_thinking": False}},
            }
            if media_type == "image":
                media_request["response_format"] = {"type": "json_object"}

            response = self.nim_client.with_options(timeout=45.0).chat.completions.create(
                **media_request,
            )
            result = response.choices[0].message.content.strip()
        except Exception as exc:
            print(f"[MEDIA] NVIDIA NIM error: {exc}")
            raise RuntimeError("NVIDIA NIM could not process this media. Please try again.") from exc

        result = re.sub(r"<think>.*?</think>", "", result, flags=re.DOTALL | re.IGNORECASE).strip()
        if media_type == "audio":
            result = clean_spoken_text(result)
        if not result:
            raise RuntimeError("No usable text could be extracted from the media.")

        if media_type == "image":
            try:
                json_match = re.search(r'\{.*\}', result, re.DOTALL)
                parsed = json.loads(json_match.group(0) if json_match else result)
            except (json.JSONDecodeError, AttributeError, TypeError) as exc:
                raise RuntimeError("The image analysis was incomplete. Please try the image again.") from exc

            intent = str(parsed.get("intent") or "chat").lower()
            if intent not in {"chat", "expense", "income", "loan"}:
                intent = "chat"
            transactions = self._normalise_media_transactions(parsed.get("transactions"), intent)
            message = str(parsed.get("message") or "").strip()
            brief = str(parsed.get("brief") or "").strip()[:240]
            if transactions:
                message = message or "; ".join(
                    f"{transaction['item']} {abs(transaction['amount'])}" for transaction in transactions
                )
                intent = transactions[0]["transaction_type"]
            elif not message:
                message = brief or "Describe the attached image."
                intent = "chat"
            else:
                # Never route an image into a write flow without validated structured records.
                intent = "chat"

            return {
                "text": message,
                "brief": brief,
                "summary": self._media_transaction_summary(transactions, "image") if transactions else brief,
                "transactions": transactions,
                "intent": intent,
                "media_type": media_type,
                "model": self.nim_multimodal_model,
            }

        return {
            "text": result,
            "brief": "Voice message transcribed.",
            "summary": "Voice message transcribed and ready to review.",
            "transactions": [],
            "intent": None,
            "media_type": media_type,
            "model": self.nim_multimodal_model,
        }
    
    def get_nim_response(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: int = 600,
        temperature: float = 0.2,
        retries: int = 3,
        system_prompt: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> Optional[str]:
        """Get an NVIDIA NIM chat completion with transient-error retries."""
        if not self.nim_client or not self.nim_available:
            return None
        
        selected_model = model or self.nim_model
        max_retries = retries
        base_delay = 2
        
        import time
        
        for attempt in range(max_retries + 1):
            try:
                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": prompt})
                # pyre-ignore[16]
                request_options = {
                    "model": selected_model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": False,
                }
                if selected_model.startswith("nvidia/nemotron-3-"):
                    request_options["extra_body"] = {
                        "top_k": 1,
                        "chat_template_kwargs": {"enable_thinking": False},
                    }
                client = self.nim_client.with_options(timeout=timeout) if timeout else self.nim_client
                response = client.chat.completions.create(**request_options)
                if response and response.choices and response.choices[0].message.content:
                    return response.choices[0].message.content.strip()
            except Exception as e:
                error_str = str(e).lower()
                # Check for rate limit errors (429 or quota exceeded)
                if '429' in error_str or 'quota' in error_str or 'rate limit' in error_str:
                    if attempt < max_retries:
                        delay = base_delay * (2 ** attempt) # Exponential backoff: 2, 4, 8 sent
                        print(f"NVIDIA NIM rate limit. Retrying in {delay}s... (Attempt {attempt+1}/{max_retries})")
                        time.sleep(delay)
                        continue
                    else:
                        print(f"NVIDIA NIM rate limit exceeded after {max_retries} retries.")
                else:
                    print(f"NVIDIA NIM API error: {e}")
                    # Non-retryable error
                    break
        
        return None

    def _resolve_explicit_loan_direction(self, expenses: list, text: str) -> list:
        """Use known loan phrases to prevent needless confirmation on clear entries."""
        if len(expenses) != 1:
            return expenses
        clear_direction = re.search(
            r"\b(borrow(?:ed)?|lent|lend|gave\s+loan|loan\s+to|paid\s+(?:me\s+)?back|paid\s+\d+\s+for|repaid|returned|got\s+back)\b",
            text,
            re.IGNORECASE,
        )
        if not clear_direction:
            return expenses
        local_expenses, _ = self.parser.parse(text)
        if len(local_expenses) != 1 or local_expenses[0].get("category", "").lower() != "loan":
            return expenses
        local_expense = local_expenses[0]
        if not local_expense.get("paid_by"):
            return expenses
        expenses[0].update({
            "amount": local_expense["amount"],
            "paid_by": local_expense["paid_by"],
            "remarks": local_expense["remarks"],
            "needs_confirmation": False,
        })
        return expenses

    def _normalise_nim_transactions(self, expenses: list, mode: str) -> list:
        """Validate model-produced records and enforce the selected transaction mode."""
        normalised = []
        for raw_expense in expenses:
            try:
                raw_amount = str(raw_expense.get("amount", "")).replace(",", "")
                raw_amount = re.sub(r"[^\d.\-]", "", raw_amount)
                amount_value = float(raw_amount)
                amount = int(amount_value) if amount_value.is_integer() else amount_value
            except (TypeError, ValueError):
                continue

            if amount == 0:
                continue

            item = self.parser._clean_item_name(str(raw_expense.get("item") or ""))
            if not self._is_meaningful_transaction_item(item):
                continue

            category = self._safe_model_category(raw_expense.get("category"))
            paid_by = raw_expense.get("paid_by")
            paid_by = str(paid_by).strip().title() if paid_by else None
            needs_confirmation = bool(raw_expense.get("needs_confirmation", False))
            transaction_type = str(raw_expense.get("transaction_type") or mode).strip().lower()

            if mode == "income":
                amount = -abs(amount)
                category = "Income"
                needs_confirmation = False
                paid_by = None
            elif mode == "loan":
                category = "Loan"
            else:
                amount = abs(amount)
                needs_confirmation = False
                local_category = self.parser._categorize(item)
                # The entry NIM evaluates the complete phrase, so retain its
                # contextual category. Rules are only a fallback for invalid or
                # generic model output—not an override of the model decision.
                if not category or category.lower() in {"other", "expense", "general", "miscellaneous"}:
                    category = local_category if local_category.lower() != "other" else self._custom_category_from_item(item)
                if category == "Other":
                    category = "Other"
                    needs_confirmation = True

            remarks = self.parser._normalise_remark(raw_expense.get("remarks"), item, category)

            normalised.append({
                "amount": amount,
                "item": item.title(),
                "category": category or "Miscellaneous",
                "remarks": remarks,
                "paid_by": paid_by,
                "needs_confirmation": needs_confirmation,
                "transaction_type": transaction_type,
                "ai_classified": True,
            })
        return normalised

    @staticmethod
    def _safe_model_category(value) -> str:
        """Accept useful custom categories while rejecting prose or unsafe labels."""
        category = re.sub(r"\s+", " ", str(value or "").strip()).title()
        if not category or len(category) > 36:
            return ""
        if not re.fullmatch(r"[A-Za-z][A-Za-z &/'-]*", category):
            return ""
        if len(category.split()) > 4:
            return ""
        return category

    @staticmethod
    def _custom_category_from_item(item: str) -> str:
        """Create a stable, readable category instead of randomly assigning one."""
        words = re.findall(r"[A-Za-z]+", str(item or ""))[:3]
        if not words:
            return "Other"
        return " ".join(words).title()

    def _split_item_amount_entries(self, text: str) -> list:
        """Split compact `item amount item amount` input without guessing prose."""
        matches = list(re.finditer(r"(?<![\d.])\d+(?:\.\d+)?(?![\d.])", str(text or "")))
        if len(matches) < 2:
            return []

        entries = []
        cursor = 0
        for match in matches:
            description = str(text[cursor:match.start()]).strip(" ,;:-")
            description = re.sub(r"^(?:and\s+)", "", description, flags=re.IGNORECASE).strip()
            if not self._is_meaningful_transaction_item(description):
                return []
            entries.append({
                "text": description,
                "amount": float(match.group(0)),
            })
            cursor = match.end()
        return entries

    def _entries_from_number_delimited_text(self, text: str, mode: str) -> list:
        """Safe fallback that preserves every explicit item/amount pair."""
        entries = self._split_item_amount_entries(text)
        expenses = []
        for entry in entries:
            item = self.parser._clean_item_name(entry["text"])
            category = self.parser._categorize(item)
            amount = entry["amount"]
            if mode == "income":
                amount = -abs(amount)
                category = "Income"
            elif mode == "loan":
                category = "Loan"
            else:
                amount = abs(amount)
            expenses.append({
                "amount": int(amount) if float(amount).is_integer() else amount,
                "item": item.title(),
                "category": category,
                "remarks": self.parser._generate_detailed_remark(item, category),
                "paid_by": None,
                "needs_confirmation": category == "Other",
                "transaction_type": mode,
                "ai_classified": False,
            })
        return expenses

    def _is_meaningful_transaction_item(self, item: str) -> bool:
        """Reject sentences that mention money but never identify what it was for."""
        cleaned = re.sub(r'[^a-zA-Z\s]', ' ', str(item or '').lower())
        generic_words = {
            'i', 'we', 'my', 'our', 'have', 'has', 'had', 'get', 'got', 'give', 'gave',
            'spent', 'spend', 'paid', 'pay', 'money', 'cash', 'rupee', 'rupees', 'rs',
            'expense', 'entry', 'transaction', 'amount', 'payment', 'record', 'add',
            'the', 'a', 'an', 'this', 'that', 'it', 'on', 'for', 'of', 'to', 'from',
        }
        meaningful_words = [
            word for word in cleaned.split()
            if len(word) >= 2 and word not in generic_words
        ]
        return bool(meaningful_words)

    def _guard_ai_expense_categories(self, expenses: list, text: str) -> list:
        """Avoid auto-saving model guesses that conflict with obvious local signals."""
        if not expenses:
            return expenses

        # Amounts are factual user input, not a model decision. Enforce them
        # positionally whenever the input and extracted record counts agree.
        explicit_amounts = []
        for match in re.finditer(r"(?<![\d.])\d+(?:\.\d+)?(?![\d.])", str(text or "")):
            value = float(match.group(0))
            explicit_amounts.append(int(value) if value.is_integer() else value)
        if len(explicit_amounts) == len(expenses):
            for expense, amount in zip(expenses, explicit_amounts):
                expense["amount"] = abs(amount)

        # Preserve explicit purpose words from the original input even when a
        # small model shortens the extracted item (for example, returning only
        # "fish pond" from "fish pond maintenance").
        source_entries = self._split_item_amount_entries(text)
        for index, expense in enumerate(expenses):
            if len(source_entries) == len(expenses):
                context = source_entries[index]["text"]
            elif len(expenses) == 1:
                context = text
            else:
                context = " ".join([str(expense.get("item") or ""), str(expense.get("remarks") or "")])
            if self.parser._contains_any_category_keyword(
                context,
                ['maintenance', 'maintain', 'maintance', 'repair', 'fix', 'servicing', 'cleaning', 'paint', 'painting'],
            ):
                expense["category"] = "Maintenance"
                expense["needs_confirmation"] = False
                expense["remarks"] = self.parser._generate_detailed_remark(
                    expense.get("item") or "maintenance",
                    "Maintenance",
                )

        transport_keywords = set(self.parser.categories.get("transport", [])) | {"fuel"}
        for expense in expenses:
            category = str(expense.get("category") or "").lower()
            if category not in {"transport", "fuel"}:
                continue

            searchable = " ".join([
                str(text or ""),
                str(expense.get("item") or ""),
                str(expense.get("remarks") or ""),
            ]).lower()
            if not any(re.search(r"\b" + re.escape(keyword) + r"\b", searchable) for keyword in transport_keywords):
                expense["category"] = "Other"
                expense["needs_confirmation"] = True
                expense["remarks"] = self.parser._generate_detailed_remark(expense.get("item") or "expense", "Other")

        return expenses

    def _format_entry_reply(self, expenses: list, mode: str) -> str:
        if not expenses:
            return "I could not identify a transaction with an amount. Please try again."
        if any(exp.get("needs_confirmation") for exp in expenses):
            if mode == "expense":
                expense = next(exp for exp in expenses if exp.get("needs_confirmation"))
                return f"I found Rs.{abs(expense['amount']):,.0f} for {expense.get('item', 'this expense')}. Please choose a category."
            expense = next(exp for exp in expenses if exp.get("needs_confirmation"))
            person = expense.get("paid_by") or "the other person"
            return f"I found a loan entry of Rs.{abs(expense['amount']):,.0f} involving {person}. Please confirm the direction."
        if len(expenses) > 1:
            entry_label = "expense" if mode == "expense" else mode
            details = "\n".join(
                f"- {expense.get('item', 'Item')}: {self._money_for_reply(abs(expense.get('amount', 0)))}, {expense.get('category', 'Other')}"
                for expense in expenses
            )
            return f"Saved {len(expenses)} {entry_label} entries:\n{details}"

        expense = expenses[0]
        amount = abs(expense["amount"])
        if mode == "income":
            return f"Saved Rs.{amount:,.0f} income from {expense['item']}."
        if mode == "loan":
            return f"Saved Rs.{amount:,.0f} loan transaction: {expense['remarks']}."
        return f"Saved {expense['item']}: Rs.{amount:,.0f}, {expense['category']}."

    async def _ai_enhanced_parse(self, text: str, mode: str = "expense"):
        """Use a low-latency NIM model to understand and categorize a new entry."""
        try:
            prompt = f"""
Convert one user entry into structured records for a personal finance app.
The user has selected the "{mode}" entry tab. Treat that selection as authoritative.
Entry text: {json.dumps(text)}
Expected record count from explicit item/amount pairs: {len(self._split_item_amount_entries(text)) or "infer from the entry"}

Return JSON only: {{"expenses": [{{"amount": 400, "item": "item name", "category": "Specific Category", "remarks": "Specific note about this exact transaction", "paid_by": null, "needs_confirmation": false, "transaction_type": "expense"}}]}}

Rules:
- Extract multiple transactions when the user clearly enters more than one.
- Categorize from the meaning of the complete phrase, not one isolated keyword. Purpose/action words such as maintenance, repair, rent, medical treatment, or travel context take precedence over an object name. Example: "fish pond maintenance 7000" is Maintenance, not Food.
- Understand brands, products, informal words, common Nepali/Indian usage, and small typos. Correct obvious misspellings before categorizing, e.g. "petril 500" means petrol/fuel, "cofee 80" means coffee, and "cury 400" means curry.
- Infer category from the complete real-world meaning. Use an existing category only when it genuinely fits; otherwise create a short reusable category of 1-3 words. Do not force an item into a vaguely related category and do not use Other for a recognizable item.
- Examples: "window cleaner" -> Household Cleaning (not Electronics); "chair" -> Furniture or Shopping; "dog food" -> Pet Supplies; "website hosting" -> Software Services; "fish pond maintenance" -> Maintenance.
- `remarks` must describe the actual item/context from the entry. Never output placeholder text such as "Short summary", "summary", "note", or "remarks". Examples: "Rice curry meal", "Mustang trip transport", "Monthly internet bill".
- For expense mode, amount is positive and `paid_by` is null unless the text explicitly states another payer. Product words are not people. Example: "haldiram bhujiya 400" is a food/snacks expense, not a payment by Bhujiya.
- For income mode, amount is negative, category is Income, and item identifies the source.
- For loan mode, category is Loan and `paid_by` is the counterparty. A loan lent or given to someone is positive. Money borrowed or received from someone is negative. Repaying someone is positive. Money paid back to the user is negative.
- In loan mode, if the user paid for another person's item, treat it as lending to that person. Examples: "I paid 5000 for food of Ram" and "I paid 5000 for Ram's food" mean amount 5000, item "lent to", category "Loan", paid_by "Ram", needs_confirmation false.
- In loan mode set `needs_confirmation` to true only when direction cannot be reliably identified; explicit wording such as "lent 500 to Ram", "borrowed 500 from Ram", "paid back Ram 500", "Ram paid me back 500", or "paid 5000 for Ram's food" does not need confirmation.
- Use null for `paid_by` on ordinary purchases. Set it only for an explicitly named payer or a loan counterparty.
- If there is no meaningful financial entry with an amount, return {{"expenses": []}}.
"""
            compact_entries = self._split_item_amount_entries(text)
            expected_entries = len(compact_entries) if compact_entries else 1
            output_budget = min(600, max(200, 100 + expected_entries * 110))
            response = self.get_nim_response(
                prompt,
                model=self.nim_entry_model,
                max_tokens=output_budget,
                temperature=0,
                retries=0,
                system_prompt="Return only compact valid JSON. Do not explain or show reasoning.",
                timeout=float(os.getenv("NVIDIA_NIM_ENTRY_TIMEOUT", "8.0")),
            )
            if response:
                response = response.strip()
                if response.startswith('```json'):
                    response = response[7:-3]
                elif response.startswith('```'):
                    response = response[3:-3]
                
                # Some small models append explanation after valid JSON.
                decoder = json.JSONDecoder()
                parsed_data = None
                for opening in re.finditer(r"\{", response):
                    try:
                        candidate, _ = decoder.raw_decode(response[opening.start():])
                        if isinstance(candidate, dict) and "expenses" in candidate:
                            parsed_data = candidate
                            break
                    except json.JSONDecodeError:
                        continue
                if parsed_data is not None:
                    expenses = self._normalise_nim_transactions(parsed_data.get("expenses", []), mode)
                    if compact_entries and len(expenses) != len(compact_entries):
                        print(f"[AI_PARSE] Expected {len(compact_entries)} entries but NIM returned {len(expenses)}")
                        expenses = self._entries_from_number_delimited_text(text, mode)
                    if mode == "expense":
                        expenses = self._guard_ai_expense_categories(expenses, text)
                    if mode == "loan":
                        expenses = self._resolve_explicit_loan_direction(expenses, text)
                    return {
                        "expenses": expenses,
                        "reply": self._format_entry_reply(expenses, mode),
                        "parsed_by": "nim",
                        "model": self.nim_entry_model,
                    }
            
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
            return self.parser._normalise_typos(processed_text)
        except Exception as e:
            print(f"[PREPROCESS] Error: {e}")
            return self.parser._normalise_typos(text)

    def _apply_mode_to_fallback(self, expenses: list, mode: str, text: str) -> list:
        """Make local parsing consistent with the selected entry mode."""
        clear_loan_direction = re.search(
            r"\b(borrow(?:ed)?|lent|lend|gave\s+loan|loan\s+to|paid\s+(?:me\s+)?back|paid\s+\d+\s+for|repaid|returned|got\s+back)\b",
            text,
            re.IGNORECASE,
        )
        for expense in expenses:
            amount = expense.get("amount", 0)
            expense["ai_classified"] = False
            if mode == "income":
                expense["amount"] = -abs(amount)
                expense["category"] = "Income"
                expense["needs_confirmation"] = False
            elif mode == "loan":
                expense["category"] = "Loan"
                expense["needs_confirmation"] = not bool(clear_loan_direction)
            else:
                expense["amount"] = abs(amount)
                expense["needs_confirmation"] = expense.get("category", "").lower() in {"other", "miscellaneous"}
        return expenses

    async def parse_expense(self, text: str, mode: str = "expense"):
        """Understand a transaction entry, preferring fast NIM classification."""
        try:
            mode = str(mode or "expense").lower()
            if mode not in {"expense", "income", "loan"}:
                mode = "expense"
            print(f"[PARSE] Processing {mode}: {text}")
            
            # Pre-process text to handle units
            text = self.parser._normalise_entry_command(self._preprocess_text(text))
            print(f"[PARSE] Pre-processed: {text}")

            if self.nim_available:
                print(f"[PARSE] Trying fastest NVIDIA NIM entry model ({self.nim_entry_model})...")
                ai_result = await self._ai_enhanced_parse(text, mode)
                if ai_result is not None:
                    print(f"[PARSE] NIM parsed {len(ai_result.get('expenses', []))} entries")
                    return ai_result
                print("[PARSE] NIM entry parsing unavailable; using local fallback")

            expenses, reply = self.parser.parse(text)
            if expenses:
                expenses = [
                    expense for expense in expenses
                    if self._is_meaningful_transaction_item(expense.get("item"))
                ]
            if expenses:
                expenses = self._apply_mode_to_fallback(expenses, mode, text)
                return {
                    "expenses": expenses,
                    "reply": self._format_entry_reply(expenses, mode),
                    "parsed_by": "rules",
                }
            
            # Final fallback: simple extraction
            print("[PARSE] Trying simple extraction...")
            simple_expense = self._simple_extract(text)
            if simple_expense and self._is_meaningful_transaction_item(simple_expense.get("item")):
                expenses = self._apply_mode_to_fallback([simple_expense], mode, text)
                reply = self._format_entry_reply(expenses, mode)
            else:
                expenses = []
                reply = self._format_entry_reply(expenses, mode)
            
            return {
                "expenses": expenses,
                "reply": reply,
                "parsed_by": "rules",
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
        """Handle questions about the user's finances using grounded NIM responses."""
        try:
            # pyre-ignore[21]
            from services.expense_analyzer import ExpenseAnalyzer
            
            analyzer = ExpenseAnalyzer()
            
            # Extract user name
            user_name = "there"
            if request.user_name and str(request.user_name).strip():
                user_name = first_name(request.user_name)
            elif request.user_email:
                email_name = request.user_email.split('@')[0]
                user_name = first_name(email_name)
            query_text = clean_spoken_text(request.text) if bool(getattr(request, 'voice_mode', False)) else request.text
            
            # Determine context and prepare data
            is_group_mode = bool(request.group_name and request.group_expenses_data)
            table_data = request.group_expenses_data if is_group_mode else (request.expenses_data or [])
            context_type = f"group '{request.group_name}'" if is_group_mode else "personal"
            
            # Try rich retrieval first. It also has exact-data fallbacks if NIM is unavailable.
            if self.rag_service:
                print(f"[CHAT] Using RAG service for query: {request.text}")
                rag_response = await self.rag_service.query_expenses(
                    query_text,
                    table_data,
                    user_name,
                    getattr(request, 'conversation_history', []),
                    bool(getattr(request, 'voice_mode', False)),
                )
                if rag_response:
                    safe_response = final_answer_only(rag_response)
                    if safe_response:
                        print(f"[CHAT] RAG service provided response")
                        return {"reply": safe_response}
                else:
                    print(f"[CHAT] RAG service failed, trying direct NVIDIA NIM")
            
            # Analyze expenses for fallback
            analysis = analyzer.analyze_expenses(table_data)
            
            # Try a smaller direct prompt only if the richer service produced no response.
            if self.nim_available:
                print(f"[CHAT] Using direct NVIDIA NIM RAG")
                nim_response = await self._nim_rag_query(query_text, table_data, analysis, user_name)
                if nim_response:
                    safe_response = final_answer_only(nim_response)
                    if safe_response:
                        return {"reply": safe_response}
            
            # Fallback to rule-based processing
            print(f"[CHAT] Using rule-based analyzer")
            if not table_data:
                response = f"Hi {user_name}! You don't have any {context_type} transactions recorded yet. Add some records for personalized insights."
                return {"reply": response}
            processed_response = analyzer.process_query(query_text, analysis, context_type, table_data)
            final_response = f"Hi {user_name}! {processed_response}"
            return {"reply": final_response}
            
        except Exception as e:
            print(f"[ERROR] Chat error: {e}")
            error_name = user_name if 'user_name' in locals() else 'there'
            return {
                "reply": f"Hi {error_name}! Sorry, I encountered an error processing your question. Please try again.",
                "error": True
            }

    async def explain_budget_optimizer(self, request):
        """Explain budget optimizer output using only computed numbers."""
        try:
            target_reduction = int(getattr(request, 'target_reduction', 0) or 0)
            target_savings = float(getattr(request, 'target_savings', 0) or 0)
            achieved_cuts = float(getattr(request, 'achieved_cuts', 0) or 0)
            suggestions = list(getattr(request, 'suggestions', []) or [])

            fallback = self._budget_optimizer_fallback_explainer(
                target_reduction,
                target_savings,
                achieved_cuts,
                suggestions,
            )

            return {
                "explanation": fallback,
                "model": "deterministic",
            }
        except Exception as e:
            print(f"[BUDGET_OPTIMIZER] Error: {e}")
            return {
                "explanation": self._budget_optimizer_fallback_explainer(
                    getattr(request, 'target_reduction', 0),
                    getattr(request, 'target_savings', 0),
                    getattr(request, 'achieved_cuts', 0),
                    getattr(request, 'suggestions', []),
                ),
                "model": "deterministic",
            }

    def _budget_optimizer_fallback_explainer(self, target_reduction, target_savings, achieved_cuts, suggestions):
        if not suggestions:
            return f"There is no realistic way to save {target_reduction}% from the current category totals without making very large reductions."

        top = suggestions[0]
        top_category = str(top.get('category', 'your largest category')).title()
        top_cut = float(top.get('cutAmount', 0) or 0)
        target_met = float(achieved_cuts or 0) >= float(target_savings or 0)
        if target_met:
            return f"You can save Rs.{float(achieved_cuts or 0):,.0f} and reach your {target_reduction}% goal, mainly from {top_category}."
        return f"You can realistically save Rs.{float(achieved_cuts or 0):,.0f} of the Rs.{float(target_savings or 0):,.0f} goal, mainly from {top_category}."

    async def _nim_rag_query(self, query: str, expenses_data: list, analysis: dict, user_name: str) -> Optional[str]:
        """Use NVIDIA NIM with a compact grounded finance prompt."""
        try:
            # Prepare structured data summary
            categories_summary = "\n".join([f"  - {cat.title()}: Rs.{amount}" for cat, amount in analysis['categories'].items()])
            member_totals = {}
            for txn in expenses_data or []:
                try:
                    amount = float(txn.get('amount') or 0)
                except (TypeError, ValueError):
                    amount = 0
                if amount <= 0 or (txn.get('category') or '').lower() in {'income', 'loan'}:
                    continue
                member = txn.get('added_by') or 'Unknown'
                if member not in member_totals:
                    member_totals[member] = {'total': 0, 'count': 0}
                member_totals[member]['total'] += amount
                member_totals[member]['count'] += 1
            member_summary = "\n".join([
                f"  - {member}: Rs.{values['total']:,.0f} across {values['count']} transactions"
                for member, values in sorted(member_totals.items(), key=lambda item: item[1]['total'], reverse=True)
            ]) or "  - No member spending totals available"
            
            # Get recent transactions safely preventing list slice type errors for Pyre
            # pyre-ignore[16]
            recent_txns = list(expenses_data)[:10] if int(len(expenses_data)) > 10 else list(expenses_data)
            transactions_text = "\n".join([
                f"  - Rs.{txn.get('amount', 0)} on {txn.get('item', 'item')} ({txn.get('category', 'Other')}) on {txn.get('date', 'N/A')} added_by={txn.get('added_by') or 'Unknown'}"
                for txn in recent_txns
            ])
            
            prompt = f"""
You are a personal finance assistant. Answer questions about the user's records and general personal finance.

User: {user_name}
Query: "{query}"

FINANCIAL DATA:

Total Expenses: Rs.{analysis['total']}
Total Transactions: {analysis['count']}
Income: Rs.{analysis.get('total_income', 0)}
Net Balance: Rs.{analysis.get('net_balance', 0)}

Category Breakdown:
{categories_summary}

Group Member Spending By added_by:
{member_summary}

Recent Transactions:
{transactions_text}

INSTRUCTIONS:
1. For claims about this user, use only the supplied financial data and exact numbers.
2. For general finance questions, provide helpful educational guidance and state when it is not based on user records.
3. If asked about multiple categories (e.g., "food and grocery"), combine the supplied totals.
4. Never invent transactions, balances, income, goals, returns, or debt terms.
5. For group member spending questions like "how much Nirmal spent", use Group Member Spending By added_by. added_by is the member who recorded/spent the expense.
6. Do not use paid_by for ordinary group spending; paid_by is mainly for loan counterparties.
7. Start response with "Hi {user_name}!" and be concise but informative.
8. For high-stakes investment, tax, credit, or legal decisions, give general information and recommend qualified advice where appropriate.
9. Format currency as Rs.X only, do not use emoji, and normally keep the response under 180 words unless details are requested.

Provide a helpful, accurate response:
"""
            
            response = self.get_nim_response(prompt)
            if response:
                return response.strip()
            
            return None
            
        except Exception as e:
            print(f"[NIM_RAG] Error: {e}")
            return None
