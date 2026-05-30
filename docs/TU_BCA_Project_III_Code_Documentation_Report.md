# TU BCA Project-III Code Documentation Report

Project: Personal Finance Manager (PFM)  
Report Focus: Chapter 4 - Implementation and Testing  
Prepared From: Existing project source code

## 1_Project_Modules

### Module Name: Authentication Module

Related Files: `src/components/Auth.jsx`, `src/components/ResetPassword.jsx`, `src/App.js`, `src/supabase.js`, `backend/api/auth.py`

Purpose: Handles user registration, login, email verification, session checking, logout, demo mode, and password reset.

Main Classes/Functions: `Auth`, `handleAuth()`, `verifyCode()`, `resendCode()`, `sendResetOtp()`, `resetPassword()`, `supabase.auth.getSession()`, `supabase.auth.onAuthStateChange()`, `send_reset_otp()`, `verify_reset_otp()`

Input: Email, password, confirm password, OTP, new password.

Output: Authenticated Supabase user session, success/failure toast message, or OTP verification response.

Description: The frontend uses Supabase Auth for registration, login, email OTP verification, password reset, and session persistence. `App.js` checks the current session on load and listens for authentication state changes. The backend contains a simple OTP API for reset OTP generation and verification, but the frontend mainly uses Supabase OTP functions for email-based reset.

### Module Name: Dashboard and Navigation Module

Related Files: `src/App.js`, `src/components/layout/MainLayout.jsx`, `src/components/layout/Sidebar.jsx`, `src/components/layout/MobileNav.jsx`, `src/components/Header.jsx`, `src/context/ThemeContext.jsx`

Purpose: Controls authenticated application layout, active tabs, responsive sidebar/mobile navigation, theme support, and user profile actions.

Main Classes/Functions: `App`, `MainLayout`, `Sidebar`, `MobileNav`, `Header`, `ThemeProvider`

Input: Authenticated user, selected tab, selected group, theme preference.

Output: Rendered dashboard screens for Chat, Expenses, Income, Loans, and Analytics.

Description: `App.js` is the root controller after authentication. It stores the active tab and selected group in `localStorage`, renders the correct feature component, and passes shared callbacks for transaction refresh and group changes.

### Module Name: Group/User Collaboration Module

Related Files: `src/components/GroupManager.jsx`

Purpose: Supports shared workspaces for family, friends, trips, or team finance tracking.

Main Classes/Functions: `GroupManager`, `fetchGroups()`, `fetchInvitations()`, `fetchGroupMembers()`, `createGroup()`, `inviteUser()`, `acceptInvitation()`, `declineInvitation()`, `leaveGroup()`, `deleteGroup()`

Input: User ID, group name, invite email, current group.

Output: Created groups, accepted/declined invitations, updated group member list, selected group context.

Description: Groups are stored in Supabase tables `groups`, `group_members`, and `group_invitations`. The module checks group membership, allows the creator to delete a group, and cascades deletion of related members, invitations, and group expenses from the frontend.

### Module Name: Natural Language Transaction Module

Related Files: `src/components/Chat.jsx`, `backend/api/expenses.py`, `backend/services/nlp_service.py`, `src/App.js`

Purpose: Allows users to enter transactions in natural language and converts them into structured expense, income, or loan records.

Main Classes/Functions: `Chat`, `handleSubmit()`, `handleConfirmSave()`, `handleConfirmSaveWithType()`, `parse_expense()`, `NLPService.parse_expense()`, `ExpenseParser.parse()`

Input: Natural language text such as `lunch 250`, `salary 50000`, `i gave ram 1000`.

Output: Structured transaction objects containing amount, item, category, remarks, paid_by, and confirmation flags.

Description: The frontend validates that transaction entries include a number and real words. It sends valid input to `/api/expenses/parse`. The backend first attempts NVIDIA NIM based parsing and falls back to rule-based regex parsing if the AI is unavailable or unusable.

### Module Name: Expense Management Module

Related Files: `src/components/Table.jsx`, `src/components/ResponsiveTable.jsx`, `src/App.js`

Purpose: Displays and manages expense records excluding income and loan records.

Main Classes/Functions: `Table`, `fetchExpenses()`, `handleSave()`, `handleDelete()`, `fetchUserProfiles()`

Input: Supabase `expenses` table rows, search text, category filter, date range filter.

Output: Expense table/card view, summary totals, edited/deleted rows.

Description: Expense records are stored in the single `expenses` table. The module filters out records where category is `income` or `loan`, then supports search, category filtering, date filtering, editing, and deletion.

### Module Name: Income Management Module

Related Files: `src/components/Income.jsx`, `src/components/Chat.jsx`, `src/App.js`

Purpose: Records and displays user income.

Main Classes/Functions: `Income`, `fetchIncomes()`, `handleSave()`, `handleDelete()`

Input: Income transactions, search term, date range.

Output: Income table/card view and total income summaries.

Description: Income is stored in the same `expenses` table but represented with category `Income` and negative amount values in the transaction creation flow. Display logic uses `Math.abs()` to show positive income totals.

### Module Name: Loan Management Module

Related Files: `src/components/Loans.jsx`, `src/components/Chat.jsx`, `backend/services/nlp_service.py`

Purpose: Tracks money lent, borrowed, repaid, and received back.

Main Classes/Functions: `Loans`, `fetchLoans()`, `handleSave()`, `handleDelete()`, `handleConfirmSaveWithType()`, `ExpenseParser._parse_single_expense()`

Input: Loan natural language text, loan category rows, person name, date range.

Output: Loan list, total lent, total borrowed, net loan position, confirmation choices.

Description: Loan records are separated by category `Loan`. Positive amounts generally mean money went out, such as lending or repayment. Negative amounts generally mean money came in, such as borrowing or receiving repayment. Ambiguous phrases trigger frontend confirmation buttons.

### Module Name: Analytics and Report Generation Module

Related Files: `src/components/EnhancedAnalytics.jsx`, `src/components/Analytics.jsx`, `src/utils/algorithms.js`, `backend/services/expense_analyzer.py`

Purpose: Generates financial summaries, category analysis, trends, savings suggestions, and visual reports.

Main Classes/Functions: `EnhancedAnalytics`, `calculateMovingAverage()`, `optimizeBudget()`, `ExpenseAnalyzer.analyze_expenses()`, `ExpenseAnalyzer.process_query()`

Input: Transaction data, date range, savings goal percentage.

Output: Total expenses, total income, balance, loan totals, pie charts, bar charts, moving average chart, budget optimization suggestions.

Description: The frontend uses Recharts for visualization and custom algorithms for trend smoothing and budget suggestions. The backend analyzer supports financial calculations for chat answers and query processing.

### Module Name: AI Chat / RAG Module

Related Files: `src/components/Chat.jsx`, `backend/services/rag_service.py`, `backend/services/nlp_service.py`, `backend/api/expenses.py`

Purpose: Allows users to ask financial questions about their own or group transactions.

Main Classes/Functions: `chat_about_expenses()`, `NLPService.chat_about_expenses()`, `RAGService.query_expenses()`, `RAGService._retrieve_finance_facts()`, `RAGService._retrieved_facts_context()`

Input: User question, user metadata, personal/group expense data, conversation history.

Output: AI-generated answer grounded in retrieved transaction facts.

Description: The frontend sends recent conversation history and relevant transaction data. The backend computes authoritative facts before calling NVIDIA NIM so the answer is based on actual records instead of only model inference.

### Module Name: Database and Persistence Module

Related Files: `src/supabase.js`, `src/App.js`, `src/components/Table.jsx`, `src/components/Income.jsx`, `src/components/Loans.jsx`, `src/components/GroupManager.jsx`, `docs/diagrams/sources/06_database_schema_diagram.puml`

Purpose: Connects the application to Supabase PostgreSQL and performs CRUD operations.

Main Tables: `auth.users`, `profiles`, `groups`, `group_members`, `group_invitations`, `expenses`

Description: The frontend uses `@supabase/supabase-js` to query and mutate data directly. Authentication is handled through Supabase Auth. Transaction data, group data, and profile lookup data are stored in Supabase.

### Module Name: API Module

Related Files: `backend/main.py`, `backend/api/expenses.py`, `backend/api/auth.py`

Purpose: Provides REST endpoints for NLP parsing, AI finance chat, health checks, and OTP support.

Main Endpoints: `/`, `/health`, `/api/expenses/parse`, `/api/expenses/chat`, `/api/auth/send-reset-otp`, `/api/auth/verify-reset-otp`, `/ws`

Description: FastAPI exposes backend services. The frontend uses Axios to call expense parsing and chat endpoints. Supabase CRUD is mostly performed directly from frontend components.

### Module Name: Mobile and Deployment Module

Related Files: `capacitor.config.ts`, `src/mobile.js`, `android/`, `render.yaml`, `package.json`

Purpose: Supports Android build through Capacitor and backend deployment through Render.

Description: The frontend can be built as a web app and synchronized into the Android project with Capacitor. The backend is deployed as a Python web service using Gunicorn with Uvicorn workers.

## 2_Tools_Used

| Category | Tool / Technology | Use in Project |
|---|---|---|
| Programming Language | JavaScript | React frontend and utility algorithms |
| Programming Language | Python | FastAPI backend and NLP/RAG services |
| Frontend Framework | React 18.2 | Component-based UI |
| Styling | Tailwind CSS, custom CSS | Responsive UI, dark mode, utility classes |
| Backend Framework | FastAPI 0.104.1 | REST API and WebSocket server |
| API Server | Uvicorn, Gunicorn | Local and production backend serving |
| Database | Supabase PostgreSQL | Persistent records for users, groups, invitations, and transactions |
| Authentication | Supabase Auth | Registration, login, email verification, sessions, password reset |
| AI/NLP | NVIDIA NIM through OpenAI-compatible SDK | Natural language parsing and financial chat |
| Charting | Recharts | Analytics dashboards |
| HTTP Client | Axios | Frontend-to-backend API calls |
| Mobile Framework | Capacitor 6 | Android packaging |
| Icons | Lucide React | UI icons |
| Environment Management | `.env`, `python-dotenv` | Configuration for API keys and service URLs |
| Version Control | Git | Source code tracking |
| Deployment | Render | Backend deployment using `render.yaml` |
| CASE / Diagram Tools | PlantUML, Graphviz, Mermaid CLI | UML, ER, DFD, architecture, and deployment diagrams |
| IDE | VS Code or similar | Development environment |

## 3_Class_Details

### Class / Component: `App`

File: `src/App.js`

Purpose: Main application controller that handles authentication state, active tab, selected group, transaction save callback, and page rendering.

Attributes / State:

| Attribute | Purpose |
|---|---|
| `activeTab` | Stores current page such as chat, expenses, income, loans, analytics |
| `user` | Stores authenticated Supabase user |
| `loading` | Tracks initial session loading |
| `currentGroup` | Stores selected shared group |
| `showAddExpense` | Controls transaction modal |
| `chatKey` | Forces chat component reset |
| `tableRef`, `incomeRef`, `loansRef` | Allows parent to refresh child data |

Important Methods:

| Method | Purpose |
|---|---|
| `handleExpenseAdded(newExpenses)` | Converts parsed transaction objects into Supabase rows and inserts them |
| `handleTableRefresh()` | Refreshes expense, income, and loan lists |
| `MainApp()` | Conditionally renders Auth screen or authenticated layout |

### Class / Component: `Auth`

File: `src/components/Auth.jsx`

Purpose: Handles sign in, sign up, OTP verification, resend code, demo mode, and password reset.

Attributes / State: `email`, `password`, `confirmPassword`, `isSignUp`, `loading`, `showVerification`, `verificationCode`, `showForgotPassword`, `resetEmail`, `resetOtp`, `newPassword`.

Important Methods: `handleAuth()`, `checkSession()`, `verifyCode()`, `resendCode()`, `enterDemoMode()`, `sendResetOtp()`, `resetPassword()`.

### Class / Component: `Chat`

File: `src/components/Chat.jsx`

Purpose: Provides the central chat-based transaction and finance question interface.

Attributes / State:

| Attribute | Purpose |
|---|---|
| `input` | Current user text |
| `inputMode` | Selected mode: chat, expense, income, loan |
| `messages` | Conversation history stored in localStorage |
| `expensesData` | Loaded records used for AI chat context |
| `pendingTransactions` | Parsed transactions waiting for confirmation |
| `loading` | API request state |

Important Methods: `fetchExpensesData()`, `isRealWord()`, `handleSubmit()`, `handleConfirmSave()`, `handleConfirmSaveWithType()`, `handleCancelPending()`, `renderConfirmation()`.

### Class / Component: `GroupManager`

File: `src/components/GroupManager.jsx`

Purpose: Manages group creation, selection, invitation, member viewing, leaving, and deletion.

Attributes / State: `groups`, `groupName`, `inviteEmail`, `invitations`, `groupMembers`, `isProcessing`, `loadingMembers`, modal flags.

Important Methods: `fetchGroups()`, `fetchInvitations()`, `fetchGroupMembers()`, `createGroup()`, `inviteUser()`, `acceptInvitation()`, `declineInvitation()`, `handleConfirmLeave()`, `handleConfirmDelete()`.

### Class / Component: `Table`

File: `src/components/Table.jsx`

Purpose: Displays expense records and supports filtering, editing, and deletion.

Attributes / State: `data`, `filteredData`, `itemToEdit`, `itemToDelete`, `searchTerm`, `categoryFilter`, `dateRange`, `userProfiles`.

Important Methods: `fetchExpenses()`, `fetchUserProfiles()`, `handleSave()`, `handleDelete()`.

### Class / Component: `Income`

File: `src/components/Income.jsx`

Purpose: Displays and manages income transactions.

Attributes / State: `data`, `filteredData`, `itemToEdit`, `itemToDelete`, `searchTerm`, `dateRange`, `userProfiles`.

Important Methods: `fetchIncomes()`, `fetchUserProfiles()`, `handleSave()`, `handleDelete()`.

### Class / Component: `Loans`

File: `src/components/Loans.jsx`

Purpose: Displays and manages loan transactions.

Attributes / State: `data`, `filteredData`, `filterType`, `dateRange`, `editForm`, `userProfiles`.

Important Methods: `fetchLoans()`, `handleEdit()`, `handleSave()`, `handleDelete()`.

### Class / Component: `EnhancedAnalytics`

File: `src/components/EnhancedAnalytics.jsx`

Purpose: Shows financial analytics, trends, category charts, and budget optimization.

Attributes / State: `stats`, `algorithms`, `range`, `loading`, `savingsGoal`.

Important Methods: `fetch()`, `optimizerData`, `trendsExplainer`, `optimizerExplainer`, `breakdownExplainer`, `summaryExplainer`.

### Class: `ConnectionManager`

File: `backend/main.py`

Purpose: Manages active WebSocket connections.

Attributes:

| Attribute | Purpose |
|---|---|
| `active_connections` | List of connected WebSocket clients |

Methods:

| Method | Purpose |
|---|---|
| `connect(websocket)` | Accepts and stores a WebSocket connection |
| `disconnect(websocket)` | Removes a WebSocket connection |
| `broadcast(message)` | Sends message to all active connections |

### Class: `ParseRequest`

File: `backend/api/expenses.py`

Purpose: Pydantic request model for transaction parsing.

Attributes: `text`, `mode`.

### Class: `ChatRequest`

File: `backend/api/expenses.py`

Purpose: Pydantic request model for financial chat.

Attributes: `text`, `user_id`, `user_email`, `user_name`, `expenses_data`, `group_name`, `group_expenses_data`, `conversation_history`.

### Class: `ExpenseParser`

File: `backend/services/nlp_service.py`

Purpose: Rule-based fallback parser for natural language expenses, income, and loan phrases.

Attributes:

| Attribute | Purpose |
|---|---|
| `categories` | Keyword dictionary for category detection |
| `all_keywords` | Combined keyword set for item/person detection |
| `non_person_words` | Words excluded from person-name detection |

Important Methods: `parse()`, `_parse_single_expense()`, `_is_likely_person()`, `_categorize()`, `_generate_reply()`.

### Class: `NLPService`

File: `backend/services/nlp_service.py`

Purpose: Orchestrates AI parsing, fallback parsing, mode-specific corrections, and chat service.

Attributes:

| Attribute | Purpose |
|---|---|
| `parser` | Instance of `ExpenseParser` |
| `rag_service` | Instance of `RAGService` |
| `nim_available` | Indicates whether NVIDIA NIM is configured |
| `nim_client` | OpenAI-compatible client for NVIDIA NIM |
| `nim_model` | Main model for parsing/chat |
| `nim_entry_model` | Entry model for transaction parsing |

Important Methods: `_setup_nim()`, `parse_expense()`, `_parse_with_nim()`, `_apply_mode_to_fallback()`, `chat_about_expenses()`.

### Class: `RAGService`

File: `backend/services/rag_service.py`

Purpose: Retrieves transaction facts and produces grounded AI answers for financial questions.

Attributes: `nim_available`, `client`, `model`.

Important Methods: `_setup_nim()`, `_find_item_matches()`, `_parse_date()`, `_amount()`, `_money()`, `_period_from_query()`, `_retrieve_finance_facts()`, `_retrieved_facts_context()`, `query_expenses()`.

### Class: `ExpenseAnalyzer`

File: `backend/services/expense_analyzer.py`

Purpose: Performs deterministic financial analysis and supports direct query processing.

Attributes:

| Attribute | Purpose |
|---|---|
| `months` | Month name mapping for date extraction |
| `categories` | Keyword groups for category matching |

Important Methods: `analyze_expenses()`, `find_specific_item()`, `filter_by_date_range()`, `extract_time_period()`, `process_query()`.

## 4_Functions_Methods_Details

| Function / Method | File | Purpose | Input | Output | Used By |
|---|---|---|---|---|---|
| `handleAuth()` | `src/components/Auth.jsx` | Registers or signs in a user using Supabase Auth | Email, password, confirm password | Session or error toast | Auth form |
| `verifyCode()` | `src/components/Auth.jsx` | Verifies signup/magic-link/email OTP | Email and OTP token | Auth session or error toast | Verification modal |
| `resetPassword()` | `src/components/Auth.jsx` | Verifies reset OTP and updates password | Reset email, OTP, new password | Password update result | Forgot password flow |
| `handleExpenseAdded()` | `src/App.js` | Saves parsed transaction rows to Supabase | Array of parsed expenses | Inserted rows or thrown error | Chat transaction flow |
| `fetchExpensesData()` | `src/components/Chat.jsx` | Loads recent transaction data for AI chat | User/group context | `expensesData` state | Chat mode |
| `isRealWord()` | `src/components/Chat.jsx` | Prevents invalid transaction text | Word string | Boolean | Transaction validation |
| `handleSubmit()` | `src/components/Chat.jsx` | Routes user input by mode and calls backend APIs | User text and input mode | Chat response, saved transaction, or confirmation UI | Main chat form |
| `handleConfirmSave()` | `src/components/Chat.jsx` | Saves ambiguous expense after user category choice | Category | Saved transaction | Expense confirmation |
| `handleConfirmSaveWithType()` | `src/components/Chat.jsx` | Saves ambiguous loan after type choice | Category, loan type, amount | Saved loan transaction | Loan confirmation |
| `fetchGroups()` | `src/components/GroupManager.jsx` | Loads groups where current user is a member | User ID | Group list | Group selector |
| `createGroup()` | `src/components/GroupManager.jsx` | Creates group and adds creator as member | Group name, user ID | New group and membership | Group module |
| `inviteUser()` | `src/components/GroupManager.jsx` | Sends group invitation | Email and group ID | Invitation row | Group module |
| `fetchExpenses()` | `src/components/Table.jsx` | Loads expense records from Supabase | User/group context | Expense rows | Expense table |
| `handleSave()` | `src/components/Table.jsx`, `Income.jsx`, `Loans.jsx` | Updates edited transaction row | Edited record | Updated database row | Edit modals |
| `handleDelete()` | `src/components/Table.jsx`, `Income.jsx`, `Loans.jsx` | Deletes selected transaction | Record ID | Deleted database row | Delete confirmation |
| `fetch()` | `src/components/EnhancedAnalytics.jsx` | Loads records and computes analytics | User/group/date range | Stats and algorithm state | Analytics dashboard |
| `getDateRange()` | `src/components/ui/DateRangePicker.jsx` | Converts preset range into start/end dates | Range type | Date range object | Tables and analytics |
| `calculateMovingAverage()` | `src/utils/algorithms.js` | Smooths daily expenses using simple moving average | Transaction data, window size | Time-series with moving average | Analytics |
| `optimizeBudget()` | `src/utils/algorithms.js` | Suggests budget cuts using greedy selection | Category totals, target ratio | Savings suggestions | Analytics |
| `fallbackCategorization()` | `src/utils/algorithms.js` | Matches unknown item to closest category | Item name, category list | Matched category and confidence | Utility fallback |
| `parse_expense()` | `backend/api/expenses.py` | API wrapper for transaction parsing | `ParseRequest` | Structured transaction JSON | Frontend Chat |
| `chat_about_expenses()` | `backend/api/expenses.py` | API wrapper for AI finance chat | `ChatRequest` | AI reply JSON | Frontend Chat |
| `ExpenseParser.parse()` | `backend/services/nlp_service.py` | Splits text and parses each part | Natural language text | Expenses list and reply | `NLPService` fallback |
| `ExpenseParser._parse_single_expense()` | `backend/services/nlp_service.py` | Applies regex patterns for one transaction | Single text segment | Transaction dict or null | `ExpenseParser.parse()` |
| `NLPService.parse_expense()` | `backend/services/nlp_service.py` | Parses text using NIM and fallback rules | Text and mode | Structured parse result | `/api/expenses/parse` |
| `NLPService.chat_about_expenses()` | `backend/services/nlp_service.py` | Processes chat questions with transaction context | Chat request | Reply JSON | `/api/expenses/chat` |
| `RAGService._retrieve_finance_facts()` | `backend/services/rag_service.py` | Calculates authoritative finance facts for a query scope | Expenses and query | Totals, categories, rankings | RAG prompts |
| `RAGService.query_expenses()` | `backend/services/rag_service.py` | Produces grounded answer using retrieved facts and NIM | Query and expense data | Answer string | `NLPService.chat_about_expenses()` |
| `ExpenseAnalyzer.analyze_expenses()` | `backend/services/expense_analyzer.py` | Computes expense, income, loan, and category totals | Expense data list | Analysis dictionary | Query processing / analytics |
| `ExpenseAnalyzer.extract_time_period()` | `backend/services/expense_analyzer.py` | Extracts dates from natural language query | Query string | Start date, end date, period name | Financial questions |

## 5_Algorithm_Details

### Algorithm 1: Rule-Based Natural Language Transaction Parsing

Location: `backend/services/nlp_service.py`, class `ExpenseParser`

Purpose: Converts informal user text into structured finance records when AI parsing is unavailable or when deterministic fallback is needed.

Input: A string such as `biryani rahul 500`, `i borrowed 500 from sonu`, or `salary 50000`.

Output:

```json
{
  "amount": 500,
  "item": "biryani",
  "category": "Food",
  "remarks": "biryani rahul",
  "paid_by": "Rahul"
}
```

Steps:

1. Trim the input text.
2. Normalize comma-based numbers such as `100,000` into `100000`.
3. Split multi-item entries using comma or `and`.
4. For each part, call `_parse_single_expense()`.
5. Match specialized loan patterns first because loan direction affects amount sign.
6. Match generic item/amount patterns.
7. Detect category using keyword dictionaries.
8. Detect person names using keyword exclusion and likely-person checks.
9. Generate a user-friendly reply.

Why It Is Useful: This is more than CRUD because it interprets unstructured natural language and maps it to structured database fields.

### Algorithm 2: AI-Assisted Transaction Parsing with Fallback

Location: `backend/services/nlp_service.py`, class `NLPService`

Purpose: Uses NVIDIA NIM for complex language understanding and falls back to local parsing for reliability.

Input: Text and mode (`expense`, `income`, or `loan`).

Output: Structured transactions and a reply.

Steps:

1. Check whether NVIDIA NIM client is configured.
2. Send a structured prompt to the AI model.
3. Parse AI JSON response.
4. Validate fields such as amount, category, item, and remarks.
5. If AI response fails, call `ExpenseParser.parse()`.
6. Apply mode-specific corrections:
   - Income: category becomes `Income`, amount is stored as negative.
   - Loan: category becomes `Loan`, ambiguous entries may require confirmation.
   - Expense: positive amount and expense category.
7. Return result to the frontend.

### Algorithm 3: RAG-Style Financial Question Answering

Location: `backend/services/rag_service.py`, class `RAGService`

Purpose: Answers finance questions using actual transaction data instead of unsupported AI assumptions.

Input: User query and transaction data.

Output: Natural language answer with totals and explanations.

Steps:

1. Parse the time period from the query using `_period_from_query()`.
2. Filter transaction rows by date range.
3. Split rows into expenses, income, and loans.
4. Calculate totals, net balance, loan given/received, largest expense, category totals, and monthly totals.
5. Serialize these facts into an authoritative context.
6. Send query plus facts to NVIDIA NIM.
7. Return the generated answer.

### Algorithm 4: Simple Moving Average for Spending Trend

Location: `src/utils/algorithms.js`, function `calculateMovingAverage()`

Purpose: Smooths daily spending variation and shows spending trend.

Input: Transaction list and window size, default 7 days.

Output: Time-series data with daily amount and moving average.

Steps:

1. Filter expense transactions only.
2. Group records by date.
3. Sort dates in ascending order.
4. For each date, select the last `windowSize` data points.
5. Calculate average spending for the window.
6. Return `{ date, amount, movingAverage }`.

Formula:

```text
Moving Average = Sum of last N daily totals / N
```

### Algorithm 5: Greedy Budget Optimization

Location: `src/utils/algorithms.js`, function `optimizeBudget()`

Purpose: Suggests how the user can reduce spending to reach a target savings percentage.

Input: Category totals, current total expense, target reduction ratio.

Output: Target savings, achieved cuts, and cut suggestions.

Steps:

1. Calculate target savings from total expense and target reduction ratio.
2. Mark essential categories such as rent, medical, utilities, groceries, and food.
3. Sort categories by highest spending.
4. Greedily cut up to 50% from non-essential categories first.
5. If the target is not reached, cut up to 10% from essential categories.
6. Return suggested cuts and reasons.

### Algorithm 6: Levenshtein-Based Fallback Categorization

Location: `src/utils/algorithms.js`, function `fallbackCategorization()`

Purpose: Matches unknown item text to the closest predefined category.

Input: Uncategorized item and category list.

Output: Matched category, edit distance, and confidence.

Steps:

1. Compare item text to each category name using Levenshtein distance.
2. Select category with minimum distance.
3. If distance is less than 4, return high confidence.
4. Otherwise return `other` with low confidence.

## 6_Database_Connection_Details

### Database Platform

The project uses Supabase, which provides PostgreSQL database, authentication, and client SDK access.

### Connection File

File: `src/supabase.js`

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseKey)
```

### Environment Variables

Frontend:

| Variable | Purpose |
|---|---|
| `REACT_APP_SUPABASE_URL` | Supabase project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | Public anon key for frontend Supabase client |
| `REACT_APP_API_BASE_URL` | Backend API URL |

Backend:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase URL for backend usage if needed |
| `SUPABASE_KEY` / `SUPABASE_SERVICE_KEY` | Supabase key |
| `NVIDIA_API_KEY` | API key for NVIDIA NIM |
| `NVIDIA_NIM_MODEL` | Main LLM model |
| `NVIDIA_NIM_ENTRY_MODEL` | Transaction entry model |

### Database Tables

| Table | Purpose |
|---|---|
| `auth.users` | Supabase managed authentication users |
| `profiles` | User profile names and emails |
| `groups` | Shared finance workspaces |
| `group_members` | User-group membership relation |
| `group_invitations` | Pending/accepted/declined invitations |
| `expenses` | Stores expenses, incomes, and loans |

### Main Database Operations

| Operation | Code Example | Used In |
|---|---|---|
| Insert transaction | `supabase.from('expenses').insert(expenseData)` | `App.js` |
| Fetch personal records | `.eq('user_id', user.id).is('group_id', null)` | Chat, Table, Income, Loans, Analytics |
| Fetch group records | `.eq('group_id', currentGroup.id)` | Chat, Table, Income, Loans, Analytics |
| Update transaction | `.from('expenses').update(itemToEdit).eq('id', itemToEdit.id)` | Table, Income, Loans |
| Delete transaction | `.from('expenses').delete().eq('id', id)` | Table, Income, Loans |
| Create group | `.from('groups').insert({ name, created_by })` | GroupManager |
| Add group member | `.from('group_members').insert({ group_id, user_id })` | GroupManager |
| Send invite | `.from('group_invitations').insert(...)` | GroupManager |

### ORM / Migrations

The current project does not use a traditional ORM such as SQLAlchemy or Prisma. Database operations are performed using Supabase JavaScript client query builder methods. The schema is documented in `docs/diagrams/sources/06_database_schema_diagram.puml`. No migration files were found in the repository.

## 7_API_Details

### Backend Base

Local backend URL: `http://localhost:8000`  
Frontend config: `src/config/api.js` and runtime `window.APP_CONFIG.API_BASE_URL`

### API Endpoints

| Endpoint | Method | Request | Response | Purpose |
|---|---|---|---|---|
| `/` | GET | None | API message, version, features | Root status endpoint |
| `/health` | GET | None | `{ status, message, version }` | Health check |
| `/api/expenses/parse` | POST | `{ text: string, mode: string }` | `{ expenses: [], reply: string }` | Parse natural language transaction |
| `/api/expenses/chat` | POST | Chat request with user data, expense data, group data, conversation history | `{ reply: string }` | AI finance question answering |
| `/api/auth/send-reset-otp` | POST | `{ email }` | OTP response | Backend OTP generation |
| `/api/auth/verify-reset-otp` | POST | `{ email, otp }` | Verification result | Backend OTP verification |
| `/ws` | WebSocket | Text message | Broadcast message | Basic real-time broadcast support |

### Request Models

`ParseRequest`:

```python
class ParseRequest(BaseModel):
    text: str
    mode: str = "expense"
```

`ChatRequest`:

```python
class ChatRequest(BaseModel):
    text: str
    user_id: str = None
    user_email: str = None
    user_name: str = None
    expenses_data: list = Field(default_factory=list)
    group_name: str = None
    group_expenses_data: list = Field(default_factory=list)
    conversation_history: list = Field(default_factory=list)
```

### Example Parse Request

```json
{
  "text": "lunch 250 and coffee 80",
  "mode": "expense"
}
```

### Example Parse Response

```json
{
  "expenses": [
    {
      "amount": 250,
      "item": "lunch",
      "category": "Food",
      "remarks": "lunch",
      "paid_by": null
    },
    {
      "amount": 80,
      "item": "coffee",
      "category": "Food",
      "remarks": "coffee",
      "paid_by": null
    }
  ],
  "reply": "Saved 2 expenses."
}
```

## 8_Authentication_Authorization_Details

### Authentication

The project uses Supabase Auth from the frontend.

Implemented flows:

| Flow | Implementation |
|---|---|
| Registration | `supabase.auth.signUp({ email, password })` |
| Login | `supabase.auth.signInWithPassword({ email, password })` |
| Session Restore | `supabase.auth.getSession()` |
| Session Listener | `supabase.auth.onAuthStateChange()` |
| Email OTP Verification | `supabase.auth.verifyOtp()` |
| Resend Code | `supabase.auth.signInWithOtp({ email })` |
| Password Reset | OTP verification followed by `supabase.auth.updateUser({ password })` |
| Logout | `supabase.auth.signOut()` in `Header.jsx` |

### Password Hashing

Password hashing is handled internally by Supabase Auth. The project code does not manually hash passwords.

### Sessions / JWT

Supabase Auth manages sessions and JWT tokens internally. The frontend obtains the current session and user object through Supabase client methods.

### Authorization

Access control is implemented mainly through query filtering:

| Context | Rule |
|---|---|
| Personal records | Fetch records where `user_id = current user` and `group_id IS NULL` |
| Group records | Fetch records where `group_id = selected group` |
| Group membership | Groups are fetched from `group_members` where `user_id = current user` |
| Group deletion | UI allows deletion only if `currentGroup.created_by === user.id` |

Note: Supabase Row Level Security policies are not visible in the repository. For production and report completeness, the database should enforce these rules at the Supabase policy level, not only from frontend filters.

## 9_Input_Validation_Details

### Frontend Validation

| Area | Validation |
|---|---|
| Login/Register | Required email and password fields; confirm password must match |
| Forgot Password | Reset email required; OTP, new password, and confirm password required |
| Transaction Input | Expense/income/loan modes require at least one number and at least one real word |
| Real Word Check | `isRealWord()` checks minimum length, vowel presence, consonant limit, and vowel ratio |
| Group Creation | Group name form uses required input behavior |
| Invite User | Email is trimmed and validated with regex |
| Date Range | Custom date range requires start and end dates |
| Confirmation Flow | Ambiguous expense and loan records require user category/type selection |

### Backend Validation

| Area | Validation |
|---|---|
| Request schema | Pydantic validates request structure |
| Email validation | `EmailStr` validates email in backend OTP API |
| OTP expiry | Backend OTP expires after 10 minutes |
| OTP matching | Backend compares submitted OTP against in-memory stored OTP |
| Parsing fallback | Invalid or unusable AI output falls back to rule parser |

### Validation Examples

Transaction input without amount:

```text
Input: lunch
Output: Include an amount — e.g., "lunch 250"
```

Invalid invite email:

```text
Input: ramgmail.com
Output: Please enter a valid email address
```

Password mismatch:

```text
Input: password != confirmPassword
Output: Passwords do not match
```

## 10_Error_Handling_Details

### Frontend Error Handling

| File | Error Handling |
|---|---|
| `Auth.jsx` | Uses `try/catch` and toast messages for auth errors |
| `Chat.jsx` | Catches Axios/API failures and shows fallback message |
| `GroupManager.jsx` | Uses toast messages for create/invite/delete/leave errors |
| `Table.jsx` | Catches fetch/update/delete failures and resets data or silently handles errors |
| `Income.jsx` | Catches fetch/update/delete failures |
| `Loans.jsx` | Catches fetch/update/delete failures |
| `EnhancedAnalytics.jsx` | Handles missing data by setting zeroed stats |

### Backend Error Handling

| File | Error Handling |
|---|---|
| `backend/api/auth.py` | Raises `HTTPException` for missing OTP, expired OTP, invalid OTP, and server errors |
| `backend/main.py` | WebSocket broadcast ignores failed sends |
| `backend/services/rag_service.py` | Uses fallbacks for date parsing, amount conversion, and unavailable NIM |
| `backend/services/nlp_service.py` | Falls back to rule parser when AI client or response fails |

### Common Error Scenarios

| Scenario | Handling |
|---|---|
| Backend not reachable | Chat shows “Unable to reach the finance assistant right now” |
| Supabase insert fails | `handleExpenseAdded()` throws error to caller |
| AI unavailable | Rule-based parser continues transaction parsing |
| Invalid transaction input | Frontend blocks API call and shows guidance |
| Group deletion partially fails | Error is shown with specific failed dependency message |
| OTP expired | Backend deletes OTP and returns `400 OTP has expired` |

## 11_Module_Workflow

### Authentication Workflow

1. User opens application.
2. `App.js` calls `supabase.auth.getSession()`.
3. If no session exists, `Auth` component is shown.
4. User enters email and password.
5. `handleAuth()` calls Supabase sign-up or sign-in.
6. Supabase returns session or error.
7. `onAuthStateChange()` updates `user` state.
8. Authenticated user enters the main dashboard.

### Expense Entry Workflow

1. User selects `Expense` mode in `Chat.jsx`.
2. User enters natural text such as `momo 150`.
3. Frontend checks for amount and meaningful description.
4. Frontend sends POST request to `/api/expenses/parse`.
5. FastAPI receives `ParseRequest`.
6. `NLPService.parse_expense()` tries AI parsing.
7. If AI fails, `ExpenseParser.parse()` applies regex fallback.
8. Backend returns structured expense data.
9. If category is ambiguous, frontend asks for confirmation.
10. `App.handleExpenseAdded()` inserts the transaction into Supabase.
11. Expense, income, and loan views refresh.

### Income Entry Workflow

1. User selects `Income` mode.
2. User enters text such as `salary 50000`.
3. Backend parses source and amount.
4. Frontend converts category to `Income`.
5. Frontend stores income amount as negative using `-Math.abs(exp.amount)`.
6. Income table displays it as positive using `Math.abs()`.

### Loan Entry Workflow

1. User selects `Loan` mode.
2. User enters text such as `i gave ram 1000`.
3. Backend detects loan-related patterns.
4. If direction is ambiguous, frontend displays options:
   - I lent
   - I paid back
   - I borrowed
   - Person paid back
5. User selects correct loan type.
6. Frontend sets amount sign and remarks.
7. Transaction is saved as category `Loan`.
8. Loans page updates totals and net position.

### Group Workflow

1. User creates or selects a group from `GroupManager`.
2. Group is inserted into `groups`.
3. Creator is inserted into `group_members`.
4. User invites another member by email.
5. Invitation is inserted into `group_invitations`.
6. Invited user accepts invitation.
7. Membership row is inserted into `group_members`.
8. All transaction queries use `group_id` instead of personal `user_id`.

### Analytics Workflow

1. User opens Analytics tab.
2. `EnhancedAnalytics.fetch()` queries Supabase records.
3. Data is filtered by user/group and date range.
4. Records are separated into expenses, income, loans given, and loans received.
5. Category totals and daily totals are calculated.
6. `calculateMovingAverage()` creates trend data.
7. `optimizeBudget()` creates budget suggestions.
8. Recharts displays charts and summary cards.

### AI Chat Workflow

1. User selects `Chat` mode.
2. User asks a question such as “How much did I spend on food this month?”
3. Frontend loads relevant expense data.
4. Frontend sends question, user details, group data, and conversation history to `/api/expenses/chat`.
5. `NLPService.chat_about_expenses()` delegates to `RAGService`.
6. `RAGService` retrieves exact totals and relevant facts.
7. NIM receives the question plus calculated facts.
8. Backend returns grounded answer.
9. Frontend renders Markdown-like answer with headings, tables, bullets, and paragraphs.

## 12_Test_Cases

### Unit Testing Test Cases

| Test ID | Unit / Function | Test Input | Expected Output | Status |
|---|---|---|---|---|
| UT-01 | `ExpenseParser.parse()` | `rice curry 300` | One Food expense with amount 300 | Prepared |
| UT-02 | `ExpenseParser.parse()` | `lunch 250 and coffee 80` | Two Food transactions | Prepared |
| UT-03 | `ExpenseParser.parse()` | `i borrowed 500 from sonu` | Loan transaction, negative amount, paid_by Sonu | Prepared |
| UT-04 | `ExpenseParser.parse()` | `hari borrowed 400` | Loan transaction, positive amount, paid_by Hari | Prepared |
| UT-05 | `ExpenseParser.parse()` | `paid loan to hari 400` | Loan repayment, positive amount | Prepared |
| UT-06 | `calculateMovingAverage()` | 10 days of expenses, window 7 | Each row includes rounded 7-day moving average | Prepared |
| UT-07 | `optimizeBudget()` | Categories with entertainment high, target 20% | Suggests cuts from non-essential categories first | Prepared |
| UT-08 | `fallbackCategorization()` | `fod`, categories `[food, rent]` | Matches `food` with high confidence if distance < 4 | Prepared |
| UT-09 | `getDateRange()` | `30` | Start date 30 days before end date | Prepared |
| UT-10 | `isRealWord()` | `xkqz999` | Returns false | Prepared |
| UT-11 | `ExpenseAnalyzer.extract_time_period()` | `this month` | Start of current month and current date | Prepared |
| UT-12 | `RAGService._amount()` | `{ amount: "500" }` | Float value 500.0 | Prepared |

Existing script references:

| Script | Purpose |
|---|---|
| `scripts/nlp_tests/repro_nlp.py` | Manual/parser reproduction tests |
| `scripts/nlp_tests/repro_nlp_final.py` | Final parser sample checks |
| `scripts/llm_verification/verify_llm.py` | LLM verification |
| `scripts/llm_verification/verify_llm_v2.py` | NIM availability and complex parsing check |

### System Testing Test Cases

| Test ID | Scenario | Steps | Expected Result | Status |
|---|---|---|---|---|
| ST-01 | User registration | Open app, choose sign up, enter email/password | Account created and verification flow shown | Prepared |
| ST-02 | User login | Enter valid email/password | Dashboard opens | Prepared |
| ST-03 | Invalid login | Enter wrong password | Error toast shown | Prepared |
| ST-04 | Add expense by chat | Select Expense, enter `lunch 250` | Expense saved and visible in Expenses tab | Prepared |
| ST-05 | Add income by chat | Select Income, enter `salary 50000` | Income saved and visible in Income tab | Prepared |
| ST-06 | Add ambiguous loan | Select Loan, enter `i gave ram 1000` | Confirmation buttons shown | Prepared |
| ST-07 | Confirm loan type | Choose `I lent to Ram` | Loan saved as lent transaction | Prepared |
| ST-08 | Edit expense | Open Expenses, edit amount/category | Updated row displayed | Prepared |
| ST-09 | Delete expense | Select delete and confirm | Row removed from Supabase and UI | Prepared |
| ST-10 | Create group | Enter group name and submit | Group appears in selector | Prepared |
| ST-11 | Invite member | Enter valid email and invite | Invitation stored and success toast shown | Prepared |
| ST-12 | Group transaction | Select group and add expense | Record saved with `group_id` | Prepared |
| ST-13 | Personal transaction isolation | Clear group and view expenses | Only personal records shown | Prepared |
| ST-14 | Analytics date range | Select last 30 days | Charts and totals update | Prepared |
| ST-15 | AI finance question | Ask `How much did I spend on food this month?` | Answer reflects transaction totals | Prepared |
| ST-16 | Backend health | Visit `/health` | Healthy JSON response | Prepared |
| ST-17 | Backend unavailable | Stop backend and submit chat | Friendly error message shown | Prepared |
| ST-18 | Mobile layout | Open app on mobile width | Mobile navigation and cards display correctly | Prepared |

### Suggested Commands

```bash
npm run lint
npm test
python scripts/nlp_tests/repro_nlp_final.py
python scripts/llm_verification/verify_llm_v2.py
```

Note: The report was prepared from code inspection. The commands above should be run in the final test environment with valid Supabase and NVIDIA credentials.

## 13_Result_Analysis

### Functional Results

| Feature | Observed / Expected Result |
|---|---|
| Authentication | Supabase Auth manages login, registration, session restore, and password reset |
| Expense Entry | Natural language expense input converts into structured database rows |
| Income Entry | Income is stored in the transaction table and summarized separately |
| Loan Tracking | Loan direction is represented using amount sign and loan type remarks |
| Group Tracking | Group records use `group_id`, allowing shared transaction context |
| Analytics | Totals, category breakdown, balance, loan totals, moving average, and budget optimization are generated |
| AI Chat | User questions are answered using transaction context and retrieved facts |
| Mobile Support | Capacitor configuration supports Android packaging |

### Algorithm Result Analysis

| Algorithm | Result |
|---|---|
| Rule-based parser | Handles common expense/income/loan text even when AI is unavailable |
| NIM parser | Improves handling of complex or informal transaction text |
| RAG fact retrieval | Reduces incorrect answers by giving the model calculated totals |
| Moving average | Smooths daily spikes and shows trend direction |
| Greedy budget optimization | Produces practical category-wise cut suggestions |
| Levenshtein matching | Provides fallback category matching for misspelled or near-match words |

### Performance Considerations

| Area | Analysis |
|---|---|
| Supabase queries | Components query only relevant user/group records; tables sort by date |
| Chat context | Chat limits fetched records to 1000 and sends recent conversation history |
| AI latency | NIM requests may be slower than local parsing; fallback parser protects basic usage |
| Frontend analytics | Calculations are performed on client-side loaded data; suitable for small to medium personal datasets |
| Backend deployment | Render runs Gunicorn with 4 Uvicorn workers, improving concurrent request handling |

### Accuracy Considerations

| Area | Analysis |
|---|---|
| Expense category | Keyword and AI categorization improves accuracy but ambiguous cases may still need user confirmation |
| Loan direction | Confirmation UI reduces risk of wrong sign for ambiguous loan text |
| Chat answers | RAG fact context improves numerical accuracy for totals and comparisons |
| Date filters | Date parsing supports common ranges such as today, this month, last year, and last N days |

### Screenshots / Outputs To Include In Final Report

Recommended screenshots:

1. Login/Register page.
2. Chat transaction entry.
3. Confirmation buttons for ambiguous loan or category.
4. Expenses table.
5. Income table.
6. Loans dashboard.
7. Group creation/invitation screen.
8. Analytics charts.
9. AI finance chat answer.
10. Backend `/health` response.

Recommended diagram images:

1. `docs/diagrams/newdigrams/1_Use_Case_Diagram.png`
2. `docs/diagrams/newdigrams/2_Class_Diagram.png`
3. `docs/diagrams/newdigrams/3_Object_Diagram.png`
4. `docs/diagrams/newdigrams/4_State_Diagram.png`
5. `docs/diagrams/newdigrams/5_Sequence_Diagram.png`
6. `docs/diagrams/newdigrams/6_Activity_Diagram.png`
7. `docs/diagrams/newdigrams/7_Refined_Class_Diagram.png`
8. `docs/diagrams/newdigrams/8_Refined_Object_Diagram.png`
9. `docs/diagrams/newdigrams/9_Refined_State_Diagram.png`
10. `docs/diagrams/newdigrams/10_Refined_Sequence_Diagram.png`
11. `docs/diagrams/newdigrams/11_Refined_Activity_Diagram.png`
12. `docs/diagrams/newdigrams/12_Component_Diagram.png`
13. `docs/diagrams/newdigrams/13_Deployment_Diagram.png`

## 14_Source_Code_Appendix

### Appendix A: Supabase Client

File: `src/supabase.js`

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseKey)
```

### Appendix B: Transaction Save Logic

File: `src/App.js`

```javascript
const handleExpenseAdded = async (newExpenses) => {
  for (const expense of newExpenses) {
    const expenseData = {
      amount: expense.amount || 0,
      item: expense.item || 'item',
      category: expense.category || 'other',
      remarks: expense.remarks || '',
      paid_by: expense.paid_by || null,
      date: new Date().toISOString().split('T')[0],
      user_id: user?.id,
      added_by: displayName
    }

    if (currentGroup) {
      expenseData.group_id = currentGroup.id
    }

    const { error } = await supabase.from('expenses').insert(expenseData)
    if (error) throw error
  }
}
```

### Appendix C: API Parse Endpoint

File: `backend/api/expenses.py`

```python
@router.post("/parse")
async def parse_expense(request: ParseRequest):
    """Parse expense text and return structured expense data"""
    return await nlp_service.parse_expense(request.text, request.mode)
```

### Appendix D: API Chat Endpoint

File: `backend/api/expenses.py`

```python
@router.post("/chat")
async def chat_about_expenses(request: ChatRequest):
    """Chat about expenses with AI assistance"""
    result = await nlp_service.chat_about_expenses(request)
    return result
```

### Appendix E: Moving Average Algorithm

File: `src/utils/algorithms.js`

```javascript
export function calculateMovingAverage(data, windowSize = 7) {
  const dailyTotals = {};
  data.forEach(item => {
    if (item.amount > 0 && item.category !== 'income' && item.category !== 'loan') {
      const date = new Date(item.date).toISOString().split('T')[0];
      dailyTotals[date] = (dailyTotals[date] || 0) + item.amount;
    }
  });

  const sortedDates = Object.keys(dailyTotals).sort();
  const timeSeries = sortedDates.map(date => ({ date, amount: dailyTotals[date] }));

  return timeSeries.map((point, i) => {
    const windowStart = Math.max(0, i - windowSize + 1);
    const windowData = timeSeries.slice(windowStart, i + 1);
    const sum = windowData.reduce((acc, curr) => acc + curr.amount, 0);
    return { date: point.date, amount: point.amount, movingAverage: Math.round(sum / windowData.length) };
  });
}
```

### Appendix F: Budget Optimization Algorithm

File: `src/utils/algorithms.js`

```javascript
export function optimizeBudget(categories, currentTotal, targetReductionRatio = 0.2) {
  const targetSavings = currentTotal * targetReductionRatio;
  const essentialCategories = ['rent', 'medical', 'utilities', 'groceries', 'food'];
  const sortedCategories = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount, essential: essentialCategories.includes(name.toLowerCase()) }));

  let remainingToCut = targetSavings;
  const cuts = [];

  for (const cat of sortedCategories) {
    if (!cat.essential && remainingToCut > 0) {
      const actualCut = Math.min(remainingToCut, cat.amount * 0.5);
      if (actualCut > 0) {
        cuts.push({ category: cat.name, cutAmount: actualCut, reason: 'Discretionary spending' });
        remainingToCut -= actualCut;
      }
    }
  }

  return {
    targetSavings: Math.round(targetSavings),
    achievedCuts: Math.round(targetSavings - remainingToCut),
    suggestions: cuts.map(c => ({ ...c, cutAmount: Math.round(c.cutAmount) }))
  };
}
```

### Appendix G: Important Source Code References

| Area | Source Files |
|---|---|
| Root App | `src/App.js` |
| Authentication | `src/components/Auth.jsx`, `src/components/ResetPassword.jsx` |
| Chat and NLP UI | `src/components/Chat.jsx` |
| Expense table | `src/components/Table.jsx` |
| Income table | `src/components/Income.jsx` |
| Loan table | `src/components/Loans.jsx` |
| Groups | `src/components/GroupManager.jsx` |
| Analytics | `src/components/EnhancedAnalytics.jsx`, `src/utils/algorithms.js` |
| Supabase config | `src/supabase.js` |
| API config | `src/config/api.js` |
| Backend app | `backend/main.py` |
| Expense API | `backend/api/expenses.py` |
| Auth API | `backend/api/auth.py` |
| NLP service | `backend/services/nlp_service.py` |
| RAG service | `backend/services/rag_service.py` |
| Analyzer | `backend/services/expense_analyzer.py` |
| Deployment | `render.yaml`, `capacitor.config.ts`, `android/` |

## Final Notes For TU BCA Report Use

This document can be placed inside Chapter 4 as the main “Implementation and Testing” content. The UML diagrams in `docs/diagrams/newdigrams/` can be included in Chapter 3 or Chapter 4 depending on the report structure. The test cases listed here should be converted into the college-required table format if the final report template has a specific layout.
