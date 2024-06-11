#!/bin/bash


# 读取参数
PORT1=5567
PORT2=3001

# 查找并关闭第一个端口的程序
find_and_kill_process() {
  local PORT=$1
  local PID=$(lsof -t -i:$PORT)
  if [ -n "$PID" ]; then
    echo "Found process with PID $PID using port $PORT. Killing process..."
    kill $PID
    echo "Process killed."
  else
    echo "No process found using port $PORT."
  fi
}

# 查找并关闭第一个端口的程序
find_and_kill_process $PORT1

# 查找并关闭第二个端口的程序
find_and_kill_process $PORT2

npm install

nohup npm run dev >./nohup.out 2>&1 &
