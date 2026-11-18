<a id="chinese"></a>

# ztncui（维护分支）

自托管的 ZeroTier 网络控制器 Web 管理界面。

[English](#english)

## 仓库状态

上游 `key-networks/ztncui` 已长期不再活跃。本仓库是它的**维护分支**。除非上游仓库恢复活跃，否则我们**不会向上游提交 Pull Request**。

本仓库只合入经过验证的 bug 修复、安全修复、兼容性调整和少量明确的新 API 支持；问题与修复请在本仓库中跟踪。

## 功能

- 网络与成员管理：创建/删除网络、授权成员、Active Bridge、IP 分配、成员名同步到控制器。
- 网络配置：IP 分配池、路由、DNS、IPv4 / IPv6 自动分配模式、公私网络切换。
- ZeroTier 1.16+ 新增的 `relays`（网络级中继节点）可在网络详情页配置。
- 修复 token 读取、登录跳转、成员 AJAX 请求无响应、RELAY 状态误判等上游遗留问题。

## 兼容性

ztncui 依赖 zerotier-one 的本地控制器 API（`http://127.0.0.1:9993/controller/*`）。该 API 缺失时网络列表会报 `HTTPError: Response code 404`。

- 推荐：ZeroTier **1.16.2**（已验证默认 Debian 包包含控制器）
- 可用：`1.16.0-2`、`1.14.2`
- 避免：首发 `1.16.0` 官方包（不含控制器 API）

可用 `apt-mark hold zerotier-one` 防止自动升级到未验证的构建。

## 从源码运行

需要 Node.js 20 和已安装的 zerotier-one（控制器 API 可用）。

```shell
git clone https://github.com/Leenshady/ztncui-fix.git
cd ztncui-fix/src
npm install --omit=dev
```

在 `src/` 目录创建 `.env`（ztncui 也支持直接读取 `/var/lib/zerotier-one/authtoken.secret`）：

```dotenv
ZT_TOKEN=<authtoken.secret 内容>
# 可选：ZT_ADDR=127.0.0.1:9993
# 可选：HTTP_PORT=3000
# 可选：NODE_ENV=production
```

首次启动会自动生成密码并启动：

```shell
chmod 400 .env
npm start
```

打开 `http://localhost:3000`。程序默认只监听 `localhost`；需要监听所有网卡时必须显式设置 `HTTP_ALL_INTERFACES=yes`，并放在提供 HTTPS 的反向代理后。

初始密码的生成与查看、密码文件制作、全部启动参数见下面两节。

## 初始密码

本分支**不再提供固定默认口令**，`etc/default.passwd` 仅作旧版参考，请不要再复制到 `etc/passwd`。

密码文件在**应用启动时**创建，随机密码会立即打印到控制台，无需先尝试登录。规则如下：

1. 若 `ZTNCUI_PASSWD_FILE`（默认 `etc/passwd`）不存在：
   - 优先读取 `ZTNCUI_ADMIN_PASSWORD_FILE` 指向的纯文本文件；
   - 其次读取环境变量 `ZTNCUI_ADMIN_PASSWORD`；
   - 两者都没有时，用 `crypto.randomBytes(24).toString('base64url')` 生成随机密码。
2. 密码以 argon2 哈希写入，用户标记为 `pass_set:false`，**首次登录强制修改密码**；已有密码文件不会被覆盖。
3. 随机密码**只在控制台打印一次**，随后无法再次查看明文。

### 查看随机密码

npm：

```shell
npm start
# 出现 "[ztncui] Initial password: xxxx" 时立即记下
```

pm2：

```shell
pm2 logs ztncui --lines 200
pm2 describe ztncui | grep -i 'log path'
tail -n 200 ~/.pm2/logs/ztncui-out.log
```

Windows 下 pm2 日志位于 `%USERPROFILE%\.pm2\logs\ztncui-out.log`。`console.log` 写入 out 日志而不是 error 日志。

Docker：

```shell
docker logs ztncui-fix | grep 'Initial password'
```

### 生成密码文件（推荐）

`ZTNCUI_ADMIN_PASSWORD_FILE` 指向的是**纯文本密码文件**，不是二进制密钥。文件内容就是密码本身，末尾有无换行都可以。

Linux：

```shell
sudo install -d -m 700 /etc/ztncui
umask 077
openssl rand -hex 24 > /etc/ztncui/admin_secret
sudo chmod 600 /etc/ztncui/admin_secret
```

Windows PowerShell：

```powershell
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = [Convert]::ToHexString($bytes)
$path = "$env:USERPROFILE\ztncui\admin_secret"
New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
[IO.File]::WriteAllText($path, $secret)
```

在 `.env` 中引用：

```dotenv
ZTNCUI_ADMIN_PASSWORD_FILE=/etc/ztncui/admin_secret
```

pm2 在 Windows 下建议用正斜杠避免转义：

```js
ZTNCUI_ADMIN_PASSWORD_FILE: 'C:/Users/<用户名>/ztncui/admin_secret'
```

Docker 中只读挂载：

```shell
-v /etc/ztncui/admin_secret:/run/secrets/ztncui_admin_password:ro \
-e ZTNCUI_ADMIN_PASSWORD_FILE=/run/secrets/ztncui_admin_password
```

### 密码丢失或重置

- 已能登录：在 Web 界面的 `Users → Set password` 修改。
- 尚未初始化：删除密码库后重启即可，启动时会重新生成一组密码：

```shell
rm /path/to/ztncui-passwd
pm2 restart ztncui
pm2 logs ztncui --lines 200
```

- 已有账号时**不要删除密码库**，否则所有用户配置都会丢失。

## 启动参数

所有参数都通过环境变量传入：源码运行和 pm2 统一写在 `src/.env`，Docker 使用 `-e` 或 `--env-file`。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ZT_TOKEN` | 读取 `/var/lib/zerotier-one/authtoken.secret` | ZeroTier 本地控制 API 的 token |
| `ZT_ADDR` | `127.0.0.1:9993` | 控制器 API 地址 |
| `HTTP_PORT` | `3000` | HTTP 监听端口 |
| `HTTP_ALL_INTERFACES` | 未设置 | 设置后监听所有网卡；否则只监听 `localhost` |
| `HTTPS_PORT` | 未设置 | 启用 HTTPS 的端口；证书为 `etc/tls/fullchain.pem` 与 `etc/tls/privkey.pem` |
| `HTTPS_HOST` | 未设置 | HTTPS 监听地址；未设置时监听所有网卡 |
| `NODE_ENV` | 未设置 | 生产环境设为 `production` |
| `ZTNCUI_ADMIN_PASSWORD` | 未设置 | 初始 admin 密码；与下一项二选一 |
| `ZTNCUI_ADMIN_PASSWORD_FILE` | 未设置 | 初始密码文件路径，优先级高于上一项 |
| `ZTNCUI_PASSWD_FILE` | `$ZTNCUI_DATA_DIR/passwd`（默认 `etc/passwd`） | 用户密码库路径；显式设置时优先级高于数据目录，Docker 镜像中指向挂载卷 |
| `ZTNCUI_DATA_DIR` | `src/etc` | 统一数据目录：密码库、session、TLS 证书、签名密钥的根目录；指向源码树外即可在升级中保留 |
| `ZTNCUI_ENV_FILE` | `src/.env` | 引导 env 文件；此外还会读取数据目录内的 `.env`，真实环境变量始终优先 |
| `SESSION_SECRET` | 保存到 `$ZTNCUI_DATA_DIR/session.secret` | session 签名密钥；未显式设置时自动生成一次并持久化，重启/升级不掉登录 |
| `SESSION_DIR` | `etc/sessions` | 文件型 session 存储目录；Docker 镜像中指向挂载卷 |
| `SESSION_TTL` | `86400` | session 有效期（秒），同时作为 cookie `maxAge` 与过期文件清理周期 |
| `SESSION_COOKIE_SECURE` | 未设置 | 设为 `yes` 时给 cookie 加 `Secure`；必须已启用 HTTPS |
| `TRUST_PROXY` | 未设置 | 反向代理后启用 `trust proxy`，配合 `Secure` cookie 使用 |

示例：`src/.env`

```dotenv
ZT_TOKEN=<authtoken.secret 内容>
ZT_ADDR=127.0.0.1:9993
HTTP_PORT=3000
NODE_ENV=production
ZTNCUI_ADMIN_PASSWORD_FILE=/etc/ztncui/admin_secret
ZTNCUI_PASSWD_FILE=/var/lib/zerotier-one/ztncui-passwd
SESSION_SECRET=<openssl rand -hex 32 生成的值>
SESSION_DIR=/var/lib/zerotier-one/ztncui-sessions
SESSION_TTL=86400
# 仅在已启用 HTTPS / 反向代理时打开下面两项
# SESSION_COOKIE_SECURE=yes
# TRUST_PROXY=1
```

pm2 请使用仓库根目录自带的 `ecosystem.config.js`。它会自动加载 `src/.env` 并注入全部变量，日常只需维护一个 `.env` 文件：

```shell
# 变量写进 src/.env（已在 .gitignore，不会入库），配置见上文
pm2 start ecosystem.config.js && pm2 save

# 修改 src/.env 后，必须用配置文件名重启才会重新读取环境变量
pm2 restart ecosystem.config.js
```

`pm2 restart ztncui`（按进程名重启）**不会**重读 `.env`；改了配置请用上面的 `pm2 restart ecosystem.config.js`。如需临时覆盖某个变量，才用 shell 前缀，例如 `HTTP_PORT=4000 pm2 start ecosystem.config.js`。

`ecosystem.config.js` 是必需的：`bin/www` 在启动第一行就读取 `HTTP_PORT`、`HTTP_ALL_INTERFACES` 等变量，而 `dotenv` 原本只在 `app.js` 里调用、且从当前工作目录找 `.env`，pm2 的工作目录通常不是 `src/`，导致设置静默失效。该文件用绝对路径提前加载 `src/.env`、显式注入所有变量，并把工作目录固定在 `src`（`etc/passwd`、`etc/sessions`、`etc/tls` 都依赖这个相对路径）。

敏感信息请用 `ZTNCUI_ADMIN_PASSWORD_FILE` 指向密钥文件或写入 `src/.env`，不要写进会进 git 的 `ecosystem.config.js`。

Docker 示例见下一节。

## Docker

仓库根目录提供多阶段构建的 `Dockerfile`，会同时安装 zerotier-one 与 ztncui：

```shell
docker build -t ztncui-fix .
```

Linux 示例（推荐 host 网络，便于控制器通过 UDP 9993 通信）：

```shell
docker run -d --name ztncui-fix \
  --restart unless-stopped \
  --network host \
  --cap-add NET_ADMIN --cap-add NET_RAW \
  --device /dev/net/tun \
  -v ztncui-zt:/var/lib/zerotier-one \
  ztncui-fix
```

如不使用 host 网络，请至少映射 `-p 3000:3000 -p 9993:9993/udp`，并额外加 `-e HTTP_ALL_INTERFACES=yes`（镜像默认只监听 `localhost`）。对外提供访问时请务必经由 HTTPS 反向代理。

镜像**不包含默认口令**。首次启动会在挂载卷的 `/var/lib/zerotier-one/ztncui-passwd` 生成随机密码，可用 `docker logs ztncui-fix` 查看一次；容器重建后仍读取同一文件。也可挂载密钥文件后传入 `-e ZTNCUI_ADMIN_PASSWORD_FILE=/run/secrets/ztncui_admin_password`。首次登录会强制修改密码。session 文件写入挂载卷的 `ztncui-sessions/` 目录，不会随容器重建丢失。identity 与 `authtoken.secret` 同样只生成在挂载卷中，镜像本身不含任何身份密钥。

## 升级与配置保留

可变状态（账号、session、证书、启动参数）默认位于源码树的 `src/etc/`，升级时若替换整个 `src/` 目录就会丢失。本分支把它们收敛到 `ZTNCUI_DATA_DIR` 指定的**单一数据目录**，默认值仍是 `src/etc`，因此现有部署无需改动。

| 状态 | 位置 | 覆盖方式 |
|---|---|---|
| 管理员密码库 | `$DATA_DIR/passwd` | `ZTNCUI_PASSWD_FILE` |
| 文件型 session | `$DATA_DIR/sessions/` | `SESSION_DIR` |
| session 签名密钥 | `$DATA_DIR/session.secret` | `SESSION_SECRET`（设置后不写文件） |
| TLS 证书 | `$DATA_DIR/tls/fullchain.pem`、`privkey.pem` | — |
| 成员备注（Member name） | `$DATA_DIR/storage/` | — |
| 启动配置 | `src/.env`（引导）+ `$DATA_DIR/.env` | `ZTNCUI_ENV_FILE` |

成员备注同时写入 ZeroTier 控制器（1.14+）和 `$DATA_DIR/storage/`；旧版 `src/etc/storage/` 中的备注会在首次启动时自动迁移到数据目录。

配置模块先读引导文件拿到 `ZTNCUI_DATA_DIR`，再读数据目录里的 `.env`；dotenv 不会覆盖 shell、pm2 或 Docker 已传入的变量。

### 源码 / pm2 升级

```shell
cd /path/to/ztncui-fix
git pull
cd src && npm install --omit=dev && cd ..
pm2 restart ecosystem.config.js
```

只要不执行 `git clean -fdx`、不删除 `src/etc/` 与 `src/.env`，账号和配置都会保留。推荐把数据目录外置，并把 `.env` 一并放进去：

```dotenv
ZTNCUI_DATA_DIR=/srv/ztncui-data
```

```shell
sudo install -d -m 700 /srv/ztncui-data
cp src/.env /srv/ztncui-data/.env
```

此后升级只需保留 `/srv/ztncui-data` 一个目录。该目录含凭据，权限应保持 `0700`，其中文件为 `0600`。

### Docker 升级

仓库根目录的 `docker-compose.yml` 用一个命名卷保存全部可变状态：

```shell
docker compose pull && docker compose up -d
# 修改了 Dockerfile 或本地源码时：
docker compose up -d --build
```

**绝不要**执行 `docker compose down -v` 或 `docker volume rm ztncui-data`，那会删除密码库、session 以及 ZeroTier 身份文件。旧镜像创建的卷同样兼容：容器仍显式使用 `ztncui-passwd` 与 `ztncui-sessions` 原路径，TLS 证书和可选的 `.env` 放在卷内 `ztncui-data/` 子目录。若旧容器启用了 HTTPS，升级前先把 `etc/tls/*.pem` 复制到卷内 `ztncui-data/tls/`，新镜像会从那里读取证书。旧镜像的 `etc/storage/`（成员备注）若未挂载到卷，用 `docker cp ztncui-fix:/app/src/etc/storage ./storage-backup` 导出，再把内容放进卷内 `ztncui-data/storage/`。

### 备份与恢复

源码部署：

```shell
tar czf ztncui-backup-$(date +%F).tar.gz -C /path/to/ztncui-fix/src etc .env
tar xzf ztncui-backup-2026-11-18.tar.gz -C /path/to/ztncui-fix/src
```

Docker 命名卷：

```shell
docker run --rm -v ztncui-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/ztncui-backup-$(date +%F).tar.gz -C /data .
# 恢复时把解包目标改回 /data
```

## 许可证

GPLv3。保留上游原始版权声明；本分支的修改同样按 GPLv3 提供。

---

<a id="english"></a>

# ztncui (Maintenance Fork)

A web UI for a self-hosted ZeroTier network controller.

[中文](#chinese)

## Status

Upstream `key-networks/ztncui` has been inactive for a long time. This repository is a **maintenance fork** of it, and only accepts verified bug fixes, security fixes, compatibility updates, and a small number of clearly defined new API features.

We do **not** submit pull requests upstream unless the upstream repository becomes active again. Issues and fixes are tracked in this repository.

## Features

- Network and member management: create/delete networks, authorize members, Active Bridge, IP assignments, and member names synchronized with the controller.
- Network configuration: IP assignment pools, routes, DNS, IPv4/IPv6 assign modes, and public/private network switching.
- Support for `relays` (network-specific relay nodes), a new field in ZeroTier 1.16+, configurable from the network detail page.
- Fixes for upstream issues such as token reading, login redirects, hanging member AJAX requests, and incorrect RELAY peer status.

## Compatibility

ztncui relies on zerotier-one's local controller API (`http://127.0.0.1:9993/controller/*`). If the API is missing, the network list fails with `HTTPError: Response code 404`.

- Recommended: ZeroTier **1.16.2** (the default Debian package is verified to include the controller)
- Works: `1.16.0-2`, `1.14.2`
- Avoid: the initial `1.16.0` official package (does not include the controller API)

Use `apt-mark hold zerotier-one` to prevent automatic upgrades to unverified builds.

## Run from source

Node.js 20 and an installed zerotier-one with a working controller API are required.

```shell
git clone https://github.com/Leenshady/ztncui-fix.git
cd ztncui-fix/src
npm install --omit=dev
```

Create a `.env` file in `src/` (ztncui can also read `/var/lib/zerotier-one/authtoken.secret` directly):

```dotenv
ZT_TOKEN=<contents of authtoken.secret>
# Optional: ZT_ADDR=127.0.0.1:9993
# Optional: HTTP_PORT=3000
# Optional: NODE_ENV=production
```

Start the app; the password file is created automatically:

```shell
chmod 400 .env
npm start
```

Open `http://localhost:3000`. The app listens on `localhost` only. To bind all interfaces you must explicitly set `HTTP_ALL_INTERFACES=yes`; put the app behind an HTTPS reverse proxy and never expose plain HTTP directly to the internet.

See the next two sections for how the initial password is generated and viewed, how to create a secret file, and the full list of startup parameters.

## Initial password

This fork **does not ship a fixed default password**. `etc/default.passwd` is kept only as a legacy reference; do not copy it to `etc/passwd`.

The password file is created **at application startup** and a generated password is printed to the console immediately, with no login attempt required:

1. If `ZTNCUI_PASSWD_FILE` (default `etc/passwd`) does not exist:
   - read the plain-text file pointed to by `ZTNCUI_ADMIN_PASSWORD_FILE` first;
   - otherwise read the `ZTNCUI_ADMIN_PASSWORD` environment variable;
   - otherwise generate a random password with `crypto.randomBytes(24).toString('base64url')`.
2. The password is stored as an argon2 hash, the user is marked `pass_set:false`, and the **first login forces a password change**. An existing password file is never overwritten.
3. A generated password is printed **once** to stdout and cannot be recovered afterwards.

### Viewing a generated password

npm:

```shell
npm start
# Note the line "[ztncui] Initial password: xxxx" immediately
```

pm2:

```shell
pm2 logs ztncui --lines 200
pm2 describe ztncui | grep -i 'log path'
tail -n 200 ~/.pm2/logs/ztncui-out.log
```

On Windows, pm2 logs are under `%USERPROFILE%\.pm2\logs\ztncui-out.log`. `console.log` goes to the out log, not the error log.

Docker:

```shell
docker logs ztncui-fix | grep 'Initial password'
```

### Creating a secret file (recommended)

`ZTNCUI_ADMIN_PASSWORD_FILE` points to a **plain-text password file**, not a binary key. Its content is the password itself; a trailing newline is fine.

Linux:

```shell
sudo install -d -m 700 /etc/ztncui
umask 077
openssl rand -hex 24 > /etc/ztncui/admin_secret
sudo chmod 600 /etc/ztncui/admin_secret
```

Windows PowerShell:

```powershell
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = [Convert]::ToHexString($bytes)
$path = "$env:USERPROFILE\ztncui\admin_secret"
New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
[IO.File]::WriteAllText($path, $secret)
```

Reference it in `.env`:

```dotenv
ZTNCUI_ADMIN_PASSWORD_FILE=/etc/ztncui/admin_secret
```

On Windows, pm2 should use forward slashes to avoid escaping issues:

```js
ZTNCUI_ADMIN_PASSWORD_FILE: 'C:/Users/<user>/ztncui/admin_secret'
```

Mount it read-only in Docker:

```shell
-v /etc/ztncui/admin_secret:/run/secrets/ztncui_admin_password:ro \
-e ZTNCUI_ADMIN_PASSWORD_FILE=/run/secrets/ztncui_admin_password
```

### Lost password / reset

- If you can still log in: change it under `Users → Set password` in the web UI.
- If not yet initialized: delete the password store and restart; a new password is generated at startup:

```shell
rm /path/to/ztncui-passwd
pm2 restart ztncui
pm2 logs ztncui --lines 200
```

- Do **not** delete the password store once real accounts exist; all user configuration will be lost.

## Startup parameters

All parameters are environment variables: put them in `src/.env` for both source installs and pm2, or pass them with `-e` / `--env-file` for Docker.

| Variable | Default | Description |
|---|---|---|
| `ZT_TOKEN` | read `/var/lib/zerotier-one/authtoken.secret` | Token for ZeroTier's local controller API |
| `ZT_ADDR` | `127.0.0.1:9993` | Controller API address |
| `HTTP_PORT` | `3000` | HTTP listen port |
| `HTTP_ALL_INTERFACES` | unset | Bind all interfaces when set; otherwise `localhost` only |
| `HTTPS_PORT` | unset | HTTPS port; certs are `etc/tls/fullchain.pem` and `etc/tls/privkey.pem` |
| `HTTPS_HOST` | unset | HTTPS bind address; all interfaces when unset |
| `NODE_ENV` | unset | Set to `production` for deployments |
| `ZTNCUI_ADMIN_PASSWORD` | unset | Initial admin password; choose one of this or the next variable |
| `ZTNCUI_ADMIN_PASSWORD_FILE` | unset | Path to the initial password file; takes precedence |
| `ZTNCUI_PASSWD_FILE` | `$ZTNCUI_DATA_DIR/passwd` (default `etc/passwd`) | User password store; wins over the data directory when set, points to the mounted volume in Docker |
| `ZTNCUI_DATA_DIR` | `src/etc` | Single data directory for the password store, sessions, TLS certs and session secret; point it outside the source tree to survive upgrades |
| `ZTNCUI_ENV_FILE` | `src/.env` | Bootstrap env file; a `.env` inside the data directory is also read, real env vars always win |
| `SESSION_SECRET` | saved to `$ZTNCUI_DATA_DIR/session.secret` | Session signing secret; when unset it is generated once and persisted, so restarts/upgrades keep sessions |
| `SESSION_DIR` | `etc/sessions` | File-backed session directory; points to the mounted volume in Docker |
| `SESSION_TTL` | `86400` | Session lifetime in seconds; also used as cookie `maxAge` and file reaper interval |
| `SESSION_COOKIE_SECURE` | unset | Set to `yes` to add `Secure` to cookies; requires HTTPS |
| `TRUST_PROXY` | unset | Enable `trust proxy` behind a reverse proxy, needed with `Secure` cookies |

Example `src/.env`:

```dotenv
ZT_TOKEN=<contents of authtoken.secret>
ZT_ADDR=127.0.0.1:9993
HTTP_PORT=3000
NODE_ENV=production
ZTNCUI_ADMIN_PASSWORD_FILE=/etc/ztncui/admin_secret
ZTNCUI_PASSWD_FILE=/var/lib/zerotier-one/ztncui-passwd
SESSION_SECRET=<value from openssl rand -hex 32>
SESSION_DIR=/var/lib/zerotier-one/ztncui-sessions
SESSION_TTL=86400
# Only enable these behind HTTPS / a reverse proxy
# SESSION_COOKIE_SECURE=yes
# TRUST_PROXY=1
```

For pm2, use the `ecosystem.config.js` shipped at the repository root. It loads `src/.env` and injects every variable, so day to day you only maintain a single `.env` file:

```shell
# Put variables in src/.env (gitignored); see the table above
pm2 start ecosystem.config.js && pm2 save

# After editing src/.env, restart by config file so variables are re-read
pm2 restart ecosystem.config.js
```

`pm2 restart ztncui` (by process name) does **not** re-read `.env`; use `pm2 restart ecosystem.config.js` above after any change. Only use a shell prefix for a one-off override, e.g. `HTTP_PORT=4000 pm2 start ecosystem.config.js`.

**Why this file is required:** `bin/www` reads `HTTP_PORT`, `HTTP_ALL_INTERFACES`, and friends on the very first lines of the process, whereas `dotenv` was originally called only inside `app.js` and looks for `.env` relative to the current working directory. pm2 usually runs from a directory other than `src/`, so settings such as `HTTP_ALL_INTERFACES` silently failed. `ecosystem.config.js` loads `src/.env` via an absolute path up front, injects every variable explicitly, and pins the working directory to `src` (`etc/passwd`, `etc/sessions`, `etc/tls` all depend on that relative path).

Never put plain-text passwords in `ecosystem.config.js` (it is committed to git). Use `ZTNCUI_ADMIN_PASSWORD_FILE` pointing to a secret file, or write them into `src/.env`.

See the Docker section below for a container example.

## Docker

The repository root contains a multi-stage `Dockerfile` that installs both zerotier-one and ztncui:

```shell
docker build -t ztncui-fix .
```

Linux example (host networking is recommended so the controller can communicate over UDP 9993):

```shell
docker run -d --name ztncui-fix \
  --restart unless-stopped \
  --network host \
  --cap-add NET_ADMIN --cap-add NET_RAW \
  --device /dev/net/tun \
  -v ztncui-zt:/var/lib/zerotier-one \
  ztncui-fix
```

If host networking is not used, map at least `-p 3000:3000 -p 9993:9993/udp` and add `-e HTTP_ALL_INTERFACES=yes` (the image listens on `localhost` only by default). Always terminate HTTPS at a reverse proxy before exposing it.

The image contains **no default password**. On first start a random password is written to `/var/lib/zerotier-one/ztncui-passwd` on the mounted volume; read it once with `docker logs ztncui-fix`. It survives container recreation. You can also mount a secret file and pass `-e ZTNCUI_ADMIN_PASSWORD_FILE=/run/secrets/ztncui_admin_password`. The first login forces a password change. Session files are written to `ztncui-sessions/` on the mounted volume and survive container recreation. Identity files and `authtoken.secret` are likewise generated only in the mounted volume; the image contains no identity keys.

## Upgrades and preserving configuration

Mutable state (accounts, sessions, TLS certs, startup parameters) lives in `src/etc/` by default, so replacing the whole `src/` directory during an upgrade loses it. This fork consolidates it into a **single data directory** selected by `ZTNCUI_DATA_DIR`, which still defaults to `src/etc` — existing installs need no changes.

| State | Location | Overridden by |
|---|---|---|
| Admin password store | `$DATA_DIR/passwd` | `ZTNCUI_PASSWD_FILE` |
| File-backed sessions | `$DATA_DIR/sessions/` | `SESSION_DIR` |
| Session signing secret | `$DATA_DIR/session.secret` | `SESSION_SECRET` (no file written when set) |
| TLS certificates | `$DATA_DIR/tls/fullchain.pem`, `privkey.pem` | — |
| Member notes (Member name) | `$DATA_DIR/storage/` | — |
| Startup config | `src/.env` (bootstrap) + `$DATA_DIR/.env` | `ZTNCUI_ENV_FILE` |

Member names are written both to the ZeroTier controller (1.14+) and to `$DATA_DIR/storage/`; notes in the old `src/etc/storage/` are migrated automatically on first start.

The config module reads the bootstrap file first to learn `ZTNCUI_DATA_DIR`, then loads the `.env` inside the data directory. dotenv never overwrites values already supplied by the shell, pm2 or Docker.

### Upgrading a source / pm2 install

```shell
cd /path/to/ztncui-fix
git pull
cd src && npm install --omit=dev && cd ..
pm2 restart ecosystem.config.js
```

As long as you avoid `git clean -fdx` and never delete `src/etc/` or `src/.env`, accounts and configuration are preserved. Moving the data directory outside the source tree is recommended; keep `.env` there too:

```dotenv
ZTNCUI_DATA_DIR=/srv/ztncui-data
```

```shell
sudo install -d -m 700 /srv/ztncui-data
cp src/.env /srv/ztncui-data/.env
```

After that, a single directory (`/srv/ztncui-data`) is all you need to keep across upgrades. It contains credentials: use mode `0700` for the directory and `0600` for its files.

### Upgrading Docker

The `docker-compose.yml` at the repository root keeps all mutable state in one named volume:

```shell
docker compose pull && docker compose up -d
# after changing the Dockerfile or local sources:
docker compose up -d --build
```

**Never** run `docker compose down -v` or `docker volume rm ztncui-data` — that deletes the password store, sessions and ZeroTier identity files. Volumes created by earlier images still work: the container keeps using the original `ztncui-passwd` and `ztncui-sessions` paths, while TLS certs and the optional `.env` go under `ztncui-data/` in the same volume. If the old container used HTTPS, copy `etc/tls/*.pem` into `ztncui-data/tls/` on the volume before upgrading — the new image reads certs from there. Member notes in an old image's `etc/storage/` are not on the volume: export them with `docker cp ztncui-fix:/app/src/etc/storage ./storage-backup` and place them under `ztncui-data/storage/` on the volume.

### Backup and restore

Source install:

```shell
tar czf ztncui-backup-$(date +%F).tar.gz -C /path/to/ztncui-fix/src etc .env
tar xzf ztncui-backup-2026-11-18.tar.gz -C /path/to/ztncui-fix/src
```

Docker named volume:

```shell
docker run --rm -v ztncui-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/ztncui-backup-$(date +%F).tar.gz -C /data .
# to restore, extract back into /data
```

## License

GPLv3. Original upstream copyright notices are preserved; modifications in this fork are also provided under GPLv3.
