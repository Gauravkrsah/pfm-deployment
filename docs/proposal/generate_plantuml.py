import os
import subprocess

# Professional Monochromatic SkinParams for Academic Standards (B&W)
COMMON_STYLE = """
skinparam shadowing false
skinparam monochrome true
skinparam linetype ortho
skinparam PackageStyle rectangle
skinparam roundCorner 0
skinparam nodesep 100
skinparam ranksep 100
skinparam defaultFontSize 14

skinparam class {
    BackgroundColor white
    ArrowColor black
    BorderColor black
}

skinparam component {
    BackgroundColor white
    ArrowColor black
    BorderColor black
}

skinparam sequence {
    ArrowColor black
    LifeLineBorderColor black
    ParticipantBorderColor black
    ParticipantBackgroundColor white
    GroupBodyBackgroundColor transparent
    GroupHeaderFontSize 14
}
"""

def generate_hld():
    """Generates High-Level Design (Section 4.4) in GeeksforGeeks non-container style"""
    uml = f"""
@startuml
{COMMON_STYLE}
hide circle
skinparam linetype ortho

' Presentation Layer (Standalone Boxes)
class "User Interface (React)" as UI << (P,white) >> {{
    + renderDashboard()
    + manageExpenses()
    + handleAIChat()
    + visualizeAnalytics()
}}

class "Analytical Utilities" as Utils << (U,white) >> {{
    + calculateMovingAverage()
    + optimizeBudget()
}}

' Logic Layer (Standalone Boxes)
class "FastAPI Controller" as API << (C,white) >> {{
    + handleWS()
    + routeAIRequests()
    + checkHealth()
}}

class "Hybrid NLP Engine" as NLP << (N,white) >> {{
    + parseExpense()
    + regexMatch()
    + llmFallback()
}}

class "RAG Service" as RAG << (R,white) >> {{
    + queryHistory()
    + smartCategorize()
    + contextAugment()
}}

' Data & External Layer
class "Supabase DB" as DB << (D,white) >> {{
    + storeTransaction()
    + userGroups()
    + persistence()
}}

class "Gemini AI" as LLM << (A,white) >> {{
    + processUnstructured()
    + generativeResponse()
}}

' Layout positioning (Top to Bottom)
UI -[hidden]down- API
API -[hidden]down- DB

' Relationships with Orthogonal Lines
UI -down-> API : 1. AI & NLP Requests
Utils -right-> UI : 4. Analytics

API -down-> NLP : 2a. Parse flow
API -down-> RAG : 2b. Chat flow

NLP -down-> LLM : 2c. AI Fallback
RAG -down-> LLM : 2d. Context Augment
API -down-> DB : 3. Storage

' The Direct Connection (Bold/Marked)
UI -[#black,bold]down-> DB : 5. Direct CRUD (Supabase SDK)

@enduml
"""
    with open("hld.puml", "w") as f:
        f.write(uml)

def generate_sequence():
    """Generates Sequence Diagram with improved spacing and font sizes"""
    uml = f"""
@startuml
{COMMON_STYLE}
scale 1.2

actor User
participant "Mobile UI" as UI
participant "FastAPI" as API
participant "NLP Engine" as NLP
participant "Gemini API" as LLM
database "Supabase" as DB

User -> UI : Input text
UI -> API : POST /parse
activate API
API -> NLP : parse_expense()
activate NLP

NLP -> NLP : Regex Match
alt if pattern fails
    NLP -> LLM : Enhanced AI Parse
    LLM -> NLP : JSON Response
end

NLP -> API : Structured Data
deactivate NLP

API -> UI : Result
deactivate API

UI -> User : Confirm save?
User -> UI : Confirm
UI -> DB : Insert record
DB -> UI : Success
UI -> User : Done
@enduml
"""
    with open("sequence.puml", "w") as f:
        f.write(uml)

def run_plantuml(filename):
    """Runs plantuml.jar to generate PNG"""
    try:
        subprocess.run(["python3", "-m", "plantuml", filename], check=True)
        print(f"Successfully generated {filename.replace('.puml', '.png')}")
    except Exception as e:
        print(f"Error generating {filename}: {e}")

if __name__ == "__main__":
    generate_hld()
    generate_sequence()
    
    # Using local plantuml if available, otherwise assume the pip package is installed
    # The setup below is optimized for the environment.
    for puml in ["hld.puml", "sequence.puml"]:
        try:
            # First try external plantuml command if installed
            subprocess.run(["plantuml", puml], check=False)
        except:
            # Fallback to python module if available
            try:
                subprocess.run(["python3", "-m", "plantuml", puml], check=True)
            except:
                print(f"Could not find a way to run plantuml for {puml}")
