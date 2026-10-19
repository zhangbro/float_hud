'use strict';

const { app, BrowserWindow, Tray, Menu, screen, nativeImage, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  CONFIG_PATH,
  loadConfig,
  saveConfig,
  refreshAll,
  intervalsOf,
} = require('./data');
const license = require('./license');

const STATE_PATH = path.join(path.dirname(CONFIG_PATH), 'state.json');
const pkg = require('../package.json');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    openMainWindow();
  });
}

let win = null;
let mainWin = null;
let tray = null;
const timers = new Map();
let savePosTimer = null;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(patch) {
  const next = { ...loadState(), ...patch };
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
}

function rememberPosition() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  saveState({ x: b.x, y: b.y });
}

function applyWindowPrefs(cfg) {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(!!cfg.clickThrough, { forward: true });
  win.setMovable(!cfg.lockPosition);
  const pos = resolvePosition();
  if (pos) win.setPosition(pos.x, pos.y);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function resolvePosition() {
  const st = loadState();
  if (Number.isFinite(st.x) && Number.isFinite(st.y)) {
    return { x: Math.round(st.x), y: Math.round(st.y) };
  }
  const { workArea } = screen.getPrimaryDisplay();
  const margin = 20;
  const w = win ? win.getBounds().width : 320;
  const h = win ? win.getBounds().height : 160;
  return {
    x: workArea.x + workArea.width - w - margin,
    y: workArea.y + margin,
  };
}

function createHudWindow() {
  const cfg = loadConfig() || {};
  const pos = resolvePosition();

  win = new BrowserWindow({
    width: 320,
    height: 160,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setFullScreenable(false);
  applyWindowPrefs(cfg);
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  win.webContents.on('console-message', (_e, _l, msg) => console.log('[hud]', msg));

  win.on('move', () => {
    clearTimeout(savePosTimer);
    savePosTimer = setTimeout(rememberPosition, 300);
  });
}

function openMainWindow() {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.show();
    mainWin.focus();
    return;
  }
  mainWin = new BrowserWindow({
    width: 680,
    height: 740,
    minWidth: 560,
    minHeight: 520,
    title: 'FloatHUD',
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.removeMenu();
  const hash = process.argv.includes('--about') ? 'about' : undefined;
  mainWin.loadFile(path.join(__dirname, '..', 'src', 'home.html'), hash ? { hash } : undefined);
  mainWin.webContents.on('console-message', (_e, _l, msg) => console.log('[main]', msg));
  // 主窗口打开时显示 Dock 图标，关掉后再隐藏，方便 Cmd+Tab 找回
  if (app.dock) app.dock.show();
  mainWin.on('closed', () => {
    mainWin = null;
    if (app.dock) app.dock.hide();
  });
}

function openConfig() {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(path.join(__dirname, '..', 'config.example.json'), CONFIG_PATH);
  }
  shell.openPath(CONFIG_PATH);
}

function openConfigDir() {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  shell.openPath(path.dirname(CONFIG_PATH));
}

function toggleClickThrough() {
  const cfg = loadConfig() || {};
  cfg.clickThrough = !cfg.clickThrough;
  saveConfig(cfg);
  applyWindowPrefs(cfg);
  buildTrayMenu();
}

function toggleLockPosition() {
  const cfg = loadConfig() || {};
  cfg.lockPosition = !cfg.lockPosition;
  saveConfig(cfg);
  applyWindowPrefs(cfg);
  buildTrayMenu();
}

function schedule() {
  for (const t of timers.values()) clearInterval(t);
  timers.clear();
  const cfg = loadConfig() || {};
  const ms = intervalsOf(cfg);
  ms.forEach((interval, i) => {
    const t = setInterval(() => refreshOne(i), Math.max(1000, interval));
    timers.set(i, t);
  });
}

async function pushRows() {
  const cfg = loadConfig() || {};
  const areas = await refreshAll(cfg);
  if (win && !win.isDestroyed()) {
    win.webContents.send('rows', {
      areas,
      style: {
        opacity: cfg.opacity == null ? 0.88 : cfg.opacity,
        backgroundOpacity:
          cfg.backgroundOpacity == null ? cfg.opacity : cfg.backgroundOpacity,
        fontFamily: cfg.fontFamily || '',
        lockPosition: !!cfg.lockPosition,
        clickThrough: !!cfg.clickThrough,
      },
    });
  }
}

async function refreshOne() {
  await pushRows();
}

async function refreshNow() {
  await pushRows();
  schedule();
}

function reloadAll() {
  const c = loadConfig() || {};
  applyWindowPrefs(c);
  if (tray) tray.setContextMenu(buildTrayMenu());
  refreshNow();
}

function buildTrayMenu() {
  const cfg = loadConfig() || {};
  return Menu.buildFromTemplate([
    { label: '打开主界面', click: openMainWindow },
    { label: '刷新数据', click: refreshNow },
    { type: 'separator' },
    {
      label: '鼠标穿透',
      type: 'checkbox',
      checked: !!cfg.clickThrough,
      click: toggleClickThrough,
    },
    {
      label: '固定位置',
      type: 'checkbox',
      checked: !!cfg.lockPosition,
      click: toggleLockPosition,
    },
    { type: 'separator' },
    { label: '编辑配置文件', click: openConfig },
    { label: '打开配置目录', click: openConfigDir },
    { type: 'separator' },
    { label: '关于 FloatHUD', click: () => { openMainWindow(); } },
    { label: '退出', click: () => app.quit() },
  ]);
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  // 36x36 @2x = 18pt，避免被当成 44pt 显示
  let img = nativeImage.createFromPath(iconPath);
  if (!img.isEmpty()) {
    img = nativeImage.createFromBuffer(img.toPNG(), { scaleFactor: 2.0 });
  }
  if (img.isEmpty()) {
    img = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR42mNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIwCAAgJAAF/lVurAAAAAElFTkSuQmCC'
    );
  }
  img.setTemplateImage(false);
  tray = new Tray(img);
  tray.setToolTip('FloatHUD — 打开主界面');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => {
    openMainWindow();
  });
}

ipcMain.handle('get-config', () => {
  return loadConfig() || { widgets: [] };
});

ipcMain.handle('save-config', (_e, cfg) => {
  try {
    if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'invalid config' };
    if (!Array.isArray(cfg.areas) && !Array.isArray(cfg.widgets)) {
      return { ok: false, error: 'areas 必须是数组' };
    }
    delete cfg.x;
    delete cfg.y;
    delete cfg.position;
    // 免费版仅允许 1 个显示区
    license.clampAreas(cfg);
    saveConfig(cfg);
    reloadAll();
    return {
      ok: true,
      edition: license.isPro(cfg) ? 'pro' : 'free',
      areaLimit: license.maxAreas(cfg),
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('get-app-info', () => {
  const cfg = loadConfig() || {};
  return {
    version: pkg.version || '0.0.0',
    platform: `${process.platform} · ${process.arch}`,
    configPath: CONFIG_PATH,
    configDir: path.dirname(CONFIG_PATH),
    edition: license.isPro(cfg) ? 'pro' : 'free',
    areaLimit: license.isPro(cfg) ? 'unlimited' : 1,
  };
});

ipcMain.handle('activate-license', (_e, key) => {
  const cfg = loadConfig() || {};
  const res = license.activate(cfg, key);
  if (res.ok) {
    saveConfig(cfg);
    reloadAll();
    const c2 = loadConfig() || {};
    res.edition = license.isPro(c2) ? 'pro' : 'free';
    res.areaLimit = license.isPro(c2) ? 'unlimited' : 1;
  }
  return res;
});

ipcMain.handle('deactivate-license', () => {
  const cfg = loadConfig() || {};
  delete cfg.licenseKey;
  cfg.edition = 'free';
  license.clampAreas(cfg);
  saveConfig(cfg);
  reloadAll();
  return { ok: true, edition: 'free', areaLimit: 1 };
});

ipcMain.handle('open-config', () => {
  openConfig();
  return { ok: true };
});

ipcMain.handle('open-config-dir', () => {
  openConfigDir();
  return { ok: true };
});

// 改大小（显示区 / 整块 HUD）写回配置
ipcMain.on('set-size', (_e, kind, index, w, h) => {
  const cfg = loadConfig() || {};
  if (cfg.lockPosition) return;
  const width = Math.max(40, Math.round(Number(w) || 0));
  const height = Math.max(24, Math.round(Number(h) || 0));
  if (kind === 'area') {
    const areas = cfg.areas || [];
    if (!areas[index]) return;
    areas[index].style = areas[index].style || {};
    areas[index].style.width = width;
    areas[index].style.height = height;
    cfg.areas = areas;
  } else if (kind === 'card') {
    cfg.hudWidth = width;
    cfg.hudHeight = height;
  }
  saveConfig(cfg);
  // 不 reloadAll，避免尺寸回跳；下次 refresh 会带上新尺寸
});

// 复位 HUD 自动适配
ipcMain.on('reset-size', () => {
  const cfg = loadConfig() || {};
  delete cfg.hudWidth;
  delete cfg.hudHeight;
  saveConfig(cfg);
  reloadAll();
});

// 整块可视区拖动
ipcMain.on('move-window', (_e, dx, dy) => {
  if (!win || win.isDestroyed()) return;
  const cfg = loadConfig() || {};
  if (cfg.lockPosition) return;
  const b = win.getBounds();
  win.setPosition(b.x + Math.round(Number(dx) || 0), b.y + Math.round(Number(dy) || 0));
});

// 悬浮窗右键菜单
ipcMain.on('show-hud-menu', () => {
  const cfg = loadConfig() || {};
  const menu = Menu.buildFromTemplate([
    { label: '打开主界面', click: () => openMainWindow() },
    { label: '刷新', click: () => refreshNow() },
    { type: 'separator' },
    {
      label: '鼠标穿透',
      type: 'checkbox',
      checked: !!cfg.clickThrough,
      click: toggleClickThrough,
    },
    {
      label: '固定位置',
      type: 'checkbox',
      checked: !!cfg.lockPosition,
      click: toggleLockPosition,
    },
    {
      label: '重置为自适应大小',
      click: () => {
        const c = loadConfig() || {};
        delete c.hudWidth;
        delete c.hudHeight;
        if (Array.isArray(c.areas)) {
          c.areas.forEach((a) => {
            if (a.style) {
              delete a.style.width;
              delete a.style.height;
            }
          });
        }
        saveConfig(c);
        reloadAll();
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
});

// 窗口贴合内容，使可交互区 = 黑色显示区
ipcMain.on('resize-hud', (_e, w, h) => {
  if (!win || win.isDestroyed()) return;
  const width = Math.max(140, Math.min(900, Math.ceil(Number(w) || 320)));
  const height = Math.max(56, Math.min(480, Math.ceil(Number(h) || 120)));
  const b = win.getBounds();
  if (Math.abs(b.width - width) > 1 || Math.abs(b.height - height) > 1) {
    win.setSize(width, height);
    saveState({ x: win.getBounds().x, y: win.getBounds().y });
  }
});

// 外观实时预览：不落盘，立即推给 HUD
ipcMain.on('preview-style', (_e, payload) => {
  if (!win || win.isDestroyed()) return;
  const style = payload || {};
  win.webContents.send('rows', {
    style: {
      backgroundOpacity: style.backgroundOpacity,
      opacity: style.backgroundOpacity,
      fontFamily: style.fontFamily || '',
      lockPosition: !!style.lockPosition,
      clickThrough: !!style.clickThrough,
    },
    rowStyles: style.rowStyles || [],
  });
  if (style.clickThrough != null) {
    win.setIgnoreMouseEvents(!!style.clickThrough, { forward: true });
  }
  if (style.lockPosition != null) {
    win.setMovable(!style.lockPosition);
  }
});

app.on('before-quit', rememberPosition);

// 双击 .app / 从 Finder 再次打开 → 进主界面
app.on('activate', () => {
  openMainWindow();
});

if (gotLock) {
  app.whenReady().then(() => {
    createHudWindow();
    createTray();
    if (process.argv.includes('--settings') || process.argv.includes('--main') || process.argv.includes('--about')) {
      openMainWindow();
    }
    refreshNow();

    const dir = path.dirname(CONFIG_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.watch(dir, () => {
      reloadAll();
    });

    screen.on('display-metrics-changed', () => {
      const cfg = loadConfig() || {};
      applyWindowPrefs(cfg);
    });
  });
}

app.on('window-all-closed', () => {
  app.quit();
});
