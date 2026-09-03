FROM node:20-bookworm-slim

# Debian/glibc matches package-lock.json optional Rollup binaries
# (@rollup/rollup-linux-x64-gnu). Alpine/musl often misses
# @rollup/rollup-linux-x64-musl because of an npm optional-deps bug.

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=optional
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
