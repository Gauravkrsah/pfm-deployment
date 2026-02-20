
<div align="center">

# PERSONAL FINANCE MANAGER (PFM)

<br><br>

**A PROJECT REPORT**

<br>

**SUBMITTED BY**

**[Student Name]**

**TU Registration No.: [Reg. No.]**

**Campus Roll No.: [Roll No.]**

<br><br>

**SUBMITTED TO**

**Department of Computer Science and Information Technology**

**[Campus/College Name]**

**Tribhuvan University**

<br><br>

In partial fulfillment of the requirements for the degree of

**Bachelor of Science in Computer Science and Information Technology (B.Sc. CSIT)**

<br><br>

**[Month, Year]**

</div>

---

<div align="center">

**TRIBHUVAN UNIVERSITY**

**INSTITUTE OF SCIENCE AND TECHNOLOGY**

**[CAMPUS/COLLEGE NAME]**

**DEPARTMENT OF COMPUTER SCIENCE AND INFORMATION TECHNOLOGY**

<br><br>

**SUPERVISOR'S RECOMMENDATION**

</div>

I hereby recommend that this project report prepared by **[Student Name]** entitled "**Personal Finance Manager (PFM)**" be accepted as a partial fulfillment of the requirements for the degree of B.Sc. in Computer Science and Information Technology. In my best knowledge, this is an original work in computer science.

<br><br><br>

................................................

**[Supervisor Name]**

Supervisor

Department of Computer Science and Information Technology

[Campus Name]

[Date]

---

<div align="center">

**TRIBHUVAN UNIVERSITY**

**INSTITUTE OF SCIENCE AND TECHNOLOGY**

**[CAMPUS/COLLEGE NAME]**

**DEPARTMENT OF COMPUTER SCIENCE AND INFORMATION TECHNOLOGY**

<br><br>

**LETTER OF APPROVAL**

</div>

We certify that we have examined this project report entitled "**Personal Finance Manager (PFM)**" submitted by **[Student Name]** and reviewed the candidate's project work. We recommend that the project report be accepted as a partial fulfillment of the requirements for the degree of B.Sc. in Computer Science and Information Technology.

<br><br>

**Evaluation Committee**

<br>

................................................            ................................................

**[Supervisor Name]**                                      **[Head of Department Name]**

Supervisor                                                 Head of Department

<br><br>

................................................

**[External Examiner Name]**

External Examiner

<br>

Date: ................................................

---

<div align="center">

**ACKNOWLEDGEMENT**

</div>

I would like to express my sincere gratitude to my supervisor, **[Supervisor Name]**, for their invaluable guidance, encouragement, and support throughout the course of this project. Their insights and feedback were instrumental in shaping the direction of this work.

I am also grateful to **[Head of Department Name]**, Head of the Department of Computer Science and Information Technology, for providing the necessary facilities and resources.

I would like to thank my friends and family for their unwavering support and motivation during the development of this project.

<br>

**[Student Name]**

[Date]

---

<div align="center">

**ABSTRACT**

</div>

Managing personal finances is a crucial aspect of modern life, yet many individuals struggle with tracking expenses due to the tedious nature of manual entry and categorization. The **Personal Finance Manager (PFM)** is a hybrid mobile and web application designed to simplify expense tracking through the power of Natural Language Processing (NLP) and Artificial Intelligence.

The system allows users to log expenses using natural language phrases (e.g., "spent 500 on lunch"), which are then parsed and categorized automatically by Google's Gemini AI. Built using a robust tech stack comprising **React.js** for the frontend, **FastAPI (Python)** for the backend, **Supabase (PostgreSQL)** for the database, and **Capacitor** for mobile deployment, the application offers a seamless cross-platform experience. Key features include intelligent expense categorization, multi-group management for shared expenses, real-time financial analytics, and a voice-enabled interface. This project demonstrates the effective integration of modern web technologies and Generative AI to solve real-world financial management problems.

<br>

**Keywords:** *Personal Finance, Expense Tracking, Natural Language Processing, Artificial Intelligence, React, FastAPI, Gemini API.*

---

<div align="center">

**TABLE OF CONTENTS**

</div>

1. **Introduction** ............................................................................................ 1
    1.1 Background ........................................................................................ 1
    1.2 Problem Statement ........................................................................... 2
    1.3 Objectives ........................................................................................... 2
    1.4 Scope and Limitations ....................................................................... 3
    1.5 Report Organization .......................................................................... 3

2. **Literature Review** ...................................................................................... 4
    2.1 Existing Systems ................................................................................ 4
    2.2 Gap Analysis ...................................................................................... 5

3. **System Methodology** ................................................................................ 6
    3.1 Software Development Life Cycle (SDLC) ........................................ 6
    3.2 Requirement Analysis ........................................................................ 7
        3.2.1 Functional Requirements ...................................................... 7
        3.2.2 Non-Functional Requirements .............................................. 8
    3.3 Feasibility Study ................................................................................ 9

4. **System Design** ......................................................................................... 10
    4.1 System Architecture .......................................................................... 10
    4.2 Use Case Diagram ............................................................................ 11
    4.3 Class Diagram .................................................................................. 12
    4.4 Sequence Diagram ............................................................................ 13
    4.5 Activity Diagram .............................................................................. 14
    4.6 Database Design (ER Diagram) ....................................................... 15
    4.7 UI/UX Design ................................................................................... 16

5. **Implementation and Testing** .................................................................... 17
    5.1 Tools and Technologies Used ........................................................... 17
    5.2 Implementation Details ..................................................................... 18
    5.3 Testing Strategy ................................................................................ 22
        5.3.1 Unit Testing ........................................................................... 22
        5.3.2 Integration Testing ................................................................ 23

6. **Conclusion and Future Enhancements** .................................................. 24
    6.1 Conclusion ........................................................................................ 24
    6.2 Future Enhancements ....................................................................... 24

**References** .................................................................................................... 25
