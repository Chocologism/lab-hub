from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import ResourceBook, ResourceCategory, User, Favorite
from ..schemas import ResourceBookCreate, ResourceBookOut, ResourceCategoryCreate, ResourceCategoryOut
from ..auth import get_current_user

router = APIRouter(prefix="/api/resources", tags=["Resources"])


def admin_only(user: User = Depends(get_current_user)):
    if user.role != 'admin':
        raise HTTPException(403, '只有管理员可以管理资料分类')
    return user


@router.get("/categories", response_model=List[ResourceCategoryOut])
def get_categories(db: Session = Depends(get_db)):
    """获取所有可用资料分类（默认+自定义）"""
    # 保证默认分类存在
    for default_cat in ('教材', '工具', '网站'):
        if not db.query(ResourceCategory).filter_by(name=default_cat).first():
            db.add(ResourceCategory(name=default_cat, is_default=True))
    db.commit()
    return db.query(ResourceCategory).order_by(ResourceCategory.is_default.desc(), ResourceCategory.id.asc()).all()


@router.post("/categories", response_model=ResourceCategoryOut, status_code=201)
def create_category(
    req: ResourceCategoryCreate,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db)
):
    """管理员新增资料分类"""
    name = req.name.strip()
    if not name:
        raise HTTPException(400, "分类名称不能为空")
    if name == "全部":
        raise HTTPException(400, "不能添加名为「全部」的分类")
    existing = db.query(ResourceCategory).filter_by(name=name).first()
    if existing:
        raise HTTPException(400, f"分类「{name}」已存在")
    cat = ResourceCategory(name=name, is_default=False)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{name}")
def delete_category(
    name: str,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db)
):
    """管理员删除自定义分类（系统内置分类不可删）"""
    cat = db.query(ResourceCategory).filter_by(name=name).first()
    if not cat:
        raise HTTPException(404, "分类不存在")
    if cat.is_default or name in ('教材', '工具', '网站'):
        raise HTTPException(400, "系统内置分类不可删除")
    db.delete(cat)
    db.commit()
    return {"message": f"分类「{name}」已删除"}


@router.post('/pdf', status_code=201)
async def upload_resource_pdf(file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from .files import store_file, MAX_BYTES
    content = await file.read(MAX_BYTES + 1)
    if not (file.filename or '').lower().endswith('.pdf') or not content.startswith(b'%PDF-'):
        raise HTTPException(400, '请选择有效的 PDF 文件')
    url = store_file(db, file.filename, 'application/pdf', content)
    db.commit()
    return {'url': url, 'filename': file.filename}


@router.get("/books", response_model=List[ResourceBookOut])
def get_resource_books(
    category: Optional[str] = Query(None),
    q: Optional[str] = Query(None, max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取教材与综述资料列表"""
    query = db.query(ResourceBook)
    if category and category != "全部":
        query = query.filter(ResourceBook.category == category)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(ResourceBook.title.ilike(term) | ResourceBook.authors.ilike(term) | ResourceBook.description.ilike(term))
    
    books = query.order_by(ResourceBook.order_num.asc(), ResourceBook.id.asc()).all()
    for b in books:
        b.favorite_count = db.query(func.count(Favorite.user_id)).filter(
            Favorite.kind == 'book',
            Favorite.target == str(b.id)
        ).scalar() or 0
    return books


@router.post("/books", response_model=ResourceBookOut)
def create_resource_book(
    req: ResourceBookCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """添加教材/综述卡片及配套外链矩阵"""
    book = ResourceBook(**req.model_dump(), created_by_id=current_user.id)
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


@router.put("/books/{book_id}", response_model=ResourceBookOut)
def update_resource_book(
    book_id: int,
    req: ResourceBookCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """编辑教材/综述信息与外链"""
    book = db.query(ResourceBook).filter(ResourceBook.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="未找到该教材资料")
    if book.created_by_id not in (None, current_user.id) and current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="只有资料上传者或管理员可以编辑")

    for field, value in req.model_dump().items():
        setattr(book, field, value)

    db.commit()
    db.refresh(book)
    return book


@router.delete("/books/{book_id}")
def delete_resource_book(
    book_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除教材卡片"""
    book = db.query(ResourceBook).filter(ResourceBook.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="未找到该教材资料")
    if book.created_by_id not in (None, current_user.id) and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="只有资料上传者或管理员可以删除")

    db.delete(book)
    db.commit()
    return {"message": "删除成功"}
