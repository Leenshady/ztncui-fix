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

密码文件是在**首次有请求需要读取用户库**时创建的（通常是第一次提交登录表单），不是 `npm start` 完成的瞬间。规则如下：

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
- 尚未初始化：删除密码库后重启并触发一次登录，会重新生成一组密码：

```shell
rm /path/to/ztncui-passwd
pm2 restart ztncui
pm2 logs ztncui --lines 200
```

- 已有账号时**不要删除密码库**，否则所有用户配置都会丢失。

## 启动参数

所有参数都通过环境变量传入：源码运行写在 `src/.env`，pm2 写在 `ecosystem.config.js` 的 `env`，Docker 使用 `-e` 或 `--env-file`。

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
| `ZTNCUI_PASSWD_FILE` | `etc/passwd` | 用户密码库路径，Docker 镜像中指向挂载卷 |
| `SESSION_SECRET` | 每次启动随机生成 | session 签名密钥；固定后重启仍可保持登录态 |
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

pm2 请使用仓库根目录自带的 `ecosystem.config.js`，它已配置好全部变量、固定的工作目录和正确的启动路径：

```shell
# 方式一：把变量写进 src/.env（不会入库），配置见上文
pm2 start ecosystem.config.js && pm2 save

# 方式二：启动前用 shell 环境变量注入（优先级高于 src/.env）
HTTP_ALL_INTERFACES=yes HTTP_PORT=3000 \
  ZTNCUI_ADMIN_PASSWORD_FILE=/etc/ztncui/admin_secret \
  pm2 start ecosystem.config.js && pm2 save

pm2 logs ztncui --lines 200
```

**为什么必须用这个文件**：`bin/www` 在进程启动的第一行就读取 `HTTP_PORT`、`HTTP_ALL_INTERFACES` 等变量，而 `dotenv` 原本只在 `app.js` 里调用、且从当前工作目录找 `.env`。pm2 的工作目录通常不是 `src/`，导致 `.env` 根本没被加载，`HTTP_ALL_INTERFACES` 等设置静默失效。`ecosystem.config.js` 用绝对路径提前加载 `src/.env` 并显式注入所有变量，同时把工作目录固定在 `src`（`etc/passwd`、`etc/sessions`、`etc/tls` 都依赖这个相对路径），从任何目录启动都能生效。

敏感信息不要写进 `ecosystem.config.js`（它会进 git），请用 `ZTNCUI_ADMIN_PASSWORD_FILE` 指向密钥文件或写入 `src/.env`。

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

The password file is created when a request first needs the user store (normally the first login form submission), not necessarily the moment `npm start` finishes:

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
- If not yet initialized: delete the password store, restart, and trigger one login to generate a new password:

```shell
rm /path/to/ztncui-passwd
pm2 restart ztncui
pm2 logs ztncui --lines 200
```

- Do **not** delete the password store once real accounts exist; all user configuration will be lost.

## Startup parameters

All parameters are environment variables: put them in `src/.env` for source installs, in the `env` block of `ecosystem.config.js` for pm2, or pass them with `-e` / `--env-file` for Docker.

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
| `ZTNCUI_PASSWD_FILE` | `etc/passwd` | User password store; points to the mounted volume in Docker |
| `SESSION_SECRET` | random per start | Session signing secret; set it to keep sessions across restarts |
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

For pm2, use the `ecosystem.config.js` shipped at the repository root. It already defines all variables, a fixed working directory, and the correct entry point:

```shell
# Option 1: put variables in src/.env (not committed); see the table above
pm2 start ecosystem.config.js && pm2 save

# Option 2: inject variables from the shell before starting (takes precedence over src/.env)
HTTP_ALL_INTERFACES=yes HTTP_PORT=3000 \
  ZTNCUI_ADMIN_PASSWORD_FILE=/etc/ztncui/admin_secret \
  pm2 start ecosystem.config.js && pm2 save

pm2 logs ztncui --lines 200
```

**Why this file is required:** `bin/www` reads `HTTP_PORT`, `HTTP_ALL_INTERFACES`, and friends on the very first lines of the process, whereas `dotenv` was originally called only inside `app.js` and looks for `.env` relative to the current working directory. pm2 usually runs from a directory other than `src/`, so `.env` was never loaded and settings such as `HTTP_ALL_INTERFACES` silently failed. `ecosystem.config.js` loads `src/.env` via an absolute path up front, injects every variable explicitly, and pins the working directory to `src` (`etc/passwd`, `etc/sessions`, `etc/tls` all depend on that relative path), so it works no matter where you launch pm2 from.

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

## License

GPLv3. Original upstream copyright notices are preserved; modifications in this fork are also provided under GPLv3.
