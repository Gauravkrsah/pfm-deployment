# CHAPTER 3: SYSTEM METHODOLOGY

## 3.1 Software Development Life Cycle (SDLC)

For the development of the Personal Finance Manager, the **Agile Methodology** was adopted. Agile is an iterative approach to project management and software development that helps teams deliver value to their customers faster and with fewer headaches.

The development process involved the following phases:
1.  **Planning:** Defining the scope, objectives, and initial backlog of features (e.g., basic expense logging).
2.  **Design:** Creating high-level architecture, database schema, and UI mockups.
3.  **Development (Sprints):**
    *   *Sprint 1:* Setup React frontend and FastAPI backend.
    *   *Sprint 2:* Implement Supabase authentication and database.
    *   *Sprint 3:* Integrate Gemini API for NLP parsing.
    *   *Sprint 4:* Build dashboards and deploy to Android via Capacitor.
4.  **Testing:** Continuous unit testing and integration testing during each sprint.
5.  **Deployment:** Deploying the web version and generating the Android APK.

## 3.2 Requirement Analysis

### 3.2.1 Functional Requirements
Functional requirements define the specific behaviors and functions of the system.
1.  **User Authentication:** Users must be able to sign up, log in, and manage their profiles securely.
2.  **Expense Logging:** The system must allow users to input expenses via text command.
3.  **AI Parsing:** The system must accurately extract amount, category, and description from the input text.
4.  **Dashboard:** Users must see a summary of expenses, category-wise breakdown, and monthly trends.
5.  **Group Management:** Users should be able to create groups and add other users for shared expenses.
6.  **Editing/Deleting:** Users must be able to modify or remove incorrect entries.

### 3.2.2 Non-Functional Requirements
1.  **Performance:** The system should process NLP queries within 3 seconds.
2.  **Scalability:** The database should handle thousands of transactions without significant latency.
3.  **Availability:** The application should be available 99.9% of the time.
4.  **Security:** User data must be encrypted in transit and at rest; API keys must be secured.
5.  **Usability:** The interface should be intuitive and responsive on mobile devices.

## 3.3 Feasibility Study

### 3.3.1 Technical Feasibility
The project utilizes established technologies: React for frontend, Python (FastAPI) for backend, and Supabase for database. The integration of Google's Gemini API is well-documented and supported via official SDKs. Thus, the project is technically feasible.

### 3.3.2 Operational Feasibility
The application is designed to be user-friendly, requiring no special training. The natural language input mimics daily communication (messaging), making it highly adoptable for users of all ages.

### 3.3.3 Economic Feasibility
The development relies on open-source tools (React, FastAPI) and free-tier services (Supabase, Gemini API free tier). The cost of development is primarily time and effort, making it economically viable for a student project or startup MVP.
