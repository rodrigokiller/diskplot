package com.diskplot.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.RandomAccessFile;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Finds identical files among candidates that already share a length, the
 * same way the desktop does: the first and last bytes first, the whole file
 * only for the ones that still match.
 */
final class Duplicates implements Runnable {
    interface Sink {
        void progress(JSObject progress);

        void done(JSArray groups);
    }

    private static final int EDGE = 16 * 1024;
    private static final int CHUNK = 1024 * 1024;

    private final JSONArray candidates;
    private final Sink sink;
    private volatile boolean cancelled = false;
    private final byte[] buffer = new byte[CHUNK];
    private long lastReport = 0;

    Duplicates(JSONArray candidates, Sink sink) {
        this.candidates = candidates;
        this.sink = sink;
    }

    void cancel() {
        cancelled = true;
    }

    private static final class Group {
        final double size;
        final List<Integer> ids = new ArrayList<>();
        final List<String> paths = new ArrayList<>();

        Group(double size) {
            this.size = size;
        }
    }

    private void report(long done, long total, double bytes, double totalBytes) {
        long now = System.currentTimeMillis();
        if (now - lastReport < 150) return;
        lastReport = now;
        JSObject p = new JSObject();
        p.put("done", done);
        p.put("total", total);
        p.put("bytes", bytes);
        p.put("totalBytes", totalBytes);
        sink.progress(p);
    }

    private String edgeHash(String path, double size) {
        try (RandomAccessFile f = new RandomAccessFile(path, "r")) {
            MessageDigest h = MessageDigest.getInstance("SHA-1");
            int head = f.read(buffer, 0, (int) Math.min(EDGE, size));
            if (head > 0) h.update(buffer, 0, head);
            if (size > EDGE) {
                f.seek((long) Math.max(EDGE, size - EDGE));
                int tail = f.read(buffer, 0, (int) Math.min(EDGE, size - EDGE));
                if (tail > 0) h.update(buffer, 0, tail);
            }
            return hex(h.digest());
        } catch (Exception e) {
            return null;
        }
    }

    private interface Bytes {
        void add(long n);
    }

    private String fullHash(String path, Bytes onBytes) {
        try (RandomAccessFile f = new RandomAccessFile(path, "r")) {
            MessageDigest h = MessageDigest.getInstance("SHA-1");
            int got;
            while ((got = f.read(buffer)) > 0) {
                if (cancelled) return null;
                h.update(buffer, 0, got);
                onBytes.add(got);
            }
            return hex(h.digest());
        } catch (Exception e) {
            return null;
        }
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder(b.length * 2);
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    private interface Key {
        String of(String path);
    }

    private static List<Group> split(Group g, Key key) {
        Map<String, Group> by = new HashMap<>();
        for (int i = 0; i < g.ids.size(); i++) {
            String k = key.of(g.paths.get(i));
            if (k == null) continue;
            Group x = by.get(k);
            if (x == null) by.put(k, x = new Group(g.size));
            x.ids.add(g.ids.get(i));
            x.paths.add(g.paths.get(i));
        }
        List<Group> out = new ArrayList<>();
        for (Group x : by.values()) if (x.ids.size() > 1) out.add(x);
        return out;
    }

    @Override
    public void run() {
        try {
            List<Group> all = new ArrayList<>();
            long total = 0;
            for (int i = 0; i < candidates.length(); i++) {
                JSONObject c = candidates.getJSONObject(i);
                Group g = new Group(c.getDouble("size"));
                JSONArray ids = c.getJSONArray("ids");
                JSONArray paths = c.getJSONArray("paths");
                for (int k = 0; k < ids.length(); k++) {
                    g.ids.add(ids.getInt(k));
                    g.paths.add(paths.getString(k));
                }
                total += g.ids.size();
                all.add(g);
            }

            // Pass 1: head and tail.
            final long[] done = {0};
            final long totalFiles = total;
            List<Group> survivors = new ArrayList<>();
            for (Group g : all) {
                if (cancelled) return;
                survivors.addAll(split(g, (p) -> {
                    done[0]++;
                    report(done[0], totalFiles, 0, 0);
                    return edgeHash(p, g.size);
                }));
            }

            // Pass 2: the whole file, where head and tail matched and there is more to read.
            double totalBytes = 0;
            for (Group s : survivors) if (s.size > EDGE * 2) totalBytes += s.size * s.ids.size();
            final double[] bytes = {0};
            final double allBytes = totalBytes;
            List<Group> out = new ArrayList<>();
            for (Group s : survivors) {
                if (cancelled) return;
                if (s.size <= EDGE * 2) {
                    out.add(s);
                    continue;
                }
                out.addAll(split(s, (p) -> fullHash(p, (n) -> {
                    bytes[0] += n;
                    report(totalFiles, totalFiles, bytes[0], allBytes);
                })));
            }
            if (cancelled) return;

            out.sort((a, b) -> Double.compare(b.size * (b.ids.size() - 1), a.size * (a.ids.size() - 1)));
            JSArray groups = new JSArray();
            for (Group g : out) {
                JSObject o = new JSObject();
                o.put("size", g.size);
                JSArray ids = new JSArray();
                for (int id : g.ids) ids.put(id);
                o.put("ids", ids);
                groups.put(o);
            }
            sink.done(groups);
        } catch (JSONException e) {
            sink.done(new JSArray());
        }
    }
}
