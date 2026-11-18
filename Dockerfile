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
    HTTP_ALL_INTERFACES=yes \
    HTTP_PORT=3000

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

RUN cp -n etc/default.passwd etc/passwd

VOLUME ["/var/lib/zerotier-one"]
EXPOSE 3000 9993/udp

CMD ["sh", "-c", "zerotier-one -d && exec node ./bin/www"]
