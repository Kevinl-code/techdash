# Technical Team Dashboard — Supabase + Vercel

Production-oriented MVP:
- Flask backend
- Supabase PostgreSQL database
- Vercel deployment
- Head authentication: email/phone + password + MPIN
- Member authentication: email + phone + TeamMemberId
- TM001–TM020 validation and unique constraints
- Failed Head-login lockout and audit logs
- Task assignment/status updates
- Email + optional Google Apps Script notifications
- WhatsApp, Canva and Team Folder resource links

## 1. Local setup

Create `.env` from `.env.example`. Never commit `.env`.

Install:
    python -m venv .venv
    Windows: .venv\Scripts\activate
    pip install -r requirements.txt

Create the Supabase tables by running `supabase_schema.sql` in Supabase SQL Editor.

Then seed the Head:
    python seed_head.py

Run:
    python app.py

## 2. Supabase

Create a Supabase project and copy:
- Project URL
- Publishable/anon key

The Flask server uses the Supabase API. Do not expose the service-role key to browser JavaScript.

For this MVP, keep authentication in Flask because the requested login is a custom 3-field member identity match plus Head password + MPIN.

## 3. Vercel

Push this project to GitHub and import it into Vercel.

Add all variables from `.env.example` to Vercel Project Settings > Environment Variables.

Important:
- `ALLOW_DEV_AUTH=false` in production.
- Use a long random `FLASK_SECRET_KEY`.
- Do not commit `.env`.
- Redeploy after changing environment variables.

## 4. Notifications

SMTP is supported directly. Google Apps Script can be configured through `APPSCRIPT_WEBHOOK_URL`.

A normal WhatsApp group invite link cannot be used as an automated messaging API. The dashboard opens the supplied group link; automated WhatsApp messages require an authorized WhatsApp Business/API integration.

## 5. Security

The supplied credentials should be rotated because they were shared in chat. This package deliberately does not contain those credentials. Put the new values only in your local `.env` and Vercel environment variables.

The Head password and MPIN are stored as bcrypt hashes in Supabase, not plaintext.
