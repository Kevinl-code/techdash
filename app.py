import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

import bcrypt
from dotenv import load_dotenv
from email_validator import validate_email, EmailNotValidError
from flask import Flask, jsonify, render_template, request, session, redirect, url_for
from supabase import create_client

from notifier import send_task_notification

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", secrets.token_hex(32))
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=True,
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

MAX_FAILURES = 5
LOCK_MINUTES = 15


def now():
    return datetime.now(timezone.utc)


def clean_email(value):
    return (value or "").strip().lower()


def clean_phone(value):
    return re.sub(r"\D", "", (value or "").strip())


def valid_email(value):
    try:
        return validate_email(value).email
    except EmailNotValidError:
        return None


def get_user_by_id(uid):
    result = supabase.table("users").select("*").eq("id", uid).limit(1).execute()
    return result.data[0] if result.data else None


def current_user():
    uid = session.get("user_id")
    return get_user_by_id(uid) if uid else None


def audit_log(action, user_id=None, metadata=None):
    try:
        supabase.table("audit_logs").insert({
            "action": action,
            "user_id": user_id,
            "metadata": metadata or {},
            "ip": request.headers.get("X-Forwarded-For", request.remote_addr),
        }).execute()
    except Exception:
        pass


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return jsonify({"error": "Authentication required"}), 401
        return fn(*args, **kwargs)
    return wrapper


def head_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user or user.get("role") != "head":
            return jsonify({"error": "Head access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


@app.get("/")
def index():
    return render_template("login.html")


@app.get("/dashboard")
def dashboard():
    if not current_user():
        return redirect(url_for("index"))
    return render_template("dashboard.html")


@app.post("/api/login/head")
def head_login():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or "").strip()
    password = data.get("password") or ""
    mpin = data.get("mpin") or ""

    email = clean_email(identifier)
    phone = clean_phone(identifier)

    result = (
        supabase.table("users")
        .select("*")
        .eq("role", "head")
        .or_(f"email.eq.{email},phone.eq.{phone}")
        .limit(1)
        .execute()
    )
    user = result.data[0] if result.data else None

    if not user:
        audit_log("HEAD_LOGIN_FAILED", metadata={"reason": "invalid_account"})
        return jsonify({"error": "Login failed"}), 401

    locked_until = user.get("locked_until")
    if locked_until:
        try:
            locked_dt = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
            if locked_dt > now():
                return jsonify({"error": "Account temporarily locked"}), 423
        except ValueError:
            pass

    password_ok = bool(user.get("password_hash")) and bcrypt.checkpw(
        password.encode(), user["password_hash"].encode()
    )
    mpin_ok = bool(user.get("mpin_hash")) and bcrypt.checkpw(
        mpin.encode(), user["mpin_hash"].encode()
    )

    if not (password_ok and mpin_ok):
        failures = int(user.get("failed_attempts") or 0) + 1
        update = {"failed_attempts": failures}
        if failures >= MAX_FAILURES:
            update["failed_attempts"] = 0
            update["locked_until"] = (now() + timedelta(minutes=LOCK_MINUTES)).isoformat()

        supabase.table("users").update(update).eq("id", user["id"]).execute()
        audit_log("HEAD_LOGIN_FAILED", user["id"], {"reason": "credential_mismatch"})
        return jsonify({"error": "Login failed"}), 401

    (
        supabase.table("users")
        .update({"failed_attempts": 0, "locked_until": None})
        .eq("id", user["id"])
        .execute()
    )

    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    audit_log("HEAD_LOGIN_SUCCESS", user["id"])
    return jsonify({"ok": True, "role": "head"})


@app.post("/api/login/member")
def member_login():
    data = request.get_json(silent=True) or {}
    email = clean_email(data.get("email"))
    phone = clean_phone(data.get("phone"))
    member_id = (data.get("team_member_id") or "").strip().upper()

    result = (
        supabase.table("users")
        .select("*")
        .eq("role", "member")
        .eq("email", email)
        .eq("phone", phone)
        .eq("team_member_id", member_id)
        .eq("active", True)
        .limit(1)
        .execute()
    )
    user = result.data[0] if result.data else None

    if not user:
        audit_log("MEMBER_LOGIN_FAILED", metadata={"team_member_id": member_id})
        return jsonify({"error": "Login failed"}), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    audit_log("MEMBER_LOGIN_SUCCESS", user["id"])
    return jsonify({"ok": True, "role": "member"})


@app.post("/api/logout")
def logout():
    user = current_user()
    if user:
        audit_log("LOGOUT", user["id"])
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
@login_required
def me():
    user = current_user()
    return jsonify({
        "id": user["id"],
        "name": user["name"],
        "email": user.get("email"),
        "phone": user.get("phone"),
        "role": user["role"],
        "team_member_id": user.get("team_member_id"),
    })


@app.get("/api/resources")
@login_required
def resources():
    return jsonify({
        "whatsapp": os.getenv("WHATSAPP_GROUP_URL", ""),
        "canva": os.getenv("CANVA_URL", ""),
        "folder": os.getenv("TEAM_FOLDER_URL", ""),
    })


@app.get("/api/tasks")
@login_required
def list_tasks():
    user = current_user()
    query = supabase.table("tasks").select("*").order("created_at", desc=True).limit(100)
    if user["role"] != "head":
        query = query.eq("assigned_to", user["id"])
    result = query.execute()
    return jsonify(result.data or [])


@app.post("/api/tasks")
@head_required
def create_task():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    assigned_to = (data.get("assigned_to") or "").strip()
    due_date = (data.get("due_date") or "").strip() or None

    if not title or not assigned_to:
        return jsonify({"error": "Title and assignee are required"}), 400

    member_result = (
        supabase.table("users")
        .select("*")
        .eq("id", assigned_to)
        .eq("role", "member")
        .eq("active", True)
        .limit(1)
        .execute()
    )
    member = member_result.data[0] if member_result.data else None
    if not member:
        return jsonify({"error": "Invalid assignee"}), 400

    user = current_user()
    task = {
        "title": title,
        "description": description,
        "assigned_to": member["id"],
        "assigned_name": member["name"],
        "due_date": due_date,
        "status": "Assigned",
        "created_by": user["id"],
    }

    inserted = supabase.table("tasks").insert(task).execute()
    saved = inserted.data[0]
    audit_log("TASK_CREATED", user["id"], {"task_id": saved["id"]})

    notification = send_task_notification(saved, member)
    return jsonify({"ok": True, "task_id": saved["id"], "notification": notification})


@app.patch("/api/tasks/<task_id>")
@login_required
def update_task(task_id):
    user = current_user()
    status = (request.get_json(silent=True) or {}).get("status")

    if status not in {"Assigned", "In Progress", "Completed"}:
        return jsonify({"error": "Invalid status"}), 400

    result = supabase.table("tasks").select("*").eq("id", task_id).limit(1).execute()
    task = result.data[0] if result.data else None
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if user["role"] != "head" and task["assigned_to"] != user["id"]:
        return jsonify({"error": "Access denied"}), 403

    supabase.table("tasks").update({"status": status}).eq("id", task_id).execute()
    audit_log("TASK_STATUS_UPDATED", user["id"], {"task_id": task_id, "status": status})
    return jsonify({"ok": True})


@app.get("/api/members")
def get_members():

    if session.get("role") != "head":
        return jsonify({"error": "Forbidden"}), 403

    result = (
        supabase
        .table("users")
        .select(
            "id,name,email,phone,team_member_id,active"
        )
        .eq("role", "member")
        .order("team_member_id")
        .execute()
    )

    return jsonify(result.data)
    
@app.post("/api/members")
@head_required
def create_member():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = clean_email(data.get("email"))
    phone = clean_phone(data.get("phone"))
    member_id = (data.get("team_member_id") or "").strip().upper()

    if not all([name, email, phone, member_id]):
        return jsonify({"error": "All member fields are required"}), 400

    email = valid_email(email)
    if not email or not re.fullmatch(r"TM(00[1-9]|01[0-9]|020)", member_id):
        return jsonify({"error": "Invalid member data"}), 400

    try:
        number = int(member_id[2:])
    except ValueError:
        return jsonify({"error": "Invalid TeamMemberId"}), 400

    if not 1 <= number <= 20:
        return jsonify({"error": "Invalid TeamMemberId"}), 400

    existing = (
        supabase.table("users")
        .select("id")
        .or_(f"email.eq.{email},phone.eq.{phone},team_member_id.eq.{member_id}")
        .limit(1)
        .execute()
    )
    if existing.data:
        return jsonify({"error": "Email, mobile number, or TeamMemberId already exists"}), 409

    try:
        supabase.table("users").insert({
            "role": "member",
            "name": name,
            "email": email,
            "phone": phone,
            "team_member_id": member_id,
            "active": True,
        }).execute()
    except Exception:
        return jsonify({"error": "Could not create member"}), 409

    audit_log("MEMBER_CREATED", current_user()["id"], {"team_member_id": member_id})
    return jsonify({"ok": True})


@app.patch("/api/members/<member_id>/status")
@head_required
def member_status(member_id):
    active = bool((request.get_json(silent=True) or {}).get("active"))
    result = (
        supabase.table("users")
        .update({"active": active})
        .eq("id", member_id)
        .eq("role", "member")
        .execute()
    )
    if not result.data:
        return jsonify({"error": "Member not found"}), 404
    audit_log("MEMBER_STATUS_UPDATED", current_user()["id"],
              {"member_id": member_id, "active": active})
    return jsonify({"ok": True})


@app.get("/api/audit")
@head_required
def get_audit():
    result = (
        supabase.table("audit_logs")
        .select("*")
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return jsonify(result.data or [])


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
