# 在线面料检测平台 - 生产镜像
FROM node:22-alpine

WORKDIR /app

# 安装依赖（先拷贝 package.json 利用缓存）
COPY package.json ./
RUN npm install --omit=dev

# 拷贝后端与前端静态资源
COPY server ./server
COPY public ./public

# 数据目录（SQLite 数据库）
RUN mkdir -p /app/server/data && chmod 777 /app/server/data

ENV PORT=3001
ENV DB_PATH=/app/server/data/app.db
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "server/index.js"]
