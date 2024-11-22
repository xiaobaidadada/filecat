FROM node:hydrogen-alpine3.20

WORKDIR /app

COPY env /app/env
COPY /build /app
#COPY /node_modules /app/node_modules
#COPY filecat-linux /app/filecat-linux
# 给 filecat-linux 添加执行权限
RUN #chmod +x /app/filecat-linux

EXPOSE 5567
ENTRYPOINT ["node","/app/main.js"]
# 默认参数 有参数会被覆盖
CMD ["--env", "/app/env","--base_folder","/home"]