from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, LargeBinary
from sqlalchemy.orm import relationship

from .database import Base

class InviteCode(Base):
    __tablename__ = "invite_codes"
    id = Column(Integer, primary_key=True)
    code = Column(String(100), unique=True, nullable=False, index=True)
    note = Column(String(200), default="")         # 用途备注（可选）
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True, nullable=False)



class Favorite(Base):
    __tablename__ = 'favorites'
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    kind = Column(String(10), primary_key=True)
    target = Column(String(50), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class IssueFeedback(Base):
    __tablename__ = 'issue_feedback'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    title = Column(String(150), nullable=False)
    content = Column(Text, nullable=False)
    page = Column(String(300), default='')
    resolved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FeedbackReply(Base):
    __tablename__ = 'feedback_replies'
    id = Column(Integer, primary_key=True)
    feedback_id = Column(Integer, ForeignKey('issue_feedback.id'), nullable=False, index=True)
    admin_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime, nullable=True)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    real_name = Column(String(100), default='', nullable=False)
    nickname = Column(String(50), default='', nullable=False)
    token_version = Column(Integer, default=0, nullable=False)
    can_manage_seminars = Column(Boolean, default=False, nullable=False)
    tutorial_completed = Column(Boolean, default=False, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    role = Column(String(20), default="student")  # "student", "teacher", "admin"
    avatar = Column(String(255), nullable=True)
    bio = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    recommended_papers = relationship("ArxivPaper", back_populates="recommender")
    read_marks = relationship("PaperReadMark", back_populates="user")
    seminars = relationship("SeminarSchedule", back_populates="presenter")


class ArxivPaper(Base):
    __tablename__ = "arxiv_papers"

    id = Column(Integer, primary_key=True, index=True)
    arxiv_id = Column(String(50), index=True, nullable=False)
    title = Column(String(300), nullable=False)
    journal = Column(String(300), default='')
    source_url = Column(Text, default='')
    authors = Column(Text, nullable=False)  # JSON or逗号分隔字符串
    abstract = Column(Text, nullable=False)
    primary_category = Column(String(50), nullable=True)
    published_date = Column(String(30), nullable=True)
    pdf_url = Column(String(255), nullable=True)
    
    recommended_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recommend_comment = Column(Text, nullable=True)
    is_pinned = Column(Boolean, default=False)
    seminar_id = Column(Integer, ForeignKey("seminar_schedules.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    recommender = relationship("User", back_populates="recommended_papers")
    read_marks = relationship("PaperReadMark", back_populates="paper", cascade="all, delete-orphan")
    comments = relationship("PaperComment", back_populates="paper", cascade="all, delete-orphan", order_by="PaperComment.id.asc()")
    seminar_links = relationship("SeminarSchedule", foreign_keys="[SeminarSchedule.paper_id]", back_populates="paper")
    seminar = relationship("SeminarSchedule", foreign_keys=[seminar_id])
    audience = relationship("RecommendationAudience", back_populates="paper", uselist=False, cascade="all, delete-orphan")


class PaperReadMark(Base):
    __tablename__ = "paper_read_marks"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("arxiv_papers.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    paper = relationship("ArxivPaper", back_populates="read_marks")
    user = relationship("User", back_populates="read_marks")


class PaperComment(Base):
    __tablename__ = "paper_comments"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("arxiv_papers.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    paper = relationship("ArxivPaper", back_populates="comments")
    user = relationship("User")


class SeminarSchedule(Base):
    __tablename__ = "seminar_schedules"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String(30), nullable=False)       # 如 "2026-09-18"
    time = Column(String(30), default="14:30")      # 如 "14:30"
    location = Column(String(100), default="物理楼研讨室 / 腾讯会议")
    presenter_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    presenter_name = Column(String(50), nullable=False)
    topic = Column(String(255), nullable=False)
    paper_id = Column(Integer, ForeignKey("arxiv_papers.id"), nullable=True)
    slides_url = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    abstract = Column(Text, default='')
    status = Column(String(20), default="upcoming")  # "upcoming", "completed", "cancelled"
    created_at = Column(DateTime, default=datetime.utcnow)

    presenter = relationship("User", back_populates="seminars")
    paper = relationship("ArxivPaper", foreign_keys=[paper_id], back_populates="seminar_links")
    presentations = relationship("SeminarPresentation", back_populates="seminar",
                                 cascade="all, delete-orphan", order_by="SeminarPresentation.position")


class ResourceCategory(Base):
    __tablename__ = "resource_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(50), primary_key=True)
    value = Column(Text, nullable=False)


class ResourceBook(Base):
    __tablename__ = "resource_books"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    original_title = Column(String(150), nullable=True)
    authors = Column(String(150), default='', nullable=False)
    category = Column(String(50), default="教材")
    description = Column(Text, nullable=True)
    cover_url = Column(String(255), nullable=True)
    
    # 快捷跳转胶囊外链矩阵
    tutorial_url = Column(String(255), nullable=True)   # 官方教程 / 在线讲义
    exercise_url = Column(String(255), nullable=True)   # 习题解答
    github_url = Column(String(255), nullable=True)     # GitHub 代码仓
    download_url = Column(String(255), nullable=True)   # 课件/电子版资料下载
    created_by_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    
    order_num = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class LibraryPaper(Base):
    __tablename__ = "library_papers"
    id = Column(Integer, primary_key=True)
    arxiv_id = Column(String(50), unique=True, nullable=False, index=True)
    title = Column(Text, nullable=False)
    journal = Column(String(300), default='')
    source_url = Column(Text, default='')
    authors = Column(Text, default="[]")
    abstract = Column(Text, default="")
    primary_category = Column(String(50), default="")
    published_date = Column(String(30), default="")
    pdf_url = Column(Text)
    metadata_status = Column(String(20), default="ready")
    identity_checked_at = Column(DateTime, nullable=True)
    from_recommendation = Column(Boolean, default=False)
    from_seminar = Column(Boolean, default=False)
    seminar_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class LibraryAlias(Base):
    __tablename__ = 'library_aliases'
    key = Column(Text, primary_key=True)
    library_id = Column(Integer, ForeignKey('library_papers.id'), nullable=False, index=True)


class SeminarPresentation(Base):
    __tablename__ = "seminar_presentations"
    id = Column(Integer, primary_key=True)
    seminar_id = Column(Integer, ForeignKey("seminar_schedules.id"), nullable=False, index=True)
    position = Column(Integer, default=0)
    presenter_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    presenter_name = Column(String(100), nullable=False)
    arxiv_id = Column(String(50), default='', nullable=False)
    slides_url = Column(Text)
    seminar = relationship("SeminarSchedule", back_populates="presentations")


class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(String(36), primary_key=True)
    filename = Column(Text, nullable=False)
    content_type = Column(String(100), nullable=False)
    content = Column(LargeBinary, nullable=False)
    sha256 = Column(String(64), default="", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ObservatoryTalk(Base):
    __tablename__ = "observatory_talks"
    id = Column(Integer, primary_key=True)
    date = Column(String(10), nullable=False, index=True)
    end_date = Column(String(10), default="")
    time = Column(String(50), nullable=False, default="14:30")
    title = Column(Text, nullable=False)
    speaker = Column(Text, default="")
    location = Column(Text, default="")
    poster_url = Column(Text, default="")
    notes = Column(Text, default="")
    event_type = Column(String(20), default="talk")
    city = Column(String(100), default="")
    organizer = Column(String(200), default="")
    sub_type = Column(String(50), default="")
    abstract_deadline = Column(String(10), default="")
    early_bird_deadline = Column(String(10), default="")
    registration_deadline = Column(String(10), default="")
    website_url = Column(Text, default="")
    registration_url = Column(Text, default="")
    handbook_url = Column(Text, default="")
    source = Column(String(200), default="")
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RecommendationAudience(Base):
    """No audience row means a public recommendation, including all legacy data."""
    __tablename__ = 'recommendation_audiences'
    paper_id = Column(Integer, ForeignKey('arxiv_papers.id'), primary_key=True)
    paper = relationship('ArxivPaper', back_populates='audience')
    recipients = relationship('RecommendationRecipient', cascade='all, delete-orphan')


class RecommendationRecipient(Base):
    __tablename__ = 'recommendation_recipients'
    paper_id = Column(Integer, ForeignKey('recommendation_audiences.paper_id'), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    user = relationship('User')


class LibraryAccess(Base):
    """Retain private library access even after the recommendation is removed."""
    __tablename__ = 'library_access'
    paper_id = Column(Integer, ForeignKey('library_papers.id'), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)


class LibraryRecommendationSource(Base):
    """Per-recommendation grants; deletion detaches the source and preserves the archive."""
    __tablename__ = 'library_recommendation_sources'
    id = Column(Integer, primary_key=True)
    library_id = Column(Integer, ForeignKey('library_papers.id'), nullable=False, index=True)
    recommendation_id = Column(Integer, unique=True, nullable=True)
    is_public = Column(Boolean, default=False, nullable=False)
    user_ids = Column(Text, default='[]', nullable=False)


class UserMailConfig(Base):
    __tablename__ = "user_mail_configs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    email_address = Column(String(150), nullable=False)
    protocol = Column(String(10), default="imap")  # "imap" or "pop3"
    server_host = Column(String(150), nullable=False)
    server_port = Column(Integer, default=993)
    use_ssl = Column(Boolean, default=True)
    username = Column(String(150), nullable=False)
    encrypted_password = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


class UserCachedEmail(Base):
    __tablename__ = "user_cached_emails"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    msg_uid = Column(String(150), nullable=False, index=True)
    subject = Column(Text, default="")
    sender_name = Column(String(150), default="")
    sender_email = Column(String(150), default="")
    recipient = Column(Text, default="")
    date_str = Column(String(100), default="")
    snippet = Column(Text, default="")
    body_text = Column(Text, default="")
    body_html = Column(Text, default="")
    has_attachments = Column(Boolean, default=False)
    poster_url = Column(Text, default="")
    attachments = Column(Text, default="[]")
    is_read = Column(Boolean, default=False)
    fetched_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class Notice(Base):
    __tablename__ = "notices"
    id = Column(Integer, primary_key=True)
    title = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String(50), default="general")
    importance = Column(String(20), default="normal")
    start_date = Column(String(30), default="")
    end_date = Column(String(30), default="", index=True)
    attachments = Column(Text, default="[]")
    source_email_uid = Column(String(150), default="", index=True)
    source_email_subject = Column(Text, default="")
    source_email_sender = Column(Text, default="")
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_name = Column(String(100), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User")


