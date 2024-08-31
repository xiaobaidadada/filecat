@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

REM 设置 Git 代理
echo Setting Git proxy...
git config --global http.proxy 127.0.0.1:3067


REM 执行 Git 命令（替换为你需要的 Git 命令）
echo Executing Git command...
git pull

REM 取消 Git 代理
echo Unsetting Git proxy...
git config --global --unset http.proxy
git config --global --unset https.proxy

