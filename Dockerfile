# Strike — container for Railway (long-running Node: persistent SQLite + 3s watcher).
# Single stage, kept simple and robust for the hackathon deploy.
FROM node:22-slim

# build tools for the better-sqlite3 native module (falls back to source if no prebuilt binary)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install deps against the lockfile first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# app source
COPY . .

# production build
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# SQLite files live in /app/data (created at runtime via mkdirSync). Attach a persistent
# disk there in your host's dashboard (Railway Volumes / Fly mounts) so they survive
# redeploys. No Dockerfile mount directive here on purpose (Railway rejects it).

# Bind explicitly to 0.0.0.0:3000 so it matches the port the host routes to
# (Railway may inject its own PORT var; the explicit -p flag wins and stays deterministic).
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
