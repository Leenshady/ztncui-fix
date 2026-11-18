# ztncui (maintenance fork)

A web UI for a self-hosted ZeroTier network controller.

## 仓库状态 / Status

上游仓库 `key-networks/ztncui` 已长期没有更新。本仓库是它的**修复分支**，只合入经过验证的 bug 修复、安全修复、兼容性调整和少量明确的新 API 支持。

除非上游仓库恢复更新，本仓库**不再向上游提交 Pull Request**。问题与修复请在本仓库中跟踪。

> Upstream `key-networks/ztncui` has been inactive for a long time. This repository is a maintenance fork. We do not submit pull requests upstream unless upstream becomes active again.

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
git clone https://github.com/<your-account>/ztncui-fix.git
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

初始化密码文件并启动：

```shell
cp -n etc/default.passwd etc/passwd
chmod 400 .env
npm start
```

打开 `http://localhost:3000`。默认账号 `admin` / `password`，登录后请立即修改。

生产环境建议放在反向代理后并提供 HTTPS；不要直接把明文 HTTP 暴露到公网。

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

如不使用 host 网络，请至少映射 `-p 3000:3000 -p 9993:9993/udp`。首次启动会在挂载卷中生成 identity 与 `authtoken.secret`；容器镜像本身不包含任何身份密钥。

## 许可证

GPLv3。保留上游原始版权声明；本分支的修改同样按 GPLv3 提供。
