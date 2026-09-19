import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# 数据库文件保存在 backend 目录下（或通过环境变量指定）
DB_PATH = os.getenv("LABHUB_DB_PATH", os.path.join(os.path.dirname(__file__), "labhub.db"))
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30}
)

# 针对服务器与 NFS 存储优化 SQLite 性能：
# 1. 调大内存缓存至 64MB (cache_size = -64000)
# 2. 临时表放内存 (temp_store = MEMORY)
# 3. 降低同步等待 (synchronous = NORMAL/OFF)，极大消除 NFS 磁盘 IO 延迟
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=-64000")
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
