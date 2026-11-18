/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.
*/

const fs = require('fs');
const crypto = require('crypto');
const argon2 = require('argon2');
const util = require('util');

// ZTNCUI_PASSWD_FILE lets deployments keep the password store outside the
// application source tree (the Docker image puts it on the mounted ZT volume).
const passwd_file = process.env.ZTNCUI_PASSWD_FILE || 'etc/passwd';
const min_pass_len = 10;

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const chmod = util.promisify(fs.chmod);

let _users = null;
let _initPromise = null;

const unsafeUsername = function(name) {
  return !name || typeof name !== 'string' || name.length > 128 ||
    name === '__proto__' || name === 'prototype' || name === 'constructor' ||
    /[\\/]/.test(name);
};

// No fixed default password is shipped. An operator may inject one through a
// secret file or the environment; otherwise a strong random value is created.
const initial_admin_password = async function() {
  const secretFile = process.env.ZTNCUI_ADMIN_PASSWORD_FILE;
  if (secretFile) {
    const value = (await readFile(secretFile, 'utf8')).trim();
    if (!value) throw new Error('ZTNCUI_ADMIN_PASSWORD_FILE is empty');
    return { value: value, source: 'secret file' };
  }

  const envPassword = process.env.ZTNCUI_ADMIN_PASSWORD;
  if (envPassword) {
    const value = String(envPassword).trim();
    if (!value) throw new Error('ZTNCUI_ADMIN_PASSWORD is empty');
    return { value: value, source: 'environment' };
  }

  return { value: crypto.randomBytes(24).toString('base64url'), source: 'generated' };
};

// Create the password file once. Existing installations are never overwritten.
const ensure_passwd_file = function() {
  if (!_initPromise) {
    _initPromise = (async function() {
      try {
        await readFile(passwd_file, 'utf8');
        return;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      const initial = await initial_admin_password();
      const hash = await argon2.hash(initial.value);
      const users = {
        admin: { name: 'admin', pass_set: false, hash: hash }
      };

      await writeFile(passwd_file, JSON.stringify(users), 'utf8');
      await chmod(passwd_file, 0600);

      if (initial.source === 'generated') {
        console.log('[ztncui] No password file found. A random initial admin password has been generated.');
        console.log('[ztncui] Initial password: ' + initial.value);
        console.log('[ztncui] Shown only once; you will be asked to change it at first login.');
      } else {
        console.log('[ztncui] Initialized admin password from ' + initial.source + '.');
      }
    })().catch(function(err) {
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
};

const get_users = async function() {
  if (_users) return _users;
  await ensure_passwd_file();
  _users = JSON.parse(await readFile(passwd_file, 'utf8'));
  return _users;
}
exports.get_users = get_users;

const update_users = async function(users) {
  try {
    await writeFile(passwd_file, JSON.stringify(users), 'utf8');
    await chmod(passwd_file, 0600);

  } catch (err) {
    throw err;
  }
  _users = null;
  return await get_users();
}

exports.users_list = async function(req, res) {
  const navigate =
    {
      active: 'users',
    }

  try {
    const users = await get_users();
    res.render('users', { title: 'Admin users', navigate: navigate, message: 'List of users with admin priviledges', users: users });
  } catch (err) {
    res.render('users', { title: 'Admin users', navigate: navigate, message: 'Error', users: null, error: 'Error returning list of users: ' + err });
  }
}

exports.password_get = async function(req, res) {
  const navigate =
    {
      active: 'users',
    }

  const user =
    {
      name: req.params.name,
      password1: null,
      password2: null
    };
  res.render('password', { title: 'Set password', navigate: navigate, user: user, readonly: true, message: '' });
}

exports.password_post = async function(req, res) {
  const navigate =
    {
      active: 'users',
    }

  // The URL identifies the account being changed. A tampered form field must
  // never be allowed to retarget the write to another admin (issue review #2).
  const username = req.params.name;

  req.checkBody('password1', 'Password required').notEmpty();
  req.checkBody('password1', 'Minimum password length is ' + min_pass_len + ' characters').isLength({ min: min_pass_len, max: 160 });

  req.checkBody('password2', 'Please re-enter password').notEmpty();
  req.checkBody('password2', 'Minimum password length is ' + min_pass_len + ' characters').isLength({ min: min_pass_len, max: 160 });
  req.checkBody('password2', 'Passwords are not the same').equals(req.body.password1);

  let errors = req.validationErrors() || [];

  if (typeof req.body.username !== 'undefined' && String(req.body.username) !== username) {
    errors.push({ msg: 'Username in form does not match the URL' });
  }
  if (unsafeUsername(username)) {
    errors.push({ msg: 'Invalid username' });
  }

  if (errors.length) {
    const user =
      {
        name: username,
        password1: req.body.password1,
        password2: req.body.password2
      };
    const message = 'Please check errors below';
    return res.render('password', { title: 'Set password', navigate: navigate, user: user, readonly: true, message: message, errors: errors });
  }

  let pass_set = true;
  if (req.body.pass_set === 'check') pass_set = false;

  const hash = await argon2.hash(req.body.password1);

  const user =
    {
      name: username,
      pass_set: pass_set,
      hash: hash
    };

  let users = await get_users();
  users[username] = user;

  users = await update_users(users);

  // Keep the session in sync so a just-changed password clears the forced
  // change-password gate immediately.
  if (req.session && req.session.user && req.session.user.name === username) {
    req.session.user = { name: username, pass_set: pass_set };
    req.session.success = 'Password updated.';
  }

  const message = 'Successfully set password for ' + username;
  res.render('password', { title: 'Set password', navigate: navigate, user: user, readonly: true, message: message });
}

exports.user_create_get = async function(req, res) {
  const navigate =
    {
      active: 'create_user',
    }

  const user =
    {
      name: null,
      password1: null,
      password2: null
    };

  res.render('password', { title: 'Create new admin user', navigate: navigate, user: user, readonly: false});
}

exports.user_create_post = async function(req, res) {
  const navigate =
    {
      active: 'create_user',
    }

  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  if (unsafeUsername(username)) {
    return res.render('password', {
      title: 'Create new admin user',
      navigate: navigate,
      user: { name: username, password1: null, password2: null },
      readonly: false,
      message: '',
      errors: [{ msg: 'Invalid username' }]
    });
  }

  res.redirect(307, '/users/' + encodeURIComponent(username) + '/password');
}

exports.user_delete = async function(req, res) {
  const navigate =
    {
      active: 'users',
    }

  try {
    var users = await get_users();
  } catch (err) {
    throw err;
  }

  const user = Object.prototype.hasOwnProperty.call(users, req.params.name) ? users[req.params.name] : null;

  if (user && (req.session.user.name === user.name)) {
    res.render('user_delete', { title: 'Delete user', navigate: navigate, user: user, self_delete: true });
  }

  if (req.body.delete === 'delete') {
    if (user) {
      const deleted_user = { name: user.name };
      delete users[user.name];
      users = await update_users(users);
      res.render('user_delete', { title: 'Deleted user', navigate: navigate, user: deleted_user, deleted: true });
    } else {
      res.render('user_delete', { title: 'Delete user', navigate: navigate, user: null });
    }
  } else {
    if (user) {
      res.render('user_delete', { title: 'Delete user', navigate: navigate, user: user });
    } else {
      res.render('user_delete', { title: 'Delete user', navigate: navigate, user: null });
    }
  }
}

