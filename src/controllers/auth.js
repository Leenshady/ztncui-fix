/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.
*/

const argon2 = require('argon2');
const usersController = require('../controllers/usersController');

const hash_check = async function(user, password) {
  let verified = false;
  try {
    var users = await usersController.get_users();
  } catch (err) {
    throw err;
  }
  if (!Object.prototype.hasOwnProperty.call(users, user)) {
    return false;
  }
  try {
    verified = await argon2.verify(users[user].hash, password);
  } catch (err) {
    throw err;
  }
  return verified;
}

exports.authenticate = async function(name, pass, callback) {
  try {
    var users = await usersController.get_users();
  } catch (err) {
    throw err;
  }
  if (!Object.prototype.hasOwnProperty.call(users, name)) {
    return callback(new Error('cannot find user'));
  }
  let user = users[name];
  if (!user) return callback(new Error('cannot find user'));
  let verified = await hash_check(name, pass);
  if (verified) {
    return callback(null, user);
  } else {
    return callback(new Error('invalid password'));
  }
}

exports.restrict = function(req, res, next) {
  const user = req.session.user;
  if (!user) {
    req.session.error = 'Access denied!';
    res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
    return;
  }

  // A generated or admin-assigned password is marked pass_set:false. Force a
  // real password change before granting access to any other admin page.
  if (user.pass_set === false) {
    const requiredPath = '/users/' + encodeURIComponent(user.name) + '/password';
    const currentPath = req.originalUrl.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    if (currentPath !== requiredPath) {
      res.redirect(requiredPath);
      return;
    }
  }

  next();
}
