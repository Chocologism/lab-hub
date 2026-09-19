import io
import re
import warnings
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..schemas import UserOut, Token
from ..auth import get_current_user, verify_password, get_password_hash, create_access_token
from ..services.reminders import auto_associate_user
from .files import store_file

router = APIRouter(prefix='/api/account', tags=['Account'])


class ProfileInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    real_name: str = Field(min_length=1, max_length=100)
    nickname: str = Field('', max_length=50)


@router.put('/profile', response_model=UserOut)
def profile(body: ProfileInput, user=Depends(get_current_user), db: Session = Depends(get_db)):
    user.real_name, user.nickname = body.real_name, body.nickname
    user.name = body.nickname or body.real_name
    db.commit(); db.refresh(user)
    auto_associate_user(db, user)
    return user


class CredentialsInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    current_password: str = Field(min_length=1, max_length=200)
    email: str | None = None
    new_password: str | None = None

    @field_validator('email')
    @classmethod
    def email_format(cls, value):
        if value is None:
            return value
        value = value.strip().lower()
        if len(value) > 100 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('请输入有效邮箱')
        return value

    @field_validator('new_password')
    @classmethod
    def password_length(cls, value):
        if value is not None and (len(value) < 8 or len(value.encode('utf-8')) > 72):
            raise ValueError('密码至少 8 个字符，最多 72 字节')
        return value


@router.put('/credentials', response_model=Token)
def credentials(body: CredentialsInput, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(400, '当前密码错误')
    if body.email is None and body.new_password is None:
        raise HTTPException(400, '请填写新邮箱或新密码')
    if body.email is not None:
        existing = db.query(User).filter(func.lower(User.email) == body.email, User.id != user.id).first()
        if existing:
            raise HTTPException(409, '该邮箱已被使用')
        user.email = body.email
    if body.new_password is not None:
        user.hashed_password = get_password_hash(body.new_password)
    user.token_version += 1
    try:
        db.commit(); db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, '该邮箱已被使用')
    return {'access_token': create_access_token({'sub': user.id, 'ver': user.token_version}), 'user': user}


@router.post('/avatar', response_model=UserOut)
async def avatar(file: UploadFile = File(...), user=Depends(get_current_user), db: Session = Depends(get_db)):
    MAX_AVATAR_BYTES = 200 * 1024 # 200 KB
    content = await file.read(MAX_AVATAR_BYTES + 1)
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(400, '头像文件大小不得超过 200 KB，请压缩后重新上传')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                if image.format not in ('JPEG', 'PNG', 'WEBP') or image.width * image.height > 20000000:
                    raise ValueError()
                image = ImageOps.exif_transpose(image).convert('RGB')
                image = ImageOps.fit(image, (256, 256))
                out = io.BytesIO(); image.save(out, format='JPEG', quality=88)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(400, '请上传有效的 PNG、JPEG 或 WebP 图片（不超过 2000 万像素）')
    user.avatar = store_file(db, 'avatar.jpg', 'image/jpeg', out.getvalue())
    db.commit(); db.refresh(user)
    return user
