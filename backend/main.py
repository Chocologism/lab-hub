import os
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import engine, Base
from .routers import auth, arxiv, seminar, resources, library, talks, files, personal, account, mailbox, notices, system, schedule_imports
from .seed import init_db

from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# 创建 FastAPI 实例
app = FastAPI(
    title="LabOrbit API",
    description="专为学术课题组设计的内部文献交流、组会排期与资料整合系统",
    version="1.0.0"
)

# 静态资源缓存策略中间件：提升加载与互动响应速度
class CacheHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/assets/"):
            # Vite 打包产物带 hash，长期强缓存
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path == "/" or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
        return response

# 启用 GZip 压缩（将 550KB+ 的 JS/CSS 缩减至 180KB 以下，数倍提速）
app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(CacheHeaderMiddleware)

# 跨域配置（支持本地开发 5173 端口与公网访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载业务路由
app.include_router(auth.router)
app.include_router(arxiv.router)
app.include_router(seminar.router)
app.include_router(resources.router)
app.include_router(library.router)
app.include_router(talks.router)
app.include_router(files.router)
app.include_router(personal.router)
app.include_router(account.router)
app.include_router(mailbox.router)
app.include_router(notices.router)
app.include_router(system.router)
app.include_router(schedule_imports.router)



@app.on_event("startup")
def on_startup():
    """应用启动时自动建表并加载基础演示数据"""
    init_db()


@app.get("/api/health", tags=["System"])
def health_check():
    return {
        "status": "healthy",
        "service": "LabOrbit API",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# 挂载前端打包后的静态资源（生产环境单一端口运行）
FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # 如果请求的是未匹配的 API 或 assets，返回 404
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API 接口未找到")
        if full_path.startswith("assets/"):
            raise HTTPException(status_code=404, detail="静态资源未找到")
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Frontend is building or dist not ready"}
