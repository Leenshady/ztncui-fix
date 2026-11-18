/*
  One-time migration of member notes from the legacy src/etc/storage
  directory into the persistent data directory.
*/

'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

const legacyDir = path.join(config.SRC, 'etc', 'storage');

module.exports = function migrateStorage() {
  // Default layout: source and target are the same, nothing to do.
  if (path.resolve(config.storageDir) === path.resolve(legacyDir)) return 0;

  let entries;
  try {
    entries = fs.readdirSync(legacyDir);
  } catch (err) {
    return 0; // no legacy store, nothing to migrate
  }

  let moved = 0;
  try {
    fs.mkdirSync(config.storageDir, { recursive: true, mode: 0o700 });
    for (const entry of entries) {
      const source = path.join(legacyDir, entry);
      const target = path.join(config.storageDir, entry);
      // Never overwrite a note already present in the new location.
      if (!fs.statSync(source).isFile() || fs.existsSync(target)) continue;
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      moved++;
    }
  } catch (err) {
    console.error('[ztncui] Could not migrate member notes: ' + err.message);
  }
  return moved;
};
