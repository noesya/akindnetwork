# Backend Moleculer node — production image.
# Build context is ../backend/ from deploy/docker-compose.yml.

FROM node:22-alpine AS deps
WORKDIR /app

# Install only production deps. Use a clean copy to leverage Docker layer cache.
# `patches/` is copied alongside package.json because npm ci triggers our
# `postinstall` script, which patches a @semapps/activitypub race condition
# (see patches/semapps-activitypub-actor.js for the rationale).
COPY package.json package-lock.json* ./
COPY patches ./patches
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Add a healthcheck CLI dep (wget is already in alpine).
RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Drop privileges. Node's official image ships a `node` user.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Tini reaps zombie processes and forwards signals cleanly. We point at the
# installed binary directly to avoid the npx resolution overhead per startup.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "node_modules/moleculer/bin/moleculer-runner.js", "--env", "services/**/*.service.js"]
