# Chapter 3: System Analysis and Design - Diagram Material

## Diagram Design Standard and Notation Rules

For a Tribhuvan University BCA final project report, system diagrams are
presented mainly in **Chapter 3: System Analysis and Design**. The TU project
guideline places functional requirements through a use case diagram, data
modelling through an ER diagram, and process modelling through DFDs under
system analysis. Architectural design, database schema design, interface
design, and physical DFD are placed under system design.

Because PFM follows an object-oriented implementation approach, UML notation
is used for the behavioural and structural models. Use case diagrams use
actors, system boundaries, oval use cases, associations, and `<<include>>`
dependencies. Class diagrams use named compartments, attributes, operations,
multiplicity, composition, and dependency arrows. Sequence diagrams use
actors, lifelines, activation/message ordering, return messages, and
alternative frames. Activity diagrams use an initial node, actions, decision
nodes, guarded branches, and a final node. If state behaviour is included, a
state diagram uses initial/final nodes, states, transitions, events, and guard
conditions. Component and deployment notation should be used whenever logical
modules or runtime nodes are shown.

The ER diagram represents conceptual data with entity names, identifying
attributes, and cardinalities. The database schema diagram uses the actual
table names used by the implementation and marks primary keys and foreign
keys. A DFD is kept separate from UML: an external entity is a rectangle, a
process is a circle or rounded process symbol, a data store is an open-ended
store/database symbol, and a labelled arrow is a data flow.

All figures should be clean, readable, and limited to implemented behaviour.
Names such as `Expense Record`, `Group Membership`, `NLP Service`, and
`Transaction Store` are used consistently across diagrams. Lines should not
cross unnecessarily, different notations should not be mixed in one figure,
and short explanations should follow each figure.

Under the TU format rules, every figure is center aligned and has a centered
caption below it in **bold 12-point** text, for example **Figure 3.1: Use Case
Diagram of Personal Finance Manager**. The report body uses Times New Roman,
12-point paragraph text; diagram labels should remain clearly readable at the
inserted figure size. Diagrams must be prepared with a CASE or modelling tool
and exported clearly as PNG, SVG, or PDF without stretching.

### Chapter 3 Placement

| Chapter Section | Figure |
| --- | --- |
| 3.1.1 Requirement Analysis | Use Case Diagram |
| 3.1.3 Data Modelling | ER Diagram |
| 3.1.4 Process Modelling | DFD Level 0 context view |
| 3.1 Supplementary Object-Oriented Analysis | Class, Object, Sequence, and Activity Diagrams |
| 3.2.1 Architectural Design | System Architecture Diagram |
| 3.2.2 Database Schema Design | Database Schema Diagram |
| 3.2.3 Interface Design | UI / Interface Structure Diagram |
| 3.2.4 Physical DFD | DFD Level 1 implementation-aware view |
| 3.2 Supplementary Physical Design | Deployment Diagram |

## System Basis Used for the Diagrams

PFM is a React single-page interface usable from a web browser or a Capacitor
Android shell. Authenticated users record expenses, income, and loan entries,
manage shared groups, see analytics, and ask finance questions. The client
uses Supabase Auth and directly reads and writes Supabase PostgreSQL tables.
For natural language parsing and financial chat, it invokes the FastAPI
backend, whose `NLPService`, `RAGService`, and `ExpenseAnalyzer` use NVIDIA NIM
with rule-based fallback processing.

The database entities shown are based on the tables directly referenced in the
source: `expenses`, `profiles`, `groups`, `group_members`, and
`group_invitations`, together with Supabase authentication users. Income and
loan data are not separate implemented tables; they are stored as categorized
records in `expenses`. As the repository does not contain SQL migrations, the
physical field list should be checked against Supabase before binding the
final report.

## 3.1 System Analysis

### 3.1.1 Requirement Analysis

<p align="center">
  <img src="rendered/01_use_case_diagram.svg" alt="Use Case Diagram of Personal Finance Manager" width="92%">
  <br><strong>Figure 3.1: Use Case Diagram of Personal Finance Manager</strong>
</p>

The use case view identifies the registered user and group member roles.
Supabase Auth supports account operations, while NVIDIA NIM supports natural
language parsing and grounded question answering.

### 3.1.3 Data Modelling

<p align="center">
  <img src="rendered/05_er_diagram.svg" alt="ER Diagram of Personal Finance Manager" width="95%">
  <br><strong>Figure 3.2: ER Diagram of Personal Finance Manager</strong>
</p>

The conceptual data model links a user with a profile, financial transaction
records, created groups, memberships, and invitations. A transaction may be a
personal record or may belong to one shared group.

### 3.1.4 Process Modelling

<p align="center">
  <img src="rendered/07_dfd_level_0.svg" alt="DFD Level 0 of Personal Finance Manager" width="90%">
  <br><strong>Figure 3.3: DFD Level 0 of Personal Finance Manager</strong>
</p>

The context DFD treats PFM as one process. A user exchanges account,
transaction, group, analytics, and chat information with the system, which
uses Supabase for persistent information and NVIDIA NIM for AI results.

### 3.1.5 Object-Oriented Behaviour and Structure

<p align="center">
  <img src="rendered/02_class_diagram.svg" alt="Class Diagram of Personal Finance Manager" width="98%">
  <br><strong>Figure 3.4: Class Diagram of Personal Finance Manager</strong>
</p>

The class model shows the core implemented object and service structure:
users create groups and own transaction records, while `NLPService`,
`ExpenseParser`, `RAGService`, and `ExpenseAnalyzer` support parsing and
finance questions. Detailed membership and invitation tables are shown in the
ER and schema diagrams to keep this UML class diagram readable.

<p align="center">
  <img src="rendered/12_object_diagram.svg" alt="Object Diagram of Personal Finance Manager" width="98%">
  <br><strong>Figure 3.5: Object Diagram of Personal Finance Manager</strong>
</p>

The object diagram provides a runtime snapshot of the system, illustrating how specific user instances interact with group and expense records, and how the NLP services are interconnected during execution.

<p align="center">
  <img src="rendered/03_sequence_diagram.svg" alt="Sequence Diagram for Recording a Transaction" width="98%">
  <br><strong>Figure 3.6: Sequence Diagram for Recording a Transaction</strong>
</p>

The sequence shows the implemented natural-language recording workflow. The
FastAPI service first attempts NVIDIA NIM parsing, can fall back to the local
parser, and the client stores a confirmed record directly through Supabase.

<p align="center">
  <img src="rendered/04_activity_diagram.svg" alt="Activity Diagram of PFM" width="98%">
  <br><strong>Figure 3.7: Activity Diagram of PFM</strong>
</p>

The activity diagram shows the authenticated PFM workflow and its principal
activities: managing a shared workspace, recording expense, income, or loan
entries, reviewing analytics, and asking AI finance questions. The recording
branch includes validation, NIM or fallback parsing, optional confirmation, and
persistence in Supabase.

## 3.2 System Design

### 3.2.1 Architectural Design

<p align="center">
  <img src="rendered/09_system_architecture_diagram.svg" alt="System Architecture Diagram of Personal Finance Manager" width="98%">
  <br><strong>Figure 3.8: System Architecture Diagram of Personal Finance Manager</strong>
</p>

The architecture shows the actual split between React/Capacitor clients,
FastAPI AI-processing endpoints deployed through Render, Supabase
authentication and persistence, and NVIDIA NIM.

### 3.2.2 Database Schema Design

<p align="center">
  <img src="rendered/06_database_schema_diagram.svg" alt="Database Schema Diagram of Personal Finance Manager" width="98%">
  <br><strong>Figure 3.9: Database Schema Diagram of Personal Finance Manager</strong>
</p>

The schema diagram uses implemented table and field names. The `expenses`
table holds expense, income, and loan transaction variants, distinguished by
`category` and amount sign.

### 3.2.3 Interface Design

<p align="center">
  <img src="rendered/10_ui_interface_structure_diagram.svg" alt="UI Interface Structure Diagram of Personal Finance Manager" width="96%">
  <br><strong>Figure 3.10: UI / Interface Structure Diagram of Personal Finance Manager</strong>
</p>

The interface structure identifies authentication views and the authenticated
layout, where navigation selects chat, expenses, income, loans, or analytics.
Group selection is shared across the functional screens.

### 3.2.4 Physical DFD

<p align="center">
  <img src="rendered/08_dfd_level_1.svg" alt="DFD Level 1 of Personal Finance Manager" width="96%">
  <br><strong>Figure 3.11: Physical DFD Level 1 of Personal Finance Manager</strong>
</p>

Level 1 decomposes PFM into authentication/profile management, group
management, transaction capture, reporting/analytics, and finance assistant
processes. Its stores correspond to the tables accessed by the application
and its external AI exchange follows the implemented FastAPI path.

### 3.2.5 Supplementary Deployment Design

<p align="center">
  <img src="rendered/11_deployment_diagram.svg" alt="Deployment Diagram of Personal Finance Manager" width="98%">
  <br><strong>Figure 3.12: Deployment Diagram of Personal Finance Manager</strong>
</p>

The deployment diagram places the React bundle in browser and Android
execution environments, the FastAPI artifact in the configured Render web
service, and Supabase and NVIDIA NIM as managed external cloud nodes. The
repository configures the backend deployment but does not identify the web
static-hosting provider.
