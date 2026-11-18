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

若 `etc/passwd` 不存在，首次启动会生成**随机**管理员密码，并**只在控制台打印一次**；用户名固定为 `admin`，首次登录会被强制修改密码。已有 `etc/passwd` 不会被覆盖。仓库里的 `etc/default.passwd` 仅作旧版参考，**不再推荐使用**。

自动化部署可在启动前通过环境变量注入初始密码：

```dotenv
# 二选一：直接给密码，或指向只读密钥文件（后者更推荐，避免出现在进程环境里）
ZTNCUI_ADMIN_PASSWORD=<初始密码>
ZTNCUI_ADMIN_PASSWORD_FILE=/run/secrets/ztncui_admin_password
# 可选：把密码库存到源码目录之外，默认 etc/passwd
ZTNCUI_PASSWD_FILE=/var/lib/zerotier-one/ztncui-passwd
# 可选：固定 session 密钥，使重启后登录态保持有效
SESSION_SECRET=<长随机字符串>
```

打开 `http://localhost:3000`。程序默认只监听 `localhost`；需要监听所有网卡时必须显式设置 `HTTP_ALL_INTERFACES=yes`，并放在提供 HTTPS 的反向代理后，不要把明文 HTTP 直接暴露到公网。

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

镜像**不包含默认口令**。首次启动会在挂载卷的 `/var/lib/zerotier-one/ztncui-passwd` 生成随机密码，可用 `docker logs ztncui-fix` 查看一次；容器重建后仍读取同一文件。也可挂载密钥文件后传入 `-e ZTNCUI_ADMIN_PASSWORD_FILE=/run/secrets/ztncui_admin_password`。首次登录会强制修改密码。identity 与 `authtoken.secret` 同样只生成在挂载卷中，镜像本身不含任何身份密钥。

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

If `etc/passwd` does not exist, a **random** admin password is generated and printed **once** to the console. The username is always `admin`, and the first login forces a password change. An existing `etc/passwd` is never overwritten. `etc/default.passwd` is kept only as a legacy reference and is **no longer recommended**.

For unattended installs, inject the initial password before starting:

```dotenv
# Choose one: a literal password, or a read-only secret file (preferred)
ZTNCUI_ADMIN_PASSWORD=<initial password>
ZTNCUI_ADMIN_PASSWORD_FILE=/run/secrets/ztncui_admin_password
# Optional: keep the password store outside the source tree (default etc/passwd)
ZTNCUI_PASSWD_FILE=/var/lib/zerotier-one/ztncui-passwd
# Optional: stable session secret so sessions survive restarts
SESSION_SECRET=<long random string>
```

Open `http://localhost:3000`. The app listens on `localhost` only. To bind all interfaces you must explicitly set `HTTP_ALL_INTERFACES=yes`; put the app behind an HTTPS reverse proxy and never expose plain HTTP directly to the internet.

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

The image contains **no default password**. On first start a random password is written to `/var/lib/zerotier-one/ztncui-passwd` on the mounted volume; read it once with `docker logs ztncui-fix`. It survives container recreation. You can also mount a secret file and pass `-e ZTNCUI_ADMIN_PASSWORD_FILE=/run/secrets/ztncui_admin_password`. The first login forces a password change. Identity files and `authtoken.secret` are likewise generated only in the mounted volume; the image contains no identity keys.

## License

GPLv3. Original upstream copyright notices are preserved; modifications in this fork are also provided under GPLv3.
