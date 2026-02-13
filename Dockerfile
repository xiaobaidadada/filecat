# 构建阶段
FROM node:18-slim AS builder
WORKDIR /build-stage
RUN apk add --no-cache \
    build-base \
    python3 \
    linux-headers \
    make \
    g++ \
    git

COPY package.json  ./
RUN  npm install
COPY . .
RUN npm run exe-build

# 运行环境
FROM node:18-slim
WORKDIR /filecat
COPY --from=builder /build-stage/build /filecat
COPY env /filecat/env

EXPOSE 5567
ENTRYPOINT ["node","/filecat/main.js"]
# 默认参数 有参数会被覆盖
CMD ["--env", "/filecat/env","--base_folder","/filecat"]