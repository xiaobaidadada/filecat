#!/usr/bin/env bash

set -e

echo "🚀 start filecat..."

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "📁 cwd: $DIR"

# node 可执行
if [ -f "./node" ]; then
    chmod +x ./node
fi

# 执行
if [ -f "./node" ]; then
    ./node main.js --install
else
    echo "❌ node not found"
    exit 1
fi