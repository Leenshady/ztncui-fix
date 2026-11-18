'use strict';

/**
 * ztncui-fix 的 pm2 启动配置。
 *
 * 为什么需要这个文件：
 *   bin/www 在文件开头就读取 HTTP_PORT / HTTPS_PORT / HTTPS_HOST /
 *   HTTP_ALL_INTERFACES，而 dotenv 原本只在 app.js 里调用，且默认从
 *   进程 cwd 查找 .env。pm2 的工作目录往往不是 src/，导致 .env 根本
 *   没被加载、变量缺失（典型症状：HTTP_ALL_INTERFACES 不生效）。
 *   这里用绝对路径提前加载 src/.env，并把所有变量显式注入 pm2 的 env，
 *   保证 bin/www 第一行就能读到正确的值。
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
 */

const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const ENV_FILE = path.join(SRC, '.env');

// dotenv 只装在 src/node_modules，用绝对路径 require，避免 pm2 从其它
// 目录启动时找不到包。src/.env 不存在时 dotenv 会静默跳过。
try {
  require(path.join(SRC, 'node_modules', 'dotenv')).config({ path: ENV_FILE });
} catch (err) {
  console.warn('[ztncui] 无法加载 .env（' + ENV_FILE + '）：' + err.message);
}

// ztncui 识别的全部环境变量。只注入有真实值的项；空值交给应用使用内置默认值，
// 避免空字符串意外覆盖默认端口、或触发密码初始化的分支。
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
  'ZTNCUI_PASSWD_FILE',
  'SESSION_SECRET',
  'SESSION_DIR',
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
    // etc/passwd、etc/sessions、etc/tls 以及 app.js 里的 dotenv.config()
    // 都依赖 cwd=src；这里显式固定，避免 pm2 从仓库根目录启动时路径错位。
    cwd: SRC,
    env: env
  }]
};
