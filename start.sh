#!/bin/bash
set -e

export PATH="$HOME/bin:$PATH"

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

echo "=================================================="
echo "🚀 启动课题组科研协作平台 (Lab-Hub)..."
echo "=================================================="

# 1. 检查 Python 虚拟环境
if [ ! -d ".venv" ]; then
    echo "📦 创建 Python 虚拟环境..."
    python3 -m venv .venv
    source .venv/bin/activate
    echo "📦 安装后端依赖..."
    pip install -r backend/requirements.txt
else
    source .venv/bin/activate
    python -c 'from PIL import Image' 2>/dev/null || pip install -r backend/requirements.txt
fi

# 2. 前端构建检查
if command -v npm >/dev/null 2>&1; then
    if [ ! -d "frontend/dist" ] || [ "${FORCE_BUILD:-0}" = "1" ]; then
        echo "正在构建前端资源 (npm run build)..."
        if [ ! -d "frontend/node_modules" ]; then
            npm --prefix frontend ci
        fi
        npm --prefix frontend run build
    else
        echo "已检测到前端产物 (frontend/dist)，跳过重复构建（若需重新编译可设 FORCE_BUILD=1）"
    fi
elif [ -d "frontend/dist" ]; then
    echo "未检测到 npm，直接使用已有前端产物 (frontend/dist)..."
else
    echo "❌ 错误：未检测到 npm 命令且 frontend/dist 产物不存在，无法启动网页！"
    exit 1
fi

# 3. 检查并同步 SQLite WAL 状态，防止代码拉取后 WAL 状态不一致导致锁阻塞
if [ -f "backend/labhub.db" ]; then
    python3 -c "import sqlite3; con = sqlite3.connect('backend/labhub.db'); con.execute('PRAGMA wal_checkpoint(TRUNCATE);'); con.close()" 2>/dev/null || true
fi

# 4. 启动服务
echo "=================================================="
echo "🎉 Lab-Hub 服务准备就绪！"
echo "🌐 本地直接访问: http://127.0.0.1:${PORT}"
echo "🌐 局域网/服务器直连: http://${HOST}:${PORT}"
echo ""
echo "💡 提示："
echo "   - 若为首次部署，请在浏览器打开上述地址，将自动引导进入【首次部署初始化向导】"
echo "   - 首位注册用户将自动设为超级管理员并完成课题组全站配置"
echo "=================================================="
echo ""

APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${PORT:-8000}"

exec python3 -c "import uvicorn; uvicorn.run('backend.main:app', host='$APP_HOST', port=int('$APP_PORT'), loop='asyncio')"
