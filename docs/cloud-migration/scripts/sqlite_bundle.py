#!/usr/bin/env python3
"""Make and verify a private, consistent SQLite backup without importing the app.

Writes only a newly created output directory. An incomplete directory is retained
for diagnosis and is never considered a valid bundle without manifest.json.
Uses Python 3.10+ standard library. Does not checkpoint or modify the source DB.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
from datetime import datetime, timezone


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def connect_readonly(path):
    connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=10)
    connection.execute("PRAGMA query_only=ON")
    return connection


def audit(path):
    connection = connect_readonly(path)
    try:
        connection.execute("BEGIN")
        checks = [row[0] for row in connection.execute("PRAGMA integrity_check")]
        if checks != ["ok"]:
            raise RuntimeError("SQLite integrity_check failed; inspect the private backup")
        tables = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )]
        counts = {}
        for name in tables:
            quoted = '"' + name.replace('"', '""') + '"'
            counts[name] = connection.execute("SELECT count(*) FROM " + quoted).fetchone()[0]
        violations = sum(1 for _ in connection.execute("PRAGMA foreign_key_check"))
        return {"integrity_check": "ok", "table_counts": counts,
                "foreign_key_violation_count": violations}
    finally:
        connection.close()


def create_bundle(source, output_dir, code_sha, timeout):
    source = source.expanduser().resolve(strict=True)
    output_dir = output_dir.expanduser().absolute()
    if not source.is_file():
        raise ValueError("Source must be an existing regular SQLite file")
    if not output_dir.parent.is_dir():
        raise ValueError("Create the private output parent directory first")
    # Atomic refusal to overwrite an existing directory, file or symlink.
    output_dir.mkdir(mode=0o700)
    temporary = output_dir / "labhub.db.incomplete"
    descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    started = datetime.now(timezone.utc).isoformat()
    deadline = time.monotonic() + timeout

    def progress(status, remaining, total):
        if time.monotonic() > deadline:
            raise TimeoutError("SQLite backup exceeded its time limit; no complete bundle published")

    original = connect_readonly(source)
    destination = None
    try:
        destination = sqlite3.connect(temporary)
        original.backup(destination, pages=256, progress=progress, sleep=0.05)
        # This modifies the backup only, making it a portable standalone DB file.
        destination.execute("PRAGMA journal_mode=DELETE")
    finally:
        if destination is not None:
            destination.close()
        original.close()
    info = audit(temporary)
    final = output_dir / "labhub.db"
    temporary.rename(final)
    with final.open("rb") as handle:
        os.fsync(handle.fileno())
    manifest = {
        "format_version": 1, "source_path": str(source), "code_sha": code_sha,
        "backup_started_utc": started,
        "backup_finished_utc": datetime.now(timezone.utc).isoformat(),
        "database": "labhub.db", "bytes": final.stat().st_size,
        "sha256": sha256(final), **info,
    }
    manifest_path = output_dir / "manifest.json"
    with manifest_path.open("x", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(manifest_path, 0o600)
    return {"status": "complete", "bundle": str(output_dir), **manifest}


def verify_bundle(bundle):
    bundle = bundle.expanduser().resolve(strict=True)
    manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("format_version") != 1 or manifest.get("database") != "labhub.db":
        raise ValueError("Unknown bundle format")
    database = bundle / "labhub.db"
    if database.is_symlink() or not database.is_file():
        raise ValueError("Bundle database must be a regular file")
    if database.stat().st_size != manifest["bytes"] or sha256(database) != manifest["sha256"]:
        raise ValueError("Backup byte size or SHA-256 does not match the manifest")
    # A portable snapshot must not have unapplied WAL data.
    wal = bundle / "labhub.db-wal"
    if wal.exists() and wal.stat().st_size:
        raise ValueError("Bundle has WAL data; use an untouched standalone snapshot")
    info = audit(database)
    for key, value in info.items():
        if value != manifest[key]:
            raise ValueError("Backup logical audit differs from manifest: " + key)
    return {"status": "verified", "bundle": str(bundle), "sha256": manifest["sha256"], **info}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    backup = sub.add_parser("snapshot")
    backup.add_argument("--source", required=True, type=Path)
    backup.add_argument("--output-dir", required=True, type=Path)
    backup.add_argument("--code-sha", required=True)
    backup.add_argument("--timeout", type=float, default=60)
    verify = sub.add_parser("verify")
    verify.add_argument("--bundle", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == "snapshot":
            if len(args.code_sha) != 40 or any(c not in "0123456789abcdef" for c in args.code_sha):
                raise ValueError("--code-sha must be the verified 40-character lowercase Git SHA")
            if args.timeout <= 0:
                raise ValueError("--timeout must be positive")
            result = create_bundle(args.source, args.output_dir, args.code_sha, args.timeout)
        else:
            result = verify_bundle(args.bundle)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (OSError, ValueError, RuntimeError, sqlite3.Error, KeyError) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
