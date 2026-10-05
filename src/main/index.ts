import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } from "electron";
import { statfs } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { Worker } from "worker_threads";
import { autoUpdater } from "electron-updater";
import { listSnapshots, readSnapshot } from "./snapshots";
import type { DriveInfo, DupCandidate, TrashResult, UpdateStatus } from "../shared/types";

const BAR_HEIGHT = 36;
let win: BrowserWindow | null = null;
let scan: Worker | null = null;
let dup: Worker | null = null;

const snapshotDir = (): string => join(app.getPath("userData"), "snapshots");

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 920,
    minHeight: 560,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#11121a" : "#ffffff",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#00000000", symbolColor: "#808080", height: BAR_HEIGHT },
    icon: join(__dirname, "../../build/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
    },
  });
  win.once("ready-to-show", () => win?.show());
  win.on("closed", () => {
    win = null;
    stopScan();
    stopDup();
  });
  // Links open in the browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
}

// Ask the scan to stop and only terminate it if it does not answer. A hard
// stop while its threads load native code can take the whole app down.
function stopScan(): void {
  if (scan) {
    const w = scan;
    scan = null;
    w.postMessage({ type: "cancel" });
    const timer = setTimeout(() => void w.terminate(), 4000);
    w.once("exit", () => clearTimeout(timer));
  }
}

function stopDup(): void {
  if (dup) {
    const w = dup;
    dup = null;
    void w.terminate();
  }
}

// Drives ------------------------------------------------------------------

async function listDrives(): Promise<DriveInfo[]> {
  if (process.platform !== "win32") {
    const s = await statfs("/");
    return [{ path: "/", total: s.blocks * s.bsize, free: s.bavail * s.bsize }];
  }
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const probe = async (letter: string): Promise<DriveInfo | null> => {
    const path = letter + ":\\";
    try {
      // A disconnected network drive can hang; give up on it quickly.
      const s = await Promise.race([
        statfs(path),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)),
      ]);
      const total = s.blocks * s.bsize;
      return total > 0 ? { path, total, free: s.bavail * s.bsize } : null;
    } catch {
      return null;
    }
  };
  return (await Promise.all(letters.map(probe))).filter((d): d is DriveInfo => d !== null);
}

ipcMain.handle("drives:list", () => listDrives());

ipcMain.handle("dialog:pickFolder", async () => {
  if (!win) return null;
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
});

// Scan --------------------------------------------------------------------

ipcMain.handle("scan:start", (_e, rootArg: string) => {
  stopScan();
  stopDup();
  const root = resolve(String(rootArg));
  if (!existsSync(root)) return { ok: false, error: "ENOENT" };

  const worker = new Worker(join(__dirname, "scanworker.js"), {
    workerData: { root, snapshotDir: snapshotDir() },
  });
  scan = worker;
  const mine = (): boolean => scan === worker;
  worker.on("message", (msg) => {
    if (!mine()) return;
    if (msg.type === "progress") send("scan:progress", msg.progress);
    else if (msg.type === "partial") send("scan:partial", msg.table);
    else if (msg.type === "done") {
      send("scan:done", msg.table, msg.snapshot);
      stopScan();
    } else if (msg.type === "error") {
      send("scan:error", msg.error);
      stopScan();
    }
  });
  worker.on("error", (err) => {
    if (!mine()) return;
    send("scan:error", String((err as Error)?.message ?? err));
    stopScan();
  });
  worker.on("exit", (code) => {
    if (!mine()) return;
    scan = null;
    if (code !== 0) send("scan:error", "The scan stopped unexpectedly (code " + code + ").");
  });
  return { ok: true, root };
});

ipcMain.handle("scan:cancel", () => stopScan());

// Snapshots ---------------------------------------------------------------

ipcMain.handle("snap:list", (_e, root: string) => listSnapshots(snapshotDir(), String(root)));
ipcMain.handle("snap:load", (_e, file: string) => {
  try {
    return { ok: true, snapshot: readSnapshot(snapshotDir(), String(file)) };
  } catch (e) {
    return { ok: false, error: String((e as Error).message) };
  }
});

// Duplicates --------------------------------------------------------------

ipcMain.handle("dup:start", (_e, candidates: DupCandidate[]) => {
  stopDup();
  const worker = new Worker(join(__dirname, "dupworker.js"), { workerData: candidates });
  dup = worker;
  const mine = (): boolean => dup === worker;
  worker.on("message", (msg) => {
    if (!mine()) return;
    if (msg.type === "progress") send("dup:progress", msg.progress);
    else if (msg.type === "done") {
      send("dup:done", msg.groups);
      stopDup();
    }
  });
  worker.on("error", (err) => {
    if (!mine()) return;
    send("dup:error", String((err as Error)?.message ?? err));
    stopDup();
  });
});

ipcMain.handle("dup:cancel", () => stopDup());

// Shell -------------------------------------------------------------------

ipcMain.handle("shell:showInFolder", (_e, path: string) => shell.showItemInFolder(String(path)));
ipcMain.handle("shell:openPath", (_e, path: string) => shell.openPath(String(path)));
ipcMain.handle("shell:openExternal", (_e, url: string) => {
  if (/^https:\/\//.test(String(url))) void shell.openExternal(String(url));
});
ipcMain.handle("shell:trash", async (_e, paths: string[]): Promise<TrashResult[]> => {
  const out: TrashResult[] = [];
  for (const path of paths) {
    try {
      await shell.trashItem(path);
      out.push({ path, ok: true });
    } catch (e) {
      out.push({ path, ok: false, error: String((e as Error).message) });
    }
  }
  return out;
});
ipcMain.handle("clipboard:write", (_e, text: string) => clipboard.writeText(String(text)));

// Window ------------------------------------------------------------------

ipcMain.handle("win:setOverlay", (_e, symbolColor: string) => {
  if (win && process.platform === "win32" && /^#[0-9a-f]{6}$/i.test(symbolColor)) {
    win.setTitleBarOverlay({ color: "#00000000", symbolColor, height: BAR_HEIGHT });
  }
});
ipcMain.handle("app:info", () => ({
  version: app.getVersion(),
  platform: process.platform,
  home: app.getPath("home"),
}));
ipcMain.handle("app:quit", () => app.quit());
ipcMain.handle("win:toggleFullScreen", () => win?.setFullScreen(!win.isFullScreen()));
ipcMain.handle("win:devtools", () => win?.webContents.toggleDevTools());

// Updates -----------------------------------------------------------------

autoUpdater.autoDownload = false;
const upd = (status: UpdateStatus): void => send("upd:status", status);
autoUpdater.on("checking-for-update", () => upd({ state: "checking" }));
autoUpdater.on("update-available", (info) => upd({ state: "available", version: info.version }));
autoUpdater.on("update-not-available", () => upd({ state: "none" }));
autoUpdater.on("download-progress", (p) => upd({ state: "downloading", percent: p.percent }));
autoUpdater.on("update-downloaded", (info) => upd({ state: "ready", version: info.version }));
autoUpdater.on("error", (err) => upd({ state: "error", error: String((err as Error)?.message ?? err) }));

ipcMain.handle("upd:check", async () => {
  if (!app.isPackaged) return upd({ state: "dev" });
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    upd({ state: "error", error: String((e as Error).message) });
  }
});
ipcMain.handle("upd:download", () => autoUpdater.downloadUpdate().catch(() => undefined));
ipcMain.handle("upd:install", () => autoUpdater.quitAndInstall());

// App ---------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  void app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
