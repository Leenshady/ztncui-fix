/*
  Minimal file-backed session store for express-session.

  express-session's default MemoryStore leaks sessions and prints a production
  warning. This store keeps one JSON file per session in a dedicated directory
  and removes expired files periodically, without adding a new dependency.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const util = require('util');
const session = require('express-session');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const rename = util.promisify(fs.rename);
const unlink = util.promisify(fs.unlink);
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const utimes = util.promisify(fs.utimes);

class FileSessionStore extends session.Store {
  constructor(options) {
    super();
    options = options || {};
    this.dir = options.path || process.env.SESSION_DIR || 'etc/sessions';
    const ttlSeconds = Number(options.ttl || process.env.SESSION_TTL || 86400);
    this.ttlMs = (Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 86400) * 1000;
    this.reapIntervalMs = Number(options.reapIntervalMs || 3600000);

    try {
      fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }

    this._timer = setInterval(() => {
      this._reap().catch(() => {});
    }, this.reapIntervalMs);
    if (this._timer.unref) this._timer.unref();
  }

  _file(sid) {
    if (typeof sid !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sid)) return null;
    return path.join(this.dir, sid + '.json');
  }

  async _writeFile(file, payload) {
    const tmp = file + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex');
    try {
      await writeFile(tmp, JSON.stringify(payload), { mode: 0o600 });
      await rename(tmp, file);
      try { fs.chmodSync(file, 0o600); } catch (err) { /* best effort */ }
    } catch (err) {
      try { await unlink(tmp); } catch (ignore) { /* best effort */ }
      throw err;
    }
  }

  async _reap() {
    let files;
    try {
      files = await readdir(this.dir);
    } catch (err) {
      return;
    }
    const now = Date.now();
    for (const name of files) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(this.dir, name);
      try {
        const info = await stat(file);
        if (!info.isFile() || now - info.mtimeMs > this.ttlMs) {
          await unlink(file);
        }
      } catch (err) {
        if (err.code !== 'ENOENT') continue;
      }
    }
  }

  get(sid, callback) {
    callback = callback || function() {};
    const file = this._file(sid);
    if (!file) return callback(null, null);

    readFile(file, 'utf8').then(raw => {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return unlink(file).catch(() => {}).then(() => callback(null, null));
      }
      if (!parsed || typeof parsed !== 'object' || !parsed.session) {
        return callback(null, null);
      }
      if (parsed.expires && Date.now() > parsed.expires) {
        return unlink(file).catch(() => {}).then(() => callback(null, null));
      }
      callback(null, parsed.session);
    }, err => {
      if (err.code === 'ENOENT') return callback(null, null);
      callback(err);
    });
  }

  set(sid, sess, callback) {
    callback = callback || function() {};
    const file = this._file(sid);
    if (!file) return callback(new Error('Invalid session id'));

    const expires = sess && sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + this.ttlMs;

    this._writeFile(file, { expires: expires, session: sess })
      .then(() => callback(null), err => callback(err));
  }

  touch(sid, sess, callback) {
    callback = callback || function() {};
    const file = this._file(sid);
    if (!file) return callback(null);
    const now = new Date();
    utimes(file, now, now).then(() => callback(null), err => {
      if (err.code === 'ENOENT') return callback(null);
      callback(err);
    });
  }

  destroy(sid, callback) {
    callback = callback || function() {};
    const file = this._file(sid);
    if (!file) return callback(null);
    unlink(file).then(() => callback(null), err => {
      if (err.code === 'ENOENT') return callback(null);
      callback(err);
    });
  }

  all(callback) {
    callback = callback || function() {};
    readdir(this.dir).then(files => {
      const sessions = [];
      return Promise.all(files
        .filter(name => name.endsWith('.json'))
        .map(name => new Promise(resolve => {
          this.get(name.slice(0, -5), (err, sess) => {
            if (!err && sess) sessions.push(sess);
            resolve();
          });
        }))).then(() => callback(null, sessions));
    }, err => callback(err));
  }

  clear(callback) {
    callback = callback || function() {};
    readdir(this.dir).then(files => Promise.all(files
      .filter(name => name.endsWith('.json'))
      .map(name => unlink(path.join(this.dir, name)).catch(() => {})))
      .then(() => callback(null)), err => callback(err));
  }
}

module.exports = FileSessionStore;
