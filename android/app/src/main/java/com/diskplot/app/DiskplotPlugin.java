package com.diskplot.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.app.PendingIntent;
import android.content.IntentSender;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.view.Window;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.system.Os;
import android.system.StructStat;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;

/**
 * The native side of window.api on Android: storage access, volumes, the
 * scanner and the duplicate finder. See src/mobile/bridge.ts for the other end.
 */
@CapacitorPlugin(
    name = "Diskplot",
    permissions = {@Permission(strings = {Manifest.permission.READ_EXTERNAL_STORAGE}, alias = "storage")},
    requestCodes = {DiskplotPlugin.TRASH_REQUEST}
)
public class DiskplotPlugin extends Plugin {
    static final int TRASH_REQUEST = 7101;
    private Scanner scanner = null;
    private int scans = 0;
    private Duplicates duplicates = null;

    @Override
    public void load() {
        // The back button belongs to the interface: out of a folder first, the app last.
        getActivity().runOnUiThread(() -> getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                notifyListeners("back", new JSObject());
            }
        }));
    }

    /** Paints the space behind the status and navigation bars with the theme's paper. */
    @PluginMethod
    public void setBars(PluginCall call) {
        String color = call.getString("color", "#ffffff");
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                w.getDecorView().setBackgroundColor(Color.parseColor(color));
                WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
                c.setAppearanceLightStatusBars(!dark);
                c.setAppearanceLightNavigationBars(!dark);
            } catch (IllegalArgumentException ignored) {
                // A colour Android does not read; leave the bars as they are.
            }
            call.resolve();
        });
    }

    // Access --------------------------------------------------------------

    private boolean granted() {
        // From Android 11 on, reading the whole shared storage takes "All files access".
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return Environment.isExternalStorageManager();
        return getPermissionState("storage") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void access(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // A settings screen of its own; the interface checks again when the app comes back.
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(i);
            } catch (Exception e) {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
            }
            call.resolve();
        } else {
            requestPermissionForAlias("storage", call, "storageAnswered");
        }
    }

    @PermissionCallback
    private void storageAnswered(PluginCall call) {
        call.resolve();
        notifyListeners("resume", new JSObject());
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        notifyListeners("resume", new JSObject());
    }

    // Volumes and folders -------------------------------------------------

    private static File directoryOf(StorageVolume v) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return v.getDirectory();
        try {
            // Before Android 11 the path is only reachable through a hidden method.
            return (File) StorageVolume.class.getMethod("getPathFile").invoke(v);
        } catch (Exception e) {
            return null;
        }
    }

    @PluginMethod
    public void volumes(PluginCall call) {
        JSArray list = new JSArray();
        StorageManager sm = getContext().getSystemService(StorageManager.class);
        if (sm != null) {
            for (StorageVolume v : sm.getStorageVolumes()) {
                File dir = directoryOf(v);
                if (dir == null || !Environment.MEDIA_MOUNTED.equals(v.getState())) continue;
                try {
                    StatFs st = new StatFs(dir.getPath());
                    JSObject o = new JSObject();
                    o.put("path", dir.getPath());
                    o.put("label", v.getDescription(getContext()));
                    o.put("total", (double) st.getTotalBytes());
                    o.put("free", (double) st.getAvailableBytes());
                    list.put(o);
                } catch (IllegalArgumentException ignored) {
                    // A volume that disappeared between listing and measuring.
                }
            }
        }
        JSObject r = new JSObject();
        r.put("volumes", list);
        call.resolve(r);
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        startActivityForResult(call, new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && data != null && data.getData() != null) {
            String path = treeToPath(data.getData());
            if (path != null) r.put("path", path);
        }
        call.resolve(r);
    }

    /** "primary:Download/x" is /storage/emulated/0/Download/x; "1234-ABCD:x" is /storage/1234-ABCD/x. */
    private static String treeToPath(Uri tree) {
        try {
            String id = DocumentsContract.getTreeDocumentId(tree);
            int colon = id.indexOf(':');
            if (colon < 0) return null;
            String volume = id.substring(0, colon);
            String rest = id.substring(colon + 1);
            String base = "primary".equalsIgnoreCase(volume) ? Environment.getExternalStorageDirectory().getPath() : "/storage/" + volume;
            return rest.isEmpty() ? base : base + "/" + rest;
        } catch (Exception e) {
            return null;
        }
    }

    // Scans ---------------------------------------------------------------

    @PluginMethod
    public void startScan(PluginCall call) {
        String root = call.getString("root", "");
        JSObject r = new JSObject();
        File dir = new File(root);
        if (!dir.isDirectory()) {
            r.put("ok", false);
            r.put("error", "ENOENT");
            call.resolve(r);
            return;
        }
        if (scanner != null) scanner.cancel();
        final int id = ++scans;
        String path = root.length() > 1 && root.endsWith("/") ? root.substring(0, root.length() - 1) : root;
        scanner = new Scanner(id, path, getContext().getCacheDir(), new Scanner.Sink() {
            @Override
            public void progress(JSObject progress) {
                notifyListeners("progress", progress);
            }

            @Override
            public void partial(String file) {
                JSObject o = new JSObject();
                o.put("file", file);
                o.put("scan", id);
                notifyListeners("partial", o);
            }

            @Override
            public void done(String file) {
                JSObject o = new JSObject();
                o.put("file", file);
                o.put("scan", id);
                notifyListeners("done", o);
            }

            @Override
            public void error(String message) {
                JSObject o = new JSObject();
                o.put("error", message);
                o.put("scan", id);
                notifyListeners("error", o);
            }
        });
        scanner.start();
        r.put("ok", true);
        r.put("root", path);
        r.put("scan", id);
        call.resolve(r);
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        if (scanner != null) scanner.stop();
        call.resolve();
    }

    @PluginMethod
    public void cancelScan(PluginCall call) {
        if (scanner != null) scanner.cancel();
        scanner = null;
        call.resolve();
    }

    // Duplicates ----------------------------------------------------------

    @PluginMethod
    public void startDuplicates(PluginCall call) {
        if (duplicates != null) duplicates.cancel();
        Duplicates job = new Duplicates(call.getArray("candidates", new JSArray()), new Duplicates.Sink() {
            @Override
            public void progress(JSObject progress) {
                notifyListeners("dupProgress", progress);
            }

            @Override
            public void done(JSArray groups) {
                JSObject o = new JSObject();
                o.put("groups", groups);
                notifyListeners("dupDone", o);
            }
        });
        duplicates = job;
        new Thread(job, "diskplot-duplicates").start();
        call.resolve();
    }

    @PluginMethod
    public void cancelDuplicates(PluginCall call) {
        if (duplicates != null) duplicates.cancel();
        duplicates = null;
        call.resolve();
    }

    // Apps ----------------------------------------------------------------

    @PluginMethod
    public void usageAccess(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", Apps.usageGranted(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void requestUsageAccess(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        // Recent Android versions open the app's own switch when given the package.
        i.setData(Uri.parse("package:" + getContext().getPackageName()));
        try {
            getActivity().startActivity(i);
        } catch (Exception e) {
            getActivity().startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        }
        call.resolve();
    }

    @PluginMethod
    public void apps(PluginCall call) {
        JSObject r = new JSObject();
        boolean granted = Apps.usageGranted(getContext());
        r.put("granted", granted);
        r.put("apps", granted ? Apps.list(getContext()) : new JSArray());
        call.resolve(r);
    }

    @PluginMethod
    public void uninstall(PluginCall call) {
        // Android asks the user itself; nothing is removed from here.
        Intent i = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + call.getString("pkg", "")));
        getActivity().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void appInfo(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + call.getString("pkg", "")));
        getActivity().startActivity(i);
        call.resolve();
    }

    /** Android's own dialog that clears the cache of every app (Android 11 and later). */
    @PluginMethod
    public void clearAppCaches(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            JSObject r = new JSObject();
            r.put("done", false);
            call.resolve(r);
            return;
        }
        startActivityForResult(call, new Intent(StorageManager.ACTION_CLEAR_APP_CACHE), "cachesCleared");
    }

    @ActivityCallback
    private void cachesCleared(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        r.put("done", result.getResultCode() == Activity.RESULT_OK);
        call.resolve(r);
    }

    // Trash ---------------------------------------------------------------

    private PluginCall trashCall = null;
    private JSArray trashDone = null;
    private List<String> trashWaiting = null;

    private static JSObject result(String path, boolean ok, String error) {
        JSObject o = new JSObject();
        o.put("path", path);
        o.put("ok", ok);
        if (error != null) o.put("error", error);
        return o;
    }

    @PluginMethod
    public void trash(PluginCall call) {
        JSArray paths = call.getArray("paths", new JSArray());
        JSArray out = new JSArray();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            // No system trash before Android 11.
            for (int k = 0; k < paths.length(); k++) out.put(result(paths.optString(k), false, "ENOTRASH"));
            JSObject r = new JSObject();
            r.put("results", out);
            call.resolve(r);
            return;
        }
        ContentResolver cr = getContext().getContentResolver();
        List<Uri> confirm = new ArrayList<>();
        List<String> waiting = new ArrayList<>();
        for (int k = 0; k < paths.length(); k++) {
            String path = paths.optString(k);
            if (new File(path).isDirectory()) {
                out.put(result(path, false, "EISDIR"));
                continue;
            }
            Uri uri = Trash.find(cr, path, false);
            if (uri == null) {
                Trash.scan(getContext(), path);
                uri = Trash.find(cr, path, false);
            }
            if (uri == null) out.put(result(path, false, "ENOMEDIA"));
            else if (Trash.mark(cr, uri)) out.put(result(path, true, null));
            else {
                confirm.add(uri);
                waiting.add(path);
            }
        }
        if (confirm.isEmpty()) {
            JSObject r = new JSObject();
            r.put("results", out);
            call.resolve(r);
            return;
        }
        // Android wants the user to confirm: it shows its own dialog.
        try {
            PendingIntent pi = MediaStore.createTrashRequest(cr, confirm, true);
            trashCall = call;
            trashDone = out;
            trashWaiting = waiting;
            getActivity().startIntentSenderForResult(pi.getIntentSender(), TRASH_REQUEST, null, 0, 0, 0);
        } catch (IntentSender.SendIntentException | RuntimeException e) {
            for (String path : waiting) out.put(result(path, false, "EDENIED"));
            JSObject r = new JSObject();
            r.put("results", out);
            call.resolve(r);
        }
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != TRASH_REQUEST || trashCall == null) return;
        for (String path : trashWaiting) out(trashDone, path, resultCode == Activity.RESULT_OK);
        JSObject r = new JSObject();
        r.put("results", trashDone);
        PluginCall call = trashCall;
        trashCall = null;
        trashDone = null;
        trashWaiting = null;
        call.resolve(r);
    }

    private static void out(JSArray list, String path, boolean ok) {
        list.put(result(path, ok, ok ? null : "EDENIED"));
    }

    @PluginMethod
    public void erase(PluginCall call) {
        JSArray paths = call.getArray("paths", new JSArray());
        JSArray out = new JSArray();
        for (int k = 0; k < paths.length(); k++) {
            String path = paths.optString(k);
            boolean ok = Trash.erase(getContext(), path);
            out.put(result(path, ok, ok ? null : "EPERM"));
        }
        JSObject r = new JSObject();
        r.put("results", out);
        call.resolve(r);
    }

    // Items ---------------------------------------------------------------

    @PluginMethod
    public void stat(PluginCall call) {
        String path = call.getString("path", "");
        JSObject r = new JSObject();
        try {
            StructStat st = Os.lstat(path);
            long created = st.st_mtime;
            long accessed = st.st_atime;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                BasicFileAttributes a = Files.readAttributes(Paths.get(path), BasicFileAttributes.class);
                created = a.creationTime().toMillis() / 1000;
                accessed = a.lastAccessTime().toMillis() / 1000;
            }
            r.put("ok", true);
            r.put("created", created);
            r.put("modified", st.st_mtime);
            r.put("accessed", accessed);
            r.put("readOnly", !new File(path).canWrite());
        } catch (Exception e) {
            r.put("ok", false);
            r.put("error", String.valueOf(e.getMessage()));
        }
        call.resolve(r);
    }

    @PluginMethod
    public void copyText(PluginCall call) {
        ClipboardManager cm = getContext().getSystemService(ClipboardManager.class);
        if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Diskplot", call.getString("text", "")));
        call.resolve();
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        if (url.startsWith("https://")) {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("version", p.versionName);
        } catch (Exception e) {
            r.put("version", "");
        }
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        getActivity().finish();
    }
}
