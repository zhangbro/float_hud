'use strict';

let lastAreas = [];
let lastStyle = {
  backgroundOpacity: 0.88,
  opacity: 0.88,
  fontFamily: '',
  lockPosition: false,
  clickThrough: false,
};

function render(payload) {
  if (payload && payload.areas) lastAreas = payload.areas;
  if (payload && payload.rows) {
    lastAreas = payload.rows.map((r) => ({
      name: r.name,
      html: r.html != null ? r.html : `<div style="color:${r.color || '#e5e5ea'};font-size:${r.fontSize || 16}px;font-weight:600">${escapeHtml(r.text || '')}</div>`,
      error: r.error,
    }));
  }
  if (payload && payload.style) {
    lastStyle = { ...lastStyle, ...payload.style };
    if (lastStyle.backgroundOpacity == null) lastStyle.backgroundOpacity = lastStyle.opacity;
    if (lastStyle.opacity == null) lastStyle.opacity = lastStyle.backgroundOpacity;
  }

  const card = document.getElementById('card');
  const bg = lastStyle.backgroundOpacity != null ? lastStyle.backgroundOpacity : 0.88;
  card.style.background = `rgba(0,0,0,${bg})`;

  const font = lastStyle.fontFamily || '';
  if (font) card.style.fontFamily = font;

  const locked = !!lastStyle.lockPosition;
  const interactive = !lastStyle.clickThrough;
  const baseCursor = interactive ? (locked ? 'pointer' : 'grab') : 'default';
  card.style.cursor = baseCursor;

  const container = document.getElementById('areas');

  if (!lastAreas || lastAreas.length === 0) {
    container.innerHTML =
      '<div class="area" style="cursor:' + baseCursor + '">无显示区 · 右键打开主界面</div>';
    reportSize();
    return;
  }

  container.innerHTML = lastAreas
    .map((a, i) => {
      const st = a.style || {};
      const pad = st.padding != null ? st.padding : 4;
      const radius = st.borderRadius != null ? st.borderRadius : 8;
      const bgc = st.background || 'transparent';
      const err = a.error ? ' err' : '';
      const title = a.error ? ` title="${escapeHtml(a.error)}"` : '';
      const w = st.width ? `width:${Number(st.width)}px;` : '';
      const h = st.height ? `height:${Number(st.height)}px;overflow:hidden;` : '';
      return `<div class="area${err}" data-i="${i}"${title} style="position:relative;cursor:${baseCursor};padding:${pad}px;border-radius:${radius}px;background:${bgc};${w}${h}">${a.html || ''}</div>`;
    })
    .join('');

  if (lastStyle.hudWidth) card.style.width = Number(lastStyle.hudWidth) + 'px';
  if (lastStyle.hudHeight) card.style.height = Number(lastStyle.hudHeight) + 'px';
  if (!lastStyle.hudWidth && !lastStyle.hudHeight) {
    card.style.width = 'fit-content';
    card.style.height = 'fit-content';
  }

  bindHover();
  reportSize();
}

function reportSize() {
  const card = document.getElementById('card');
  const rect = card.getBoundingClientRect();
  const w = Math.ceil(rect.width);
  const h = Math.ceil(rect.height);
  if (w > 0 && h > 0 && window.hud && window.hud.resize) {
    window.hud.resize(w, h);
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showTip(x, y, text) {
  const tip = document.getElementById('sizeTip');
  tip.textContent = text;
  tip.style.left = Math.min(x + 14, window.innerWidth - 100) + 'px';
  tip.style.top = Math.max(8, y - 28) + 'px';
  tip.classList.add('show');
}

function hideTip() {
  document.getElementById('sizeTip').classList.remove('show');
}

/* ---------- 只在右下角调大小，其余拖动 ---------- */
const SE = 16; // 右下角命中范围
const MIN_AREA_W = 48;
const MIN_AREA_H = 28;
const MIN_CARD_W = 100;
const MIN_CARD_H = 44;

function canDrag() {
  return !lastStyle.clickThrough && !lastStyle.lockPosition && window.hud && window.hud.moveWindowBy;
}

function canResize() {
  return !lastStyle.clickThrough && !lastStyle.lockPosition;
}

function inSE(x, y, rect) {
  return rect.right - x <= SE && rect.bottom - y <= SE && x <= rect.right + 4 && y <= rect.bottom + 4;
}

/** 命中：显示区右下角优先，其次整卡右下角 */
function findResizeTarget(e) {
  if (!canResize()) return null;
  const areas = document.querySelectorAll('#areas .area');
  for (let i = areas.length - 1; i >= 0; i--) {
    const el = areas[i];
    const rect = el.getBoundingClientRect();
    if (inSE(e.clientX, e.clientY, rect)) {
      return { kind: 'area', index: Number(el.dataset.i || i), el, rect };
    }
  }
  const card = document.getElementById('card');
  const rect = card.getBoundingClientRect();
  if (inSE(e.clientX, e.clientY, rect)) {
    return { kind: 'card', index: 0, el: card, rect };
  }
  return null;
}

function areaAt(e) {
  const areas = document.querySelectorAll('#areas .area');
  for (let i = areas.length - 1; i >= 0; i--) {
    const el = areas[i];
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      return el;
    }
  }
  return null;
}

function clearHover() {
  document.querySelectorAll('.area.hover').forEach((el) => el.classList.remove('hover'));
  document.getElementById('card').classList.remove('hover');
}

function bindHover() {
  /* 渲染后由 mousemove 统一处理悬停框 */
}

let pending = null;
let dragging = false;
let resizing = null;

document.addEventListener('mousemove', (e) => {
  // 调整大小中
  if (resizing) {
    const dx = e.screenX - resizing.sx;
    const dy = e.screenY - resizing.sy;
    const isArea = resizing.kind === 'area';
    const minW = isArea ? MIN_AREA_W : MIN_CARD_W;
    const minH = isArea ? MIN_AREA_H : MIN_CARD_H;

    const w = Math.max(minW, Math.round(resizing.w + dx));
    const h = Math.max(minH, Math.round(resizing.h + dy));

    resizing.el.style.width = w + 'px';
    resizing.el.style.height = h + 'px';
    if (isArea) resizing.el.style.overflow = 'hidden';

    if (!isArea) {
      lastStyle.hudWidth = w;
      lastStyle.hudHeight = h;
    }

    resizing.last = { w, h, i: resizing.index, kind: isArea ? 'area' : 'card' };
    showTip(e.screenX, e.screenY, `${Math.round(w)} × ${Math.round(h)}`);
    reportSize();
    return;
  }

  // 悬停：右下角改光标，区域显示边框
  if (canResize() || canDrag()) {
    const rz = findResizeTarget(e);
    if (rz) {
      document.body.style.cursor = 'nwse-resize';
      rz.el.style.cursor = 'nwse-resize';
    } else {
      const base = canDrag() ? (dragging ? 'grabbing' : 'grab') : 'default';
      document.body.style.cursor = base;
      const card = document.getElementById('card');
      if (card) card.style.cursor = base;
    }

    // 显示区边框
    clearHover();
    if (!dragging && !rz) {
      const hit = areaAt(e);
      if (hit) hit.classList.add('hover');
      else if (e.clientX && e.clientY) {
        const card = document.getElementById('card');
        const r = card.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          card.classList.add('hover');
        }
      }
    }
  }

  // 拖动窗口
  if (!pending) return;
  const dx = e.screenX - pending.sx;
  const dy = e.screenY - pending.sy;
  if (!dragging && (Math.abs(e.screenX - pending.x) > 3 || Math.abs(e.screenY - pending.y) > 3)) {
    dragging = true;
    clearHover();
    document.body.style.cursor = 'grabbing';
  }
  if (dragging && canDrag()) window.hud.moveWindowBy(dx, dy);
  pending.sx = e.screenX;
  pending.sy = e.screenY;
});

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;

  // 仅右下角进入改大小
  if (canResize()) {
    const rz = findResizeTarget(e);
    if (rz) {
      e.preventDefault();
      e.stopPropagation();
      resizing = {
        ...rz,
        sx: e.screenX,
        sy: e.screenY,
        w: rz.rect.width,
        h: rz.rect.height,
      };
      document.body.style.cursor = 'nwse-resize';
      showTip(e.screenX, e.screenY, `${Math.round(rz.rect.width)} × ${Math.round(rz.rect.height)}`);
      return;
    }
  }

  // 其余一律拖动
  if (!canDrag()) return;
  pending = { x: e.screenX, y: e.screenY, sx: e.screenX, sy: e.screenY };
  dragging = false;
});

document.addEventListener('mouseup', () => {
  hideTip();
  if (resizing) {
    const last = resizing.last;
    if (last && window.hud && window.hud.setSize) {
      if (resizing.kind === 'area') window.hud.setSize('area', last.i, last.w, last.h);
      else window.hud.setSize('card', 0, last.w, last.h);
    }
    resizing = null;
    document.body.style.cursor = canDrag() ? 'grab' : 'default';
    return;
  }
  pending = null;
  dragging = false;
  document.body.style.cursor = canDrag() ? 'grab' : 'default';
});

document.addEventListener('mouseleave', () => {
  clearHover();
  if (!resizing && !dragging) {
    document.body.style.cursor = canDrag() ? 'grab' : 'default';
  }
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (window.hud && window.hud.showHudMenu) window.hud.showHudMenu();
});

window.hud.onRows(render);
