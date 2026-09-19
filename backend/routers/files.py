from uuid import uuid4
from urllib.parse import quote
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..database import get_db
from ..models import UploadedFile, User

import hashlib

router = APIRouter(prefix='/api/files', tags=['Files'])
MAX_BYTES = 15 * 1024 * 1024
ALLOWED = {
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}


def store_file(db, filename, content_type, content):
    if content_type not in ALLOWED:
        raise HTTPException(400, '附件仅支持 PDF、PPT、PPTX、Word (DOC/DOCX)、PNG、JPEG 或 WebP')
    if not content or len(content) > MAX_BYTES:
        raise HTTPException(400, '附件不能为空且不得超过 15 MB')

    file_hash = hashlib.sha256(content).hexdigest()
    try:
        existing = db.query(UploadedFile).filter(UploadedFile.sha256 == file_hash).first()
        if existing:
            return f'/api/files/{existing.id}'
    except Exception:
        pass

    file = UploadedFile(
        id=str(uuid4()),
        filename=(filename or 'attachment').replace('\r', '').replace('\n', ''),
        content_type=content_type,
        content=content,
        sha256=file_hash
    )
    db.add(file)
    db.flush()
    return f'/api/files/{file.id}'


@router.post('')
async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    content = await file.read(MAX_BYTES + 1)
    import mimetypes
    kind = mimetypes.guess_type(file.filename or '')[0] or file.content_type
    url = store_file(db, file.filename, kind, content)
    db.commit()
    return {'url': url, 'filename': file.filename}


@router.get('/{file_id}')
def download(file_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    file = db.get(UploadedFile, file_id)
    if not file:
        raise HTTPException(404, '附件不存在')
    return Response(file.content, media_type=file.content_type, headers={
        'Content-Disposition': f"inline; filename*=UTF-8''{quote(file.filename, safe='')}",
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; sandbox",
    })
