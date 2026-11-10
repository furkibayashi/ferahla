'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Testlere özel geçici klasör (tmp altında); test sonunda silinir. */
function makeTmp(prefix = 'ferahla-test-') {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  return {
    dir: base,
    p: (...parts) => path.join(base, ...parts),
    file(rel, content = '', mtime) {
      const full = path.join(base, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
      if (mtime) fs.utimesSync(full, mtime / 1000, mtime / 1000);
      return full;
    },
    mkdir(rel) {
      const full = path.join(base, rel);
      fs.mkdirSync(full, { recursive: true });
      return full;
    },
    cleanup() {
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

const OLD = Date.now() - 3 * 24 * 60 * 60 * 1000;

module.exports = { makeTmp, OLD };
