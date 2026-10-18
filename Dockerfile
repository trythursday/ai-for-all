FROM docker.io/oven/bun:1

WORKDIR /app

# .npmrc points the @jsr scope at npm.jsr.io, which campfire comes from.
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile --production

# README.md is rendered as the homepage at startup.
COPY README.md ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER bun

CMD ["bun", "run", "src/main.ts"]
