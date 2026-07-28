# Dev image. Build from the REPO ROOT context (compose sets context: . +
# dockerfile: frontend/Dockerfile) so the npm-workspaces install can link
# packages/* (shared-types, #820). The workspace-scoped install keeps the
# image lean — it skips the other workspace's dependency tree.
FROM node:22-alpine

WORKDIR /app

# fallow resolves `--base` by shelling out to git, and node:22-alpine ships none.
RUN apk add --no-cache git

COPY package.json package-lock.json ./
COPY packages/ packages/
COPY frontend/package.json frontend/
RUN npm install --workspace frontend

# fallow is pinned as a ROOT devDependency, which the workspace-scoped install
# above skips — and a local install would be shadowed by the node_modules named
# volumes regardless. The global bin escapes both, while reading the version
# from that one pin keeps CI, the lefthook hook and this container on the same
# binary. If you move the pin, this line moves with it (#1450).
RUN npm install -g "fallow@$(node -p 'require("/app/package.json").devDependencies.fallow')"

COPY . .

WORKDIR /app/frontend

EXPOSE 5173

# `npm install` runs on every start so the node_modules named volume reconciles
# with package.json — adding a dependency just needs `docker compose up --build`,
# no manual volume reset. It's a fast no-op when nothing changed. It must run
# from the workspace ROOT (npm resolves -w against the project root), and
# --no-package-lock keeps it from rewriting the bind-mounted root lockfile.
CMD ["sh", "-c", "cd /app && npm install --workspace frontend --no-package-lock && cd /app/frontend && npm run dev"]
