/*
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 KixDev
  See LICENSE for details.
*/

import { NOTE_PACK, AUDIOGEARSPACE } from "./notePack.js";
import { parseGmsfV1, writeGmsfV1, download } from "./gmsf.js";
import { gmsfStateToMidiBytes, downloadMidi } from "./midi.js";
import { midiArrayBufferToGmsfState } from "./midi_import.js";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
}


const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");

const baseLayer = document.createElement("canvas");
const baseCtx = baseLayer.getContext("2d");

let baseDirty = true;  
let _drawRAF = 0;

function markBaseDirty() { baseDirty = true; }

function requestDraw() {
  if (_drawRAF) return;
  _drawRAF = requestAnimationFrame(() => {
    _drawRAF = 0;
    drawFrame();
  });
}

const hud = document.getElementById("hud");
const statusEl = document.getElementById("status");

function injectCredits() {
  const DISCORD_URL = "https://discord.gg/jBHRt2TyER";

  if (document.getElementById("gmsfCreditsBar")) return;

  const bar = document.createElement("div");
  bar.id = "gmsfCreditsBar";
  bar.style.cssText = `
    max-width:1180px;
    margin: 10px auto 18px auto;
    padding: 10px 12px;
    border: 1px solid var(--ui-border, rgba(0,0,0,.08));
    border-radius: 14px;
    background: var(--ui-surface, rgba(255,255,255,.85));
    backdrop-filter: blur(6px);
    display:flex;
    flex-wrap:wrap;
    gap:10px;
    align-items:center;
    justify-content:space-between;
    font-size: 12px;
    color: var(--ui-text-soft, rgba(0,0,0,.70));
  `;

    const GITHUB_REPO_URL = "https://github.com/Kixdev/GrowtopiaMusicSimulatorFinal-Web";
    const LICENSE_URL = `${GITHUB_REPO_URL}/blob/main/LICENSE`;
    
    bar.innerHTML = `
      <div>
        <b>${new Date().getFullYear()} Growtopia Music Simulator</b>
        <span style="opacity:.8"> by <b>MyLegGuy</b> - Web Ver by <b>KIXDEV</b></span>
      </div>
    
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <span style="opacity:.85">Join <b>MusicStore</b> - Growtopia Music Community (Midman & Composer Hub)</span>
    
        <a href="${DISCORD_URL}" target="_blank" rel="noopener noreferrer"
           style="
             text-decoration:none;
             padding:6px 10px;
             border-radius: 12px;
             border:1px solid rgba(37,99,235,.35);
             background: rgba(37,99,235,.10);
             color: rgba(37,99,235,1);
             font-weight:700;
           ">
          Discord MusicStore
        </a>
    
        <a href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer"
           style="
             text-decoration:none;
             padding:6px 10px;
             border-radius: 12px;
             border:1px solid rgba(16,185,129,.35);
             background: rgba(16,185,129,.10);
             color: rgba(16,185,129,1);
             font-weight:800;
           ">
          GitHub (Source)
        </a>
    
        <a href="${LICENSE_URL}" target="_blank" rel="noopener noreferrer"
           style="
             text-decoration:none;
             padding:6px 10px;
             border-radius: 12px;
             border:1px solid rgba(245,158,11,.35);
             background: rgba(245,158,11,.10);
             color: rgba(245,158,11,1);
             font-weight:800;
           ">
          License: GPL-3.0-or-later
        </a>
      </div>
    
      <div style="opacity:.70; font-size:12px; margin-top:6px;">
        Source code: <a href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer"
          style="color:inherit; text-decoration:underline;">${GITHUB_REPO_URL}</a>
      </div>
    `;


  const wrap = document.getElementById("wrap");
  if (wrap && wrap.parentNode) {
    wrap.parentNode.insertBefore(bar, wrap.nextSibling);
  } else {
    document.body.appendChild(bar);
  }
}

function resetSongCanvas() {
  const ok = confirm("Reset canvas? All notes will be deleted.");
  if (!ok) return;

  state.grid = Array.from({ length: state.height }, () => Array(state.width).fill(0));

  repeatUsed = Array.from({ length: state.height }, () => Array(state.width).fill(false));
  refreshMaxX();
  resetPlayState();

  playing = false;
  paused = false;
  clearInterval(timer);
  timer = null;

  setSongXOffset(0);
  playPos = 0;
  currentPlayPosition = 0;

  undoStack.length = 0;
  redoStack.length = 0;

  audioConvertOn = false;
  audioConvertBuf.length = 0;
  audioConvertUpdateUI();

  scheduleAutosave();
  showStatus("Canvas cleared ✅");
  updateTransportUI();
  draw();
  markBaseDirty();
}


const btnPlay = document.getElementById("btnPlay");
const btnPause = document.getElementById("btnPause");
const btnPrevPage = document.getElementById("btnPrevPage");
const btnNextPage = document.getElementById("btnNextPage");
const btnSave = document.getElementById("btnSave");
const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnReset = document.getElementById("btnReset");
const btnZoom = document.getElementById("btnZoom");
let btnTheme = document.getElementById("btnTheme");
let btnAudioConvert = document.getElementById("btnAudioConvert");
let btnUIMode = document.getElementById("btnUIMode");
let btnExportWav = document.getElementById("btnExportWav");

const UI_THEME_KEY = "gmsf_ui_theme_v1";
let uiThemeManual = false;
const _uiMql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function _detectSystemTheme(){
  return (_uiMql && _uiMql.matches) ? "dark" : "light";
}

function loadUiTheme(){
  try {
    const v = localStorage.getItem(UI_THEME_KEY);
    if (v === "dark" || v === "light") { uiThemeManual = true; return v; }
  } catch {}
  uiThemeManual = false;

  return "dark";
}


function applyUiTheme(theme){
  const t = (theme === "dark") ? "dark" : "light";
  document.documentElement.dataset.uiTheme = t;
  updateUiModeButton();
}

function setUiTheme(theme){
  const t = (theme === "dark") ? "dark" : "light";
  uiThemeManual = true;
  try { localStorage.setItem(UI_THEME_KEY, t); } catch {}
  applyUiTheme(t);
}

function toggleUiTheme(){
  const cur = (document.documentElement.dataset.uiTheme === "dark") ? "dark" : "light";
  setUiTheme(cur === "dark" ? "light" : "dark");
}

function updateUiModeButton(){
  if (!btnUIMode) return;
  const dark = document.documentElement.dataset.uiTheme === "dark";
  btnUIMode.textContent = dark ? "☀ Light" : "🌙 Dark";
  btnUIMode.setAttribute("aria-pressed", dark ? "true" : "false");
  btnUIMode.title = dark ? "Switch to Light Mode" : "Switch to Dark Mode";
}

function ensureUiModeButton(){
  if (btnUIMode) return;
  const header = document.querySelector("header");
  if (!header) return;

  const b = document.createElement("button");
  b.id = "btnUIMode";
  b.type = "button";
  b.textContent = "🌙 Dark";
  b.style.cssText = `
    border-radius: 999px;
    padding: 8px 10px;
    border: 1px solid var(--ui-chip-border, rgba(99,102,241,.35));
    background: var(--ui-chip-bg, rgba(99,102,241,.12));
    color: var(--ui-chip-text, rgba(67,56,202,1));
    font-weight: 900;
    cursor: pointer;
    margin-left: auto;
  `;
  header.appendChild(b);
  btnUIMode = b;
}

function initUiTheme(){
  ensureUiModeButton();

  if (btnUIMode){
    btnUIMode.type = "button";
    btnUIMode.onclick = toggleUiTheme;
  }

  applyUiTheme(loadUiTheme());

  if (_uiMql && _uiMql.addEventListener){
    _uiMql.addEventListener("change", (e) => {
      if (uiThemeManual) return;
      applyUiTheme(e.matches ? "dark" : "light");
    });
  }
}

initUiTheme();


let lastProjectBaseName = "";

function rememberProjectName(filename){
  const base = String(filename || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, ""); 

  if (base) lastProjectBaseName = base;
}


let _wavUI = null;

function ensureExportWavOverlay(){
  if (_wavUI) return _wavUI;

  const el = document.createElement("div");
  el.id = "exportWavOverlay";
  el.innerHTML = `
    <div class="box">
      <div class="title">
        <span class="spinner"></span>
        <span id="wavProgTitle">Exporting WAV…</span>
      </div>
      <div class="desc" id="wavProgDesc">Preparing…</div>
      <div class="barWrap"><div class="bar" id="wavProgBar"></div></div>
    </div>
  `;
  document.body.appendChild(el);

  _wavUI = {
    root: el,
    title: el.querySelector("#wavProgTitle"),
    desc: el.querySelector("#wavProgDesc"),
    bar: el.querySelector("#wavProgBar"),
  };
  return _wavUI;
}

function wavProgressShow(title="Exporting WAV…", desc="Preparing…"){
  const ui = ensureExportWavOverlay();
  ui.root.classList.add("show");
  ui.root.classList.remove("indeterminate");
  ui.title.textContent = title;
  ui.desc.textContent = desc;
  ui.bar.style.width = "0%";
}

function wavProgressSet(desc, percent){ 
  const ui = ensureExportWavOverlay();
  ui.desc.textContent = desc;

  if (percent == null){
    ui.root.classList.add("indeterminate");
  } else {
    ui.root.classList.remove("indeterminate");
    ui.bar.style.width = Math.max(0, Math.min(100, percent)) + "%";
  }
}

function wavProgressHide(){
  if (!_wavUI) return;
  _wavUI.root.classList.remove("show");
  _wavUI.root.classList.remove("indeterminate");
}


function ensureExportWavButton(){
  if (btnExportWav) return;
  const header = document.querySelector("header");
  if (!header) return;

  const b = document.createElement("button");
  b.id = "btnExportWav";
  b.type = "button";
  b.textContent = "Export WAV";
  b.title = "Render current song to a .wav file";
  b.style.cssText = `
    border-radius: 12px;
    padding: 8px 10px;
    border: 1px solid rgba(34,197,94,.35);
    background: rgba(34,197,94,.12);
    color: rgba(21,128,61,1);
    font-weight: 900;
    cursor: pointer;
  `;

  const anchor = document.getElementById("btnExport");
  if (anchor && anchor.parentNode === header) anchor.insertAdjacentElement("afterend", b);
  else header.insertBefore(b, header.firstChild);

  btnExportWav = b;
}

ensureExportWavButton();

let btnExportMidi = null;

function ensureExportMidiButton(){
  if (btnExportMidi) return;
  const header = document.querySelector("header");
  if (!header) return;

  const b = document.createElement("button");
  b.id = "btnExportMidi";
  b.type = "button";
  b.textContent = "Export MIDI";
  b.title = "Export current song to a .mid file";
  b.style.cssText = `
    border-radius: 12px;
    padding: 8px 10px;
    border: 1px solid rgba(245,158,11,.35);
    background: rgba(245,158,11,.12);
    color: rgba(180,83,9,1);
    font-weight: 900;
    cursor: pointer;
  `;

  const anchor = document.getElementById("btnExportWav") || document.getElementById("btnExport");
  if (anchor && anchor.parentNode === header) anchor.insertAdjacentElement("afterend", b);
  else header.insertBefore(b, header.firstChild);

  btnExportMidi = b;
}

ensureExportMidiButton();

let btnReplace = null;

function ensureReplaceButton(){
  if (btnReplace) return;
  const header = document.querySelector("header");
  if (!header) return;

  const b = document.createElement("button");
  b.id = "btnReplace";
  b.type = "button";
  b.textContent = "Replace";
  b.title = "Replace one note with another within a page range";
  b.style.cssText = `
    border-radius: 12px;
    padding: 8px 10px;
    border: 1px solid rgba(99,102,241,.35);
    background: rgba(99,102,241,.12);
    color: rgba(67,56,202,1);
    font-weight: 900;
    cursor: pointer;
  `;

  const anchor = document.getElementById("btnExportMidi") || document.getElementById("btnExportWav") || document.getElementById("btnExport");
  if (anchor && anchor.parentNode === header) anchor.insertAdjacentElement("afterend", b);
  else header.appendChild(b);

  b.onclick = (e) => { e.preventDefault(); openReplaceModal(); };
  btnReplace = b;
}

ensureReplaceButton();

let _replaceUI = null;
let _repFromId = 0;
let _repToId = 0;
let _repActive = "from";
let _repScrollY = 0;

function _repTotalPages(){
  const w = Math.max(1, Number(state?.width || 1));
  const pw = Math.max(1, Number(pageWidth || 25));
  return Math.max(1, Math.ceil(w / pw));
}

function _repPageToColStart(page1){
  const pw = Math.max(1, Number(pageWidth || 25));
  return clamp((page1 - 1) * pw, 0, state.width - 1);
}
function _repPageToColEnd(page1){
  const pw = Math.max(1, Number(pageWidth || 25));
  return clamp(page1 * pw - 1, 0, state.width - 1);
}

function _repCountMatches(fromId, pA, pB){
  const total = _repTotalPages();
  const p0 = clamp(Math.min(pA, pB), 1, total);
  const p1 = clamp(Math.max(pA, pB), 1, total);

  const x0 = _repPageToColStart(p0);
  const x1 = _repPageToColEnd(p1);

  let tileHits = 0;
  let gearHits = 0;

  for (let x = x0; x <= x1; x++){
    for (let y = 0; y < state.height; y++){
      const cell = state.grid[y][x];
      const id = cellId(cell);

      if (typeof cell === "number"){
        if (cell === fromId) tileHits++;
        continue;
      }

      if (id === state.audioGearID && typeof cell !== "number"){
        const gd = cell.gearData;
        if (gd){
          for (let i = 0; i < AUDIOGEARSPACE; i++){
            if (gd[i * 2] === fromId) gearHits++;
          }
        }
        if (fromId === state.audioGearID) tileHits++;
        continue;
      }

      if (id === fromId) tileHits++;
    }
  }

  return { tileHits, gearHits, x0, x1, p0, p1, total };
}

function _repReplaceNow(fromId, toId, pA, pB){
  const total = _repTotalPages();
  let p0 = clamp(Math.min(pA, pB), 1, total);
  let p1 = clamp(Math.max(pA, pB), 1, total);

  const x0 = _repPageToColStart(p0);
  const x1 = _repPageToColEnd(p1);

  if (fromId === toId){
    showStatus("Replace: from and to are the same.", 1400);
    return 0;
  }

  const changes = [];

  for (let x = x0; x <= x1; x++){
    for (let y = 0; y < state.height; y++){
      const before = state.grid[y][x];
      let after = before;
      let changed = false;

      if (typeof before === "number"){
        if (before === fromId){
          after = toId;
          changed = true;
        }
      } else {
        const id = cellId(before);

        if (id === state.audioGearID && typeof before !== "number"){
          let any = false;
          const gd0 = before.gearData ? new Uint8Array(before.gearData) : new Uint8Array(AUDIOGEARSPACE * 2);

          for (let i = 0; i < AUDIOGEARSPACE; i++){
            const ix = i * 2;
            if (gd0[ix] === fromId){
              gd0[ix] = toId;
              any = true;
            }
          }

          if (any){
            after = {
              id: before.id,
              volume: before.volume ?? 100,
              gearData: gd0,
            };
            changed = true;
          }

          if (fromId === state.audioGearID){
            after = toId;
            changed = true;
          }
        } else {
          if (id === fromId){
            after = toId;
            changed = true;
          }
        }
      }

      if (changed){
        changes.push({ x, y, before, after });
      }
    }
  }

  if (!changes.length){
    showStatus("No matches in that page range.", 1600);
    return 0;
  }

  pushHistoryMulti(changes);
  for (const c of changes) applyCell(c.x, c.y, c.after);

  refreshMaxX();
  draw();
  scheduleAutosave();
  showStatus(`Replaced ${changes.length} item(s) ✅`, 2000);
  return changes.length;
}

function ensureReplaceModal(){
  if (_replaceUI) return _replaceUI;

  const STYLE_ID = "replaceModalStyle";
  if (!document.getElementById(STYLE_ID)){
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      #repBack{
        position:fixed; inset:0;
        display:none;
        align-items:center;
        justify-content:center;
        padding: 12px;
        background: rgba(0,0,0,.20);
        z-index: 120;
        overscroll-behavior: contain;
      }
      #repBox{
        width: min(440px, 94vw);
        border-radius: 16px;
        border: 1px solid var(--ui-border, rgba(0,0,0,.12));
        background: var(--ui-surface, #fff);
        box-shadow: 0 16px 60px rgba(0,0,0,.25);
        padding: 12px;
        color: var(--ui-text, rgba(0,0,0,.90));
      }
      html[data-ui-theme="dark"] #repBox,
      :root[data-ui-theme="dark"] #repBox,
      [data-ui-theme="dark"] #repBox{
        color: rgba(240,244,255,0.94);
      }
      #repTop{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
      }
      #repTitle{
        font-weight: 950;
        font-size: 13px;
        letter-spacing:.2px;
      }
      #repSub{
        margin-top: 2px;
        opacity: .75;
        font-size: 11px;
        line-height: 1.3;
      }
      .repBtn{
        border-radius: 12px;
        padding: 7px 10px;
        border: 1px solid var(--ui-border-soft, rgba(0,0,0,.14));
        background: var(--ui-surface, #fff);
        cursor: pointer;
        font-weight: 900;
      }
      .repBtn.primary{
        background: var(--ui-primary-bg, #111);
        border-color: var(--ui-primary-border, #111);
        color: var(--ui-primary-text, #fff);
      }
      #repRow{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-top: 10px;
      }
      .repPick{
        flex: 1;
        min-width: 0;
        border: 1px solid var(--ui-border, rgba(0,0,0,.12));
        border-radius: 14px;
        padding: 8px;
        display:flex;
        align-items:center;
        gap:10px;
        cursor:pointer;
        background: var(--ui-card, rgba(255,255,255,.92));
      }
      .repPick.active{
        outline: 2px solid rgba(99,102,241,.45);
        border-color: rgba(99,102,241,.45);
      }
      .repPick img{
        width: 32px;
        height: 32px;
        object-fit: contain;
        image-rendering: pixelated;
      }
      .repPick .lbl{
        font-weight: 950;
        font-size: 11px;
        opacity: .8;
      }
      .repPick .id{
        margin-top: 2px;
        font-family: ui-monospace, Menlo, monospace;
        font-size: 11px;
        opacity: .75;
      }
      #repSwap{
        flex:0 0 auto;
        width: 40px;
        height: 40px;
        border-radius: 14px;
        border: 1px solid var(--ui-border-soft, rgba(0,0,0,.14));
        background: var(--ui-surface, #fff);
        cursor:pointer;
        font-weight: 950;
        display:flex;
        align-items:center;
        justify-content:center;
        user-select:none;
      }
      #repRange{
        margin-top: 10px;
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap:10px;
      }
      .repField{
        border: 1px solid var(--ui-border, rgba(0,0,0,.12));
        border-radius: 14px;
        padding: 8px 10px;
        background: var(--ui-card, rgba(255,255,255,.92));
      }
      .repField .k{
        font-weight: 900;
        font-size: 11px;
        opacity:.75;
      }
      .repField input{
        margin-top: 6px;
        width: 100%;
        font-size: 14px;
        padding: 8px 1px;
        border-radius: 12px;
        border: 1px solid var(--ui-border-soft, rgba(0,0,0,.14));
        background: var(--ui-surface, #fff);
        color: inherit;
        outline: none;
      }
      #repInfo{
        margin-top: 8px;
        font-size: 11px;
        opacity: .78;
        line-height: 1.35;
      }
      #repGrid{
        margin-top: 10px;
        border-top: 1px solid var(--ui-border, rgba(0,0,0,.10));
        padding-top: 10px;
        display:grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 6px;
        max-height: min(42vh, 360px);
        overflow:auto;
        -webkit-overflow-scrolling: touch;
      }
      .repNoteBtn{
        border: 1px solid var(--ui-border-soft, rgba(0,0,0,.14));
        background: var(--ui-surface, #fff);
        border-radius: 12px;
        padding: 4px;
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
      }
      .repNoteBtn.activeSide{
        outline: 2px solid rgba(99,102,241,.45);
        border-color: rgba(99,102,241,.45);
      }
      .repNoteBtn img{
        width: 30px;
        height: 30px;
        object-fit: contain;
        image-rendering: pixelated;
      }
      @media (max-width: 420px){
        #repGrid{ grid-template-columns: repeat(6, 1fr); }
      }
    `;
    document.head.appendChild(st);
  }

  const back = document.createElement("div");
  back.id = "repBack";

  const box = document.createElement("div");
  box.id = "repBox";
  box.innerHTML = `
    <div id="repTop">
      <div>
        <div id="repTitle">Replace Notes</div>
        <div id="repSub">
          Example (25 cols): Page 1 = 1–25, Page 2 = 26–50, etc.
        </div>
      </div>
      <button type="button" class="repBtn" id="repClose">Close</button>
    </div>

    <div id="repRow">
      <div class="repPick" id="repPickFrom" title="Click to select FROM">
        <img id="repImgFrom" alt="" />
        <div>
          <div class="lbl">FROM</div>
          <div class="id" id="repTxtFrom">—</div>
        </div>
      </div>

      <div id="repSwap" title="Swap">⟲</div>

      <div class="repPick" id="repPickTo" title="Click to select TO">
        <img id="repImgTo" alt="" />
        <div>
          <div class="lbl">TO</div>
          <div class="id" id="repTxtTo">—</div>
        </div>
      </div>
    </div>

    <div id="repRange">
      <div class="repField">
        <div class="k">From page</div>
        <input id="repPageA" type="number" min="1" step="1" />
      </div>
      <div class="repField">
        <div class="k">To page</div>
        <input id="repPageB" type="number" min="1" step="1" />
      </div>
    </div>

    <div id="repInfo"></div>

    <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:10px;">
      <button type="button" class="repBtn primary" id="repDo">Replace</button>
      <div style="font-size:11px;opacity:.75;">Includes Audio fills</div>
    </div>

    <div id="repGrid"></div>
  `;

  back.appendChild(box);
  document.body.appendChild(back);

  const ui = {
    back,
    box,
    close: box.querySelector("#repClose"),
    pickFrom: box.querySelector("#repPickFrom"),
    pickTo: box.querySelector("#repPickTo"),
    imgFrom: box.querySelector("#repImgFrom"),
    imgTo: box.querySelector("#repImgTo"),
    txtFrom: box.querySelector("#repTxtFrom"),
    txtTo: box.querySelector("#repTxtTo"),
    swap: box.querySelector("#repSwap"),
    pageA: box.querySelector("#repPageA"),
    pageB: box.querySelector("#repPageB"),
    info: box.querySelector("#repInfo"),
    grid: box.querySelector("#repGrid"),
    doBtn: box.querySelector("#repDo"),
  };

  function setActive(which){
    _repActive = which;
    ui.pickFrom.classList.toggle("active", which === "from");
    ui.pickTo.classList.toggle("active", which === "to");
  }

  function setFrom(id){
    _repFromId = id;
    const img = NOTE_PACK?.notes?.[id]?.image;
    ui.imgFrom.src = img ? assetUrl(img) : "";
    ui.txtFrom.textContent = `id: ${id}`;
    refreshInfo();
  }
  function setTo(id){
    _repToId = id;
    const img = NOTE_PACK?.notes?.[id]?.image;
    ui.imgTo.src = img ? assetUrl(img) : "";
    ui.txtTo.textContent = `id: ${id}`;
    refreshInfo();
  }

  function refreshInfo(){
    const total = _repTotalPages();
    const a = clamp(parseInt(ui.pageA.value || "1", 10) || 1, 1, total);
    const b = clamp(parseInt(ui.pageB.value || String(total), 10) || total, 1, total);

    const res = _repCountMatches(_repFromId, a, b);
    ui.pageA.value = String(a);
    ui.pageB.value = String(b);
    ui.pageA.max = String(total);
    ui.pageB.max = String(total);

    const colA1 = res.x0 + 1;
    const colB1 = res.x1 + 1;

    const hits = res.tileHits + res.gearHits;

    ui.info.textContent =
      `View pages: ${res.p0} → ${res.p1} (total ${res.total}). ` +
      `Columns: ${colA1}–${colB1}. ` +
      `Matches: ${hits} (tiles ${res.tileHits}, gear fills ${res.gearHits}).`;
  }

  function renderGrid(){
    ui.grid.innerHTML = "";
    const ids = NOTE_PACK.uiOrder
      .filter(v => v !== undefined)
      .filter(v => NOTE_PACK.notes[v] !== undefined);

    for (const noteId of ids){
      const b = document.createElement("button");
      b.type = "button";
      b.className = "repNoteBtn";
      b.dataset.id = String(noteId);

      const img = document.createElement("img");
      img.src = assetUrl(NOTE_PACK.notes[noteId].image);
      img.loading = "lazy";
      b.appendChild(img);

      b.onclick = () => {
        const id = Number(noteId);
        if (_repActive === "from") setFrom(id);
        else setTo(id);

        b.classList.add("activeSide");
        setTimeout(() => b.classList.remove("activeSide"), 160);
      };

      ui.grid.appendChild(b);
    }
  }

  function open(){
    _repScrollY = window.scrollY || 0;

    back.style.display = "flex";
    setActive(_repActive);

    const total = _repTotalPages();
    ui.pageA.min = "1"; ui.pageB.min = "1";
    ui.pageA.max = String(total);
    ui.pageB.max = String(total);

    if (!ui.pageA.value) ui.pageA.value = "1";
    if (!ui.pageB.value) ui.pageB.value = String(total);

    if (!_repFromId){
      _repFromId = selectedNote || 1;
      setFrom(_repFromId);
    } else setFrom(_repFromId);

    if (!_repToId){
      _repToId = selectedNote || 1;
      setTo(_repToId);
    } else setTo(_repToId);

    renderGrid();
    refreshInfo();

    requestAnimationFrame(() => window.scrollTo(0, _repScrollY));
  }

  function close(){
    back.style.display = "none";
    requestAnimationFrame(() => window.scrollTo(0, _repScrollY));
  }

  ui.close.onclick = (e) => { e.preventDefault(); close(); };

  back.addEventListener("click", (e) => { if (e.target === back) close(); });

  ui.pickFrom.onclick = () => setActive("from");
  ui.pickTo.onclick = () => setActive("to");

  ui.swap.onclick = () => {
    const a = _repFromId;
    _repFromId = _repToId;
    _repToId = a;
    setFrom(_repFromId);
    setTo(_repToId);
    setActive(_repActive);
  };

  ui.pageA.addEventListener("input", refreshInfo);
  ui.pageB.addEventListener("input", refreshInfo);

  ui.doBtn.onclick = () => {
    const total = _repTotalPages();
    const a = clamp(parseInt(ui.pageA.value || "1", 10) || 1, 1, total);
    const b = clamp(parseInt(ui.pageB.value || String(total), 10) || total, 1, total);
    const count = _repReplaceNow(_repFromId, _repToId, a, b);
    if (count > 0) refreshInfo();
  };

  _replaceUI = { open, close, ui };
  return _replaceUI;
}

function openReplaceModal(){
  const m = ensureReplaceModal();
  m.open();
}


const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const btnLibrary = document.getElementById("btnLibrary");

const fileImport = document.getElementById("fileImport");

const btnSelToggle = document.getElementById("btnSelToggle");
const btnSelCopy = document.getElementById("btnSelCopy");
const btnSelPaste = document.getElementById("btnSelPaste");
const btnSelCut = document.getElementById("btnSelCut");

const inpBpm = document.getElementById("inpBpm");
const inpVol = document.getElementById("inpVol");
const inpSongWidth = document.getElementById("inpSongWidth");
const btnLength = document.getElementById("btnLength");
const inpMeta = document.getElementById("inpMeta");
const paletteGrid = document.getElementById("paletteGrid");

const modalBack = document.getElementById("modalBack");
const gearCanvas = document.getElementById("gearCanvas");
const gctx = gearCanvas.getContext("2d");
const gearDone = document.getElementById("gearDone");
const gearCancel = document.getElementById("gearCancel");
const gearVol = document.getElementById("gearVol");
const gearPaletteGrid = document.getElementById("gearPaletteGrid");

const gearCodeEl = document.getElementById("gearCode");
const gearCodeInput = document.getElementById("gearCodeInput");
const gearCodeApply = document.getElementById("gearCodeApply");
const gearCodeClear = document.getElementById("gearCodeClear");
const gearVolTextEl = document.getElementById("gearVolText");
const gearToastEl = document.getElementById("gearToast");

let TILE = 32;           
let pageWidth = 25;       
const songHeight = 14;

const songSetBack   = document.getElementById("songSetBack");
const songSetClose  = document.getElementById("songSetClose");
const songSetCancel = document.getElementById("songSetCancel");
const songSetApply  = document.getElementById("songSetApply");
const songSetWidth  = document.getElementById("songSetWidth");
const songSetBpm    = document.getElementById("songSetBpm");

function openSongSettings() {
  if (!songSetBack) return;

  if (songSetWidth) songSetWidth.value = String(state.width);
  if (songSetBpm && typeof inpBpm !== "undefined" && inpBpm) songSetBpm.value = String(inpBpm.value || 100);

  songSetBack.style.display = "flex";
}

function closeSongSettings() {
  if (!songSetBack) return;
  songSetBack.style.display = "none";
}

if (btnLength) {
  btnLength.type = "button";
  btnLength.onclick = (e) => { e.preventDefault(); openSongSettings(); };
}

if (songSetClose)  songSetClose.onclick  = closeSongSettings;
if (songSetCancel) songSetCancel.onclick = closeSongSettings;

if (songSetBack) {
  songSetBack.addEventListener("click", (e) => {
    if (e.target === songSetBack) closeSongSettings();
  });
}

if (songSetApply) {
  songSetApply.onclick = () => {
    if (songSetWidth) resizeSongWidth(parseInt(songSetWidth.value, 10));

    if (songSetBpm && typeof inpBpm !== "undefined" && inpBpm) {
      inpBpm.value = String(parseInt(songSetBpm.value, 10) || inpBpm.value || 100);
      inpBpm.dispatchEvent(new Event("input", { bubbles: true }));
      inpBpm.dispatchEvent(new Event("change", { bubbles: true }));
    }

    closeSongSettings();
  };
}

const VIEW_COLS_NORMAL = 25;
const VIEW_COLS_ZOOM = 10;
const TILE_NORMAL = 32;

const TILE_ZOOM = Math.round((VIEW_COLS_NORMAL * TILE_NORMAL) / VIEW_COLS_ZOOM); 
let zoomOn = false;

const LABEL_WIDTH = 36; 
const LABEL_PAD_X = 10;
const ROW_LABELS = ["B","A","G","F","E","D","C","b","a","g","f","e","d","c"];
const COL_LABELS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y"];
const FOOTER_HEIGHT_TILES = 1; 

function isDarkUiTheme() {
  return (document.documentElement && document.documentElement.dataset && document.documentElement.dataset.uiTheme === "dark");
}

function drawThemedLabelText(ctx2, text, x, y, align, isDark) {
  ctx2.save();
  ctx2.font = "900 19px system-ui, Arial";
  ctx2.textAlign = align || "left";
  ctx2.textBaseline = "middle";

  if (isDark) {
    ctx2.fillStyle = "rgba(240,244,255,0.94)";
    ctx2.strokeStyle = "rgba(0,0,0,0.45)";
    ctx2.lineWidth = 3;
    ctx2.shadowColor = "rgba(0,0,0,0.55)";
    ctx2.shadowBlur = 6;
    ctx2.shadowOffsetX = 0;
    ctx2.shadowOffsetY = 1;
    ctx2.strokeText(text, x, y);
    ctx2.fillText(text, x, y);
  } else {
    ctx2.fillStyle = "rgba(0,0,0,0.90)";
    ctx2.strokeStyle = "rgba(255,255,255,0.55)";
    ctx2.lineWidth = 2;
    ctx2.shadowColor = "rgba(255,255,255,0.0)";
    ctx2.shadowBlur = 0;
    ctx2.strokeText(text, x, y);
    ctx2.fillText(text, x, y);
  }
  ctx2.restore();
}


const CANVAS_THEME_KEY = "gmsf_canvas_theme_v1";

const CANVAS_THEMES = [
  { name: "Classic", mode: "solid", color: "#FFFFFF" },

  { name: "Pastel", mode: "row", rows: ["#FFC0C0","#FFFFC0","#D0FF52","#C0FFFF","#8080FF","#C0C0C0","#FFFFFF"] },

  { name: "Muted", mode: "row", rows: ["#800000","#808000","#008000","#008080","#000080","#800080","#404040"] },

  { name: "Vivid", mode: "row", rows: ["#FF0000","#FFFF00","#00FF00","#00FFFF","#0000FF","#FF00FF","#FFFFFF"] },

  { name: "Dark", mode: "row", rows: ["#003F3F","#00003F","#2F00AD","#3F0000","#7F7F00","#3F3F3F","#000000"] },

  {
    name: "Diagonal",
    mode: "diag",

    diag: [
      "#6B0001","#8F0002","#A70002","#CE0002","#8E3000","#B13C00","#C24200","#FF5700",
      "#B1A403","#BFB104","#D0C004","#FFEC05","#077D00","#089600","#0AB900","#0CE600",
      "#0040A5","#004BC1","#0052D4","#0063FF","#59009D","#6600B5","#7200CA","#9000FF",
      "#94018E","#A701A0","#B601AF","#FF01F5","#00959A","#00A6AC","#00BAC1","#00F7FF"
    ],

    grey: ["#262626","#3E3E3E","#626262","#808080","#BFBFBF","#FFFFFF"],
    greyStartRow: 8,
    baseCols: 25
  }
];

let canvasThemeIndex = 1;

function loadCanvasThemeIndex() {
  try {
    const v = parseInt(localStorage.getItem(CANVAS_THEME_KEY) || "1", 10);
    if (Number.isFinite(v) && v >= 0 && v < CANVAS_THEMES.length) return v;
  } catch {}
  return 0;
}

function setCanvasThemeIndex(i) {
  canvasThemeIndex = (i + CANVAS_THEMES.length) % CANVAS_THEMES.length;
  try { localStorage.setItem(CANVAS_THEME_KEY, String(canvasThemeIndex)); } catch {}
  markBaseDirty();
  requestDraw();
  updateThemeButtonText();
}

function nextCanvasTheme() {
  setCanvasThemeIndex(canvasThemeIndex + 1);
}

function updateThemeButtonText() {
  if (!btnTheme) return;
  const t = CANVAS_THEMES[canvasThemeIndex];
  btnTheme.textContent = `Theme: ${t?.name || "Classic"}`;
}

function ensureThemeButton() {
  if (btnTheme) return;
  const header = document.querySelector("header");
  if (!header) return;

  const b = document.createElement("button");
  b.id = "btnTheme";
  b.type = "button";
  b.textContent = "Theme: Classic";
  b.style.cssText = `
    border-radius: 12px;
    padding: 8px 10px;
    border: 1px solid var(--ui-chip-border, rgba(99,102,241,.35));
    background: var(--ui-chip-bg, rgba(99,102,241,.12));
    color: var(--ui-chip-text, rgba(67,56,202,1));
    font-weight: 900;
    cursor: pointer;
  `;
  header.appendChild(b);
  btnTheme = b;
}

function _vxToBaseCols(vx, baseCols) {
  if (pageWidth <= 1) return 0;
  if (pageWidth === baseCols) return vx;
  return Math.round(vx * (baseCols - 1) / (pageWidth - 1));
}

function themeColorForCell(theme, vx, y) {
  if (!theme) return "#FFFFFF";

  if (theme.mode === "solid") return theme.color || "#FFFFFF";

  if (theme.mode === "row") {
    const arr = theme.rows || ["#FFFFFF"];
    return arr[y % arr.length] || "#FFFFFF";
  }

  if (theme.mode === "diag") {
    const baseCols = theme.baseCols || 25;
    const x = _vxToBaseCols(vx, baseCols);

    const sRow = theme.greyStartRow ?? 8;
    if (y >= sRow) {
      const startGrey = (baseCols - 1) - (y - sRow);
      if (x >= startGrey) {
        const level = x - startGrey;
        const g = theme.grey || ["#3E3E3E"];
        return g[Math.min(level, g.length - 1)] || g[g.length - 1];
      }
    }

    const d = x + y;
    const pal = theme.diag || [];
    return pal[Math.min(d, pal.length - 1)] || "#FFFFFF";
  }

  return "#FFFFFF";
}

function _hexToRgb(_h) {
  const h = String(_h || "").trim();
  const m = h.match(/^#?([0-9a-f]{6})$/i) || h.match(/^#?([0-9a-f]{3})$/i);
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split("").map(ch => ch + ch).join("");
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function _relLuma(r, g, b) {
  const srgb = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}
function _canvasThemeIsLight(theme) {
  try {
    const samples = [
      themeColorForCell(theme, 0, 0),
      themeColorForCell(theme, Math.floor(pageWidth / 2), 0),
      themeColorForCell(theme, 0, Math.floor(state.height / 2)),
      themeColorForCell(theme, Math.floor(pageWidth / 2), Math.floor(state.height / 2)),
    ];
    let sum = 0, n = 0;
    for (const c of samples) {
      const rgb = _hexToRgb(c);
      if (!rgb) continue;
      sum += _relLuma(rgb.r, rgb.g, rgb.b);
      n++;
    }
    const avg = n ? (sum / n) : 1;
    return avg > 0.55;
  } catch {
    return true;
  }
}

// Line kix
function getGridStrokeForCurrentCanvasTheme() {
  const uiDark = isDarkUiTheme();
  return `rgba(0,0,0,${uiDark ? 2.34 : 2.46})`;
}

function drawCanvasThemeBackground(ctx2) {
  const theme = CANVAS_THEMES[canvasThemeIndex] || CANVAS_THEMES[0];
  const w = pageWidth * TILE;
  const h = state.height * TILE;

  if (theme.mode === "diag") {
    for (let y = 0; y < state.height; y++) {
      for (let vx = 0; vx < pageWidth; vx++) {
        ctx2.fillStyle = themeColorForCell(theme, vx, y);
        ctx2.fillRect(vx * TILE, y * TILE, TILE, TILE);
      }
    }
  } else {
    for (let y = 0; y < state.height; y++) {
      ctx2.fillStyle = themeColorForCell(theme, 0, y);
      ctx2.fillRect(0, y * TILE, w, TILE);
    }
  }

  
  const _gridStroke = getGridStrokeForCurrentCanvasTheme();
  ctx2.save();
  
  // Line Kix
  ctx2.strokeStyle = _gridStroke;
  ctx2.lineWidth = 2;
  ctx2.globalAlpha = 2;

  ctx2.beginPath();

  for (let x = 0; x <= pageWidth; x++) {
    const px = x * TILE + 0.5;
    ctx2.moveTo(px, 0);
    ctx2.lineTo(px, h);
  }

  for (let y = 0; y <= state.height; y++) {
    const py = y * TILE + 0.5;
    ctx2.moveTo(0, py);
    ctx2.lineTo(w, py);
  }

  ctx2.stroke();
  ctx2.restore();
}

canvasThemeIndex = loadCanvasThemeIndex();

const GEAR_TILE = 32;

const SONG_WIDTH_MIN = 25;
const SONG_WIDTH_MAX = 5000;
const PREF_SONG_WIDTH_KEY = "gmsf_song_width";

function getPreferredSongWidth() {
  const n = parseInt(localStorage.getItem(PREF_SONG_WIDTH_KEY) || "", 10);
  if (!Number.isFinite(n)) return 400;
  return clamp(n, SONG_WIDTH_MIN, SONG_WIDTH_MAX);
}

const MAX_HISTORY = 200;
const undoStack = [];
const redoStack = [];

let state = makeEmptyState(getPreferredSongWidth(), songHeight);
let songXOffset = 0;

let selectedNote = 1;

let playing = false;
let paused = false;
let timer = null;
let _tickBusy = false; 


let fileHandle = null;

let playPos = 0;
let playStartX = 0; 
let currentPlayPosition = 0;
let maxX = 0;

let repeatUsed = Array.from({ length: state.height }, () => Array(state.width).fill(false));

let gearEditingCell = null;
let gearEditingPos = null; 
let gearGrid = Array.from({ length: state.height }, () => Array(AUDIOGEARSPACE).fill(0));
let gearSelectedNote = 0;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const bufCache = new Map();
const imgCache = new Map();

const fx = {
  input: audioCtx.createGain(),

  eqSubBass:  audioCtx.createBiquadFilter(), 
  eqBass:     audioCtx.createBiquadFilter(), 
  eqLowMid:   audioCtx.createBiquadFilter(), 
  eqMid:      audioCtx.createBiquadFilter(), 
  eqHighMid:  audioCtx.createBiquadFilter(), 
  eqPresence: audioCtx.createBiquadFilter(), 
  eqHigh:     audioCtx.createBiquadFilter(), 
  eqTreble:   audioCtx.createBiquadFilter(), 

  satPre: audioCtx.createGain(),
  sat: audioCtx.createWaveShaper(),
  satPost: audioCtx.createGain(),

  comp: audioCtx.createDynamicsCompressor(),

  reverb: audioCtx.createConvolver(),
  wet: audioCtx.createGain(),
  dry: audioCtx.createGain(),

  master: audioCtx.createGain(),
};

fx.eqSubBass.type  = "lowshelf";  fx.eqSubBass.frequency.value  = 60;    fx.eqSubBass.gain.value  = 0;
fx.eqBass.type     = "peaking";   fx.eqBass.frequency.value     = 120;   fx.eqBass.Q.value        = 0.9; fx.eqBass.gain.value = 0;
fx.eqLowMid.type   = "peaking";   fx.eqLowMid.frequency.value   = 320;   fx.eqLowMid.Q.value      = 1.0; fx.eqLowMid.gain.value = 0;
fx.eqMid.type      = "peaking";   fx.eqMid.frequency.value      = 1000;  fx.eqMid.Q.value         = 1.0; fx.eqMid.gain.value = 0;
fx.eqHighMid.type  = "peaking";   fx.eqHighMid.frequency.value  = 2500;  fx.eqHighMid.Q.value     = 1.0; fx.eqHighMid.gain.value = 0;
fx.eqPresence.type = "peaking";   fx.eqPresence.frequency.value = 4500;  fx.eqPresence.Q.value    = 1.0; fx.eqPresence.gain.value = 0;
fx.eqHigh.type     = "peaking";   fx.eqHigh.frequency.value     = 8000;  fx.eqHigh.Q.value        = 0.9; fx.eqHigh.gain.value = 0;
fx.eqTreble.type   = "highshelf"; fx.eqTreble.frequency.value   = 12000; fx.eqTreble.gain.value   = 0;

fx.comp.threshold.value = 0;
fx.comp.knee.value = 0;
fx.comp.ratio.value = 1;
fx.comp.attack.value = 0.003;
fx.comp.release.value = 0.10;

fx.wet.gain.value = 0.0;
fx.dry.gain.value = 1.0;
fx.master.gain.value = 1.0;

fx.input.connect(fx.eqSubBass);
fx.eqSubBass.connect(fx.eqBass);
fx.eqBass.connect(fx.eqLowMid);
fx.eqLowMid.connect(fx.eqMid);
fx.eqMid.connect(fx.eqHighMid);
fx.eqHighMid.connect(fx.eqPresence);
fx.eqPresence.connect(fx.eqHigh);
fx.eqHigh.connect(fx.eqTreble);
fx.eqTreble.connect(fx.satPre);
fx.satPre.connect(fx.sat);
fx.sat.connect(fx.satPost);
fx.satPost.connect(fx.comp);
fx.comp.connect(fx.dry);
fx.dry.connect(fx.master);
fx.comp.connect(fx.reverb);
fx.reverb.connect(fx.wet);
fx.wet.connect(fx.master);
fx.master.connect(audioCtx.destination);

function makeImpulse(seconds = 1.4, decay = 3.0) {
  const rate = audioCtx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const ir = audioCtx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return ir;
}
let _lastIRKey = "";
function updateReverbIR(time, decay) {
  const key = `${time}|${decay}`;
  if (key === _lastIRKey) return;
  _lastIRKey = key;
  fx.reverb.buffer = makeImpulse(time, decay);
}

function makeSaturationCurve(amount = 0.6) {
  const n = 44100;
  const curve = new Float32Array(n);
  const k = amount * 40;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  return curve;
}

const EQ_KEY = "gmsf_eq_settings_v1";
const FX_KEY = "gmsf_fx_settings_v3";

const EQ_DEFAULT = {
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  highMid: 0,
  presence: 0,
  high: 0,
  treble: 0,
};

const FX_DEFAULT = {
  reverbMix: 0,
  reverbTime: 1.4,
  reverbDecay: 3.0,

  compThreshold: 0,
  compKnee: 0,
  compRatio: 1,
  compAttack: 0.003,
  compRelease: 0.10,

  satDrive: 0,

  masterGain: 1.0,
};


function loadSettings(key, defaults) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...defaults };
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return { ...defaults };
    return { ...defaults, ...obj };
  } catch {
    return { ...defaults };
  }
}

let eqSettings = loadSettings(EQ_KEY, EQ_DEFAULT);
let fxSettings = loadSettings(FX_KEY, FX_DEFAULT);

function applyEqSettings(s) {
  fx.eqSubBass.gain.value  = Number(s.subBass ?? 0);
  fx.eqBass.gain.value     = Number(s.bass ?? 0);
  fx.eqLowMid.gain.value   = Number(s.lowMid ?? 0);
  fx.eqMid.gain.value      = Number(s.mid ?? 0);
  fx.eqHighMid.gain.value  = Number(s.highMid ?? 0);
  fx.eqPresence.gain.value = Number(s.presence ?? 0);
  fx.eqHigh.gain.value     = Number(s.high ?? 0);
  fx.eqTreble.gain.value   = Number(s.treble ?? 0);
}

function applyFxSettings(s) {
  const mix = clamp(Number(s.reverbMix), 0, 0.6);
  fx.wet.gain.value = mix;
  fx.dry.gain.value = 1 - mix;
  updateReverbIR(clamp(Number(s.reverbTime), 0.4, 3.0), clamp(Number(s.reverbDecay), 1.0, 6.0));

  fx.comp.threshold.value = Number(s.compThreshold);
  fx.comp.knee.value = Number(s.compKnee);
  fx.comp.ratio.value = Number(s.compRatio);
  fx.comp.attack.value = Number(s.compAttack);
  fx.comp.release.value = Number(s.compRelease);

  const d = clamp(Number(s.satDrive), 0, 1);
  if (d <= 0.001) {
    fx.satPre.gain.value = 1;
    fx.sat.curve = null;
    fx.satPost.gain.value = 1;
  } else {
    fx.satPre.gain.value = 1 + d * 6;
    fx.sat.curve = makeSaturationCurve(0.35 + d * 0.6);
    fx.sat.oversample = "4x";
    fx.satPost.gain.value = 1 / (1 + d * 1.8);
  }

  fx.master.gain.value = Number(s.masterGain);
}

applyEqSettings(eqSettings);
applyFxSettings(fxSettings);

function saveEqSettings() {
  try {
    localStorage.setItem(EQ_KEY, JSON.stringify(eqSettings));
    showStatus("EQ saved ✅");
  } catch {
    showStatus("EQ save failed ❌");
  }
}

function resetEqSettings() {
  try { localStorage.removeItem(EQ_KEY); } catch {}
  eqSettings = { ...EQ_DEFAULT };
  applyEqSettings(eqSettings);
  refreshAudioPanelUI();
  showStatus("EQ reset ✅");
}

function saveFxSettings() {
  try {
    localStorage.setItem(FX_KEY, JSON.stringify(fxSettings));
    showStatus("FX saved ✅");
  } catch {
    showStatus("FX save failed ❌");
  }
}

function resetFxSettings() {
  try { localStorage.removeItem(FX_KEY); } catch {}
  fxSettings = { ...FX_DEFAULT };
  applyFxSettings(fxSettings);
  refreshAudioPanelUI();
  showStatus("FX reset ✅");
}

const _audioUI = { eq: {}, fx: {} };

function fmtDB(v) {
  const n = Number(v);
  const s = (n > 0 ? "+" : "") + n.toFixed(0);
  return `${s} dB`;
}
function fmtNum(v, digits = 2, suffix = "") {
  const n = Number(v);
  return `${n.toFixed(digits)}${suffix}`;
}

function refreshAudioPanelUI() {
  for (const k in _audioUI.eq) {
    const ui = _audioUI.eq[k];
    if (!ui) continue;
    ui.input.value = String(eqSettings[k]);
    ui.val.textContent = fmtDB(eqSettings[k]);
  }
  for (const k in _audioUI.fx) {
    const ui = _audioUI.fx[k];
    if (!ui) continue;
    ui.input.value = String(fxSettings[k]);
    ui.val.textContent = ui.format(fxSettings[k]);
  }
}

function injectAudioPanel() {
  if (document.getElementById("audioPanel")) return;

  const STYLE_ID = "audioPanelStyle";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #audioPanel{
        margin-top: 10px;
        padding: 10px 12px;
        border: 1px solid var(--ui-border, rgba(0,0,0,.08));
        border-radius: 16px;
        background: var(--ui-card, rgba(255,255,255,.92));
        box-shadow: var(--ui-card-shadow, 0 10px 26px rgba(0,0,0,.08));
        display:flex;
        flex-direction:column;
        gap:10px;
        font-size: 12px;
        color: var(--ui-text-soft, rgba(0,0,0,.78));
      }
      #audioPanelTop{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        flex-wrap:wrap;
      }
      .apTitle{
        font-weight: 900;
        display:flex;
        gap:8px;
        align-items:center;
      }
      .apTabs{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        align-items:center;
      }
      .apTab{
        padding:6px 10px;
        border-radius: 999px;
        border:1px solid var(--ui-border-soft, rgba(0,0,0,.14));
        background: var(--ui-surface, #fff);
        cursor:pointer;
        font-weight:800;
        user-select:none;
      }
      .apTab.active{
        border-color: var(--ui-outline, rgba(17,17,17,.80));
        background: var(--ui-tab-active-bg, rgba(17,17,17,.08));
      }

      .apMin{
        padding:6px 10px;
        border-radius: 999px;
        border:1px solid var(--ui-border-soft, rgba(0,0,0,.14));
        background: var(--ui-surface, #fff);
        cursor:pointer;
        font-weight:900;
        user-select:none;
        line-height:1;
      }
      .apMin:hover{ border-color: rgba(0,0,0,.26); }
      #audioPanel.collapsed .apGrid{ display:none; }
      .apGrid{
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap:10px;
      }
      .apCard{
        border:1px solid var(--ui-border, rgba(0,0,0,.10));
        border-radius: 16px;
        background: var(--ui-surface, #fff);
        padding: 10px;
        display:flex;
        flex-direction:column;
        gap:10px;
        min-width: 0;
      }
      .apCardTop{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:10px;
        flex-wrap:wrap;
      }
      .apCardTop .name{
        font-weight: 900;
        font-size: 13px;
      }
      .apCardTop .sub{
        margin-top:2px;
        font-size: 11px;
        opacity:.7;
        line-height:1.3;
      }
      .apBtns{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        align-items:center;
      }
      .apBtn{
        border-radius: 12px;
        padding:6px 10px;
        border:1px solid var(--ui-border-soft, rgba(0,0,0,.14));
        background: var(--ui-surface, #fff);
        cursor:pointer;
        font-weight:800;
      }
      .apBtn.primary{
        background: var(--ui-primary-bg, #111);
        border-color: var(--ui-primary-border, #111);
        color: var(--ui-primary-text, #fff);
      }

      .apRow{
        display:grid;
        grid-template-columns: 120px 1fr 82px;
        gap:10px;
        align-items:center;
      }
      .apRow .lbl{
        font-weight:800;
        opacity:.85;
        white-space:nowrap;
      }
      .apRow input[type="range"]{ width:100%; }
      .apRow .val{
        text-align:right;
        font-family: ui-monospace, Menlo, monospace;
        opacity:.85;
        white-space:nowrap;
      }

      @media (max-width: 860px){
        .apGrid{ grid-template-columns: 1fr; }
        #audioPanel[data-active="eq"] .apCard.fx{ display:none; }
        #audioPanel[data-active="fx"] .apCard.eq{ display:none; }
      }
    `;
    document.head.appendChild(style);
  }

  const panel = document.createElement("div");
  panel.id = "audioPanel";

  const AUDIO_COLLAPSE_KEY = "gmsf_audio_panel_collapsed_v1";
    let collapsed = true;
    try {
      collapsed = localStorage.getItem(AUDIO_COLLAPSE_KEY) === "1" ? false : true;
    } catch {}

  let active = "eq";
  try {
    const saved = localStorage.getItem("gmsf_audio_tab");
    if (saved === "fx" || saved === "eq") active = saved;
  } catch {}
  panel.dataset.active = active;

  const top = document.createElement("div");
  top.id = "audioPanelTop";

  const title = document.createElement("div");
  title.className = "apTitle";
  title.innerHTML = `<span>Audio</span><span style="opacity:.65;font-weight:700;">(EQ + FX)</span>`;

  const tabs = document.createElement("div");
  tabs.className = "apTabs";

  const tabEq = document.createElement("button");
  tabEq.type = "button";
  tabEq.className = "apTab";
  tabEq.textContent = "EQUALIZER";

  const tabFx = document.createElement("button");
  tabFx.type = "button";
  tabFx.className = "apTab";
  tabFx.textContent = "FX";

  function setTab(t) {
    active = t;
    panel.dataset.active = t;
    tabEq.classList.toggle("active", t === "eq");
    tabFx.classList.toggle("active", t === "fx");
    try { localStorage.setItem("gmsf_audio_tab", t); } catch {}
  }

  tabEq.onclick = () => setTab("eq");
  tabFx.onclick = () => setTab("fx");

  tabs.appendChild(tabEq);
  tabs.appendChild(tabFx);

  const btnMin = document.createElement("button");
  btnMin.type = "button";
  btnMin.className = "apMin";

  function applyCollapse() {
    panel.classList.toggle("collapsed", !!collapsed);
    btnMin.textContent = collapsed ? "▸" : "▾";
    btnMin.title = collapsed ? "Expand audio panel" : "Minimize audio panel";
    btnMin.setAttribute("aria-expanded", collapsed ? "false" : "true");
    try { localStorage.setItem(AUDIO_COLLAPSE_KEY, collapsed ? "1" : "0"); } catch {}
  }

  btnMin.onclick = () => {
    collapsed = !collapsed;
    applyCollapse();
  };

  title.style.cursor = "pointer";
  title.onclick = () => {
    collapsed = !collapsed;
    applyCollapse();
  };

  const right = document.createElement("div");
  right.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";
  right.appendChild(tabs);
  right.appendChild(btnMin);

  top.appendChild(title);
  top.appendChild(right);
  panel.appendChild(top);

  const grid = document.createElement("div");
  grid.className = "apGrid";

  const mkRow = (label, input, val) => {
    const row = document.createElement("div");
    row.className = "apRow";
    const lbl = document.createElement("div");
    lbl.className = "lbl";
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(val);
    return row;
  };

  const mkRange = ({ label, store, key, min, max, step, format, onInput }) => {
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(store[key]);

    const val = document.createElement("div");
    val.className = "val";
    val.textContent = format(store[key]);

    input.addEventListener("input", () => {
      store[key] = Number(input.value);
      val.textContent = format(store[key]);
      onInput(store[key]);
    });

    return { row: mkRow(label, input, val), input, val };
  };

  const eqCard = document.createElement("div");
  eqCard.className = "apCard eq";

  const eqTop = document.createElement("div");
  eqTop.className = "apCardTop";
  eqTop.innerHTML = `
    <div>
      <div class="name">Equalizer</div>
      <div class="sub">8-band tone shaping: Sub Bass → Presence</div>
    </div>
  `;

  const eqBtns = document.createElement("div");
  eqBtns.className = "apBtns";

  const btnEqSave = document.createElement("button");
  btnEqSave.type = "button";
  btnEqSave.className = "apBtn primary";
  btnEqSave.textContent = "Save EQ";
  btnEqSave.onclick = () => saveEqSettings();

  const btnEqReset = document.createElement("button");
  btnEqReset.type = "button";
  btnEqReset.className = "apBtn";
  btnEqReset.textContent = "Reset";
  btnEqReset.onclick = () => resetEqSettings();

  eqBtns.appendChild(btnEqSave);
  eqBtns.appendChild(btnEqReset);
  eqTop.appendChild(eqBtns);
  eqCard.appendChild(eqTop);

  const eqRows = [
    ["Sub Bass",  "subBass"],
    ["Bass",      "bass"],
    ["Low Mid",   "lowMid"],
    ["Mid",       "mid"],
    ["High Mid",  "highMid"],
    ["Presence",  "presence"],
    ["High",      "high"],
    ["Treble",    "treble"],
  ];

  for (const [label, key] of eqRows) {
    const r = mkRange({
      label,
      store: eqSettings,
      key,
      min: -12, max: 12, step: 1,
      format: fmtDB,
      onInput: () => applyEqSettings(eqSettings),
    });
    _audioUI.eq[key] = { input: r.input, val: r.val };
    eqCard.appendChild(r.row);
  }

  const fxCard = document.createElement("div");
  fxCard.className = "apCard fx";

  const fxTop = document.createElement("div");
  fxTop.className = "apCardTop";
  fxTop.innerHTML = `
    <div>
      <div class="name">FX</div>
      <div class="sub">Reverb + Compression + Saturation + Master</div>
    </div>
  `;

  const fxBtns = document.createElement("div");
  fxBtns.className = "apBtns";

  const btnFxSave = document.createElement("button");
  btnFxSave.type = "button";
  btnFxSave.className = "apBtn primary";
  btnFxSave.textContent = "Save FX";
  btnFxSave.onclick = () => saveFxSettings();

  const btnFxReset = document.createElement("button");
  btnFxReset.type = "button";
  btnFxReset.className = "apBtn";
  btnFxReset.textContent = "Reset";
  btnFxReset.onclick = () => resetFxSettings();

  fxBtns.appendChild(btnFxSave);
  fxBtns.appendChild(btnFxReset);
  fxTop.appendChild(fxBtns);
  fxCard.appendChild(fxTop);

  const fxRanges = [
    { label:"Reverb Mix", key:"reverbMix", min:0, max:0.6, step:0.01, format:(v)=>fmtNum(v,2,""), onInput:()=>applyFxSettings(fxSettings) },
    { label:"Reverb Time", key:"reverbTime", min:0.4, max:3.0, step:0.1, format:(v)=>fmtNum(v,1," s"), onInput:()=>applyFxSettings(fxSettings) },
    { label:"Reverb Decay", key:"reverbDecay", min:1.0, max:6.0, step:0.2, format:(v)=>fmtNum(v,1,""), onInput:()=>applyFxSettings(fxSettings) },

    { label:"Comp Threshold", key:"compThreshold", min:-40, max:0, step:1, format:(v)=>`${Math.round(v)} dB`, onInput:()=>applyFxSettings(fxSettings) },
    { label:"Comp Knee", key:"compKnee", min:0, max:40, step:1, format:(v)=>`${Math.round(v)}`, onInput:()=>applyFxSettings(fxSettings) },
    { label:"Comp Ratio", key:"compRatio", min:1, max:16, step:0.5, format:(v)=>fmtNum(v,1,"x"), onInput:()=>applyFxSettings(fxSettings) },
    { label:"Comp Attack", key:"compAttack", min:0.001, max:0.05, step:0.001, format:(v)=>fmtNum(v,3," s"), onInput:()=>applyFxSettings(fxSettings) },
    { label:"Comp Release", key:"compRelease", min:0.05, max:0.5, step:0.01, format:(v)=>fmtNum(v,2," s"), onInput:()=>applyFxSettings(fxSettings) },

    { label:"Saturation", key:"satDrive", min:0, max:1.0, step:0.01, format:(v)=>fmtNum(v,2,""), onInput:()=>applyFxSettings(fxSettings) },
    { label:"Master", key:"masterGain", min:0.5, max:1.2, step:0.01, format:(v)=>fmtNum(v,2,""), onInput:()=>applyFxSettings(fxSettings) },
  ];

  for (const it of fxRanges) {
    const r = mkRange({
      label: it.label,
      store: fxSettings,
      key: it.key,
      min: it.min, max: it.max, step: it.step,
      format: it.format,
      onInput: it.onInput,
    });
    _audioUI.fx[it.key] = { input: r.input, val: r.val, format: it.format };
    fxCard.appendChild(r.row);
  }

  grid.appendChild(eqCard);
  grid.appendChild(fxCard);
  panel.appendChild(grid);

  const wrapRoot = document.getElementById("wrap");
  const leftCard = wrapRoot ? wrapRoot.querySelector(".card") : null;
  if (leftCard) leftCard.appendChild(panel);
  else document.body.appendChild(panel);

  setTab(active);
  refreshAudioPanelUI();
  applyCollapse();
}

async function warmUpAudioAround(startX, spanCols=50){
  const paths = new Set();
  const end = Math.min(state.width-1, startX + spanCols);

  for(let x=startX; x<=end; x++){
    for(let y=0; y<state.height; y++){
      const id = cellId(state.grid[y][x]);
      const p = NOTE_PACK.notes[id]?.sounds?.[y];
      if (p) paths.add(p);
    }
  }

  await Promise.all([...paths].map(p => getBuf(p)));
}

let _warmUsedPromise = null;

function collectUsedSoundPaths() {
  const paths = new Set();

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.grid[y][x];
      const id = cellId(cell);
      if (!id) continue;
      if (id === state.audioGearID && typeof cell !== "number") {
        const gd = cell.gearData;
        if (gd) {
          for (let i = 0; i < AUDIOGEARSPACE; i++) {
            const nid = gd[i * 2];
            const yy = gd[i * 2 + 1];
            const p = NOTE_PACK.notes[nid]?.sounds?.[yy];
            if (p) paths.add(p);
          }
        }
        continue;
      }

      const p = NOTE_PACK.notes[id]?.sounds?.[y];
      if (p) paths.add(p);
    }
  }

  return [...paths];
}

async function warmUpUsedSamples() {
  if (_warmUsedPromise) return _warmUsedPromise;

  _warmUsedPromise = (async () => {
    const list = collectUsedSoundPaths();
    if (!list.length) return;

    showStatus(`Preload samples: 0/${list.length}`, 2000);

    const CONC = 10;
    for (let i = 0; i < list.length; i += CONC) {
      const batch = list.slice(i, i + CONC);
      await Promise.all(batch.map(p => getBuf(p)));
      showStatus(`Preload samples: ${Math.min(i + CONC, list.length)}/${list.length}`, 800);
      await new Promise(r => setTimeout(r, 0)); 
    }

    showStatus("Samples ready ✅", 1500);
  })();

  return _warmUsedPromise;
}

async function warmUpGearSamples(gearData) {
  if (!gearData) return;

  const paths = new Set();
  for (let i = 0; i < AUDIOGEARSPACE; i++) {
    const noteId = gearData[i * 2];
    const yPos  = gearData[i * 2 + 1];

    if (noteId !== 0) {
      const p = NOTE_PACK.notes[noteId]?.sounds?.[yPos];
      if (p) paths.add(p);
    }
  }

  await Promise.all([...paths].map(p => getBuf(p)));
}


const LETTER_MAP = {
  P: { key: "piano",   name: "Piano" },
  B: { key: "bass",    name: "Bass" },
  D: { key: "drum",    name: "Drum" },
  S: { key: "sax",     name: "Sax" },
  F: { key: "flute",   name: "Flute" },
  G: { key: "guitar",  name: "Guitar" },
  V: { key: "violin",  name: "Violin" },
  L: { key: "lyre",    name: "Lyre" },
  E: { key: "eguitar", name: "Electric Guitar" },
  T: { key: "trumpet", name: "Mexican Trumpet" },
};

const INSTR_ORDER = ["piano","bass","drum","sax","flute","guitar","violin","lyre","eguitar","trumpet","spooky","festive","repeatBegin","repeatEnd","blank","gear","other"];

function keyName(key){
  if (key === "gear") return "Audio Rack / Gear";
  if (key === "repeatBegin") return "Repeat Begin";
  if (key === "repeatEnd") return "Repeat End";
  if (key === "blank") return "Blank / Rest";
  if (key === "spooky") return "Spooky";
  if (key === "festive") return "Winterfest";
  if (key === "other") return "Other";
  for (const L in LETTER_MAP){
    if (LETTER_MAP[L].key === key) return LETTER_MAP[L].name;
  }
  return key;
}

function getNoteObj(noteId){
  return NOTE_PACK?.notes?.[noteId] || null;
}
function getNoteImageLower(noteId){
  const img = getNoteObj(noteId)?.image || "";
  return String(img).toLowerCase();
}
function getAnySoundPathLower(noteId){
  const arr = getNoteObj(noteId)?.sounds;
  if (!arr || !Array.isArray(arr)) return "";
  for (const p of arr){
    if (typeof p === "string" && p.length) return String(p).toLowerCase();
  }
  return "";
}
function noteHasAnySound(noteId){
  const arr = getNoteObj(noteId)?.sounds;
  if (!arr || !Array.isArray(arr)) return false;
  return arr.some(p => typeof p === "string" && p.length);
}
function hasAudibleSample(noteId, rowY){
  const p = NOTE_PACK?.notes?.[noteId]?.sounds?.[rowY];
  return typeof p === "string" && p.length > 0;
}

function getSpecialIDs(){
  const rs =
    NOTE_PACK?.repeatStartID ??
    NOTE_PACK?.repeatStartId ??
    NOTE_PACK?.repeat_start_id ??
    NOTE_PACK?.repeat_startID ??
    NOTE_PACK?.repeatStart ??
    NOTE_PACK?.repeatBeginID ??
    NOTE_PACK?.repeatBeginId ??
    null;

  const re =
    NOTE_PACK?.repeatEndID ??
    NOTE_PACK?.repeatEndId ??
    NOTE_PACK?.repeat_end_id ??
    NOTE_PACK?.repeat_endID ??
    NOTE_PACK?.repeatEnd ??
    NOTE_PACK?.repeatEndingID ??
    NOTE_PACK?.repeatEndingId ??
    null;

  const gear =
    (typeof state !== "undefined" && state?.audioGearID != null) ? state.audioGearID :
    NOTE_PACK?.audioGearID ??
    NOTE_PACK?.audioGearId ??
    null;

  let repeatStart = rs;
  let repeatEnd = re;

  if (repeatStart == null || repeatEnd == null){
    for (const idStr in NOTE_PACK?.notes){
      const id = Number(idStr);
      const s = getNoteImageLower(id);
      if (repeatStart == null && (s.includes("repeatstart") || (s.includes("repeat") && s.includes("start")))) repeatStart = id;
      if (repeatEnd == null && (s.includes("repeatend") || (s.includes("repeat") && s.includes("end")))) repeatEnd = id;
    }
  }

  return { repeatStart, repeatEnd, gear };
}

const SPECIAL_IDS = { repeatStart: null, repeatEnd: null, gear: null };
function refreshSpecialIDs(){
  const v = getSpecialIDs();
  SPECIAL_IDS.repeatStart = v.repeatStart;
  SPECIAL_IDS.repeatEnd   = v.repeatEnd;
  SPECIAL_IDS.gear        = v.gear;
}

refreshSpecialIDs();

function inferKeyFallback(noteId){
  const img = getNoteImageLower(noteId);
  const snd = getAnySoundPathLower(noteId);

  if (snd.includes("spooky")) return "spooky";
  if (snd.includes("festive")) return "festive";

  if (
    img.includes("repeatstart") ||
    img.includes("repeat_begin") ||
    (img.includes("repeat") && (img.includes("start") || img.includes("begin")))
  ) return "repeatBegin";

  if (
    img.includes("repeatend") ||
    img.includes("repeat_end") ||
    (img.includes("repeat") && img.includes("end"))
  ) return "repeatEnd";

  if (img.includes("blank") || img.includes("rest") || img.includes("empty") || img.includes("clear") || img.includes("none")) return "blank";

  if (img.includes("spooky") || img.includes("halloween") || img.includes("spook")) return "spooky";
  if (img.includes("festive") || img.includes("christmas") || img.includes("xmas") || img.includes("holiday")) return "festive";

  if (!noteHasAnySound(noteId)) return "blank";

  return "other";
}

function classifyNoteId(noteId){
  if (SPECIAL_IDS.gear == null) refreshSpecialIDs();

  if (SPECIAL_IDS.gear != null && noteId === SPECIAL_IDS.gear) return { key: "gear", acc: null };

  if (SPECIAL_IDS.repeatStart != null && noteId === SPECIAL_IDS.repeatStart) return { key: "repeatBegin", acc: null };
  if (SPECIAL_IDS.repeatEnd   != null && noteId === SPECIAL_IDS.repeatEnd)   return { key: "repeatEnd", acc: null };

  const gi = NOTE_PACK?.gearInfo?.[noteId];
  if (gi && gi.letter){
    const L = String(gi.letter).toUpperCase();
    const map = LETTER_MAP[L];
    const key = map ? map.key : "other";
    const acc = (gi.accidental === "#" || gi.accidental === "b") ? gi.accidental : "-";
    return { key, acc };
  }

  const k = inferKeyFallback(noteId);
  const isMus =
    (k === "piano" || k === "bass" || k === "drum" || k === "sax" || k === "flute" ||
     k === "guitar" || k === "violin" || k === "lyre" || k === "eguitar" || k === "trumpet" ||
     k === "other");
  return { key: k, acc: isMus ? "-" : null };
}

const _iconCache = new Map();
function findIconIdForKey(key){
  if (_iconCache.has(key)) return _iconCache.get(key);

  if (key === "gear"){
    const id = SPECIAL_IDS.gear ?? state.audioGearID;
    _iconCache.set(key, id || 0);
    return id || 0;
  }

  if (key === "repeatBegin"){
    const id = SPECIAL_IDS.repeatStart ?? 0;
    _iconCache.set(key, id);
    return id;
  }

  if (key === "repeatEnd"){
    const id = SPECIAL_IDS.repeatEnd ?? SPECIAL_IDS.repeatStart ?? 0;
    _iconCache.set(key, id);
    return id;
  }

  if (key === "spooky" || key === "festive"){
    for (const idStr in NOTE_PACK?.notes){
      const id = Number(idStr);
      const snd = getAnySoundPathLower(id);
      if (key === "spooky" && snd.includes("spooky")) { _iconCache.set(key,id); return id; }
      if (key === "festive" && snd.includes("festive")) { _iconCache.set(key,id); return id; }
    }

    for (const idStr in NOTE_PACK?.notes){
      const id = Number(idStr);
      const img = getNoteImageLower(id);
      if (key === "spooky" && (img.includes("spooky") || img.includes("halloween"))) { _iconCache.set(key,id); return id; }
      if (key === "festive" && (img.includes("festive") || img.includes("christmas") || img.includes("xmas"))) { _iconCache.set(key,id); return id; }
    }
    _iconCache.set(key, 0);
    return 0;
  }

  if (key === "blank"){
    for (const idStr in NOTE_PACK?.notes){
      const id = Number(idStr);
      const img = getNoteImageLower(id);
      if ((img.includes("blank") || img.includes("rest") || img.includes("empty")) && !noteHasAnySound(id)) {
        _iconCache.set(key,id); return id;
      }
    }

    for (const idStr in NOTE_PACK?.notes){
      const id = Number(idStr);
      if (!noteHasAnySound(id) && id !== 0 && id !== SPECIAL_IDS.gear && id !== SPECIAL_IDS.repeatStart && id !== SPECIAL_IDS.repeatEnd){
        _iconCache.set(key,id); return id;
      }
    }
    _iconCache.set(key, 0);
    return 0;
  }

  for (const idStr in NOTE_PACK?.gearInfo){
    const id = Number(idStr);
    const gi = NOTE_PACK.gearInfo[id];
    if (!gi || !gi.letter) continue;
    const L = String(gi.letter).toUpperCase();
    const map = LETTER_MAP[L];
    if (!map || map.key !== key) continue;
    if (gi.accidental === "-" || gi.accidental == null){
      _iconCache.set(key, id);
      return id;
    }
  }

  for (const idStr in NOTE_PACK?.gearInfo){
    const id = Number(idStr);
    const gi = NOTE_PACK.gearInfo[id];
    const L = String(gi?.letter || "").toUpperCase();
    const map = LETTER_MAP[L];
    if (map && map.key === key){
      _iconCache.set(key, id);
      return id;
    }
  }

  _iconCache.set(key, 0);
  return 0;
}

function iconUrlForKey(key){
  const iconId = findIconIdForKey(key);
  const img = NOTE_PACK?.notes?.[iconId]?.image;
  return img ? assetUrl(img) : "";
}

function computeSongStats(){
  refreshSpecialIDs(); 

  const width = state.width;
  const height = state.height;

  const buckets = new Map();
  const ensure = (key) => {
    if (!buckets.has(key)){
      buckets.set(key,{
        key,
        name: keyName(key),

        placed: 0,
        audible: 0,

        placedN: 0, placedS: 0, placedF: 0,
        audibleN: 0, audibleS: 0, audibleF: 0,

        gearTiles: 0,
        gearSlots: 0,
        gearSlotsN: 0, gearSlotsS: 0, gearSlotsF: 0,
      });
    }
    return buckets.get(key);
  };

  for (const L in LETTER_MAP) ensure(LETTER_MAP[L].key);
  ensure("spooky"); ensure("festive"); ensure("repeatBegin"); ensure("repeatEnd"); ensure("blank"); ensure("gear"); ensure("other");

  let nonZero = 0;
  let gearTilesTotal = 0;
  let gearSlotsTotal = 0;

  for (let y=0; y<height; y++){
    for (let x=0; x<width; x++){
      const cell = state.grid[y][x];
      const id = (typeof cell === "number") ? cell : cell.id;
      if (id === 0) continue;
      nonZero++;

      if (id === state.audioGearID && typeof cell !== "number"){
        gearTilesTotal++;
        const g = ensure("gear");
        g.placed++;
        g.gearTiles++;
        continue;
      }

      const cls = classifyNoteId(id);
      const b = ensure(cls.key);
      b.placed++;

      if (cls.acc === "#") b.placedS++;
      else if (cls.acc === "b") b.placedF++;
      else if (cls.acc === "-") b.placedN++;

      if (hasAudibleSample(id, y)){
        b.audible++;
        if (cls.acc === "#") b.audibleS++;
        else if (cls.acc === "b") b.audibleF++;
        else if (cls.acc === "-") b.audibleN++;
      }
    }
  }

  let placedNotes = 0;
  let audibleNotes = 0;
  for (const [k,b] of buckets.entries()){
    if (k !== "gear"){
      placedNotes += b.placed;
      audibleNotes += b.audible;
    }
  }

  const estEvents = audibleNotes + gearSlotsTotal;

  const _order = ["gear", ...INSTR_ORDER.filter(k => k !== "gear")];
  const list = _order.map(k => buckets.get(k)).filter(Boolean);

  return {
    width, height,
    nonZero,
    gearTilesTotal,
    gearSlotsTotal,
    placedNotes,
    audibleNotes,
    estEvents,
    list,
  };
}

function injectStatsUI(){
  if (!document.getElementById("btnSongStats")){
    const btn = document.createElement("button");
    btn.id = "btnSongStats";
    btn.textContent = "Total Notes";
    btn.style.cssText = `
      background: rgba(16,185,129,.12);
      color: rgb(114 233 200);
      border: 1px solid rgba(16,185,129,.35);
      font-weight:800;
    `;
    document.querySelector("header")?.appendChild(btn);
    btn.onclick = openStatsModal;
  }

  if (document.getElementById("statsBack")) return;

  const style = document.createElement("style");
  style.textContent = `
    #statsBack{
      position:fixed; inset:0;
      background:rgba(0,0,0,.35);
      display:none;
      align-items:center;
      justify-content:center;
      z-index:95;
      padding: 10px;
      overscroll-behavior: contain;
    }
    #statsModal{
      width: min(560px, 96vw);
      max-height: min(72vh, 520px);
      overflow:auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      background: var(--ui-surface, #fff);
      border-radius: 16px;
      border:1px solid rgba(0,0,0,.12);
      box-shadow:0 14px 55px rgba(0,0,0,.22);
      padding: 10px;
    }
    #statsTop{
      display:flex; gap:10px;
      align-items:center; justify-content:space-between;
      flex-wrap:wrap;
      position: sticky; top: 0;
      background: var(--ui-card, rgba(255,255,255,.92));
      backdrop-filter: blur(6px);
      padding: 8px 8px;
      border-bottom:1px solid rgba(0,0,0,.08);
      border-radius: 14px;
      z-index: 2;
    }
    #statsTop h3{ margin:0; font-size: 14px; }
    #statsTop .sub{ opacity:.7; font-size: 11px; margin-top: 2px; }

    #statsSummary{
      display:grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;
    }
    .statCard{
      border:1px solid var(--ui-border, rgba(0,0,0,.10));
      border-radius: 14px;
      padding: 8px 10px;
      background: #fbfbfb;
    }
    .statCard .k{ font-size: 11px; opacity:.70; }
    .statCard .v{ font-size: 16px; font-weight: 900; margin-top: 2px; }

    #statsGrid{
      margin-top: 10px;
      display:grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .insCard{
      border:1px solid var(--ui-border, rgba(0,0,0,.10));
      border-radius: 14px;
      padding: 8px 10px;
      background: var(--ui-surface, #fff);
      display:flex;
      gap:10px;
      align-items:flex-start;
    }
    .insIcon{
      width:34px;height:34px;
      border-radius: 12px;
      border:1px solid var(--ui-border, rgba(0,0,0,.10));
      background: var(--ui-surface, #fff);
      display:flex;
      align-items:center;
      justify-content:center;
      flex:0 0 auto;
      overflow:hidden;
    }
    .insIcon img{
      width:26px;height:26px;
      image-rendering: pixelated;
    }
    .insName{ font-weight: 900; font-size: 20px; margin: 0; }
    .insMeta{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 10px;
      margin-top: 6px;
      font-size: 15px;
      opacity:.85;
    }
    .pill{
      display:inline-block;
      padding: 3px 7px;
      border-radius: 999px;
      border:1px solid var(--ui-border, rgba(0,0,0,.10));
      background: rgba(0,0,0,.03);
      font-family: ui-monospace, Menlo, monospace;
      white-space: nowrap;
    }
    @media (max-width: 480px){
      #statsModal{ width: 96vw; max-height: 82vh; }
      #statsSummary{ grid-template-columns: 1fr; }
      .insMeta{ grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);

  const back = document.createElement("div");
  back.id = "statsBack";

  const modal = document.createElement("div");
  modal.id = "statsModal";
  modal.innerHTML = `
    <div id="statsTop">
      <div>
        <h3>Total Notes</h3>
        <div class="sub">Note / Sharp / Flat + Spooky/Festive/Repeat Begin/End/Blank</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button id="statsRefresh" class="primary" style="background: var(--ui-primary-bg, #111);border-color: var(--ui-primary-border, #111);">Refresh</button>
        <button id="statsClose">Close</button>
      </div>
    </div>
    <div id="statsSummary"></div>
    <div id="statsGrid"></div>
  `;
  back.appendChild(modal);
  document.body.appendChild(back);

  back.addEventListener("click",(e)=>{ if(e.target===back) closeStatsModal(); });
  document.getElementById("statsClose").onclick = closeStatsModal;
  document.getElementById("statsRefresh").onclick = renderStatsModal;

  window.addEventListener("keydown",(e)=>{
    if (e.key==="Escape" && back.style.display==="flex") closeStatsModal();
  });
}


function injectAudioConvertUI(){
  const STYLE_ID = "audioConvertStyle";
  if (!document.getElementById(STYLE_ID)){
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #btnAudioConvert{
        background: rgba(244,63,94,.10);
        border: 1px solid rgba(244,63,94,.35);
        color: rgba(159,18,57,1);
        font-weight: 900;
        border-radius: 12px;
        padding: 8px 12px;
        cursor: pointer;
        user-select:none;
      }
      #btnAudioConvert.on{
        background: rgba(244,63,94,.16);
        border-color: rgba(244,63,94,.55);
        box-shadow: 0 10px 26px rgba(244,63,94,.10);
      }
      #btnAudioConvert:disabled{
        opacity: .55;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  if (!btnAudioConvert) btnAudioConvert = document.getElementById("btnAudioConvert");

  if (!btnAudioConvert){
    const btn = document.createElement("button");
    btn.id = "btnAudioConvert";
    btn.type = "button";
    document.querySelector("header")?.appendChild(btn);
    btnAudioConvert = btn;
  }

  btnAudioConvert.onclick = () => audioConvertToggle();
  audioConvertUpdateUI();
}


function openStatsModal(){
  const back = document.getElementById("statsBack");
  if (!back) return;
  if (back.style.display === "flex") return;
  renderStatsModal();
  kmModalLock();
  back.style.display = "flex";
}
function closeStatsModal(){
  const back = document.getElementById("statsBack");
  if (!back) return;
  if (back.style.display !== "flex") { back.style.display = "none"; return; }
  back.style.display = "none";
  kmModalUnlock();
}

function renderStatsModal(){
  const s = computeSongStats();
  const sum = document.getElementById("statsSummary");
  const grid = document.getElementById("statsGrid");
  if (!sum || !grid) return;

  sum.innerHTML = `
    <div class="statCard">
      <div class="k">Placed notes (outside Audio Gear)</div>
      <div class="v">${s.placedNotes}</div>
      <div class="k">Counts only tiles placed directly on the canvas.</div>
    </div>
    <div class="statCard">
      <div class="k">Audio Rack / Gear</div>
      <div class="v">${s.gearTilesTotal} tile</div>
      <div class="k">Notes inside the rack are not counted.</div>
    </div>
  `;

  grid.innerHTML = "";

  for (const it of s.list){
    if (!it) continue;
    const totalCount = (it.key === "gear")
      ? (it.gearTiles || 0)
      : (it.placed || 0);

    if (totalCount === 0) continue;
    if ((it.key==="repeatBegin" || it.key==="repeatEnd" || it.key==="blank" || it.key==="spooky" || it.key==="festive") && it.placed===0) continue;

    const icon = iconUrlForKey(it.key);

    const noteN = (it.placedN || 0);
    const noteS = (it.placedS || 0);
    const noteF = (it.placedF || 0);

    const noteBreak = `Note:${noteN}  Sharp:${noteS}  Flat:${noteF}`;

    const metaHtml =
      (it.key === "gear")
        ? `
          <div class="insMeta">
            <div>Tiles: <span class="pill">${it.gearTiles}</span></div>
            <div><span class="pill">Audio Rack</span></div>
          </div>
        `
        : (it.key === "repeatBegin")
          ? `
            <div class="insMeta">
              <div>Begin: <span class="pill">${it.placed}</span></div>
            </div>
          `
          : (it.key === "repeatEnd")
            ? `
              <div class="insMeta">
                <div>End: <span class="pill">${it.placed}</span></div>
              </div>
            `
            : ((it.key==="blank" || it.key==="spooky" || it.key==="festive"))
              ? `
                <div class="insMeta">
                  <div>Count: <span class="pill">${it.placed}</span></div>
                </div>
              `
              : `
                <div class="insMeta">
                  <div><span class="pill">${it.placed || 0}</span></div>
                  <div><span class="pill">${noteBreak}</span></div>
                </div>
              `;

    const card = document.createElement("div");
    card.className = "insCard";
    card.innerHTML = `
      <div class="insIcon">
        ${icon ? `<img src="${icon}" alt="">` : `<div style="opacity:.5;font-weight:900">?</div>`}
      </div>
      <div style="flex:1">
        <div class="insName">${it.name}</div>
        ${metaHtml}
      </div>
    `;
    grid.appendChild(card);
  }
}

let selectionMode = false;

const AUDIO_CONVERT_MAX = 5;
let audioConvertOn = false;
const audioConvertBuf = []; 
const AUDIO_CONVERT_HOLD_MS = 420;
const AUDIO_CONVERT_MOVE_PX = 8;

let _acHold = null;         
let _acHoldTimer = null;

function audioConvertCount(){ return audioConvertBuf.length; }

function audioConvertUpdateUI(){
  try {
    document.body.classList.toggle("ac-on", !!audioConvertOn && selectedNote === state.audioGearID);
    document.body.classList.toggle("ac-full", audioConvertCount() >= AUDIO_CONVERT_MAX);
  } catch {}

  if (!btnAudioConvert) btnAudioConvert = document.getElementById("btnAudioConvert");
  if (!btnAudioConvert) return;

  const on = !!audioConvertOn && selectedNote === state.audioGearID;
  const n = audioConvertCount();
  btnAudioConvert.textContent = on ? `AUDIO CONVERT : ON (${n}/${AUDIO_CONVERT_MAX})` : `AUDIO CONVERT : OFF (${n}/${AUDIO_CONVERT_MAX})`;
  btnAudioConvert.classList.toggle("on", on);
  btnAudioConvert.disabled = (selectedNote !== state.audioGearID);
}

function audioConvertClear(){
  audioConvertBuf.length = 0;
  audioConvertUpdateUI();
}

function noteAllowedInAudioGear(noteId){
  if (!noteId) return false;
  return !!(NOTE_PACK?.gearInfo?.[noteId]?.letter);
}

function audioConvertGearDataFromBuf(){
  const gd = new Uint8Array(AUDIOGEARSPACE * 2);
  const n = Math.min(audioConvertBuf.length, AUDIO_CONVERT_MAX);
  for (let i=0; i<n; i++){
    const it = audioConvertBuf[i];
    gd[i*2] = it.noteId;
    gd[i*2+1] = it.yPos;
  }
  return gd;
}

function audioConvertTryConsumeCell(ax, y){
  if (!audioConvertOn) return false;
  if (selectedNote !== state.audioGearID) return false;
  if (audioConvertCount() >= AUDIO_CONVERT_MAX) return false;
  if (ax < 0 || ax >= state.width || y < 0 || y >= state.height) return false;

  const cell = state.grid[y][ax];
  const noteId = cellId(cell);

  if (!noteId) return false;
  if (noteId === state.audioGearID) return false;

  if (!noteAllowedInAudioGear(noteId)) return false;

  audioConvertBuf.push({ noteId, yPos: y });

  const before = cloneCell(state.grid[y][ax]);
  const after = 0;
  state.grid[y][ax] = after;
  pushHistoryCell(ax, y, before, after);

  refreshMaxX();
  markBaseDirty();
  scheduleAutosave();
  draw();
  audioConvertUpdateUI();
  return true;
}

function audioConvertCancelHold(){
  if (_acHoldTimer) { clearTimeout(_acHoldTimer); _acHoldTimer = null; }
  _acHold = null;
}

function audioConvertArmHold(ax, y, noteId, e){
  audioConvertCancelHold();
  _acHold = { ax, y, noteId, clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId };
  _acHoldTimer = setTimeout(() => {
    const h = _acHold;
    audioConvertCancelHold();
    if (!h) return;
    audioConvertTryConsumeCell(h.ax, h.y);
  }, AUDIO_CONVERT_HOLD_MS);
}

function audioConvertToggle(){
  if (selectedNote !== state.audioGearID){
    audioConvertOn = false;
    audioConvertUpdateUI();
    showStatus("Select Audio (gear) first.", 1200);
    return;
  }
  audioConvertOn = !audioConvertOn;
  audioConvertUpdateUI();
}


let sel = { x1: -1, y1: -1, x2: -1, y2: -1 };
let isSelecting = false;

let selAnchorX = -1;
let selAnchorY = -1;

const SEL_EDGE_PX = 26;          
const SEL_SCROLL_COOLDOWN = 140; 
let _selLastAutoScroll = 0;

let clipData = null;

let pasteArmed = false;
let pastePreviewX = -1; 
let pastePreviewY = -1;
let pasteClipCache = null;

let _statusTimer = null;
function showStatus(msg, ms = 1200) {
  statusEl.textContent = msg;
  clearTimeout(_statusTimer);
  _statusTimer = setTimeout(() => { statusEl.textContent = ""; }, ms);
}

function hasSelection() {
  return sel.x1 !== -1 && sel.y1 !== -1 && sel.x2 !== -1 && sel.y2 !== -1;
}

function clearSelection() {
  sel.x1 = sel.y1 = sel.x2 = sel.y2 = -1;
  selAnchorX = selAnchorY = -1;
  isSelecting = false;
}

function selCorners() {
  const sx = Math.min(sel.x1, sel.x2);
  const ex = Math.max(sel.x1, sel.x2);
  const sy = Math.min(sel.y1, sel.y2);
  const ey = Math.max(sel.y1, sel.y2);
  return { sx, sy, ex, ey, w: ex - sx + 1, h: ey - sy + 1 };
}

function syncBodyClasses() {
  document.body.classList.toggle("sel-on", !!selectionMode);
  document.body.classList.toggle("paste-armed", !!pasteArmed);
  document.body.classList.toggle("ac-on", !!audioConvertOn && selectedNote === state.audioGearID);
  document.body.classList.toggle("ac-full", audioConvertCount() >= AUDIO_CONVERT_MAX);
}

const IS_COARSE_POINTER = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

let _pasteBar = null;
let _pasteRange = null;
let _pastePosText = null;

function selectionAutoPageScrollIfNeeded(e) {
  const now = Date.now();
  if (now - _selLastAutoScroll < SEL_SCROLL_COOLDOWN) return false;

  const rect = cv.getBoundingClientRect();
  const localX = e.clientX - rect.left;

  const maxOffset = Math.max(0, state.width - pageWidth);

  if (localX < SEL_EDGE_PX && songXOffset > 0) {
    songXOffset = clamp(songXOffset - pageWidth, 0, maxOffset);
    _selLastAutoScroll = now;
    markBaseDirty();
    return true;
  }

  if ((rect.width - localX) < SEL_EDGE_PX && songXOffset < maxOffset) {
    songXOffset = clamp(songXOffset + pageWidth, 0, maxOffset);
    _selLastAutoScroll = now;
    markBaseDirty();
    return true;
  }

  return false;
}

window.addEventListener("keydown", (e) => {
  if (!selectionMode) return;

  const ae = document.activeElement;
  const tag = (ae && ae.tagName ? ae.tagName.toLowerCase() : "");
  if (tag === "input" || tag === "textarea" || (ae && ae.isContentEditable)) return;

  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

  if (cmdOrCtrl && e.key.toLowerCase() === "a") {
    e.preventDefault();

    selAnchorX = 0;
    selAnchorY = 0;
    sel.x1 = 0; sel.y1 = 0;
    sel.x2 = state.width - 1;
    sel.y2 = state.height - 1;
    isSelecting = false;

    showStatus("Selected all.", 1200);
    draw();
    return;
  }

  if (cmdOrCtrl && e.key.toLowerCase() === "x") {
    e.preventDefault();
    if (!hasSelection()) {
      showStatus("No selection.");
      return;
    }
    cutSelectionToClipboard();
    return;
  }

  if (e.key === "Escape") {
    if (pasteArmed) {
      cancelPaste();
      return;
    }
    if (hasSelection()) {
      clearSelection();
      showStatus("Selection cleared.", 1000);
      draw();
    }
  }
});


function ensureMobilePasteBar() {
  if (_pasteBar) return;

  const styleId = "mobilePasteBarStyle";
  if (!document.getElementById(styleId)) {
    const st = document.createElement("style");
    st.id = styleId;
    st.textContent = `
      #mobilePasteBar{
        position: fixed;
        left: 10px; right: 10px; bottom: 10px;
        z-index: 120;
        display:none;
        gap:10px;
        flex-wrap:wrap;
        align-items:center;
        justify-content:space-between;
        padding: 10px 12px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.14);
        background:
          radial-gradient(700px 220px at 15% 15%, rgba(120,64,255,.22), transparent 60%),
          radial-gradient(700px 220px at 85% 25%, rgba(0,204,255,.18), transparent 60%),
          rgba(8,10,24,.92);
        box-shadow: 0 18px 70px rgba(0,0,0,.55);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: rgba(240,244,255,.92);
      }
      #mobilePasteBar .mpLeft{
        display:flex;
        flex-direction:column;
        gap:6px;
        min-width: 180px;
        flex: 1;
      }
      #mobilePasteBar .mpTitle{
        font-weight: 900;
        font-size: 12px;
        color: rgba(240,244,255,.92);
        display:flex;
        gap:10px;
        align-items:center;
        justify-content:space-between;
      }
      #mobilePasteBar .mpTitle .mpPos{
        font-family: ui-monospace, Menlo, monospace;
        opacity:.90;
        font-weight:800;
      }
      #mobilePasteBar input[type="range"]{
        width: 100%;
      }
      #mobilePasteBar .mpBtns{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        align-items:center;
        justify-content:flex-end;
      }
      #mobilePasteBar button{
        border-radius: 12px;
        padding: 8px 10px;
        border: 1px solid rgba(255,255,255,.16);
        background:
          radial-gradient(180px 80px at 20% 20%, rgba(120,64,255,.14), transparent 60%),
          radial-gradient(180px 80px at 80% 30%, rgba(0,204,255,.10), transparent 60%),
          rgba(255,255,255,.08);
        color: rgba(240,244,255,.92);
        cursor: pointer;
        font-weight: 900;
        box-shadow: 0 10px 34px rgba(0,0,0,.35);
        transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
      }
      #mobilePasteBar button:active{
        transform: scale(.99);
      }
      #mobilePasteBar button.primary{
        border-color: rgba(0,204,255,.35);
        background:
          radial-gradient(220px 90px at 20% 20%, rgba(0,204,255,.20), transparent 60%),
          radial-gradient(220px 90px at 80% 30%, rgba(120,64,255,.18), transparent 60%),
          rgba(0,204,255,.16);
        color: rgba(240,244,255,.95);
      }
      #mobilePasteBar button.nudge{
        font-family: ui-monospace, Menlo, monospace;
        font-weight: 900;
        min-width: 40px;
      }
    `;
    document.head.appendChild(st);
  }

  _pasteBar = document.createElement("div");
  _pasteBar.id = "mobilePasteBar";

  const left = document.createElement("div");
  left.className = "mpLeft";

  const title = document.createElement("div");
  title.className = "mpTitle";
  title.innerHTML = `<span>Paste position</span>`;
  _pastePosText = document.createElement("span");
  _pastePosText.className = "mpPos";
  _pastePosText.textContent = "—";
  title.appendChild(_pastePosText);

  _pasteRange = document.createElement("input");
  _pasteRange.type = "range";
  _pasteRange.min = "0";
  _pasteRange.max = "0";
  _pasteRange.step = "1";
  _pasteRange.value = "0";

  left.appendChild(title);
  left.appendChild(_pasteRange);

  const btns = document.createElement("div");
  btns.className = "mpBtns";

  const btnUp = document.createElement("button");
  btnUp.type = "button";
  btnUp.className = "nudge";
  btnUp.title = "Move up";
  btnUp.textContent = "▲";

  const btnDown = document.createElement("button");
  btnDown.type = "button";
  btnDown.className = "nudge";
  btnDown.title = "Move down";
  btnDown.textContent = "▼";

  const btnLeft = document.createElement("button");
  btnLeft.type = "button";
  btnLeft.className = "nudge";
  btnLeft.title = "Move left";
  btnLeft.textContent = "◀";

  const btnRight = document.createElement("button");
  btnRight.type = "button";
  btnRight.className = "nudge";
  btnRight.title = "Move right";
  btnRight.textContent = "▶";

  const btnPaste = document.createElement("button");
  btnPaste.type = "button";
  btnPaste.className = "primary";
  btnPaste.textContent = "Paste";

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.textContent = "Cancel";

  btns.appendChild(btnUp);
  btns.appendChild(btnDown);
  btns.appendChild(btnLeft);
  btns.appendChild(btnRight);
  btns.appendChild(btnPaste);
  btns.appendChild(btnCancel);

  _pasteBar.appendChild(left);
  _pasteBar.appendChild(btns);
  document.body.appendChild(_pasteBar);

  function updatePosText(x, y) {
    if (!pasteClipCache) {
      _pastePosText.textContent = "—";
      return;
    }
    const fromX = x + 1;
    const toX = Math.min(x + (pasteClipCache.w || 1), state.width);

    const maxY = Math.max(0, state.height - (pasteClipCache.h || 1));
    const yy = clamp(y, 0, maxY);
    const fromY = yy + 1;
    const toY = Math.min(yy + (pasteClipCache.h || 1), state.height);

    _pastePosText.textContent = `X ${fromX}-${toX}/${state.width} • Y ${fromY}-${toY}/${state.height}`;
  }

  function setPos(newPos) {
    if (!pasteClipCache) return;
    const maxPos = Math.max(0, state.width - (pasteClipCache.w || 1));
    const v = clamp(Number(newPos), 0, maxPos);

    pastePreviewX = v;
    if (_pasteRange) _pasteRange.value = String(v);

    snapViewToPage(v);
    markBaseDirty();
    draw();

    updatePosText(v, (pastePreviewY !== -1 ? pastePreviewY : (pasteClipCache.sy0 ?? 0)));
  }

  function setY(newY) {
    if (!pasteClipCache) return;
    const maxY = Math.max(0, state.height - (pasteClipCache.h || 1));
    const v = clamp(Number(newY), 0, maxY);

    pastePreviewY = v;
    pasteClipCache.sy0 = v;
    markBaseDirty();
    draw();

    updatePosText((pastePreviewX !== -1 ? pastePreviewX : songXOffset), v);
  }

  _pasteRange.addEventListener("input", () => setPos(_pasteRange.value));

  btnLeft.onclick = () => setPos(Number(_pasteRange.value) - 1);
  btnRight.onclick = () => setPos(Number(_pasteRange.value) + 1);

  btnUp.onclick = () => setY((pastePreviewY !== -1 ? pastePreviewY : (pasteClipCache.sy0 ?? 0)) - 1);
  btnDown.onclick = () => setY((pastePreviewY !== -1 ? pastePreviewY : (pasteClipCache.sy0 ?? 0)) + 1);

  btnPaste.onclick = () => {
    if (!pasteArmed || !pasteClipCache) return;
    const x = (pastePreviewX !== -1) ? pastePreviewX : songXOffset;

    const maxY = Math.max(0, state.height - (pasteClipCache.h || 1));
    const yy = clamp((pastePreviewY !== -1 ? pastePreviewY : (pasteClipCache.sy0 ?? 0)), 0, maxY);
    pasteClipCache.sy0 = yy;

    const did = pasteClipAtFixedYWithHistory(x, pasteClipCache);
    setPasteArmed(false, null);
    showStatus(did ? "Pasted!" : "Nothing pasted.");
    markBaseDirty();
    draw();
  };

  btnCancel.onclick = () => {
    cancelPaste();
  };

  _pasteBar._setPos = setPos;
  _pasteBar._setY = setY;
}

function updateMobilePasteBar() {
  if (!IS_COARSE_POINTER) return;
  ensureMobilePasteBar();

  if (!selectionMode || !pasteArmed || !pasteClipCache) {
    _pasteBar.style.display = "none";
    return;
  }

  const maxPos = Math.max(0, state.width - (pasteClipCache.w || 1));
  _pasteRange.max = String(maxPos);

  if (pastePreviewX === -1) {
    pastePreviewX = clamp(songXOffset, 0, maxPos);
  }
  _pasteRange.value = String(pastePreviewX);

  const maxY = Math.max(0, state.height - (pasteClipCache.h || 1));
  if (pastePreviewY === -1) {
    const baseY = Number.isFinite(pasteClipCache.sy0) ? pasteClipCache.sy0 : 0;
    pastePreviewY = clamp(baseY, 0, maxY);
  }
  pasteClipCache.sy0 = clamp(pastePreviewY, 0, maxY);

  _pasteBar.style.display = "flex";

  if (typeof _pasteBar._setPos === "function") {
    _pasteBar._setPos(pastePreviewX);
  }
  if (typeof _pasteBar._setY === "function") {
    _pasteBar._setY(pastePreviewY);
  }
}

function setPasteArmed(on, clip = null) {
  pasteArmed = !!on;
  pasteClipCache = clip;

  if (pasteArmed && pasteClipCache) {
    const maxY = Math.max(0, state.height - (pasteClipCache.h || 1));
    const baseY = Number.isFinite(pasteClipCache.sy0) ? pasteClipCache.sy0 : 0;
    pastePreviewY = clamp(baseY, 0, maxY);
    pasteClipCache.sy0 = pastePreviewY;
  } else {
    pastePreviewY = -1;
  }

  if (IS_COARSE_POINTER && pasteArmed && pasteClipCache) {
    const maxPos = Math.max(0, state.width - (pasteClipCache.w || 1));
    pastePreviewX = clamp(songXOffset, 0, maxPos);
  } else {
    pastePreviewX = -1;
  }

  syncBodyClasses();
  updateMobilePasteBar();
}

function updateSelectionButtons() {
  if (!btnSelToggle) {
    syncBodyClasses();
    return;
  }

  btnSelToggle.textContent = selectionMode ? "SELECTION : ON" : "SELECTION : OFF";

  if (btnSelCopy) btnSelCopy.disabled = !selectionMode;
  if (btnSelPaste) btnSelPaste.disabled = !selectionMode;
  if (btnSelCut) btnSelCut.disabled = !selectionMode;

  if (!selectionMode) {
    clearSelection();
    setPasteArmed(false, null);
  }

  syncBodyClasses();
  draw();
}

let isPainting = false;
let paintButtonRight = false;
let lastPaintKey = "";
let paintChanges = new Map(); 
let paintStarted = false;

function keyXY(x, y) { return `${x},${y}`; }

function cloneCellForClip(cell) {
  const id = (typeof cell === "number") ? cell : cell.id;

  if (id === state.audioGearID && typeof cell !== "number") {
    return {
      gear: true,
      id: cell.id,
      v: cell.volume ?? 100,
      gd: Array.from(cell.gearData ?? new Uint8Array(AUDIOGEARSPACE * 2))
    };
  }
  return id;
}

function cloneCellFromClip(v) {
  if (typeof v === "number") return v;

  if (v && v.gear) {
    return {
      id: state.audioGearID,
      volume: clamp(Number(v.v ?? 100), 1, 100),
      gearData: new Uint8Array(v.gd ?? new Array(AUDIOGEARSPACE * 2).fill(0)),
    };
  }
  return 0;
}

async function copySelectionToClipboard() {
  if (!selectionMode) {
    showStatus("Selection mode OFF.");
    return;
  }
  if (!hasSelection()) {
    showStatus("No selection.");
    return;
  }

  const { sx, sy, ex, ey, w, h } = selCorners();
  const cells = [];
  for (let y = sy; y <= ey; y++) {
    const row = [];
    for (let x = sx; x <= ex; x++) {
      row.push(cloneCellForClip(state.grid[y][x]));
    }
    cells.push(row);
  }

  clipData = { ver: 1, w, h, cells, sy0: sy };

  const text = "GMSFCLIP1:" + JSON.stringify(clipData);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    }
  } catch {}

  clearSelection();
  setPasteArmed(true, clipData);
  showStatus(`Copied ${w}x${h} - Click to paste`, 1600);
  draw();
}


async function cutSelectionToClipboard() {
  if (!selectionMode) {
    showStatus("Selection mode OFF.");
    return;
  }
  if (!hasSelection()) {
    showStatus("No selection.");
    return;
  }

  const { sx, sy, ex, ey, w, h } = selCorners();
  const cells = [];
  for (let y = sy; y <= ey; y++) {
    const row = [];
    for (let x = sx; x <= ex; x++) {
      row.push(cloneCellForClip(state.grid[y][x]));
    }
    cells.push(row);
  }

  clipData = { ver: 1, w, h, cells, sy0: sy };

  const text = "GMSFCLIP1:" + JSON.stringify(clipData);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    }
  } catch {}

  const changes = [];
  for (let y = sy; y <= ey; y++) {
    for (let x = sx; x <= ex; x++) {
      const before = cloneCell(state.grid[y][x]);
      const after = 0;
      if (!cellsEqual(before, after)) {
        state.grid[y][x] = 0;
        changes.push({ x, y, before, after });
      }
    }
  }

  if (changes.length) {
    pushHistoryMulti(changes);
    markBaseDirty();
    refreshMaxX();
  }

  clearSelection();
  setPasteArmed(true, clipData);

  showStatus(changes.length ? `Cut ${w}x${h} - Click to paste` : "Nothing cut.", 1600);
  draw();
}

async function readClipFromSystemIfNeeded() {
  if (clipData) return clipData;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      const t = await navigator.clipboard.readText();
      if (t && t.startsWith("GMSFCLIP1:")) {
        clipData = JSON.parse(t.slice("GMSFCLIP1:".length));
        return clipData;
      }
    }
  } catch {}
  return null;
}

async function armPaste() {
  if (!selectionMode) {
    showStatus("Selection mode OFF.");
    return;
  }
  const clip = await readClipFromSystemIfNeeded();
  if (!clip) {
    showStatus("Clipboard empty.");
    return;
  }
  setPasteArmed(true, clip);
  showStatus("Paste armed: point & click to paste. (ESC cancel)");
  draw();
}

function cancelPaste() {
  setPasteArmed(false, null);
  showStatus("Paste canceled.");
  draw();
}

function makeEmptyState(width, height) {
  return {
    ver: 1,
    audioGearID: NOTE_PACK.audioGearID,
    bpm: 100,
    width,
    height,
    metadata: "",
    grid: Array.from({ length: height }, () => Array(width).fill(0)),
  };
}


function normalizeSongWidth(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return state.width;
  return clamp(Math.floor(v), SONG_WIDTH_MIN, SONG_WIDTH_MAX);
}

function resizeSongWidth(newWidth) {
  const target = normalizeSongWidth(newWidth);
  if (target === state.width) return;

  const oldW = state.width;
  const oldGrid = state.grid;

  const newGrid = Array.from({ length: state.height }, (_, y) => {
    const row = oldGrid[y] || [];
    if (target > oldW) {
      const extra = Array(target - oldW).fill(0);
      return row.concat(extra);
    }
    return row.slice(0, target);
  });

  state.width = target;
  state.grid = newGrid;

  repeatUsed = Array.from({ length: state.height }, () => Array(state.width).fill(false));

  setSongXOffset(songXOffset);

  try { clearSelection(); } catch {}
  try { setPasteArmed(false, null); } catch {}
  undoStack.length = 0;
  redoStack.length = 0;

  localStorage.setItem(PREF_SONG_WIDTH_KEY, String(state.width));

  refreshMaxX();
  if (inpSongWidth) inpSongWidth.value = String(state.width);
  showStatus(`Length set to ${state.width}`);
  draw();
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

let _kmModalLockCount = 0;
let _kmPrevOverflow = null;

function kmEnsureGlobalModalLockStyles(){
  const id = "km-global-modal-lock-style";
  if (document.getElementById(id)) return;
  const st = document.createElement("style");
  st.id = id;
  st.textContent = `
    html.km-modal-open, body.km-modal-open{
      overflow: hidden !important;
      height: 100%;
    }

    .km-overlay, #statsBack, #modalBack{
      overscroll-behavior: contain;
    }
    .km-body, #statsModal{
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
  `;
  document.head.appendChild(st);
}

function kmModalLock(){
  kmEnsureGlobalModalLockStyles();
  if (_kmModalLockCount === 0){
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const scrollX = window.scrollX || window.pageXOffset || 0;

    _kmPrevOverflow = {
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
      pos: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      paddingRight: document.body.style.paddingRight,
      scrollY,
      scrollX,
    };

    const scrollbarW = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    if (scrollbarW > 0){
      const curPad = parseFloat(getComputedStyle(document.body).paddingRight || "0") || 0;
      document.body.style.paddingRight = `${curPad + scrollbarW}px`;
    }

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    document.documentElement.classList.add("km-modal-open");
    document.body.classList.add("km-modal-open");
  }
  _kmModalLockCount++;
}

function kmModalUnlock(){
  if (_kmModalLockCount <= 0) return;
  _kmModalLockCount--;
  if (_kmModalLockCount === 0){
    const prev = _kmPrevOverflow || {
      html: "", body: "", pos: "", top: "", left: "", right: "", width: "", paddingRight: "",
      scrollY: 0, scrollX: 0
    };

    document.documentElement.style.overflow = prev.html;
    document.body.style.overflow = prev.body;

    document.body.style.position = prev.pos;
    document.body.style.top = prev.top;
    document.body.style.left = prev.left;
    document.body.style.right = prev.right;
    document.body.style.width = prev.width;
    document.body.style.paddingRight = prev.paddingRight;

    document.documentElement.classList.remove("km-modal-open");
    document.body.classList.remove("km-modal-open");

    try { window.scrollTo(prev.scrollX || 0, prev.scrollY || 0); } catch(e){}

    _kmPrevOverflow = null;
  }
}


function setSongXOffset(x) {
  const maxOff = Math.max(0, state.width - pageWidth);
  const newOff = clamp(x, 0, maxOff);
  if (newOff !== songXOffset) {
    songXOffset = newOff;
    markBaseDirty();
  }
}


function pageStartFromOffset(off) {
  return Math.floor(off / pageWidth) * pageWidth;
}

function cellId(cell) {
  return (typeof cell === "number") ? cell : cell.id;
}

function columnHasAnyNote(x) {
  for (let y = 0; y < state.height; y++) {
    if (cellId(state.grid[y][x]) !== 0) return true;
  }
  return false;
}

function findMaxX() {
  for (let x = state.width - 1; x >= 0; x--) {
    if (columnHasAnyNote(x)) return x;
  }
  return 0;
}

function refreshMaxX() {
  maxX = findMaxX();
}

function resetRepeatNotes(fromX, toX) {
  fromX = clamp(fromX, 0, state.width - 1);
  toX = clamp(toX, 0, state.width - 1);
  for (let y = 0; y < state.height; y++) {
    for (let x = fromX; x <= toX; x++) repeatUsed[y][x] = false;
  }
}
function resetPlayState() {
  resetRepeatNotes(0, state.width - 1);
}

function bpmMs(bpm) { return 15000 / bpm; }

function getCanvasTileFromEvent(e, canvas, cols, rows, tileSize, labelWidth = 0) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;

  if (cx < labelWidth) return null;

  const x = Math.floor((cx - labelWidth) / tileSize);
  const y = Math.floor(cy / tileSize);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x >= cols || y < 0 || y >= rows) return null;

  return { x, y };
}


function resizeGearCanvas() {
  gearCanvas.width = AUDIOGEARSPACE * GEAR_TILE;
  gearCanvas.height = state.height * GEAR_TILE;
}

function resizeMainCanvas() {
  cv.width = LABEL_WIDTH + (pageWidth * TILE);
  cv.height = (state.height + 1) * TILE;
  markBaseDirty();
  requestDraw();
}

function applyZoom(on) {
  if (playing) {
    showStatus("Stop before toggling zoom.");
    return;
  }

  zoomOn = !!on;
  pageWidth = zoomOn ? VIEW_COLS_ZOOM : VIEW_COLS_NORMAL;
  TILE = zoomOn ? TILE_ZOOM : TILE_NORMAL;

  if (btnZoom) btnZoom.textContent = zoomOn ? "Zoom: ON" : "Zoom: OFF";

  setSongXOffset(pageStartFromOffset(songXOffset));

  resizeMainCanvas();
  showStatus(zoomOn ? "Zoom ON (10 cols)" : "Zoom OFF (25 cols)");
  draw();
}

const PUBLIC_BASE = new URL("./", window.location.href);     
const ASSET_BASE  = new URL("../assets/", PUBLIC_BASE);      

function assetUrl(p) {
  if (!p) return p;

  if (/^(https?:|data:|blob:)/i.test(p)) return p;

  p = String(p).trim();

  p = p.replace(/^\/+/, "");

  if (p.startsWith("../assets/")) {
    p = "assets/" + p.slice("../assets/".length);
  }

  if (p.startsWith("assets/")) {
    return new URL(p.slice("assets/".length), ASSET_BASE).toString();
  }

  return new URL(p, PUBLIC_BASE).toString();
}

async function loadImg(path) {
  if (imgCache.has(path)) return imgCache.get(path);

  const p = new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      imgReady.set(path, img);  
      markBaseDirty();
      requestDraw();
      res(img);
    };
    img.onerror = (e) => rej(e);
    img.src = assetUrl(path);
  });

  imgCache.set(path, p);
  return p;
}

async function getBuf(path) {
  if (!path) return null;
  if (bufCache.has(path)) return bufCache.get(path);

  const p = (async () => {
    try {
      const url = assetUrl(path);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
      const arr = await resp.arrayBuffer();
      const buf = await audioCtx.decodeAudioData(arr.slice(0));
      return buf;
    } catch (err) {
      console.warn("Sound load/decode failed:", path, err);
      showStatus(`Sound fail: ${String(path).split("/").pop()}`, 2000);
      return null;
    }
  })();

  bufCache.set(path, p);
  return p;
}


function playSample(path, vol01) {
  getBuf(path).then(buf => {
    if(!buf) return;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const gain = audioCtx.createGain();
    gain.gain.value = vol01;
    src.connect(gain).connect(fx.input);
    src.start();
  });
}

let _wavExportBusy = false;

function _cloneRepeatUsedEmpty() {
  return Array.from({ length: state.height }, () => Array(state.width).fill(false));
}

function _resetRepeatNotesLocal(rep, fromX, toX) {
  fromX = clamp(fromX, 0, state.width - 1);
  toX = clamp(toX, 0, state.width - 1);
  for (let y = 0; y < state.height; y++) {
    for (let x = fromX; x <= toX; x++) rep[y][x] = false;
  }
}

function _collectColumnEventsForExport(absX, repUsed, tSec, outEvents, masterVol01) {
  if (absX < 0 || absX >= state.width) return null;

  let repeatRowY = null;

  for (let y = 0; y < state.height; y++) {
    const cell = state.grid[y][absX];
    const id = cellId(cell);
    if (id === 0) continue;

    if (id === NOTE_PACK.repeatEndID) {
      if (!repUsed[y][absX] && repeatRowY === null) repeatRowY = y;
      continue;
    }

    if (id === state.audioGearID && typeof cell !== "number") {
      const gd = cell.gearData;
      const gearVol01 = ((cell.volume ?? 100) / 100) * masterVol01;
      for (let i = 0; i < AUDIOGEARSPACE; i++) {
        const noteId = gd[i * 2];
        const yPos = gd[i * 2 + 1];
        if (noteId !== 0) {
          const p = NOTE_PACK.notes[noteId]?.sounds?.[yPos];
          if (p) outEvents.push({ path: p, time: tSec, vol01: gearVol01 });
        }
      }
      continue;
    }

    const p = NOTE_PACK.notes[id]?.sounds?.[y];
    if (p) outEvents.push({ path: p, time: tSec, vol01: masterVol01 });
  }

  if (repeatRowY !== null) {
    repUsed[repeatRowY][absX] = true;

    for (let sx = absX - 1; sx >= 0; sx--) {
      const sid = cellId(state.grid[repeatRowY][sx]);
      if (sid === NOTE_PACK.repeatStartID) {
        _resetRepeatNotesLocal(repUsed, sx + 1, absX - 1);
        return sx;
      }
    }
    return 0;
  }

  return null;
}



function _buildPlaybackScheduleOnePass(startX) {
  const bpm = clamp(Number(state.bpm || 100), 1, 32766);
  const stepSec = (bpmMs(bpm) / 1000);
  const masterVol01 = clamp(Number(inpVol?.value ?? 30) / 100, 0, 1);

  const repUsed = _cloneRepeatUsedEmpty();
  const events = [];

  let pos = clamp(Number(startX || 0), 0, state.width - 1);
  let tSec = 0;

  const hardLimit = Math.max(5000, (state.width * 6));
  let steps = 0;

  while (pos <= maxX && steps++ < hardLimit) {
    const jumpTo = _collectColumnEventsForExport(pos, repUsed, tSec, events, masterVol01);
    pos = (typeof jumpTo === "number") ? jumpTo : (pos + 1);
    tSec += stepSec;
  }

  return {
    events,
    durationSec: tSec,
    stepSec,
  };
}

function _createFxGraphForOffline(ctx) {
  const fx2 = {
    input: ctx.createGain(),

    eqSubBass:  ctx.createBiquadFilter(),
    eqBass:     ctx.createBiquadFilter(),
    eqLowMid:   ctx.createBiquadFilter(),
    eqMid:      ctx.createBiquadFilter(),
    eqHighMid:  ctx.createBiquadFilter(),
    eqPresence: ctx.createBiquadFilter(),
    eqHigh:     ctx.createBiquadFilter(),
    eqTreble:   ctx.createBiquadFilter(),

    satPre: ctx.createGain(),
    sat: ctx.createWaveShaper(),
    satPost: ctx.createGain(),

    comp: ctx.createDynamicsCompressor(),

    reverb: ctx.createConvolver(),
    wet: ctx.createGain(),
    dry: ctx.createGain(),

    master: ctx.createGain(),
  };

  fx2.eqSubBass.type  = fx.eqSubBass.type;  fx2.eqSubBass.frequency.value  = fx.eqSubBass.frequency.value;
  fx2.eqBass.type     = fx.eqBass.type;     fx2.eqBass.frequency.value     = fx.eqBass.frequency.value;     fx2.eqBass.Q.value     = fx.eqBass.Q.value;
  fx2.eqLowMid.type   = fx.eqLowMid.type;   fx2.eqLowMid.frequency.value   = fx.eqLowMid.frequency.value;   fx2.eqLowMid.Q.value   = fx.eqLowMid.Q.value;
  fx2.eqMid.type      = fx.eqMid.type;      fx2.eqMid.frequency.value      = fx.eqMid.frequency.value;      fx2.eqMid.Q.value      = fx.eqMid.Q.value;
  fx2.eqHighMid.type  = fx.eqHighMid.type;  fx2.eqHighMid.frequency.value  = fx.eqHighMid.frequency.value;  fx2.eqHighMid.Q.value  = fx.eqHighMid.Q.value;
  fx2.eqPresence.type = fx.eqPresence.type; fx2.eqPresence.frequency.value = fx.eqPresence.frequency.value; fx2.eqPresence.Q.value = fx.eqPresence.Q.value;
  fx2.eqHigh.type     = fx.eqHigh.type;     fx2.eqHigh.frequency.value     = fx.eqHigh.frequency.value;     fx2.eqHigh.Q.value     = fx.eqHigh.Q.value;
  fx2.eqTreble.type   = fx.eqTreble.type;   fx2.eqTreble.frequency.value   = fx.eqTreble.frequency.value;

  fx2.eqSubBass.gain.value  = fx.eqSubBass.gain.value;
  fx2.eqBass.gain.value     = fx.eqBass.gain.value;
  fx2.eqLowMid.gain.value   = fx.eqLowMid.gain.value;
  fx2.eqMid.gain.value      = fx.eqMid.gain.value;
  fx2.eqHighMid.gain.value  = fx.eqHighMid.gain.value;
  fx2.eqPresence.gain.value = fx.eqPresence.gain.value;
  fx2.eqHigh.gain.value     = fx.eqHigh.gain.value;
  fx2.eqTreble.gain.value   = fx.eqTreble.gain.value;

  fx2.satPre.gain.value = fx.satPre.gain.value;
  fx2.sat.curve = fx.sat.curve;
  fx2.sat.oversample = fx.sat.oversample;
  fx2.satPost.gain.value = fx.satPost.gain.value;

  fx2.comp.threshold.value = fx.comp.threshold.value;
  fx2.comp.knee.value = fx.comp.knee.value;
  fx2.comp.ratio.value = fx.comp.ratio.value;
  fx2.comp.attack.value = fx.comp.attack.value;
  fx2.comp.release.value = fx.comp.release.value;

  fx2.wet.gain.value = fx.wet.gain.value;
  fx2.dry.gain.value = fx.dry.gain.value;
  fx2.reverb.buffer = fx.reverb.buffer;

  fx2.master.gain.value = fx.master.gain.value;

  fx2.input.connect(fx2.eqSubBass);
  fx2.eqSubBass.connect(fx2.eqBass);
  fx2.eqBass.connect(fx2.eqLowMid);
  fx2.eqLowMid.connect(fx2.eqMid);
  fx2.eqMid.connect(fx2.eqHighMid);
  fx2.eqHighMid.connect(fx2.eqPresence);
  fx2.eqPresence.connect(fx2.eqHigh);
  fx2.eqHigh.connect(fx2.eqTreble);

  fx2.eqTreble.connect(fx2.satPre);
  fx2.satPre.connect(fx2.sat);
  fx2.sat.connect(fx2.satPost);
  fx2.satPost.connect(fx2.comp);

  fx2.comp.connect(fx2.dry);
  fx2.dry.connect(fx2.master);

  fx2.comp.connect(fx2.reverb);
  fx2.reverb.connect(fx2.wet);
  fx2.wet.connect(fx2.master);

  fx2.master.connect(ctx.destination);

  return fx2;
}

async function _audioBufferToWavBlob(buffer, onProgress) {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;

  const chData = [];
  for (let ch = 0; ch < numCh; ch++) chData.push(buffer.getChannelData(ch));
  const interleaved = new Float32Array(length * numCh);
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numCh; ch++) interleaved[i * numCh + ch] = chData[ch][i];
  }

  const pcm16 = new Int16Array(interleaved.length);
  const total = interleaved.length;
  const chunk = 32768;
  let i = 0;

  while (i < total) {
    const end = Math.min(total, i + chunk);
    for (; i < end; i++) {
      let s = Math.max(-1, Math.min(1, interleaved[i]));
      pcm16[i] = (s < 0) ? (s * 0x8000) : (s * 0x7FFF);
    }
    if (onProgress) onProgress(i / total);
    await new Promise(r => setTimeout(r, 0)); 
  }

  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16.length * bytesPerSample;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  let off = 0;
  const writeStr = (s) => { for (let k = 0; k < s.length; k++) view.setUint8(off++, s.charCodeAt(k)); };
  const writeU16 = (v) => { view.setUint16(off, v, true); off += 2; };
  const writeU32 = (v) => { view.setUint32(off, v, true); off += 4; };

  writeStr("RIFF"); writeU32(36 + dataSize); writeStr("WAVE");
  writeStr("fmt "); writeU32(16); writeU16(1); writeU16(numCh);
  writeU32(sampleRate); writeU32(byteRate); writeU16(blockAlign); writeU16(16);
  writeStr("data"); writeU32(dataSize);

  return new Blob([header, pcm16.buffer], { type: "audio/wav" });
}


function _downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1200);
}

function _safeFileName(s) {
  return String(s || "export")
    .trim()
    .replace(/[\\/:*?\"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "export";
}

async function exportWavCurrentSongOnePass() {
  if (_wavExportBusy) {
    showStatus("WAV export is already running…", 1800);
    return;
  }
  if (playing) {
    showStatus("Stop playback before exporting WAV.", 2000);
    return;
  }

  try { await audioCtx.resume(); } catch {}

  _wavExportBusy = true;
  wavProgressShow("Exporting WAV…", "Preparing…");
  try {
    refreshMaxX();
    const startX = findFirstNonEmptyX();

    const { events, durationSec } = _buildPlaybackScheduleOnePass(startX);
    if (!events.length) {
      wavProgressHide();
      showStatus("No notes to export.", 1800);
      return;
    }

    const tailSec = 2.0;
    const totalSec = durationSec + tailSec;

    if (totalSec > 600) {
      wavProgressHide();
      const ok = confirm(`This export is about ${Math.round(totalSec)} seconds (~${Math.round(totalSec/60)} min).\nIt may be heavy on low-end devices. Continue?`);
      if (!ok) return;
      wavProgressShow("Exporting WAV…", "Preparing…");
    }

    const uniq = [...new Set(events.map(e => e.path))];
    let loaded = 0;
    const total = Math.max(1, uniq.length);

    wavProgressSet(`Loading samples… (${loaded}/${total})`, 0);

    for (const p of uniq) {
      await getBuf(p); 
      loaded++;

      const pct = (loaded / total) * 35;
      wavProgressSet(`Loading samples… (${loaded}/${total})`, pct);
    }

    const sampleRate =
      (fx && fx.reverb && fx.reverb.buffer && fx.reverb.buffer.sampleRate) ||
      (audioCtx && audioCtx.sampleRate) ||
      44100;

    const frames = Math.max(1, Math.ceil(totalSec * sampleRate));

    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) throw new Error("OfflineAudioContext is not supported in this browser.");

    wavProgressSet("Rendering audio… (please wait estimated 5min)", null); 

    const offline = new OAC(2, frames, sampleRate);
    const fx2 = _createFxGraphForOffline(offline);

    for (const e of events) {
      const buf = await getBuf(e.path);
      if (!buf) continue;
      const src = offline.createBufferSource();
      src.buffer = buf;
      const g = offline.createGain();
      g.gain.value = clamp(Number(e.vol01 ?? 1), 0, 1.5);
      src.connect(g).connect(fx2.input);
      src.start(Math.max(0, Number(e.time || 0)));
    }

    const rendered = await offline.startRendering();

    wavProgressSet("Encoding WAV… 0%", 35);

    const wavBlob = await _audioBufferToWavBlob(rendered, (p) => {
      const pct = 35 + (p * 60); 
      wavProgressSet(`Encoding WAV… ${Math.floor(p * 100)}%`, pct);
    });

    wavProgressSet("Finishing…", 98);

    const name = _safeFileName(lastProjectBaseName || state.metadata || "gmsf-song");
    _downloadBlob(wavBlob, `${name}.wav`);

    wavProgressSet("Done ✅", 100);
    setTimeout(() => wavProgressHide(), 500);

    showStatus("WAV exported ✅", 2200);
  } catch (err) {
    wavProgressHide();
    alert("WAV export failed: " + (err?.message || err));
    throw err;
  } finally {
    _wavExportBusy = false;
  }
}


const imgReady = new Map(); 

async function preloadAllImages(){
  const paths = new Set();
  for (const id in NOTE_PACK.notes){
    const p = NOTE_PACK.notes[id]?.image;
    if (p) paths.add(p);                
  }
  await Promise.all([...paths].map(p => new Promise((res) => {
    const im = new Image();
    im.onload = () => { imgReady.set(p, im); res(); };
    im.onerror = () => res();
    im.src = assetUrl(p);  
  })));
}


async function previewPlacedNote(noteId, rowY) {
  if (noteId === 0) return;
  if (noteId === state.audioGearID) return;

  const path = NOTE_PACK.notes[noteId]?.sounds?.[rowY];
  if (!path) return;

  await audioCtx.resume();
  playSample(path, Number(inpVol.value) / 100);
}

let _viewAnim = null;

function _easeOutCubic(t) {
  t = clamp(Number(t) || 0, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function _ensureViewAnimStyle() {
  if (document.getElementById("km-view-anim-style")) return;
  const st = document.createElement("style");
  st.id = "km-view-anim-style";
  st.textContent = `
    body.view-anim canvas{
      filter:
        drop-shadow(0 0 14px rgba(0,200,255,.18))
        drop-shadow(0 0 26px rgba(120,64,255,.12));
    }
  `;
  document.head.appendChild(st);
}

function cancelViewTransition() {
  if (_viewAnim && _viewAnim.raf) cancelAnimationFrame(_viewAnim.raf);
  _viewAnim = null;
  document.body.classList.remove("view-anim");
}

function animateSongXOffsetTo(targetOffset, opts = {}) {
  const maxOff = Math.max(0, state.width - pageWidth);
  const to = clamp(Math.round(Number(targetOffset) || 0), 0, maxOff);
  const from = songXOffset;

  if (to === from) return;
  if (_viewAnim && _viewAnim.to === to) return;

  cancelViewTransition();
  _ensureViewAnimStyle();
  document.body.classList.add("view-anim");

  const start = performance.now();
  const duration = clamp(Number(opts.duration ?? 360), 80, 1200);
  const maxStep = clamp(Number(opts.maxStep ?? 1), 1, 12);

  _viewAnim = { from, to, start, duration, raf: 0 };

  const step = (now) => {
    if (!_viewAnim) return;

    const t = (now - start) / duration;
    const k = _easeOutCubic(t);
    const desired = from + (to - from) * k;

    const desiredInt = clamp(Math.round(desired), 0, maxOff);
    let next = desiredInt;

    if (next > songXOffset) next = Math.min(songXOffset + maxStep, next);
    else if (next < songXOffset) next = Math.max(songXOffset - maxStep, next);

    setSongXOffset(next);
    draw();

    if (t >= 1) {
      setSongXOffset(to);
      draw();
      cancelViewTransition();
      return;
    }

    _viewAnim.raf = requestAnimationFrame(step);
  };

  _viewAnim.raf = requestAnimationFrame(step);
}

function pageLeft() {
  if (playing) return;

  const maxOff = Math.max(0, state.width - pageWidth);

  let target;
  if (songXOffset % pageWidth !== 0) {
    target = Math.floor(songXOffset / pageWidth) * pageWidth;
  } else {
    target = (songXOffset < pageWidth) ? maxOff : (songXOffset - pageWidth);
  }

  updateTransportUI();
  animateSongXOffsetTo(target, { duration: 360 });
}

function pageRight() {
  if (playing) return;

  const maxOff = Math.max(0, state.width - pageWidth);

  let target;
  if (songXOffset + pageWidth > maxOff) {
    target = (songXOffset !== maxOff) ? maxOff : 0;
  } else {
    target = songXOffset + pageWidth;
  }

  updateTransportUI();
  animateSongXOffsetTo(target, { duration: 360 });
}

function snapViewToPage(absPos) {
  const maxOff = Math.max(0, state.width - pageWidth);
  const pageStart = clamp(Math.floor(absPos / pageWidth) * pageWidth, 0, maxOff);
  if (pageStart !== songXOffset) setSongXOffset(pageStart);
}

function snapViewToPageSmooth(absPos, opts = {}) {
  const maxOff = Math.max(0, state.width - pageWidth);
  const pageStart = clamp(Math.floor(absPos / pageWidth) * pageWidth, 0, maxOff);
  if (pageStart === songXOffset) return;
  if (_viewAnim && _viewAnim.to === pageStart) return;

  const duration = Number(opts.duration ?? 220);
  const maxStep = Number(opts.maxStep ?? 5); 
  animateSongXOffsetTo(pageStart, { duration, maxStep });
}

async function playColumn(absX) {
  if (absX < 0 || absX >= state.width) return null;

  let repeatRowY = null;

  for (let y = 0; y < state.height; y++) {
    const cell = state.grid[y][absX];
    const id = cellId(cell);
    if (id === 0) continue;

    if (id === NOTE_PACK.repeatEndID) {
      if (!repeatUsed[y][absX] && repeatRowY === null) {
        repeatRowY = y;
      }
      continue;
    }

    if (id === state.audioGearID && typeof cell !== "number") {
      const gd = cell.gearData;
      const gearVol01 = ((cell.volume ?? 100) / 100) * (Number(inpVol.value) / 100);
      for (let i = 0; i < AUDIOGEARSPACE; i++) {
        const noteId = gd[i * 2];
        const yPos = gd[i * 2 + 1];
        if (noteId !== 0) {
          const p = NOTE_PACK.notes[noteId]?.sounds?.[yPos];
          if (p) playSample(p, gearVol01);
        }
      }
      continue;
    }

    const p = NOTE_PACK.notes[id]?.sounds?.[y];
    if (p) playSample(p, Number(inpVol.value) / 100);
  }

  if (repeatRowY !== null) {
    repeatUsed[repeatRowY][absX] = true; 

    for (let sx = absX - 1; sx >= 0; sx--) {
      const sid = cellId(state.grid[repeatRowY][sx]);
      if (sid === NOTE_PACK.repeatStartID) {

        resetRepeatNotes(sx + 1, absX - 1);
        return sx;
      }
    }

    resetPlayState();
    return 0;
  }

  return null;
}

async function tick() {
  if (_tickBusy) return;
  _tickBusy = true;
  try {
      if (playPos > maxX) {
        resetPlayState();
        playPos = playStartX || 0;
        currentPlayPosition = playPos;
        setSongXOffset(pageStartFromOffset(playPos));
      }


    const col = playPos;
    currentPlayPosition = col;

    const jumpTo = await playColumn(col);

    if (typeof jumpTo === "number") playPos = jumpTo;
    else playPos = col + 1;

    snapViewToPageSmooth(col, { duration: 220, maxStep: 6 });
    draw();
  } finally {
    _tickBusy = false;
  }
}


function updateTransportUI() {
  if (playing) {
    btnPlay.textContent = "Stop";
    btnPause.disabled = false;
    btnPause.textContent = "Pause";
  } else if (paused) {
    btnPlay.textContent = "Play";
    btnPause.disabled = false;
    btnPause.textContent = "Resume";
  } else {
    btnPlay.textContent = "Play";
    if (songXOffset > 0) {
      btnPause.disabled = false;
      btnPause.textContent = "Resume";
    } else {
      btnPause.disabled = true;
      btnPause.textContent = "Pause";
    }
  }
}

async function startFromFirstNote() {
  resetPlayState();

  const startX = findFirstNonEmptyX();
  playStartX = startX;

  playPos = startX;
  currentPlayPosition = startX;

  setSongXOffset(pageStartFromOffset(startX));

  paused = false;
  playing = true;

  clearInterval(timer);
  timer = null;

  updateTransportUI();
  draw();

  await tick();

  if (!playing) return;

  clearInterval(timer);
  timer = setInterval(tick, bpmMs(state.bpm));

  updateTransportUI();
  draw();
}


async function startFromBeginning() {
  resetPlayState();
  setSongXOffset(0);

  playStartX = 0;
  playPos = 0;
  currentPlayPosition = 0;

  paused = false;
  playing = true;

  clearInterval(timer);
  timer = null;

  updateTransportUI();
  draw();

  await tick();

  if (!playing) return;

  clearInterval(timer);
  timer = setInterval(tick, bpmMs(state.bpm));

  updateTransportUI();
  draw();
}


function stopPlayback() {
  clearInterval(timer);
  timer = null;

  playing = false;
  paused = false;

  updateTransportUI();
  draw();
}

function pausePlayback() {
  if (!playing) return;

  clearInterval(timer);
  timer = null;

  playing = false;
  paused = true;

  updateTransportUI();
  draw();
}

async function startFromCurrentView() {
  const start = pageStartFromOffset(songXOffset);

  resetPlayState();
  playStartX = start;

  playPos = start;
  currentPlayPosition = start;
  setSongXOffset(start);

  paused = false;
  playing = true;

  clearInterval(timer);
  timer = null;

  updateTransportUI();
  draw();

  await tick();

  if (!playing) return;

  clearInterval(timer);
  timer = setInterval(tick, bpmMs(state.bpm));

  updateTransportUI();
  draw();
}


async function resumeFromCurrentView() {
  if (!paused) return;

  const maxOffset = Math.max(0, state.width - pageWidth);
  const viewStart = clamp(Math.floor(songXOffset / pageWidth) * pageWidth, 0, maxOffset);

  playPos = clamp(viewStart, 0, state.width - 1);
  currentPlayPosition = playPos;

  setSongXOffset(viewStart);

  paused = false;
  playing = true;

  clearInterval(timer);
  timer = null;

  updateTransportUI();
  draw();

  await tick();

  if (!playing) return;

  clearInterval(timer);
  timer = setInterval(tick, bpmMs(state.bpm));

  updateTransportUI();
  draw();
}


function uint8ToBase64(u8) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(s);
}
function base64ToUint8(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

const AUTOSAVE_KEY = "gmsf_autosave_v1";
const AUTOSAVE_META_KEY = "gmsf_autosave_meta_v1";
let autosaveTimer = null;

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      const bytes = writeGmsfV1(state);
      localStorage.setItem(AUTOSAVE_KEY, uint8ToBase64(bytes));
      localStorage.setItem(AUTOSAVE_META_KEY, JSON.stringify({
        t: Date.now(),
        w: state.width,
        h: state.height,
        bpm: state.bpm
      }));
    } catch {}
  }, 300);
}


async function kmAutosavePrompt(meta) {
  if (typeof kmEnsureMidiModalStyles === "function") kmEnsureMidiModalStyles();

  try { if (typeof resizeMainCanvas === "function") resizeMainCanvas(); } catch {}
  try { markBaseDirty(); } catch {}
  try { draw(); } catch {}

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  try { draw(); } catch {}

  kmModalLock();

  const when = meta?.t ? new Date(meta.t) : null;
  const whenText = when ? when.toLocaleString() : "unknown time";
  const sizeText = (meta && meta.w && meta.h) ? `${meta.w}×${meta.h}` : "unknown size";
  const bpmText  = (meta && meta.bpm) ? String(meta.bpm) : "unknown";

  return await new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "km-overlay";

    overlay.innerHTML = `
      <div class="km-modal" role="dialog" aria-modal="true" style="width:min(720px, 100%);">
        <div class="km-head">
          <div class="km-title">
            <div>Autosave detected</div>
            <small>A local autosave was found. Restore it?</small>
          </div>
          <button class="km-x" id="kmAutoClose" title="Close">✕</button>
        </div>

        <div class="km-body">
          <div class="km-card">
            <h4>Autosave details</h4>
            <div style="display:grid; gap:8px; font-size:13px; opacity:.88;">
              <div><b>Saved:</b> ${whenText}</div>
              <div><b>Grid:</b> ${sizeText}</div>
              <div><b>BPM:</b> ${bpmText}</div>
            </div>

            <div class="km-footnote" style="margin-top:12px;">
              Restoring will overwrite the current canvas. You can also discard the autosave to stop seeing this prompt.
            </div>
          </div>
        </div>

        <div class="km-actions" style="justify-content:space-between;">
          <button class="km-btn km-btn-danger" id="kmAutoDiscard">Discard autosave</button>
          <div style="display:flex; gap:10px;">
            <button class="km-btn" id="kmAutoKeep">Keep current</button>
            <button class="km-btn km-btn-primary" id="kmAutoRestore">Restore</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    function cleanup(result) {
      document.removeEventListener("keydown", onKey);
      try { overlay.remove(); } catch {}
      kmModalUnlock();
      resolve(result);
    }

    function onKey(e) {
      if (e.key === "Escape") cleanup("keep");
    }
    document.addEventListener("keydown", onKey);

    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) cleanup("keep");
    });

    overlay.querySelector("#kmAutoClose").onclick = () => cleanup("keep");
    overlay.querySelector("#kmAutoKeep").onclick = () => cleanup("keep");
    overlay.querySelector("#kmAutoRestore").onclick = () => cleanup("restore");
    overlay.querySelector("#kmAutoDiscard").onclick = () => cleanup("discard");
  });
}
async function restoreAutosaveIfAny() {
  const b64 = localStorage.getItem(AUTOSAVE_KEY);
  if (!b64) return;

  let meta = null;
  try {
    const m = localStorage.getItem(AUTOSAVE_META_KEY);
    meta = m ? JSON.parse(m) : null;
  } catch { meta = null; }

  const choice = await kmAutosavePrompt(meta);
  if (choice === "discard") {
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(AUTOSAVE_META_KEY);
    try { statusEl.textContent = "Autosave discarded."; } catch {}
    return;
  }
  if (choice !== "restore") return;

  try {
    const bytes = base64ToUint8(b64);
    const parsed = parseGmsfV1(bytes.buffer);

    state = {
      ver: parsed.ver,
      audioGearID: parsed.audioGearID,
      bpm: parsed.bpm,
      width: clamp(parsed.width, SONG_WIDTH_MIN, SONG_WIDTH_MAX),
      height: parsed.height,
      metadata: parsed.metadata ?? "",
      grid: parsed.grid
    };

    repeatUsed = Array.from({ length: state.height }, () => Array(state.width).fill(false));
    undoStack.length = 0;
    redoStack.length = 0;

    inpBpm.value = String(state.bpm);
    inpMeta.value = state.metadata;

    playing = false;
    paused = false;
    clearInterval(timer);
    timer = null;
    setSongXOffset(0);
    playPos = 0;
    currentPlayPosition = 0;

    refreshMaxX();
    resetPlayState();

    resizeGearCanvas();

    statusEl.textContent = "Restored from autosave ✅";
    updateTransportUI();
    draw();
  } catch (err) {
    console.warn(err);
  }
}

async function writeToHandle(handle, bytes) {
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

function makeSuggestedFilename() {
  const raw = String((state?.metadata ?? "")).trim();
  const firstLine = raw.split(/\r?\n/)[0] || "";
  const cleaned = firstLine
    .replace(/[\\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return (cleaned ? cleaned : "song") + ".GMSF";
}

async function exportAsManual() {
  const bytes = writeGmsfV1(state);
  const filename = makeSuggestedFilename();

  if ("showSaveFilePicker" in window && window.isSecureContext) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: "GMSF Song",
          accept: { "application/octet-stream": [".gmsf", ".GMSF"] }
        }]
      });
      await writeToHandle(fileHandle, bytes);
      statusEl.textContent = "Exported ✅";
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
      throw err;
    }
  }

  download(bytes, filename);
  statusEl.textContent = "Exported ✅";
}

let btnMidiToGmsf = null;

function ensureMidiToGmsfButton() {
  if (btnMidiToGmsf) return;
  const header = document.querySelector("header");
  if (!header) return;

  const b = document.createElement("button");
  b.id = "btnMidiToGmsf";
  b.type = "button";
  b.textContent = "MIDI → GMSF";
  b.title = "Convert a .mid file into .gmsf";
  b.style.cssText = `
    border-radius: 12px;
    padding: 8px 10px;
    border: 1px solid rgba(16,185,129,.35);
    background: rgba(16,185,129,.12);
    color: rgba(16,185,129,1);
    font-weight: 900;
    cursor: pointer;
  `;

  const anchor = document.getElementById("btnExportMidi") || document.getElementById("btnExport");
  if (anchor && anchor.parentNode === header) anchor.insertAdjacentElement("afterend", b);
  else header.insertBefore(b, header.firstChild);

  btnMidiToGmsf = b;
}

ensureMidiToGmsfButton();

const KM_MIDI_MODAL_KEY = "km_midi_import_settings_v1";

function kmLoadMidiSettings() {
  try {
    const raw = localStorage.getItem(KM_MIDI_MODAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function kmSaveMidiSettings(s) {
  try { localStorage.setItem(KM_MIDI_MODAL_KEY, JSON.stringify(s)); } catch {}
}

function kmEnsureMidiModalStyles() {
  if (document.getElementById("km-midi-modal-style")) return;
  const st = document.createElement("style");
  st.id = "km-midi-modal-style";
  st.textContent = `
  .km-overlay{
    position:fixed; inset:0;
    display:flex; align-items:center; justify-content:center;
    padding:16px;
    background:rgba(0,0,0,.62);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 999999;
    overscroll-behavior: contain;
  }

  .km-modal{
    position:relative;
    width:min(860px, 100%);
    max-height: 92vh;               
    display:flex;                  
    flex-direction: column;

    border-radius:22px;
    border:1px solid rgba(255,255,255,.14);
    background:
      radial-gradient(900px 450px at 15% 10%, rgba(120,64,255,.28), transparent 60%),
      radial-gradient(800px 420px at 85% 20%, rgba(0,204,255,.22), transparent 55%),
      radial-gradient(900px 520px at 50% 120%, rgba(255,80,190,.14), transparent 60%),
      rgba(8,10,24,.92);
    box-shadow: 0 30px 120px rgba(0,0,0,.70);
    color: rgba(240,244,255,.92);
    overflow:hidden;               
  }

  .km-modal::before{
    content:"";
    position:absolute; inset:-2px;
    background:
      radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,.65) 50%, transparent 52%),
      radial-gradient(1px 1px at 30% 45%, rgba(255,255,255,.35) 50%, transparent 52%),
      radial-gradient(1px 1px at 55% 25%, rgba(255,255,255,.55) 50%, transparent 52%),
      radial-gradient(1px 1px at 70% 55%, rgba(255,255,255,.30) 50%, transparent 52%),
      radial-gradient(1px 1px at 85% 35%, rgba(255,255,255,.50) 50%, transparent 52%),
      radial-gradient(1px 1px at 18% 70%, rgba(255,255,255,.40) 50%, transparent 52%),
      radial-gradient(1px 1px at 42% 80%, rgba(255,255,255,.25) 50%, transparent 52%),
      radial-gradient(1px 1px at 62% 75%, rgba(255,255,255,.45) 50%, transparent 52%),
      radial-gradient(1px 1px at 92% 78%, rgba(255,255,255,.28) 50%, transparent 52%);
    opacity:.25;
    pointer-events:none;
    border-radius:24px;
    filter: blur(.15px);
  }

  .km-head{
    position:sticky;               
    top:0;                       
    z-index:2;                     
    background: inherit;          
    flex: 0 0 auto;

    padding:16px 18px;
    display:flex; align-items:center; justify-content:space-between;
    border-bottom:1px solid rgba(255,255,255,.10);
  }

  .km-title{
    display:flex; flex-direction:column; gap:2px;
    font-weight: 900;
    letter-spacing:.2px;
  }
  .km-title small{
    font-weight:600;
    opacity:.75;
  }
  .km-x{
    border:1px solid rgba(255,255,255,.18);
    background:rgba(255,255,255,.08);
    color: rgba(255,255,255,.9);
    width:38px; height:38px;
    border-radius:14px;
    cursor:pointer;
    font-size:18px;
  }

  .km-body{
    position:relative;
    flex: 1 1 auto;                
    overflow:auto;                 
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding:16px 18px 8px;
  }

  .km-grid{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap:12px;
  }
  @media (max-width: 720px){
    .km-grid{ grid-template-columns: 1fr; }
  }

  .km-card{
    border:1px solid rgba(255,255,255,.10);
    background:rgba(255,255,255,.06);
    border-radius:18px;
    padding:12px;
  }
  .km-card h4{
    margin:0 0 8px 0;
    font-size:14px;
    letter-spacing:.2px;
    opacity:.92;
  }
  .km-row{
    display:flex; align-items:center; justify-content:space-between;
    gap:10px;
    margin:8px 0;
  }
  .km-row label{
    font-size:13px;
    opacity:.82;
    line-height:1.2;
  }
  .km-row .km-hint{
    font-size:12px;
    opacity:.65;
    margin-top:2px;
  }

  .km-input, .km-select{
    width: 220px;
    max-width: 55vw;
    border-radius: 14px;
    border:1px solid rgba(255,255,255,.14);
    background: rgb(255 255 255); 
    color: rgb(0 0 0 / 92%);
    padding: 10px 12px;
    outline: none;
  }

  .km-small{
    width: 120px;
  }
  .km-switch{
    display:flex; align-items:center; gap:8px;
  }
  .km-toggle{
    appearance:none;
    width:44px; height:26px;
    border-radius:999px;
    border:1px solid rgba(255,255,255,.16);
    background: rgba(0,0,0,.20);
    position:relative;
    cursor:pointer;
    outline:none;
  }
  .km-toggle::after{
    content:"";
    position:absolute;
    width:20px; height:20px;
    top:2px; left:2px;
    border-radius:999px;
    background: rgba(255,255,255,.80);
    transition: transform .18s ease, background .18s ease;
  }
  .km-toggle:checked{
    background: rgba(0,200,255,.18);
    border-color: rgba(0,200,255,.35);
  }
  .km-toggle:checked::after{
    transform: translateX(18px);
    background: rgba(200,245,255,.95);
  }

  .km-chips{
    display:flex; flex-wrap:wrap; gap:8px;
    margin-top:6px;
  }
  .km-chip{
    border:1px solid rgba(255,255,255,.14);
    background: rgba(0,0,0,.16);
    padding:8px 10px;
    border-radius:999px;
    display:flex; align-items:center; gap:8px;
    font-size:12px;
    cursor:pointer;
    user-select:none;
  }
  .km-chip input{ transform: scale(1.05); }

  .km-actions{
    position:sticky;               
    bottom:0;                    
    z-index:2;                     
    background: inherit;         
    flex: 0 0 auto;

    padding:12px 18px 16px;
    display:flex; justify-content:flex-end; gap:10px;
    border-top:1px solid rgba(255,255,255,.10);
  }

  .km-btn{
    border-radius: 16px;
    padding: 10px 14px;
    border: 1px solid rgba(255,255,255,.16);
    background: rgba(255,255,255,.08);
    color: rgba(240,244,255,.92);
    font-weight: 900;
    cursor: pointer;
  }
  .km-btn-primary{
    border-color: rgba(0,200,255,.35);
    background: rgba(0,200,255,.18);
  }
  .km-btn-danger{
    border-color: rgba(255,80,190,.35);
    background: rgba(255,80,190,.16);
  }
  .km-footnote{
    margin-top:10px;
    font-size:12px;
    opacity:.70;
    line-height:1.35;
  }

  @media (max-width: 420px){
    .km-overlay{ padding:10px; }
    .km-head{ padding:12px 12px; }
    .km-body{ padding:12px 12px 8px; }
    .km-actions{ padding:10px 12px 12px; }
    .km-input, .km-select{ max-width: 62vw; }
  }
  `;
  document.head.appendChild(st);
}


async function kmPickMidiFile() {
  try {
    if ("showOpenFilePicker" in window && window.isSecureContext) {
      const [h] = await window.showOpenFilePicker({
        types: [{ description: "MIDI", accept: { "audio/midi": [".mid", ".midi"] } }],
        multiple: false
      });
      return await h.getFile();
    }

    return await new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".mid,.midi";
      inp.onchange = () => resolve(inp.files?.[0] || null);
      inp.click();
    });
  } catch (err) {

    if (err?.name === "AbortError" || err?.name === "NotAllowedError") return null;

    const msg = String(err?.message || err);
    if (msg.includes("aborted") || msg.includes("AbortError")) return null;

    throw err;
  }
}

let btnGmsfOctave = null;

function ensureGmsfOctaveButton(){
  if (btnGmsfOctave) return;
  const header = document.querySelector("header");
  if (!header) return;

  const b = document.createElement("button");
  b.id = "btnGmsfOctave";
  b.type = "button";
  b.textContent = "GMSF Octave";
  b.title = "Transpose the current song or a .gmsf file (octaves/semitones)";
  b.style.cssText = `
    border-radius: 12px;
    padding: 8px 10px;
    border: 1px solid rgba(168,85,247,.35);
    background: rgba(168,85,247,.14);
    color: rgba(216,180,254,1);
    font-weight: 900;
    cursor: pointer;
  `;

  const anchor =
    document.getElementById("btnMidiToGmsf") ||
    document.getElementById("btnExportMidi") ||
    document.getElementById("btnExport");
  if (anchor && anchor.parentNode === header) anchor.insertAdjacentElement("afterend", b);
  else header.appendChild(b);

  btnGmsfOctave = b;
  btnGmsfOctave.onclick = () => kmOpenGmsfOctaveModal();
}

ensureGmsfOctaveButton();

const KM_GMSF_MODAL_KEY = "km_gmsf_octave_settings_v2";

function kmLoadGmsfSettings() {
  try {
    const raw = localStorage.getItem(KM_GMSF_MODAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function kmSaveGmsfSettings(s) {
  try { localStorage.setItem(KM_GMSF_MODAL_KEY, JSON.stringify(s)); } catch {}
}

async function kmPickGmsfFile() {
  try {
    if ("showOpenFilePicker" in window && window.isSecureContext) {
      const [h] = await window.showOpenFilePicker({
        types: [
          { description: "GMSF", accept: { "application/octet-stream": [".gmsf", ".gmf"] } }
        ],
        multiple: false
      });
      return await h.getFile();
    }

    return await new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".gmsf,.gmf";
      inp.onchange = () => resolve(inp.files?.[0] || null);
      inp.click();
    });
  } catch (err) {

    if (err?.name === "AbortError" || err?.name === "NotAllowedError") return null;
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("aborted")) return null;
    throw err;
  }
}

function kmClone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function kmPitchIndexFromSoundPath(path) {
  if (!path || typeof path !== "string") return null;
  const m = path.match(/_(\d+)\.(wav|mp3|ogg|flac)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function kmInferKeyFromNoteId(noteId, notePack) {
  if (noteId === 14) return "spooky";
  if (noteId === 19) return "festive";

  const gi = notePack?.gearInfo?.[noteId];
  const L = gi?.letter;

  if (L === "P") return "piano";
  if (L === "B") return "bass";
  if (L === "D") return "drum";
  if (L === "S") return "sax";
  if (L === "F") return "flute";
  if (L === "G") return "guitar";
  if (L === "V") return "violin";
  if (L === "L") return "lyre";
  if (L === "E") return "eguitar";
  if (L === "T") return "trumpet";

  const snds = notePack?.notes?.[noteId]?.sounds;
  if (Array.isArray(snds)) {
    const any = (snds.find(p => typeof p === "string" && p.length) || "").toLowerCase();
    if (any.includes("piano_")) return "piano";
    if (any.includes("bass_")) return "bass";
    if (any.includes("drum_")) return "drum";
    if (any.includes("sax_")) return "sax";
    if (any.includes("flute_")) return "flute";
    if (any.includes("electric_guitar_")) return "eguitar";
    if (any.includes("guitar_") || any.includes("spanish_guitar_")) return "guitar";
    if (any.includes("violin_")) return "violin";
    if (any.includes("lyre_")) return "lyre";
    if (any.includes("trumpet_") || any.includes("mtrumpet_")) return "trumpet";
    if (any.includes("spooky_")) return "spooky";
    if (any.includes("festive_")) return "festive";
  }

  return "other";
}

function kmAccidentalRank(noteId, notePack) {
  const a = notePack?.gearInfo?.[noteId]?.accidental;
  if (!a) return 0;
  const s = String(a).toLowerCase();
  if (s.includes("sharp") || s === "#") return 1;
  if (s.includes("flat") || s === "b") return 1;
  return 2;
}

function kmBuildKeyPitchMap(notePack, height = 14) {
  const map = new Map();
  const ids = Object.keys(notePack?.notes ?? {})
    .map(n => parseInt(n, 10))
    .filter(n => Number.isFinite(n));

  for (const noteId of ids) {
    const key = kmInferKeyFromNoteId(noteId, notePack);

    const sounds = notePack?.notes?.[noteId]?.sounds;
    if (!Array.isArray(sounds) || sounds.length < height) continue;

    if (!map.has(key)) map.set(key, new Map());
    const byPitch = map.get(key);

    const rank = kmAccidentalRank(noteId, notePack);

    for (let rowY = 0; rowY < height; rowY++) {
      const pIdx = kmPitchIndexFromSoundPath(sounds[rowY]);
      if (pIdx == null) continue;

      const cur = byPitch.get(pIdx);
      if (!cur || rank < cur.rank) {
        byPitch.set(pIdx, { noteId, rowY, rank });
      }
    }
  }
  return map;
}

function kmPitchBounds(byPitch) {
  let min = Infinity, max = -Infinity;
  for (const k of byPitch.keys()) { if (k < min) min = k; if (k > max) max = k; }
  return { min, max };
}
function kmNearestPitch(byPitch, target) {
  if (byPitch.has(target)) return target;
  for (let d = 1; d <= 12; d++) {
    if (byPitch.has(target - d)) return target - d;
    if (byPitch.has(target + d)) return target + d;
  }
  return null;
}
function kmMod12(n){ const m=n%12; return m<0?m+12:m; }
function kmPitchClassMatch(byPitch, target) {
  const t = kmMod12(target);
  let best = null;
  let bestDist = 1e9;
  for (const k of byPitch.keys()) {
    if (kmMod12(k) !== t) continue;
    const d = Math.abs(k - target);
    if (d < bestDist) { bestDist = d; best = k; }
  }
  return best;
}
function kmPickPitchIndex(byPitch, pIdx, preferPitchClass) {
  if (byPitch.has(pIdx)) return pIdx;
  if (preferPitchClass) {
    const pc = kmPitchClassMatch(byPitch, pIdx);
    if (pc != null) return pc;
  }
  return kmNearestPitch(byPitch, pIdx);
}

function kmMakeEmptyGearCell(audioGearID, volumePct) {
  return { id: audioGearID, volume: clamp(Math.round(volumePct), 1, 100), gearData: Array(AUDIOGEARSPACE * 2).fill(0) };
}
function kmGearPush(cell, noteId, rowY) {
  const gd = cell.gearData;
  for (let i = 0; i < AUDIOGEARSPACE; i++) {
    const idx = i * 2;
    if (!gd[idx]) {
      gd[idx] = noteId;
      gd[idx + 1] = rowY;
      return true;
    }
  }
  return false;
}

function kmOpenGmsfOctaveModal() {
  if (typeof kmEnsureMidiModalStyles === "function") kmEnsureMidiModalStyles();

  const saved = kmLoadGmsfSettings() || {};
  const model = {
    source: saved.source ?? "canvas",                 
    affectEverything: saved.affectEverything ?? true, 
    excludeSF: saved.excludeSF ?? true,               
    octaveShift: saved.octaveShift ?? 0,
    semitoneShift: saved.semitoneShift ?? 0,
    rangeMode: saved.rangeMode ?? "fold",            
    preferPitchClass: saved.preferPitchClass ?? true,
    preserveAudioGear: saved.preserveAudioGear ?? true,
    affect: saved.affect ?? {
      piano: true, bass: true, violin: true, trumpet: true,
      guitar: true, flute: true, sax: true, lyre: true,
      eguitar: true, drum: true, other: true
    }
  };

  const overlay = document.createElement("div");
  overlay.className = "km-overlay";

  overlay.innerHTML = `
    <div class="km-modal" role="dialog" aria-modal="true">
      <div class="km-head">
        <div class="km-title">
          <div>GMSF Octave & Mapping</div>
          <small>Set transpose behaviour before applying</small>
        </div>
        <button class="km-x" id="kmGmsfClose" title="Close">✕</button>
      </div>

      <div class="km-body">
        <div class="km-grid">
          <div class="km-card">
            <h4>Source</h4>
            <div class="km-row">
              <div>
                <label>Apply to</label>
                <div class="km-hint">Choose current canvas or load a .gmsf file.</div>
              </div>
              <select class="km-select km-small" id="kmGmsfSource">
                <option value="canvas">Current canvas</option>
                <option value="file">Load .gmsf file</option>
              </select>
            </div>

            <div class="km-row">
              <div>
                <label>Affect everything</label>
                <div class="km-hint">When enabled, everything is transposed except excluded items.</div>
              </div>
              <div class="km-switch">
                <input class="km-toggle" id="kmGmsfAll" type="checkbox">
              </div>
            </div>

            <div class="km-row">
              <div>
                <label>Exclude Spooky/Festive</label>
                <div class="km-hint">Usually not an instrument.</div>
              </div>
              <div class="km-switch">
                <input class="km-toggle" id="kmGmsfExSF" type="checkbox">
              </div>
            </div>

            <div class="km-footnote">
              Note: Repeat markers are preserved automatically.
            </div>
          </div>

          <div class="km-card">
            <h4>Transpose</h4>

            <div class="km-row">
              <div>
                <label>Octave shift</label>
                <div class="km-hint">Shift by ±12 semitones per octave.</div>
              </div>
              <select class="km-select km-small" id="kmGmsfOct">
                ${Array.from({length: 13}, (_,i)=> i-6).map(v => `<option value="${v}">${v>=0?`+${v}`:v}</option>`).join("")}
              </select>
            </div>

            <div class="km-row">
              <div>
                <label>Semitone shift</label>
                <div class="km-hint">Fine-tune by ±1 semitone steps.</div>
              </div>
              <select class="km-select km-small" id="kmGmsfSemi">
                ${Array.from({length: 23}, (_,i)=> i-11).map(v => `<option value="${v}">${v>=0?`+${v}`:v}</option>`).join("")}
              </select>
            </div>

            <div class="km-row">
              <div>
                <label>Out-of-range handling</label>
                <div class="km-hint">How to deal with notes outside GT’s mapping.</div>
              </div>
              <select class="km-select" id="kmGmsfRange">
                <option value="fold">Fold (wrap by octaves)</option>
                <option value="clamp">Clamp (nearest edge)</option>
                <option value="drop">Drop (remove note)</option>
              </select>
            </div>

            <div class="km-row">
              <div>
                <label>Preserve pitch class</label>
                <div class="km-hint">Prevents “everything becomes C” fallbacks.</div>
              </div>
              <div class="km-switch">
                <input class="km-toggle" id="kmGmsfPitchClass" type="checkbox">
              </div>
            </div>

            <div class="km-row">
              <div>
                <label>Preserve Audio Gear</label>
                <div class="km-hint">Keep gear volumes and repack collisions safely.</div>
              </div>
              <div class="km-switch">
                <input class="km-toggle" id="kmGmsfPreserveGear" type="checkbox">
              </div>
            </div>

            <div class="km-footnote" id="kmGmsfPreview"></div>
          </div>

          <div class="km-card" style="grid-column: 1 / -1;">
            <h4>Affect instruments</h4>
            <div class="km-hint">Only used when “Affect everything” is off.</div>

            <div class="km-chips" style="margin-top:10px;">
              <label class="km-chip"><input type="checkbox" id="kmA_piano"> Piano</label>
              <label class="km-chip"><input type="checkbox" id="kmA_bass"> Bass</label>
              <label class="km-chip"><input type="checkbox" id="kmA_violin"> Violin</label>
              <label class="km-chip"><input type="checkbox" id="kmA_trumpet"> Trumpet</label>
              <label class="km-chip"><input type="checkbox" id="kmA_guitar"> Guitar</label>
              <label class="km-chip"><input type="checkbox" id="kmA_flute"> Flute</label>
              <label class="km-chip"><input type="checkbox" id="kmA_sax"> Sax</label>
              <label class="km-chip"><input type="checkbox" id="kmA_lyre"> Lyre</label>
              <label class="km-chip"><input type="checkbox" id="kmA_eguitar"> E-Guitar</label>
              <label class="km-chip"><input type="checkbox" id="kmA_drum"> Drum</label>
              <label class="km-chip"><input type="checkbox" id="kmA_other"> Other</label>
            </div>

            <div class="km-footnote">
              Tip: Keep “Affect everything” on for canvas to ensure all pages are covered.
            </div>
          </div>
        </div>
      </div>

      <div class="km-actions">
        <button class="km-btn" id="kmGmsfCancel">Cancel</button>
        <button class="km-btn km-btn-primary" id="kmGmsfApply">Apply</button>
      </div>
    </div>
  `;

  kmModalLock();

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);

  const elSource = $("#kmGmsfSource");
  const elAll = $("#kmGmsfAll");
  const elExSF = $("#kmGmsfExSF");

  const elOct = $("#kmGmsfOct");
  const elSemi = $("#kmGmsfSemi");
  const elRange = $("#kmGmsfRange");
  const elPC = $("#kmGmsfPitchClass");
  const elPresGear = $("#kmGmsfPreserveGear");
  const elPreview = $("#kmGmsfPreview");

  const affects = {
    piano: $("#kmA_piano"),
    bass: $("#kmA_bass"),
    violin: $("#kmA_violin"),
    trumpet: $("#kmA_trumpet"),
    guitar: $("#kmA_guitar"),
    flute: $("#kmA_flute"),
    sax: $("#kmA_sax"),
    lyre: $("#kmA_lyre"),
    eguitar: $("#kmA_eguitar"),
    drum: $("#kmA_drum"),
    other: $("#kmA_other"),
  };

  elSource.value = model.source;
  elAll.checked = !!model.affectEverything;
  elExSF.checked = !!model.excludeSF;

  elOct.value = String(model.octaveShift);
  elSemi.value = String(model.semitoneShift);
  elRange.value = model.rangeMode;
  elPC.checked = !!model.preferPitchClass;
  elPresGear.checked = !!model.preserveAudioGear;

  for (const k in affects) affects[k].checked = !!model.affect[k];

  function setAffectEnabled(enabled) {
    for (const k in affects) affects[k].disabled = !enabled;
    for (const k in affects) {
      affects[k].closest("label")?.style?.setProperty("opacity", enabled ? "1" : ".45");
      affects[k].closest("label")?.style?.setProperty("cursor", enabled ? "pointer" : "not-allowed");
    }
  }

  function updatePreview() {
    const oct = parseInt(elOct.value, 10) || 0;
    const semi = parseInt(elSemi.value, 10) || 0;
    const total = (oct * 12) + semi;

    const all = elAll.checked;
    setAffectEnabled(!all);

    elPreview.textContent =
      `Total shift: ${total>=0?`+${total}`:total} semitones • Range: ${elRange.value} • Pitch class: ${elPC.checked ? "ON" : "OFF"} • Preserve gear: ${elPresGear.checked ? "ON" : "OFF"}`;
  }
  updatePreview();

  ["change","input"].forEach(ev => {
    elSource.addEventListener(ev, updatePreview);
    elAll.addEventListener(ev, updatePreview);
    elExSF.addEventListener(ev, updatePreview);

    elOct.addEventListener(ev, updatePreview);
    elSemi.addEventListener(ev, updatePreview);
    elRange.addEventListener(ev, updatePreview);
    elPC.addEventListener(ev, updatePreview);
    elPresGear.addEventListener(ev, updatePreview);
    for (const k in affects) affects[k].addEventListener(ev, updatePreview);
  });

  let _kmMidiClosed = false;
  function close() {
    if (_kmMidiClosed) return;
    _kmMidiClosed = true;
    document.removeEventListener("keydown", onKey);
    try { overlay.remove(); } catch {}
    kmModalUnlock();
  }
  function onKey(e){ if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });

  $("#kmGmsfClose").onclick = close;
  $("#kmGmsfCancel").onclick = close;

  $("#kmGmsfApply").onclick = async () => {
    try {
      const source = elSource.value;
      const affectEverything = !!elAll.checked;
      const excludeSF = !!elExSF.checked;

      const octaveShift = parseInt(elOct.value, 10) || 0;
      const semitoneShift = parseInt(elSemi.value, 10) || 0;
      const totalShift = (octaveShift * 12) + semitoneShift;

      const rangeMode = elRange.value;
      const preferPitchClass = !!elPC.checked;
      const preserveAudioGear = !!elPresGear.checked;

      let affect = {};
      if (affectEverything) {
        affect = {
          piano:true, bass:true, violin:true, trumpet:true,
          guitar:true, flute:true, sax:true, lyre:true,
          eguitar:true, drum:true, other:true,
          spooky: !excludeSF,
          festive: !excludeSF,
        };
        if (excludeSF) { affect.spooky = false; affect.festive = false; }
      } else {
        for (const k in affects) affect[k] = !!affects[k].checked;
        if (excludeSF) { affect.spooky = false; affect.festive = false; }
      }

      kmSaveGmsfSettings({
        source,
        affectEverything,
        excludeSF,
        octaveShift,
        semitoneShift,
        rangeMode,
        preferPitchClass,
        preserveAudioGear,
        affect
      });

      let baseState;
      let displayName = "GMSF Transform";

      if (source === "file") {
        const f = await kmPickGmsfFile();
        if (!f) return;

        const ab = await f.arrayBuffer(); 
        let parsed;

        try {
          parsed = parseGmsfV1(ab);
        } catch {
          try {
            parsed = parseGmsfV1(new Uint8Array(ab));
          } catch {
            const txt = new TextDecoder().decode(new Uint8Array(ab));
            parsed = parseGmsfV1(txt);
          }
        }

        baseState = {
          bpm: parsed.bpm,
          height: parsed.height,
          width: parsed.width,
          audioGearID: parsed.audioGearID,
          grid: parsed.grid,
          metadata: parsed.metadata ?? ""
        };
        displayName = `GMSF File: ${f.name}`;
      } else {
        baseState = kmClone(state);
        displayName = "Current canvas";
      }

      const out = kmTransposeGmsfState(baseState, NOTE_PACK, {
        totalShift,
        rangeMode,
        preferPitchClass,
        preserveAudioGear,
        affect
      });

      applyImportedSong({
        ver: 1,
        audioGearID: out.audioGearID,
        bpm: out.bpm,
        width: out.width,
        height: out.height,
        metadata: out.metadata,
        grid: out.grid,
      }, `${displayName} (transpose)`);

      statusEl.textContent = `Applied transpose ✅ (${totalShift>=0?`+${totalShift}`:totalShift} semitones)`;
      close();
    } catch (err) {
      if (err?.name === "AbortError" || err?.name === "NotAllowedError") return;
      const msg = String(err?.message || err);
      if (msg.toLowerCase().includes("aborted")) return;
      alert(String(err));
    }
  };
}

function kmTransposeGmsfState(inState, notePack, opt) {
  const s = kmClone(inState);
  const H = s.height;
  const W = s.width;

  const RS = notePack.repeatStartID;
  const RE = notePack.repeatEndID;
  const audioGearID = notePack.audioGearID ?? s.audioGearID;

  const totalShift = opt.totalShift | 0;
  const rangeMode = opt.rangeMode; 
  const preferPitchClass = !!opt.preferPitchClass;
  const preserveAudioGear = !!opt.preserveAudioGear;
  const affect = opt.affect || {};

  const keyPitchMap = kmBuildKeyPitchMap(notePack, H);

  function transposeOne(key, noteId, rowY) {
    const sounds = notePack?.notes?.[noteId]?.sounds;
    if (!Array.isArray(sounds)) return null;

    const pIdx = kmPitchIndexFromSoundPath(sounds[rowY]);
    if (pIdx == null) return null;

    const byPitch = keyPitchMap.get(key);
    if (!byPitch || byPitch.size === 0) return null;

    let pNew = pIdx + totalShift;
    const { min, max } = kmPitchBounds(byPitch);
    if (!Number.isFinite(min)) return null;

    if (rangeMode === "fold") {
      while (pNew < min) pNew += 12;
      while (pNew > max) pNew -= 12;
    } else if (rangeMode === "clamp") {
      pNew = clamp(pNew, min, max);
    } else if (rangeMode === "drop") {
      if (pNew < min || pNew > max) return { drop: true };
    }

    const use = kmPickPitchIndex(byPitch, pNew, preferPitchClass);
    if (use == null) return null;

    const pick = byPitch.get(use);
    return { noteId: pick.noteId, rowY: pick.rowY };
  }

  for (let x = 0; x < W; x++) {
    const reservedRows = new Set();
    const markers = [];
    const extracted = []; 

    for (let y = 0; y < H; y++) {
      const cell = s.grid[y][x];
      if (!cell) continue;

      if (typeof cell === "number" && (cell === RS || cell === RE)) {
        reservedRows.add(y);
        markers.push({ y, id: cell });
        continue;
      }

      if (typeof cell === "object" && cell?.id === audioGearID) {
        const vol = clamp(cell.volume ?? 100, 1, 100);
        const gd = cell.gearData;

        if (Array.isArray(gd) && gd.length >= AUDIOGEARSPACE * 2) {
          for (let i = 0; i < AUDIOGEARSPACE; i++) {
            const noteId = gd[i * 2];
            const rowY = gd[i * 2 + 1];
            if (!noteId) continue;

            const key = kmInferKeyFromNoteId(noteId, notePack);
            const doAffect = affectEverythingFallback(affect, key);

            if (!doAffect) {
              extracted.push({ noteId, rowY, volPct: vol, key, sourceKind: "gear" });
              continue;
            }

            const t = transposeOne(key, noteId, rowY);
            if (!t || t.drop) continue;

            extracted.push({ noteId: t.noteId, rowY: t.rowY, volPct: vol, key, sourceKind: "gear" });
          }
        }
        continue;
      }

      if (typeof cell === "number") {
        const noteId = cell;
        const key = kmInferKeyFromNoteId(noteId, notePack);
        const doAffect = affectEverythingFallback(affect, key);

        if (!doAffect) {
          extracted.push({ noteId, rowY: y, volPct: 100, key, sourceKind: "plain" });
          continue;
        }

        const t = transposeOne(key, noteId, y);
        if (!t || t.drop) continue;

        extracted.push({ noteId: t.noteId, rowY: t.rowY, volPct: 100, key, sourceKind: "plain" });
      }
    }

    for (let y = 0; y < H; y++) s.grid[y][x] = 0;

    const plainRows = new Set();
    const plain = [];
    const groups = new Map(); 

    function addToGroup(volPct, noteId, rowY) {
      if (!groups.has(volPct)) groups.set(volPct, []);
      groups.get(volPct).push({ noteId, rowY });
    }

    for (const n of extracted) {
      const mustGear = (n.volPct !== 100) || (preserveAudioGear && n.sourceKind === "gear");
      if (!mustGear && !reservedRows.has(n.rowY) && !plainRows.has(n.rowY)) {
        plainRows.add(n.rowY);
        plain.push({ noteId: n.noteId, rowY: n.rowY });
      } else {
        addToGroup(n.volPct, n.noteId, n.rowY);
      }
    }

    for (const pn of plain) {
      if (!reservedRows.has(pn.rowY) && s.grid[pn.rowY][x] === 0) {
        s.grid[pn.rowY][x] = pn.noteId;
      } else {
        addToGroup(100, pn.noteId, pn.rowY);
      }
    }

    const hostRows = [];
    for (let y = H - 1; y >= 0; y--) {
      if (!reservedRows.has(y) && s.grid[y][x] === 0) hostRows.push(y);
    }

    const vols = [...groups.keys()].sort((a, b) => a - b);
    for (const vol of vols) {
      const arr = groups.get(vol);
      if (!arr || !arr.length) continue;

      let idx = 0;
      while (idx < arr.length) {
        if (hostRows.length === 0) break;
        const hostY = hostRows.shift();
        const cell = kmMakeEmptyGearCell(audioGearID, vol);

        let filled = 0;
        while (filled < AUDIOGEARSPACE && idx < arr.length) {
          const it = arr[idx++];
          if (kmGearPush(cell, it.noteId, it.rowY)) filled++;
        }

        s.grid[hostY][x] = cell;
      }
    }

    for (const m of markers) {
      if (s.grid[m.y][x] === 0) s.grid[m.y][x] = m.id;
    }
  }

  const sign = totalShift >= 0 ? `+${totalShift}` : `${totalShift}`;
  s.metadata = (s.metadata ? (s.metadata + "\n") : "") + `GMSF transpose applied: ${sign} semitones`;
  return s;

  function affectEverythingFallback(aff, key) {
    if (Object.prototype.hasOwnProperty.call(aff, key)) return !!aff[key];
    return true;
  }
}



function kmOpenMidiImportModal() {
  kmEnsureMidiModalStyles();

  const saved = kmLoadMidiSettings() || {};
  const model = {
    baseMode: saved.baseMode ?? "auto",    
    octaveShift: saved.octaveShift ?? 0,   
    quantize: saved.quantize ?? "nearest",  
    fitOctave: saved.fitOctave ?? true,
    compressSilence: saved.compressSilence ?? true,
    velTolerance100: saved.velTolerance100 ?? 1,

    excludeSpookyFestive: saved.excludeSpookyFestive ?? true,

    forceViolin: saved.forceViolin ?? true,
    forceTrumpet: saved.forceTrumpet ?? true,
    forceDrum: saved.forceDrum ?? true,
  };

  const overlay = document.createElement("div");
  overlay.className = "km-overlay";

  overlay.innerHTML = `
    <div class="km-modal" role="dialog" aria-modal="true">
      <div class="km-head">
        <div class="km-title">
          <div>MIDI → GMSF Import</div>
          <small>Set the octave and mapping behaviour before applying</small>
        </div>
        <button class="km-x" id="kmMidiClose" title="Close">✕</button>
      </div>

      <div class="km-body">
        <div class="km-grid">
          <div class="km-card">
            <h4>Pitch & Quantize</h4>

            <div class="km-row">
              <div>
                <label>Base MIDI (C)</label>
                <div class="km-hint">Auto is usually the safest option. C4 = 60.</div>
              </div>
              <select class="km-select" id="kmBaseMode">
                <option value="auto">Auto (best-fit)</option>
                <option value="36">C2 (36)</option>
                <option value="48">C3 (48)</option>
                <option value="60">C4 (60)</option>
                <option value="72">C5 (72)</option>
                <option value="84">C6 (84)</option>
              </select>
            </div>

            <div class="km-row">
              <div>
                <label>Transpose (octave shift)</label>
                <div class="km-hint">Shift +/− octave after base.</div>
              </div>
              <select class="km-select km-small" id="kmOctShift">
                ${Array.from({length: 13}, (_,i)=> i-6).map(v => `<option value="${v}">${v>=0?`+${v}`:v}</option>`).join("")}
              </select>
            </div>

            <div class="km-row">
              <div>
                <label>Quantize</label>
                <div class="km-hint">Nearest is most similar; Floor is more ‘rigid’.</div>
              </div>
              <select class="km-select km-small" id="kmQuantize">
                <option value="nearest">Nearest</option>
                <option value="floor">Floor</option>
              </select>
            </div>

            <div class="km-row">
              <div>
                <label>Fit Octave (fold to 2 octaves GT)</label>
                <div class="km-hint">ON: out-of-range tones are folded per 12.</div>
              </div>
              <div class="km-switch">
                <input class="km-toggle" id="kmFitOct" type="checkbox">
              </div>
            </div>

            <div class="km-row">
              <div>
                <label>velTolerance→100</label>
                <div class="km-hint">0–5: those approaching the baseline are considered 100.</div>
              </div>
              <input class="km-input km-small" id="kmVelTol" type="number" min="0" max="5" step="1">
            </div>

            <div class="km-footnote" id="kmPreviewText"></div>
          </div>

          <div class="km-card">
            <h4>Audio & Space Saver</h4>

            <div class="km-row">
              <div>
                <label>Compress Silence (stacked repeats)</label>
                <div class="km-hint">Save empty columns without changing the duration.</div>
              </div>
              <div class="km-switch">
                <input class="km-toggle" id="kmCompress" type="checkbox">
              </div>
            </div>

            <div class="km-row">
              <div>
                <label>Exclude Spooky/Festive</label>
                <div class="km-hint">Usually not an instrument (skip export).</div>
              </div>
              <div class="km-switch">
                <input class="km-toggle" id="kmExcludeSF" type="checkbox">
              </div>
            </div>

            <div style="margin-top:10px;">
              <label style="font-size:13px; opacity:.82;">Force into Audio Gear (volume 1:1)</label>
              <div class="km-hint">The instrument is forced into the Audio Gear so that the volume can be saved.</div>

              <div class="km-chips" style="margin-top:8px;">
                <label class="km-chip">
                  <input type="checkbox" id="kmForceViolin">
                  Violin
                </label>
                <label class="km-chip">
                  <input type="checkbox" id="kmForceTrumpet">
                  Trumpet
                </label>
                <label class="km-chip">
                  <input type="checkbox" id="kmForceDrum">
                  Drum
                </label>
              </div>
            </div>

            <div class="km-footnote">
              Tip: If your bass/piano often ‘goes up an octave’, try Base C3/C2 or octave shift −1.
            </div>
          </div>
        </div>
      </div>

      <div class="km-actions">
        <button class="km-btn" id="kmMidiCancel">Cancel</button>
        <button class="km-btn km-btn-primary" id="kmMidiApply">Apply</button>
      </div>
    </div>
  `;

  kmModalLock();

  document.body.appendChild(overlay);

  const $ = (id) => overlay.querySelector(id);

  const elBase = $("#kmBaseMode");
  const elShift = $("#kmOctShift");
  const elQuant = $("#kmQuantize");
  const elFit = $("#kmFitOct");
  const elComp = $("#kmCompress");
  const elTol = $("#kmVelTol");
  const elEx = $("#kmExcludeSF");
  const elFViolin = $("#kmForceViolin");
  const elFTrumpet = $("#kmForceTrumpet");
  const elFDrum = $("#kmForceDrum");
  const elPreview = $("#kmPreviewText");

  elBase.value = model.baseMode;
  elShift.value = String(model.octaveShift);
  elQuant.value = model.quantize;
  elFit.checked = !!model.fitOctave;
  elComp.checked = !!model.compressSilence;
  elTol.value = String(model.velTolerance100);
  elEx.checked = !!model.excludeSpookyFestive;
  elFViolin.checked = !!model.forceViolin;
  elFTrumpet.checked = !!model.forceTrumpet;
  elFDrum.checked = !!model.forceDrum;
  
  function computeEffectiveBase() {
    const shift = parseInt(elShift.value, 10) || 0;
    if (elBase.value === "auto") return { baseMidi: "auto", shift };
    const base = parseInt(elBase.value, 10) || 60;
    return { baseMidi: base + (shift * 12), shift };
  }

  function updatePreview() {
    const { baseMidi, shift } = computeEffectiveBase();
    const q = elQuant.value;
    const fit = elFit.checked;
    const comp = elComp.checked;
    const tol = parseInt(elTol.value, 10) || 0;

    const baseText = (baseMidi === "auto")
      ? `Base: Auto (best-fit) + shift ${shift>=0?`+${shift}`:shift} oct`
      : `Base: ${baseMidi} (C${Math.round((baseMidi/12)-1)})  shift ${shift>=0?`+${shift}`:shift} oct`;

    elPreview.textContent =
      `${baseText} • Quantize: ${q} • FitOctave: ${fit ? "ON" : "OFF"} • CompressSilence: ${comp ? "ON" : "OFF"} • velTol: ${tol}`;
  }

  updatePreview();
  ["change","input"].forEach(ev => {
    elBase.addEventListener(ev, updatePreview);
    elShift.addEventListener(ev, updatePreview);
    elQuant.addEventListener(ev, updatePreview);
    elFit.addEventListener(ev, updatePreview);
    elComp.addEventListener(ev, updatePreview);
    elTol.addEventListener(ev, updatePreview);
    elEx.addEventListener(ev, updatePreview);
    elFViolin.addEventListener(ev, updatePreview);
    elFTrumpet.addEventListener(ev, updatePreview);
    elFDrum.addEventListener(ev, updatePreview);
  });

  let _kmGmsfClosed = false;
  function close() {
    if (_kmGmsfClosed) return;
    _kmGmsfClosed = true;
    document.removeEventListener("keydown", onKey);
    try { overlay.remove(); } catch {}
    kmModalUnlock();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close(); 
  });

  $("#kmMidiClose").onclick = close;
  $("#kmMidiCancel").onclick = close;

  $("#kmMidiApply").onclick = async () => {
    try {
      const { baseMidi } = computeEffectiveBase();
      const quantize = elQuant.value;
      const fitOctave = !!elFit.checked;
      const compressSilence = !!elComp.checked;
      const velTolerance100 = clamp(parseInt(elTol.value, 10) || 0, 0, 5);

      const excludeKeys = elEx.checked ? ["spooky", "festive"] : [];
      const forceGearKeys = [];
      if (elFViolin.checked) forceGearKeys.push("violin");
      if (elFTrumpet.checked) forceGearKeys.push("trumpet");
      if (elFDrum.checked) forceGearKeys.push("drum");

      kmSaveMidiSettings({
        baseMode: elBase.value,
        octaveShift: parseInt(elShift.value, 10) || 0,
        quantize,
        fitOctave,
        compressSilence,
        velTolerance100,
        excludeSpookyFestive: elEx.checked,
        forceViolin: elFViolin.checked,
        forceTrumpet: elFTrumpet.checked,
        forceDrum: elFDrum.checked,
      });

      const f = await kmPickMidiFile();
      if (!f) return;

      const ab = await f.arrayBuffer();

      const { state: importedState, stats } = midiArrayBufferToGmsfState(ab, NOTE_PACK, {
        quantize,
        baseMidi,
        fitOctave,
        compressSilence,
        excludeKeys,
        forceGearKeys,
        velTolerance100,
      });

      applyImportedSong({
        ver: 1,
        audioGearID: importedState.audioGearID,
        bpm: importedState.bpm,
        width: importedState.width,
        height: importedState.height,
        metadata: importedState.metadata,
        grid: importedState.grid,
      }, `MIDI Import: ${f.name}`);

      statusEl.textContent = `Loaded MIDI ✅ (BPM ${stats.bpm}, base ${stats.baseMidi}, width ${stats.width})`;
      close();
    } catch (err) {
      alert(String(err));
    }
  };
}


async function pickMidiFile() {
  if ("showOpenFilePicker" in window && window.isSecureContext) {
    const [h] = await window.showOpenFilePicker({
      types: [{ description: "MIDI", accept: { "audio/midi": [".mid", ".midi"] } }],
      multiple: false
    });
    const f = await h.getFile();
    return f;
  }

  return await new Promise((resolve, reject) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".mid,.midi";
    inp.onchange = () => resolve(inp.files?.[0] || null);
    inp.click();
  });
}

async function convertMidiToCanvasOnly() {
  const f = await pickMidiFile();
  if (!f) return;

  const ab = await f.arrayBuffer();

    const { state: importedState, stats } = midiArrayBufferToGmsfState(ab, NOTE_PACK, {
      quantize: "nearest",
      baseMidi: "auto",
      fitOctave: true,
      excludeKeys: ["spooky", "festive"],
      compressSilence: true,
      velTolerance100: 2, 
    });

  applyImportedSong({
    ver: 1,
    audioGearID: importedState.audioGearID,
    bpm: importedState.bpm,
    width: importedState.width,
    height: importedState.height,
    metadata: importedState.metadata,
    grid: importedState.grid,
  }, `MIDI Import: ${f.name}`);

  statusEl.textContent = `Loaded MIDI ✅ (BPM ${stats.bpm}, base ${stats.baseMidi}, width ${stats.width})`;
}


async function convertMidiToGmsfDownloadAndLoad() {
  const f = await pickMidiFile(); 
  if (!f) return;

  const ab = await f.arrayBuffer();

    const { state: importedState, stats } = midiArrayBufferToGmsfState(ab, NOTE_PACK, {
      quantize: "nearest",
      baseMidi: "auto",
      fitOctave: true,
      excludeKeys: ["spooky", "festive"],
      compressSilence: true,
      velTolerance100: 2, 
    });


  const gmsfBytes = writeGmsfV1(importedState); 
  const filename = (f.name.replace(/\.(mid|midi)$/i, "") || "song") + ".gmsf";
  download(gmsfBytes, filename); 

  applyImportedSong({
    ver: 1,
    audioGearID: importedState.audioGearID,
    bpm: importedState.bpm,
    width: importedState.width,
    height: importedState.height,
    metadata: importedState.metadata,
    grid: importedState.grid,
  }, `MIDI Import: ${f.name}`);

  statusEl.textContent = `MIDI→GMSF ✅ (BPM ${stats.bpm}, base ${stats.baseMidi}, width ${stats.width})`;
}


if (btnMidiToGmsf) {
  btnMidiToGmsf.onclick = () => {
    kmOpenMidiImportModal();
  };
}



function makeSuggestedMidiFilename() {
  const raw = String((state?.metadata ?? "")).trim();
  const firstLine = raw.split(/\r?\n/)[0] || "";
  const cleaned = firstLine
    .replace(/[\\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return (cleaned ? cleaned : "song") + ".mid";
}

async function exportAsMidi() {

  const masterVol = 100; 

const bytes = gmsfStateToMidiBytes(state, NOTE_PACK, {
  ppqn: 480,
  baseMidi: 50,
  startX: 0,
  maxX: maxX ?? (state.width - 1),

  masterVol: 100,
  gate: 1,

  pianoBoost: 2.0,        
  pianoLayer: true,       
  pianoProgram: 1,        
  pianoLayerProgram: 0,   
  pianoLenSteps: 2,       
  pianoChannelVol: 127,
  otherChannelVol: 96,    
  excludeKeys: ["spooky", "festive"],
});


  const filename = makeSuggestedMidiFilename();

  if ("showSaveFilePicker" in window && window.isSecureContext) {
    try {
      const h = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: "MIDI File",
          accept: { "audio/midi": [".mid", ".midi"] }
        }]
      });
      await writeToHandle(h, bytes);
      statusEl.textContent = "Exported MIDI ✅";
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
      throw err;
    }
  }

  downloadMidi(bytes, filename);
  statusEl.textContent = "Exported MIDI ✅";
}




async function saveOverwrite() {
  const bytes = writeGmsfV1(state);

  if (fileHandle) {
    await writeToHandle(fileHandle, bytes);
    statusEl.textContent = "Saved (overwrite) ✅";
    return;
  }

  if ("showSaveFilePicker" in window && window.isSecureContext) {
    await exportAsManual();
    if (fileHandle) statusEl.textContent = "Saved ✅";
    return;
  }

  scheduleAutosave();
  statusEl.textContent = "Saved locally (autosave) ✅";
}

function cloneCell(cell) {
  if (typeof cell === "number") return cell;
  return {
    id: cell.id,
    volume: cell.volume ?? 100,
    gearData: cell.gearData ? new Uint8Array(cell.gearData) : new Uint8Array(AUDIOGEARSPACE * 2),
  };
}

function cellsEqual(a, b) {
  const na = typeof a === "number";
  const nb = typeof b === "number";
  if (na && nb) return a === b;
  if (na !== nb) return false;

  if (a.id !== b.id) return false;
  const va = a.volume ?? 100;
  const vb = b.volume ?? 100;
  if (va !== vb) return false;

  const ga = a.gearData ? new Uint8Array(a.gearData) : new Uint8Array(AUDIOGEARSPACE * 2);
  const gb = b.gearData ? new Uint8Array(b.gearData) : new Uint8Array(AUDIOGEARSPACE * 2);
  if (ga.length !== gb.length) return false;
  for (let i = 0; i < ga.length; i++) if (ga[i] !== gb[i]) return false;
  return true;
}

function applyCell(x, y, cell) {
  state.grid[y][x] = cloneCell(cell);
  markBaseDirty();
}


function pushHistoryCell(x, y, before, after) {
  undoStack.push({
    kind: "cell",
    x, y,
    before: cloneCell(before),
    after: cloneCell(after),
  });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  scheduleAutosave();
}

function pushHistoryMulti(changes) {
  if (!changes || changes.length === 0) return;
  undoStack.push({
    kind: "multi",
    changes: changes.map(c => ({
      x: c.x, y: c.y,
      before: cloneCell(c.before),
      after: cloneCell(c.after),
    }))
  });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  scheduleAutosave();
}

function undo() {
  const a = undoStack.pop();
  if (!a) return;

  if (a.kind === "cell") {
    applyCell(a.x, a.y, a.before);
    redoStack.push(a);
  } else if (a.kind === "multi") {
    for (const c of a.changes) applyCell(c.x, c.y, c.before);
    redoStack.push(a);
  }

  refreshMaxX();
  draw();
  scheduleAutosave();
}

function redo() {
  const a = redoStack.pop();
  if (!a) return;

  if (a.kind === "cell") {
    applyCell(a.x, a.y, a.after);
    undoStack.push(a);
  } else if (a.kind === "multi") {
    for (const c of a.changes) applyCell(c.x, c.y, c.after);
    undoStack.push(a);
  }

  refreshMaxX();
  draw();
  scheduleAutosave();
}

function pasteClipAtFixedYWithHistory(anchorX, clip) {
  if (!clip || !clip.cells) return false;

  const w = clip.w;
  const h = clip.h;
  const anchorY = clamp(Number(clip.sy0 ?? 0), 0, state.height - 1);

  const changes = [];

  for (let dy = 0; dy < h; dy++) {
    const ty = anchorY + dy;
    if (ty < 0 || ty >= state.height) continue;

    const row = clip.cells[dy];
    for (let dx = 0; dx < w; dx++) {
      const tx = anchorX + dx;
      if (tx < 0 || tx >= state.width) continue;

      const before = cloneCell(state.grid[ty][tx]);
      const after = cloneCellFromClip(row[dx]);

      if (!cellsEqual(before, after)) {
        state.grid[ty][tx] = after;
        changes.push({ x: tx, y: ty, before, after });
      }
    }
  }

  if (changes.length) {
    pushHistoryMulti(changes);
    markBaseDirty();
  }

  refreshMaxX();
  return changes.length > 0;
}

function beginPaintSession() {
  isPainting = true;
  paintChanges.clear();
  lastPaintKey = "";
  paintStarted = false;
}

function endPaintSession() {
  if (!isPainting) return;
  isPainting = false;

  const changes = [];
  for (const obj of paintChanges.values()) {
    if (!cellsEqual(obj.before, obj.after)) {
      changes.push({ x: obj.x, y: obj.y, before: obj.before, after: obj.after });
    }
  }
  if (changes.length) pushHistoryMulti(changes);

  paintChanges.clear();
  lastPaintKey = "";
  paintStarted = false;

  refreshMaxX();
  draw();
}

async function paintAt(ax, y, isRight, doSound) {
  if (ax < 0 || ax >= state.width || y < 0 || y >= state.height) return;

  const k = keyXY(ax, y);
  if (k === lastPaintKey) return;
  lastPaintKey = k;

  const before = cloneCell(state.grid[y][ax]);

  let after;
  if (isRight) {
    after = 0;
  } else {
    if (selectedNote === state.audioGearID) {
      after = { id: state.audioGearID, gearData: new Uint8Array(AUDIOGEARSPACE * 2), volume: 100 };

      if (audioConvertBuf.length) {
        after.gearData = audioConvertGearDataFromBuf();
        audioConvertBuf.length = 0;
        audioConvertUpdateUI();
      }
    } else {
      after = selectedNote;
      if (doSound) await previewPlacedNote(selectedNote, y);
    }
  }

  if (!paintChanges.has(k)) {
    paintChanges.set(k, { x: ax, y, before, after: cloneCell(after) });
  } else {
    paintChanges.get(k).after = cloneCell(after);
  }

  state.grid[y][ax] = after;
  markBaseDirty();
  paintStarted = true;
}

function drawRowLabelSidebar(ctx2, rows, tileSize, labelWidth, totalHeight) {
  const dark = isDarkUiTheme();

  ctx2.save();
  ctx2.fillStyle = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)";
  ctx2.fillRect(0, 0, labelWidth, totalHeight);

  ctx2.strokeStyle = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  ctx2.lineWidth = 1;
  ctx2.beginPath();

  const totalRows = rows + FOOTER_HEIGHT_TILES;
  for (let y = 0; y <= totalRows; y++) {
    const py = y * tileSize + 0.5;
    ctx2.moveTo(0, py);
    ctx2.lineTo(labelWidth, py);
  }

  ctx2.moveTo(0.5, 0);
  ctx2.lineTo(0.5, totalRows * tileSize);

  ctx2.stroke();

  for (let y = 0; y < rows; y++) {
    const label = ROW_LABELS[y] ?? "";
    const cy = (y + 0.5) * tileSize;
    drawThemedLabelText(ctx2, label, LABEL_PAD_X, cy, "left", dark);
  }

  ctx2.lineWidth = 4;
  ctx2.strokeStyle = dark ? "rgba(240,244,255,0.22)" : "rgba(0,0,0,0.70)";
  ctx2.beginPath();
  ctx2.moveTo(labelWidth + 0.5, 0);
  ctx2.lineTo(labelWidth + 0.5, totalHeight);
  ctx2.stroke();

  ctx2.restore();
}

function drawSidebarSeparator(ctx2, labelWidth, totalHeight) {
  ctx2.save();
  ctx2.lineWidth = 4;
  ctx2.strokeStyle = "rgba(0,0,0,0.75)";
  ctx2.beginPath();
  ctx2.moveTo(labelWidth + 0.5, 0);
  ctx2.lineTo(labelWidth + 0.5, totalHeight);
  ctx2.stroke();
  ctx2.restore();
}

function renderBase() {
  if (baseLayer.width !== cv.width) baseLayer.width = cv.width;
  if (baseLayer.height !== cv.height) baseLayer.height = cv.height;

  baseCtx.clearRect(0, 0, baseLayer.width, baseLayer.height);

  drawRowLabelSidebar(baseCtx, state.height, TILE, LABEL_WIDTH, cv.height);

  baseCtx.save();
  baseCtx.translate(LABEL_WIDTH, 0);

  const _uiDark = isDarkUiTheme();
  const _gridStroke = getGridStrokeForCurrentCanvasTheme();


  drawCanvasThemeBackground(baseCtx);

  for (let y = 0; y < state.height; y++) {
    for (let vx = 0; vx < pageWidth; vx++) {
      const ax = vx + songXOffset;
      const cell = state.grid[y][ax];
      const id = cellId(cell);

      const note = NOTE_PACK.notes[id];
      if (id !== 0 && note?.image) {
        const im = imgReady.get(note.image);
        if (im) {
          baseCtx.drawImage(im, vx * TILE, y * TILE, TILE, TILE);
        } else {
          if (!imgCache.has(note.image)) {
            loadImg(note.image).catch(() => {});
          }
        }
      }
    }
  }

  baseCtx.save();
  baseCtx.strokeStyle = _gridStroke;
  baseCtx.lineWidth = 1;
  baseCtx.beginPath();

  for (let y = 0; y <= state.height; y++) {
    const py = y * TILE + 0.5;
    baseCtx.moveTo(0, py);
    baseCtx.lineTo(pageWidth * TILE, py);
  }

  for (let vx = 0; vx <= pageWidth; vx++) {
    const px = vx * TILE + 0.5;
    baseCtx.moveTo(px, 0);
    baseCtx.lineTo(px, state.height * TILE);
  }

  baseCtx.stroke();
  baseCtx.restore();

  const footerY = state.height * TILE;
  const footerH = FOOTER_HEIGHT_TILES * TILE;

  baseCtx.fillStyle = _uiDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)";
  baseCtx.fillRect(0, footerY, pageWidth * TILE, footerH);

  baseCtx.save();
  baseCtx.strokeStyle = _uiDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)";
  baseCtx.lineWidth = 1;
  baseCtx.beginPath();

  baseCtx.moveTo(0, footerY + 0.5);
  baseCtx.lineTo(pageWidth * TILE, footerY + 0.5);

  for (let vx = 0; vx <= pageWidth; vx++) {
    const px = vx * TILE + 0.5;
    baseCtx.moveTo(px, footerY);
    baseCtx.lineTo(px, footerY + footerH);
  }

  baseCtx.moveTo(0, footerY + footerH + 0.5);
  baseCtx.lineTo(pageWidth * TILE, footerY + footerH + 0.5);

  baseCtx.stroke();
  baseCtx.restore();

  for (let vx = 0; vx < pageWidth; vx++) {
    const label = COL_LABELS[vx] ?? String.fromCharCode(65 + vx);
    const cx = vx * TILE + TILE / 2;
    const cy = footerY + footerH / 2;
    drawThemedLabelText(baseCtx, label, cx, cy, "center", _uiDark);
  }

  baseCtx.restore();

  baseDirty = false;
}

function drawFrame() {
  if (baseDirty) renderBase();

  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(baseLayer, 0, 0);

  ctx.save();
  ctx.translate(LABEL_WIDTH, 0);

  if (selectionMode && (isSelecting || hasSelection())) {
    ctx.fillStyle = "rgba(0, 120, 255, 0.06)";
    ctx.fillRect(0, 0, pageWidth * TILE, state.height * TILE);

    if (hasSelection()) {
      const { sx, sy, ex, ey } = selCorners();
      const vx1 = sx - songXOffset;
      const vx2 = ex - songXOffset;

      const ix1 = Math.max(0, vx1);
      const ix2 = Math.min(pageWidth - 1, vx2);

      if (ix1 <= ix2) {
        const drawX = ix1 * TILE;
        const drawY = sy * TILE;
        const drawW = (ix2 - ix1 + 1) * TILE;
        const drawH = (ey - sy + 1) * TILE;

        ctx.fillStyle = "rgba(255, 120, 0, 0.14)";
        ctx.fillRect(drawX, drawY, drawW, drawH);

        ctx.strokeStyle = "rgba(255, 120, 0, 0.95)";
        ctx.lineWidth = 3;
        ctx.strokeRect(drawX + 1.5, drawY + 1.5, drawW - 3, drawH - 3);
        ctx.lineWidth = 1;
      }
    }
  }

  if (selectionMode && pasteArmed && pasteClipCache && pastePreviewX !== -1) {
    const clip = pasteClipCache;
    const anchorY = clamp(Number(clip.sy0 ?? 0), 0, state.height - 1);

    const vx1 = pastePreviewX - songXOffset;
    const vx2 = (pastePreviewX + clip.w - 1) - songXOffset;

    const ix1 = Math.max(0, vx1);
    const ix2 = Math.min(pageWidth - 1, vx2);

    if (ix1 <= ix2) {
      const drawX = ix1 * TILE;
      const drawY = anchorY * TILE;
      const drawW = (ix2 - ix1 + 1) * TILE;
      const drawH = clip.h * TILE;

      ctx.fillStyle = "rgba(255, 120, 0, 0.10)";
      ctx.fillRect(drawX, drawY, drawW, drawH);

      ctx.strokeStyle = "rgba(255, 120, 0, 0.95)";
      ctx.lineWidth = 3;
      ctx.strokeRect(drawX + 1.5, drawY + 1.5, drawW - 3, drawH - 3);
      ctx.lineWidth = 1;
    }
  }

  if (playing || paused) {
    const vx = currentPlayPosition - songXOffset;
    if (vx >= 0 && vx < pageWidth) {
      ctx.fillStyle = playing ? "rgba(128,128,128,0.25)" : "rgba(0,0,0,0.10)";
      ctx.fillRect(vx * TILE, 0, TILE, state.height * TILE);
    }
  }

  ctx.restore();

  drawSidebarSeparator(ctx, LABEL_WIDTH, cv.height);

  const from = songXOffset + 1;
  const to = Math.min(songXOffset + pageWidth, state.width);
  hud.textContent = `View: ${from}-${to}/${state.width} | BPM: ${state.bpm} | maxX: ${maxX + 1}`;
}

function draw() {
  requestDraw();
}




function setSelectedNote(noteId){
  selectedNote = noteId;

  if (audioConvertOn && selectedNote !== state.audioGearID){
    audioConvertOn = false;
  }
  audioConvertUpdateUI();
}

async function buildPalette() {
  paletteGrid.innerHTML = "";
  const ids = NOTE_PACK.uiOrder
    .filter(v => v !== undefined)
    .filter(v => NOTE_PACK.notes[v] !== undefined);

  for (const noteId of ids) {
    const btn = document.createElement("div");
    btn.className = "noteBtn";
    btn.dataset.id = String(noteId);

    const img = document.createElement("img");
    img.src = assetUrl(NOTE_PACK.notes[noteId].image);   
    img.loading = "lazy";
    btn.appendChild(img);

    btn.onclick = () => {
      setSelectedNote(noteId);
      syncPaletteSelection();
    };

    paletteGrid.appendChild(btn);
  }
  syncPaletteSelection();
}


function syncPaletteSelection() {
  for (const el of paletteGrid.querySelectorAll(".noteBtn")) {
    el.classList.toggle("selected", Number(el.dataset.id) === selectedNote);
  }
}

const btnHotkeys = document.getElementById("btnHotkeys");

const _hotkeyStatus = (typeof showStatus === "function")
  ? showStatus
  : ((msg, ms=1400) => { try { statusEl.textContent = msg; setTimeout(()=>statusEl.textContent="", ms);} catch{} });

const HOTKEYS_KEY = "gmsf_note_hotkeys_v2";

const RESERVED_CODES = new Set([
  "Space",        
  "KeyP",         
  "ArrowLeft", "ArrowRight",
  "KeyB",         
  "Escape",       
  "KeyO", "KeyS", "KeyZ", "KeyY", "KeyC", "KeyV", "KeyA", 
]);

let noteHotkeys = loadNoteHotkeys();

let hotkeyModalOpen = false;
let captureNoteId = null;

function loadNoteHotkeys(){
  try {
    const raw = localStorage.getItem(HOTKEYS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    return obj;
  } catch {
    return {};
  }
}

function saveNoteHotkeys(){
  try {
    localStorage.setItem(HOTKEYS_KEY, JSON.stringify(noteHotkeys));
  } catch {}
}

function sanitizeHotkeys(){
  const valid = new Set(
    (NOTE_PACK?.uiOrder || []).filter(v => v !== undefined && NOTE_PACK.notes?.[v])
  );
  for (const nid in noteHotkeys){
    if (!valid.has(Number(nid))) delete noteHotkeys[nid];
  }
  saveNoteHotkeys();
}
sanitizeHotkeys();

function codeToNiceLabel(code){
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map = {
    Space: "Space",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Enter: "Enter",
    NumpadEnter: "Enter",
    Backspace: "Backspace",
    Delete: "Delete",
    Tab: "Tab",
  };
  return map[code] || code;
}

function getNoteGroupKey(noteId){
  const gi = NOTE_PACK?.gearInfo?.[noteId];
  if (gi?.letter){
    const L = String(gi.letter).toUpperCase();
    const map = {
      P:"Piano", B:"Bass", D:"Drum", S:"Sax", F:"Flute",
      G:"Guitar", V:"Violin", L:"Lyre", E:"Electric Guitar", T:"Mexican Trumpet"
    };
    return map[L] || "Other";
  }

  if (noteId === NOTE_PACK?.repeatStartID || noteId === NOTE_PACK?.repeatEndID) return "Repeat";
  if (noteId === NOTE_PACK?.audioGearID || noteId === state?.audioGearID) return "Audio Rack";
  const img = String(NOTE_PACK?.notes?.[noteId]?.image || "").toLowerCase();
  if (img.includes("spooky")) return "Spooky";
  if (img.includes("festive")) return "Festive";
  if (img.includes("blank") || img.includes("rest") || img.includes("empty")) return "Blank";
  if (img.includes("repeat")) return "Repeat";
  if (img.includes("audiogear") || img.includes("gear")) return "Audio Rack";
  return "Other";
}

function buildHotkeyGroups(){
  const ids = (NOTE_PACK?.uiOrder || [])
    .filter(v => v !== undefined)
    .filter(v => NOTE_PACK?.notes?.[v] !== undefined);

  const groups = new Map();
  for (const id of ids){
    const g = getNoteGroupKey(id);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(id);
  }

  const order = [
    "Audio Rack","Piano","Bass","Drum","Sax","Flute","Guitar","Violin","Lyre","Electric Guitar","Mexican Trumpet",
    "Spooky","Festive","Repeat","Blank","Eraser"
  ];
  const result = [];
  for (const name of order){
    if (groups.has(name)) result.push([name, groups.get(name)]);
  }

  for (const [name, arr] of groups.entries()){
    if (!order.includes(name)) result.push([name, arr]);
  }
  return result;
}

function ensureHotkeyModal(){
  if (document.getElementById("hotkeyBack")) return;

  const style = document.createElement("style");
  style.id = "hotkeyModalStyle";
  style.textContent = `
    #hotkeyBack{
      position:fixed; inset:0;
      background:rgba(0,0,0,.38);
      display:none;
      align-items:center;
      justify-content:center;
      z-index:97;
      padding: 12px;
    }
    #hotkeyModal{
      width:min(640px, 96vw);
      max-height:min(80vh, 620px);
      overflow:auto;
      background: var(--ui-surface, #fff);
      border-radius:16px;
      border:1px solid rgba(0,0,0,.12);
      box-shadow:0 16px 60px rgba(0,0,0,.25);
      padding: 10px;
    }
    #hotkeyTop{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:10px;
      flex-wrap:wrap;
      position: sticky;
      top:0;
      background: var(--ui-card, rgba(255,255,255,.92));
      backdrop-filter: blur(6px);
      padding: 8px 8px;
      border-bottom:1px solid rgba(0,0,0,.08);
      border-radius:14px;
      z-index:2;
    }
    #hotkeyTop h3{ margin:0; font-size:14px; font-weight:900; }
    #hotkeyTop .sub{ margin-top:2px; font-size:11px; opacity:.75; }
    #hotkeyHint{
      margin-top:10px;
      padding: 8px 10px;
      border-radius:14px;
      border:1px solid rgba(99,102,241,.25);
      background: rgba(99,102,241,.08);
      font-size: 11px;
      line-height:1.35;
      color: rgba(0,0,0,.75);
    }
    .hkSection{
      margin-top: 10px;
      border:1px solid var(--ui-border, rgba(0,0,0,.10));
      border-radius:14px;
      background:#fbfbfb;
      padding: 10px;
    }
    .hkTitle{
      font-weight:900;
      font-size: 12px;
      margin-bottom: 8px;
      opacity:.85;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      flex-wrap:wrap;
    }
    .hkGrid{
      display:grid;
      grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
      gap: 8px;
    }
    .hkBtn{
      height: 56px;
      border-radius: 14px;
      border:1px solid rgba(0,0,0,.12);
      background: var(--ui-surface, #fff);
      display:flex;
      align-items:center;
      justify-content:center;
      position:relative;
      cursor:pointer;
      user-select:none;
      overflow:hidden;
    }
    .hkBtn:hover{ border-color: rgba(0,0,0,.25); }
    .hkBtn.selected{
      outline: 3px solid rgba(99,102,241,.35);
      border-color: rgba(99,102,241,.55);
    }
    .hkBtn img{
      width: 34px;
      height: 34px;
      image-rendering: pixelated;
      pointer-events:none;
    }
    .hkTag{
      position:absolute;
      bottom:4px;
      right:6px;
      font-size: 10px;
      font-family: ui-monospace, Menlo, monospace;
      padding: 2px 6px;
      border-radius: 999px;
      border:1px solid rgba(0,0,0,.08);
      background: rgba(255,255,255,.88);
      color: rgba(0,0,0,.72);
      pointer-events:none;
      white-space:nowrap;
    }
    .hkCaptureBar{
      margin-top: 10px;
      padding: 8px 10px;
      border-radius:14px;
      border:1px solid rgba(245,158,11,.30);
      background: rgba(245,158,11,.10);
      font-size: 11px;
      color: var(--ui-text-soft, rgba(0,0,0,.78));
      display:none;
    }
    @media (max-width: 480px){
      #hotkeyModal{ width: 96vw; }
      .hkGrid{ grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); }
      .hkBtn{ height: 52px; }
      .hkBtn img{ width: 32px; height: 32px; }
    }
  `;
  document.head.appendChild(style);

  const back = document.createElement("div");
  back.id = "hotkeyBack";

  const modal = document.createElement("div");
  modal.id = "hotkeyModal";
  modal.innerHTML = `
    <div id="hotkeyTop">
      <div>
        <h3>Hotkey Editor</h3>
        <div class="sub">Click icon → press the keyboard button to bind</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button id="hkReset">Reset</button>
        <button id="hkClose" class="primary" style="background: var(--ui-primary-bg, #111);border-color: var(--ui-primary-border, #111);">Close</button>
      </div>
    </div>

    <div id="hotkeyHint">
      Tips: <b>Backspace/Delete</b> = clear, <b>Esc</b> = cancel.<br>
      Note: global buttons such as <b>Space</b>, <b>P</b>, <b>←/→</b>, <b>B</b> cannot be used for hotkey notes (to avoid conflicts).
    </div>

    <div id="hkCapture" class="hkCaptureBar"></div>

    <div id="hkBody"></div>
  `;
  back.appendChild(modal);
  document.body.appendChild(back);

  back.addEventListener("click", (e)=>{ if(e.target===back) closeHotkeyModal(); });

  modal.querySelector("#hkClose").onclick = closeHotkeyModal;

  modal.querySelector("#hkReset").onclick = () => {
    if (!confirm("Reset all hotkeys?")) return;
    noteHotkeys = {};
    saveNoteHotkeys();
    captureNoteId = null;
    _hotkeyStatus("Hotkeys reset ✅");
    renderHotkeyModal();
  };
}

function hkAlert(message, kind = "info") {
  const back = document.getElementById("hotkeyBack");
  const modal = document.getElementById("hotkeyModal");
  if (!back || !modal) {
    alert(message);
    return;
  }

  const old = document.getElementById("hkAlertBack");
  if (old) old.remove();

  const colors = {
    info: { b: "rgba(59,130,246,.30)", bg: "rgba(59,130,246,.10)" },
    ok:   { b: "rgba(16,185,129,.35)", bg: "rgba(16,185,129,.10)" },
    err:  { b: "rgba(239,68,68,.35)",  bg: "rgba(239,68,68,.10)" },
  };
  const c = colors[kind] || colors.info;

  const alertBack = document.createElement("div");
  alertBack.id = "hkAlertBack";
  alertBack.style.cssText = `
    position: fixed;
    inset: 0;
    display:flex;
    align-items:center;
    justify-content:center;
    z-index: 999;
    background: rgba(0,0,0,.18);
    padding: 12px;
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    width: min(420px, 92vw);
    background: #fff;
    border-radius: 16px;
    border: 1px solid ${c.b};
    box-shadow: 0 16px 60px rgba(0,0,0,.25);
    padding: 12px;
  `;

  const title = (kind === "err") ? "Hotkey Error"
              : (kind === "ok") ? "Hotkey Set"
              : "Hotkey Info";

  box.innerHTML = `
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
      <div style="font-weight:900; font-size:13px;">${title}</div>
      <button id="hkAlertOk" class="primary" style="background: var(--ui-primary-bg, #111);border-color: var(--ui-primary-border, #111);">OK</button>
    </div>
    <div style="
      margin-top:10px;
      padding:10px;
      border-radius:14px;
      border:1px solid ${c.b};
      background:${c.bg};
      font-size:12px;
      line-height:1.35;
      color: var(--ui-text-soft, rgba(0,0,0,.78));
      white-space: pre-wrap;
    ">${String(message)}</div>
  `;

  alertBack.appendChild(box);

  document.body.appendChild(alertBack);

  const close = () => {
    alertBack.remove();
  };

  alertBack.querySelector("#hkAlertOk").onclick = close;
  alertBack.addEventListener("click", (e) => {
    if (e.target === alertBack) close();
  });

  const esc = (e) => {
    if (e.key === "Escape") {
      window.removeEventListener("keydown", esc, true);
      close();
    }
  };
  window.addEventListener("keydown", esc, true);
}


function openHotkeyModal(){
  ensureHotkeyModal();
  renderHotkeyModal();
  document.getElementById("hotkeyBack").style.display = "flex";
  hotkeyModalOpen = true;
}

function closeHotkeyModal(){
  const back = document.getElementById("hotkeyBack");
  if (back) back.style.display = "none";
  hotkeyModalOpen = false;
  captureNoteId = null;
}

function renderHotkeyModal(){
  ensureHotkeyModal();

  const body = document.getElementById("hkBody");
  const cap = document.getElementById("hkCapture");
  if (!body || !cap) return;

  cap.style.display = captureNoteId ? "block" : "none";
  cap.textContent = captureNoteId
    ? `Listening... press the button for note ID ${captureNoteId} (Esc cancel, Backspace/Delete delete)`
    : "";

  body.innerHTML = "";

  const groups = buildHotkeyGroups();
  for (const [gname, ids] of groups){
    const sec = document.createElement("div");
    sec.className = "hkSection";

    const title = document.createElement("div");
    title.className = "hkTitle";
    title.innerHTML = `<span>${gname}</span><span style="opacity:.7;font-size:11px">(${ids.length} items)</span>`;
    sec.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "hkGrid";

    for (const noteId of ids){
      const note = NOTE_PACK?.notes?.[noteId];
      if (!note?.image) continue;

      const btn = document.createElement("div");
      btn.className = "hkBtn";
      if (captureNoteId === noteId) btn.classList.add("selected");

      const img = document.createElement("img");
      img.src = assetUrl(note.image);
      img.loading = "lazy";
      btn.appendChild(img);

      const tag = document.createElement("div");
      tag.className = "hkTag";
      tag.textContent = codeToNiceLabel(noteHotkeys[noteId]);
      btn.appendChild(tag);

      btn.addEventListener("click", () => {
        captureNoteId = noteId;
        renderHotkeyModal();
      });

      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (noteHotkeys[noteId]){
          delete noteHotkeys[noteId];
          saveNoteHotkeys();
            hkAlert(
              `"${codeToNiceLabel(e.code)}" cannot be used because it conflicts with a global hotkey.\n\nSelect another button.`,
              "err"
            );

          if (captureNoteId === noteId) captureNoteId = null;
          renderHotkeyModal();
        }
      });

      grid.appendChild(btn);
    }

    sec.appendChild(grid);
    body.appendChild(sec);
  }
}

window.addEventListener("keydown", (e) => {
  if (!hotkeyModalOpen || captureNoteId == null) return;

  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") return;

  e.preventDefault();
  e.stopPropagation();

  if (e.code === "Escape"){
    captureNoteId = null;
    renderHotkeyModal();
    hkAlert("Bind canceled.", "info");
    return;
  }

  if (e.code === "Backspace" || e.code === "Delete"){
    delete noteHotkeys[captureNoteId];
    saveNoteHotkeys();
    hkAlert(`The hotkey for note ${captureNoteId} has been deleted.`, "ok");
    captureNoteId = null;
    renderHotkeyModal();
    return;
  }

  if (RESERVED_CODES.has(e.code)){
    _hotkeyStatus(`"${codeToNiceLabel(e.code)}" reserved (global hotkey). Select another key.`);
    return;
  }

  if (e.code === "ShiftLeft" || e.code === "ShiftRight" ||
      e.code === "ControlLeft" || e.code === "ControlRight" ||
      e.code === "AltLeft" || e.code === "AltRight" ||
      e.code === "MetaLeft" || e.code === "MetaRight"){
    return;
  }

  for (const nid in noteHotkeys){
    if (noteHotkeys[nid] === e.code) delete noteHotkeys[nid];
  }

  noteHotkeys[captureNoteId] = e.code;
  saveNoteHotkeys();
    hkAlert(`Done bind:\n${codeToNiceLabel(e.code)} → note ${captureNoteId}`, "ok");
  captureNoteId = null;
  renderHotkeyModal();
}, true);

function tryHotkeySelectNote(e){
  if (e.ctrlKey || e.metaKey || e.altKey) return false;

  if (hotkeyModalOpen) return false;
  if (typeof modalBack !== "undefined" && modalBack?.style?.display === "flex") return false; 

  const code = e.code;
  if (!code) return false;

  for (const nid in noteHotkeys){
    if (noteHotkeys[nid] === code){
      const idNum = Number(nid);
      if (NOTE_PACK?.notes?.[idNum] === undefined) return false;

      setSelectedNote(idNum);
      if (typeof syncPaletteSelection === "function") syncPaletteSelection();
      if (typeof draw === "function") draw();
      return true;
    }
  }
  return false;
}

window.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") return;

  if (e.ctrlKey || e.metaKey) return;

  if (tryHotkeySelectNote(e)){
    e.preventDefault();
  }
}, true);

if (btnHotkeys){
  btnHotkeys.addEventListener("click", () => {
    openHotkeyModal();
  });
}





function rnGetPageCount(){
  const w = state?.width || 0;
  const pw = Math.max(1, Number(pageWidth) || 25);
  return Math.max(1, Math.ceil(w / pw));
}

function rnClampPage(n){
  const maxP = rnGetPageCount();
  n = Math.floor(Number(n) || 1);
  if (n < 1) n = 1;
  if (n > maxP) n = maxP;
  return n;
}

function rnRangeToCols(p0, p1){
  const pw = Math.max(1, Number(pageWidth) || 25);
  const a = rnClampPage(p0);
  const b = rnClampPage(p1);
  const lo = Math.min(a,b);
  const hi = Math.max(a,b);
  const x0 = (lo - 1) * pw;
  const x1 = Math.min((hi * pw) - 1, (state.width - 1));
  return { lo, hi, x0, x1, pw };
}

let _rnRecalcTimer = null;

function rnRenderModal(recalc=false){
  if (!document.getElementById("replaceNoteBack")) return;
  const back = document.getElementById("replaceNoteBack");
  const modal = document.getElementById("replaceNoteModal");
  if (!back || !modal) return;
  back.classList.toggle("rnDark", isDarkUiTheme());

  if (!rnValidNoteId(rnFromId)) rnFromId = (rnAllNoteIds()[0] ?? 1);
  if (!rnValidNoteId(rnToId)) rnToId = rnFromId;

  const ids = rnAllNoteIds();

  const curPage = Math.floor((Number(songXOffset) || 0) / Math.max(1, Number(pageWidth) || 25)) + 1;
  if (!rnPageFrom || rnPageFrom < 1) rnPageFrom = curPage;
  if (!rnPageTo || rnPageTo < 1) rnPageTo = curPage;

  rnPageFrom = rnClampPage(rnPageFrom);
  rnPageTo = rnClampPage(rnPageTo);

  const maxP = rnGetPageCount();
  const { lo, hi, x0, x1, pw } = rnRangeToCols(rnPageFrom, rnPageTo);

  const pickFrom = modal.querySelector("#rnPickFrom");
  const pickTo   = modal.querySelector("#rnPickTo");
  pickFrom.classList.toggle("active", rnActiveSide === "from");
  pickTo.classList.toggle("active", rnActiveSide === "to");

  const fromImg = modal.querySelector("#rnFromImg");
  const toImg = modal.querySelector("#rnToImg");
  fromImg.src = assetUrl(NOTE_PACK.notes[rnFromId].image);
  toImg.src = assetUrl(NOTE_PACK.notes[rnToId].image);

  modal.querySelector("#rnFromIdTxt").textContent = `ID: ${rnFromId}`;
  modal.querySelector("#rnToIdTxt").textContent = `ID: ${rnToId}`;

  const inp0 = modal.querySelector("#rnPageFrom");
  const inp1 = modal.querySelector("#rnPageTo");
  inp0.max = String(maxP);
  inp1.max = String(maxP);
  inp0.value = String(rnPageFrom);
  inp1.value = String(rnPageTo);

  modal.querySelector("#rnPagesInfo").textContent = `Total page: ${maxP}`;
  modal.querySelector("#rnColsInfo").textContent = (x1 >= x0) ? `Affected column: ${x0+1}..${x1+1}` : `Affected column: -`;
  const help = modal.querySelector("#rnRangeHelp");
  if (help){
    const ex1s = 1;
    const ex1e = Math.min(pw, state.width);
    const ex2s = ex1e + 1;
    const ex2e = Math.min(ex2s + pw - 1, state.width);
    let t = `1 page = ${pw} col. 1 = ${ex1s}–${ex1e}`;
    if (ex2s <= state.width) t += `, 2 = ${ex2s}–${ex2e}`;
    t += `, etc.`;
    help.textContent = t;
  }

  const grid = modal.querySelector("#rnGrid");
  if (!grid.dataset.built){
    grid.innerHTML = "";
    for (const id of ids){
      const btn = document.createElement("div");
      btn.className = "rnNoteBtn";
      btn.dataset.id = String(id);

      const img = document.createElement("img");
      img.src = assetUrl(NOTE_PACK.notes[id].image);
      img.loading = "lazy";
      btn.appendChild(img);

      btn.addEventListener("click", () => {
        const nid = Number(btn.dataset.id);
        if (!rnValidNoteId(nid)) return;
        if (rnActiveSide === "from") rnFromId = nid;
        else rnToId = nid;
        rnSaveSettings();
        rnRenderModal(true);
      });

      grid.appendChild(btn);
    }
    grid.dataset.built = "1";
  }

  for (const el of grid.querySelectorAll(".rnNoteBtn")){
    const id = Number(el.dataset.id);
    el.classList.toggle("from", id === rnFromId);
    el.classList.toggle("to", id === rnToId);
    el.classList.toggle("activeSide", (rnActiveSide === "from" && id === rnFromId) || (rnActiveSide === "to" && id === rnToId));
  }

  if (recalc){
    if (_rnRecalcTimer) clearTimeout(_rnRecalcTimer);
    _rnRecalcTimer = setTimeout(() => {
      _rnRecalcTimer = null;
      rnUpdateMatchInfo();
    }, 30);
  } else {
    rnUpdateMatchInfo();
  }
}

function rnUpdateMatchInfo(){
  const modal = document.getElementById("replaceNoteModal");
  if (!modal) return;
  const { x0, x1 } = rnRangeToCols(rnPageFrom, rnPageTo);

  let cnt = 0;
  if (x1 >= x0 && rnFromId !== null && rnFromId !== undefined){
    for (let y=0; y<state.height; y++){
      for (let x=x0; x<=x1; x++){
        const id = cellId(state.grid[y][x]);
        if (id === rnFromId) cnt++;
      }
    }
  }
  modal.querySelector("#rnMatchInfo").textContent = `Number found: ${cnt}`;
}

function rnMakeCellForId(id){
  if (id === state.audioGearID){
    return {
      id: state.audioGearID,
      volume: 100,
      gearData: new Uint8Array(AUDIOGEARSPACE * 2),
    };
  }
  return id;
}

function rnDoReplace(){
  rnPageFrom = rnClampPage(rnPageFrom);
  rnPageTo = rnClampPage(rnPageTo);

  if (!rnValidNoteId(rnFromId) || !rnValidNoteId(rnToId)){
    showStatus("Replace: invalid note selection.");
    return;
  }
  if (rnFromId === rnToId){
    showStatus("Replace: FROM and TO are the same.");
    return;
  }

  const { lo, hi, x0, x1 } = rnRangeToCols(rnPageFrom, rnPageTo);
  if (x1 < x0){
    showStatus("Replace: invalid range.");
    return;
  }

  const changes = [];
  for (let y=0; y<state.height; y++){
    for (let x=x0; x<=x1; x++){
      const before = state.grid[y][x];
      const id = cellId(before);
      if (id !== rnFromId) continue;

      const after = rnMakeCellForId(rnToId);
      changes.push({ x, y, before, after });
      applyCell(x, y, after);
    }
  }

  if (changes.length === 0){
    showStatus("Replace: no matches in that range.");
    rnUpdateMatchInfo();
    return;
  }

  pushHistoryMulti(changes);
  refreshMaxX();
  draw();

  showStatus(`Replaced ${changes.length} cell(s) on pages ${lo}..${hi}.`);
  rnUpdateMatchInfo();
}

function openReplaceNoteModal(){
  rnEnsureModal();
  rnLoadSettings();

  if (typeof selectedNote === "number" && rnValidNoteId(selectedNote)){
    if (!rnValidNoteId(rnFromId)) rnFromId = selectedNote;
    if (!rnValidNoteId(rnToId)) rnToId = selectedNote;
  }

  const curPage = Math.floor((Number(songXOffset) || 0) / Math.max(1, Number(pageWidth) || 25)) + 1;
  if (!rnPageFrom) rnPageFrom = curPage;
  if (!rnPageTo) rnPageTo = curPage;

  rnPageFrom = rnClampPage(rnPageFrom);
  rnPageTo = rnClampPage(rnPageTo);

  const back = document.getElementById("replaceNoteBack");
  back.style.display = "flex";
  replaceNoteModalOpen = true;
  kmModalLock();
  rnRenderModal(true);
}

function closeReplaceNoteModal(){
  const back = document.getElementById("replaceNoteBack");
  if (!back || back.style.display !== "flex") return;
  back.style.display = "none";
  replaceNoteModalOpen = false;
  kmModalUnlock();
}


const noteNames = ['B','A','G','F','E','D','C','b','a','g','f','e','d','c'];
const NAME_TO_Y = (() => {
  const m = new Map();
  noteNames.forEach((ch, y) => m.set(ch, y));
  return m;
})();

let _GEAR_LOOKUP = null;
function buildGearLookup() {
  const map = new Map();
  for (const idStr in NOTE_PACK.gearInfo) {
    const id = Number(idStr);
    const gi = NOTE_PACK.gearInfo[id];
    if (!gi || !gi.letter) continue;
    const L = String(gi.letter).toUpperCase();
    const acc = (gi.accidental === "#" || gi.accidental === "b" || gi.accidental === "-")
      ? gi.accidental
      : "-";
    map.set(`${L}|${acc}`, id);
  }
  return map;
}

function parseGearToken(tok) {
  tok = String(tok || "").trim();
  if (!tok) return null;

  const L = (tok[0] || "").toUpperCase();
  const nameChar = tok[1] || "";
  let acc = tok[2] || "-";

  if (acc !== "#" && acc !== "b" && acc !== "-") acc = "-";
  if (!L || !nameChar) return null;

  return { L, nameChar, acc };
}

function clearGearGrid() {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < AUDIOGEARSPACE; x++) gearGrid[y][x] = 0;
  }
}

async function applyGearCodeString(codeStr) {
  if (!_GEAR_LOOKUP) _GEAR_LOOKUP = buildGearLookup();

  const raw = String(codeStr || "").trim();
  if (!raw || raw.toLowerCase() === "") {
    clearGearGrid();
    await drawGear();
    updateGearReadout();
    showGearToast("✅ Gear cleared");
    return;
  }

  const tokens = raw.split(/[\s,]+/).filter(Boolean);

  clearGearGrid();

  const gd = new Uint8Array(AUDIOGEARSPACE * 2);

  let applied = 0;
  const errors = [];

  for (let x = 0; x < AUDIOGEARSPACE; x++) {
    const tok = tokens[x];
    if (!tok) break;

    const t = parseGearToken(tok);
    if (!t) { errors.push(`Bad token: ${tok}`); continue; }

    const y = NAME_TO_Y.get(t.nameChar);
    if (y == null) { errors.push(`Bad note char: ${t.nameChar} (${tok})`); continue; }

    const id = _GEAR_LOOKUP.get(`${t.L}|${t.acc}`);
    if (!id) { errors.push(`No note for: ${t.L}${t.nameChar}${t.acc}`); continue; }

    for (let yy = 0; yy < state.height; yy++) gearGrid[yy][x] = 0;
    gearGrid[y][x] = id;
    gd[x * 2] = id;
    gd[x * 2 + 1] = y;
    applied++;
  }

  if (applied > 0) warmUpGearSamples(gd).catch(() => {});

  await drawGear();
  updateGearReadout();

  if (applied > 0) showGearToast(`✅ Applied (${applied}/5)`);
  else showGearToast("❌ Nothing applied");

  if (errors.length) {
    console.warn("[GearCode] errors:", errors);
  }
}


async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

let _gearToastTimer = null;
function showGearToast(msg) {
  gearToastEl.textContent = msg;
  gearToastEl.style.display = "inline-block";
  clearTimeout(_gearToastTimer);
  _gearToastTimer = setTimeout(() => {
    gearToastEl.style.display = "none";
  }, 1200);
}

function computeGearCodeString(grid14x5) {
  let parts = [];
  for (let x = 0; x < AUDIOGEARSPACE; x++) {
    let foundId = 0;
    let foundY = 0;
    for (let y = 0; y < state.height; y++) {
      const id = grid14x5[y][x];
      if (id !== 0) { foundId = id; foundY = y; break; }
    }
    if (foundId !== 0) {
      const gi = NOTE_PACK.gearInfo[foundId];
      const letter = gi?.letter ?? '?';
      const accidental = gi?.accidental ?? '-';
      const nameChar = noteNames[foundY] ?? '?';
      parts.push(`${letter}${nameChar}${accidental}`);
    }
  }
  return parts.length ? parts.join(" ") : "";
}

function updateGearReadout() {
  if (!gearEditingCell) return;
  gearCodeEl.textContent = computeGearCodeString(gearGrid);

  const v = clamp(Number(gearVol.value || 100), 1, 100);
  gearVolTextEl.textContent = `Vol: ${v}`;
}

gearCodeEl.style.cursor = "pointer";
gearVolTextEl.style.cursor = "pointer";

gearCodeEl.addEventListener("click", async () => {
  const text = (gearCodeEl.textContent || "").trim();
  if (!text) return;
  const ok = await copyToClipboard(text);
  showGearToast(ok ? "✅ Copied Gear Code" : "❌ Copy failed");
});

gearVolTextEl.addEventListener("click", async () => {
  const raw = (gearVolTextEl.textContent || "").trim();
  const m = raw.match(/(\d+)/);
  const vol = m ? m[1] : "";
  if (!vol) return;
  const ok = await copyToClipboard(vol);
  showGearToast(ok ? `✅ Copied Volume (${vol})` : "❌ Copy failed");
});

function allowedInGear(noteId) {
  if (noteId === 0) return true;
  return NOTE_PACK.gearInfo[noteId]?.letter ? true : false;
}

function buildGearPalette(currentSelected) {
  gearPaletteGrid.innerHTML = "";
  const ids = NOTE_PACK.uiOrder
    .filter(v => v !== undefined)
    .filter(v => NOTE_PACK.notes[v] !== undefined)
    .filter(v => allowedInGear(v));

  for (const noteId of ids) {
    const btn = document.createElement("div");
    btn.className = "noteBtn";
    btn.dataset.id = String(noteId);

    const img = document.createElement("img");
    img.src = assetUrl(NOTE_PACK.notes[noteId].image);   
    img.loading = "lazy";
    btn.appendChild(img);

    btn.onclick = () => {
      gearSelectedNote = noteId;
      syncGearPaletteSelection();
    };

    gearPaletteGrid.appendChild(btn);
  }

  gearSelectedNote = allowedInGear(currentSelected) ? currentSelected : 0;
  syncGearPaletteSelection();
}


function syncGearPaletteSelection() {
  for (const el of gearPaletteGrid.querySelectorAll(".noteBtn")) {
    el.classList.toggle("selected", Number(el.dataset.id) === gearSelectedNote);
  }
}


function _vxToBaseColsCustom(vx, cols, baseCols) {
  if (cols <= 1) return 0;
  if (cols === baseCols) return vx;
  return Math.round(vx * (baseCols - 1) / (cols - 1));
}

function themeColorForGearCell(theme, gx, y) {
  if (!theme) return "#FFFFFF";

  if (theme.mode === "solid") return theme.color || "#FFFFFF";

  if (theme.mode === "row") {
    const arr = theme.rows || ["#FFFFFF"];
    return arr[y % arr.length] || "#FFFFFF";
  }

  if (theme.mode === "diag") {
    const baseCols = theme.baseCols || 25;
    const x = _vxToBaseColsCustom(gx, AUDIOGEARSPACE, baseCols);

    const sRow = theme.greyStartRow ?? 8;
    if (y >= sRow) {
      const startGrey = (baseCols - 1) - (y - sRow);
      if (x >= startGrey) {
        const level = x - startGrey;
        const g = theme.grey || ["#3E3E3E"];
        return g[Math.min(level, g.length - 1)] || g[g.length - 1];
      }
    }

    const d = x + y;
    const pal = theme.diag || [];
    return pal[Math.min(d, pal.length - 1)] || "#FFFFFF";
  }

  return "#FFFFFF";
}

function drawGearThemeBackground(ctx) {
  const theme = CANVAS_THEMES[canvasThemeIndex] || CANVAS_THEMES[0];
  const w = AUDIOGEARSPACE * GEAR_TILE;
  const h = state.height * GEAR_TILE;

  if (theme.mode === "diag") {
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < AUDIOGEARSPACE; x++) {
        ctx.fillStyle = themeColorForCell(theme, x, y);
        ctx.fillRect(x * GEAR_TILE, y * GEAR_TILE, GEAR_TILE, GEAR_TILE);
      }
    }
  } else {
    for (let y = 0; y < state.height; y++) {
      ctx.fillStyle = themeColorForCell(theme, 0, y);
      ctx.fillRect(0, y * GEAR_TILE, w, GEAR_TILE);
    }
  }

  ctx.save();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;     
  ctx.globalAlpha = 1;

  ctx.beginPath();

  for (let x = 0; x <= AUDIOGEARSPACE; x++) {
    const px = x * GEAR_TILE + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
  }

  for (let y = 0; y <= state.height; y++) {
    const py = y * GEAR_TILE + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
  }

  ctx.stroke();
  ctx.restore();
}


async function playGearNotePreview(noteId, yPos) {
  const path = NOTE_PACK.notes[noteId]?.sounds?.[yPos];
  if (!path) return;

  const gearVol01 = (clamp(Number(gearVol.value || 100), 1, 100) / 100) * (Number(inpVol.value || 100) / 100);

  await audioCtx.resume();
  await getBuf(path);
  playSample(path, gearVol01);
}

async function playGearCompositePreview() {
  if (!gearEditingCell || !gearGrid || !audioCtx || !fx?.input) return;
  const notes = [];
  for (let x = 0; x < AUDIOGEARSPACE; x++) {
    for (let y = 0; y < state.height; y++) {
      const noteId = gearGrid[y]?.[x] || 0;
      if (noteId !== 0) { notes.push({ noteId, yPos: y }); break; }
    }
  }
  if (notes.length === 0) return;

  const gearVol01 =
    (clamp(Number(gearVol.value || 100), 1, 100) / 100) *
    (Number(inpVol.value || 100) / 100);

  await audioCtx.resume();

  const uniqPaths = [];
  const seen = new Set();
  for (const n of notes) {
    const p = NOTE_PACK.notes[n.noteId]?.sounds?.[n.yPos];
    if (p && !seen.has(p)) { seen.add(p); uniqPaths.push(p); }
  }

  const bufs = await Promise.all(uniqPaths.map(p => getBuf(p)));
  const bufMap = new Map();
  for (let i = 0; i < uniqPaths.length; i++) {
    bufMap.set(uniqPaths[i], bufs[i]);
  }

  const t = audioCtx.currentTime + 0.02;

  for (const n of notes) {
    const path = NOTE_PACK.notes[n.noteId]?.sounds?.[n.yPos];
    const buf = path ? bufMap.get(path) : null;
    if (!buf) continue;

    const src = audioCtx.createBufferSource();
    src.buffer = buf;

    const gain = audioCtx.createGain();
    gain.gain.value = gearVol01;

    src.connect(gain).connect(fx.input);
    src.start(t);
  }
}

async function drawGear() {
  gctx.clearRect(0, 0, gearCanvas.width, gearCanvas.height);

  drawGearThemeBackground(gctx);

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < AUDIOGEARSPACE; x++) {
      const id = gearGrid[y][x];
      const note = NOTE_PACK.notes[id];

      if (id !== 0 && note?.image) {
        try {
          const img = await loadImg(note.image);
          gctx.drawImage(img, x * GEAR_TILE, y * GEAR_TILE, GEAR_TILE, GEAR_TILE);
        } catch {}
      }

      gctx.strokeStyle = "rgba(0,0,0,0.08)";
      gctx.strokeRect(x * GEAR_TILE, y * GEAR_TILE, GEAR_TILE, GEAR_TILE);
    }
  }
}

function openGearEditor(cellObj, ax, y) {
  gearEditingCell = cellObj;
  gearEditingPos = { x: ax, y };

  resizeGearCanvas();

  gearGrid = Array.from({ length: state.height }, () => Array(AUDIOGEARSPACE).fill(0));
  const gd = cellObj.gearData;
  for (let i = 0; i < AUDIOGEARSPACE; i++) {
    const noteId = gd[i * 2];
    const yPos = gd[i * 2 + 1];
    if (noteId !== 0 && yPos >= 0 && yPos < state.height) {
      gearGrid[yPos][i] = noteId;
    }
  }

  warmUpGearSamples(gd).catch(() => {});
  gearVol.value = String(cellObj.volume ?? 100);
  buildGearPalette(selectedNote);

  modalBack.style.display = "flex";
  kmModalLock();
  drawGear();
  updateGearReadout();
  if (gearCodeInput) gearCodeInput.value = (gearCodeEl.textContent || "").trim();
}

function closeGearEditor() {
  if (modalBack.style.display === "flex") {
    modalBack.style.display = "none";
    kmModalUnlock();
  } else {
    modalBack.style.display = "none";
  }
  gearEditingCell = null;
  gearEditingPos = null;
}

gearVol.addEventListener("input", () => updateGearReadout());

if (gearCodeApply) {
  gearCodeApply.onclick = async () => {
    if (!gearCodeInput) return;
    await applyGearCodeString(gearCodeInput.value);
  };
}

let gearPreviewBtn = document.getElementById("gearPreviewBtn");
if (gearCodeApply && !gearPreviewBtn) {
  gearPreviewBtn = document.createElement("button");
  gearPreviewBtn.id = "gearPreviewBtn";
  gearPreviewBtn.type = "button";
  gearPreviewBtn.textContent = "🔊";
  gearPreviewBtn.title = "Preview Gear Sound";
  gearPreviewBtn.className = gearCodeApply.className || "";
  gearPreviewBtn.style.marginLeft = "6px";
  gearCodeApply.insertAdjacentElement("afterend", gearPreviewBtn);
}
if (gearPreviewBtn) {
  gearPreviewBtn.onclick = async () => {
    await playGearCompositePreview();
  };
}
if (gearCodeClear) {
  gearCodeClear.onclick = async () => {
    if (gearCodeInput) gearCodeInput.value = "NoData";
    await applyGearCodeString("NoData");
  };
}
if (gearCodeInput) {
  gearCodeInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await applyGearCodeString(gearCodeInput.value);
    }
  });
}


gearCanvas.addEventListener("pointerdown", async (e) => {
  gearCanvas.setPointerCapture(e.pointerId);

  const hit = getCanvasTileFromEvent(e, gearCanvas, AUDIOGEARSPACE, state.height, GEAR_TILE);
  if (!hit) return;

  const isRight = (e.button === 2);

  const placedId = (!isRight) ? gearSelectedNote : 0;
  const placedY = hit.y;

  if (isRight) {
    gearGrid[hit.y][hit.x] = 0;
  } else {
    if (!allowedInGear(gearSelectedNote)) return;
    for (let yy = 0; yy < state.height; yy++) gearGrid[yy][hit.x] = 0;
    gearGrid[hit.y][hit.x] = gearSelectedNote;
  }

  await drawGear();
  updateGearReadout();

  if (!isRight && placedId !== 0) {
    playGearNotePreview(placedId, placedY).catch(() => {});
  }
});

gearCanvas.addEventListener("contextmenu", e => e.preventDefault());

gearDone.onclick = () => {
  if (!gearEditingCell || !gearEditingPos) return;

  const bx = gearEditingPos.x;
  const by = gearEditingPos.y;
  const before = cloneCell(state.grid[by][bx]);

  const gd = new Uint8Array(AUDIOGEARSPACE * 2);
  for (let x = 0; x < AUDIOGEARSPACE; x++) {
    let found = 0;
    let foundY = 0;
    for (let y = 0; y < state.height; y++) {
      if (gearGrid[y][x] !== 0) { found = gearGrid[y][x]; foundY = y; break; }
    }
    gd[x * 2] = found;
    gd[x * 2 + 1] = found ? foundY : 0;
  }

  const newCell = {
    id: state.audioGearID,
    gearData: gd,
    volume: clamp(Number(gearVol.value || 100), 1, 100),
  };

  state.grid[by][bx] = newCell;

  const after = cloneCell(state.grid[by][bx]);
  if (!cellsEqual(before, after)) pushHistoryCell(bx, by, before, after);

  refreshMaxX();
  updateGearReadout();
  closeGearEditor();
  draw();
};

gearCancel.onclick = () => closeGearEditor();

cv.addEventListener("pointerdown", async (e) => {
  cv.setPointerCapture(e.pointerId);

  if (modalBack.style.display === "flex") return;

  const hit = getCanvasTileFromEvent(e, cv, pageWidth, state.height, TILE, LABEL_WIDTH);
  if (!hit) return;

  const ax = hit.x + songXOffset;
  const y = hit.y;
  const isRight = (e.button === 2);

  if (!isRight && !selectionMode && audioConvertOn && selectedNote === state.audioGearID) {
    const cell = state.grid[y][ax];
    const nid = cellId(cell);
    if (nid && nid !== state.audioGearID && noteAllowedInAudioGear(nid)) {
      audioConvertArmHold(ax, y, nid, e);
      return;
    }
  }

  if (selectionMode) {
    if (isRight) {
      clearSelection();
      draw();
      return;
    }

    if (pasteArmed && pasteClipCache) {
      pastePreviewX = ax;
      const did = pasteClipAtFixedYWithHistory(pastePreviewX, pasteClipCache);
      setPasteArmed(false, null);
      showStatus(did ? "Pasted!" : "Nothing pasted.");
      draw();
      return;
    }

    isSelecting = true;

    if (e.shiftKey && hasSelection() && selAnchorX !== -1 && selAnchorY !== -1) {
      sel.x1 = selAnchorX; sel.y1 = selAnchorY;
      sel.x2 = ax; sel.y2 = y;
    } else {
      selAnchorX = ax;
      selAnchorY = y;
      sel.x1 = ax; sel.y1 = y;
      sel.x2 = ax; sel.y2 = y;
    }

    draw();
    return;
  }

  if (!isRight) {
    const cell = state.grid[y][ax];
    const id = cellId(cell);
    if (id === state.audioGearID && typeof cell !== "number") {
      await audioCtx.resume();
      openGearEditor(cell, ax, y);
      return;
    }
  }

  beginPaintSession();
  paintButtonRight = isRight;

  await paintAt(ax, y, paintButtonRight, !paintStarted);
  draw();
});

cv.addEventListener("pointermove", async (e) => {
  if (modalBack.style.display === "flex") return;

  const hit = getCanvasTileFromEvent(e, cv, pageWidth, state.height, TILE, LABEL_WIDTH);
  if (!hit) return;

  let ax = hit.x + songXOffset;
  const y = hit.y;

  if (_acHold && _acHold.pointerId === e.pointerId) {
    const dx = Math.abs(e.clientX - _acHold.clientX);
    const dy = Math.abs(e.clientY - _acHold.clientY);
    if (dx > AUDIO_CONVERT_MOVE_PX || dy > AUDIO_CONVERT_MOVE_PX) {
      audioConvertCancelHold();
      beginPaintSession();
      paintButtonRight = false;
      await paintAt(ax, y, false, !paintStarted);
      draw();
    }
    return;
  }

  if (selectionMode) {

    selectionAutoPageScrollIfNeeded(e);

    ax = hit.x + songXOffset;

    if (isSelecting) {
      sel.x2 = ax;
      sel.y2 = y;
      draw();
      return;
    }
    if (pasteArmed && pasteClipCache) {
      pastePreviewX = ax;
      draw();
      return;
    }
    return;
  }

  if (!isPainting) return;

  const leftDown = (e.buttons & 1) === 1;
  const rightDown = (e.buttons & 2) === 2;

  if (paintButtonRight && !rightDown) {
    endPaintSession();
    return;
  }
  if (!paintButtonRight && !leftDown) {
    endPaintSession();
    return;
  }

  await paintAt(ax, y, paintButtonRight, false);
  draw();
});

cv.addEventListener("pointerup", () => {
  if (modalBack.style.display === "flex") return;

  if (_acHold) {
    const h = _acHold;
    audioConvertCancelHold();

    beginPaintSession();
    paintButtonRight = false;
    paintAt(h.ax, h.y, false, true);
    draw();
    endPaintSession();
    return;
  }

  if (selectionMode) {
    if (isSelecting) {
      isSelecting = false;
      showStatus("Selected. Copy/Paste ready.");
      draw();
    }
    return;
  }

  endPaintSession();
});

cv.addEventListener("pointercancel", () => {
  audioConvertCancelHold();
  if (selectionMode) {
    isSelecting = false;
    return;
  }
  endPaintSession();
});

cv.addEventListener("contextmenu", e => e.preventDefault());


btnPrevPage.onclick = pageLeft;
btnNextPage.onclick = pageRight;
if (btnZoom) {
  btnZoom.type = "button";
  btnZoom.onclick = () => applyZoom(!zoomOn);
}

ensureThemeButton();
if (btnTheme) {
  btnTheme.type = "button";
  updateThemeButtonText();
  btnTheme.onclick = () => nextCanvasTheme();
}


if (inpSongWidth) inpSongWidth.value = String(state.width);
if (btnLength && inpSongWidth) {
  btnLength.onclick = () => resizeSongWidth(parseInt(inpSongWidth.value, 10));
  inpSongWidth.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); btnLength.click(); }
  });
}

btnImport.onclick = () => fileImport.click();
if (btnLibrary) btnLibrary.onclick = () => openSongLibrary();


btnExport.onclick = async () => {
  try { await exportAsManual(); }
  catch (err) { alert(String(err)); }
};

if (btnExportMidi) {
  btnExportMidi.onclick = async () => {
    try { await exportAsMidi(); }
    catch (err) { alert(String(err)); }
  };
}

if (btnExportWav) {
  btnExportWav.onclick = async () => {
    try {
      await exportWavCurrentSongOnePass();
    } catch (err) {
      try { wavProgressHide(); } catch {}
      console.error(err);
      alert("WAV export failed: " + (err?.message || String(err)));
    }
  };
}



if (btnSave) {
  btnSave.onclick = async () => {
    try { await saveOverwrite(); }
    catch (err) { alert(String(err)); }
  };
}

if (btnUndo) btnUndo.onclick = () => undo();
if (btnRedo) btnRedo.onclick = () => redo();
if (btnReset) btnReset.onclick = () => resetSongCanvas();

if (btnSelToggle) {
  btnSelToggle.onclick = () => {
    selectionMode = !selectionMode;

    if (!selectionMode) {
      clearSelection();
      setPasteArmed(false, null);
    }

    updateSelectionButtons();
    showStatus(selectionMode ? "Selection ON" : "Selection OFF");
  };
}

if (btnSelCopy) btnSelCopy.onclick = () => copySelectionToClipboard();
if (btnSelCut) btnSelCut.onclick = () => cutSelectionToClipboard();
if (btnSelPaste) btnSelPaste.onclick = () => armPaste();

function applyImportedSong(parsed, displayName = "Library Song") {
  state = {
    ver: parsed.ver,
    audioGearID: parsed.audioGearID,
    bpm: parsed.bpm,
    width: clamp(parsed.width, SONG_WIDTH_MIN, SONG_WIDTH_MAX),
    height: parsed.height,
    metadata: parsed.metadata ?? "",
    grid: parsed.grid
  };

  repeatUsed = Array.from({ length: state.height }, () => Array(state.width).fill(false));
  refreshMaxX();
  resetPlayState();

  playing = false;
  paused = false;
  clearInterval(timer);
  timer = null;

  setSongXOffset(0);
  playPos = 0;
  currentPlayPosition = 0;

  undoStack.length = 0;
  redoStack.length = 0;

  try { selectionMode = false; } catch {}
  try { clearSelection(); } catch {}
  try { setPasteArmed(false, null); } catch {}
  try { updateSelectionButtons(); } catch {}

  try { fileHandle = null; } catch {}

  try { _warmUsedPromise = null; } catch {}

  try { inpBpm.value = String(state.bpm); } catch {}
  try { inpMeta.value = state.metadata; } catch {}
  try { if (inpSongWidth) inpSongWidth.value = String(state.width); } catch {}

  try { resizeGearCanvas(); } catch {}

  try { markBaseDirty(); } catch {}
  updateTransportUI();
  draw();
  scheduleAutosave();

  statusEl.textContent = `Loaded: ${displayName}`;
}


fileImport.onchange = async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  rememberProjectName(f.name);

  try {
    const buf = await f.arrayBuffer();
    const parsed = parseGmsfV1(buf);
    applyImportedSong(parsed, f.name);
  } catch (err) {
    alert("Import failed: " + String(err));
  } finally {
    fileImport.value = "";
  }
};



inpBpm.onchange = () => {
  state.bpm = clamp(Number(inpBpm.value || 100), 1, 32766);
  inpBpm.value = String(state.bpm);
  if (playing) {
    clearInterval(timer);
    timer = setInterval(tick, bpmMs(state.bpm));
  }
  scheduleAutosave();
  draw();
};

inpMeta.oninput = () => {
  state.metadata = inpMeta.value ?? "";
  scheduleAutosave();
};

function findFirstNonEmptyX() {
  for (let x = 0; x < state.width; x++) {
    if (columnHasAnyNote(x)) return x;
  }
  return 0;
}

btnPlay.onclick = async () => {
  await audioCtx.resume();

  if (playing) {
    stopPlayback();
    return;
  }

  const startX = findFirstNonEmptyX(); 
  showStatus("Loading samples…", 2000);
  await warmUpAudioAround(startX, 60);
  await warmUpUsedSamples();
  await startFromFirstNote();
};


btnPause.onclick = async () => {
  await audioCtx.resume();

  if (playing) {
    pausePlayback();
    return;
  }

  if (paused) {
    await resumeFromCurrentView();
    return;
  }

  if (songXOffset > 0) {
    await startFromCurrentView();
  }
};

function kmApplySpaceButtonTheme() {
  if (document.getElementById("km-space-btn-style")) return;

  const st = document.createElement("style");
  st.id = "km-space-btn-style";
  st.textContent = `
    #btnExport, #btnImport, #btnLength{
      appearance:none;
      border: 1px solid rgba(255,255,255,.16);
      background:
        radial-gradient(420px 220px at 20% 20%, rgba(120,64,255,.22), transparent 55%),
        radial-gradient(420px 220px at 80% 30%, rgba(0,204,255,.18), transparent 55%),
        rgba(255,255,255,.06);
      color: rgba(240,244,255,.92);
      border-radius: 14px;
      padding: 10px 12px;
      font-weight: 900;
      letter-spacing: .2px;
      cursor: pointer;
      box-shadow: 0 10px 40px rgba(0,0,0,.35);
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    #btnExport:hover, #btnImport:hover, #btnLength:hover{
      transform: translateY(-1px);
      border-color: rgba(0,204,255,.35);
      box-shadow: 0 14px 60px rgba(0,0,0,.45);
    }

    #btnExport:active, #btnImport:active, #btnLength:active{
      transform: translateY(0px) scale(.99);
      box-shadow: 0 10px 36px rgba(0,0,0,.38);
    }

    #btnExport:focus-visible, #btnImport:focus-visible, #btnLength:focus-visible{
      outline: none;
      box-shadow: 0 0 0 3px rgba(0,204,255,.22), 0 14px 60px rgba(0,0,0,.45);
      border-color: rgba(0,204,255,.45);
    }

    #btnExport{
      border-color: rgba(0,204,255,.30);
      background:
        radial-gradient(420px 220px at 20% 20%, rgba(120,64,255,.24), transparent 55%),
        radial-gradient(420px 220px at 80% 30%, rgba(0,204,255,.22), transparent 55%),
        rgba(0,204,255,.10);
    }

    @media (max-width: 520px){
      #btnExport, #btnImport, #btnLength{
        padding: 9px 10px;
        border-radius: 12px;
        font-weight: 900;
      }
    }
  `;
  document.head.appendChild(st);
}

kmApplySpaceButtonTheme();

window.addEventListener("keydown", async (e) => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === "input") return;

  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  if (e.key === "Escape") {
    if (pasteArmed) {
      cancelPaste();
      return;
    }
    if (selectionMode && (hasSelection() || isSelecting)) {
      clearSelection();
      showStatus("Selection cleared.");
      draw();
      return;
    }
  }

  if (selectionMode && mod && key === "c") {
    e.preventDefault();
    await copySelectionToClipboard();
    return;
  }
  if (selectionMode && mod && key === "v") {
    e.preventDefault();
    await armPaste();
    return;
  }

  if (selectionMode && mod && key === "a") {
    e.preventDefault();
    sel.x1 = songXOffset;
    sel.y1 = 0;
    sel.x2 = Math.min(songXOffset + pageWidth - 1, state.width - 1);
    sel.y2 = state.height - 1;
    isSelecting = false;
    draw();
    showStatus("Selected current view.");
    return;
  }

  if (mod && key === "s") {
    e.preventDefault();
    try { await saveOverwrite(); } catch {}
    return;
  }

  if (mod && key === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (mod && key === "y") {
    e.preventDefault();
    redo();
    return;
  }

  if (key === "b") {
    e.preventDefault();
    if (modalBack.style.display === "flex") closeGearEditor();
    return;
  }

  if (e.key === " ") {
    e.preventDefault();
    btnPlay.click();
    return;
  }
  if (key === "p") {
    e.preventDefault();
    btnPause.click();
    return;
  }

  if (e.key === "ArrowLeft") pageLeft();
  if (e.key === "ArrowRight") pageRight();

  if (mod && key === "o") {
    e.preventDefault();
    btnImport.click();
  }
});

const SONG_LIB_URL = "./songs/library.json"; 
let _songLibCache = null;

function ensureSongLibraryModal() {
  if (document.getElementById("songLibBack")) return;

  const style = document.createElement("style");
  style.textContent = `
    #songLibBack{
      position:fixed; inset:0;
      background:rgba(0,0,0,.38);
      display:none;
      align-items:center;
      justify-content:center;
      z-index:140;
      padding: 12px;
    }
    #songLibModal{
      width:min(760px, 96vw);
      max-height:min(82vh, 720px);
      overflow:auto;
      background: var(--ui-surface, #fff);
      border-radius:16px;
      border:1px solid rgba(0,0,0,.12);
      box-shadow:0 16px 60px rgba(0,0,0,.25);
      padding: 10px;
    }
    #songLibTop{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:10px;
      flex-wrap:wrap;
      position: sticky;
      top:0;
      background: var(--ui-card, rgba(255,255,255,.92));
      backdrop-filter: blur(6px);
      padding: 8px 8px;
      border-bottom:1px solid rgba(0,0,0,.08);
      border-radius:14px;
      z-index:2;
    }
    #songLibTop h3{ margin:0; font-size:14px; font-weight:900; }
    #songLibTop .sub{ margin-top:2px; font-size:11px; opacity:.75; }
    #songLibSearch{
      width: min(320px, 92vw);
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid rgba(0,0,0,.16);
      outline: none;
      font-family: ui-monospace, Menlo, monospace;
      font-size: 12px;
    }
    #songLibList{
      margin-top: 10px;
      display:grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .songItem{
      border:1px solid var(--ui-border, rgba(0,0,0,.10));
      border-radius: 14px;
      padding: 10px;
      background: #fff;
      display:flex;
      gap:10px;
      align-items:flex-start;
      justify-content:space-between;
      flex-wrap:wrap;
    }
    .songInfo{
      min-width: 0;
      flex: 1 1 auto;
    }
    .songTitle{
      font-weight: 950;
      font-size: 13px;
      margin:0;
    }
    .songMeta{
      margin-top:4px;
      font-size: 11px;
      opacity:.78;
      line-height:1.35;
      white-space: pre-wrap;
    }
    .songBtns{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      align-items:center;
      flex: 0 0 auto;
    }
    .songBtn{
      border-radius: 12px;
      padding: 8px 10px;
      border:1px solid var(--ui-border-soft, rgba(0,0,0,.14));
      background: var(--ui-surface, #fff);
      cursor:pointer;
      font-weight:900;
    }
    .songBtn.primary{
      background: var(--ui-primary-bg, #111);
      border-color: var(--ui-primary-border, #111);
      color: var(--ui-primary-text, #fff);
    }
  `;
  document.head.appendChild(style);

  const back = document.createElement("div");
  back.id = "songLibBack";

  const modal = document.createElement("div");
  modal.id = "songLibModal";
  modal.innerHTML = `
    <div id="songLibTop">
      <div>
        <h3>Public Song Library</h3>
        <div class="sub">Click a song to import instantly (server hosted .GMSF)</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <input id="songLibSearch" type="text" placeholder="Search song title / artist / bpm...">
        <button id="songLibClose" class="songBtn">Close</button>
      </div>
    </div>
    <div id="songLibList"></div>
  `;
  back.appendChild(modal);
  document.body.appendChild(back);

  back.addEventListener("click", (e) => { if (e.target === back) closeSongLibrary(); });
  modal.querySelector("#songLibClose").onclick = closeSongLibrary;

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && back.style.display === "flex") closeSongLibrary();
  });
}

function openSongLibrary() {
  ensureSongLibraryModal();
  const back = document.getElementById("songLibBack");
  back.style.display = "flex";
  loadAndRenderSongLibrary();
}

function closeSongLibrary() {
  const back = document.getElementById("songLibBack");
  if (back) back.style.display = "none";
}

async function fetchSongLibrary() {
  if (_songLibCache) return _songLibCache;
  const resp = await fetch(SONG_LIB_URL, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Library HTTP ${resp.status}`);
  const data = await resp.json();
  if (!Array.isArray(data)) throw new Error("library.json must be an array");
  _songLibCache = data;
  return data;
}

async function importSongFromLibrary(item) {
  try {
    const url = `./songs/${encodeURIComponent(item.file)}`;
    showStatus("Downloading song…", 1500);

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Song HTTP ${resp.status}`);

    const buf = await resp.arrayBuffer();
    const parsed = parseGmsfV1(buf);

    applyImportedSong(parsed, item.title || item.file);
    closeSongLibrary();
  } catch (err) {
    alert("Library import failed: " + String(err));
  }
}

async function loadAndRenderSongLibrary() {
  const listEl = document.getElementById("songLibList");
  const searchEl = document.getElementById("songLibSearch");
  if (!listEl || !searchEl) return;

  listEl.innerHTML = `<div style="opacity:.75; font-size:12px;">Loading…</div>`;

  let data = [];
  try {
    data = await fetchSongLibrary();
  } catch (err) {
    listEl.innerHTML = `<div style="color:#b91c1c;font-weight:900;">Failed to load library.json</div>`;
    console.warn(err);
    return;
  }

  const render = () => {
    const q = (searchEl.value || "").trim().toLowerCase();
    const filtered = !q ? data : data.filter(it => {
      const t = String(it.title || "").toLowerCase();
      const a = String(it.artist || "").toLowerCase();
      const b = String(it.bpm ?? "").toLowerCase();
      const n = String(it.note || "").toLowerCase();
      return (t.includes(q) || a.includes(q) || b.includes(q) || n.includes(q));
    });

    listEl.innerHTML = "";
    if (!filtered.length) {
      listEl.innerHTML = `<div style="opacity:.75; font-size:12px;">No songs found.</div>`;
      return;
    }

    for (const it of filtered) {
      const row = document.createElement("div");
      row.className = "songItem";

      const info = document.createElement("div");
      info.className = "songInfo";
      info.innerHTML = `
        <div class="songTitle">${it.title || it.file}</div>
        <div class="songMeta">
Artist: ${it.artist || "-"}  |  BPM: ${it.bpm ?? "-"}
${it.note ? ("Note: " + it.note) : ""}
File: ${it.file}
        </div>
      `;

      const btns = document.createElement("div");
      btns.className = "songBtns";

      const btnImport = document.createElement("button");
      btnImport.type = "button";
      btnImport.className = "songBtn primary";
      btnImport.textContent = "Import";
      btnImport.onclick = () => importSongFromLibrary(it);

      btns.appendChild(btnImport);

      row.appendChild(info);
      row.appendChild(btns);
      listEl.appendChild(row);
    }
  };

  searchEl.oninput = render;
  render();
}



function ensureSpaceScrollbars(){
  const id = "km-space-scrollbar-style";
  if (document.getElementById(id)) return;

  const st = document.createElement("style");
  st.id = id;
  st.textContent = `
    :root{
      scrollbar-width: thin;
    }

    html[data-ui-theme="dark"]{
      scrollbar-color: rgba(0,204,255,.55) rgba(8,10,24,.55);
    }
    html[data-ui-theme="light"]{
      scrollbar-color: rgba(120,64,255,.55) rgba(255,255,255,.75);
    }

    ::-webkit-scrollbar{
      width: 10px;
      height: 10px;
    }

    ::-webkit-scrollbar-track{
      background: rgba(8,10,24,.55);
      border-radius: 999px;
    }
    html[data-ui-theme="light"] ::-webkit-scrollbar-track{
      background: rgba(255,255,255,.78);
      border: 1px solid rgba(0,0,0,.10);
    }

    ::-webkit-scrollbar-thumb{
      background: linear-gradient(180deg, rgba(0,204,255,.60), rgba(120,64,255,.55));
      border-radius: 999px;
      border: 2px solid rgba(8,10,24,.55);
    }
    html[data-ui-theme="light"] ::-webkit-scrollbar-thumb{
      background: linear-gradient(180deg, rgba(120,64,255,.55), rgba(0,204,255,.50));
      border: 2px solid rgba(255,255,255,.78);
    }

    ::-webkit-scrollbar-thumb:hover{
      background: linear-gradient(180deg, rgba(0,204,255,.80), rgba(255,80,190,.55));
    }
    html[data-ui-theme="light"] ::-webkit-scrollbar-thumb:hover{
      background: linear-gradient(180deg, rgba(120,64,255,.70), rgba(255,80,190,.42));
    }

    ::-webkit-scrollbar-corner{
      background: transparent;
    }
  `;
  document.head.appendChild(st);
}

(async function init() {
  await buildPalette();

  ensureSpaceScrollbars();

  resizeGearCanvas();

  await restoreAutosaveIfAny();

  applyZoom(false);
  resizeMainCanvas();

  ensureThemeButton();
  updateThemeButtonText();

  inpBpm.value = String(state.bpm);
  inpMeta.value = state.metadata;

  refreshMaxX();
  updateTransportUI();

  updateSelectionButtons();

  draw();

  injectAudioPanel();
  injectStatsUI();
  injectAudioConvertUI();
  injectCredits();

  audioConvertUpdateUI();
  statusEl.textContent = "Ready";
})();
