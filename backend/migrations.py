"""Additive migrations for existing SQLite installations. Run before ORM queries."""
from sqlalchemy import inspect, text


def migrate(engine):
    additions = {
        'users': {'real_name': "TEXT NOT NULL DEFAULT ''", 'nickname': "TEXT NOT NULL DEFAULT ''", 'token_version': 'INTEGER NOT NULL DEFAULT 0', 'can_manage_seminars': 'INTEGER NOT NULL DEFAULT 0', 'tutorial_completed': 'INTEGER NOT NULL DEFAULT 0'},
        'seminar_schedules': {'abstract': "TEXT DEFAULT ''"},
        'seminar_presentations': {'presenter_id': 'INTEGER REFERENCES users(id)'},
        'arxiv_papers': {'journal': "TEXT DEFAULT ''", 'source_url': "TEXT DEFAULT ''"},
        'library_papers': {'journal': "TEXT DEFAULT ''", 'source_url': "TEXT DEFAULT ''", 'identity_checked_at': 'DATETIME'},
        'resource_books': {'created_by_id': 'INTEGER REFERENCES users(id)'},
        'user_cached_emails': {'poster_url': "TEXT DEFAULT ''", 'attachments': "TEXT DEFAULT '[]'"},
        'uploaded_files': {'sha256': "VARCHAR(64) DEFAULT ''"},
        'observatory_talks': {
            'end_date': "VARCHAR(10) DEFAULT ''",
            'event_type': "VARCHAR(20) DEFAULT 'talk'",
            'city': "VARCHAR(100) DEFAULT ''",
            'organizer': "VARCHAR(200) DEFAULT ''",
            'sub_type': "VARCHAR(50) DEFAULT ''",
            'abstract_deadline': "VARCHAR(10) DEFAULT ''",
            'early_bird_deadline': "VARCHAR(10) DEFAULT ''",
            'registration_deadline': "VARCHAR(10) DEFAULT ''",
            'website_url': "TEXT DEFAULT ''",
            'registration_url': "TEXT DEFAULT ''",
            'handbook_url': "TEXT DEFAULT ''",
            'source': "VARCHAR(200) DEFAULT ''",
            'updated_at': "DATETIME DEFAULT CURRENT_TIMESTAMP"
        },
    }
    with engine.begin() as connection:
        inspector = inspect(connection)
        for table, columns in additions.items():
            if not inspector.has_table(table):
                continue
            existing = {c['name'] for c in inspector.get_columns(table)}
            for name, definition in columns.items():
                if name not in existing:
                    connection.execute(text(f'ALTER TABLE {table} ADD COLUMN {name} {definition}'))
        # 确保基础配置表存在并初始化默认分类
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS resource_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(50) UNIQUE NOT NULL,
                is_default BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS system_settings (
                key VARCHAR(50) PRIMARY KEY,
                value TEXT NOT NULL
            )
        """))
        for cat in ('教材', '工具', '网站'):
            connection.execute(text("INSERT OR IGNORE INTO resource_categories (name, is_default) VALUES (:name, 1)"), {"name": cat})
        connection.execute(text("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('abstract_reminder_days', '7')"))
        connection.execute(text("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('arxiv_reminder_days', '7')"))
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS user_mail_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
                email_address VARCHAR(150) NOT NULL,
                protocol VARCHAR(10) DEFAULT 'imap',
                server_host VARCHAR(150) NOT NULL,
                server_port INTEGER DEFAULT 993,
                use_ssl BOOLEAN DEFAULT 1,
                username VARCHAR(150) NOT NULL,
                encrypted_password TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS user_cached_emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
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
                poster_url TEXT DEFAULT '',
                attachments TEXT DEFAULT '[]',
                is_read BOOLEAN DEFAULT 0,
                fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_user_cached_emails_uid ON user_cached_emails(user_id, msg_uid)"))
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS paper_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                paper_id INTEGER NOT NULL REFERENCES arxiv_papers(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_paper_comments_paper ON paper_comments(paper_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_paper_comments_user ON paper_comments(user_id)"))


