#!/usr/bin/env python3
"""
Generate a secure encryption key for HIPAA-compliant PHI encryption.

Usage:
    python generate_encryption_key.py

This will generate a Fernet-compatible encryption key that can be used
as the ENCRYPTION_KEY environment variable.
"""
from cryptography.fernet import Fernet

def main():
    """Generate and display a new encryption key"""
    key = Fernet.generate_key()
    key_string = key.decode()
    
    print("=" * 70)
    print("ENCRYPTION KEY GENERATED")
    print("=" * 70)
    print()
    print("Add this to your environment variables:")
    print()
    print(f'export ENCRYPTION_KEY="{key_string}"')
    print()
    print("Or add to your .env file:")
    print(f'ENCRYPTION_KEY={key_string}')
    print()
    print("⚠️  IMPORTANT:")
    print("  - Store this key securely")
    print("  - Never commit it to version control")
    print("  - Backup the key separately")
    print("  - Losing this key means losing access to encrypted data")
    print("=" * 70)

if __name__ == "__main__":
    main()
