# CHAPTER 2: LITERATURE REVIEW

## 2.1 Existing Systems

Several personal finance management applications exist in the market, each offering various features for expense tracking and budgeting. Some of the most popular ones include:

### 2.1.1 Mint (Intuit)
Mint was one of the most popular PFM tools, offering automatic bank synchronization, budgeting, and credit score tracking.
*   **Strengths:** Comprehensive financial overview, automated syncing.
*   **Weaknesses:** Recently discontinued/migrated to Credit Karma, heavily ad-supported, privacy concerns with bank data.

### 2.1.2 You Need A Budget (YNAB)
YNAB focuses on zero-based budgeting, encouraging users to give every dollar a job.
*   **Strengths:** Excellent proactive budgeting methodology, strong educational resources.
*   **Weaknesses:** Expensive subscription model, steep learning curve for new users, requires manual discipline.

### 2.1.3 Wallet (BudgetBakers)
Wallet provides bank sync and flexible manual tracking with good visualization.
*   **Strengths:** Good analytics, supports multiple currencies.
*   **Weaknesses:** Premium features required for bank sync, UI can be cluttered.

### 2.1.4 Splitwise
Specifically designed for splitting bills and shared expenses.
*   **Strengths:** Excellent for group expenses, intuitive interface.
*   **Weaknesses:** Not a full PFM (lacks personal budgeting, net worth tracking), limited analytics for individual spending.

## 2.2 Gap Analysis

While existing systems are robust, they often suffer from one or more of the following limitations:

1.  **Manual Entry Friction:** Applications that don't support bank sync (or where bank sync fails) require users to manually input every detail using form-based UIs, which is tedious.
2.  **Lack of Natural Language Support:** Very few apps allow users to just "say" or "type" their expense naturally. Most require selecting category, date, account, etc., via dropdowns.
3.  **Cost:** Premium features like bank sync and advanced analytics often come with monthly subscriptions.
4.  **Privacy:** Free apps often monetize user data or show intrusive ads.

**The Proposed System (PFM)** addresses these gaps by:
*   **Eliminating Form Fatigue:** Using NLP to allow users to log expenses as disjointed text phrases (e.g., "paid 500 for taxi").
*   **Smart Categorization:** Leveraging LLMs (Gemini) to infer categories from context, reducing manual classification effort.
*   **Hybrid Approach:** combining personal expense tracking with simple group-splitting features (like Splitwise) in a single app.
*   **Open Architecture:** Being a self-hosted or local-first capable solution that respects user privacy.
