import os
import smtplib
from email.message import EmailMessage

from dotenv import load_dotenv


load_dotenv()


# =========================================================
# CONFIG
# =========================================================

SMTP_HOST = os.getenv(
    "SMTP_HOST",
    "smtp.gmail.com"
)

SMTP_PORT = int(
    os.getenv(
        "SMTP_PORT",
        "587"
    )
)

SMTP_USERNAME = os.getenv(
    "SMTP_USERNAME",
    ""
)

SMTP_PASSWORD = os.getenv(
    "SMTP_PASSWORD",
    ""
)

SMTP_FROM = os.getenv(
    "SMTP_FROM",
    SMTP_USERNAME
)

SMTP_TLS = os.getenv(
    "SMTP_TLS",
    "true"
).lower() == "true"


# =========================================================
# HELPERS
# =========================================================

def smtp_configured():

    return all([
        SMTP_HOST,
        SMTP_PORT,
        SMTP_USERNAME,
        SMTP_PASSWORD,
        SMTP_FROM,
    ])


def build_task_email(task, member):

    member_name = (
        member.get("name")
        or "Team Member"
    )

    title = (
        task.get("title")
        or "New Team Task"
    )

    description = (
        task.get("description")
        or "No description provided."
    )

    due_date = (
        task.get("due_date")
        or "No due date"
    )


    subject = (
        f"New Task Assigned: {title}"
    )


    text = f"""
Hello {member_name},

A new task has been assigned to you by the Technical Team Head.

TASK
{title}

DESCRIPTION
{description}

DUE DATE
{due_date}

STATUS
Assigned

Please log in to the Technical Team Dashboard to view and update the task.

Regards,
Technical Team
"""


    html = f"""
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">

<style>

body {{
    margin: 0;
    padding: 0;
    background: #f4f5f7;
    font-family: Arial, Helvetica, sans-serif;
}}

.wrapper {{
    width: 100%;
    padding: 32px 12px;
}}

.card {{
    max-width: 600px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 18px;
    overflow: hidden;
    border: 1px solid #e8e8e8;
}}

.header {{
    padding: 28px 30px;
    background: #111111;
    color: white;
}}

.header h1 {{
    margin: 0;
    font-size: 22px;
}}

.header p {{
    margin: 7px 0 0;
    color: #bbbbbb;
    font-size: 13px;
}}

.content {{
    padding: 30px;
}}

.greeting {{
    font-size: 16px;
    color: #222222;
}}

.task-box {{
    margin-top: 24px;
    padding: 22px;
    border-radius: 14px;
    background: #f7f7f8;
}}

.task-title {{
    margin: 0 0 12px;
    font-size: 21px;
    color: #111111;
}}

.description {{
    color: #555555;
    line-height: 1.6;
    white-space: pre-wrap;
}}

.meta {{
    margin-top: 20px;
}}

.meta-row {{
    padding: 10px 0;
    border-bottom: 1px solid #e5e5e5;
}}

.meta-label {{
    display: inline-block;
    width: 100px;
    font-weight: bold;
    color: #777777;
}}

.meta-value {{
    color: #222222;
}}

.status {{
    display: inline-block;
    padding: 5px 10px;
    border-radius: 20px;
    background: #eeeeee;
    font-size: 12px;
    font-weight: bold;
}}

.footer {{
    padding: 22px 30px;
    background: #fafafa;
    color: #777777;
    font-size: 12px;
    line-height: 1.5;
}}

</style>
</head>

<body>

<div class="wrapper">

<div class="card">

    <div class="header">
        <h1>Technical Team</h1>
        <p>New task assignment</p>
    </div>

    <div class="content">

        <p class="greeting">
            Hello {member_name},
        </p>

        <p>
            A new task has been assigned to you by the
            Technical Team Head.
        </p>

        <div class="task-box">

            <h2 class="task-title">
                {title}
            </h2>

            <div class="description">
                {description}
            </div>

            <div class="meta">

                <div class="meta-row">
                    <span class="meta-label">
                        Due date
                    </span>

                    <span class="meta-value">
                        {due_date}
                    </span>
                </div>

                <div class="meta-row">
                    <span class="meta-label">
                        Status
                    </span>

                    <span class="status">
                        Assigned
                    </span>
                </div>

            </div>

        </div>

        <p style="margin-top:24px;">
            Please log in to the Technical Team Dashboard
            to view and update your task.
        </p>

    </div>

    <div class="footer">
        This is an automated task notification from
        the Technical Team Dashboard.
        <br>
        Please do not reply directly to this email.
    </div>

</div>

</div>

</body>
</html>
"""


    return subject, text, html


# =========================================================
# SEND TASK NOTIFICATION
# =========================================================

def send_task_notification(task, member):

    recipient = (
        member.get("email") or ""
    ).strip()


    if not recipient:

        return {
            "sent": False,
            "error": "Member has no email address"
        }


    if not smtp_configured():

        return {
            "sent": False,
            "error": "SMTP configuration is missing"
        }


    subject, text_body, html_body = (
        build_task_email(
            task,
            member
        )
    )


    message = EmailMessage()

    message["Subject"] = subject
    message["From"] = SMTP_FROM
    message["To"] = recipient

    message.set_content(
        text_body
    )

    message.add_alternative(
        html_body,
        subtype="html"
    )


    try:

        with smtplib.SMTP(
            SMTP_HOST,
            SMTP_PORT,
            timeout=30
        ) as smtp:

            smtp.ehlo()

            if SMTP_TLS:

                smtp.starttls()

                smtp.ehlo()

            smtp.login(
                SMTP_USERNAME,
                SMTP_PASSWORD
            )

            smtp.send_message(
                message
            )


        print(
            f"TASK EMAIL SENT: {recipient}"
        )


        return {
            "sent": True,
            "recipient": recipient,
            "subject": subject,
        }


    except smtplib.SMTPAuthenticationError:

        print(
            "SMTP AUTHENTICATION FAILED"
        )

        return {
            "sent": False,
            "recipient": recipient,
            "error": (
                "SMTP authentication failed"
            ),
        }


    except smtplib.SMTPException as exc:

        print(
            "SMTP ERROR:",
            repr(exc)
        )

        return {
            "sent": False,
            "recipient": recipient,
            "error": str(exc),
        }


    except Exception as exc:

        print(
            "EMAIL ERROR:",
            repr(exc)
        )

        return {
            "sent": False,
            "recipient": recipient,
            "error": str(exc),
        }
