from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, InviteCode, SystemSetting
from ..auth import (
    create_access_token,
    get_password_hash,
    get_current_user,
)

router = APIRouter(prefix="/api/system", tags=["System"])


def admin_only(user: User = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "仅管理员可访问此配置")
    return user


class SystemStatusOut(BaseModel):
    initialized: bool
    user_count: int
    lab_name: str
    lab_short_name: str
    site_slogan: str
    site_title: str
    institution: str
    default_location: str


class SystemSetupRequest(BaseModel):
    admin_name: str
    admin_real_name: Optional[str] = ""
    admin_email: str
    admin_password: str
    lab_name: str
    lab_short_name: str
    site_slogan: Optional[str] = "课题组科研协作与知识管理平台"
    site_title: Optional[str] = "Lab-Hub"
    invite_code: str
    institution: Optional[str] = ""
    default_location: Optional[str] = ""


class SystemSettingsUpdate(BaseModel):
    lab_name: Optional[str] = None
    lab_short_name: Optional[str] = None
    site_slogan: Optional[str] = None
    site_title: Optional[str] = None
    institution: Optional[str] = None
    default_location: Optional[str] = None
    ai_system_prompt: Optional[str] = None


def get_setting_val(db: Session, key: str, default: str = "") -> str:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return row.value if row else default


def set_setting_val(db: Session, key: str, value: str):
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=key, value=value))


@router.get("/status", response_model=SystemStatusOut)
def get_system_status(db: Session = Depends(get_db)):
    """公开端点：查询系统当前是否已初始化及基本站点元数据"""
    user_count = db.query(User).count()
    is_init = (user_count > 0) and (get_setting_val(db, "is_initialized", "") == "true" or user_count > 0)
    
    return {
        "initialized": is_init,
        "user_count": user_count,
        "lab_name": get_setting_val(db, "lab_name", "科研协作平台"),
        "lab_short_name": get_setting_val(db, "lab_short_name", "LabHub"),
        "site_slogan": get_setting_val(db, "site_slogan", "课题组科研协作与知识管理平台"),
        "site_title": get_setting_val(db, "site_title", "Lab-Hub"),
        "institution": get_setting_val(db, "institution", ""),
        "default_location": get_setting_val(db, "default_location", "研讨室 / 腾讯会议"),
    }


@router.post("/setup")
def setup_initial_system(req: SystemSetupRequest, db: Session = Depends(get_db)):
    """首次部署初始化向导：当系统无任何用户时，创建首位超级管理员并设定课题组必要参数"""
    user_count = db.query(User).count()
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="系统已完成初始化，禁止重复设置！",
        )

    admin_name = req.admin_name.strip()
    admin_email = req.admin_email.strip().lower()
    admin_password = req.admin_password.strip()
    lab_name = req.lab_name.strip()
    lab_short_name = req.lab_short_name.strip()
    invite_code = req.invite_code.strip().upper()

    if not admin_name or not admin_email or not admin_password:
        raise HTTPException(status_code=400, detail="管理员姓名、邮箱和密码为必填项")
    if len(admin_password) < 6:
        raise HTTPException(status_code=400, detail="管理员密码长度不得少于 6 位")
    if not lab_name or not lab_short_name:
        raise HTTPException(status_code=400, detail="课题组全称与缩写标识为必填项")
    if not invite_code:
        raise HTTPException(status_code=400, detail="初始成员注册邀请码不能为空")

    # 1. 创建超级管理员
    admin = User(
        name=admin_name,
        real_name=(req.admin_real_name or admin_name).strip(),
        nickname=admin_name,
        email=admin_email,
        hashed_password=get_password_hash(admin_password),
        role="admin",
        can_manage_seminars=True,
        tutorial_completed=False,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    # 2. 写入初始注册邀请码
    init_invite = InviteCode(
        code=invite_code,
        note="首次部署初始化默认邀请码",
        created_by_id=admin.id,
        is_active=True,
    )
    db.add(init_invite)

    # 3. 写入课题组全站配置
    set_setting_val(db, "is_initialized", "true")
    set_setting_val(db, "lab_name", lab_name)
    set_setting_val(db, "lab_short_name", lab_short_name)
    set_setting_val(db, "site_slogan", (req.site_slogan or "课题组科研协作与知识管理平台").strip())
    set_setting_val(db, "site_title", (req.site_title or "Lab-Hub").strip())
    set_setting_val(db, "institution", (req.institution or "").strip())
    set_setting_val(db, "default_location", (req.default_location or "研讨室 / 腾讯会议").strip())
    db.commit()

    # 4. 生成首位管理员登录 Token
    token = create_access_token(data={"sub": admin.id, "ver": admin.token_version})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": admin.id,
            "name": admin.name,
            "real_name": admin.real_name,
            "nickname": admin.nickname,
            "email": admin.email,
            "role": admin.role,
            "can_manage_seminars": admin.can_manage_seminars,
            "tutorial_completed": admin.tutorial_completed,
            "avatar": admin.avatar,
            "bio": admin.bio,
            "created_at": admin.created_at.isoformat(),
        },
    }


@router.get("/settings")
def get_system_settings(
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """获取课题组全量系统配置（管理员）"""
    return {
        "lab_name": get_setting_val(db, "lab_name", "科研协作平台"),
        "lab_short_name": get_setting_val(db, "lab_short_name", "LabHub"),
        "site_slogan": get_setting_val(db, "site_slogan", "课题组科研协作与知识管理平台"),
        "site_title": get_setting_val(db, "site_title", "Lab-Hub"),
        "institution": get_setting_val(db, "institution", ""),
        "default_location": get_setting_val(db, "default_location", "研讨室 / 腾讯会议"),
        "ai_system_prompt": get_setting_val(db, "ai_system_prompt", ""),
    }


@router.put("/settings")
def update_system_settings(
    body: SystemSettingsUpdate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """更新课题组全站配置（管理员）"""
    if body.lab_name is not None:
        set_setting_val(db, "lab_name", body.lab_name.strip())
    if body.lab_short_name is not None:
        set_setting_val(db, "lab_short_name", body.lab_short_name.strip())
    if body.site_slogan is not None:
        set_setting_val(db, "site_slogan", body.site_slogan.strip())
    if body.site_title is not None:
        set_setting_val(db, "site_title", body.site_title.strip())
    if body.institution is not None:
        set_setting_val(db, "institution", body.institution.strip())
    if body.default_location is not None:
        set_setting_val(db, "default_location", body.default_location.strip())
    if body.ai_system_prompt is not None:
        set_setting_val(db, "ai_system_prompt", body.ai_system_prompt.strip())

    db.commit()
    return {"message": "系统设置已更新"}
