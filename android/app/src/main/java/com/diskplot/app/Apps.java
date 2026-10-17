package com.diskplot.app;

import android.app.AppOpsManager;
import android.app.usage.StorageStats;
import android.app.usage.StorageStatsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Process;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.ByteArrayOutputStream;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The apps a person can open, with what each takes and when it was last used.
 * Sizes and use need the Usage access permission, which the user grants in the
 * system settings; without it the list is not offered.
 */
final class Apps {
    private Apps() {}

    static boolean usageGranted(Context ctx) {
        AppOpsManager ops = ctx.getSystemService(AppOpsManager.class);
        if (ops == null) return false;
        int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** A small square PNG of the app's icon, as a data URL. */
    private static String icon(Drawable d, int size) {
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        d.setBounds(0, 0, size, size);
        d.draw(c);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, out);
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    static JSArray list(Context ctx) {
        JSArray out = new JSArray();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return out;
        PackageManager pm = ctx.getPackageManager();
        StorageStatsManager stats = ctx.getSystemService(StorageStatsManager.class);
        UsageStatsManager usage = ctx.getSystemService(UsageStatsManager.class);
        long now = System.currentTimeMillis();
        // Android keeps yearly summaries for about two years.
        Map<String, UsageStats> used = usage != null ? usage.queryAndAggregateUsageStats(now - 2L * 365 * 86400000L, now) : null;

        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> found = pm.queryIntentActivities(launcher, 0);
        Set<String> seen = new HashSet<>();
        for (ResolveInfo r : found) {
            String pkg = r.activityInfo.packageName;
            if (pkg.equals(ctx.getPackageName()) || !seen.add(pkg)) continue;
            try {
                ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                JSObject o = new JSObject();
                o.put("pkg", pkg);
                o.put("label", String.valueOf(pm.getApplicationLabel(ai)));
                o.put("icon", icon(pm.getApplicationIcon(ai), 96));
                boolean system = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0;
                o.put("system", system);
                o.put("installed", pm.getPackageInfo(pkg, 0).firstInstallTime);
                UsageStats u = used != null ? used.get(pkg) : null;
                o.put("lastUsed", u != null ? u.getLastTimeUsed() : 0);
                if (stats != null) {
                    StorageStats s = stats.queryStatsForPackage(ai.storageUuid, pkg, Process.myUserHandle());
                    o.put("appBytes", (double) s.getAppBytes());
                    // Android counts the cache inside the data; they are shown apart.
                    o.put("dataBytes", (double) Math.max(0, s.getDataBytes() - s.getCacheBytes()));
                    o.put("cacheBytes", (double) s.getCacheBytes());
                }
                out.put(o);
            } catch (Exception ignored) {
                // An app removed while listing, or one Android will not measure.
            }
        }
        return out;
    }
}
