# CHAPTER 4: SYSTEM DESIGN

## 4.1 System Architecture

The system follows a typical **Client-Server Architecture** with a decoupled frontend and backend. The React frontend communicates with the Python (FastAPI) backend via RESTful APIs. The backend handles business logic, communicates with the Google Gemini API for NLP tasks, and interacts with the Supabase PostgreSQL database for data persistence.

```mermaid
graph TD
    User[User] -->|Interacts via Browser/App| Frontend[React Native / Web Frontend]
    Frontend -->|HTTPS/REST API| Backend[FastAPI Backend]
    Backend -->|SQL Queries| DB[(Supabase PostgreSQL)]
    Backend -->|API Calls (Prompt)| Gemini[Google Gemini AI]
    Backend -->|Auth Tokens| Auth[Supabase Auth]
    
    subgraph "External Services"
        Gemini
        Auth
    end
    
    subgraph "Internal Infrastructure"
        Frontend
        Backend
        DB
    end

    style User fill:#fff,stroke:#333,stroke-width:2px
    style Frontend fill:#fff,stroke:#333,stroke-width:2px
    style Backend fill:#fff,stroke:#333,stroke-width:2px
    style DB fill:#fff,stroke:#333,stroke-width:2px
    style Gemini fill:#fff,stroke:#333,stroke-width:2px
    style Auth fill:#fff,stroke:#333,stroke-width:2px
```

## 4.2 Use Case Diagram

The Use Case diagram illustrates the interactions between the primary actor (End User) and the system.

```mermaid
usecaseDiagram
    actor User as "End User"
    
    package "Personal Finance Manager" {
        usecase "Login / Register" as UC1
        usecase "Add Expense (NLP)" as UC2
        usecase "View Dashboard" as UC3
        usecase "Manage Categories" as UC4
        usecase "Generate Reports" as UC5
        usecase "Create Group" as UC6
    }
    
    User --> UC1
    User --> UC2
    User --> UC3
    User --> UC4
    User --> UC5
    User --> UC6

    classDef white fill:#fff,stroke:#333,stroke-width:2px;
    class UC1,UC2,UC3,UC4,UC5,UC6 white;
```

## 4.3 Class Diagram

The Class Diagram depicts the structure of the system's classes, their attributes, and relationships.

```mermaid
classDiagram
    class User {
        +UUID id
        +String email
        +String full_name
        +Date created_at
        +login()
        +register()
    }
    
    class Expense {
        +UUID id
        +Float amount
        +String description
        +Date date
        +String payment_method
        +add_expense()
        +delete_expense()
    }
    
    class Category {
        +UUID id
        +String name
        +String icon
        +String type
    }
    
    class Group {
        +UUID id
        +String name
        +List<User> members
        +add_member()
    }

    User "1" --> "*" Expense : logs
    User "1" --> "*" Group : owns/joins
    Expense "*" --> "1" Category : belongs_to
    Group "1" --> "*" Expense : contains

    style User fill:#fff,stroke:#333,stroke-width:2px
    style Expense fill:#fff,stroke:#333,stroke-width:2px
    style Category fill:#fff,stroke:#333,stroke-width:2px
    style Group fill:#fff,stroke:#333,stroke-width:2px
```

## 4.4 Sequence Diagram

The Sequence Diagram for the "Add Expense" feature shows the flow of messages between objects.

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as Backend API
    participant AI as Gemini AI
    participant DB as Database

    U->>FE: Enters "Taxi to office 500"
    FE->>API: POST /api/expenses/parse
    API->>AI: Prompt: Extract amount, category from "Taxi to office 500"
    AI-->>API: JSON: {amount: 500, category: "Travel"}
    API->>DB: INSERT into expenses
    DB-->>API: Success (ID: 123)
    API-->>FE: HTTP 200 OK (Expense Created)
    FE-->>U: Shows "Expense Added" Notification
```

## 4.5 Activity Diagram

The Activity Diagram illustrates the workflow of adding an expense.

```mermaid
graph TD
    Start((Start)) --> Input[User inputs expense text]
    Input --> Validate{Is text valid?}
    Validate -- No --> Error[Show Error Message]
    Error --> Input
    Validate -- Yes --> CallAPI[Send to Backend]
    CallAPI --> AIProcess[AI Analyzes Text]
    AIProcess --> Extract{Extraction Success?}
    Extract -- No --> Manual[Request Manual Input]
    Extract -- Yes --> Save[Save to Database]
    Save --> Notify[Notify User]
    Notify --> Stop((Stop))

    style Start fill:#fff,stroke:#333,stroke-width:2px
    style Input fill:#fff,stroke:#333,stroke-width:2px
    style Validate fill:#fff,stroke:#333,stroke-width:2px
    style Error fill:#fff,stroke:#333,stroke-width:2px
    style CallAPI fill:#fff,stroke:#333,stroke-width:2px
    style AIProcess fill:#fff,stroke:#333,stroke-width:2px
    style Extract fill:#fff,stroke:#333,stroke-width:2px
    style Manual fill:#fff,stroke:#333,stroke-width:2px
    style Save fill:#fff,stroke:#333,stroke-width:2px
    style Notify fill:#fff,stroke:#333,stroke-width:2px
    style Stop fill:#fff,stroke:#333,stroke-width:2px
```

## 4.6 Database Design (ER Diagram)

The Entity-Relationship (ER) diagram shows the database schema.

```mermaid
erDiagram
    USERS ||--o{ EXPENSES : logs
    USERS ||--o{ GROUPS : belongs_to
    CATEGORIES ||--o{ EXPENSES : classifies
    GROUPS ||--o{ EXPENSES : contains

    USERS {
        uuid id PK
        string email
        string password_hash
        timestamp created_at
    }

    EXPENSES {
        uuid id PK
        uuid user_id FK
        uuid category_id FK
        float amount
        string description
        date transaction_date
    }

    CATEGORIES {
        uuid id PK
        string name
        string type
        string icon
    }

    GROUPS {
        uuid id PK
        string name
        uuid created_by FK
    }
```

## 4.7 UI/UX Design

The user interface was designed with a "Mobile First" approach, ensuring strict adherence to responsive design principles. 
*   **Color Palette:** A clean, minimal color scheme (using TailwindCSS defaults) with distinct colors for income (green) and expense (red).
*   **Typology:** Sans-serif fonts for readability (Inter/Roboto).
*   **Interaction:** Smooth transitions and loading states for AI operations.
