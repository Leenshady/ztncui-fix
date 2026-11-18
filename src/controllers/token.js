/*
  ztncui - ZeroTier network controller UI
  Copyright (C) 2017-2021  Key Networks (https://key-networks.com)
  Licensed under GPLv3 - see LICENSE for details.
*/

const fs = require('fs');
const util = require('util');

const readFile = util.promisify(fs.readFile);

// Tokens are used as an HTTP header value, so any surrounding whitespace
// (a trailing EOL from a manually edited token file, for example) must go.
// See upstream issue #142: "Token read with EOL failed".
const cleanToken = function(value) {
  return value ? String(value).trim() : '';
};

let _token = cleanToken(process.env.ZT_TOKEN);

exports.get = async function() {
  if (_token) {
    return _token;
  } else {
    try {
      _token = cleanToken(await readFile('/var/lib/zerotier-one/authtoken.secret', 'utf8'));
      if (!_token) {
        throw new Error('ZeroTier auth token is empty');
      }
      return _token;
    } catch(err) {
      throw(err);
    }
  }
}
