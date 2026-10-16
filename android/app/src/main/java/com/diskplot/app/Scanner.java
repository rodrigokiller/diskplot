package com.diskplot.app;

import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructStat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Walks a folder on all cores and collects every entry in flat columns, the
 * same shape the desktop scanner collects. The interface turns them into a
 * table with the shared code, so both platforms draw the same plan.
 *
 * What has been collected is written to a file in the app's cache: about once
 * a second while the walk runs (a preview), and once at the end.
 */
final class Scanner {
    interface Sink {
        void progress(JSObject progress);

        void partial(String file);

        void done(String file);

        void error(String message);
    }

    // The same flags as src/shared/types.ts.
    static final int F_DIR = 1;
    static final int F_LINK = 2;
    static final int F_ERR = 4;

    private static final int MAX_SAMPLES = 200;
    private static final long PROGRESS_MS = 150;

    private final int id;
    private final String root;
    private final File cache;
    private final Sink sink;
    private final long startedAt = System.currentTimeMillis();

    private final Object lock = new Object();
    private int cap = 1 << 14;
    private int n = 0;
    private int nameEnd = 0;
    private int[] parent = new int[cap];
    private double[] size = new double[cap];
    private double[] logical = new double[cap];
    private int[] mtime = new int[cap];
    private byte[] flags = new byte[cap];
    private int[] nameOff = new int[cap + 1];
    private byte[] names = new byte[1 << 16];

    private static final class Dir {
        final int id;
        final String path;
        final int top; // the root's child this folder sits under, or -1 for the root

        Dir(int id, String path, int top) {
            this.id = id;
            this.path = path;
            this.top = top;
        }
    }

    private final ArrayDeque<Dir> queue = new ArrayDeque<>();
    private int active = 0;
    private volatile boolean stopping = false; // finish with what there is
    private volatile boolean cancelled = false; // throw it all away

    private long files = 0;
    private long dirs = 1;
    private double bytes = 0;
    private long errors = 0;
    private String current;
    private final List<String[]> samples = new ArrayList<>();
    private final Map<Integer, Double> topBytes = new HashMap<>();
    private int partials = 0;

    Scanner(int id, String root, File cache, Sink sink) {
        this.id = id;
        this.root = root;
        this.cache = cache;
        this.sink = sink;
        this.current = root;
    }

    void start() {
        Thread t = new Thread(this::run, "diskplot-scan-" + id);
        t.start();
    }

    void stop() {
        stopping = true;
        synchronized (lock) {
            lock.notifyAll();
        }
    }

    void cancel() {
        cancelled = true;
        synchronized (lock) {
            lock.notifyAll();
        }
    }

    // Coordinator ---------------------------------------------------------

    private void run() {
        try {
            // Old results of earlier scans are no longer needed.
            File[] old = cache.listFiles((d, name) -> name.endsWith(".bin"));
            if (old != null) for (File f : old) f.delete();

            byte[] rootName = root.getBytes(StandardCharsets.UTF_8);
            ensureNames(rootName.length);
            System.arraycopy(rootName, 0, names, 0, rootName.length);
            nameEnd = rootName.length;
            parent[0] = -1;
            flags[0] = F_DIR;
            nameOff[1] = nameEnd;
            n = 1;
            queue.add(new Dir(0, root, -1));

            int count = Math.max(2, Math.min(8, Runtime.getRuntime().availableProcessors()));
            Thread[] workers = new Thread[count];
            for (int i = 0; i < count; i++) {
                workers[i] = new Thread(this::work, "diskplot-walk-" + i);
                workers[i].start();
            }

            long lastPartial = System.currentTimeMillis();
            long partialCost = 0;
            while (alive(workers)) {
                sleep(PROGRESS_MS);
                if (cancelled) continue;
                sink.progress(progress());
                long now = System.currentTimeMillis();
                // A preview may never take more than about a tenth of the scan's time.
                if (!stopping && now - lastPartial > Math.max(900, partialCost * 10)) {
                    String file = write("partial-" + id + "-" + (++partials) + ".bin");
                    new File(cache, "partial-" + id + "-" + (partials - 2) + ".bin").delete();
                    lastPartial = System.currentTimeMillis();
                    partialCost = lastPartial - now;
                    sink.partial(file);
                }
            }
            if (cancelled) return;
            sink.progress(progress());
            sink.done(write("scan-" + id + ".bin"));
        } catch (Throwable e) {
            if (!cancelled) sink.error(String.valueOf(e.getMessage() != null ? e.getMessage() : e));
        }
    }

    private static boolean alive(Thread[] threads) {
        for (Thread t : threads) if (t.isAlive()) return true;
        return false;
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    // Workers -------------------------------------------------------------

    /** Entries of one folder, gathered outside the lock. */
    private static final class Batch {
        final List<byte[]> names = new ArrayList<>();
        final List<String> text = new ArrayList<>();
        double[] size = new double[64];
        double[] logical = new double[64];
        int[] mtime = new int[64];
        byte[] flags = new byte[64];
        int count = 0;

        void add(String name, int flag, double onDisk, double length, int time) {
            if (count == flags.length) {
                int c = count * 2;
                size = java.util.Arrays.copyOf(size, c);
                logical = java.util.Arrays.copyOf(logical, c);
                mtime = java.util.Arrays.copyOf(mtime, c);
                flags = java.util.Arrays.copyOf(flags, c);
            }
            names.add(name.getBytes(StandardCharsets.UTF_8));
            text.add(name);
            size[count] = onDisk;
            logical[count] = length;
            mtime[count] = time;
            flags[count] = (byte) flag;
            count++;
        }
    }

    private void work() {
        while (true) {
            Dir d;
            synchronized (lock) {
                while (true) {
                    // Once asked to stop, folders not yet listed are not followed.
                    if (stopping || cancelled) queue.clear();
                    if (!queue.isEmpty()) break;
                    if (active == 0) {
                        lock.notifyAll();
                        return;
                    }
                    try {
                        lock.wait();
                    } catch (InterruptedException e) {
                        return;
                    }
                }
                d = queue.pollLast(); // depth first keeps the queue short
                active++;
            }

            File dir = new File(d.path);
            String[] list = dir.list();
            Batch b = new Batch();
            String failure = null;
            if (list == null) {
                failure = dir.exists() ? "EPERM" : "ENOENT";
            } else {
                String base = d.path.endsWith("/") ? d.path : d.path + "/";
                for (String name : list) {
                    try {
                        StructStat st = Os.lstat(base + name);
                        if (OsConstants.S_ISLNK(st.st_mode)) {
                            b.add(name, F_LINK, 0, 0, 0);
                        } else if (OsConstants.S_ISDIR(st.st_mode)) {
                            b.add(name, F_DIR, 0, 0, 0);
                        } else {
                            b.add(name, 0, st.st_blocks * 512.0, st.st_size, (int) Math.max(0, st.st_mtime));
                        }
                    } catch (ErrnoException e) {
                        b.add(name, F_ERR, 0, 0, 0);
                    }
                }
            }

            synchronized (lock) {
                append(d, b, failure);
                active--;
                lock.notifyAll();
            }
        }
    }

    // Called with the lock held.
    private void append(Dir d, Batch b, String failure) {
        if (failure != null) {
            flags[d.id] |= F_ERR;
            issue(d.path, failure);
            return;
        }
        if (b.count > 0) current = d.path;
        ensure(n + b.count);
        double direct = 0;
        int directTop = -1;
        String base = d.path.endsWith("/") ? d.path : d.path + "/";
        for (int k = 0; k < b.count; k++) {
            int i = n++;
            byte[] nm = b.names.get(k);
            ensureNames(nameEnd + nm.length);
            System.arraycopy(nm, 0, names, nameEnd, nm.length);
            nameEnd += nm.length;
            nameOff[i + 1] = nameEnd;
            parent[i] = d.id;
            size[i] = b.size[k];
            logical[i] = b.logical[k];
            mtime[i] = b.mtime[k];
            flags[i] = b.flags[k];

            int top = d.top == -1 ? i : d.top;
            int flag = b.flags[k];
            if ((flag & F_DIR) != 0) {
                dirs++;
                queue.add(new Dir(i, base + b.text.get(k), top));
                if (!topBytes.containsKey(top)) topBytes.put(top, 0.0);
            } else {
                files++;
                if ((flag & F_ERR) != 0) {
                    issue(base + b.text.get(k), "ESTAT");
                } else if ((flag & F_LINK) == 0) {
                    bytes += b.size[k];
                    if (d.top == -1) topBytes.put(i, b.size[k]);
                    else {
                        direct += b.size[k];
                        directTop = top;
                    }
                }
            }
        }
        if (directTop != -1) topBytes.put(directTop, topBytes.getOrDefault(directTop, 0.0) + direct);
    }

    private void issue(String path, String code) {
        errors++;
        if (samples.size() < MAX_SAMPLES) samples.add(new String[] {path, code});
    }

    private void ensure(int min) {
        if (min <= cap) return;
        while (cap < min) cap *= 2;
        parent = java.util.Arrays.copyOf(parent, cap);
        size = java.util.Arrays.copyOf(size, cap);
        logical = java.util.Arrays.copyOf(logical, cap);
        mtime = java.util.Arrays.copyOf(mtime, cap);
        flags = java.util.Arrays.copyOf(flags, cap);
        nameOff = java.util.Arrays.copyOf(nameOff, cap + 1);
    }

    private void ensureNames(int min) {
        if (min <= names.length) return;
        int c = names.length;
        while (c < min) c *= 2;
        names = java.util.Arrays.copyOf(names, c);
    }

    // Reports -------------------------------------------------------------

    private JSObject progress() {
        JSObject p = new JSObject();
        synchronized (lock) {
            List<Map.Entry<Integer, Double>> top = new ArrayList<>(topBytes.entrySet());
            top.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));
            JSArray list = new JSArray();
            for (int k = 0; k < Math.min(14, top.size()); k++) {
                int i = top.get(k).getKey();
                JSObject row = new JSObject();
                row.put("name", new String(names, nameOff[i], nameOff[i + 1] - nameOff[i], StandardCharsets.UTF_8));
                row.put("bytes", top.get(k).getValue());
                row.put("dir", (flags[i] & F_DIR) != 0);
                list.put(row);
            }
            p.put("files", files);
            p.put("dirs", dirs);
            p.put("bytes", bytes);
            p.put("errors", errors);
            p.put("current", current);
            p.put("top", list);
        }
        p.put("elapsedMs", System.currentTimeMillis() - startedAt);
        p.put("scan", id);
        return p;
    }

    /**
     * Writes what has been collected so far. Layout, little endian: a 4 byte
     * header length, the JSON header, padding to 8 bytes, then the columns
     * size, logical, parent, mtime, nameOff, flags, names.
     */
    private String write(String name) throws IOException {
        int count;
        int nameBytes;
        int[] p;
        double[] s;
        double[] l;
        int[] m;
        byte[] f;
        int[] no;
        byte[] nm;
        JSONObject head = new JSONObject();
        // Arrays only ever grow into new copies, so what is below `count`
        // stays put once the lock is released.
        synchronized (lock) {
            count = n;
            nameBytes = nameEnd;
            p = parent;
            s = size;
            l = logical;
            m = mtime;
            f = flags;
            no = nameOff;
            nm = names;
            try {
                head.put("root", root);
                head.put("n", count);
                head.put("nameBytes", nameBytes);
                head.put("startedAt", startedAt);
                head.put("durationMs", System.currentTimeMillis() - startedAt);
                head.put("dirs", dirs);
                head.put("errors", errors);
                head.put("incomplete", stopping);
                JSONArray list = new JSONArray();
                for (String[] sample : samples) {
                    JSONObject o = new JSONObject();
                    o.put("path", sample[0]);
                    o.put("code", sample[1]);
                    list.put(o);
                }
                head.put("errorSamples", list);
            } catch (org.json.JSONException e) {
                throw new IOException(e);
            }
        }

        File out = new File(cache, name);
        try (FileOutputStream fos = new FileOutputStream(out); FileChannel ch = fos.getChannel()) {
            byte[] h = head.toString().getBytes(StandardCharsets.UTF_8);
            ByteBuffer len = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(h.length);
            len.flip();
            ch.write(len);
            ch.write(ByteBuffer.wrap(h));
            int pad = (8 - ((4 + h.length) % 8)) % 8;
            if (pad > 0) ch.write(ByteBuffer.allocate(pad));

            ByteBuffer d = ByteBuffer.allocate(count * 8).order(ByteOrder.LITTLE_ENDIAN);
            d.asDoubleBuffer().put(s, 0, count);
            ch.write(d);
            d.clear();
            d.asDoubleBuffer().put(l, 0, count);
            ch.write(d);

            ByteBuffer i4 = ByteBuffer.allocate((count + 1) * 4).order(ByteOrder.LITTLE_ENDIAN);
            i4.asIntBuffer().put(p, 0, count);
            i4.limit(count * 4);
            ch.write(i4);
            i4.clear();
            i4.asIntBuffer().put(m, 0, count);
            i4.limit(count * 4);
            ch.write(i4);
            i4.clear();
            i4.asIntBuffer().put(no, 0, count + 1);
            ch.write(i4);

            ch.write(ByteBuffer.wrap(f, 0, count));
            ch.write(ByteBuffer.wrap(nm, 0, nameBytes));
        }
        return out.getAbsolutePath();
    }
}
