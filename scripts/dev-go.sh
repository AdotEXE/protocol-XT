#!/usr/bin/env bash
# dev:go for Linux — запуск dev:unified с очисткой портов
# Порты: Server 8000, Client 5000, Editor 3000, HTTP 7000, Web Dashboard 9000

set -e

# Локальный IP (первый не loopback)
get_local_ip() {
  if command -v hostname &>/dev/null; then
    hostname -I 2>/dev/null | awk '{print $1}'
  elif command -v ip &>/dev/null; then
    ip -4 route get 1 2>/dev/null | grep -oP 'src \K[0-9.]+' || true
  else
    echo ""
  fi
}

LOCAL_IP=$(get_local_ip)

echo ""
echo "╔═════════════════════════════════════════════════════════╗"
echo "║      PROTOCOL TX - UNIFIED DEVELOPMENT DASHBOARD        ║"
echo "╠═════════════════════════════════════════════════════════╣"
echo "║  Порты:                                                 ║"
echo "║     Server:          ws://localhost:8000  (WebSocket)   ║"
echo "║     Client:        http://localhost:5001  (Vite)        ║"
echo "║     Editor:        http://localhost:3000  (PolyGen)     ║"
echo "║     HTTP API:      http://localhost:7001  (мониторинг)  ║"
echo "║     Web Dashboard: http://localhost:9000  (опционально) ║"
echo "╠═════════════════════════════════════════════════════════╣"
if [ -n "$LOCAL_IP" ]; then
  echo "║  Сетевой доступ:                                        ║"
  echo "║     Client:        http://${LOCAL_IP}:5001              ║"
  echo "║     Server:          ws://${LOCAL_IP}:8000              ║"
  echo "║     Editor:        http://${LOCAL_IP}:3000              ║"
fi
echo "╚═════════════════════════════════════════════════════════╝"
echo ""

# Освобождаем порты (lsof или fuser)
kill_port() {
  local port=$1
  if command -v lsof &>/dev/null; then
    local pid
    pid=$(lsof -ti ":$port" 2>/dev/null) || true
    if [ -n "$pid" ]; then
      echo "[*] Освобождаю порт $port (PID $pid)"
      kill -9 $pid 2>/dev/null || true
      sleep 1
    fi
  elif command -v fuser &>/dev/null; then
    if fuser -k "$port/tcp" 2>/dev/null; then
      echo "[*] Освобождаю порт $port"
      sleep 1
    fi
  fi
}

echo "[*] Очистка портов (3000, 5001, 7001, 8000, 9000)..."
for p in 3000 5001 7001 8000 9000; do
  kill_port $p
done
echo "[+] Готово."
echo ""

echo "[*] Запуск dev:unified..."
exec npm run dev:unified
