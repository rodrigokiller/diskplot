// Renders build/icon.svg into build/icon.png and build/icon.ico, plus the
// site's favicon and social card mark. Run with: npm run icons
const { app, BrowserWindow } = require("electron");
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..");
const svg = readFileSync(join(root, "build/icon.svg"), "utf8");
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const LARGE = 1024; // macOS and Linux want a big PNG

let win;

// Draws the SVG on a canvas of the exact size and reads the pixels back.
async function render(size) {
  const url = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  const data = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = ${size};
      c.getContext("2d").drawImage(img, 0, 0, ${size}, ${size});
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("svg did not load"));
    img.src = "${url}";
  })`);
  return Buffer.from(data.split(",")[1], "base64");
}

// An .ico file may hold PNG images directly.
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size === 256 ? 0 : size, at);
    header.writeUInt8(size === 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
  win = new BrowserWindow({ show: false });
  await win.loadURL("about:blank");
  const images = [];
  for (const size of SIZES) images.push({ size, png: await render(size) });
  writeFileSync(join(root, "build/icon.png"), await render(LARGE));
  writeFileSync(join(root, "build/icon.ico"), ico(images));
  mkdirSync(join(root, "site"), { recursive: true });
  writeFileSync(join(root, "site/favicon.ico"), ico(images.filter((i) => i.size <= 48)));
  writeFileSync(join(root, "site/icon-256.png"), images[images.length - 1].png);
  writeFileSync(join(root, "site/icon.svg"), svg);
  console.log("icons written");
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
  app.quit();
});
