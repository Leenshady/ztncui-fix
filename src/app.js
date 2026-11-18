/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.
*/

const config = require('./lib/config');

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const expressValidator = require('express-validator');
const session = require('express-session');
const FileSessionStore = require('./lib/fileSessionStore');
const helmet = require('helmet');

const index = require('./routes/index');
const users = require('./routes/users');
const zt_controller = require('./routes/zt_controller');

const app = express();

// Explicit SESSION_SECRET wins. Otherwise generate a strong secret once and
// keep it in the data directory so restarts / upgrades preserve login state.
const session_secret = config.getSessionSecret();
const parsed_ttl = parseInt(process.env.SESSION_TTL || '86400', 10);
const session_ttl_seconds = Number.isFinite(parsed_ttl) && parsed_ttl > 0 ? parsed_ttl : 86400;

// Needed when secure cookies are used behind a reverse proxy.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(helmet());
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  resave: false,
  saveUninitialized: false,
  secret: session_secret,
  store: new FileSessionStore({
    path: config.sessionDir,
    ttl: session_ttl_seconds
  }),
  cookie: {
    maxAge: session_ttl_seconds * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SESSION_COOKIE_SECURE === 'yes'
  }
}));
app.use(expressValidator());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/fonts', express.static(path.join(__dirname, 'node_modules/bootstrap/fonts')));
app.use('/bscss', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css')));
app.use('/jqjs', express.static(path.join(__dirname, 'node_modules/jquery/dist')));
app.use('/bsjs', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js')));

app.use('/', index);
app.use('/users', users);
app.use('/controller', zt_controller);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = req.session.error;
  var msg = req.session.success;
  delete req.session.error;
  delete req.session.success;
  res.locals.message = '';
  if (err) res.locals.message = '<p class="msg error">' + err + '</p>';
  if (msg) res.locals.message = '<p class="msg success">' + msg + '</p>';
next();
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
