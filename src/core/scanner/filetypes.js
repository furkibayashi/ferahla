'use strict';
const TYPES = {
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'ts', 'm2ts', 'mts', '3gp', 'vob', 'ogv'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'xz', 'txz', 'zst', 'cab', 'lz', 'lzma'],
  installer: ['exe', 'msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'msp', 'deb', 'rpm', 'appimage', 'pkg'],
  disk: ['iso', 'img', 'vhd', 'vhdx', 'vmdk', 'vdi', 'qcow2', 'dmg', 'wim', 'esd', 'bin', 'nrg'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'webp', 'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'psd'],
};

const EXT_TO_TYPE = new Map();
for (const [type, exts] of Object.entries(TYPES)) for (const e of exts) EXT_TO_TYPE.set(e, type);

function fileType(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return 'other';
  return EXT_TO_TYPE.get(name.slice(dot + 1).toLowerCase()) || 'other';
}

module.exports = { fileType, TYPES };
