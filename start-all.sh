#!/usr/bin/env bash
set -e

ROOT="$HOME/project/physics-platform"

mkdir -p "$ROOT/logs"

pkill -f "$ROOT/services/auth-service/server.js" 2>/dev/null || true
pkill -f "$ROOT/services/student-service/server.js" 2>/dev/null || true
pkill -f "$ROOT/services/content-service/server.js" 2>/dev/null || true
pkill -f "$ROOT/services/progress-service/server.js" 2>/dev/null || true
pkill -f "$ROOT/gateway/server.js" 2>/dev/null || true
pkill -f "$ROOT/frontend/server.js" 2>/dev/null || true

(cd "$ROOT/services/auth-service" && nohup node server.js > "$ROOT/logs/auth.log" 2>&1 &)
(cd "$ROOT/services/student-service" && nohup node server.js > "$ROOT/logs/student.log" 2>&1 &)
(cd "$ROOT/services/content-service" && nohup node server.js > "$ROOT/logs/content.log" 2>&1 &)
(cd "$ROOT/services/progress-service" && nohup node server.js > "$ROOT/logs/progress.log" 2>&1 &)
(cd "$ROOT/gateway" && nohup node server.js > "$ROOT/logs/gateway.log" 2>&1 &)

sleep 2

(cd "$ROOT/frontend" && nohup node server.js > "$ROOT/logs/frontend.log" 2>&1 &)

sleep 2

echo "Services started."
echo
echo "Frontend: http://localhost:3000"
echo "Gateway : http://localhost:8080"
echo
echo "Admin:"
echo "username: ahmedrabie"
echo "password: ahmedrabie"
