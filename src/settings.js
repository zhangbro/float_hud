'use strict';

const $ = (id) => document.getElementById(id);

function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => t.className = 'toast', 1800);
}

function widgetForm(w = {}) {
  const div = document.createElement('div');
  div.className = 'widget';
  div.innerHTML = `
    <div class="widget-head">
      <strong>显示行</strong>
      <button class="btn-danger btn-del">删除</button>
    </div>
    <div class="grid">
      <label>名称
        <input data-f="name" value="${esc(w.name || '')}" />
      </label>
      <label>类型
        <select data-f="type">
          <option value="script" ${w.type === 'script' ? 'selected' : ''}>script（命令）</option>
          <option value="http" ${w.type === 'http' ? 'selected' : ''}>http（接口）</option>
        </select>
      </label>
      <label>刷新间隔（秒）
        <input data-f="intervalSeconds" type="number" min="1" value="${w.intervalSeconds || ''}" placeholder="跟随全局" />
      </label>
      <label>颜色
        <input data-f="color" type="color" value="${esc(w.color || '#FFD60A')}" />
      </label>
      <label>字号
        <input data-f="fontSize" type="number" min="8" max="72" value="${w.fontSize || 16}" />
      </label>
      <label>字体（覆盖全局）
        <input data-f="fontFamily" value="${esc(w.fontFamily || '')}" placeholder="留空跟随全局" />
      </label>
    </div>
    <label style="margin-top:10px">命令 / URL
      <input data-f="cmd" value="${esc(w.command || w.url || '')}" placeholder="type=script 写命令；type=http 写 URL" />
    </label>
    <label style="margin-top:10px">模板
      <textarea data-f="template" placeholder="如 {{stdout}} 或 {{data.path}}">${esc(w.template || '{{stdout}}')}</textarea>
      <div class="hint">script 用 {{stdout}}；http 用 {{json路径}}，如 {{origin}}</div>
    </label>
    <label class="http-only" style="margin-top:10px; display:${w.type === 'http' ? 'flex' : 'none'}">HTTP Headers（JSON，可选）
      <textarea data-f="headers" placeholder='{"Authorization":"Bearer …"}'>${esc(w.headers ? JSON.stringify(w.headers, null, 2) : '')}</textarea>
    </label>
  `;

  const typeSel = div.querySelector('[data-f="type"]');
  const httpOnly = div.querySelector('.http-only');
  typeSel.addEventListener('change', () => {
    httpOnly.style.display = typeSel.value === 'http' ? 'flex' : 'none';
  });

  div.querySelector('.btn-del').addEventListener('click', () => div.remove());
  return div;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collect() {
  const cfg = {
    backgroundOpacity: Number($('backgroundOpacity').value),
    opacity: Number($('backgroundOpacity').value),
    fontFamily: $('fontFamily').value.trim(),
    clickThrough: $('clickThrough').checked,
    lockPosition: $('lockPosition').checked,
    refreshSeconds: Number($('refreshSeconds').value) || 30,
    widgets: [],
  };

  document.querySelectorAll('#widgets .widget').forEach((div) => {
    const get = (f) => div.querySelector(`[data-f="${f}"]`);
    const type = get('type').value;
    const cmd = get('cmd').value.trim();
    const w = {
      name: get('name').value.trim(),
      type,
      template: get('template').value,
      color: get('color').value,
      fontSize: Number(get('fontSize').value) || 16,
    };
    const fam = get('fontFamily').value.trim();
    if (fam) w.fontFamily = fam;
    const iv = get('intervalSeconds').value.trim();
    if (iv) w.intervalSeconds = Number(iv);
    if (type === 'http') {
      w.url = cmd;
      const h = get('headers').value.trim();
      if (h) {
        try {
          w.headers = JSON.parse(h);
        } catch {
          throw new Error('headers 不是合法 JSON');
        }
      }
    } else {
      w.command = cmd;
    }
    cfg.widgets.push(w);
  });

  return cfg;
}

function fill(cfg) {
  const bg = cfg.backgroundOpacity != null
    ? Number(cfg.backgroundOpacity)
    : cfg.opacity != null
      ? Number(cfg.opacity)
      : 0.88;
  const bgEl = $('backgroundOpacity');
  bgEl.value = String(bg);
  // range 某些内核上直接赋值不刷新，手动同步一次
  bgEl.dispatchEvent(new Event('input', { bubbles: true }));
  $('backgroundOpacityVal').textContent = bg.toFixed(2);

  $('fontFamily').value = cfg.fontFamily || '';
  $('refreshSeconds').value = cfg.refreshSeconds || 30;
  $('clickThrough').checked = !!cfg.clickThrough;
  $('lockPosition').checked = !!cfg.lockPosition;

  const box = $('widgets');
  box.innerHTML = '';
  (cfg.widgets || []).forEach((w) => box.appendChild(widgetForm(w)));
}

async function load() {
  const cfg = await window.hud.getConfig();
  fill(cfg || { widgets: [] });
}

$('backgroundOpacity').addEventListener('input', (e) => {
  $('backgroundOpacityVal').textContent = Number(e.target.value).toFixed(2);
});

$('addWidget').addEventListener('click', () => {
  $('widgets').appendChild(widgetForm({ type: 'script', template: '{{stdout}}', color: '#FFD60A', fontSize: 16 }));
});

$('reload').addEventListener('click', load);

$('save').addEventListener('click', async () => {
  try {
    const cfg = collect();
    const res = await window.hud.saveConfig(cfg);
    toast(res.ok ? '已保存，生效中' : res.error || '保存失败', !res.ok);
  } catch (e) {
    toast(String(e.message || e), true);
  }
});

load();
