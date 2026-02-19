"""
Email service for password reset and verification
"""
import os
import logging
from typing import Optional
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from jinja2 import Template

logger = logging.getLogger(__name__)

# Email configuration from environment variables
MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
MAIL_FROM = os.getenv("MAIL_FROM", "noreply@datamanager.com")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Data Manager")
MAIL_PORT = int(os.getenv("MAIL_PORT", "587"))
MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com")
MAIL_TLS = os.getenv("MAIL_TLS", "true").lower() == "true"
MAIL_SSL = os.getenv("MAIL_SSL", "false").lower() == "true"
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Configure FastMail
conf = ConnectionConfig(
    MAIL_USERNAME=MAIL_USERNAME,
    MAIL_PASSWORD=MAIL_PASSWORD,
    MAIL_FROM=MAIL_FROM,
    MAIL_PORT=MAIL_PORT,
    MAIL_SERVER=MAIL_SERVER,
    MAIL_TLS=MAIL_TLS,
    MAIL_SSL=MAIL_SSL,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

fastmail = FastMail(conf)


async def send_password_reset_email(email: str, reset_token: str) -> bool:
    """Send password reset email"""
    if not MAIL_USERNAME or not MAIL_PASSWORD:
        logger.warning("Email not configured. Set MAIL_USERNAME and MAIL_PASSWORD environment variables.")
        return False
    
    reset_url = f"{FRONTEND_URL}/reset-password?token={reset_token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; }}
            .button:hover {{ background-color: #4f46e5; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Password Reset Request</h2>
            <p>You requested to reset your password for Data Manager.</p>
            <p>Click the button below to reset your password:</p>
            <a href="{reset_url}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="{reset_url}">{reset_url}</a></p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
        </div>
    </body>
    </html>
    """
    
    message = MessageSchema(
        subject="Password Reset - Data Manager",
        recipients=[email],
        body=html_content,
        subtype="html"
    )
    
    try:
        await fastmail.send_message(message)
        logger.info(f"Password reset email sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")
        return False


async def send_verification_email(email: str, verification_token: str) -> bool:
    """Send email verification email"""
    if not MAIL_USERNAME or not MAIL_PASSWORD:
        logger.warning("Email not configured. Set MAIL_USERNAME and MAIL_PASSWORD environment variables.")
        return False
    
    verification_url = f"{FRONTEND_URL}/verify-email?token={verification_token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; }}
            .button:hover {{ background-color: #4f46e5; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Verify Your Email</h2>
            <p>Thank you for signing up for Data Manager!</p>
            <p>Please verify your email address by clicking the button below:</p>
            <a href="{verification_url}" class="button">Verify Email</a>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="{verification_url}">{verification_url}</a></p>
            <p>If you didn't create an account, please ignore this email.</p>
        </div>
    </body>
    </html>
    """
    
    message = MessageSchema(
        subject="Verify Your Email - Data Manager",
        recipients=[email],
        body=html_content,
        subtype="html"
    )
    
    try:
        await fastmail.send_message(message)
        logger.info(f"Verification email sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send verification email: {e}")
        return False


async def send_login_otp_email(email: str, otp_code: str, expires_minutes: int = 10) -> bool:
    """Send OTP for login session (email verification step)."""
    if not MAIL_USERNAME or not MAIL_PASSWORD:
        logger.warning("Email not configured. Set MAIL_USERNAME and MAIL_PASSWORD environment variables.")
        return False

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .otp {{ font-size: 28px; letter-spacing: 8px; font-weight: bold; padding: 16px; background: #f1f5f9; border-radius: 8px; margin: 20px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Your login code</h2>
            <p>Use this one-time code to sign in to Data Manager:</p>
            <div class="otp">{otp_code}</div>
            <p>This code expires in {expires_minutes} minutes.</p>
            <p>If you didn't request this, please ignore this email.</p>
        </div>
    </body>
    </html>
    """

    message = MessageSchema(
        subject="Your Data Manager login code",
        recipients=[email],
        body=html_content,
        subtype="html"
    )

    try:
        await fastmail.send_message(message)
        logger.info(f"Login OTP sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send login OTP: {e}")
        return False
