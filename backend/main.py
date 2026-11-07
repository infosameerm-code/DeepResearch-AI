from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import engine, get_db
from models import Base, Research, User
from schemas import SignupRequest, LoginRequest, TokenResponse
from auth import hash_password, verify_password, create_access_token, get_current_user
from ai_service import generate_ai_response, research_topic
from research_engine import conduct_research
from export_service import create_pdf, create_docx
from file_service import extract_file_text


Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="DeepResearch AI",
    description="AI-powered Autonomous Research Assistant",
    version="1.3.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"https?://(localhost|127\\.0\\.0\\.1|10\\.\\d+\\.\\d+\\.\\d+|192\\.168\\.\\d+\\.\\d+|172\\.(1[6-9]|2[0-9]|3[0-1])\\.\\d+\\.\\d+)(:\\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=True)


def authenticate_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    user = get_current_user(credentials.credentials, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token")
    return user


def get_owned_research(research_id: int, user: User, db: Session):
    research = db.query(Research).filter(
        Research.id == research_id,
        Research.user_id == user.id
    ).first()
    if not research:
        # Do not reveal whether another user's report exists.
        raise HTTPException(status_code=404, detail="Research report not found")
    return research


@app.get("/")
def home():
    return {"message": "DeepResearch AI API is running", "version": "1.3.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/auth/signup", response_model=TokenResponse)
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        name=data.name,
        email=data.email,
        hashed_password=hash_password(data.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name,
        "email": user.email
    }


@app.post("/auth/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name,
        "email": user.email
    }


@app.get("/auth/me")
def get_my_profile(current_user: User = Depends(authenticate_user)):
    return {"id": current_user.id, "name": current_user.name, "email": current_user.email}


@app.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(authenticate_user)
):
    try:
        file_content = await file.read()
        extracted_text = extract_file_text(file.filename or "uploaded_file", file_content)
        return {
            "message": "File uploaded and processed successfully",
            "filename": file.filename,
            "extracted_text": extracted_text
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception:
        raise HTTPException(status_code=500, detail="Unable to process the uploaded file")
    finally:
        await file.close()


@app.post("/research")
def create_research(
    query: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticate_user)
):
    research = Research(query=query, user_id=current_user.id)
    db.add(research)
    db.commit()
    db.refresh(research)
    return research


@app.get("/research")
def get_research(
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticate_user)
):
    return db.query(Research).filter(
        Research.user_id == current_user.id
    ).order_by(Research.created_at.desc()).all()


@app.post("/ai")
def ai_research(
    query: str,
    current_user: User = Depends(authenticate_user)
):
    answer = generate_ai_response(f"Research this topic and explain it clearly: {query}")
    return {"query": query, "ai_response": answer}


@app.post("/research/web")
def web_research(
    query: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticate_user)
):
    report = research_topic(query)
    research = Research(
        query=query,
        status="completed",
        report=report,
        user_id=current_user.id
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


@app.post("/research/autonomous")
def autonomous_research(
    query: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticate_user)
):
    result = conduct_research(query)
    if result.get("status") != "completed":
        return result

    research = Research(
        query=query,
        status="completed",
        report=result["report"],
        user_id=current_user.id
    )
    db.add(research)
    db.commit()
    db.refresh(research)
    result["id"] = research.id
    return result


@app.get("/research/{research_id}")
def get_single_research(
    research_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticate_user)
):
    return get_owned_research(research_id, current_user, db)


@app.delete("/research/{research_id}")
def delete_research(
    research_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticate_user)
):
    research = get_owned_research(research_id, current_user, db)
    db.delete(research)
    db.commit()
    return {"message": "Research report deleted successfully", "id": research_id}


@app.get("/research/{research_id}/export/pdf")
def export_research_pdf(
    research_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticate_user)
):
    research = get_owned_research(research_id, current_user, db)
    if not research.report:
        raise HTTPException(status_code=404, detail="No report available to export")

    pdf_file = create_pdf(research.report, f"Research Report - {research.query}")
    return StreamingResponse(
        pdf_file,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="research_{research_id}.pdf"'}
    )


@app.get("/research/{research_id}/export/docx")
def export_research_docx(
    research_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticate_user)
):
    research = get_owned_research(research_id, current_user, db)
    if not research.report:
        raise HTTPException(status_code=404, detail="No report available to export")

    docx_file = create_docx(research.report, f"Research Report - {research.query}")
    return StreamingResponse(
        docx_file,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="research_{research_id}.docx"'}
    )
