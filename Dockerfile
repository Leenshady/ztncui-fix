# syntax=docker/dockerfile:1

FROM docker.io/node:20-bookworm-slim AS deps

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app/src

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential python3 \
 && rm -rf /var/lib/apt/lists/*

COPY src/package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force


FROM docker.io/node:20-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    ZT_ADDR=127.0.0.1:9993 \
    HTTP_PORT=3000 \
    ZTNCUI_PASSWD_FILE=/var/lib/zerotier-one/ztncui-passwd \
    SESSION_DIR=/var/lib/zerotier-one/ztncui-sessions \
    ZTNCUI_DATA_DIR=/var/lib/zerotier-one/ztncui-data

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && curl -fsSL https://install.zerotier.com | bash \
 && apt-get purge -y curl gnupg \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /var/lib/zerotier-one/authtoken.secret \
          /var/lib/zerotier-one/identity.secret \
          /var/lib/zerotier-one/identity.public \
          /var/lib/zerotier-one/zerotier-one.pid \
          /var/lib/zerotier-one/zerotier-one.port

WORKDIR /app/src
COPY src/ ./
COPY --from=deps /app/src/node_modules ./node_modules

# No default password is baked into the image. On first start ztncui creates
# a random admin password in ZTNCUI_PASSWD_FILE (the mounted ZT volume).
# ZTNCUI_DATA_DIR keeps TLS certs, a generated session.secret and an optional
# .env on that same volume. PASSWD_FILE / SESSION_DIR remain explicit so
# volumes created by earlier images keep working after an upgrade.

VOLUME ["/var/lib/zerotier-one"]
EXPOSE 3000 9993/udp

CMD ["sh", "-c", "mkdir -p /var/lib/zerotier-one && zerotier-one -d && exec node ./bin/www"]
