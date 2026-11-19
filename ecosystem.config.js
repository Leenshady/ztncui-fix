'use strict';

/**
 * ztncui-fix 的 pm2 启动配置。
 *
 * 为什么需要这个文件：
 *   bin/www 在文件开头就读取 HTTP_PORT / HTTPS_PORT / HTTPS_HOST /
 *   HTTP_ALL_INTERFACES，而 dotenv 原本只在 app.js 里调用，且默认从
 *   进程 cwd 查找 .env。pm2 的工作目录往往不是 src/，导致 .env 根本
 *   没被加载、变量缺失（典型症状：HTTP_ALL_INTERFACES 不生效）。
 *   这里让应用自己的 config 模块加载 .env（引导文件 + 数据目录），再把
 *   所有变量显式注入 pm2 的 env，保证 bin/www 第一行就能读到正确的值。
 *
 * 用法（二选一或混用）：
 *   1) 把配置写进 src/.env（见 README「启动参数」），然后：
 *        pm2 start ecosystem.config.js && pm2 save
 *   2) 启动前用 shell 环境变量提供，例如：
 *        HTTP_ALL_INTERFACES=yes pm2 start ecosystem.config.js
 *
 * 注意：不要把明文密码写进本文件（它会进 git）。用
 * ZTNCUI_ADMIN_PASSWORD_FILE 指向一个 0600 权限的密钥文件，或写进
 * 不入库的 src/.env。
 *
 * 升级保留配置：把 ZTNCUI_DATA_DIR 指向源码树之外的目录后，密码库、
 * session、TLS 证书、session.secret 都会集中到那里；升级只需保留该目录。
 */

const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');

// 应用的 config 模块按「引导 .env → 数据目录 .env」两阶段加载，真实
// 环境变量（shell / pm2 / Docker）优先。require 一次，确保下面构造注入
// 环境时所有值都已就位。
require(path.join(SRC, 'lib', 'config'));

// ztncui 识别的全部环境变量。只注入有真实值的项；空值交给应用使用内置默认值，
// 避免空字符串意外覆盖默认端口、或触发密码初始化的分支。
// 密码库、session 目录、session 签名密钥的位置由 ZTNCUI_DATA_DIR 固定派生，
// 不再作为独立变量注入。
const KEYS = [
  'ZT_TOKEN',
  'ZT_ADDR',
  'HTTP_PORT',
  'HTTP_ALL_INTERFACES',
  'HTTPS_PORT',
  'HTTPS_HOST',
  'NODE_ENV',
  'ZTNCUI_ADMIN_PASSWORD',
  'ZTNCUI_ADMIN_PASSWORD_FILE',
  'ZTNCUI_DATA_DIR',
  'ZTNCUI_ENV_FILE',
  'SESSION_TTL',
  'SESSION_COOKIE_SECURE',
  'TRUST_PROXY'
];

const env = { NODE_ENV: 'production' };
for (const key of KEYS) {
  const value = process.env[key];
  if (value !== undefined && value !== '') {
    env[key] = value;
  }
}

module.exports = {
  apps: [{
    name: 'ztncui',
    script: path.join(SRC, 'bin', 'www'),
    // 默认数据目录在 src/etc，依赖 cwd=src；外置 ZTNCUI_DATA_DIR 后不再
    // 依赖相对路径，但固定 cwd 仍然安全。
    cwd: SRC,
    env: env
  }]
};
