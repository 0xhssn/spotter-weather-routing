"""Generate a 256-bit shared password and verifier into a private, untracked file."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets


def create(output):
    password = secrets.token_urlsafe(32)
    credentials = {'password': password,
                   'password_sha256': hashlib.sha256(password.encode()).hexdigest()}
    # Refuse overwrites and symlinks. Create with private permissions immediately.
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(credentials, stream, indent=2)
        stream.write('\n')
    print(f'Credentials saved to {Path(output).resolve()} (mode 600).')
    print('Set the backend DEMO_ACCESS_PASSWORD_SHA256 to password_sha256; share only password with reviewers.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='.demo-access.json')
    args = parser.parse_args()
    create(args.output)
