'use strict';

const $ = (id) => document.getElementById(id);

function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => (t.className = 'toast'), 1800);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $('pane-' + btn.dataset.tab).classList.add('active');
  });
});

/* ---------- area form ---------- */
function areaForm(a = {}) {
  const type = a.type || 'script';
  const div = document.createElement('div');
  div.className = 'widget';
  div.innerHTML = `
    <div class="widget-head">
      <strong class="area-title">${esc(a.name || '显示区')}</strong>
      <button class="action btn-danger btn-del">删除</button>
    </div>
    <div class="grid">
      <label>名称
        <input data-f="name" value="${esc(a.name || '')}" />
      </label>
      <label>类型
        <select data-f="type">
          <option value="html" ${type === 'html' ? 'selected' : ''}>html（静态）</option>
          <option value="script" ${type === 'script' ? 'selected' : ''}>script（命令）</option>
          <option value="http" ${type === 'http' ? 'selected' : ''}>http（接口）</option>
        </select>
      </label>
      <label>刷新间隔（秒）
        <input data-f="intervalSeconds" type="number" min="1" value="${a.intervalSeconds || ''}" placeholder="跟随全局" />
      </label>
    </div>

    <div class="fld-html" style="display:${type === 'html' ? 'block' : 'none'};margin-top:10px">
      <label>HTML 内容
        <textarea data-f="html" rows="5" placeholder='如 &lt;div style="color:#FFD60A;font-size:28px"&gt;…&lt;/div&gt;'>${esc(a.html || '')}</textarea>
      </label>
    </div>

    <div class="fld-script" style="display:${type === 'script' ? 'block' : 'none'};margin-top:10px">
      <label>命令（python / shell …，stdout 为 HTML 或纯文本）
        <textarea data-f="command" rows="4" placeholder="如 date '+%H:%M:%S'  或  python3 -c '…'">${esc(a.command || '')}</textarea>
      </label>
    </div>

    <div class="fld-http" style="display:${type === 'http' ? 'block' : 'none'};margin-top:10px">
      <label>URL
        <input data-f="url" value="${esc(a.url || '')}" />
      </label>
      <label style="margin-top:8px">模板（可选，{{path}}，输出 HTML）
        <textarea data-f="template" rows="3" placeholder="如 &lt;b&gt;{{origin}}&lt;/b&gt;">${esc(a.template || '')}</textarea>
      </label>
      <label style="margin-top:8px">HTTP Headers（JSON，可选）
        <textarea data-f="headers" rows="2" placeholder='{"Authorization":"Bearer …"}'>${esc(a.headers ? JSON.stringify(a.headers, null, 2) : '')}</textarea>
      </label>
    </div>

    <div class="grid" style="margin-top:10px">
      <label>内边距
        <input data-f="padding" type="number" min="0" value="${(a.style && a.style.padding) != null ? a.style.padding : 4}" />
      </label>
      <label>圆角
        <input data-f="borderRadius" type="number" min="0" value="${(a.style && a.style.borderRadius) != null ? a.style.borderRadius : 8}" />
      </label>
      <label>背景色（可空=透明）
        <input data-f="background" type="text" value="${esc((a.style && a.style.background) || '')}" placeholder="如 #1c1c1e 或 transparent" />
      </label>
    </div>
    <div class="hint">脚本 stdout 若以 &lt; 开头按 HTML 渲染；否则套成纯文本行。也可用 python/shell 直接输出完整 HTML。</div>
  `;

  const typeSel = div.querySelector('[data-f="type"]');
  const sync = () => {
    const t = typeSel.value;
    div.querySelector('.fld-html').style.display = t === 'html' ? 'block' : 'none';
    div.querySelector('.fld-script').style.display = t === 'script' ? 'block' : 'none';
    div.querySelector('.fld-http').style.display = t === 'http' ? 'block' : 'none';
  };
  typeSel.addEventListener('change', sync);

  const nameIn = div.querySelector('[data-f="name"]');
  nameIn.addEventListener('input', () => {
    div.querySelector('.area-title').textContent = nameIn.value || '显示区';
  });

  div.querySelector('.btn-del').addEventListener('click', () => {
    div.remove();
    scheduleSave();
  });
  return div;
}

function collect() {
  const cfg = {
    backgroundOpacity: Number($('backgroundOpacity').value),
    opacity: Number($('backgroundOpacity').value),
    fontFamily: $('fontFamily').value.trim(),
    clickThrough: $('clickThrough').checked,
    lockPosition: $('lockPosition').checked,
    refreshSeconds: Number($('refreshSeconds').value) || 30,
    areas: [],
  };

  document.querySelectorAll('#areasList .widget').forEach((div) => {
    const get = (f) => div.querySelector(`[data-f="${f}"]`);
    const type = get('type').value;
    const area = {
      name: get('name').value.trim(),
      type,
      intervalSeconds: Number(get('intervalSeconds').value) || undefined,
      style: {
        padding: Number(get('padding').value) || 0,
        borderRadius: Number(get('borderRadius').value) || 0,
        background: get('background').value.trim() || 'transparent',
      },
    };
    if (type === 'html') {
      area.html = get('html').value;
    } else if (type === 'script') {
      area.command = get('command').value;
    } else {
      area.url = get('url').value.trim();
      area.template = get('template').value;
      const h = get('headers').value.trim();
      if (h) {
        try {
          area.headers = JSON.parse(h);
        } catch {
          throw new Error('headers 不是合法 JSON');
        }
      }
    }
    cfg.areas.push(area);
  });

  return cfg;
}

function fill(cfg) {
  const bg =
    cfg.backgroundOpacity != null
      ? Number(cfg.backgroundOpacity)
      : cfg.opacity != null
        ? Number(cfg.opacity)
        : 0.88;
  const bgEl = $('backgroundOpacity');
  bgEl.value = String(bg);
  bgEl.dispatchEvent(new Event('input', { bubbles: true }));
  $('backgroundOpacityVal').textContent = bg.toFixed(2);

  $('fontFamily').value = cfg.fontFamily || '';
  $('refreshSeconds').value = cfg.refreshSeconds || 30;
  $('clickThrough').checked = !!cfg.clickThrough;
  $('lockPosition').checked = !!cfg.lockPosition;

  const list = $('areasList');
  list.innerHTML = '';
  const areas = cfg.areas || (cfg.widgets || []).map((w) => ({
    name: w.name,
    type: w.type === 'http' ? 'http' : 'script',
    command: w.command,
    url: w.url,
    template: w.template,
    headers: w.headers,
    intervalSeconds: w.intervalSeconds,
    style: w.style,
  }));
  areas.forEach((a) => list.appendChild(areaForm(a)));
}

async function load() {
  const cfg = await window.hud.getConfig();
  fill(cfg || { areas: [] });
  if (window.hud.getAppInfo) applyEdition(await window.hud.getAppInfo());
}

function fillAbout(info) {
  $('aboutVersion').textContent = info.version || '0.1.0';
  $('aboutPlatform').textContent = info.platform || '—';
  $('aboutConfig').textContent = info.configPath || '—';
  $('aboutConfigDir').textContent = info.configDir || '—';
  const pro = info.edition === 'pro';
  $('aboutEdition').textContent = pro ? '完整版' : '免费版（限 1 个显示区）';
}

function applyEdition(info) {
  const pro = info && info.edition === 'pro';
  const badge = $('editionBadge');
  if (badge) {
    badge.textContent = pro ? '完整版' : '免费版';
    badge.className = 'badge' + (pro ? ' pro' : '');
  }
  const hint = $('editionHint');
  if (hint) {
    hint.textContent = pro ? '显示区数量不限，可自由排版' : '免费版仅 1 个显示区';
  }
  const go = $('goPro');
  if (go) go.style.display = pro ? 'none' : 'inline-block';
  const addBtn = $('addArea');
  if (addBtn) {
    const n = document.querySelectorAll('#areasList .widget').length;
    addBtn.disabled = !pro && n >= 1;
    addBtn.style.opacity = addBtn.disabled ? 0.5 : 1;
    addBtn.title = addBtn.disabled ? '免费版仅 1 个显示区，解锁完整版可添加更多' : '';
  }
}

/* ---------- live preview (外观) + 防抖保存 ---------- */
let saveTimer = null;

function currentAppearance() {
  return {
    backgroundOpacity: Number($('backgroundOpacity').value),
    fontFamily: $('fontFamily').value.trim(),
    clickThrough: $('clickThrough').checked,
    lockPosition: $('lockPosition').checked,
    rowStyles: [],
  };
}

function pushPreview() {
  if (window.hud.previewStyle) window.hud.previewStyle(currentAppearance());
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const res = await window.hud.saveConfig(collect());
      if (!res.ok) toast(res.error || '保存失败', true);
    } catch (e) {
      toast(String(e.message || e), true);
    }
  }, 400);
}

$('backgroundOpacity').addEventListener('input', (e) => {
  $('backgroundOpacityVal').textContent = Number(e.target.value).toFixed(2);
  pushPreview();
  scheduleSave();
});
$('fontFamily').addEventListener('input', () => {
  pushPreview();
  scheduleSave();
});
$('clickThrough').addEventListener('change', () => {
  pushPreview();
  scheduleSave();
});
$('lockPosition').addEventListener('change', () => {
  pushPreview();
  scheduleSave();
});

// 显示区内容/样式改动 → 防抖保存（保存后自动刷新显示）
$('areasList').addEventListener('change', () => scheduleSave());
$('areasList').addEventListener('input', (e) => {
  const f = e.target && e.target.getAttribute && e.target.getAttribute('data-f');
  if (f === 'name') return;
  scheduleSave();
});

$('addArea').addEventListener('click', async () => {
  const info = (window.hud.getAppInfo ? await window.hud.getAppInfo() : {}) || {};
  const pro = info.edition === 'pro';
  const n = document.querySelectorAll('#areasList .widget').length;
  if (!pro && n >= 1) {
    toast('免费版仅 1 个显示区 · 解锁完整版可添加更多', true);
    return;
  }
  $('areasList').appendChild(
    areaForm({
      name: '新显示区',
      type: 'html',
      html: '<div style="color:#FFD60A;font-size:18px">Hello</div>',
    })
  );
  applyEdition(info);
  scheduleSave();
});

$('goPro').addEventListener('click', () => {
  activateTab('about');
  const inp = $('licenseKey');
  if (inp) inp.focus();
});

$('activateBtn').addEventListener('click', async () => {
  const key = $('licenseKey').value.trim();
  if (!key) {
    toast('请输入许可证', true);
    return;
  }
  const res = await window.hud.activateLicense(key);
  toast(res.ok ? '完整版已激活' : res.error || '激活失败', !res.ok);
  if (res.ok) {
    await load();
    applyEdition(res);
    if (window.hud.getAppInfo) fillAbout(await window.hud.getAppInfo());
  }
});

$('deactivateBtn').addEventListener('click', async () => {
  const res = await window.hud.deactivateLicense();
  toast('已回到免费版', false);
  await load();
  applyEdition(res);
  if (window.hud.getAppInfo) fillAbout(await window.hud.getAppInfo());
});

$('reload').addEventListener('click', load);

$('save').addEventListener('click', async () => {
  try {
    const res = await window.hud.saveConfig(collect());
    toast(res.ok ? '已保存，生效中' : res.error || '保存失败', !res.ok);
  } catch (e) {
    toast(String(e.message || e), true);
  }
});

$('aboutOpenConfig').addEventListener('click', () => window.hud.openConfig());
$('aboutOpenDir').addEventListener('click', () => window.hud.openConfigDir());

function activateTab(name) {
  const btn = document.querySelector('.tab[data-tab="' + name + '"]');
  if (btn) btn.click();
}

(async () => {
  await load();
  const info = window.hud.getAppInfo ? await window.hud.getAppInfo() : {};
  if (info) {
    fillAbout(info);
    applyEdition(info);
  }
  if (location.hash === '#about') activateTab('about');
})();
