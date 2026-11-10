'use strict';
/** Platform seçici: win32 -> Windows uygulaması, diğerleri -> Linux uygulaması (geliştirme/test). */
function getPlatform(name = process.platform) {
  return name === 'win32' ? require('./win32') : require('./linux');
}
module.exports = { getPlatform };
