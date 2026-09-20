#!/bin/bash
# ==============================================================================
# LabOrbit 服务器运维与后台进程管理脚本
# 用法:
#   ./deploy_server.sh start    # 启动后台服务 (screen 会话)
#   ./deploy_server.sh stop     # 停止后台服务
#   ./deploy_server.sh restart  # 重启后台服务
#   ./deploy_server.sh status   # 查看运行状态与网络端口
#   ./deploy_server.sh logs     # 实时查看最近运行日志
#   ./deploy_server.sh attach   # 进入 screen 交互会话 (退出按 Ctrl+A 然后按 D)
# ==============================================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

PID_FILE="$DIR/app.pid"
LOG_FILE="$DIR/app.log"
PORT="${PORT:-8000}"

is_running() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE" 2>/dev/null) 2>/dev/null; then
        return 0
    fi
    pgrep -f "backend.main:app" >/dev/null 2>&1
}

case "$1" in
    start)
        if is_running; then
            echo "⚠️  LabOrbit 服务已经在后台运行中！"
            echo "   可运行 './deploy_server.sh status' 查看详情。"
            exit 0
        fi
        echo "🚀 正在启动 LabOrbit 后台服务..."
        > "$LOG_FILE"
        nohup ./start.sh > "$LOG_FILE" 2>&1 &
        SERVER_PID=$!
        echo "$SERVER_PID" > "$PID_FILE"
        sleep 3
        if is_running; then
            echo "✅ 服务已在后台成功启动！(PID: $(cat "$PID_FILE" 2>/dev/null || echo $SERVER_PID))"
            echo "   - 日志文件: $LOG_FILE"
            echo "   - 本地访问: http://127.0.0.1:$PORT"
        else
            echo "❌ 启动异常，请检查日志: $LOG_FILE"
            tail -n 25 "$LOG_FILE"
            exit 1
        fi
        ;;

    stop)
        echo "🛑 正在停止 LabOrbit 后台服务..."
        if [ -f "$PID_FILE" ]; then
            kill -9 $(cat "$PID_FILE" 2>/dev/null) 2>/dev/null || true
            rm -f "$PID_FILE"
        fi
        pkill -9 -f "backend.main:app" 2>/dev/null || true
        sleep 1
        if ! is_running; then
            echo "✅ 服务已成功停止。"
        else
            echo "⚠️  部分进程可能残留，正在强制清理..."
            fuser -k "$PORT/tcp" 2>/dev/null || true
        fi
        ;;

    restart)
        echo "🔄 正在重启 LabOrbit 服务..."
        "$0" stop
        sleep 2
        "$0" start
        ;;

    status)
        echo "=================================================="
        echo "📊 LabOrbit 服务运行状态"
        echo "=================================================="
        if is_running; then
            PID_STR="$(cat "$PID_FILE" 2>/dev/null || pgrep -f "backend.main:app" | head -n 1)"
            echo "🟢 运行状态: 正在后台稳定运行 (PID: $PID_STR)"
            echo "🌐 监听端口检查:"
            (/usr/sbin/ss -tuln 2>/dev/null || netstat -tuln 2>/dev/null) | grep ":$PORT " || echo "   正在准备端口监听..."
            echo ""
            echo "🔗 访问地址:"
            echo "   - 本地直接访问: http://127.0.0.1:$PORT"
        else
            echo "🔴 运行状态: 未运行"
        fi
        echo "=================================================="
        ;;

    logs)
        if [ -f "$LOG_FILE" ]; then
            echo "📜 正在追踪服务日志 (按 Ctrl+C 退出):"
            tail -f -n 50 "$LOG_FILE"
        else
            echo "ℹ️  暂无日志文件 ($LOG_FILE)。"
        fi
        ;;

    *)
        echo "LabOrbit 服务管理工具"
        echo "用法: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
