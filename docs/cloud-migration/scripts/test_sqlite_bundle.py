"""Synthetic-data regression checks; never opens a project or production database."""
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("sqlite_bundle.py")


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="labhub-bundle-test-")
        self.root = Path(self.temporary.name)
        self.source = self.root / "source.db"
        self.writer = sqlite3.connect(self.source)
        self.writer.execute("PRAGMA journal_mode=WAL")
        self.writer.execute("PRAGMA wal_autocheckpoint=0")
        self.writer.execute("CREATE TABLE users(id INTEGER PRIMARY KEY, role TEXT)")
        self.writer.execute("INSERT INTO users VALUES(1, 'admin')")
        self.writer.execute("CREATE TABLE uploaded_files(id INTEGER PRIMARY KEY, content BLOB)")
        self.writer.execute("INSERT INTO uploaded_files VALUES(1, ?)", (b"a" * 70000,))
        self.writer.commit()
        self.bundle = self.root / "bundle"

    def tearDown(self):
        self.writer.close()
        self.temporary.cleanup()

    def call(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *map(str, args)],
                              capture_output=True, text=True)

    def snapshot(self):
        return self.call("snapshot", "--source", self.source,
                         "--output-dir", self.bundle, "--code-sha", "a" * 40)

    def test_wal_data_is_preserved_without_mutating_source(self):
        wal = Path(str(self.source) + "-wal")
        self.assertGreater(wal.stat().st_size, 0)
        before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.source, wal)}
        result = self.snapshot()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["table_counts"], {"uploaded_files": 1, "users": 1})
        for path, digest in before.items():
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest)
        snapshot = self.bundle / "labhub.db"
        connection = sqlite3.connect(snapshot)
        try:
            self.assertEqual(connection.execute("PRAGMA journal_mode").fetchone()[0], "delete")
            self.assertEqual(connection.execute("SELECT length(content) FROM uploaded_files").fetchone()[0], 70000)
        finally:
            connection.close()
        self.assertEqual(self.bundle.stat().st_mode & 0o777, 0o700)
        self.assertEqual(snapshot.stat().st_mode & 0o777, 0o600)
        verified = self.call("verify", "--bundle", self.bundle)
        self.assertEqual(verified.returncode, 0, verified.stderr)

    def test_existing_bundle_is_not_overwritten(self):
        self.assertEqual(self.snapshot().returncode, 0)
        path = self.bundle / "labhub.db"
        before = path.read_bytes()
        self.assertNotEqual(self.snapshot().returncode, 0)
        self.assertEqual(path.read_bytes(), before)

    def test_missing_source_does_not_create_database(self):
        missing = self.root / "missing.db"
        result = self.call("snapshot", "--source", missing, "--output-dir", self.bundle,
                           "--code-sha", "a" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(missing.exists())
        self.assertFalse(self.bundle.exists())

    def test_corruption_is_detected(self):
        self.assertEqual(self.snapshot().returncode, 0)
        path = self.bundle / "labhub.db"
        content = bytearray(path.read_bytes())
        content[-1] ^= 1
        path.write_bytes(content)
        result = self.call("verify", "--bundle", self.bundle)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA-256", result.stderr)


if __name__ == "__main__":
    unittest.main()
