package com.diskplot.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;

import java.io.File;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Android's own trash: a trashed file stays hidden for 30 days, can be restored
 * from apps like Files by Google, and is then deleted by the system. Only files
 * Android has indexed can go there, so a file it has not seen yet is shown to
 * it first.
 */
final class Trash {
    private Trash() {}

    private static Uri files() {
        return MediaStore.Files.getContentUri("external");
    }

    /** The system's entry for a file, or null. Trashed entries count only when asked for. */
    static Uri find(ContentResolver cr, String path, boolean includeTrashed) {
        String[] cols = {MediaStore.MediaColumns._ID};
        Cursor c;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Bundle q = new Bundle();
            q.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, MediaStore.MediaColumns.DATA + "=?");
            q.putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, new String[] {path});
            if (includeTrashed) q.putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, MediaStore.MATCH_INCLUDE);
            c = cr.query(files(), cols, q, null);
        } else {
            c = cr.query(files(), cols, MediaStore.MediaColumns.DATA + "=?", new String[] {path}, null);
        }
        if (c == null) return null;
        try {
            return c.moveToFirst() ? Uri.withAppendedPath(files(), String.valueOf(c.getLong(0))) : null;
        } finally {
            c.close();
        }
    }

    /** Asks the media scanner to look at a file and waits a little for it. */
    static void scan(Context ctx, String path) {
        CountDownLatch done = new CountDownLatch(1);
        MediaScannerConnection.scanFile(ctx, new String[] {path}, null, (p, uri) -> done.countDown());
        try {
            done.await(4, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** Marks an entry as trashed. False when Android wants the user to confirm it instead. */
    static boolean mark(ContentResolver cr, Uri uri) {
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.IS_TRASHED, 1);
        try {
            return cr.update(uri, v, null, null) > 0;
        } catch (SecurityException e) {
            return false;
        }
    }

    /** A folder of its own, not a link to one. */
    private static boolean realDir(File f) {
        try {
            return OsConstants.S_ISDIR(Os.lstat(f.getPath()).st_mode);
        } catch (ErrnoException e) {
            return false;
        }
    }

    /**
     * Deletes a folder and all it holds. Links are removed, never followed. On
     * Android 11 and later the system's index follows file operations by itself.
     */
    private static boolean eraseTree(File dir) {
        boolean ok = true;
        String[] names = dir.list();
        if (names != null) {
            for (String n : names) {
                File c = new File(dir, n);
                boolean gone = realDir(c) ? eraseTree(c) : c.delete() || !c.exists();
                ok = ok && gone;
            }
        }
        boolean self = dir.delete() || !dir.exists();
        return ok && self;
    }

    /** Deletes for good, through the system's index when it knows the file. */
    static boolean erase(Context ctx, String path) {
        ContentResolver cr = ctx.getContentResolver();
        File f = new File(path);
        if (realDir(f)) {
            boolean gone = eraseTree(f);
            MediaScannerConnection.scanFile(ctx, new String[] {path}, null, null);
            return gone;
        }
        try {
            Uri uri = find(cr, path, true);
            if (uri != null && cr.delete(uri, null, null) > 0 && !f.exists()) return true;
        } catch (SecurityException ignored) {
            // Fall through to the file itself, which all files access allows.
        }
        boolean gone = !f.exists() || f.delete();
        // Let the index forget the file too.
        MediaScannerConnection.scanFile(ctx, new String[] {path}, null, null);
        return gone;
    }
}
