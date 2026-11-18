/*
  ztncui - centralized configuration and persistent paths.

  Mutable state (password store, sessions, TLS certs, session secret) is
  derived from a single data directory so an upgrade only has to preserve
  that one location. ZTNCUI_DATA_DIR defaults to src/etc, which keeps the
  historical layout and makes this change backward compatible.
*/

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..');

const resolvePath = function(value, fallback) {
  return value ? path.resolve(value) : fallback;
};

// dotenv v4 assigns `process.env[key] = process.env[key] || parsed[key]`, so
// values already supplied by the shell / pm2 / Docker always win over files.
const dotenv = require(path.join(SRC, 'node_modules', 'dotenv'));

const loadEnv = function(file) {
  if (!file || !fs.existsSync(file)) return false;
  dotenv.config({ path: file });
  return true;
};

// Stage 1: bootstrap file. ZTNCUI_ENV_FILE and ZTNCUI_DATA_DIR may be set
// either in the real environment or in the historical src/.env.
const bootstrapFile = resolvePath(process.env.ZTNCUI_ENV_FILE, path.join(SRC, '.env'));
loadEnv(bootstrapFile);

// Stage 2: when the data directory is outside the source tree, load its .env
// too. It cannot override stage 1 or real environment variables.
const DATA_DIR = resolvePath(process.env.ZTNCUI_DATA_DIR, path.join(SRC, 'etc'));
const dataEnvFile = path.join(DATA_DIR, '.env');
if (path.resolve(dataEnvFile) !== path.resolve(bootstrapFile)) {
  loadEnv(dataEnvFile);
}

const config = {
  SRC: SRC,
  DATA_DIR: DATA_DIR,
  ENV_FILE: dataEnvFile,
  // Explicit legacy variables still take precedence over the data directory.
  passwdFile: process.env.ZTNCUI_PASSWD_FILE || path.join(DATA_DIR, 'passwd'),
  sessionDir: process.env.SESSION_DIR || path.join(DATA_DIR, 'sessions'),
  tlsDir: path.join(DATA_DIR, 'tls'),
  storageDir: path.join(DATA_DIR, 'storage'),
  secretFile: path.join(DATA_DIR, 'session.secret')
};

// Persist a generated signing secret so a restart / upgrade keeps sessions
// valid. An explicit SESSION_SECRET always takes precedence and writes nothing.
config.getSessionSecret = function() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;

  try {
    const existing = fs.readFileSync(config.secretFile, 'utf8').trim();
    if (existing) return existing;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[ztncui] Could not read session secret: ' + err.message);
    }
  }

  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(config.secretFile, secret, { mode: 0o600 });
  } catch (err) {
    console.warn('[ztncui] Could not persist session secret: ' + err.message);
  }
  return secret;
};

module.exports = config;
