import sqlite3
import os
import json

DB_PATH = 'backend/labhub.db'
SCHEMA_OUTPUT = 'scripts/schema_d1.sql'
DATA_OUTPUT = 'scripts/data_d1.sql'

os.makedirs('scripts', exist_ok=True)

SCHEMA_DDL = """-- Cloudflare D1 Database Schema for LabHub
-- Fully compatible with SQLite & Cloudflare D1

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL,
    real_name TEXT NOT NULL DEFAULT '',
    nickname TEXT NOT NULL DEFAULT '',
    email VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(200) NOT NULL,
    role VARCHAR(20) DEFAULT 'student',
    avatar VARCHAR(255),
    bio VARCHAR(255),
    token_version INTEGER NOT NULL DEFAULT 0,
    can_manage_seminars INTEGER NOT NULL DEFAULT 0,
    tutorial_completed INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS resource_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) UNIQUE NOT NULL,
    is_default BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(150) NOT NULL,
    original_title VARCHAR(150),
    authors VARCHAR(150) NOT NULL DEFAULT '',
    category VARCHAR(50) DEFAULT '教材',
    description TEXT,
    cover_url VARCHAR(255),
    tutorial_url VARCHAR(255),
    exercise_url VARCHAR(255),
    github_url VARCHAR(255),
    download_url VARCHAR(255),
    order_num INTEGER DEFAULT 0,
    created_by_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS arxiv_papers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arxiv_id VARCHAR(50) NOT NULL,
    title VARCHAR(300) NOT NULL,
    journal TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    authors TEXT NOT NULL,
    abstract TEXT NOT NULL,
    primary_category VARCHAR(50),
    published_date VARCHAR(30),
    pdf_url VARCHAR(255),
    recommended_by_id INTEGER NOT NULL REFERENCES users(id),
    recommend_comment TEXT,
    is_pinned BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_arxiv_papers_arxiv_id ON arxiv_papers(arxiv_id);

CREATE TABLE IF NOT EXISTS paper_read_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES arxiv_papers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_read_marks_paper_user ON paper_read_marks(paper_id, user_id);

CREATE TABLE IF NOT EXISTS seminar_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date VARCHAR(30) NOT NULL,
    time VARCHAR(30) DEFAULT '14:30',
    location VARCHAR(100) DEFAULT '物理楼研讨室 / 腾讯会议',
    presenter_id INTEGER REFERENCES users(id),
    presenter_name VARCHAR(50) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    paper_id INTEGER REFERENCES arxiv_papers(id),
    slides_url VARCHAR(255),
    notes TEXT,
    abstract TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'upcoming',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seminar_presentations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seminar_id INTEGER NOT NULL REFERENCES seminar_schedules(id) ON DELETE CASCADE,
    position INTEGER DEFAULT 0,
    presenter_id INTEGER REFERENCES users(id),
    presenter_name VARCHAR(100) NOT NULL,
    arxiv_id VARCHAR(50) NOT NULL DEFAULT '',
    slides_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_seminar_pres_seminar_id ON seminar_presentations(seminar_id);

CREATE TABLE IF NOT EXISTS library_papers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arxiv_id VARCHAR(50) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    journal VARCHAR(300) DEFAULT '',
    source_url TEXT DEFAULT '',
    authors TEXT DEFAULT '[]',
    abstract TEXT DEFAULT '',
    primary_category VARCHAR(50) DEFAULT '',
    published_date VARCHAR(30) DEFAULT '',
    pdf_url TEXT,
    metadata_status VARCHAR(20) DEFAULT 'ready',
    from_recommendation BOOLEAN DEFAULT 0,
    from_seminar BOOLEAN DEFAULT 0,
    identity_checked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_library_arxiv_id ON library_papers(arxiv_id);

CREATE TABLE IF NOT EXISTS library_aliases (
    key TEXT PRIMARY KEY,
    library_id INTEGER NOT NULL REFERENCES library_papers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS uploaded_files (
    id VARCHAR(36) PRIMARY KEY,
    filename TEXT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS observatory_talks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date VARCHAR(10) NOT NULL,
    time VARCHAR(5) NOT NULL,
    title TEXT NOT NULL,
    speaker TEXT DEFAULT '',
    location TEXT DEFAULT '',
    poster_url TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommendation_audiences (
    paper_id INTEGER PRIMARY KEY REFERENCES arxiv_papers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recommendation_recipients (
    paper_id INTEGER NOT NULL REFERENCES recommendation_audiences(paper_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, user_id)
);

CREATE TABLE IF NOT EXISTS library_access (
    paper_id INTEGER NOT NULL REFERENCES library_papers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, user_id)
);

CREATE TABLE IF NOT EXISTS library_recommendation_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    library_id INTEGER NOT NULL REFERENCES library_papers(id) ON DELETE CASCADE,
    recommendation_id INTEGER UNIQUE,
    is_public BOOLEAN NOT NULL DEFAULT 0,
    user_ids TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL,
    target VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, kind, target)
);

CREATE TABLE IF NOT EXISTS issue_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    content TEXT NOT NULL,
    page VARCHAR(300) DEFAULT '',
    resolved BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL REFERENCES issue_feedback(id) ON DELETE CASCADE,
    admin_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME
);

CREATE TABLE IF NOT EXISTS user_mail_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_address VARCHAR(150) NOT NULL,
    protocol VARCHAR(10) DEFAULT 'imap',
    server_host VARCHAR(150) NOT NULL,
    server_port INTEGER DEFAULT 993,
    use_ssl BOOLEAN DEFAULT 1,
    username VARCHAR(150) NOT NULL,
    encrypted_password TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_cached_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    msg_uid VARCHAR(150) NOT NULL,
    subject TEXT DEFAULT '',
    sender_name VARCHAR(150) DEFAULT '',
    sender_email VARCHAR(150) DEFAULT '',
    recipient TEXT DEFAULT '',
    date_str VARCHAR(100) DEFAULT '',
    snippet TEXT DEFAULT '',
    body_text TEXT DEFAULT '',
    body_html TEXT DEFAULT '',
    has_attachments BOOLEAN DEFAULT 0,
    is_read BOOLEAN DEFAULT 0,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cached_emails_user_uid ON user_cached_emails(user_id, msg_uid);
"""

def export():
    with open(SCHEMA_OUTPUT, 'w', encoding='utf-8') as f:
        f.write(SCHEMA_DDL)
    print(f"Generated {SCHEMA_OUTPUT}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    tables = [
        'users',
        'resource_categories',
        'system_settings',
        'resource_books',
        'arxiv_papers',
        'paper_read_marks',
        'seminar_schedules',
        'seminar_presentations',
        'library_papers',
        'library_aliases',
        'uploaded_files',
        'observatory_talks',
        'recommendation_audiences',
        'recommendation_recipients',
        'library_access',
        'library_recommendation_sources',
        'favorites',
        'issue_feedback',
        'feedback_replies',
        'user_mail_configs',
        'user_cached_emails'
    ]

    sql_statements = [
        "-- Exported data from stb production labhub.db for Cloudflare D1",
        "PRAGMA foreign_keys = OFF;",
        "",
        "-- Clear existing tables to prevent stale mock data conflicts",
    ]

    # Clean in reverse dependency order
    for t in reversed(tables):
        sql_statements.append(f"DELETE FROM {t};")
    sql_statements.append("")

    for table in tables:
        try:
            cursor.execute(f"SELECT * FROM {table}")
            rows = cursor.fetchall()
            if not rows:
                continue
            cols = [col[0] for col in cursor.description]
            cols_str = ", ".join(f'"{c}"' for c in cols)
            sql_statements.append(f"-- Table: {table} ({len(rows)} rows)")
            for r in rows:
                row_dict = dict(r)

                vals = []
                for c in cols:
                    val = row_dict[c]
                    if val is None:
                        vals.append("NULL")
                    elif isinstance(val, (int, float)):
                        vals.append(str(val))
                    elif isinstance(val, bytes):
                        vals.append("NULL")
                    else:
                        escaped = str(val).replace("'", "''")
                        vals.append(f"'{escaped}'")
                sql_statements.append(f"INSERT INTO {table} ({cols_str}) VALUES ({', '.join(vals)});")
            sql_statements.append("")
        except sqlite3.OperationalError as e:
            print(f"Skipping table {table}: {e}")

    sql_statements.append("PRAGMA foreign_keys = ON;")

    with open(DATA_OUTPUT, 'w', encoding='utf-8') as f:
        f.write("\n".join(sql_statements))
    print(f"Generated {DATA_OUTPUT}")

if __name__ == '__main__':
    export()

