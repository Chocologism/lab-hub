-- Cloudflare D1 Database Schema for Lab-Hub
-- Fully compatible with SQLite & Cloudflare D1

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL,
    real_name TEXT NOT NULL DEFAULT '',
    nickname TEXT NOT NULL DEFAULT '',
    email VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(200) NOT NULL,
    role VARCHAR(20) DEFAULT 'student',
    identity VARCHAR(20) NOT NULL DEFAULT 'student',
    avatar VARCHAR(255),
    bio VARCHAR(255),
    token_version INTEGER NOT NULL DEFAULT 0,
    can_manage_seminars INTEGER NOT NULL DEFAULT 0,
    tutorial_completed INTEGER NOT NULL DEFAULT 0,
    last_active_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at);

CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    note TEXT NOT NULL DEFAULT '',
    registration_role TEXT NOT NULL DEFAULT 'student' CHECK (registration_role IN ('student', 'admin')),
    registration_identity TEXT NOT NULL DEFAULT 'student' CHECK (registration_identity IN ('student', 'teacher')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by_id INTEGER REFERENCES users(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invite_codes_active ON invite_codes(is_active);

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
    seminar_id INTEGER REFERENCES seminar_schedules(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_arxiv_papers_arxiv_id ON arxiv_papers(arxiv_id);
CREATE INDEX IF NOT EXISTS idx_arxiv_papers_seminar_id ON arxiv_papers(seminar_id);

CREATE TABLE IF NOT EXISTS paper_read_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES arxiv_papers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_read_marks_paper_user ON paper_read_marks(paper_id, user_id);

CREATE TABLE IF NOT EXISTS paper_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES arxiv_papers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_paper_comments_paper ON paper_comments(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_comments_user ON paper_comments(user_id);

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
    seminar_id INTEGER REFERENCES seminar_schedules(id),
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
    end_date VARCHAR(10) DEFAULT '',
    time VARCHAR(30) NOT NULL DEFAULT '14:30',
    title TEXT NOT NULL,
    speaker TEXT DEFAULT '',
    location TEXT DEFAULT '',
    poster_url TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    event_type VARCHAR(20) DEFAULT 'talk',
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

CREATE TABLE IF NOT EXISTS schedule_interests (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL, -- 'seminar' | 'talk'
    item_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_schedule_interests_item ON schedule_interests(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_schedule_interests_user ON schedule_interests(user_id);

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
    poster_url TEXT DEFAULT '',
    is_read BOOLEAN DEFAULT 0,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cached_emails_user_uid ON user_cached_emails(user_id, msg_uid);

CREATE TABLE IF NOT EXISTS system_smtp_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    host VARCHAR(150) NOT NULL,
    port INTEGER NOT NULL DEFAULT 465,
    use_ssl BOOLEAN NOT NULL DEFAULT 1,
    username VARCHAR(150) NOT NULL,
    encrypted_password TEXT NOT NULL,
    from_email VARCHAR(150) NOT NULL,
    from_name VARCHAR(100) DEFAULT '',
    use_imap_password BOOLEAN DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sent_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    sender_name VARCHAR(150) NOT NULL,
    sender_email VARCHAR(150) NOT NULL,
    recipients TEXT NOT NULL,
    body_text TEXT NOT NULL,
    body_html TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'sent',
    error_message TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sent_emails_user ON sent_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_created ON sent_emails(created_at);

CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    importance VARCHAR(20) DEFAULT 'normal',
    start_date VARCHAR(30) DEFAULT '',
    end_date VARCHAR(30) DEFAULT '',
    source_email_uid VARCHAR(150) DEFAULT '',
    source_email_subject TEXT DEFAULT '',
    source_email_sender TEXT DEFAULT '',
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(100) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notices_source_uid ON notices(source_email_uid);
CREATE INDEX IF NOT EXISTS idx_notices_end_date ON notices(end_date);

