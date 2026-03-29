import os
import subprocess
import urllib.request
import textwrap

plantuml_code = """@startuml
skinparam defaultFontName Times New Roman
skinparam shadowing false
skinparam sequence {
    ArrowColor black
    LifeLineBorderColor black
    LifeLineBackgroundColor white
    ParticipantBorderColor black
    ParticipantBackgroundColor #FFFFFF
    ParticipantFontColor black
}
skinparam database {
    BackgroundColor #FFFFFF
    BorderColor black
    FontColor black
}
skinparam actor {
    BackgroundColor #FFFFFF
    BorderColor black
    FontColor black
}
hide footbox

actor User

participant "React (CPanel)" as FE
participant "FastAPI (Netlify)" as BE
participant "Custom NLP Model" as NLP
participant "Gemini (Fallback)" as LLM
database "Supabase DB" as DB

User -> FE : Inputs raw text \\n "Spent 200 on taxi"
FE -> BE : POST /api/parse_expense \\n {text}
activate BE

BE -> NLP : Parse parameters via custom classifier
activate NLP
NLP --> BE : Returns {amount, category, confidence}
deactivate NLP

alt Low Confidence Score (< 75%)
    BE -> LLM : Request semantic fallback parsing
    activate LLM
    LLM --> BE : Returns extracted parameters
    deactivate LLM
end

BE -> DB : INSERT INTO user_expenses
activate DB
DB --> BE : Insert success
deactivate DB

BE --> FE : 200 OK
deactivate BE

FE --> User : Dashboard Update
@enduml
"""

print("Fetching PlantUML diagram from Kroki...")
req = urllib.request.Request(
    "https://kroki.io/plantuml/png", 
    data=plantuml_code.encode("utf-8"), 
    headers={'Content-Type': 'text/plain'}
)
try:
    with urllib.request.urlopen(req, timeout=10) as response:
        with open("architecture.png", "wb") as f:
            f.write(response.read())
    print("Generated pure B&W UML diagram successfully.")
except Exception as e:
    print(f"Failed to fetch UML from Kroki: {e}")

tex_content = r"""\documentclass[12pt, a4paper]{article}

\usepackage[top=1in, bottom=1in, left=1.25in, right=1in]{geometry}
\usepackage{mathptmx} % Times New Roman
\usepackage{setspace}
\usepackage{titlesec}
\usepackage{graphicx}
\usepackage{caption}
\usepackage{float}
\usepackage{hyperref}
\usepackage{xurl} 
\usepackage{pgfgantt}
\usepackage{tocloft}
\usepackage{parskip} 

% TOC dots for all levels including chapters/sections
\renewcommand{\cftsecleader}{\cftdotfill{\cftdotsep}}

% Page number bottom centered
\usepackage{fancyhdr}
\fancypagestyle{plain}{
  \fancyhf{}
  \renewcommand{\headrulewidth}{0pt}
  \fancyfoot[C]{\thepage}
}
\pagestyle{plain}

% Line spacing globally
\onehalfspacing

% Headings Configuration
\titleformat{\section}{\normalfont\fontsize{16}{19.2}\bfseries\selectfont}{\thesection.}{1em}{}
\titleformat{\subsection}{\normalfont\fontsize{14}{16.8}\bfseries\selectfont}{\thesubsection}{1em}{}
\titleformat{\subsubsection}{\normalfont\fontsize{12}{14.4}\bfseries\selectfont}{\thesubsubsection}{1em}{}

% Captions Configuration
\DeclareCaptionFont{twelvept}{\fontsize{12}{14.4}\selectfont}
\captionsetup[figure]{font={bf, twelvept}, labelsep=colon, justification=centering, position=bottom}
\captionsetup[table]{font={bf, twelvept}, labelsep=colon, justification=centering, position=top}

\begin{document}
\pagenumbering{roman}

% Cover Page (Force tight layout utilizing built-in singlespace wrapper to stop line-height blowups)
\begin{titlepage}
\begin{singlespace}
\begin{center}
\vspace*{0.1cm}
{\fontsize{16}{19.2}\bfseries Kathford International College of Engineering and Management\\}
\vspace{0.2cm}
{\fontsize{14}{16.8}\bfseries Balkumari, Lalitpur, Nepal\\}

\vspace{0.5cm}
\includegraphics[width=4cm]{kathford_logo.jpg}\\

\vspace{0.6cm}
{\fontsize{14}{16.8}\bfseries A\\}
\vspace{0.3cm}
{\fontsize{16}{19.2}\bfseries Project Proposal\\}
\vspace{0.3cm}
{\fontsize{14}{16.8}\bfseries on\\}
\vspace{0.5cm}
{\fontsize{16}{19.2}\bfseries PERSONAL FINANCE MANAGER (PFM)\\}

\vspace{0.8cm}
{\fontsize{14}{16.8}\bfseries Submitted To\\}
\vspace{0.4cm}
{\fontsize{12}{14.4} Department of Information Technology\\}
\vspace{0.2cm}
{\fontsize{12}{14.4} Kathford International College of Engineering and Management\\}

\vspace{1.2cm}
{\fontsize{12}{14.4}\bfseries In partial fulfillment of the requirement for the Bachelor Degree in Computer Application\\}

\vspace{1.2cm}
{\fontsize{14}{16.8}\bfseries Submitted By\\}
\vspace{0.4cm}
{\fontsize{12}{14.4} Gaurav Kr Sah (6-2-456-112-2021)\\}
\vspace{0.2cm}
{\fontsize{12}{14.4} Nirmal Sapkota (6-2-456-123-2021)\\}

\end{center}
\end{singlespace}
\end{titlepage}

\newpage
% Table of Contents
\renewcommand{\contentsname}{\centerline{\fontsize{16}{19.2}\normalfont\bfseries TABLE OF CONTENTS}}
\tableofcontents
\newpage

\pagenumbering{arabic}
\setcounter{page}{1}

\section{Introduction}
Most college students know the frustration of checking their bank balance and wondering where the money went. During the fourth semester, we tried tracking daily expenses in a shared Google spreadsheet. We quit after six days. The issue was not the spreadsheet itself; it was the act of stopping mid-day to open a laptop, navigate to the sheet, and manually fill in a row for every small purchase. That kind of discipline is genuinely hard to sustain.

Existing finance apps do not solve this well. Splitwise, Wallet, and similar tools all share the same problem: they are form-driven. To record a transaction, you still tap through menus, pick categories from a list, and enter numbers manually. The interface is cleaner than a spreadsheet, but the underlying friction is identical. People download these apps with good intentions and abandon them within a few weeks.

The Personal Finance Manager (PFM) takes a different approach. Instead of presenting forms, the system accepts plain text. A user types something like ``paid 500 for lunch'' and the application handles everything else. It finds the amount, figures out the date, assigns a category, and stores the record. The user does nothing except write one sentence.

This project is built as the final year capstone for our Bachelor of Computer Applications degree. That context matters. The T.U. guidelines require a system that goes beyond simple database operations and demonstrates working algorithms written by the students themselves. We take that requirement seriously.

The core of the application is a text classification engine written entirely in Python. We use TF-IDF (Term Frequency-Inverse Document Frequency) vectorization to convert sentences into numerical feature matrices, then run them through a Multinomial Naive Bayes classifier to predict the expense category. This model is trained on a labeled dataset we compiled ourselves and runs fully on our own server. No external plugin handles the classification logic.

For cases where the classifier returns a confidence score below an acceptable threshold (typically below 75 percent), the backend makes a structured request to the Google Gemini API \cite{gemini} to resolve the ambiguous input. This fallback covers unusual input patterns our training data could not anticipate. The distinction matters: Gemini is a safety net, not the primary engine.

On top of the classification module, we implement a linear regression model to generate rolling forecasts of monthly expenditure. This is the kind of algorithm work that makes PFM a genuine analytical tool rather than a form with a database behind it.

\newpage
\section{Problem Statement}
The core problem is not a lack of finance applications. There are plenty. The problem is that none of them stay part of a person's daily routine. Three specific issues drive this:

\begin{itemize}
    \item \textbf{Manual data entry is the breaking point.} Every existing tracker expects the user to explicitly enter amounts, categories, and dates for every purchase. This creates enough friction that most users stop logging transactions after the first few days. The tool that is supposed to solve the problem becomes another thing to maintain.
    \item \textbf{Category rules are too rigid.} Apps that classify transactions use keyword matching or fixed rule sets. A transaction labeled ``team lunch'' gets filed as Food. It probably should be Business. Keyword logic cannot resolve this. A trained probabilistic classifier understands that context matters.
    \item \textbf{Projects limited to CRUD are not analytical.} Many student-built finance trackers implement a database and a form, and call it done. The T.U. project requirement specifically asks for algorithm implementation beyond basic operations \cite{tuguide}. PFM addresses this by building real NLP and forecasting modules that serve as the analytical backbone of the system.
\end{itemize}

\newpage
\section{Objectives}
The specific outcomes we are working toward:
\begin{itemize}
    \item Build a FastAPI \cite{fastapi} server that receives raw text input and runs it through our own NLP pipeline, returning a structured JSON object within three seconds.
    \item Train and deploy a Multinomial Naive Bayes classifier using scikit-learn on our own labeled expense dataset to categorize transactions without relying on any third-party classification API.
    \item Implement a linear regression forecasting module that reads historical expense records from Supabase \cite{supabase} and generates a projected monthly spending estimate.
    \item Integrate Google Gemini \cite{gemini} as a conditional fallback only when classifier confidence falls below the defined threshold.
    \item Build a React \cite{react} dashboard that displays real-time spending summaries, category breakdowns, and forecast graphs, updating automatically on each new entry.

\newpage
\section{Methodology}
\subsection{Requirement Identification}
\subsubsection{Study of Existing System}
We reviewed two widely used personal finance applications: Splitwise and Wallet by Budget Bakers.

Splitwise is designed for group expense management. It handles splitting bills between multiple people cleanly, but it does not function as a personal budgeting tool. There is no monthly trend tracking, no categorized spending breakdown for individual users, and no way to generate forecasts from past records. The application assumes every transaction involves multiple parties, which is not the typical use case for a student managing their own finances.

Wallet offers better analytical charts and budget planning features. However, the data entry process is identical to most competitors: you open a form, fill in the amount, select a category from a dropdown, add a note, and save. The interface is polished, but the workflow still demands the same manual effort that causes high abandonment rates. Premium versions of Wallet offer bank sync features, but those are behind a paywall and unavailable in Nepal for most banking institutions.

Neither application implements any NLP module internally. Both depend entirely on structured user input. Our system directly addresses this gap by processing free-form text and extracting parameters programmatically.

\subsubsection{Literature Review}
Text classification is a well-studied area of natural language processing. Sebastiani (2002) \cite{sebastiani} established the theoretical foundation for using statistical models to assign documents to predefined categories, a technique directly applicable to classifying expense descriptions. The Naive Bayes classifier, particularly the Multinomial variant, has proven effective for short text classification tasks because it handles sparse, high-dimensional feature vectors well.

The TF-IDF weighting scheme converts raw text into numerical vectors that reflect how important a term is to a specific document relative to a broader corpus \cite{manning}. When applied to short expense descriptions, TF-IDF effectively amplifies category-specific terms (e.g., ``fuel'' or ``grocery'') and suppresses generic words like ``spent'' or ``for,'' which appear in nearly every entry.

For the forecasting component, ordinary least squares linear regression provides a straightforward method to model spending over time and project future totals \cite{montgomery}. Given a sequence of daily expense sums, a fitted regression line captures the trend and produces monthly estimates that update as new data accumulates.

The combination of these two modules, a trained classifier for categorization and a regression model for forecasting, produces a system that performs genuine analytical work beyond what any form-driven CRUD application can offer.

\subsubsection{Requirement Analysis}
Functional requirements define what the system must do:
\begin{itemize}
    \item Accept raw text input and extract the transaction amount, category, and description using a custom NLP pipeline.
    \item Authenticate users securely and isolate their data at the database row level.
    \item Store all parsed transactions in a Supabase PostgreSQL table linked to the authenticated user.
    \item Run a linear regression forecast on existing expense records and return projected totals to the frontend.
    \item Fall back to Gemini \cite{gemini} API only when the internal classifier confidence drops below 75 percent.
\end{itemize}

Non-functional requirements define how the system must behave:
\begin{itemize}
    \item The end-to-end processing time from user submission to dashboard refresh must not exceed three seconds under normal network conditions.
    \item The classifier must achieve at least 80 percent accuracy on the validation split of our labeled training dataset before deployment.
    \item The user interface must be responsive and readable on mobile browsers without a dedicated native app installation.
\end{itemize}

\subsection{Feasibility Study}
\subsubsection{Technical Feasibility}
Both team members have experience with Python and React. The NLP pipeline uses scikit-learn, which is a standard Python library for machine learning that we have worked with during the course of our studies. FastAPI \cite{fastapi} provides asynchronous request handling natively, which is necessary for managing the classifier inference and the conditional Gemini fallback call without blocking the main thread.

The most technically demanding component is the training pipeline for the Naive Bayes classifier. We are building this manually: writing the data loading scripts, the TF-IDF vectorizer fitting logic, the train/validation split, and the model persistence file. This is not a call to a managed machine learning API. The trained model file sits on our own server and is loaded into memory when FastAPI starts. We have verified that this approach runs acceptably on low-resource servers.

\subsubsection{Operational Feasibility}
The user interface is a single text input box. Typing a short sentence about a purchase requires no training, no tutorial, and no knowledge of accounting categories. If a user can send a text message, they can use PFM. This makes it genuinely usable for the target audience of students and young working adults.

\subsubsection{Economic Feasibility}
All infrastructure costs are zero during the development and testing phases. The React frontend is hosted on a CPanel server already available to us. The FastAPI backend runs on a Netlify serverless deployment. Supabase \cite{supabase} provides a free PostgreSQL instance with built-in authentication and row-level security.

The Gemini API \cite{gemini} free tier provides enough monthly requests to cover the fallback use case comfortably. Since Gemini is only invoked for low-confidence inputs, and our goal is to minimize those through proper classifier training, the free tier more than covers expected usage. The core NLP and forecasting modules run entirely on our own infrastructure at no additional cost.

\subsection{High Level Design of System}
The system follows a client-server architecture with a clear separation between the user interface layer and the processing backend.

When a user types an expense and submits it, the React application sends the raw text to the FastAPI server over a secure HTTP POST request. The backend first runs a preprocessing step: it strips punctuation, lowercases the text, and tokenizes the sentence into individual terms. The pre-fitted TF-IDF vectorizer then converts this token list into a numerical feature vector.

The feature vector is passed to the Naive Bayes classifier, which returns a predicted category label and a probability score. If the probability score is 75 percent or above, the server accepts the prediction and proceeds. If the score is below that threshold, the server makes a structured request to the Gemini API with a prompt asking it to return only the category name from a fixed list. This gives us a reliable fallback without handing all classification responsibility to an external service.

Once the category is resolved, a regular expression routine extracts the numerical amount from the original string. The resulting record is written to the Supabase ``user\_expenses'' table. The server then queries the last 30 days of records for the authenticated user, fits a simple linear regression line through the daily totals, and returns the slope and forecast values to the frontend for the graph.

\begin{figure}[H]
    \centering
    \includegraphics[width=\textwidth]{architecture.png}
    \caption{Working Mechanism of the Proposed System}
\end{figure}

\newpage
\section{Gantt Chart}
The timeline estimates our specific workloads across eighteen weeks, spanning roughly from March 18 to July 20, 2026. Tasks follow an agile dependency structure to guarantee proper time allocations toward mathematical implementation logic.

\begin{figure}[H]
    \centering
    \begin{ganttchart}[
        x unit=0.55cm,
        y unit title=0.6cm,
        y unit chart=0.6cm,
        vgrid,
        hgrid,
        title label anchor/.style={below=-1.5ex},
        title height=1,
        bar/.style={fill=black!60},
        bar label font=\footnotesize,
        title label font=\footnotesize,
        progress label text={},
        bar height=0.6
      ]{1}{18}
      \gantttitle{Mar}{2} \gantttitle{Apr}{4} \gantttitle{May}{4} \gantttitle{Jun}{4} \gantttitle{Jul}{4} \\
      \gantttitlelist{3,4, 1,2,3,4, 1,2,3,4, 1,2,3,4, 1,2,3,4}{1} \\
      \ganttbar{System Study \& Lit. Review}{1}{3} \\
      \ganttbar{Requirement Gathering}{2}{4} \\
      \ganttbar{Architecture \& DB Design}{4}{6} \\
      \ganttbar{Backend Core Dev (FastAPI)}{6}{10} \\
      \ganttbar{Custom NLP Algorithm Design}{8}{13} \\
      \ganttbar{Frontend Interface (React)}{10}{14} \\
      \ganttbar{System Integration \& Optimization}{13}{15} \\
      \ganttbar{Testing \& Quality Control}{15}{17} \\
      \ganttbar{Final Report \& Defense}{17}{18}
    \end{ganttchart}
    \caption{Project Timeline: March 18 to July 20}
\end{figure}

\newpage
\section{Expected Outcome}
We expect to deliver a working system where a user types an expense sentence and sees their dashboard update within three seconds. The classified category should be correct at least 80 percent of the time without any fallback to the Gemini API.

Beyond the basic tracker, the linear regression module should produce spending trend graphs that are genuinely informative. If a user has been spending more over the past two weeks, the graph should capture that slope and estimate a realistic monthly total.

As a final year project, this system demonstrates specific technical competencies: writing our own text classification pipeline, training and validating a probabilistic model, implementing a forecasting algorithm, and building a complete web application around these modules. These are not things we assembled from plugins. They are things we wrote ourselves, which is exactly what the project guidelines ask for \cite{tuguide}.

If the core system works reliably, there is room to extend the classifier training continuously as more labeled data accumulates, improving its accuracy over time without external dependency.

\newpage
\section{References}

\begin{thebibliography}{99}

\bibitem{fastapi}
Ramirez, S. (n.d.). \textit{FastAPI Documentation.} Retrieved from \url{https://fastapi.tiangolo.com/}

\bibitem{react}
Facebook Inc. (n.d.). \textit{React - A JavaScript library for building user interfaces.} Retrieved from \url{https://react.dev/}

\bibitem{gemini}
Google Cloud. (2024). \textit{Gemini API Overview.} Retrieved from \url{https://ai.google.dev/}

\bibitem{supabase}
Supabase Inc. (n.d.). \textit{Supabase - Open source Firebase alternative with PostgreSQL.} Retrieved from \url{https://supabase.com/docs}

\bibitem{sebastiani}
Sebastiani, F. (2002). Machine learning in automated text categorization. \textit{ACM Computing Surveys}, 34(1), 1--47. \url{https://doi.org/10.1145/505282.505283}

\bibitem{manning}
Manning, C. D., Raghavan, P., \& Schuetze, H. (2008). \textit{Introduction to Information Retrieval.} Cambridge University Press. Retrieved from \url{https://nlp.stanford.edu/IR-book/}

\bibitem{montgomery}
Montgomery, D. C., Peck, E. A., \& Vining, G. G. (2012). \textit{Introduction to Linear Regression Analysis} (5th ed.). Wiley.

\bibitem{tuguide}
Tribhuvan University, Faculty of Humanities and Social Sciences. (2023). \textit{BCA 8th Semester Project Guidelines.} Kathmandu: T.U. Publications.

\end{thebibliography}

\end{document}
"""

with open("proposal.tex", "w") as f:
    f.write(tex_content)

print("Running pdflatex on proposal.tex (Pass 1)...")
result = subprocess.run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "proposal.tex"], capture_output=True, text=True)
if result.returncode == 0:
    print("Pass 1 successful.")
else:
    print("Error compiling LaTeX. Output was:")
    print(result.stdout)
    
print("Running pdflatex on proposal.tex (Pass 2 for TOC)...")
result2 = subprocess.run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "proposal.tex"], capture_output=True, text=True)
if result2.returncode == 0:
    print("PDF TOC generated successfully.")
else:
    print("Error compiling LaTeX. Output was:")
    print(result2.stdout)
