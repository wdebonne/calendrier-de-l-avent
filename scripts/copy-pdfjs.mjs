// Copies the PDF.js browser files to public/pdfjs (run before `dev` and `build`).
// They are served by the app itself: no CDN, and the library and its worker always match.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "node_modules", "pdfjs-dist");
const dest = path.join(root, "public", "pdfjs");

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
// The legacy build also supports older phones and tablets.
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
  fs.copyFileSync(path.join(src, "legacy", "build", file), path.join(dest, file));
}
for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
  fs.cpSync(path.join(src, dir), path.join(dest, dir), { recursive: true });
}
