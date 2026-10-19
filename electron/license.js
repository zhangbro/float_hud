'use strict';

/**
 * 免费版：1 个显示区
 * 完整版：HMAC 签名激活码 FH-PRO-XXXX-XXXX-XXXX-XXXX
 *
 * 生成：python3 tools/genkey.py（需要 FLOAT_HUD_LICENSE_SECRET）
 * 校验：本机内置同一 secret，或改用公钥签名校验（见 README）
 */
const crypto = require('crypto');

const PRO_KEY_RE = /^FH-PRO-(?:[A-Z2-7]{4}-){3}[A-Z2-7]{4}$/i;
const SECRET_ENV = 'FLOAT_HUD_LICENSE_SECRET';
// 生产环境请替换为构建期注入的常量，或改为 Ed25519 公钥验签
const FALLBACK_SECRET = 'float-hud-demo-secret-change-me';

function secret() {
  return (process.env[SECRET_ENV] || FALLBACK_SECRET).trim();
}

function parseKey(key) {
  const k = String(key || '').trim().toUpperCase();
  if (!k.startsWith('FH-PRO-')) return null;
  const body = k.slice('FH-PRO-'.length).replace(/-/g, '');
  if (body.length !== 16) return null;
  if (!/^[A-Z2-7]+$/.test(body)) return null;
  return parseKeyBase32(body);
}

function b32decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) return null;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function b32encode(buf) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return out;
}

function parseKeyBase32(body) {
  const raw = b32decode(body);
  if (!raw || raw.length !== 10) return null;
  return { serial: raw.subarray(0, 4), sig: raw.subarray(4, 10) };
}

function formatKey(serial, sig) {
  const s = b32encode(Buffer.concat([serial, sig]));
  const groups = s.match(/.{4}/g) || [];
  return 'FH-PRO-' + groups.join('-');
}

function isValidProKey(key) {
  const parsed = parseKey(key);
  if (!parsed) return false;
  const sig = crypto
    .createHmac('sha256', Buffer.from(secret(), 'utf8'))
    .update(Buffer.concat([Buffer.from('pro|'), parsed.serial]))
    .digest()
    .subarray(0, 6);
  if (sig.length !== parsed.sig.length) return false;
  return crypto.timingSafeEqual(sig, parsed.sig);
}

function isPro(cfg) {
  if (!cfg) return false;
  if (cfg.edition === 'pro' && !cfg.licenseKey) return true;
  return isValidProKey(cfg.licenseKey);
}

function maxAreas(cfg) {
  return isPro(cfg) ? Infinity : 1;
}

function clampAreas(cfg) {
  const areas = Array.isArray(cfg.areas) ? cfg.areas : [];
  const max = maxAreas(cfg);
  if (areas.length <= max) return cfg;
  cfg.areas = areas.slice(0, max);
  return cfg;
}

function activate(cfg, key) {
  const k = String(key || '').trim();
  if (!isValidProKey(k)) {
    return { ok: false, error: '许可证无效' };
  }
  cfg.licenseKey = k;
  cfg.edition = 'pro';
  return { ok: true };
}

module.exports = {
  PRO_KEY_RE,
  isValidProKey,
  isPro,
  maxAreas,
  clampAreas,
  activate,
  formatKey,
  parseKey,
};
