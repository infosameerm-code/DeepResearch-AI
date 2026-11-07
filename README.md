# DeepResearch AI

**An AI-powered autonomous internet research assistant that turns a research question into a structured report backed by web sources.**

DeepResearch AI is a full-stack research workspace built with **Next.js**, **FastAPI**, **Ollama**, and **Tavily Search**. Users can ask a question, let the research engine break it into focused subtopics, collect relevant web sources, and generate a consolidated report. Users can also upload documents for text extraction and use their workspace to revisit and export completed research.

> **Project status:** Active development / deployment preparation. The current repository is configured for local development. Public production deployment still requires a hosted AI inference endpoint, a persistent production database, production environment variables, and deployment-specific CORS configuration.

## Highlights

- **Autonomous research workflow** — expands a topic into subtopics, searches the web, gathers source material, and prepares a combined report.
- **Web-backed research** — uses Tavily Search to retrieve relevant web results and source URLs.
- **Local AI inference** — uses Ollama with the `qwen3:8b` model by default.
- **Document analysis input** — accepts PDF, DOCX, and TXT files (up to 10 MB) and extracts readable text to include as research context.
- **Research workspace** — dashboard, research history, saved-report view, and workspace appearance settings.
- **Report exports** — download completed reports as PDF or DOCX.
- **User accounts** — email/password signup and login with JWT bearer tokens.
- **User-scoped research data** — authenticated research endpoints associate new reports with the signed-in user and restrict report access by ownership.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend API | Python, FastAPI |
| Database / ORM | SQLite for current local setup, SQLAlchemy |
| Authentication | JWT, Passlib, bcrypt |
| AI inference | Ollama (`qwen3:8b` by default) |
| Web search | Tavily Search API |
| Document processing | PyMuPDF, python-docx |
| Report generation | ReportLab, python-docx |

## How It Works

1. A user enters a research question in the web app.
2. The backend research engine creates focused subtopics for the question.
3. Tavily Search retrieves web results for those subtopics.
4. The AI model analyses the collected material and writes a consolidated report.
5. The app displays the report and its sources.
6. The signed-in user can revisit, delete, or export their own saved reports.

For document-assisted research, the app extracts text from an uploaded PDF, DOCX, or TXT file and adds that text to the research prompt.

## Project Structure

```text
DeepResearch-AI/
├── backend/
│   ├── main.py
│   ├── auth.py
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── ai_service.py
│   ├── research_engine.py
│   ├── file_service.py
│   └── export_service.py
├── frontend/
│   └── src/
│       └── app/
│           ├── page.tsx
│           ├── login/
│           └── signup/
├── shared/
├── .env.example
└── README.md
```

## Run Locally

### Prerequisites

- Python 3.10 or newer
- Node.js and npm
- Git
- Ollama installed and running
- A Tavily API key

### 1. Clone the repository

```bash
git clone https://github.com/infosameerm-code/DeepResearch-AI.git
cd DeepResearch-AI
```

### 2. Configure the backend

Open a terminal in the project root:

```bash
cd backend
python -m venv venv
```

Activate the virtual environment:

**Windows PowerShell**
```powershell
.\\venv\\Scripts\\Activate.ps1
```

**macOS / Linux**
```bash
source venv/bin/activate
```

Install the backend packages used by the project:

```bash
python -m pip install fastapi uvicorn sqlalchemy python-jose[cryptography] passlib[bcrypt] bcrypt==4.0.1 python-multipart email-validator python-dotenv requests pymupdf python-docx reportlab
```

Create a `.env` file in the `backend` directory:

```env
TAVILY_API_KEY=your_tavily_api_key
SECRET_KEY=replace_with_a_long_random_secret
```

Keep real API keys and secrets private. Never commit your `.env` file.

### 3. Start Ollama

Install/pull the configured model if it is not already available:

```bash
ollama pull qwen3:8b
ollama serve
```

The backend currently calls Ollama at `http://localhost:11434`.

### 4. Start the backend API

From the `backend` directory, with the virtual environment active:

```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

API root: http://127.0.0.1:8000  
Interactive API documentation: http://127.0.0.1:8000/docs

### 5. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## Environment Variables

| Variable | Used by | Description |
| --- | --- | --- |
| `TAVILY_API_KEY` | Backend | API key for Tavily web search |
| `SECRET_KEY` | Backend | Secret used to sign JWT access tokens |

The current AI service uses a local Ollama URL and a configured model name in `backend/ai_service.py`. The frontend currently uses a local backend URL in its app code. These settings must be made configurable for hosted deployment.

## API Overview

| Endpoint | Purpose | Authentication |
| --- | --- | --- |
| `GET /` | API status | Public |
| `GET /health` | Health check | Public |
| `POST /auth/signup` | Create an account | Public |
| `POST /auth/login` | Sign in | Public |
| `GET /auth/me` | Current user profile | Required |
| `POST /files/upload` | Extract text from a document | Required |
| `POST /research/autonomous` | Run autonomous research | Required |
| `POST /research/web` | Run basic web research | Required |
| `GET /research` | List the current user's research | Required |
| `GET /research/{id}` | Open an owned report | Required |
| `DELETE /research/{id}` | Delete an owned report | Required |
| `GET /research/{id}/export/pdf` | Export an owned report as PDF | Required |
| `GET /research/{id}/export/docx` | Export an owned report as DOCX | Required |

Send the JWT access token in the request header:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## Security Notes

- Passwords are hashed before storage.
- Protected endpoints require a valid JWT bearer token.
- Research history and report operations are scoped to the authenticated user.
- Keep `SECRET_KEY` strong, private, and different between environments.
- Configure CORS to allow only the actual frontend domain before production.
- Use HTTPS and a managed persistent database for a public deployment.
- Review upload size handling, rate limits, monitoring, backups, and account recovery before production use.

## Deployment Notes

The current local configuration is not a one-click production deployment:

- **Frontend:** can be hosted on Vercel after configuring the production API URL.
- **Backend:** can be hosted on Render or another Python host after configuring the start command, port binding, CORS, and environment variables.
- **Database:** replace local SQLite with managed PostgreSQL for reliable hosted persistence.
- **AI inference:** the current Ollama address points to the developer's own machine. A hosted backend cannot reach that local address; configure a reachable hosted inference service or a properly hosted Ollama server.

Do not publish API keys, JWT secrets, database credentials, or private user data.

## Contributing

Issues, bug reports, and improvement suggestions are welcome. For substantial changes, open an issue first to discuss the proposed approach.

## License

No license has been added yet. Unless a license is included in this repository, reuse and redistribution are not automatically permitted.

---

**Built as an ongoing project to make multi-source AI research easier to run, review, and organize.**
