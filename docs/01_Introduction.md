# CHAPTER 1: INTRODUCTION

## 1.1 Background

In an era of digital payments and complex financial obligations, effective management of personal finances has become a necessity. Individuals often struggle to keep track of their daily expenses, leading to poor financial health and lack of savings. Traditional methods of expense tracking, such as manual ledgers or spreadsheets, are time-consuming and prone to human error. Even mobile applications often require tedious manual entry of date, amount, category, and description for every transaction, leading to user drop-off.

The **Personal Finance Manager (PFM)** is designed to address these challenges by leveraging the power of Artificial Intelligence (AI) and Natural Language Processing (NLP). By allowing users to input expenses in natural language—as if they were texting a friend—the system removes the friction of manual data entry. Integrated with Google's Gemini API, the system intelligently understands the context of the expense, categorizes it automatically, and stores it for analysis. This project aims to democratize financial literacy and ease of management through a modern, user-friendly interface accessible on both web and mobile platforms.

## 1.2 Problem Statement

Despite the availability of numerous financial management tools, several key issues persist:

1.  **High Data Entry Friction:** Users find it cumbersome to manually select categories, dates, and payment modes for every small transaction.
2.  **Lack of Intelligent Categorization:** Most apps rely on rigid, pre-defined rules that fail to understand context (e.g., "coffee with client" might be a business expense, not just "Food").
3.  **Complex Interfaces:** Many financial apps are cluttered with complex charts and features that overwhelm the average user.
4.  **Fragmented Experience:** Users often need separate apps for personal tracking and shared expenses (e.g., splitting bills with roommates).

## 1.3 Objectives

The primary objective of this project is to develop a smart, NLP-powered personal finance management system. The specific objectives are:

1.  **To implement Natural Language Expense Logging:** Enable users to log expenses using simple text commands (e.g., "200 for taxi").
2.  **To automate Expense Categorization:** Utilize Generative AI (Google Gemini) to accurately categorize transactions based on description and context.
3.  **To provide Real-time Analytics:** develop interactive dashboards to visualize spending habits, trends, and budget adherence.
4.  **To support Multi-Group Management:** Facilitate shared expense tracking for families, roommates, or trip groups.
5.  **To ensure Cross-Platform Accessibility:** Deploy the application as a Progressive Web App (PWA) and an Android application.

## 1.4 Scope and Limitations

### 1.4.1 Scope
The scope of the PFM project covers:
*   **User Management:** Secure authentication and profile management.
*   **Expense Tracking:** Adding, editing, and deleting expenses via text or manual input.
*   **AI Integration:** Using Gemini API for parsing and categorization.
*   **Visualization:** Graphical representation of financial data.
*   **Platform:** Web browsers and Android devices.

### 1.4.2 Limitations
*   **Internet Dependency:** The AI features require an active internet connection to communicate with the Gemini API.
*   **Language Support:** Currently, the NLP parser is optimized for English and Hinglish (Hindi-English mix) and may not support other regional languages effectively.
*   **Bank Integration:** The system does not currently support automatic SMS reading or direct bank account syncing due to security and privacy constraints.

## 1.5 Report Organization

This project report is organized into six chapters:
*   **Chapter 1** introduces the project, its background, problem statement, and objectives.
*   **Chapter 2** reviews existing literature and separation systems.
*   **Chapter 3** outlines the system methodology and requirements.
*   **Chapter 4** details the system design, including architecture and UML diagrams.
*   **Chapter 5** describes the implementation details and testing strategies.
*   **Chapter 6** concludes the report with future enhancements.
