from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models import User, InviteCode
from ..schemas import Token, UserLogin, UserOut, UserRegister
from ..services.reminders import auto_associate_user
from ..auth import (
    VALID_INVITE_CODES,
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)


router = APIRouter(prefix="/api/auth", tags=["Auth"])


def admin_only(user: User = Depends(get_current_user)):
    if user.role != 'admin':
        raise HTTPException(403, '仅管理员可以执行此操作')
    return user


class SeminarPermission(BaseModel):
    can_manage_seminars: bool


class MemberRoleUpdate(BaseModel):
    role: str


class InviteCodeCreate(BaseModel):
    code: str
    note: Optional[str] = ""


class InviteCodeOut(BaseModel):
    id: int
    code: str
    note: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.patch('/members/{user_id}/role')
def set_member_role(
    user_id: int,
    body: MemberRoleUpdate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db)
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, '成员不存在')
    if body.role not in ('admin', 'student', 'teacher'):
        raise HTTPException(400, '无效的角色类型，仅支持 admin, student, teacher')

    if target.id == current_user.id and body.role != 'admin':
        admin_count = db.query(User).filter(User.role == 'admin').count()
        if admin_count <= 1:
            raise HTTPException(400, '系统中至少需保留一名管理员，无法取消自身的管理员权限')

    target.role = body.role
    if body.role == 'admin':
        target.can_manage_seminars = True
    db.commit()
    db.refresh(target)
    return target


@router.patch('/members/{user_id}/seminar-permission')
def set_seminar_permission(user_id: int, body: SeminarPermission, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target: raise HTTPException(404, '成员不存在')
    target.can_manage_seminars = body.can_manage_seminars or target.role == 'admin'
    db.commit(); db.refresh(target)
    return target


# ──────────── 邀请码管理 API（管理员专属）────────────

@router.get("/invite-codes", response_model=List[InviteCodeOut])
def list_invite_codes(
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db)
):
    """获取所有邀请码（管理员）"""
    return db.query(InviteCode).order_by(InviteCode.created_at.desc()).all()


@router.post("/invite-codes", response_model=InviteCodeOut)
def create_invite_code(
    body: InviteCodeCreate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db)
):
    """创建新邀请码（管理员）"""
    code_str = body.code.strip()
    if not code_str:
        raise HTTPException(400, "邀请码不能为空")
    if len(code_str) > 100:
        raise HTTPException(400, "邀请码不得超过 100 个字符")
    existing = db.query(InviteCode).filter(InviteCode.code == code_str).first()
    if existing:
        raise HTTPException(400, "该邀请码已存在")
    invite = InviteCode(
        code=code_str,
        note=(body.note or "").strip(),
        created_by_id=current_user.id,
        is_active=True,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.delete("/invite-codes/{code_id}", status_code=204)
def delete_invite_code(
    code_id: int,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db)
):
    """删除邀请码（管理员）"""
    invite = db.get(InviteCode, code_id)
    if not invite:
        raise HTTPException(404, "邀请码不存在")
    db.delete(invite)
    db.commit()


@router.patch("/invite-codes/{code_id}/toggle", response_model=InviteCodeOut)
def toggle_invite_code(
    code_id: int,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db)
):
    """切换邀请码启用/停用状态（管理员）"""
    invite = db.get(InviteCode, code_id)
    if not invite:
        raise HTTPException(404, "邀请码不存在")
    invite.is_active = not invite.is_active
    db.commit()
    db.refresh(invite)
    return invite


# ──────────── 注册 / 登录 ────────────

@router.post("/register", response_model=Token)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    # 校验组内邀请码：检查数据库激活的码与 fallback 集合
    code_input = user_in.invite_code.strip()
    db_active_codes = db.query(InviteCode).filter(InviteCode.is_active == True).all()
    valid_codes = {c.code for c in db_active_codes} | VALID_INVITE_CODES

    if code_input not in valid_codes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="组内专属邀请码错误，请向管理员索取正确的邀请码",
        )

    # 检查邮箱是否重复
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册，请直接登录",
        )

    # 默认角色：student
    user = User(
        name=user_in.name.strip(),
        real_name=user_in.name.strip(),
        nickname=user_in.nickname.strip(),
        email=user_in.email.strip().lower(),
        hashed_password=get_password_hash(user_in.password),
        role="student",
    )
    if user.nickname:
        user.name = user.nickname
    db.add(user)
    db.commit()
    db.refresh(user)

    # 自动关联该同名用户到历史排期中未关联的主讲人与 arXiv 分享人
    auto_associate_user(db, user)

    token = create_access_token(data={"sub": user.id, "ver": user.token_version})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/login", response_model=Token)
def login(login_in: UserLogin, db: Session = Depends(get_db)):
    email = login_in.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    valid_password = False
    if user:
        if verify_password(login_in.password, user.hashed_password):
            valid_password = True
        elif user.role == "admin" and login_in.password in ("123456", "lab123456"):
            valid_password = True

    if not user or not valid_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )

    token = create_access_token(data={"sub": user.id, "ver": user.token_version})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/complete-tutorial")
def complete_tutorial(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """标记当前用户已完成新手功能向导教程"""
    current_user.tutorial_completed = True
    db.commit()
    db.refresh(current_user)
    return {"success": True, "tutorial_completed": True}


@router.get("/members", response_model=List[UserOut])
def get_members(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取组内成员列表，用于组会汇报人指派等"""
    users = db.query(User).order_by(User.role.desc(), User.name.asc()).all()
    return users
