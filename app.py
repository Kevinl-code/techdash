import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

import bcrypt
from dotenv import load_dotenv
from email_validator import validate_email, EmailNotValidError
from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    session,
    redirect,
    url_for,
)

from supabase import create_client

from notifier import send_task_notification


# =========================================================
# CONFIGURATION
# =========================================================

load_dotenv()

app = Flask(__name__)

app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    secrets.token_hex(32)
)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=(
        os.getenv("APP_ENV", "production") == "production"
    ),
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)


# =========================================================
# SECURITY SETTINGS
# =========================================================

MAX_FAILURES = 5
LOCK_MINUTES = 15

VALID_TASK_STATUSES = {
    "Assigned",
    "In Progress",
    "Completed",
}


# =========================================================
# BASIC HELPERS
# =========================================================

def now():
    return datetime.now(timezone.utc)


def clean_email(value):
    return (value or "").strip().lower()


def clean_phone(value):
    return re.sub(
        r"\D",
        "",
        (value or "").strip()
    )


def valid_email(value):
    try:
        return validate_email(value).email
    except EmailNotValidError:
        return None


# =========================================================
# DATABASE HELPERS
# =========================================================

def get_user_by_id(uid):
    if not uid:
        return None

    try:
        result = (
            supabase
            .table("users")
            .select("*")
            .eq("id", uid)
            .limit(1)
            .execute()
        )

        return result.data[0] if result.data else None

    except Exception as exc:
        print("GET USER ERROR:", exc)
        return None


def current_user():
    uid = session.get("user_id")

    if not uid:
        return None

    return get_user_by_id(uid)


# =========================================================
# AUDIT LOG
# =========================================================

def audit_log(action, user_id=None, metadata=None):
    try:
        ip = request.headers.get(
            "X-Forwarded-For",
            request.remote_addr
        )

        if ip and "," in ip:
            ip = ip.split(",")[0].strip()

        supabase.table("audit_logs").insert({
            "action": action,
            "user_id": user_id,
            "metadata": metadata or {},
            "ip": ip,
        }).execute()

    except Exception as exc:
        print("AUDIT LOG ERROR:", exc)


# =========================================================
# AUTH DECORATORS
# =========================================================

def login_required(fn):

    @wraps(fn)
    def wrapper(*args, **kwargs):

        if not current_user():
            return jsonify({
                "error": "Authentication required"
            }), 401

        return fn(*args, **kwargs)

    return wrapper


def head_required(fn):

    @wraps(fn)
    def wrapper(*args, **kwargs):

        user = current_user()

        if not user:
            return jsonify({
                "error": "Authentication required"
            }), 401

        if user.get("role") != "head":
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

    identifier = (
        data.get("identifier") or ""
    ).strip()

    password = data.get("password") or ""
    mpin = data.get("mpin") or ""

    email = clean_email(identifier)
    phone = clean_phone(identifier)

    try:

        result = (
            supabase
            .table("users")
            .select("*")
            .eq("role", "head")
            .or_(
                f"email.eq.{email},phone.eq.{phone}"
            )
            .limit(1)
            .execute()
        )

        user = (
            result.data[0]
            if result.data
            else None
        )

    except Exception as exc:

        print("HEAD LOGIN LOOKUP ERROR:", exc)

        return jsonify({
            "error": "Login service unavailable"
        }), 500


    if not user:

        audit_log(
            "HEAD_LOGIN_FAILED",
            metadata={
                "reason": "invalid_account"
            }
        )

        return jsonify({
            "error": "Login failed"
        }), 401


    # -----------------------------------------------------
    # ACCOUNT LOCK CHECK
    # -----------------------------------------------------

    locked_until = user.get("locked_until")

    if locked_until:

        try:

            locked_dt = datetime.fromisoformat(
                locked_until.replace("Z", "+00:00")
            )

            if locked_dt > now():

                return jsonify({
                    "error": "Account temporarily locked"
                }), 423

        except ValueError:
            pass


    # -----------------------------------------------------
    # PASSWORD + MPIN
    # -----------------------------------------------------

    try:

        password_ok = (
            bool(user.get("password_hash"))
            and bcrypt.checkpw(
                password.encode(),
                user["password_hash"].encode()
            )
        )

        mpin_ok = (
            bool(user.get("mpin_hash"))
            and bcrypt.checkpw(
                mpin.encode(),
                user["mpin_hash"].encode()
            )
        )

    except Exception as exc:

        print("PASSWORD CHECK ERROR:", exc)

        return jsonify({
            "error": "Login failed"
        }), 401


    if not (password_ok and mpin_ok):

        failures = int(
            user.get("failed_attempts") or 0
        ) + 1

        update = {
            "failed_attempts": failures
        }

        if failures >= MAX_FAILURES:

            update["failed_attempts"] = 0

            update["locked_until"] = (
                now()
                + timedelta(minutes=LOCK_MINUTES)
            ).isoformat()

        supabase.table("users").update(
            update
        ).eq(
            "id",
            user["id"]
        ).execute()

        audit_log(
            "HEAD_LOGIN_FAILED",
            user["id"],
            {
                "reason": "credential_mismatch"
            }
        )

        return jsonify({
            "error": "Login failed"
        }), 401


    # -----------------------------------------------------
    # SUCCESS
    # -----------------------------------------------------

    supabase.table("users").update({
        "failed_attempts": 0,
        "locked_until": None
    }).eq(
        "id",
        user["id"]
    ).execute()


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

    email = clean_email(
        data.get("email")
    )

    phone = clean_phone(
        data.get("phone")
    )

    member_id = (
        data.get("team_member_id") or ""
    ).strip().upper()


    try:

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

        user = (
            result.data[0]
            if result.data
            else None
        )

    except Exception as exc:

        print("MEMBER LOGIN ERROR:", exc)

        return jsonify({
            "error": "Login service unavailable"
        }), 500


    if not user:

        audit_log(
            "MEMBER_LOGIN_FAILED",
            metadata={
                "team_member_id": member_id
            }
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

        audit_log(
            "LOGOUT",
            user["id"]
        )

    session.clear()

    return jsonify({
        "ok": True
    })


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
# SHARED RESOURCES
# =========================================================

@app.get("/api/resources")
@login_required
def resources():

    return jsonify({
        "whatsapp": os.getenv(
            "WHATSAPP_GROUP_URL",
            ""
        ),

        "canva": os.getenv(
            "CANVA_URL",
            ""
        ),

        "folder": os.getenv(
            "TEAM_FOLDER_URL",
            ""
        ),
    })


# =========================================================
# TASK HELPERS
# =========================================================

def normalize_assignee_ids(value):

    if value is None:
        return []

    if isinstance(value, str):
        value = [value]

    if not isinstance(value, list):
        return []

    cleaned = []

    for item in value:

        item = str(item).strip()

        if item and item not in cleaned:
            cleaned.append(item)

    return cleaned


def calculate_overall_status(assignments):

    if not assignments:
        return "Assigned"

    statuses = [
        item.get("status", "Assigned")
        for item in assignments
    ]

    if all(
        status == "Completed"
        for status in statuses
    ):
        return "Completed"

    if any(
        status == "In Progress"
        for status in statuses
    ):
        return "In Progress"

    return "Assigned"


def get_task_assignments(task_ids):

    if not task_ids:
        return []

    result = (
        supabase
        .table("task_assignments")
        .select(
            "id,task_id,member_id,"
            "member_name,member_email,"
            "status,notification_sent,"
            "notification_sent_at,created_at"
        )
        .in_("task_id", task_ids)
        .order("created_at")
        .execute()
    )

    return result.data or []


def attach_assignments(tasks_data):

    if not tasks_data:
        return []

    task_ids = [
        task["id"]
        for task in tasks_data
    ]

    assignments = get_task_assignments(
        task_ids
    )

    grouped = {}

    for assignment in assignments:

        grouped.setdefault(
            assignment["task_id"],
            []
        ).append(assignment)


    output = []

    for task in tasks_data:

        task_copy = dict(task)

        task_assignments = grouped.get(
            task["id"],
            []
        )

        task_copy["assignments"] = (
            task_assignments
        )

        task_copy["assignee_count"] = (
            len(task_assignments)
        )

        task_copy["assigned_members"] = [
            {
                "id": x["member_id"],
                "name": x["member_name"],
                "email": x["member_email"],
                "status": x["status"],
            }
            for x in task_assignments
        ]

        task_copy["status"] = (
            calculate_overall_status(
                task_assignments
            )
        )

        if task_assignments:

            task_copy["assigned_name"] = ", ".join(
                x["member_name"]
                for x in task_assignments
            )

        else:

            task_copy["assigned_name"] = "—"


        output.append(task_copy)

    return output


# =========================================================
# GET TASKS
# =========================================================

@app.get("/api/tasks")
@login_required
def list_tasks():

    user = current_user()

    try:

        # -------------------------------------------------
        # HEAD → ALL TASKS
        # -------------------------------------------------

        if user["role"] == "head":

            result = (
                supabase
                .table("tasks")
                .select("*")
                .order(
                    "created_at",
                    desc=True
                )
                .limit(100)
                .execute()
            )

            tasks_data = result.data or []

            return jsonify(
                attach_assignments(tasks_data)
            )


        # -------------------------------------------------
        # MEMBER → ONLY ASSIGNED TASKS
        # -------------------------------------------------

        assignment_result = (
            supabase
            .table("task_assignments")
            .select("task_id")
            .eq(
                "member_id",
                user["id"]
            )
            .execute()
        )

        task_ids = list({
            row["task_id"]
            for row in (
                assignment_result.data or []
            )
        })


        if not task_ids:
            return jsonify([])


        result = (
            supabase
            .table("tasks")
            .select("*")
            .in_(
                "id",
                task_ids
            )
            .order(
                "created_at",
                desc=True
            )
            .limit(100)
            .execute()
        )

        tasks_data = result.data or []

        output = attach_assignments(
            tasks_data
        )


        # -------------------------------------------------
        # For members, expose THEIR assignment status
        # -------------------------------------------------

        for task in output:

            my_assignment = next(
                (
                    x
                    for x in task["assignments"]
                    if x["member_id"] == user["id"]
                ),
                None
            )

            if my_assignment:

                task["status"] = (
                    my_assignment["status"]
                )

                task["my_assignment"] = (
                    my_assignment
                )

        return jsonify(output)


    except Exception as exc:

        print("LIST TASKS ERROR:", exc)

        return jsonify({
            "error": "Unable to load tasks"
        }), 500


# =========================================================
# CREATE MULTI-MEMBER TASK
# =========================================================

@app.post("/api/tasks")
@head_required
def create_task():

    data = request.get_json(
        silent=True
    ) or {}


    title = (
        data.get("title") or ""
    ).strip()

    description = (
        data.get("description") or ""
    ).strip()

    due_date = (
        data.get("due_date") or ""
    ).strip() or None


    # -----------------------------------------------------
    # IMPORTANT:
    # Frontend sends:
    #
    # assigned_to: ["uuid1", "uuid2", "uuid3"]
    # -----------------------------------------------------

    assigned_to = normalize_assignee_ids(
        data.get("assigned_to")
    )


    if not title:

        return jsonify({
            "error": "Task title is required"
        }), 400


    if not assigned_to:

        return jsonify({
            "error": "Please select at least one team member"
        }), 400


    if len(assigned_to) > 20:

        return jsonify({
            "error": "A maximum of 20 members can be assigned"
        }), 400


    user = current_user()


    try:

        # -------------------------------------------------
        # VALIDATE ALL MEMBERS IN ONE QUERY
        # -------------------------------------------------

        member_result = (
            supabase
            .table("users")
            .select(
                "id,name,email,phone,"
                "team_member_id,active,role"
            )
            .in_(
                "id",
                assigned_to
            )
            .eq(
                "role",
                "member"
            )
            .eq(
                "active",
                True
            )
            .execute()
        )

        members = member_result.data or []


        member_map = {
            member["id"]: member
            for member in members
        }


        # -------------------------------------------------
        # EVERY SELECTED ID MUST BE A VALID ACTIVE MEMBER
        # -------------------------------------------------

        missing_ids = [
            member_id
            for member_id in assigned_to
            if member_id not in member_map
        ]


        if missing_ids:

            return jsonify({
                "error": (
                    "One or more selected members "
                    "are invalid or inactive"
                )
            }), 400


        # -------------------------------------------------
        # CREATE MAIN TASK
        # -------------------------------------------------

        task_payload = {
            "title": title,
            "description": description,
            "due_date": due_date,
            "status": "Assigned",
            "created_by": user["id"],
        }


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
        task_id = saved_task["id"]


        # -------------------------------------------------
        # CREATE ASSIGNMENTS
        # -------------------------------------------------

        assignment_rows = []

        for member_id in assigned_to:

            member = member_map[member_id]

            assignment_rows.append({
                "task_id": task_id,
                "member_id": member["id"],
                "member_name": member["name"],
                "member_email": member["email"],
                "status": "Assigned",
                "notification_sent": False,
            })


        try:

            assignment_result = (
                supabase
                .table("task_assignments")
                .insert(assignment_rows)
                .execute()
            )

            if not assignment_result.data:

                raise RuntimeError(
                    "Assignment rows were not created"
                )


        except Exception as assignment_error:

            print(
                "ASSIGNMENT INSERT ERROR:",
                assignment_error
            )

            # Roll back main task
            try:

                (
                    supabase
                    .table("tasks")
                    .delete()
                    .eq("id", task_id)
                    .execute()
                )

            except Exception as rollback_error:

                print(
                    "TASK ROLLBACK ERROR:",
                    rollback_error
                )

            return jsonify({
                "error": (
                    "Task could not be assigned "
                    "to the selected members"
                )
            }), 500


        # -------------------------------------------------
        # AUDIT
        # -------------------------------------------------

        audit_log(
            "TASK_CREATED",
            user["id"],
            {
                "task_id": task_id,
                "member_count": len(members),
                "member_ids": assigned_to,
                "title": title,
            }
        )


        # -------------------------------------------------
        # SEND INDIVIDUAL EMAILS
        # -------------------------------------------------

        notification_results = []


        for member in members:

            try:

                notification = send_task_notification(
                    saved_task,
                    member
                )

                notification_results.append({
                    "member_id": member["id"],
                    "email": member["email"],
                    "result": notification,
                })


                # -----------------------------------------
                # MARK NOTIFICATION RESULT
                # -----------------------------------------

                if notification.get("sent"):

                    (
                        supabase
                        .table("task_assignments")
                        .update({
                            "notification_sent": True,
                            "notification_sent_at": (
                                now().isoformat()
                            ),
                        })
                        .eq(
                            "task_id",
                            task_id
                        )
                        .eq(
                            "member_id",
                            member["id"]
                        )
                        .execute()
                    )


            except Exception as notification_error:

                print(
                    "NOTIFICATION ERROR:",
                    notification_error
                )

                notification_results.append({
                    "member_id": member["id"],
                    "email": member["email"],
                    "result": {
                        "sent": False,
                        "error": str(
                            notification_error
                        ),
                    },
                })


        # -------------------------------------------------
        # FINAL RESPONSE
        # -------------------------------------------------

        sent_count = sum(
            1
            for item in notification_results
            if item["result"].get("sent")
        )


        return jsonify({
            "ok": True,
            "task_id": task_id,
            "assigned_count": len(members),
            "notification_sent_count": sent_count,
            "notification_results": notification_results,
        })


    except Exception as exc:

        print(
            "CREATE TASK ERROR:",
            repr(exc)
        )

        return jsonify({
            "error": (
                "Unable to create task. "
                "Please check the server logs."
            )
        }), 500


# =========================================================
# UPDATE TASK STATUS
# =========================================================

@app.patch("/api/tasks/<task_id>")
@login_required
def update_task(task_id):

    user = current_user()

    data = request.get_json(
        silent=True
    ) or {}

    status = data.get("status")


    if status not in VALID_TASK_STATUSES:

        return jsonify({
            "error": "Invalid status"
        }), 400


    try:

        task_result = (
            supabase
            .table("tasks")
            .select("*")
            .eq("id", task_id)
            .limit(1)
            .execute()
        )

        task = (
            task_result.data[0]
            if task_result.data
            else None
        )


        if not task:

            return jsonify({
                "error": "Task not found"
            }), 404


        # =================================================
        # HEAD
        # =================================================

        if user["role"] == "head":

            (
                supabase
                .table("task_assignments")
                .update({
                    "status": status
                })
                .eq(
                    "task_id",
                    task_id
                )
                .execute()
            )

            (
                supabase
                .table("tasks")
                .update({
                    "status": status
                })
                .eq(
                    "id",
                    task_id
                )
                .execute()
            )

            audit_log(
                "TASK_STATUS_UPDATED",
                user["id"],
                {
                    "task_id": task_id,
                    "status": status,
                    "scope": "whole_task",
                }
            )

            return jsonify({
                "ok": True,
                "status": status
            })


        # =================================================
        # MEMBER
        # =================================================

        assignment_result = (
            supabase
            .table("task_assignments")
            .select("*")
            .eq(
                "task_id",
                task_id
            )
            .eq(
                "member_id",
                user["id"]
            )
            .limit(1)
            .execute()
        )


        assignment = (
            assignment_result.data[0]
            if assignment_result.data
            else None
        )


        if not assignment:

            return jsonify({
                "error": "Access denied"
            }), 403


        # -------------------------------------------------
        # Update only THIS member's assignment
        # -------------------------------------------------

        (
            supabase
            .table("task_assignments")
            .update({
                "status": status
            })
            .eq(
                "id",
                assignment["id"]
            )
            .execute()
        )


        # -------------------------------------------------
        # Recalculate overall task status
        # -------------------------------------------------

        all_assignments_result = (
            supabase
            .table("task_assignments")
            .select("status")
            .eq(
                "task_id",
                task_id
            )
            .execute()
        )


        all_assignments = (
            all_assignments_result.data or []
        )


        overall_status = calculate_overall_status(
            all_assignments
        )


        (
            supabase
            .table("tasks")
            .update({
                "status": overall_status
            })
            .eq(
                "id",
                task_id
            )
            .execute()
        )


        audit_log(
            "TASK_STATUS_UPDATED",
            user["id"],
            {
                "task_id": task_id,
                "status": status,
                "overall_status": overall_status,
                "scope": "member_assignment",
            }
        )


        return jsonify({
            "ok": True,
            "status": status,
            "overall_status": overall_status,
        })


    except Exception as exc:

        print(
            "UPDATE TASK ERROR:",
            repr(exc)
        )

        return jsonify({
            "error": "Unable to update task"
        }), 500


# =========================================================
# GET MEMBERS
# =========================================================

@app.get("/api/members")
@head_required
def get_members():

    try:

        result = (
            supabase
            .table("users")
            .select(
                "id,name,email,phone,"
                "team_member_id,active"
            )
            .eq(
                "role",
                "member"
            )
            .order(
                "team_member_id"
            )
            .execute()
        )

        return jsonify(
            result.data or []
        )

    except Exception as exc:

        print(
            "GET MEMBERS ERROR:",
            repr(exc)
        )

        return jsonify({
            "error": "Unable to load members"
        }), 500


# =========================================================
# CREATE MEMBER
# =========================================================

@app.post("/api/members")
@head_required
def create_member():

    data = request.get_json(
        silent=True
    ) or {}


    name = (
        data.get("name") or ""
    ).strip()

    email = clean_email(
        data.get("email")
    )

    phone = clean_phone(
        data.get("phone")
    )

    member_id = (
        data.get("team_member_id") or ""
    ).strip().upper()


    if not all([
        name,
        email,
        phone,
        member_id
    ]):

        return jsonify({
            "error": "All member fields are required"
        }), 400


    email = valid_email(email)

    if not email:

        return jsonify({
            "error": "Invalid email address"
        }), 400


    if not re.fullmatch(
        r"TM(00[1-9]|01[0-9]|020)",
        member_id
    ):

        return jsonify({
            "error": (
                "TeamMemberId must be TM001 to TM020"
            )
        }), 400


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


        if existing.data:

            return jsonify({
                "error": (
                    "Email, mobile number, "
                    "or TeamMemberId already exists"
                )
            }), 409


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
            "member": result.data[0],
        })


    except Exception as exc:

        print(
            "CREATE MEMBER ERROR:",
            repr(exc)
        )

        return jsonify({
            "error": "Could not create member"
        }), 409


# =========================================================
# ENABLE / DISABLE MEMBER
# =========================================================

@app.patch("/api/members/<member_id>/status")
@head_required
def member_status(member_id):

    data = request.get_json(
        silent=True
    ) or {}

    active = bool(
        data.get("active")
    )


    try:

        result = (
            supabase
            .table("users")
            .update({
                "active": active
            })
            .eq(
                "id",
                member_id
            )
            .eq(
                "role",
                "member"
            )
            .execute()
        )


        if not result.data:

            return jsonify({
                "error": "Member not found"
            }), 404


        action = (
            "MEMBER_ENABLED"
            if active
            else "MEMBER_DISABLED"
        )


        audit_log(
            action,
            current_user()["id"],
            {
                "member_id": member_id,
                "active": active,
            }
        )


        return jsonify({
            "ok": True
        })


    except Exception as exc:

        print(
            "MEMBER STATUS ERROR:",
            repr(exc)
        )

        return jsonify({
            "error": "Unable to update member"
        }), 500


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
            .order(
                "created_at",
                desc=True
            )
            .limit(100)
            .execute()
        )

        return jsonify(
            result.data or []
        )

    except Exception as exc:

        print(
            "AUDIT ERROR:",
            repr(exc)
        )

        return jsonify({
            "error": "Unable to load audit logs"
        }), 500


# =========================================================
# LOCAL DEVELOPMENT
# =========================================================

if __name__ == "__main__":

    app.run(
        debug=True,
        host="127.0.0.1",
        port=5000
    )
