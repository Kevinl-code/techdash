import os
import bcrypt
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

email = os.getenv("HEAD_EMAIL", "").strip().lower()
phone = "".join(c for c in os.getenv("HEAD_PHONE", "") if c.isdigit())
password = os.getenv("HEAD_PASSWORD", "")
mpin = os.getenv("HEAD_MPIN", "")
name = os.getenv("HEAD_NAME", "KEVIN LAZARUS")

if not all([email, phone, password, mpin]):
    raise SystemExit("Set HEAD_EMAIL, HEAD_PHONE, HEAD_PASSWORD and HEAD_MPIN in .env.")

existing = (
    supabase.table("users")
    .select("id")
    .eq("role", "head")
    .limit(1)
    .execute()
)

doc = {
    "role": "head",
    "name": name,
    "email": email,
    "phone": phone,
    "password_hash": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
    "mpin_hash": bcrypt.hashpw(mpin.encode(), bcrypt.gensalt()).decode(),
    "failed_attempts": 0,
    "locked_until": None,
    "active": True,
}

if existing.data:
    supabase.table("users").update(doc).eq("id", existing.data[0]["id"]).execute()
    print("Existing Head account updated.")
else:
    supabase.table("users").insert(doc).execute()
    print("Head account created.")
