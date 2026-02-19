import os
import firebase_admin
from firebase_admin import credentials, auth

FIREBASE_SERVICE_ACCOUNT_KEY_PATH = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY_PATH")

if FIREBASE_SERVICE_ACCOUNT_KEY_PATH:
    cred = credentials.Certificate(FIREBASE_SERVICE_ACCOUNT_KEY_PATH)
    firebase_admin.initialize_app(cred)

def send_firebase_otp(email):
    if not firebase_admin._apps:
        return False
    try:
        # This will send a sign-in link to the user's email
        link = auth.generate_sign_in_with_email_link(email, None)
        # You can then use this link to sign in the user
        # For now, we will just send the link
        # In a real application, you would send this link in an email
        print(f"Sign-in link for {email}: {link}")
        return True
    except Exception as e:
        print(f"Error sending Firebase OTP: {e}")
        return False
