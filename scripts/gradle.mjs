// Runs the Android project's Gradle wrapper: node scripts/gradle.mjs <task...>
// Works the same from cmd, PowerShell or bash, on Windows or elsewhere.
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const windows = process.platform === "win32";
const cwd = join(import.meta.dirname, "..", "android");
// The full path: some shells do not look in the current folder for programs.
const wrapper = join(cwd, windows ? "gradlew.bat" : "gradlew");
const result = spawnSync(windows ? `"${wrapper}"` : wrapper, process.argv.slice(2), { cwd, stdio: "inherit", shell: windows });
process.exit(result.status ?? 1);
