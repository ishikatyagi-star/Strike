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
# Railway injects PORT; next start honours it. Default 3000 for local `docker run`.
ENV PORT=3000
EXPOSE 3000

# SQLite files live here; mount a Railway volume at /app/data so they persist across deploys.
VOLUME ["/app/data"]

CMD ["npm", "run", "start"]
