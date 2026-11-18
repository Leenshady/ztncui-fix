/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.
*/

const express = require('express');
const auth = require('../controllers/auth');
const authenticate = auth.authenticate;
const restrict = auth.restrict;
const router = express.Router();

// Only allow same-origin paths as post-login redirect targets.
// Upstream PR #148 only blocked '//' and '://', which still allowed
// backslash variants (/\evil.com) and non-http schemes.
function safeRedirect(target) {
  const fallback = '/controller';
  if (typeof target !== 'string' || !target.trim()) {
    return fallback;
  }

  target = target.trim();
  if (!target.startsWith('/') || target.startsWith('//') ||
      /[\\\u0000-\u001f]/.test(target)) {
    return fallback;
  }

  try {
    const parsed = new URL(target, 'http://ztncui.invalid');
    if (parsed.origin !== 'http://ztncui.invalid') {
      return fallback;
    }
    return parsed.pathname + parsed.search + parsed.hash;
  } catch (err) {
    return fallback;
  }
}

/** Redirect logged user to controler page */
function guest_only(req, res, next) {
  if (req.session.user) {
    res.redirect('/controller');
  } else {
    next();
  }
}

/* GET home page. */
router.get('/', guest_only, function(req, res, next) {
  res.render('front_door', {title: 'ztncui'});
});

router.get('/logout', function(req, res) {
  req.session.destroy(function() {
    res.redirect('/');
  });
});

router.get('/login', guest_only, function(req, res) {
  let message = null;
  if (req.session.error) {
    if (req.session.error !== 'Access denied!') {
      message = req.session.error;
    }
  } else {
    message = req.session.success;
  }
  res.render('login', { title: 'Login', message: message });
});

router.post('/login', async function(req, res) {
  await authenticate(req.body.username, req.body.password, function(err, user) {
    if (user) {
      req.session.regenerate(function() {
        req.session.user = user;
        req.session.success = 'Authenticated as ' + user.name;
        if (user.pass_set) {
          res.redirect(safeRedirect(req.query.redirect));
        } else {
          res.redirect('/users/' + user.name + '/password');
        }
      });
    } else {
      req.session.error = 'Authentication failed, please check your username and password.'
      res.redirect('/login');
    }
  });
});
module.exports = router;
