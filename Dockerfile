# Combined single-origin image: builds the React SPA and serves it from the API
# server (SERVE_STATIC_DIR=/app/public). One container, one origin, one
# Cloudflare Access policy. This is the image the Railway dev environment uses.
#
# For independent/portable deploys, use backend/Dockerfile.prod and
# frontend/Dockerfile.prod instead (split mode, wired by CORS_ORIGIN +
# VITE_API_URL).

# 1. Build the SPA with a relative API base so it talks to the same origin.
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
ENV VITE_API_URL=/api
RUN npm run build

# 2. Build the backend: install deps, generate the Prisma client, compile TS.
FROM node:22-alpine AS backend
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install
COPY backend/ ./
# prisma.config.ts resolves env("DATABASE_URL") when the CLI loads it, so a
# placeholder is required even though `generate` never connects to a database.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate && npm run build

# 3. Runtime: the full backend tree (deps include the Prisma CLI + tsx needed by
# migrate/seed) plus the built SPA served as static files.
FROM node:22-alpine
WORKDIR /app
COPY --from=backend /app ./
COPY --from=frontend /frontend/dist ./public
ENV SERVE_STATIC_DIR=/app/public
ENV PORT=4000
EXPOSE 4000
# Apply migrations, run the seed, then start the server. The seed is idempotent
# (upserts only, catalog/reference data) so running it on every container start
# is safe; it adds a little startup latency but keeps reference data current.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/index.js"]
