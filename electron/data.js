'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(
  process.env.FLOAT_HUD_CONFIG_DIR || path.join(os.homedir(), '.float-hud'),
  'config.json'
);

function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    // 兼容旧 widgets → areas
    if (!cfg.areas && Array.isArray(cfg.widgets)) {
      cfg.areas = cfg.widgets.map((w) => ({
        name: w.name || '',
        type: w.type === 'http' ? 'http' : 'script',
        command: w.command,
        url: w.url,
        headers: w.headers,
        template: w.template || '{{stdout}}',
        html: null,
        intervalSeconds: w.intervalSeconds,
        style: {
          color: w.color,
          fontSize: w.fontSize,
          fontFamily: w.fontFamily,
        },
      }));
    }
    return cfg;
  } catch {
    return null;
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function get(obj, dotted) {
  const m = String(dotted).match(/([\w$]+)|\[(\d+)\]/g);
  if (!m) return undefined;
  let cur = obj;
  for (const part of m) {
    if (cur == null) return undefined;
    const key = part.startsWith('[') ? Number(part.slice(1, -1)) : part;
    cur = cur[key];
  }
  return cur;
}

function render(template, data) {
  return String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    const v = get(data, expr.trim());
    return v == null ? '' : String(v);
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 纯文本 → 安全 HTML（旧 widget 风格） */
function textToHtml(text, style = {}) {
  const color = style.color || '#E5E5EA';
  const size = style.fontSize || 16;
  const fam = style.fontFamily ? `font-family:${style.fontFamily};` : '';
  return `<div style="color:${color};font-size:${size}px;font-weight:600;${fam}line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(text)}</div>`;
}

function httpGet(url, headers = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? require('http') : require('https');
    const req = lib.request(u, { method: 'GET', headers, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const ct = String(res.headers['content-type'] || '');
        if (ct.includes('html') || /^\s*</.test(body)) {
          resolve({ __html: body });
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ stdout: body, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function runScript(command, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: timeoutMs, shell: '/bin/bash' }, (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ stdout: stdout, raw: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

/** 刷新一个显示区，产出 { name, html, error } */
async function refreshArea(a) {
  const timeoutMs = a.timeoutMs || 10000;
  const name = a.name || '';
  try {
    let html = '';

    if (a.type === 'html') {
      html = String(a.html || '');
    } else if (a.type === 'script') {
      const data = await runScript(a.command || '', timeoutMs);
      // 命令输出若已是 HTML 则直接用；否则按文本/模板包装
      const out = data.raw || '';
      if (a.template && a.template.includes('{{') && a.template !== '{{stdout}}') {
        html = render(a.template, { ...data, stdout: out });
      } else if (/^\s*</.test(out)) {
        html = out;
      } else {
        html = textToHtml(out, a.style || {});
      }
    } else if (a.type === 'http') {
      const data = await httpGet(a.url, a.headers || {}, timeoutMs);
      if (data && data.__html != null) {
        html = data.__html;
      } else if (a.template) {
        html = render(a.template, data);
      } else {
        html = textToHtml(JSON.stringify(data), a.style || {});
      }
    } else {
      throw new Error(`unknown type: ${a.type}`);
    }

    return { name, html, error: null, style: a.style || {} };
  } catch (e) {
    return {
      name,
      html: textToHtml(String(e.message || e), { color: '#ff6961', fontSize: 12 }),
      error: String(e.message || e),
      style: a.style || {},
    };
  }
}

function areasOf(cfg) {
  if (Array.isArray(cfg.areas)) return cfg.areas;
  if (Array.isArray(cfg.widgets)) {
    // 兼容旧 widgets
    return cfg.widgets.map((w) => ({
      name: w.name || '',
      type: w.type === 'http' ? 'http' : 'script',
      command: w.command,
      url: w.url,
      headers: w.headers,
      template: w.template,
      intervalSeconds: w.intervalSeconds,
      style: { color: w.color, fontSize: w.fontSize, fontFamily: w.fontFamily },
    }));
  }
  return [];
}

async function refreshAll(cfg) {
  return Promise.all(areasOf(cfg).map(refreshArea));
}

function intervalsOf(cfg) {
  const def = (cfg.refreshSeconds || 30) * 1000;
  return areasOf(cfg).map((a) =>
    a.intervalSeconds ? a.intervalSeconds * 1000 : def
  );
}

module.exports = {
  CONFIG_PATH,
  loadConfig,
  saveConfig,
  refreshAll,
  refreshArea,
  render,
  get,
  escapeHtml,
  textToHtml,
  areasOf,
  intervalsOf,
};
