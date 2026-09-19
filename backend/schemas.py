import re
import json
from datetime import datetime, date as calendar_date
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, StrictInt, field_validator, model_validator

# ==================== User & Auth Schemas ====================
class UserRegister(BaseModel):
    name: str
    nickname: str = ''
    email: str
    password: str
    invite_code: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    name: str
    real_name: str = ''
    nickname: str = ''
    email: str
    role: str
    can_manage_seminars: bool = False
    tutorial_completed: bool = False
    avatar: Optional[str] = None
    bio: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# ==================== arXiv Schemas ====================
class ArxivPreviewRequest(BaseModel):
    url_or_id: str

class ArxivPreviewResponse(BaseModel):
    arxiv_id: str
    title: str
    journal: Optional[str] = ''
    source_url: Optional[str] = ''
    authors: List[str]
    abstract: str
    primary_category: Optional[str] = None
    published_date: Optional[str] = None
    pdf_url: Optional[str] = None

class RecommendationVisibility(BaseModel):
    visibility: Literal['public', 'direct'] = 'public'
    recipient_ids: List[StrictInt] = Field(default_factory=list, max_length=100)
    recommend_comment: Optional[str] = None

    @model_validator(mode='after')
    def valid_audience(self):
        if self.visibility == 'direct' and not self.recipient_ids:
            raise ValueError('定向推荐至少选择一位接收人')
        if self.visibility == 'public' and self.recipient_ids:
            raise ValueError('公开推荐不能同时指定接收人')
        if any(i <= 0 for i in self.recipient_ids) or len(set(self.recipient_ids)) != len(self.recipient_ids):
            raise ValueError('接收人列表无效或重复')
        return self

class ArxivRecommendCreate(RecommendationVisibility):
    arxiv_id: str = ''
    title: str
    journal: Optional[str] = ''
    source_url: Optional[str] = ''
    authors: List[str]
    abstract: str
    primary_category: Optional[str] = None
    published_date: Optional[str] = None
    pdf_url: Optional[str] = None
    recommend_comment: Optional[str] = None
    is_pinned: bool = False

    @model_validator(mode='after')
    def valid_reference(self):
        from .services.paper_service import paper_key, http_url, source_link
        self.source_url = http_url(self.source_url or '')
        if self.pdf_url:
            self.pdf_url = http_url(self.pdf_url)
        self.arxiv_id = paper_key(self.arxiv_id, self.source_url)
        self.source_url = self.source_url or source_link(self.arxiv_id)
        self.title = self.title.strip()
        if not self.title:
            raise ValueError('论文标题不能为空')
        return self

class ArxivPaperUpdate(BaseModel):
    title: Optional[str] = None
    journal: Optional[str] = None
    abstract: Optional[str] = None
    source_url: Optional[str] = None
    pdf_url: Optional[str] = None
    recommend_comment: Optional[str] = None

class RecipientOut(BaseModel):
    id: int
    name: str

    model_config = {'from_attributes': True}


class CommentUserOut(BaseModel):
    id: int
    name: str
    real_name: Optional[str] = ''
    nickname: Optional[str] = ''
    avatar: Optional[str] = ''
    role: Optional[str] = ''
    identity: Optional[str] = ''

    model_config = {'from_attributes': True}


class PaperCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)


class PaperCommentOut(BaseModel):
    id: int
    paper_id: int
    user_id: int
    content: str
    created_at: datetime
    user: Optional[CommentUserOut] = None

    model_config = {'from_attributes': True}


class ArxivPaperOut(BaseModel):
    visibility: Literal['public', 'direct'] = 'public'
    recipients: List[RecipientOut] = Field(default_factory=list)
    id: int
    arxiv_id: str
    title: str
    journal: Optional[str] = ''
    source_url: Optional[str] = ''
    authors: List[str]
    abstract: str
    primary_category: Optional[str] = None
    published_date: Optional[str] = None
    pdf_url: Optional[str] = None
    recommend_comment: Optional[str] = None
    is_pinned: bool
    created_at: datetime
    recommender: UserOut
    read_count: int = 0
    is_read_by_me: bool = False
    comments: List[PaperCommentOut] = Field(default_factory=list)

    class Config:
        from_attributes = True

# ==================== Seminar Schemas ====================
class SeminarDateChange(BaseModel):
    id: StrictInt = Field(gt=0)
    expected_date: str
    date: str

    @field_validator("expected_date", "date")
    @classmethod
    def valid_calendar_date(cls, value):
        try:
            parsed = calendar_date.fromisoformat(value)
        except ValueError:
            raise ValueError("日期必须为有效的 YYYY-MM-DD")
        if parsed.isoformat() != value:
            raise ValueError("日期必须为 YYYY-MM-DD")
        return value


class SeminarReschedule(BaseModel):
    changes: List[SeminarDateChange] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [change.id for change in self.changes]
        if len(ids) != len(set(ids)):
            raise ValueError("同一组会只能提交一次改期")
        return self


class SeminarRescheduleResult(BaseModel):
    updated_ids: List[int]


def safe_link(value):
    if value and not (value.startswith(('https://', 'http://')) or re.fullmatch(r'/api/files/[a-f0-9-]{36}', value)):
        raise ValueError('链接必须为 HTTP(S) 地址或已上传的附件')
    return value


class PresentationInput(BaseModel):
    id: Optional[int] = None
    presenter_id: Optional[int] = Field(default=None, gt=0)
    presenter_name: str = Field(min_length=1, max_length=100)
    arxiv_id: Optional[str] = ""
    slides_url: Optional[str] = None

    @field_validator('arxiv_id')
    @classmethod
    def valid_arxiv(cls, value):
        if not value or not str(value).strip():
            return ""
        from .services.arxiv_service import extract_arxiv_id
        result = extract_arxiv_id(str(value).strip())
        if not result:
            raise ValueError('请输入有效的 arXiv 编号或链接')
        return result

    _safe_slides = field_validator('slides_url')(safe_link)

    class Config:
        from_attributes = True


class ScheduleValidation(BaseModel):
    @field_validator('date', check_fields=False)
    @classmethod
    def valid_date(cls, value):
        if value is None or calendar_date.fromisoformat(value).isoformat() != value:
            raise ValueError('请输入有效的 YYYY-MM-DD 日期')
        return value

    @field_validator('time', check_fields=False)
    @classmethod
    def valid_time(cls, value):
        if not value or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', value):
            raise ValueError('请输入有效的 HH:MM 时间')
        return value

    _safe_slides = field_validator('slides_url', check_fields=False)(safe_link)


class SeminarCreate(ScheduleValidation):
    @field_validator("presenter_name", mode="before")
    @classmethod
    def clean_presenter(cls, value):
        if value is None:
            return ""
        return str(value).strip()

    @field_validator("topic", mode="before")
    @classmethod
    def default_topic(cls, value):
        if not value or not str(value).strip():
            return "工作汇报（待定）"
        return str(value).strip()

    @field_validator("location", mode="before")
    @classmethod
    def default_location(cls, value):
        if not value or not str(value).strip():
            return "待定"
        return str(value).strip()

    date: str
    time: str = "14:30"
    location: str = "待定"
    presenter_name: str = ""
    presenter_id: Optional[int] = None
    topic: str = "工作汇报（待定）"
    paper_id: Optional[int] = None
    slides_url: Optional[str] = None
    notes: Optional[str] = None
    abstract: str = Field('', max_length=20000)
    presentations: List[PresentationInput] = Field(default_factory=list, max_length=20)

    @model_validator(mode='after')
    def validate_participants(self):
        has_presenter = bool(self.presenter_name and self.presenter_name.strip())
        has_sharers = any(bool(p.presenter_name and p.presenter_name.strip()) for p in (self.presentations or []))
        if not has_presenter and not has_sharers:
            raise ValueError("组会必须至少确定一位主讲人或 arXiv 分享人")
        if not has_presenter and (not self.topic or self.topic == "工作汇报（待定）"):
            self.topic = "arXiv 文献分享"
        return self

class SeminarUpdate(ScheduleValidation):
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    presenter_name: Optional[str] = None
    presenter_id: Optional[int] = None
    topic: Optional[str] = None
    paper_id: Optional[int] = None
    slides_url: Optional[str] = None
    notes: Optional[str] = None
    abstract: Optional[str] = Field(None, max_length=20000)
    status: Optional[str] = Field(None, pattern='^(upcoming|completed|cancelled)$')
    presentations: Optional[List[PresentationInput]] = Field(None, max_length=20)

class SeminarOut(BaseModel):
    presentations: List[PresentationInput] = Field(default_factory=list)
    id: int
    date: str
    time: str
    location: str
    presenter_name: str
    presenter_id: Optional[int] = None
    topic: str
    paper_id: Optional[int] = None
    paper: Optional[ArxivPaperOut] = None
    slides_url: Optional[str] = None
    notes: Optional[str] = None
    abstract: Optional[str] = ''
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# ==================== Resource Schemas ====================
class ResourceCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class ResourceCategoryOut(BaseModel):
    id: int
    name: str
    is_default: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class ResourceBookCreate(BaseModel):
    title: str
    original_title: Optional[str] = None
    authors: str = ""
    category: str = "教材"
    description: Optional[str] = None
    cover_url: Optional[str] = None
    tutorial_url: Optional[str] = None
    exercise_url: Optional[str] = None
    github_url: Optional[str] = None
    download_url: Optional[str] = None
    order_num: int = 0

    @field_validator('category')
    @classmethod
    def valid_category(cls, value):
        if not value or not str(value).strip():
            raise ValueError('资料分类不能为空')
        return str(value).strip()

    @model_validator(mode='after')
    def validate_authors_for_textbook(self):
        if self.category == '教材' and not (self.authors and self.authors.strip()):
            raise ValueError('添加教材时必须填写作者')
        return self


class ResourceBookOut(BaseModel):
    id: int
    title: str
    original_title: Optional[str] = None
    authors: str = ""
    category: str
    description: Optional[str] = None
    cover_url: Optional[str] = None
    tutorial_url: Optional[str] = None
    exercise_url: Optional[str] = None
    github_url: Optional[str] = None
    download_url: Optional[str] = None
    order_num: int
    favorite_count: int = 0
    created_at: datetime
    created_by_id: Optional[int] = None

    class Config:
        from_attributes = True


# ==================== Seminar Settings & Presentation Arxiv ====================
class SeminarSettings(BaseModel):
    abstract_reminder_days: int = Field(default=7, ge=1, le=60)
    arxiv_reminder_days: int = Field(default=7, ge=1, le=60)


class PresentationArxivInput(BaseModel):
    presentation_id: Optional[int] = None
    arxiv_id: Optional[str] = None
    slides_url: Optional[str] = None

    @field_validator('arxiv_id')
    @classmethod
    def valid_arxiv(cls, value):
        if not value or not value.strip():
            return ""
        from .services.arxiv_service import extract_arxiv_id
        result = extract_arxiv_id(value)
        if not result:
            raise ValueError('请输入有效的 arXiv 编号或链接')
        return result


class TalkInput(BaseModel):
    date: str
    end_date: str = Field('', max_length=10)
    time: str = Field('14:30', max_length=50)
    title: str = Field(min_length=1, max_length=1000)
    speaker: str = Field('', max_length=500)
    location: str = Field('', max_length=1000)
    poster_url: str = ''
    notes: str = Field('', max_length=20000)
    event_type: str = Field('talk', max_length=20)
    city: str = Field('', max_length=100)
    organizer: str = Field('', max_length=200)
    sub_type: str = Field('', max_length=50)
    abstract_deadline: str = Field('', max_length=10)
    early_bird_deadline: str = Field('', max_length=10)
    registration_deadline: str = Field('', max_length=10)
    website_url: str = Field('', max_length=2000)
    registration_url: str = Field('', max_length=2000)
    handbook_url: str = Field('', max_length=2000)
    source: str = Field('', max_length=200)
    _safe_poster = field_validator('poster_url')(safe_link)
    _safe_website = field_validator('website_url')(safe_link)
    _safe_registration = field_validator('registration_url')(safe_link)
    _safe_handbook = field_validator('handbook_url')(safe_link)

    @field_validator('date')
    @classmethod
    def valid_date(cls, value):
        if value is None or calendar_date.fromisoformat(value).isoformat() != value:
            raise ValueError('请输入有效的 YYYY-MM-DD 日期')
        return value

    @field_validator('time')
    @classmethod
    def valid_talk_time(cls, value):
        if not value or not str(value).strip():
            return '全天'
        val = str(value).strip()
        if val in ('全天', '待定', '上午', '下午'):
            return val
        time_pattern = r'^(?:[01]\d|2[0-3]):[0-5]\d(?:\s*-\s*(?:[01]\d|2[0-3]):[0-5]\d)?$'
        if not re.fullmatch(time_pattern, val):
            raise ValueError('请输入有效的 HH:MM 时间或时间段（例如 14:30 或 09:00 - 18:00）或填写“全天”')
        return val

    @field_validator('end_date')
    @classmethod
    def valid_end_date(cls, value):
        if not value:
            return ''
        if calendar_date.fromisoformat(value).isoformat() != value:
            raise ValueError('请输入有效的 YYYY-MM-DD 结束日期')
        return value


# ==================== Mailbox Schemas ====================
class MailConfigInput(BaseModel):
    email_address: str
    protocol: str = "imap"
    server_host: str
    server_port: int = 993
    use_ssl: bool = True
    username: str
    password: Optional[str] = None


class MailTestInput(BaseModel):
    email_address: Optional[str] = ""
    protocol: str = "imap"
    server_host: str
    server_port: int = 993
    use_ssl: bool = True
    username: str
    password: Optional[str] = ""


class MailConfigOut(BaseModel):
    has_config: bool
    email_address: Optional[str] = ""
    protocol: Optional[str] = "imap"
    server_host: Optional[str] = ""
    server_port: Optional[int] = 993
    use_ssl: Optional[bool] = True
    username: Optional[str] = ""
    has_password: bool = False
    updated_at: Optional[str] = ""


class EmailAttachmentOut(BaseModel):
    id: Optional[str] = ""
    filename: str
    content_type: str
    size: int
    url: str


class CachedEmailOut(BaseModel):
    id: int
    msg_uid: str
    subject: str
    sender_name: str
    sender_email: str
    recipient: str
    date_str: str
    snippet: str
    has_attachments: bool
    poster_url: Optional[str] = ""
    attachments: Optional[List[EmailAttachmentOut]] = Field(default_factory=list)
    is_read: bool
    fetched_at: Optional[datetime] = None

    @field_validator('attachments', mode='before')
    @classmethod
    def parse_attachments(cls, v, info):
        res = []
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    res = parsed
            except Exception:
                res = []
        elif isinstance(v, list):
            res = v
        if not res and hasattr(info, 'data') and isinstance(info.data, dict):
            poster = info.data.get('poster_url')
            if poster:
                res = [{"id": "", "filename": "邮件图片", "content_type": "image/jpeg", "size": 0, "url": poster}]
        return res

    class Config:
        from_attributes = True


class EmailDetailOut(CachedEmailOut):
    body_text: str = ""
    body_html: str = ""

