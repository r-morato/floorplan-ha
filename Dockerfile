# --- build the UI ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# --- runtime: server + built UI ---
FROM node:22-alpine
ENV NODE_ENV=production PORT=8099 DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 8099
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8099/api/status || exit 1
CMD ["node", "server/index.mjs"]
