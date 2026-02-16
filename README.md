# PFM - Personal Finance Manager

A hybrid mobile application for intelligent expense tracking using natural language processing. Simply type expenses like *"biryani rahul 500"* or *"taxi to airport 1500"* and let AI handle the categorization.

![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20Web-blue)
![React](https://img.shields.io/badge/React-18.2-61dafb)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688)
![License](https://img.shields.io/badge/License-Private-red)

---

## 🚀 Key Features

- **Natural Language Input** — Log expenses in plain English/Hinglish
- **AI-Powered Categorization** — Google Gemini automatically categorizes expenses
- **Smart Chat Interface** — Ask questions like *"How much did I spend on food this month?"*
- **Multi-Group Support** — Manage personal, family, and shared expenses
- **Financial Analytics** — Visual dashboards with expense trends
- **Cross-Platform** — Runs on Android (Capacitor) and Web
- **Dark Mode** — Full theme support
- **Loan Tracking** — Track money lent and borrowed

---

## 📋 Prerequisites

Ensure you have the following installed:

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | v18+ | Frontend runtime |
| **npm** | v9+ | Package manager |
| **Python** | 3.10+ | Backend runtime |
| **Virtual Environment** | - | Python isolation |
| **Android Studio** | Latest | Mobile builds (optional) |

---

## ⚙️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/pfm.git
cd pfm
```

### 2. Install Frontend Dependencies

```bash
npm install
```

### 3. Set Up Python Backend

```bash
# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate  # Linux/macOS
# OR
.\venv\Scripts\activate   # Windows

# Install Python dependencies
pip install -r backend/requirements.txt
```

### 4. Configure Environment Variables

**Frontend** (`.env` in root):
```env
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_API_BASE_URL=http://localhost:8000
```

**Backend** (`backend/.env`):
```env
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
PORT=8000
```

> 💡 Copy from `.env.example` files as templates.

---

## 🏃 Running the Application

### Development (Full Stack)

Run both frontend and backend concurrently:

```bash
npm run dev
```

This starts:
- **Frontend**: `http://localhost:3000`
- **Backend**: `http://localhost:8000`

### Run Separately

```bash
# Frontend only
npm start

# Backend only
npm run start:backend
```

---

## 📱 Building for Android

```bash
# Build production bundle
npm run build

# Sync with Android project
npm run sync:android

# Open in Android Studio
npm run open:android
```

Build the APK/AAB from Android Studio.

---

## 🧪 Running Tests

### NLP Parser Tests

```bash
# Activate venv first
source venv/bin/activate

# Run regex parser tests
python scripts/nlp_tests/repro_nlp.py

# Run LLM integration tests
python scripts/llm_verification/verify_llm_v2.py
```

### Linting & Formatting

```bash
npm run lint     # ESLint
npm run format   # Prettier
```

---

## 📁 Project Structure

```
pfm/
├── src/                      # React frontend source
│   ├── components/           # UI components (18+)
│   ├── context/              # React Context (theme)
│   └── config/               # Frontend configuration
├── backend/                  # FastAPI backend
│   ├── api/                  # REST endpoints
│   ├── services/             # NLP, RAG, Analyzer
│   └── models/               # Pydantic models
├── scripts/                  # Development & testing scripts
│   ├── nlp_tests/            # NLP parsing test scripts
│   ├── llm_verification/     # LLM integration tests
│   └── utilities/            # Model utilities
├── android/                  # Capacitor Android project
├── public/                   # Static assets
└── build/                    # Production build output
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TailwindCSS, Recharts |
| **Mobile** | Capacitor 6 (Android) |
| **Backend** | FastAPI, Uvicorn |
| **AI/NLP** | Google Gemini API |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth |

---

## 📖 Documentation

For detailed architecture and implementation documentation, see [doc.md](./doc.md).

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is proprietary software. All rights reserved.

---

*Built with ❤️ using React, FastAPI, and Google Gemini AI*
