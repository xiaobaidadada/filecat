@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

REM 检查是否传递了参数
if "%1"=="" (
    echo Please provide a repository URL for cloning.
    exit /b 1
)

REM 设置 Git 代理
echo Setting Git proxy...
git config --global http.proxy 127.0.0.1:3067


REM 执行 Git 命令（替换为你需要的 Git 命令）
echo Cloning repository...
git clone %1

REM 取消 Git 代理
echo Unsetting Git proxy...
git config --global --unset http.proxy
git config --global --unset https.proxy

