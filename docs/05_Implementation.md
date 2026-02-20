# CHAPTER 5: IMPLEMENTATION AND TESTING

## 5.1 Tools and Technologies Used

The project was implemented using the following set of tools and technologies:

*   **Frontend:** React.js (v18), TailwindCSS (Styling), Recharts (Data Visualization), Capacitor (Mobile Build).
*   **Backend:** Python 3.10+, FastAPI (Web Framework), Uvicorn (ASGI Server), Google Gemini SDK (AI).
*   **Database:** Supabase (PostgreSQL), Supabase Auth.
*   **Version Control:** Git & GitHub.
*   **IDE:** Visual Studio Code.

## 5.2 Implementation Details

### 5.2.1 Backend: NLP Expense Parsing
The core feature of the application is the NLP parser. Below is the Python implementation using FastAPI and Gemini:

```python
# backend/api/expenses.py (Snippet)

@router.post("/parse")
async def parse_expense(text: str):
    """
    Parses natural language text into structured expense data.
    """
    prompt = f"""
    Extract the following details from the text: "{text}"
    - Amount (number)
    - Category (Enum: Food, Travel, Bills, Entertainment, Health, Other)
    - Description (string)
    
    Return JSON format only.
    """
    
    response = model.generate_content(prompt)
    try:
        data = json.loads(response.text)
        return {"status": "success", "data": data}
    except json.JSONDecodeError:
        return {"status": "error", "message": "Failed to parse"}
```

### 5.2.2 Frontend: Expense Context
The frontend manages state using React Context API to ensure data consistency across components.

```javascript
// src/context/ExpenseContext.js (Snippet)

export const ExpenseProvider = ({ children }) => {
    const [expenses, setExpenses] = useState([]);

    const addExpense = async (text) => {
        const parsed = await api.parseExpense(text);
        if (parsed.status === "success") {
            const newExpense = await api.saveExpense(parsed.data);
            setExpenses([newExpense, ...expenses]);
        }
    };

    return (
        <ExpenseContext.Provider value={{ expenses, addExpense }}>
            {children}
        </ExpenseContext.Provider>
    );
};
```

## 5.3 Testing Strategy

### 5.3.1 Unit Testing
Unit tests were written for individual backend functions, particularly the NLP parsing logic, to ensure different text inputs return correct JSON structures.
*   *Test Case 1:* Input "Food 500" -> Expect `{amount: 500, category: "Food"}`.
*   *Test Case 2:* Input "Taxi 200" -> Expect `{amount: 200, category: "Travel"}`.

### 5.3.2 Integration Testing
Integration tests verified the communication between the React frontend and the FastAPI backend. We ensured that data sent from the form is correctly received by the API and stored in the Supabase database.

### 5.3.3 User Acceptance Testing (UAT)
The application was tested by a small group of users to verify the accuracy of the AI categorization. Feedback was collected to improve the prompt engineering for edge cases (e.g., ambiguous terms).
