/*
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 KixDev
  See LICENSE for details.
*/

import { AUDIOGEARSPACE } from "./notePack.js";

function ascii(u8, off, len) {
  return String.fromCharCode(...u8.slice(off, off + len));
}

export function parseGmsfV1(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let p = 0;

  if (ascii(u8, p, 4) !== "GMSF") throw new Error("Bad magic");
  p += 4;

  const ver = dv.getUint8(p++); 
  if (ver !== 1) throw new Error("Unsupported version: " + ver);

  const audioGearID = dv.getUint8(p++);

  const bpm = dv.getUint16(p, true); p += 2;
  const width = dv.getUint16(p, true); p += 2;
  const height = dv.getUint16(p, true); p += 2;

  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = dv.getUint8(p++);
      if (id === audioGearID) {
        const gearData = u8.slice(p, p + AUDIOGEARSPACE * 2);
        p += AUDIOGEARSPACE * 2;
        const volume = dv.getUint8(p++);
        grid[y][x] = { id, gearData, volume };
      } else {
        grid[y][x] = id;
      }
    }
  }

  if (ascii(u8, p, 4) !== "META") throw new Error("Missing META");
  p += 4;

  const metaLen = dv.getUint8(p++);
  const metadata = new TextDecoder().decode(u8.slice(p, p + metaLen));
  p += metaLen;

  if (ascii(u8, p, 4) !== "FSMG") throw new Error("Missing FSMG");

  return { ver, audioGearID, bpm, width, height, grid, metadata };
}

export function writeGmsfV1(state) {
  const { audioGearID, bpm, width, height, grid } = state;
  const metaBytes = new TextEncoder().encode(state.metadata ?? "");
  if (metaBytes.length > 255) throw new Error("Metadata too long (max 255 bytes)");

  let size = 0;
  size += 4 + 1 + 1;     // GMSF + ver + audioGearID
  size += 2 + 2 + 2;     // bpm + width + height

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y][x];
      const id = (typeof cell === "number") ? cell : cell.id;
      size += 1;
      if (id === audioGearID) size += (AUDIOGEARSPACE * 2) + 1;
    }
  }

  size += 4 + 1 + metaBytes.length; // META + len + bytes
  size += 4;                        // FSMG

  const buf = new ArrayBuffer(size);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let p = 0;

  u8.set([..."GMSF"].map(c => c.charCodeAt(0)), p); p += 4;
  dv.setUint8(p++, 1);
  dv.setUint8(p++, audioGearID);

  dv.setUint16(p, bpm, true); p += 2;
  dv.setUint16(p, width, true); p += 2;
  dv.setUint16(p, height, true); p += 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y][x];
      const id = (typeof cell === "number") ? cell : cell.id;
      dv.setUint8(p++, id);

      if (id === audioGearID) {
        const gd = (typeof cell === "number") ? new Uint8Array(AUDIOGEARSPACE * 2) : cell.gearData;
        if (!gd || gd.length !== AUDIOGEARSPACE * 2) throw new Error(`Bad gearData at ${x},${y}`);
        u8.set(gd, p); p += AUDIOGEARSPACE * 2;
        dv.setUint8(p++, (typeof cell === "number") ? 100 : (cell.volume ?? 100));
      }
    }
  }

  u8.set([..."META"].map(c => c.charCodeAt(0)), p); p += 4;
  dv.setUint8(p++, metaBytes.length);
  u8.set(metaBytes, p); p += metaBytes.length;

  u8.set([..."FSMG"].map(c => c.charCodeAt(0)), p); p += 4;

  return new Uint8Array(buf);
}

export function download(bytes, filename = "song.GMSF") {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

