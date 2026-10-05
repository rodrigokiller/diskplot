import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, screen, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { cp, rename, rm, stat, statfs } from "fs/promises";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { basename, dirname, extname, join, resolve, sep } from "path";
import { Worker } from "worker_threads";
import { autoUpdater } from "electron-updater";
import { listSnapshots, readSnapshot } from "./snapshots";
import type {
  DriveInfo,
  DupCandidate,
  FileClip,
  ItemStat,
  Measured,
  PasteResult,
  ScanTable,
  TrashResult,
  UpdateStatus,
  WindowInfo,
} from "../shared/types";

const BAR_HEIGHT = 36;

// One window is one scan. Everything a window owns lives in its session.
interface Session {
  win: BrowserWindow;
  scan: Worker | null;
  dup: Worker | null;
}
const sessions = new Map<number, Session>(); // by webContents id

const snapshotDir = (): string => join(app.getPath("userData"), "snapshots");
const sessionOf = (e: IpcMainInvokeEvent): Session | undefined => sessions.get(e.sender.id);

function send(s: Session, channel: string, ...args: unknown[]): void {
  if (!s.win.isDestroyed()) s.win.webContents.send(channel, ...args);
}
function broadcast(channel: string, ...args: unknown[]): void {
  for (const s of sessions.values()) send(s, channel, ...args);
}

function windowList(): WindowInfo[] {
  const focused = BrowserWindow.getFocusedWindow();
  return [...sessions.values()].map((s) => ({ id: s.win.id, title: s.win.getTitle(), focused: s.win === focused }));
}
const announceWindows = (): void => broadcast("win:list", windowList());

function createWindow(root?: string): void {
  // A new window opens a little down and to the right of the current one.
  const from = BrowserWindow.getFocusedWindow();
  const at = from && !from.isMaximized() ? { x: from.getBounds().x + 32, y: from.getBounds().y + 32 } : {};
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    ...at,
    minWidth: 920,
    minHeight: 560,
    show: false,
    title: "Diskplot",
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
  const id = win.webContents.id;
  const session: Session = { win, scan: null, dup: null };
  sessions.set(id, session);

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    stopScan(session);
    stopDup(session);
    sessions.delete(id);
    announceWindows();
  });
  win.on("focus", announceWindows);
  win.on("page-title-updated", () => setTimeout(announceWindows, 0));
  // Links open in the browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  const hash = root ? "#scan=" + encodeURIComponent(root) : "";
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL + hash);
  else void win.loadFile(join(__dirname, "../renderer/index.html"), root ? { hash: hash.slice(1) } : undefined);
  announceWindows();
}

// Ask the scan to stop and only terminate it if it does not answer. A hard
// stop while its threads load native code can take the whole app down.
function retire(w: Worker): void {
  w.postMessage({ type: "cancel" });
  const timer = setTimeout(() => void w.terminate(), 4000);
  w.once("exit", () => clearTimeout(timer));
}
function stopScan(s: Session): void {
  if (s.scan) {
    const w = s.scan;
    s.scan = null;
    retire(w);
  }
}
function stopDup(s: Session): void {
  if (s.dup) {
    const w = s.dup;
    s.dup = null;
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

ipcMain.handle("dialog:pickFolder", async (e) => {
  const s = sessionOf(e);
  if (!s) return null;
  const r = await dialog.showOpenDialog(s.win, { properties: ["openDirectory"] });
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
});

// Scan --------------------------------------------------------------------

ipcMain.handle("scan:start", (e, rootArg: string) => {
  const s = sessionOf(e);
  if (!s) return { ok: false, error: "ENOWINDOW" };
  stopScan(s);
  stopDup(s);
  const root = resolve(String(rootArg));
  if (!existsSync(root)) return { ok: false, error: "ENOENT" };

  const worker = new Worker(join(__dirname, "scanworker.js"), {
    workerData: { root, snapshotDir: snapshotDir() },
  });
  s.scan = worker;
  const mine = (): boolean => s.scan === worker;
  worker.on("message", (msg) => {
    if (!mine()) return;
    if (msg.type === "progress") send(s, "scan:progress", msg.progress);
    else if (msg.type === "partial") send(s, "scan:partial", msg.table);
    else if (msg.type === "done") {
      send(s, "scan:done", msg.table, msg.snapshot);
      stopScan(s);
    } else if (msg.type === "error") {
      send(s, "scan:error", msg.error);
      stopScan(s);
    }
  });
  worker.on("error", (err) => {
    if (!mine()) return;
    send(s, "scan:error", String((err as Error)?.message ?? err));
    stopScan(s);
  });
  worker.on("exit", (code) => {
    if (!mine()) return;
    s.scan = null;
    if (code !== 0) send(s, "scan:error", "The scan stopped unexpectedly (code " + code + ").");
  });
  return { ok: true, root };
});

ipcMain.handle("scan:cancel", (e) => {
  const s = sessionOf(e);
  if (s) stopScan(s);
});

// Measures one item after a paste, so it can be added to a scan that is
// already on screen. A folder is walked quietly: no preview, no snapshot.
function measure(path: string): Promise<Measured> {
  return stat(path).then((st) => {
    const name = basename(path);
    if (!st.isDirectory()) {
      return { ok: true, kind: "file", name, size: st.size, mtime: Math.floor(st.mtimeMs / 1000) } as Measured;
    }
    return new Promise<Measured>((done) => {
      const worker = new Worker(join(__dirname, "scanworker.js"), { workerData: { root: path, snapshotDir: "", quiet: true } });
      worker.on("message", (msg) => {
        if (msg.type === "done") done({ ok: true, kind: "dir", name, table: msg.table as ScanTable });
        else if (msg.type === "error") done({ ok: false, error: String(msg.error) });
      });
      worker.on("error", (err) => done({ ok: false, error: String((err as Error)?.message ?? err) }));
    });
  });
}
ipcMain.handle("fs:measure", (_e, path: string) =>
  measure(String(path)).catch((e): Measured => ({ ok: false, error: String((e as Error).message) })),
);

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

ipcMain.handle("dup:start", (e, candidates: DupCandidate[]) => {
  const s = sessionOf(e);
  if (!s) return;
  stopDup(s);
  const worker = new Worker(join(__dirname, "dupworker.js"), { workerData: candidates });
  s.dup = worker;
  const mine = (): boolean => s.dup === worker;
  worker.on("message", (msg) => {
    if (!mine()) return;
    if (msg.type === "progress") send(s, "dup:progress", msg.progress);
    else if (msg.type === "done") {
      send(s, "dup:done", msg.groups);
      stopDup(s);
    }
  });
  worker.on("error", (err) => {
    if (!mine()) return;
    send(s, "dup:error", String((err as Error)?.message ?? err));
    stopDup(s);
  });
});

ipcMain.handle("dup:cancel", (e) => {
  const s = sessionOf(e);
  if (s) stopDup(s);
});

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

ipcMain.handle("fs:stat", async (_e, path: string): Promise<ItemStat> => {
  try {
    const st = await stat(String(path));
    return {
      ok: true,
      created: Math.floor(st.birthtimeMs / 1000),
      modified: Math.floor(st.mtimeMs / 1000),
      accessed: Math.floor(st.atimeMs / 1000),
      readOnly: (st.mode & 0o200) === 0,
    };
  } catch (e) {
    return { ok: false, error: String((e as NodeJS.ErrnoException).code ?? (e as Error).message) };
  }
});

// Copy, cut and paste of files ----------------------------------------------
// The clip is kept here so every window shares it. A copy is also put on the
// system clipboard, so it can be pasted in Explorer; a cut stays inside the
// app, because the system format for "move" cannot be written from here.

let clip: FileClip | null = null;

function powershell(command: string, env: Record<string, string>): Promise<string> {
  return new Promise((done) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { env: { ...process.env, ...env }, timeout: 6000, windowsHide: true },
      (_err, stdout) => done(String(stdout ?? "")),
    );
  });
}

ipcMain.handle("clip:set", async (_e, paths: string[], cut: boolean) => {
  clip = { paths: paths.map(String), cut: Boolean(cut) };
  if (process.platform !== "win32") return;
  if (cut) clipboard.clear();
  // The paths travel in the environment, never inside the command text.
  else await powershell('Set-Clipboard -LiteralPath ($env:DISKPLOT_PATHS -split "`n")', { DISKPLOT_PATHS: clip.paths.join("\n") });
});

ipcMain.handle("clip:get", async (): Promise<FileClip | null> => {
  let system: string[] = [];
  if (process.platform === "win32") {
    const out = await powershell("Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }", {});
    system = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }
  // Something copied in Explorer after our own clip takes over from it.
  if (system.length > 0 && (!clip || system.join("\n").toLowerCase() !== clip.paths.join("\n").toLowerCase())) {
    return { paths: system, cut: false };
  }
  return clip;
});

async function freeName(dir: string, name: string): Promise<string> {
  if (!existsSync(join(dir, name))) return name;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} - Copy${i === 1 ? "" : ` (${i})`}${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
  throw new Error("EEXIST");
}

ipcMain.handle("fs:paste", async (_e, paths: string[], cut: boolean, destArg: string): Promise<PasteResult[]> => {
  const destDir = resolve(String(destArg));
  const out: PasteResult[] = [];
  for (const raw of paths) {
    const src = resolve(String(raw));
    try {
      const inside = (destDir + sep).toLowerCase().startsWith((src + sep).toLowerCase());
      if (inside) throw new Error("EINSIDE"); // a folder cannot go into itself
      if (cut && dirname(src).toLowerCase() === destDir.toLowerCase()) throw new Error("ESAME"); // already there
      const dest = join(destDir, await freeName(destDir, basename(src)));
      if (cut) {
        try {
          await rename(src, dest);
        } catch (e) {
          // Another drive: copy across, then remove the original.
          if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
          await cp(src, dest, { recursive: true, errorOnExist: true, force: false });
          await rm(src, { recursive: true, force: true });
        }
      } else {
        await cp(src, dest, { recursive: true, errorOnExist: true, force: false });
      }
      out.push({ src, dest, ok: true });
    } catch (e) {
      out.push({ src, dest: "", ok: false, error: String((e as NodeJS.ErrnoException).code ?? (e as Error).message) });
    }
  }
  if (cut && out.some((r) => r.ok)) clip = null;
  return out;
});

// Windows -----------------------------------------------------------------

ipcMain.handle("win:setOverlay", (e, symbolColor: string) => {
  const s = sessionOf(e);
  if (s && process.platform === "win32" && /^#[0-9a-f]{6}$/i.test(symbolColor)) {
    s.win.setTitleBarOverlay({ color: "#00000000", symbolColor, height: BAR_HEIGHT });
  }
});
ipcMain.handle("win:new", (_e, root?: string) => createWindow(root ? String(root) : undefined));
ipcMain.handle("win:close", (e) => sessionOf(e)?.win.close());
ipcMain.handle("win:list", () => windowList());
ipcMain.handle("win:setTitle", (e, title: string) => {
  sessionOf(e)?.win.setTitle(String(title).slice(0, 200));
  announceWindows();
});
ipcMain.handle("win:focus", (_e, id: number) => {
  const w = BrowserWindow.fromId(Number(id));
  if (!w) return;
  if (w.isMinimized()) w.restore();
  w.focus();
});
ipcMain.handle("win:arrange", (e, how: "columns" | "rows" | "cascade") => {
  const me = sessionOf(e);
  const wins = [...sessions.values()].map((s) => s.win).filter((w) => !w.isMinimized());
  if (!me || wins.length === 0) return;
  const area = screen.getDisplayMatching(me.win.getBounds()).workArea;
  wins.forEach((w, i) => {
    if (w.isMaximized()) w.unmaximize();
    if (w.isFullScreen()) w.setFullScreen(false);
    const n = wins.length;
    if (how === "columns") {
      const width = Math.floor(area.width / n);
      w.setBounds({ x: area.x + i * width, y: area.y, width, height: area.height });
    } else if (how === "rows") {
      const height = Math.floor(area.height / n);
      w.setBounds({ x: area.x, y: area.y + i * height, width: area.width, height });
    } else {
      const step = 36;
      w.setBounds({
        x: area.x + i * step,
        y: area.y + i * step,
        width: Math.max(920, Math.floor(area.width * 0.72)),
        height: Math.max(560, Math.floor(area.height * 0.78)),
      });
      w.moveTop();
    }
  });
  me.win.focus();
});
ipcMain.handle("win:toggleFullScreen", (e) => {
  const s = sessionOf(e);
  s?.win.setFullScreen(!s.win.isFullScreen());
});
ipcMain.handle("win:devtools", (e) => sessionOf(e)?.win.webContents.toggleDevTools());

ipcMain.handle("app:info", () => ({
  version: app.getVersion(),
  platform: process.platform,
  home: app.getPath("home"),
}));
ipcMain.handle("app:quit", () => app.quit());

// Updates -----------------------------------------------------------------

autoUpdater.autoDownload = false;
const upd = (status: UpdateStatus): void => broadcast("upd:status", status);
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
  // Starting the app again opens another window in the one running process.
  app.on("second-instance", () => createWindow());
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
