#!/usr/bin/env bash

for PORT in 3000 3001 3002 3003 3004 8080
do
  PID=$(lsof -ti :"$PORT" 2>/dev/null || true)

  if [ -n "$PID" ]; then
    kill "$PID" || true
  fi
done

echo "All physics platform services stopped."
