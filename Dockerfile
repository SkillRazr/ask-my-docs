# The API and web UI as one container image, for Cloud Run (episode 10).
# Two stages: the first builds, the second keeps only what's needed to run.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY public ./public
COPY sql ./sql
# Run as the unprivileged "node" user that the image already has, not as root.
USER node
# Cloud Run tells the app which port to use in PORT (8080 by default).
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--enable-source-maps", "--import", "./dist/telemetry.mjs", "dist/server.mjs"]
