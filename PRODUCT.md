# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Electron desktop app built with electron-vite, React 18 and strict TypeScript, packaged with electron-builder (NSIS and portable for Windows). Hidden title bar with native overlay controls, a single typed `api` object over contextBridge, `domain:action` IPC channels, heavy work in worker_threads. The scanner is TypeScript; on Windows it lists folders in bulk through the Win32 API using koffi (prebuilt FFI, no compiler needed). The landing page lives in `site/` in the same repository as static HTML and CSS.

## Users

People on Windows whose disk is full or filling up and who want to see where the space went, fast, and act on it. Two overlapping groups: ordinary power users who today reach for SpaceSniffer or WizTree, and developers whose disks fill with node_modules, build caches and virtual machine images. They open the tool occasionally, under mild annoyance, and want an answer in seconds.

## Product Purpose

Diskplot scans a drive or folder and shows what occupies it, as a treemap and as a sortable tree side by side, so the user can find and remove what they do not need. Success: the user understands the largest consumers of a drive within seconds of the scan finishing, and never sees the tool crash or stall.

## Positioning

A modern, open source (MIT) successor to SpaceSniffer and WizTree. It combines the SpaceSniffer treemap with the WizTree tree in one window, and adds things the older tools lack: comparing scans to show what grew, recognising developer clutter and totalling what can be reclaimed, instant search and filters, and duplicate detection. Free for any use, including commercial.

## Operating Context

Windows 10 and 11 desktop. Drives with millions of files. The scan must tolerate access-denied folders, paths longer than 260 characters, junctions and symlinks (never followed twice), files that disappear mid-scan, and removable or network drives. Deletion goes to the Recycle Bin after confirmation. Code is kept portable so macOS and Linux remain possible later, but Windows is the only supported target for now.

## Capabilities and Constraints

Confirmed for the first version:

- Scan of a drive or folder with live progress, cancellable.
- Treemap view, near monochrome, with zoom into folders.
- Tree view with size, percent of parent, file count and modified date, sortable.
- Treemap and tree stay in sync (selection and navigation).
- Compare scans: snapshots saved per root, showing what grew or shrank.
- Developer clutter detection (node_modules, build caches, temp folders) with reclaimable total.
- Instant search and filters (name, extension, minimum size, age), top files, by type.
- Duplicate files by size then hash, opt-in because it costs time.
- Open in Explorer, copy path, send to Recycle Bin.
- Interface in English (default) and Brazilian Portuguese.
- Automatic updates through GitHub Releases.

Constraints: no emojis and no em dashes anywhere in the interface, copy, README or site. Icons are a custom square set unique to the project. Reading the NTFS master file table directly (the WizTree technique) is on the roadmap, not in the first version; it needs administrator rights.

Undecided: domain purchase (diskplot.com and diskplot.app were unregistered on 2026-10-05), code signing certificate, distribution through winget.

## Brand Commitments

Name: Diskplot. Square corners everywhere, no rounded corners, in the spirit of the best sites of around 2010 but with modern execution; the author's Jhourney site is the reference for that taste. Few colours: one hue, or two at most, carried from strong to weak, as SpaceSniffer does. Modern but simple. It must not look machine generated.

## Evidence on Hand

No screenshots, benchmarks, users or testimonials exist yet. Speed claims against other tools must not be made until measured. Screenshots for the site and README come from the real app once it runs.

## Product Principles

1. The answer first: the biggest things on the disk are visible the moment the scan ends.
2. Never crash on a strange disk. Every filesystem error is counted and shown, not thrown.
3. Destructive actions are deliberate, reversible where the system allows, and never automatic.
4. Fast is a feature; the interface stays responsive during a scan of millions of files.
5. One window, no wizard, no account, no telemetry.
