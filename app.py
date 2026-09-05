import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

import bcrypt
from dotenv import load_dotenv
from email_validator import EmailNotValidError, validate_email
from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from supabase import create_client

from notifier import send_task_notification


# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv()


# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)

app.secret_key = os.getenv("FLASK_SECRET_KEY", secrets.token_hex(32))

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("APP_ENV", "production").lower() == "production",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)


# =========================================================
# SUPABASE
# =========================================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is missing")

if not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is missing")

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
)


# =========================================================
# SECURITY CONFIG
# =========================================================

MAX_FAILURES = 5
LOCK_MINUTES = 15

VALID_TASK_STATUSES = {
    "Assigned",
    "In Progress",
    "Completed",
}


# =========================================================
# HELPERS
# =========================================================

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


def get_user_by_id(user_id):
    if not user_id:
        return None

    try:
        result = (
            supabase
            .table("users")
            .select("*")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )

        return result.data[0] if result.data else None

    except Exception as exc:
        print("GET USER ERROR:", exc)
        return None


def current_user():
    user_id = session.get("user_id")

    if not user_id:
        return None

    return get_user_by_id(user_id)


def audit_log(action, user_id=None, metadata=None):
    """
    Audit logging must never break the main request.
    """
    try:
        forwarded_for = request.headers.get("X-Forwarded-For")

        ip_address = (
            forwarded_for.split(",")[0].strip()
            if forwarded_for
            else request.remote_addr
        )

        supabase.table("audit_logs").insert({
            "action": action,
            "user_id": user_id,
            "metadata": metadata or {},
            "ip": ip_address,
        }).execute()

    except Exception as exc:
        print("AUDIT LOG ERROR:", exc)


def normalize_member_ids(value):
    """
    Accepts:
        ["uuid1", "uuid2"]
        "uuid1"
        None

    Always returns a clean unique list.
    """
    if value is None:
        return []

    if isinstance(value, str):
        value = [value]

    if not isinstance(value, list):
        return []

    result = []

    for item in value:
        if item is None:
            continue

        item = str(item).strip()

        if item and item not in result:
            result.append(item)

    return result


def get_task_by_id(task_id):
    result = (
        supabase
        .table("tasks")
        .select("*")
        .eq("id", task_id)
        .limit(1)
        .execute()
    )

    return result.data[0] if result.data else None


def get_task_assignments(task_id):
    result = (
        supabase
        .table("task_assignments")
        .select("*")
        .eq("task_id", task_id)
        .order("created_at")
        .execute()
    )

    return result.data or []


def calculate_task_status(assignments):
    """
    Overall task status.

    Priority:
        Completed only if every assignment is completed.
        In Progress if at least one assignment is in progress.
        Otherwise Assigned.
    """
    if not assignments:
        return "Assigned"

    statuses = [
        assignment.get("status", "Assigned")
        for assignment in assignments
    ]

    if all(status == "Completed" for status in statuses):
        return "Completed"

    if any(status == "In Progress" for status in statuses):
        return "In Progress"

    return "Assigned"


def enrich_task(task, assignments):
    """
    Converts database rows into the API structure
    expected by dashboard.js.
    """
    assignment_list = []

    for assignment in assignments:
        assignment_list.append({
            "id": assignment.get("id"),
            "member_id": assignment.get("member_id"),
            "member_name": assignment.get("member_name"),
            "member_email": assignment.get("member_email"),
            "status": assignment.get("status", "Assigned"),
            "notification_sent": assignment.get("notification_sent", False),
            "notification_sent_at": assignment.get("notification_sent_at"),
            "created_at": assignment.get("created_at"),
        })

    status = calculate_task_status(assignment_list)

    return {
        "id": task.get("id"),
        "title": task.get("title"),
        "description": task.get("description"),
        "due_date": task.get("due_date"),
        "status": status,
        "created_by": task.get("created_by"),
        "created_at": task.get("created_at"),

        # New multi-member fields
        "assignments": assignment_list,
        "assigned_members": assignment_list,
        "assigned_count": len(assignment_list),

        # Compatibility fields for older UI pieces
        "assigned_to": (
            assignment_list[0]["member_id"]
            if assignment_list
            else None
        ),
        "assigned_name": (
            assignment_list[0]["member_name"]
            if assignment_list
            else None
        ),
    }


# =========================================================
# AUTH DECORATORS
# =========================================================

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()

        if not user:
            return jsonify({
                "error": "Authentication required"
            }), 401

        return fn(*args, **kwargs)

    return wrapper


def head_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()

        if not user or user.get("role") != "head":
            return jsonify({
                "error": "Head access required"
            }), 403

        return fn(*args, **kwargs)

    return wrapper


# =========================================================
# PAGE ROUTES
# =========================================================

@app.get("/")
def index():
    return render_template("login.html")


@app.get("/dashboard")
def dashboard():
    if not current_user():
        return redirect(url_for("index"))

    return render_template("dashboard.html")


# =========================================================
# HEAD LOGIN
# =========================================================

@app.post("/api/login/head")
def head_login():
    data = request.get_json(silent=True) or {}

    identifier = (data.get("identifier") or "").strip()
    password = data.get("password") or ""
    mpin = data.get("mpin") or ""

    if not identifier or not password or not mpin:
        return jsonify({
            "error": "All login fields are required"
        }), 400

    email = clean_email(identifier)
    phone = clean_phone(identifier)

    try:
        result = (
            supabase
            .table("users")
            .select("*")
            .eq("role", "head")
            .or_(f"email.eq.{email},phone.eq.{phone}")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        print("HEAD LOGIN QUERY ERROR:", exc)
        return jsonify({
            "error": "Login service unavailable"
        }), 500

    user = result.data[0] if result.data else None

    if not user:
        audit_log(
            "HEAD_LOGIN_FAILED",
            metadata={"reason": "invalid_account"}
        )
        return jsonify({
            "error": "Login failed"
        }), 401

    # -----------------------------------------------------
    # ACCOUNT LOCK
    # -----------------------------------------------------

    locked_until = user.get("locked_until")

    if locked_until:
        try:
            locked_dt = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))

            if locked_dt > now():
                return jsonify({
                    "error": "Account temporarily locked"
                }), 423
        except ValueError:
            pass

    # -----------------------------------------------------
    # PASSWORD
    # -----------------------------------------------------

    password_ok = False

    if user.get("password_hash"):
        try:
            password_ok = bcrypt.checkpw(
                password.encode("utf-8"),
                user["password_hash"].encode("utf-8")
            )
        except Exception:
            password_ok = False

    # -----------------------------------------------------
    # MPIN
    # -----------------------------------------------------

    mpin_ok = False

    if user.get("mpin_hash"):
        try:
            mpin_ok = bcrypt.checkpw(
                mpin.encode("utf-8"),
                user["mpin_hash"].encode("utf-8")
            )
        except Exception:
            mpin_ok = False

    # -----------------------------------------------------
    # FAILED LOGIN
    # -----------------------------------------------------

    if not (password_ok and mpin_ok):
        failures = int(user.get("failed_attempts") or 0) + 1
        update = {"failed_attempts": failures}

        if failures >= MAX_FAILURES:
            update["failed_attempts"] = 0
            update["locked_until"] = (now() + timedelta(minutes=LOCK_MINUTES)).isoformat()

        try:
            (
                supabase
                .table("users")
                .update(update)
                .eq("id", user["id"])
                .execute()
            )
        except Exception as exc:
            print("LOGIN FAILURE UPDATE ERROR:", exc)

        audit_log(
            "HEAD_LOGIN_FAILED",
            user["id"],
            {
                "reason": "credential_mismatch",
                "attempt": failures
            }
        )

        return jsonify({
            "error": "Login failed"
        }), 401

    # -----------------------------------------------------
    # SUCCESS
    # -----------------------------------------------------

    (
        supabase
        .table("users")
        .update({
            "failed_attempts": 0,
            "locked_until": None
        })
        .eq("id", user["id"])
        .execute()
    )

    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    session["role"] = user["role"]

    audit_log(
        "HEAD_LOGIN_SUCCESS",
        user["id"]
    )

    return jsonify({
        "ok": True,
        "role": "head"
    })


# =========================================================
# MEMBER LOGIN
# =========================================================

@app.post("/api/login/member")
def member_login():
    data = request.get_json(silent=True) or {}

    email = clean_email(data.get("email"))
    phone = clean_phone(data.get("phone"))
    member_id = (data.get("team_member_id") or "").strip().upper()

    if not email or not phone or not member_id:
        return jsonify({
            "error": "All login fields are required"
        }), 400

    result = (
        supabase
        .table("users")
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
        audit_log(
            "MEMBER_LOGIN_FAILED",
            metadata={"team_member_id": member_id}
        )
        return jsonify({
            "error": "Login failed"
        }), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    session["role"] = user["role"]

    audit_log(
        "MEMBER_LOGIN_SUCCESS",
        user["id"]
    )

    return jsonify({
        "ok": True,
        "role": "member"
    })


# =========================================================
# LOGOUT
# =========================================================

@app.post("/api/logout")
def logout():
    user = current_user()

    if user:
        audit_log("LOGOUT", user["id"])

    session.clear()

    return jsonify({"ok": True})


# =========================================================
# CURRENT USER
# =========================================================

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


# =========================================================
# RESOURCES
# =========================================================

@app.get("/api/resources")
@login_required
def resources():
    return jsonify({
        "whatsapp": os.getenv("WHATSAPP_GROUP_URL", ""),
        "canva": os.getenv("CANVA_URL", ""),
        "folder": os.getenv("TEAM_FOLDER_URL", ""),
    })


# =========================================================
# TASKS - LIST
# =========================================================

@app.get("/api/tasks")
@login_required
def list_tasks():
    user = current_user()

    try:
        # -------------------------------------------------
        # HEAD
        # -------------------------------------------------
        if user["role"] == "head":
            task_result = (
                supabase
                .table("tasks")
                .select("*")
                .order("created_at", desc=True)
                .limit(100)
                .execute()
            )
            task_rows = task_result.data or []

        # -------------------------------------------------
        # MEMBER
        # -------------------------------------------------
        else:
            assignment_result = (
                supabase
                .table("task_assignments")
                .select("task_id")
                .eq("member_id", user["id"])
                .order("created_at", desc=True)
                .limit(100)
                .execute()
            )
            assignment_rows = assignment_result.data or []

            task_ids = [
                row["task_id"]
                for row in assignment_rows
                if row.get("task_id")
            ]

            if not task_ids:
                return jsonify([])

            task_result = (
                supabase
                .table("tasks")
                .select("*")
                .in_("id", task_ids)
                .order("created_at", desc=True)
                .execute()
            )
            task_rows = task_result.data or []

        # -------------------------------------------------
        # ATTACH ASSIGNMENTS
        # -------------------------------------------------
        if not task_rows:
            return jsonify([])

        ids = [task["id"] for task in task_rows]

        assignment_result = (
            supabase
            .table("task_assignments")
            .select("*")
            .in_("task_id", ids)
            .order("created_at")
            .execute()
        )
        assignments = assignment_result.data or []

        grouped = {}

        for assignment in assignments:
            task_id = assignment.get("task_id")
            grouped.setdefault(task_id, []).append(assignment)

        response = []

        for task in task_rows:
            task_assignments = grouped.get(task["id"], [])
            response.append(enrich_task(task, task_assignments))

        return jsonify(response)

    except Exception as exc:
        print("LIST TASKS ERROR:", repr(exc))

        return jsonify({
            "error": "Could not load tasks"
        }), 500


# =========================================================
# TASKS - CREATE MULTI MEMBER
# =========================================================

@app.post("/api/tasks")
@head_required
def create_task():
    data = request.get_json(silent=True) or {}

    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    due_date = (data.get("due_date") or "").strip() or None
    assigned_to = normalize_member_ids(data.get("assigned_to"))

    # -----------------------------------------------------
    # VALIDATION
    # -----------------------------------------------------

    if not title:
        return jsonify({
            "error": "Task title is required"
        }), 400

    if not assigned_to:
        return jsonify({
            "error": "Please select at least one team member"
        }), 400

    if len(title) > 200:
        return jsonify({
            "error": "Task title is too long"
        }), 400

    if len(description) > 5000:
        return jsonify({
            "error": "Task description is too long"
        }), 400

    # -----------------------------------------------------
    # VALIDATE DATE
    # -----------------------------------------------------

    if due_date:
        try:
            datetime.strptime(due_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({
                "error": "Invalid due date"
            }), 400

    # -----------------------------------------------------
    # FETCH ALL SELECTED MEMBERS
    # -----------------------------------------------------

    try:
        member_result = (
            supabase
            .table("users")
            .select("id,name,email,phone,team_member_id,active,role")
            .in_("id", assigned_to)
            .eq("role", "member")
            .eq("active", True)
            .execute()
        )
        members = member_result.data or []

    except Exception as exc:
        print("TASK MEMBER QUERY ERROR:", repr(exc))
        return jsonify({
            "error": "Could not verify selected members"
        }), 500

    # -----------------------------------------------------
    # CHECK ALL IDS WERE VALID
    # -----------------------------------------------------

    found_ids = {member["id"] for member in members}
    invalid_ids = [m_id for m_id in assigned_to if m_id not in found_ids]

    if invalid_ids:
        return jsonify({
            "error": "One or more selected members are invalid or inactive"
        }), 400

    # -----------------------------------------------------
    # CURRENT HEAD
    # -----------------------------------------------------

    user = current_user()

    # -----------------------------------------------------
    # CREATE TASK
    # -----------------------------------------------------

    task_payload = {
        "title": title,
        "description": description,
        "due_date": due_date,
        "status": "Assigned",
        "created_by": user["id"],
    }

    try:
        inserted = (
            supabase
            .table("tasks")
            .insert(task_payload)
            .execute()
        )

        if not inserted.data:
            return jsonify({
                "error": "Task could not be created"
            }), 500

        saved_task = inserted.data[0]

    except Exception as exc:
        print("CREATE TASK ERROR:", repr(exc))
        return jsonify({
            "error": "Task could not be created"
        }), 500

    task_id = saved_task["id"]

    # -----------------------------------------------------
    # CREATE ASSIGNMENT ROWS
    # -----------------------------------------------------

    assignment_payload = []

    for member in members:
        assignment_payload.append({
            "task_id": task_id,
            "member_id": member["id"],
            "member_name": member["name"],
            "member_email": member["email"],
            "status": "Assigned",
            "notification_sent": False,
        })

    try:
        assignment_insert = (
            supabase
            .table("task_assignments")
            .insert(assignment_payload)
            .execute()
        )

        if len(assignment_insert.data or []) != len(members):
            raise RuntimeError("Assignment rows were not created")

    except Exception as exc:
        print("CREATE ASSIGNMENTS ERROR:", repr(exc), flush=True)

        # -------------------------------------------------
        # ROLLBACK TASK
        # -------------------------------------------------
        try:
            (
                supabase
                .table("tasks")
                .delete()
                .eq("id", task_id)
                .execute()
            )
        except Exception as rollback_exc:
            print("TASK ROLLBACK ERROR:", repr(rollback_exc), flush=True)

        return jsonify({
            "error": "Task assignment database error",
            "details": str(exc)
        }), 500

    # -----------------------------------------------------
    # AUDIT
    # -----------------------------------------------------

    audit_log(
        "TASK_CREATED",
        user["id"],
        {
            "task_id": task_id,
            "title": title,
            "member_count": len(members),
            "member_ids": [m["id"] for m in members],
        }
    )

    # -----------------------------------------------------
    # EMAIL NOTIFICATIONS
    # -----------------------------------------------------

    notifications = []

    for member in members:
        try:
            notification = send_task_notification(saved_task, member)
            notification = (
                notification
                if isinstance(notification, dict)
                else {"success": bool(notification)}
            )
        except Exception as exc:
            print("NOTIFICATION ERROR:", repr(exc))
            notification = {
                "success": False,
                "error": "Notification failed"
            }

        notifications.append({
            "member_id": member["id"],
            "email": member["email"],
            **notification,
        })

        # -------------------------------------------------
        # UPDATE ASSIGNMENT NOTIFICATION STATE
        # -------------------------------------------------
        if notification.get("success"):
            try:
                (
                    supabase
                    .table("task_assignments")
                    .update({
                        "notification_sent": True,
                        "notification_sent_at": now().isoformat()
                    })
                    .eq("task_id", task_id)
                    .eq("member_id", member["id"])
                    .execute()
                )
            except Exception as exc:
                print("NOTIFICATION STATUS UPDATE ERROR:", repr(exc))

    # -----------------------------------------------------
    # FINAL RESPONSE
    # -----------------------------------------------------

    successful_notifications = sum(
        1 for n in notifications if n.get("success")
    )

    return jsonify({
        "ok": True,
        "task_id": task_id,
        "assigned_count": len(members),
        "notification_count": successful_notifications,
        "notifications": notifications,
    }), 201


# =========================================================
# TASK - UPDATE STATUS
# =========================================================

@app.patch("/api/tasks/<task_id>")
@login_required
def update_task(task_id):
    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "").strip()

    if status not in VALID_TASK_STATUSES:
        return jsonify({"error": "Invalid status"}), 400

    user = current_user()

    # -----------------------------------------------------
    # CHECK TASK
    # -----------------------------------------------------

    task = get_task_by_id(task_id)

    if not task:
        return jsonify({"error": "Task not found"}), 404

    # -----------------------------------------------------
    # HEAD CAN UPDATE WHOLE TASK
    # -----------------------------------------------------

    if user["role"] == "head":
        try:
            (
                supabase
                .table("tasks")
                .update({"status": status})
                .eq("id", task_id)
                .execute()
            )

            (
                supabase
                .table("task_assignments")
                .update({"status": status})
                .eq("task_id", task_id)
                .execute()
            )
        except Exception as exc:
            print("HEAD TASK UPDATE ERROR:", repr(exc))
            return jsonify({"error": "Could not update task"}), 500

        audit_log(
            "TASK_STATUS_UPDATED",
            user["id"],
            {
                "task_id": task_id,
                "status": status,
                "updated_by": "head",
            }
        )

        return jsonify({"ok": True})

    # -----------------------------------------------------
    # MEMBER CAN ONLY UPDATE THEIR ASSIGNMENT
    # -----------------------------------------------------

    assignment_result = (
        supabase
        .table("task_assignments")
        .select("*")
        .eq("task_id", task_id)
        .eq("member_id", user["id"])
        .limit(1)
        .execute()
    )

    assignment = assignment_result.data[0] if assignment_result.data else None

    if not assignment:
        return jsonify({
            "error": "You are not assigned to this task"
        }), 403

    # -----------------------------------------------------
    # UPDATE ONLY THIS MEMBER
    # -----------------------------------------------------

    try:
        (
            supabase
            .table("task_assignments")
            .update({"status": status})
            .eq("id", assignment["id"])
            .execute()
        )

        # -------------------------------------------------
        # RECALCULATE OVERALL TASK STATUS
        # -------------------------------------------------

        assignments = get_task_assignments(task_id)
        overall_status = calculate_task_status(assignments)

        (
            supabase
            .table("tasks")
            .update({"status": overall_status})
            .eq("id", task_id)
            .execute()
        )

    except Exception as exc:
        print("MEMBER TASK UPDATE ERROR:", repr(exc))
        return jsonify({
            "error": "Could not update task status"
        }), 500

    audit_log(
        "TASK_STATUS_UPDATED",
        user["id"],
        {
            "task_id": task_id,
            "status": status,
            "updated_by": "member",
        }
    )

    return jsonify({
        "ok": True,
        "status": status,
        "overall_status": overall_status
    })


# =========================================================
# MEMBERS - LIST
# =========================================================

@app.get("/api/members")
@head_required
def get_members():
    try:
        result = (
            supabase
            .table("users")
            .select("id,name,email,phone,team_member_id,active")
            .eq("role", "member")
            .order("team_member_id")
            .execute()
        )

        return jsonify(result.data or [])

    except Exception as exc:
        print("GET MEMBERS ERROR:", repr(exc))
        return jsonify({
            "error": "Could not load team members"
        }), 500


# =========================================================
# MEMBERS - CREATE
# =========================================================

@app.post("/api/members")
@head_required
def create_member():
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    email = clean_email(data.get("email"))
    phone = clean_phone(data.get("phone"))
    member_id = (data.get("team_member_id") or "").strip().upper()

    # -----------------------------------------------------
    # REQUIRED
    # -----------------------------------------------------

    if not all([name, email, phone, member_id]):
        return jsonify({
            "error": "All member fields are required"
        }), 400

    # -----------------------------------------------------
    # EMAIL
    # -----------------------------------------------------

    email = valid_email(email)

    if not email:
        return jsonify({
            "error": "Invalid email address"
        }), 400

    # -----------------------------------------------------
    # MEMBER ID
    # -----------------------------------------------------

    if not re.fullmatch(r"TM(00[1-9]|01[0-9]|020)", member_id):
        return jsonify({
            "error": "TeamMemberId must be TM001 to TM020"
        }), 400

    # -----------------------------------------------------
    # DUPLICATE CHECK
    # -----------------------------------------------------

    try:
        existing = (
            supabase
            .table("users")
            .select("id")
            .or_(
                f"email.eq.{email},"
                f"phone.eq.{phone},"
                f"team_member_id.eq.{member_id}"
            )
            .limit(1)
            .execute()
        )
    except Exception as exc:
        print("MEMBER DUPLICATE CHECK ERROR:", repr(exc))
        return jsonify({
            "error": "Could not validate member"
        }), 500

    if existing.data:
        return jsonify({
            "error": "Email, mobile number, or TeamMemberId already exists"
        }), 409

    # -----------------------------------------------------
    # CREATE
    # -----------------------------------------------------

    try:
        result = (
            supabase
            .table("users")
            .insert({
                "role": "member",
                "name": name,
                "email": email,
                "phone": phone,
                "team_member_id": member_id,
                "active": True,
            })
            .execute()
        )
    except Exception as exc:
        print("CREATE MEMBER ERROR:", repr(exc))
        return jsonify({
            "error": "Could not create member"
        }), 500

    if not result.data:
        return jsonify({
            "error": "Member was not created"
        }), 500

    user = current_user()

    audit_log(
        "MEMBER_CREATED",
        user["id"],
        {
            "team_member_id": member_id,
            "email": email,
        }
    )

    return jsonify({
        "ok": True,
        "member": result.data[0]
    }), 201


# =========================================================
# MEMBERS - ENABLE / DISABLE
# =========================================================

@app.patch("/api/members/<member_id>/status")
@head_required
def member_status(member_id):
    data = request.get_json(silent=True) or {}
    active = bool(data.get("active"))

    try:
        result = (
            supabase
            .table("users")
            .update({"active": active})
            .eq("id", member_id)
            .eq("role", "member")
            .execute()
        )
    except Exception as exc:
        print("MEMBER STATUS ERROR:", repr(exc))
        return jsonify({
            "error": "Could not update member"
        }), 500

    if not result.data:
        return jsonify({
            "error": "Member not found"
        }), 404

    user = current_user()

    audit_log(
        "MEMBER_STATUS_UPDATED",
        user["id"],
        {
            "member_id": member_id,
            "active": active
        }
    )

    return jsonify({"ok": True})


# =========================================================
# AUDIT
# =========================================================

@app.get("/api/audit")
@head_required
def get_audit():
    try:
        result = (
            supabase
            .table("audit_logs")
            .select("*")
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )

        return jsonify(result.data or [])

    except Exception as exc:
        print("AUDIT QUERY ERROR:", repr(exc))
        return jsonify({
            "error": "Could not load audit logs"
        }), 500


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "service": "Technical Team Dashboard"
    })


# =========================================================
# ERROR HANDLERS
# =========================================================

@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({
            "error": "API endpoint not found"
        }), 404

    return error


@app.errorhandler(500)
def internal_error(error):
    if request.path.startswith("/api/"):
        return jsonify({
            "error": "Internal server error"
        }), 500

    return error


# =========================================================
# LOCAL DEVELOPMENT
# =========================================================

if __name__ == "__main__":
    app.run(
        debug=True,
        host="127.0.0.1",
        port=5000
    )
