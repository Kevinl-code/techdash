import os
import smtplib
from email.message import EmailMessage
from datetime import datetime

from dotenv import load_dotenv


load_dotenv()


# =========================================================
# SMTP CONFIG
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
    "SMTP_USERNAME"
)

SMTP_PASSWORD = os.getenv(
    "SMTP_PASSWORD"
)

SMTP_FROM = os.getenv(
    "SMTP_FROM",
    SMTP_USERNAME or ""
)

SMTP_TLS = (
    os.getenv(
        "SMTP_TLS",
        "true"
    ).lower()
    in {"1", "true", "yes", "on"}
)


# =========================================================
# SEND TASK EMAIL
# =========================================================

def send_task_notification(
    task,
    member
):
    """
    Send one task-assignment email.

    Returns:
        {
            "success": True,
            "message": "...",
        }

    or:

        {
            "success": False,
            "error": "...",
        }
    """

    recipient = (
        member.get("email")
        or ""
    ).strip()

    member_name = (
        member.get("name")
        or "Team Member"
    ).strip()

    title = (
        task.get("title")
        or "New Task"
    ).strip()

    description = (
        task.get("description")
        or "No description provided."
    ).strip()

    due_date = (
        task.get("due_date")
        or "No due date"
    )

    task_id = (
        task.get("id")
        or ""
    )

    # -----------------------------------------------------
    # VALIDATE SMTP
    # -----------------------------------------------------

    if not SMTP_USERNAME:

        return {
            "success": False,
            "error":
                "SMTP_USERNAME is not configured"
        }

    if not SMTP_PASSWORD:

        return {
            "success": False,
            "error":
                "SMTP_PASSWORD is not configured"
        }

    if not recipient:

        return {
            "success": False,
            "error":
                "Member email is missing"
        }

    # -----------------------------------------------------
    # EMAIL SUBJECT
    # -----------------------------------------------------

    subject = (
        f"New Task Assigned: {title}"
    )

    # -----------------------------------------------------
    # PLAIN TEXT
    # -----------------------------------------------------

    text_body = f"""
Hello {member_name},

A new task has been assigned to you by the Technical Team Head.

TASK
----
{title}

DESCRIPTION
-----------
{description}

DUE DATE
--------
{due_date}

STATUS
------
Assigned

Task ID:
{task_id}

Please log in to the Technical Team Dashboard to view and manage this task.

Regards,
Technical Team
""".strip()

    # -----------------------------------------------------
    # HTML EMAIL
    # -----------------------------------------------------

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>New Task Assigned</title>
</head>

<body style="
    margin:0;
    padding:0;
    background:#f4f6f8;
    font-family:Arial,Helvetica,sans-serif;
">

<table width="100%" cellpadding="0" cellspacing="0"
       style="background:#f4f6f8;padding:30px 15px;">

    <tr>
        <td align="center">

            <table width="600"
                   cellpadding="0"
                   cellspacing="0"
                   style="
                       max-width:600px;
                       background:#ffffff;
                       border-radius:14px;
                       overflow:hidden;
                       border:1px solid #e5e7eb;
                   ">

                <!-- HEADER -->

                <tr>
                    <td style="
                        padding:28px;
                        background:#111827;
                        color:#ffffff;
                    ">

                        <div style="
                            font-size:12px;
                            letter-spacing:1.5px;
                            text-transform:uppercase;
                            opacity:.75;
                        ">
                            Technical Team Dashboard
                        </div>

                        <h1 style="
                            margin:10px 0 0;
                            font-size:25px;
                            line-height:1.3;
                        ">
                            New Task Assigned
                        </h1>

                    </td>
                </tr>

                <!-- CONTENT -->

                <tr>
                    <td style="padding:30px;">

                        <p style="
                            margin:0 0 20px;
                            font-size:16px;
                            color:#111827;
                        ">
                            Hello
                            <strong>
                                {member_name}
                            </strong>,
                        </p>

                        <p style="
                            margin:0 0 25px;
                            color:#4b5563;
                            line-height:1.6;
                        ">
                            A new task has been assigned
                            to you by the Technical Team Head.
                        </p>

                        <!-- TASK TITLE -->

                        <div style="
                            padding:20px;
                            background:#f9fafb;
                            border:1px solid #e5e7eb;
                            border-radius:10px;
                        ">

                            <div style="
                                font-size:12px;
                                color:#6b7280;
                                text-transform:uppercase;
                                letter-spacing:1px;
                                margin-bottom:7px;
                            ">
                                Task
                            </div>

                            <div style="
                                font-size:20px;
                                font-weight:700;
                                color:#111827;
                            ">
                                {title}
                            </div>

                        </div>

                        <!-- DESCRIPTION -->

                        <div style="
                            margin-top:20px;
                        ">

                            <div style="
                                font-size:12px;
                                color:#6b7280;
                                text-transform:uppercase;
                                letter-spacing:1px;
                                margin-bottom:8px;
                            ">
                                Description
                            </div>

                            <div style="
                                color:#374151;
                                line-height:1.7;
                                white-space:pre-line;
                            ">
                                {description}
                            </div>

                        </div>

                        <!-- DUE DATE -->

                        <div style="
                            margin-top:22px;
                            padding:15px;
                            border-left:4px solid #111827;
                            background:#f9fafb;
                        ">

                            <strong>
                                Due date:
                            </strong>

                            {due_date}

                        </div>

                        <!-- STATUS -->

                        <div style="
                            margin-top:18px;
                            color:#374151;
                        ">

                            <strong>
                                Status:
                            </strong>

                            Assigned

                        </div>

                    </td>
                </tr>

                <!-- FOOTER -->

                <tr>
                    <td style="
                        padding:20px 30px;
                        background:#f9fafb;
                        border-top:1px solid #e5e7eb;
                        color:#6b7280;
                        font-size:12px;
                        line-height:1.6;
                    ">

                        This is an automated notification
                        from the Technical Team Dashboard.

                    </td>
                </tr>

            </table>

        </td>
    </tr>

</table>

</body>
</html>
""".strip()

    # -----------------------------------------------------
    # BUILD MESSAGE
    # -----------------------------------------------------

    message = EmailMessage()

    message["From"] = SMTP_FROM
    message["To"] = recipient
    message["Subject"] = subject

    message.set_content(
        text_body
    )

    message.add_alternative(
        html_body,
        subtype="html"
    )

    # -----------------------------------------------------
    # SEND
    # -----------------------------------------------------

    try:

        if SMTP_TLS:

            with smtplib.SMTP(
                SMTP_HOST,
                SMTP_PORT,
                timeout=30
            ) as server:

                server.ehlo()

                server.starttls()

                server.ehlo()

                server.login(
                    SMTP_USERNAME,
                    SMTP_PASSWORD
                )

                server.send_message(
                    message
                )

        else:

            with smtplib.SMTP(
                SMTP_HOST,
                SMTP_PORT,
                timeout=30
            ) as server:

                server.ehlo()

                server.login(
                    SMTP_USERNAME,
                    SMTP_PASSWORD
                )

                server.send_message(
                    message
                )

        print(
            f"TASK EMAIL SENT -> {recipient}"
        )

        return {
            "success": True,
            "message":
                "Notification email sent",
            "recipient":
                recipient,
        }

    except smtplib.SMTPAuthenticationError as exc:

        print(
            "SMTP AUTHENTICATION ERROR:",
            exc
        )

        return {
            "success": False,
            "error":
                "Email authentication failed"
        }

    except smtplib.SMTPException as exc:

        print(
            "SMTP ERROR:",
            exc
        )

        return {
            "success": False,
            "error":
                "SMTP server rejected the email"
        }

    except Exception as exc:

        print(
            "EMAIL ERROR:",
            repr(exc)
        )

        return {
            "success": False,
            "error":
                "Could not send notification email"
        }
