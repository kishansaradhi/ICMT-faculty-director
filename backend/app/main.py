import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine, get_db
from .models import Member


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ORIGINS = "http://127.0.0.1:5500,http://localhost:5500,https://kishansaradhi.github.io"
PUBLIC_FIELDS = {
    "id", "name", "qualification", "designation", "department", "college",
    "collegeAddress", "collegePincode", "pincode", "city", "state", "country",
    "guideship", "researchSupervisor", "expertise", "photo", "linkedin", "orcid", "scholar",
}


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class SyncRequest(BaseModel):
    members: list[dict[str, Any]]


class MemberSubmission(BaseModel):
    member: dict[str, Any]


def read_environment() -> None:
    """Small .env reader so no secret is committed and no extra dependency is required."""
    env_file = BACKEND_ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


read_environment()
origins = [item.strip() for item in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if item.strip()]

app = FastAPI(title="ICMT Faculty Directory API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type", "X-ICMT-Admin-Token"],
)


def clean_member(record: dict[str, Any]) -> dict[str, Any]:
    member_id = str(record.get("id", "")).strip().upper()
    name = str(record.get("name", "")).strip()
    if not member_id or not name:
        raise HTTPException(status_code=422, detail="Every member needs a Member ID and name.")
    normalized = dict(record)
    normalized["id"] = member_id
    normalized["name"] = name
    return normalized


def public_member(member: Member) -> dict[str, Any]:
    # Explicit allow-list: mobile numbers and personal emails stay in SQLite only.
    result = {key: value for key, value in member.data.items() if key in PUBLIC_FIELDS}
    result["id"] = member.id
    result["name"] = member.name
    result["state"] = member.state
    result["designation"] = member.designation
    result["country"] = member.country
    return result


def next_member_id(db: Session) -> str:
    highest = 0
    for member_id, in db.query(Member.id).all():
        digits = "".join(char for char in member_id if char.isdigit())
        highest = max(highest, int(digits or 0))
    return f"ICMT{highest + 1:03d}"


def make_token(email: str) -> str:
    secret = os.getenv("ICMT_SESSION_SECRET", "")
    if not secret:
        raise HTTPException(status_code=500, detail="The server is missing ICMT_SESSION_SECRET.")
    expires = str(int(time.time()) + 8 * 60 * 60)
    payload = f"{email}|{expires}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|{signature}".encode()).decode()


def require_admin(request: Request) -> None:
    token = request.headers.get("X-ICMT-Admin-Token", "")
    secret = os.getenv("ICMT_SESSION_SECRET", "")
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        email, expires, supplied_signature = decoded.rsplit("|", 2)
        payload = f"{email}|{expires}"
        expected_signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        valid = hmac.compare_digest(supplied_signature, expected_signature) and int(expires) > time.time()
    except (ValueError, UnicodeDecodeError):
        valid = False
    if not secret or not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Administrator authentication is required.")


def seed_from_legacy_data() -> int:
    """Import the checked-in member-data.js once, only for an empty database."""
    db = SessionLocal()
    try:
        if db.query(Member).count():
            return 0
        legacy_file = BACKEND_ROOT / "seed" / "member-data.js"
        if not legacy_file.exists():
            # Production receives the already-created SQLite file on its
            # persistent disk. Keep the original private seed out of GitHub.
            return 0
        text = legacy_file.read_text(encoding="utf-8")
        prefix = "window.ICMT_MASTER_DATA = "
        start = text.index(prefix) + len(prefix)
        records = json.loads(text[start:].strip().rstrip(";"))
        for raw in records:
            item = clean_member(raw)
            db.add(Member(
                id=item["id"], name=item["name"], state=str(item.get("state") or ""),
                designation=str(item.get("designation") or ""), country=str(item.get("country") or ""),
                status=str(item.get("status") or "active"), data=item,
            ))
        db.commit()
        return len(records)
    finally:
        db.close()


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    seed_from_legacy_data()


@app.get("/health")
def health(db: Session = Depends(get_db)):
    return {"status": "ok", "members": db.query(Member).count()}


@app.get("/api/members")
def list_members(
    search: str | None = None,
    state_name: str | None = None,
    designation: str | None = None,
    country: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Member).filter(Member.status != "pending")
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(Member.id.ilike(pattern), Member.name.ilike(pattern)))
    if state_name:
        query = query.filter(Member.state == state_name)
    if designation:
        query = query.filter(Member.designation == designation)
    if country:
        query = query.filter(Member.country == country)
    return [public_member(member) for member in query.order_by(Member.name).all()]


@app.get("/api/members/{member_id}")
def get_member(member_id: str, db: Session = Depends(get_db)):
    member = db.get(Member, member_id.upper())
    if not member or member.status == "pending":
        raise HTTPException(status_code=404, detail="Member not found.")
    return public_member(member)


@app.post("/api/auth/login")
def login(credentials: LoginRequest):
    configured_email = os.getenv("ADMIN_EMAIL", "")
    configured_password = os.getenv("ADMIN_PASSWORD", "")
    if not configured_email or not configured_password:
        raise HTTPException(status_code=500, detail="Create backend/.env before enabling admin access.")
    if not (
        hmac.compare_digest(credentials.email.lower(), configured_email.lower())
        and hmac.compare_digest(credentials.password, configured_password)
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"token": make_token(credentials.email), "expiresInSeconds": 28800}


@app.post("/api/member-submissions")
def submit_member(payload: MemberSubmission, db: Session = Depends(get_db)):
    """Store public registrations for administrator review; do not publish them automatically."""
    item = dict(payload.member)
    item["id"] = next_member_id(db)
    item["status"] = "pending"
    item = clean_member(item)
    db.add(Member(
        id=item["id"], name=item["name"], state=str(item.get("state") or ""),
        designation=str(item.get("designation") or ""), country=str(item.get("country") or ""),
        status="pending", data=item,
    ))
    db.commit()
    return {"id": item["id"], "status": "pending"}


@app.get("/api/admin/members", dependencies=[Depends(require_admin)])
def list_admin_members(db: Session = Depends(get_db)):
    return [member.data for member in db.query(Member).order_by(Member.id).all()]


@app.put("/api/admin/members/sync", dependencies=[Depends(require_admin)])
def sync_members(payload: SyncRequest, db: Session = Depends(get_db)):
    incoming: dict[str, dict[str, Any]] = {}
    for raw in payload.members:
        item = clean_member(raw)
        if item["id"] in incoming:
            raise HTTPException(status_code=422, detail=f"Duplicate Member ID: {item['id']}")
        incoming[item["id"]] = item

    for member_id, item in incoming.items():
        db.merge(Member(
            id=member_id, name=item["name"], state=str(item.get("state") or ""),
            designation=str(item.get("designation") or ""), country=str(item.get("country") or ""),
            status=str(item.get("status") or "active"), data=item,
        ))
    if incoming:
        db.query(Member).filter(Member.id.not_in(incoming)).delete(synchronize_session=False)
    else:
        db.query(Member).delete()
    db.commit()
    return {"saved": len(incoming)}
