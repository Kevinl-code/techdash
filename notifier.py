import os
import smtplib
import requests
from email.message import EmailMessage
from dotenv import load_dotenv

load_dotenv()


def email_notify(member, task):
    host = os.getenv("SMTP_HOST", "").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", "").strip() or username
    port = int(os.getenv("SMTP_PORT", "587"))

    if not all([host, username, password, sender, member.get("email")]):
        return {"channel": "email", "sent": False, "reason": "SMTP not configured"}

    msg = EmailMessage()
    msg["Subject"] = f"New technical team task: {task['title']}"
    msg["From"] = sender
    msg["To"] = member["email"]
    msg.set_content(
        f"Hello {member['name']},\n\n"
        f"A new task has been assigned to you.\n\n"
        f"Task: {task['title']}\n"
        f"Description: {task.get('description', '')}\n"
        f"Due: {task.get('due_date') or 'Not specified'}\n\n"
        "Open the Technical Team Dashboard to update the status."
    )

    with smtplib.SMTP(host, port, timeout=15) as server:
        if os.getenv("SMTP_TLS", "true").lower() == "true":
            server.starttls()
        server.login(username, password)
        server.send_message(msg)

    return {"channel": "email", "sent": True}


def appscript_notify(member, task):
    url = os.getenv("APPSCRIPT_WEBHOOK_URL", "").strip()
    if not url:
        return {"channel": "appscript", "sent": False, "reason": "Webhook not configured"}

    response = requests.post(url, json={
        "type": "task_assigned",
        "member": {
            "name": member["name"],
            "email": member["email"],
            "phone": member["phone"],
            "team_member_id": member["team_member_id"],
        },
        "task": {
            "title": task["title"],
            "description": task.get("description", ""),
            "due_date": task.get("due_date"),
        }
    }, timeout=15)

    return {
        "channel": "appscript",
        "sent": response.ok,
        "status_code": response.status_code
    }


def send_task_notification(task, member):
    results = []
    for fn in (email_notify, appscript_notify):
        try:
            results.append(fn(member, task))
        except Exception as exc:
            channel = "email" if fn is email_notify else "appscript"
            results.append({"channel": channel, "sent": False, "reason": str(exc)})
    return results
