FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 4000

# `npm install` runs on every start so the node_modules named volume reconciles
# with package.json — adding a dependency just needs `docker compose up --build`,
# no manual volume reset. It's a fast no-op when nothing changed.
CMD ["sh", "-c", "npm install --no-package-lock && npx prisma generate && npx prisma migrate deploy && npx prisma db seed && npm run dev"]
