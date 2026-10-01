// Fast end-to-end check of the core PDF logic (pdf-lib + A4 layout).
// Run: node scripts/verify-pdf.mjs
import { PDFDocument } from "pdf-lib";
import zlib from "node:zlib";

const A4_P = { width: 595.28, height: 841.89 };
const A4_L = { width: 841.89, height: 595.28 };
const MARGIN = 36;

// --- minimal PNG encoder (solid color, no deps) ---
function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makePng(w, h, rgb = [200, 30, 30]) {
  const row = Buffer.alloc(1 + w * 3);
  row[0] = 0;
  for (let x = 0; x < w; x++) { row[1 + x * 3] = rgb[0]; row[1 + x * 3 + 1] = rgb[1]; row[1 + x * 3 + 2] = rgb[2]; }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Tiny 1x1 JPEG (baseline) — verifies embedJpg path.
const JPG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3RlZGpnaGlqc3RlZGpnaGlqc3RlZmr/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMAAAERAAEAPwD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEQAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAhEDEQA/AH//2Q==",
  "base64",
);

async function buildPdf(items) {
  // items: [{bytes: Buffer, kind: 'jpg'|'png'}] — mirrors src/utils/imagesToPdf.ts layout
  // NOTE: pdf-lib reads imageData.buffer directly, so pass a clean Uint8Array
  // (a Node Buffer's .buffer is a shared pool). The app is unaffected: it
  // builds `new Uint8Array(arrayBuffer)` which owns its buffer.
  const pdf = await PDFDocument.create();
  for (const it of items) {
    const bytes = Uint8Array.from(it.bytes);
    const img = it.kind === "jpg" ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    const landscape = img.width >= img.height;
    const pw = landscape ? A4_L.width : A4_P.width;
    const ph = landscape ? A4_L.height : A4_P.height;
    const s = Math.min((pw - MARGIN * 2) / img.width, (ph - MARGIN * 2) / img.height);
    const page = pdf.addPage([pw, ph]);
    page.drawImage(img, { x: (pw - img.width * s) / 2, y: (ph - img.height * s) / 2, width: img.width * s, height: img.height * s });
  }
  return pdf.save();
}

const results = [];
function check(name, cond, extra = "") {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra && !cond ? " — " + extra : ""}`);
  if (!cond) process.exitCode = 1;
}

// 1. One portrait PNG -> one portrait A4 page
{
  const bytes = await buildPdf([{ bytes: makePng(100, 200), kind: "png" }]);
  const pdf = await PDFDocument.load(bytes);
  const p = pdf.getPage(0).getSize();
  check("1 PNG portrait -> 1 page", pdf.getPageCount() === 1);
  check("portrait gets A4 portrait", Math.abs(p.width - 595.28) < 0.01 && Math.abs(p.height - 841.89) < 0.01, JSON.stringify(p));
  check("PDF header valid", Buffer.from(bytes).subarray(0, 4).toString() === "%PDF");
}
// 2. One JPG -> one page
{
  const bytes = await buildPdf([{ bytes: JPG_1X1, kind: "jpg" }]);
  const pdf = await PDFDocument.load(bytes);
  check("1 JPG -> 1 page", pdf.getPageCount() === 1);
}
// 3. Mixed order: portrait then landscape
{
  const bytes = await buildPdf([
    { bytes: makePng(100, 200, [30, 120, 200]), kind: "png" },
    { bytes: makePng(200, 100, [30, 180, 60]), kind: "png" },
  ]);
  const pdf = await PDFDocument.load(bytes);
  const s0 = pdf.getPage(0).getSize(), s1 = pdf.getPage(1).getSize();
  check("2 images -> 2 pages", pdf.getPageCount() === 2);
  check("page 1 portrait, page 2 landscape", s0.height > s0.width && s1.width > s1.height, JSON.stringify([s0, s1]));
}
// 4. Reorder swaps pages
{
  const a = { bytes: makePng(100, 200, [30, 120, 200]), kind: "png" };
  const b = { bytes: makePng(200, 100, [30, 180, 60]), kind: "png" };
  const fwd = await PDFDocument.load(await buildPdf([a, b]));
  const rev = await PDFDocument.load(await buildPdf([b, a]));
  const f0 = fwd.getPage(0).getSize(), r0 = rev.getPage(0).getSize();
  check("reorder reflected in PDF", f0.height > f0.width && r0.width > r0.height);
}
// 5. Large image fits (no distortion: scale uses min ratio)
{
  const bytes = await buildPdf([{ bytes: makePng(2000, 1000), kind: "png" }]);
  const pdf = await PDFDocument.load(bytes);
  check("large landscape -> 1 landscape page", pdf.getPageCount() === 1 && pdf.getPage(0).getSize().width > pdf.getPage(0).getSize().height);
}
// 6. Corrupt bytes rejected
{
  let threw = false;
  try { await buildPdf([{ bytes: Buffer.from("not-an-image"), kind: "png" }]); } catch { threw = true; }
  check("corrupt file throws (surfaced as error message in UI)", threw);
}

console.log(results.join("\n"));
console.log(process.exitCode ? "VERIFY FAILED" : "ALL CHECKS PASSED");
