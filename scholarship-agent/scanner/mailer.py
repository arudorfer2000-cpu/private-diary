"""Digest email through SMTP (FR-D7, D8, NFR-5). Password only from the environment."""
import os, smtplib
from email.message import EmailMessage

def send(cfg, subject, body, env=None, smtp_factory=smtplib.SMTP):
    """Returns (ok, message). Never includes the password in a message."""
    env = env if env is not None else os.environ
    user, to = cfg.get("user"), cfg.get("to")
    pw = env.get(cfg.get("password_env", "SCHOLAR_SMTP_PASSWORD"))
    if not (cfg.get("enabled") and user and to): return False, "email not configured"
    if not pw: return False, "email password variable is not set"
    msg = EmailMessage(); msg["From"], msg["To"], msg["Subject"] = user, to, subject
    msg.set_content(body)
    try:
        with smtp_factory(cfg.get("host", "smtp-mail.outlook.com"), int(cfg.get("port", 587)), timeout=30) as s:
            s.starttls(); s.login(user, pw); s.send_message(msg)
        return True, "sent"
    except Exception as e:
        return False, "email failed: " + str(e).replace(pw, "***")
