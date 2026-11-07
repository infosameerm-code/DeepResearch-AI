
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    UploadFile,
    File
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import engine, get_db
from models import Base, Research, User
from schemas import SignupRequest, LoginRequest, TokenResponse

from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user
)

from ai_service import generate_ai_response, research_topic
from research_engine import conduct_research
from export_service import create_pdf, create_docx
from file_service import extract_file_text


# CREATE DATABASE TABLES
Base.metadata.create_all(bind=engine)


# FASTAPI APPLICATION
app = FastAPI(
    title="DeepResearch AI",
    description="AI-powered Autonomous Research Assistant",
    version="1.2.0"
)


# CORS CONFIGURATION
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# AUTHENTICATION SECURITY
security = HTTPBearer()


def authenticate_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    user = get_current_user(credentials.credentials, db)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token"
        )

    return user


# HOME
@app.get("/")
def home():
    return {
        "message": "DeepResearch AI API is running",
        "version": "1.2.0"
    }


# HEALTH CHECK
@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


# USER SIGNUP
@app.post("/auth/signup", response_model=TokenResponse)
def signup(
    data: SignupRequest,
    db: Session = Depends(get_db)
):
    existing_user = db.query(User).filter(
        User.email == data.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    user = User(
        name=data.name,
        email=data.email,
        hashed_password=hash_password(data.password)
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name,
        "email": user.email
    }


# USER LOGIN
@app.post("/auth/login", response_model=TokenResponse)
def login(
    data: LoginRequest,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.email == data.email
    ).first()

    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not verify_password(
        data.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    token = create_access_token(user.id)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name,
        "email": user.email
    }


# GET LOGGED-IN USER PROFILE
@app.get("/auth/me")
def get_my_profile(
    current_user: User = Depends(authenticate_user)
):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email
    }


# FILE UPLOAD AND TEXT EXTRACTION
@app.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...)
):
    try:
        file_content = await file.read()

        extracted_text = extract_file_text(
            file.filename or "uploaded_file",
            file_content
        )

        return {
            "message": "File uploaded and processed successfully",
            "filename": file.filename,
            "extracted_text": extracted_text
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to process the uploaded file"
        )

    finally:
        await file.close()


# CREATE RESEARCH
@app.post("/research")
def create_research(
    query: str,
    db: Session = Depends(get_db)
):
    research = Research(query=query)

    db.add(research)
    db.commit()
    db.refresh(research)

    return research


# GET ALL RESEARCH HISTORY
@app.get("/research")
def get_research(
    db: Session = Depends(get_db)
):
    return db.query(Research).order_by(
        Research.created_at.desc()
    ).all()


# BASIC AI RESEARCH
@app.post("/ai")
def ai_research(query: str):
    answer = generate_ai_response(
        f"Research this topic and explain it clearly: {query}"
    )

    return {
        "query": query,
        "ai_response": answer
    }


# WEB RESEARCH
@app.post("/research/web")
def web_research(
    query: str,
    db: Session = Depends(get_db)
):
    report = research_topic(query)

    research = Research(
        query=query,
        status="completed",
        report=report
    )

    db.add(research)
    db.commit()
    db.refresh(research)

    return {
        "id": research.id,
        "query": query,
        "status": research.status,
        "report": report
    }


# AUTONOMOUS RESEARCH
@app.post("/research/autonomous")
def autonomous_research(
    query: str,
    db: Session = Depends(get_db)
):
    result = conduct_research(query)

    if result["status"] != "completed":
        return result

    research = Research(
        query=query,
        status="completed",
        report=result["report"]
    )

    db.add(research)
    db.commit()
    db.refresh(research)

    result["id"] = research.id

    return result


# GET ONE RESEARCH REPORT
@app.get("/research/{research_id}")
def get_single_research(
    research_id: int,
    db: Session = Depends(get_db)
):
    research = db.query(Research).filter(
        Research.id == research_id
    ).first()

    if not research:
        raise HTTPException(
            status_code=404,
            detail="Research report not found"
        )

    return research


# DELETE ONE RESEARCH REPORT
@app.delete("/research/{research_id}")
def delete_research(
    research_id: int,
    db: Session = Depends(get_db)
):
    research = db.query(Research).filter(
        Research.id == research_id
    ).first()

    if not research:
        raise HTTPException(
            status_code=404,
            detail="Research report not found"
        )

    db.delete(research)
    db.commit()

    return {
        "message": "Research report deleted successfully",
        "id": research_id
    }


# EXPORT RESEARCH REPORT AS PDF
@app.get("/research/{research_id}/export/pdf")
def export_research_pdf(
    research_id: int,
    db: Session = Depends(get_db)
):
    research = db.query(Research).filter(
        Research.id == research_id
    ).first()

    if not research:
        raise HTTPException(
            status_code=404,
            detail="Research report not found"
        )

    if not research.report:
        raise HTTPException(
            status_code=404,
            detail="No report available to export"
        )

    pdf_file = create_pdf(
        research.report,
        f"Research Report - {research.query}"
    )

    return StreamingResponse(
        pdf_file,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="research_{research_id}.pdf"'
            )
        }
    )


# EXPORT RESEARCH REPORT AS DOCX
@app.get("/research/{research_id}/export/docx")
def export_research_docx(
    research_id: int,
    db: Session = Depends(get_db)
):
    research = db.query(Research).filter(
        Research.id == research_id
    ).first()

    if not research:
        raise HTTPException(
            status_code=404,
            detail="Research report not found"
        )

    if not research.report:
        raise HTTPException(
            status_code=404,
            detail="No report available to export"
        )

    docx_file = create_docx(
        research.report,
        f"Research Report - {research.query}"
    )

    return StreamingResponse(
        docx_file,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
        headers={
            "Content-Disposition": (
                f'attachment; filename="research_{research_id}.docx"'
            )
        }
    )
