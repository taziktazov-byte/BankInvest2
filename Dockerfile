# BankInvest server: веб-версия + REST API для десктопа.
# ВАЖНО: db.js ищет SQL-скрипты по пути ../../db от своей папки (src/), поэтому
# внутри образа структура должна быть такой: /app/server/src/... и /app/db/...
FROM node:22-alpine

WORKDIR /app/server

# Сначала только манифесты — слой с зависимостями кешируется
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Код сервера и веб-версии: /app/server/src, /app/server/web
COPY server/src ./src
COPY server/web ./web

# Скрипты базы: /app/db (рядом с server/, как в репозитории)
COPY db /app/db

ENV NODE_ENV=production \
    PORT=8787 \
    MSSQL_SERVER=sqlserver,1433 \
    MSSQL_DATABASE=BankInvest \
    BANKINVEST_AUTO_SCHEMA=1 \
    BANKINVEST_AUTO_SEED=1

EXPOSE 8787

CMD ["node", "src/server.js"]
