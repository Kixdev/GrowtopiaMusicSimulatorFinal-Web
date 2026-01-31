import { NOTE_PACK, AUDIOGEARSPACE } from "./notePack.js";
import { parseGmsfV1, writeGmsfV1, download } from "./gmsf.js";

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

  bar.innerHTML = `
    <div>
      <b>${new Date().getFullYear()} Growtopia Music Simulator MyLegGuy</b>
      <span style="opacity:.8"> - Web Ver by <b>KIXDEV</b></span>
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
      <span style="opacity:.85">Join <b>MusicStore</b> - Growtopia Music Community (Midman & Composer Hub)</span>
      <a href="${DISCORD_URL}" target="_blank" rel="noopener"
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

  // reset Audio Convert buffer
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



/* =======================
   UI Theme (Light/Dark) — header toggle only
   ======================= */
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

/* =======================
   WAV Export (One pass)
   ======================= */

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

const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const btnLibrary = document.getElementById("btnLibrary");

const fileImport = document.getElementById("fileImport");

const btnSelToggle = document.getElementById("btnSelToggle");
const btnSelCopy = document.getElementById("btnSelCopy");
const btnSelPaste = document.getElementById("btnSelPaste");

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


// zoom config
const VIEW_COLS_NORMAL = 25;
const VIEW_COLS_ZOOM = 10;
const TILE_NORMAL = 32;

const TILE_ZOOM = Math.round((VIEW_COLS_NORMAL * TILE_NORMAL) / VIEW_COLS_ZOOM); 
let zoomOn = false;

/* =======================
   Canvas Theme
   ======================= */
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

  ctx2.save();
  ctx2.strokeStyle = "#000";     
  ctx2.lineWidth = 3;            
  ctx2.globalAlpha = 1;         

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

// split
fx.comp.connect(fx.dry);
fx.dry.connect(fx.master);

fx.comp.connect(fx.reverb);
fx.reverb.connect(fx.wet);
fx.wet.connect(fx.master);

fx.master.connect(audioCtx.destination);

// impulse + saturation helpers
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

// defaults
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
  // reverb off
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
  // Reverb wet/dry + IR
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
  // EQ
  for (const k in _audioUI.eq) {
    const ui = _audioUI.eq[k];
    if (!ui) continue;
    ui.input.value = String(eqSettings[k]);
    ui.val.textContent = fmtDB(eqSettings[k]);
  }
  // FX
  for (const k in _audioUI.fx) {
    const ui = _audioUI.fx[k];
    if (!ui) continue;
    ui.input.value = String(fxSettings[k]);
    ui.val.textContent = ui.format(fxSettings[k]);
  }
}

/* =======================
   Inject Audio Panel (Tabs + 2 Cards)
   ======================= */
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
        /* mobile tab behavior: hide non-active card */
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

  // ---------- slider builder ----------
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

  // ---------- EQ card ----------
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

  // ---------- FX card ----------
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

  // place panel in left card
  const wrapRoot = document.getElementById("wrap");
  const leftCard = wrapRoot ? wrapRoot.querySelector(".card") : null;
  if (leftCard) leftCard.appendChild(panel);
  else document.body.appendChild(panel);

  // init tab visual + slider values
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

      // gear
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

      // normal note
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


// ---------- Instrument map (letter -> instrument)
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

// order tampil (biar rapi)
const INSTR_ORDER = ["piano","bass","drum","sax","flute","guitar","violin","lyre","eguitar","trumpet","spooky","festive","repeat","blank","gear","other"];

function keyName(key){
  if (key === "gear") return "Audio Rack / Gear";
  if (key === "repeat") return "Repeat (Start+End)";
  if (key === "blank") return "Blank / Rest";
  if (key === "spooky") return "Spooky";
  if (key === "festive") return "Festive";
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
    img.includes("repeatstart") || img.includes("repeatend") ||
    (img.includes("repeat") && (img.includes("start") || img.includes("end"))) ||
    img.includes("repeat_begin") || img.includes("repeat_end")
  ) return "repeat";

  if (img.includes("blank") || img.includes("rest") || img.includes("empty") || img.includes("clear") || img.includes("none")) return "blank";

  if (img.includes("spooky") || img.includes("halloween") || img.includes("spook")) return "spooky";
  if (img.includes("festive") || img.includes("christmas") || img.includes("xmas") || img.includes("holiday")) return "festive";

  if (!noteHasAnySound(noteId)) return "blank";

  return "other";
}

function classifyNoteId(noteId){
  if (SPECIAL_IDS.gear == null) refreshSpecialIDs();

  if (SPECIAL_IDS.gear != null && noteId === SPECIAL_IDS.gear) return { key: "gear", acc: null };

  if (SPECIAL_IDS.repeatStart != null && noteId === SPECIAL_IDS.repeatStart) return { key: "repeat", acc: null };
  if (SPECIAL_IDS.repeatEnd   != null && noteId === SPECIAL_IDS.repeatEnd)   return { key: "repeat", acc: null };

  const gi = NOTE_PACK?.gearInfo?.[noteId];
  if (gi && gi.letter){
    const L = String(gi.letter).toUpperCase();
    const map = LETTER_MAP[L];
    const key = map ? map.key : "other";
    const acc = (gi.accidental === "#" || gi.accidental === "b") ? gi.accidental : "-";
    return { key, acc };
  }

  return { key: inferKeyFallback(noteId), acc: null };
}

const _iconCache = new Map();
function findIconIdForKey(key){
  if (_iconCache.has(key)) return _iconCache.get(key);

  if (key === "gear"){
    const id = SPECIAL_IDS.gear ?? state.audioGearID;
    _iconCache.set(key, id || 0);
    return id || 0;
  }

  if (key === "repeat"){
    const id = SPECIAL_IDS.repeatStart ?? SPECIAL_IDS.repeatEnd ?? 0;
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

// ---------- Stats engine
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

  // init buckets
  for (const L in LETTER_MAP) ensure(LETTER_MAP[L].key);
  ensure("spooky"); ensure("festive"); ensure("repeat"); ensure("blank"); ensure("gear"); ensure("other");

  let nonZero = 0;
  let gearTilesTotal = 0;
  let gearSlotsTotal = 0;

  for (let y=0; y<height; y++){
    for (let x=0; x<width; x++){
      const cell = state.grid[y][x];
      const id = (typeof cell === "number") ? cell : cell.id;
      if (id === 0) continue;
      nonZero++;

      // gear tile
      if (id === state.audioGearID && typeof cell !== "number"){
        gearTilesTotal++;
        const g = ensure("gear");
        g.placed++;
        g.gearTiles++;

        const gd = cell.gearData;
        if (gd && gd.length >= AUDIOGEARSPACE*2){
          for (let i=0;i<AUDIOGEARSPACE;i++){
            const nid = gd[i*2];
            if (nid !== 0){
              gearSlotsTotal++;
              const cls = classifyNoteId(nid);
              const b = ensure(cls.key);
              b.gearSlots++;

              if (cls.acc === "#") b.gearSlotsS++;
              else if (cls.acc === "b") b.gearSlotsF++;
              else if (cls.acc === "-") b.gearSlotsN++;
            }
          }
        }
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

  const list = INSTR_ORDER.map(k => buckets.get(k)).filter(Boolean);

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
    }
    #statsModal{
      width: min(560px, 96vw);
      max-height: min(72vh, 520px);
      overflow:auto;
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
        <div class="sub">Detect: Normal / Sharp / Flat + Spooky/Festive/Repeat/Blank</div>
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
  renderStatsModal();
  back.style.display = "flex";
}
function closeStatsModal(){
  const back = document.getElementById("statsBack");
  if (!back) return;
  back.style.display = "none";
}

function renderStatsModal(){
  const s = computeSongStats();
  const sum = document.getElementById("statsSummary");
  const grid = document.getElementById("statsGrid");
  if (!sum || !grid) return;

  sum.innerHTML = `
    <div class="statCard">
      <div class="k">Total Placed Notes</div>
      <div class="v">${s.placedNotes}</div>
      <div class="k">Include sharp/flat + spooky/festive + repeat + blank</div>
    </div>
    <div class="statCard">
      <div class="k">Audio Rack / Gear</div>
      <div class="v">${s.gearTilesTotal} tile</div>
      <div class="k">Filled slots: ${s.gearSlotsTotal}</div>
    </div>
  `;

  grid.innerHTML = "";

  for (const it of s.list){
    if (!it) continue;

    if (it.key==="other" && it.placed===0 && it.audible===0 && it.gearSlots===0 && it.gearTiles===0) continue;

    if ((it.key==="repeat" || it.key==="blank" || it.key==="spooky" || it.key==="festive") && it.placed===0) continue;

    const icon = iconUrlForKey(it.key);

    const nsfPlaced = (it.placedN || it.placedS || it.placedF)
      ? `Note:${it.placedN}  Sharp:${it.placedS}  Flat:${it.placedF}`
      : `—`;

    const nsfGear = (it.gearSlotsN || it.gearSlotsS || it.gearSlotsF)
      ? `NOTE:${it.gearSlotsN}  SHARP:${it.gearSlotsS}  FLAT:${it.gearSlotsF}`
      : `—`;

    const metaHtml = (it.key === "gear")
      ? `
        <div class="insMeta">
          <div>Gear tiles: <span class="pill">${it.gearTiles}</span></div>
          <div>Slots total: <span class="pill">${s.gearSlotsTotal}</span></div>
        </div>
      `
      : `
        <div class="insMeta">
          <div><span class="pill">${it.placed}</span></div>
          <div><span class="pill">${nsfPlaced}</span></div>
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
const audioConvertBuf = []; // [{noteId, yPos}]
const AUDIO_CONVERT_HOLD_MS = 420;
const AUDIO_CONVERT_MOVE_PX = 8;

let _acHold = null;         // {ax,y,clientX,clientY,pointerId,noteId}
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

let clipData = null;

let pasteArmed = false;
let pastePreviewX = -1; 
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
        border: 1px solid rgba(0,0,0,.12);
        background: var(--ui-card, rgba(255,255,255,.92));
        box-shadow: 0 16px 60px rgba(0,0,0,.20);
        backdrop-filter: blur(8px);
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
        color: var(--ui-text-soft, rgba(0,0,0,.78));
        display:flex;
        gap:10px;
        align-items:center;
        justify-content:space-between;
      }
      #mobilePasteBar .mpTitle .mpPos{
        font-family: ui-monospace, Menlo, monospace;
        opacity:.85;
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
        border: 1px solid rgba(0,0,0,.16);
        background: #fff;
        cursor: pointer;
        font-weight: 900;
      }
      #mobilePasteBar button.primary{
        background: var(--ui-primary-bg, #111);
        border-color: var(--ui-primary-border, #111);
        color: var(--ui-primary-text, #fff);
      }
      #mobilePasteBar button.nudge{
        font-family: ui-monospace, Menlo, monospace;
        font-weight: 900;
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

  const btnLeft = document.createElement("button");
  btnLeft.type = "button";
  btnLeft.className = "nudge";
  btnLeft.textContent = "◀";

  const btnRight = document.createElement("button");
  btnRight.type = "button";
  btnRight.className = "nudge";
  btnRight.textContent = "▶";

  const btnPaste = document.createElement("button");
  btnPaste.type = "button";
  btnPaste.className = "primary";
  btnPaste.textContent = "Paste";

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.textContent = "Cancel";

  btns.appendChild(btnLeft);
  btns.appendChild(btnRight);
  btns.appendChild(btnPaste);
  btns.appendChild(btnCancel);

  _pasteBar.appendChild(left);
  _pasteBar.appendChild(btns);
  document.body.appendChild(_pasteBar);

  function setPos(newPos) {
    if (!pasteClipCache) return;
    const maxPos = Math.max(0, state.width - (pasteClipCache.w || 1));
    const v = clamp(Number(newPos), 0, maxPos);

    pastePreviewX = v;
    if (_pasteRange) _pasteRange.value = String(v);

    snapViewToPage(v);
    markBaseDirty();
    draw();

    const from = v + 1;
    const to = Math.min(v + (pasteClipCache.w || 1), state.width);
    _pastePosText.textContent = `${from}-${to}/${state.width}`;
  }

  _pasteRange.addEventListener("input", () => setPos(_pasteRange.value));

  btnLeft.onclick = () => setPos(Number(_pasteRange.value) - 1);
  btnRight.onclick = () => setPos(Number(_pasteRange.value) + 1);

  btnPaste.onclick = () => {
    if (!pasteArmed || !pasteClipCache) return;
    const x = (pastePreviewX !== -1) ? pastePreviewX : songXOffset;
    const did = pasteClipAtFixedYWithHistory(x, pasteClipCache);
    setPasteArmed(false, null);
    showStatus(did ? "Pasted!" : "Nothing pasted.");
    markBaseDirty();
    draw();
  };

  btnCancel.onclick = () => {
    cancelPaste();
  };

  // Expose setPos for updater
  _pasteBar._setPos = setPos;
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

  // initialize preview position if unset
  if (pastePreviewX === -1) {
    pastePreviewX = clamp(songXOffset, 0, maxPos);
  }
  _pasteRange.value = String(pastePreviewX);

  _pasteBar.style.display = "flex";
  // sync text
  if (typeof _pasteBar._setPos === "function") {
    _pasteBar._setPos(pastePreviewX);
  }
}

function setPasteArmed(on, clip = null) {
  pasteArmed = !!on;
  pasteClipCache = clip;

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

  if (!selectionMode) {
    clearSelection();
    setPasteArmed(false, null);
  }

  syncBodyClasses();
  draw();
}

// Touch drag-paint
let isPainting = false;
let paintButtonRight = false;
let lastPaintKey = "";
let paintChanges = new Map(); // key -> {x,y,before,after}
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
  showStatus("Paste Canceled.");
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

  // reset repeat flags
  repeatUsed = Array.from({ length: state.height }, () => Array(state.width).fill(false));

  setSongXOffset(songXOffset);

  // selection/paste + history
  try { clearSelection(); } catch {}
  try { setPasteArmed(false, null); } catch {}
  undoStack.length = 0;
  redoStack.length = 0;

  // persist preference
  localStorage.setItem(PREF_SONG_WIDTH_KEY, String(state.width));

  refreshMaxX();
  if (inpSongWidth) inpSongWidth.value = String(state.width);
  showStatus(`Length set to ${state.width}`);
  draw();
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

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

function getCanvasTileFromEvent(e, canvas, cols, rows, tileSize) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;

  const x = Math.floor(cx / tileSize);
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
  cv.width = pageWidth * TILE;
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

// ===== image/audio load =====
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

// ===== WAV export helpers (offline render) =====
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

    // Audio Gear cell (composite)
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

    // Normal note
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

  // Play once (no endless loop-back at end)
  let pos = clamp(Number(startX || 0), 0, state.width - 1);
  let tSec = 0;

  // Hard safety limit to avoid weird infinite repeat edge-cases
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

  // Copy static EQ shapes
  fx2.eqSubBass.type  = fx.eqSubBass.type;  fx2.eqSubBass.frequency.value  = fx.eqSubBass.frequency.value;
  fx2.eqBass.type     = fx.eqBass.type;     fx2.eqBass.frequency.value     = fx.eqBass.frequency.value;     fx2.eqBass.Q.value     = fx.eqBass.Q.value;
  fx2.eqLowMid.type   = fx.eqLowMid.type;   fx2.eqLowMid.frequency.value   = fx.eqLowMid.frequency.value;   fx2.eqLowMid.Q.value   = fx.eqLowMid.Q.value;
  fx2.eqMid.type      = fx.eqMid.type;      fx2.eqMid.frequency.value      = fx.eqMid.frequency.value;      fx2.eqMid.Q.value      = fx.eqMid.Q.value;
  fx2.eqHighMid.type  = fx.eqHighMid.type;  fx2.eqHighMid.frequency.value  = fx.eqHighMid.frequency.value;  fx2.eqHighMid.Q.value  = fx.eqHighMid.Q.value;
  fx2.eqPresence.type = fx.eqPresence.type; fx2.eqPresence.frequency.value = fx.eqPresence.frequency.value; fx2.eqPresence.Q.value = fx.eqPresence.Q.value;
  fx2.eqHigh.type     = fx.eqHigh.type;     fx2.eqHigh.frequency.value     = fx.eqHigh.frequency.value;     fx2.eqHigh.Q.value     = fx.eqHigh.Q.value;
  fx2.eqTreble.type   = fx.eqTreble.type;   fx2.eqTreble.frequency.value   = fx.eqTreble.frequency.value;

  // Copy current EQ gains
  fx2.eqSubBass.gain.value  = fx.eqSubBass.gain.value;
  fx2.eqBass.gain.value     = fx.eqBass.gain.value;
  fx2.eqLowMid.gain.value   = fx.eqLowMid.gain.value;
  fx2.eqMid.gain.value      = fx.eqMid.gain.value;
  fx2.eqHighMid.gain.value  = fx.eqHighMid.gain.value;
  fx2.eqPresence.gain.value = fx.eqPresence.gain.value;
  fx2.eqHigh.gain.value     = fx.eqHigh.gain.value;
  fx2.eqTreble.gain.value   = fx.eqTreble.gain.value;

  // Copy saturation
  fx2.satPre.gain.value = fx.satPre.gain.value;
  fx2.sat.curve = fx.sat.curve;
  fx2.sat.oversample = fx.sat.oversample;
  fx2.satPost.gain.value = fx.satPost.gain.value;

  // Copy compressor
  fx2.comp.threshold.value = fx.comp.threshold.value;
  fx2.comp.knee.value = fx.comp.knee.value;
  fx2.comp.ratio.value = fx.comp.ratio.value;
  fx2.comp.attack.value = fx.comp.attack.value;
  fx2.comp.release.value = fx.comp.release.value;

  // Copy reverb mix + IR buffer
  fx2.wet.gain.value = fx.wet.gain.value;
  fx2.dry.gain.value = fx.dry.gain.value;
  fx2.reverb.buffer = fx.reverb.buffer;

  // Copy master gain
  fx2.master.gain.value = fx.master.gain.value;

  // Wire graph (same topology)
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

  // Interleave float
  const chData = [];
  for (let ch = 0; ch < numCh; ch++) chData.push(buffer.getChannelData(ch));
  const interleaved = new Float32Array(length * numCh);
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numCh; ch++) interleaved[i * numCh + ch] = chData[ch][i];
  }

  // PCM 16-bit in chunks (biar UI tetap hidup)
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
    await new Promise(r => setTimeout(r, 0)); // kasih napas ke UI
  }

  // WAV header
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

    // ===== Loading samples with progress
    const uniq = [...new Set(events.map(e => e.path))];
    let loaded = 0;
    const total = Math.max(1, uniq.length);

    wavProgressSet(`Loading samples… (${loaded}/${total})`, 0);

    // load sequential (paling aman + bisa progress)
    for (const p of uniq) {
      await getBuf(p); // pakai cache yang sama
      loaded++;
      // 0%..35% untuk loading
      const pct = (loaded / total) * 35;
      wavProgressSet(`Loading samples… (${loaded}/${total})`, pct);
    }

    // ===== Offline render (no real % available)
    const sampleRate =
      (fx && fx.reverb && fx.reverb.buffer && fx.reverb.buffer.sampleRate) ||
      (audioCtx && audioCtx.sampleRate) ||
      44100;

    const frames = Math.max(1, Math.ceil(totalSec * sampleRate));

    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) throw new Error("OfflineAudioContext is not supported in this browser.");

    wavProgressSet("Rendering audio… (please wait estimated 5min)", null); // indeterminate

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
      const pct = 35 + (p * 60); // 35..95
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

// ===== page nav =====
function pageLeft() {
  if (playing) return;
  if (songXOffset % pageWidth !== 0) setSongXOffset(Math.floor(songXOffset / pageWidth) * pageWidth);
  else setSongXOffset(songXOffset < pageWidth ? (state.width - pageWidth) : (songXOffset - pageWidth));
  updateTransportUI();
  draw();
}

function pageRight() {
  if (playing) return;
  if (songXOffset + pageWidth > state.width - pageWidth) setSongXOffset(songXOffset !== state.width - pageWidth ? (state.width - pageWidth) : 0);
  else setSongXOffset(songXOffset + pageWidth);
  updateTransportUI();
  draw();
}

function snapViewToPage(absPos) {
  const pageStart = Math.floor(absPos / pageWidth) * pageWidth;
  if (pageStart !== songXOffset) setSongXOffset(pageStart);
}



// ===== repeat + column play =====
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

    return 0;
  }

  return null;
}

// ===== tick =====
async function tick() {
  // stop trailing empties
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

  snapViewToPage(col);
  draw();
}

// ===== transport UI =====
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

function startFromFirstNote() {
  resetPlayState();

  const startX = findFirstNonEmptyX(); 
  playStartX = startX;

  playPos = startX;
  currentPlayPosition = startX;

  setSongXOffset(pageStartFromOffset(startX));

  paused = false;
  playing = true;

  clearInterval(timer);
  timer = setInterval(tick, bpmMs(state.bpm));

  updateTransportUI();
  draw();
}

function startFromBeginning() {
  resetPlayState();
  setSongXOffset(0);
  playPos = 0;
  currentPlayPosition = 0;

  paused = false;
  playing = true;

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

function startFromCurrentView() {
  const start = pageStartFromOffset(songXOffset);

  resetPlayState();
  playPos = start;
  currentPlayPosition = start;
  setSongXOffset(start);

  paused = false;
  playing = true;

  clearInterval(timer);
  timer = setInterval(tick, bpmMs(state.bpm));

  updateTransportUI();
  draw();
}

function resumeFromCurrentView() {
  if (!paused) return;

  const start = pageStartFromOffset(songXOffset);

  resetPlayState();
  playPos = start;
  currentPlayPosition = start;
  setSongXOffset(start);

  paused = false;
  playing = true;

  clearInterval(timer);
  timer = setInterval(tick, bpmMs(state.bpm));

  updateTransportUI();
  draw();
}

// ===== base64 helpers =====
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

// ===== autosave =====
const AUTOSAVE_KEY = "gmsf_autosave_v1";
let autosaveTimer = null;

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      const bytes = writeGmsfV1(state);
      localStorage.setItem(AUTOSAVE_KEY, uint8ToBase64(bytes));
    } catch {}
  }, 300);
}

async function restoreAutosaveIfAny() {
  const b64 = localStorage.getItem(AUTOSAVE_KEY);
  if (!b64) return;

  const ok = confirm("Previous autosave detected. Restore it?");
  if (!ok) return;

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

// ===== undo/redo (cell-based + multi) =====
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

// ===== Paste with fixed Y =====
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

// ===== Drag paint session =====
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

/* =======================
   Drawing
   ======================= */
function renderBase() {
  if (baseLayer.width !== cv.width) baseLayer.width = cv.width;
  if (baseLayer.height !== cv.height) baseLayer.height = cv.height;

  baseCtx.clearRect(0, 0, baseLayer.width, baseLayer.height);

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

      baseCtx.strokeStyle = "rgba(0,0,0,0.08)";
      baseCtx.strokeRect(vx * TILE, y * TILE, TILE, TILE);
    }
  }

  const labelY = state.height * TILE;
  baseCtx.fillStyle = "rgba(0,0,0,0.04)";
  baseCtx.fillRect(0, labelY, pageWidth * TILE, TILE);

  baseCtx.save();
  baseCtx.font = "700 12px system-ui, Arial";
  baseCtx.fillStyle = "rgba(0,0,0,0.55)";
  baseCtx.textAlign = "center";
  baseCtx.textBaseline = "middle";

  for (let vx = 0; vx < pageWidth; vx++) {
    const label = String.fromCharCode(65 + vx);
    const cx = vx * TILE + TILE / 2;
    const cy = labelY + TILE / 2;
    baseCtx.fillText(label, cx, cy);

    baseCtx.strokeStyle = "rgba(0,0,0,0.06)";
    baseCtx.beginPath();
    baseCtx.moveTo(vx * TILE + 0.5, labelY);
    baseCtx.lineTo(vx * TILE + 0.5, labelY + TILE);
    baseCtx.stroke();
  }
  baseCtx.restore();

  baseDirty = false;
}

function drawFrame() {
  if (baseDirty) renderBase();

  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(baseLayer, 0, 0);

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

/* =========================================================
   HOTKEY EDITOR
   ========================================================= */

const btnHotkeys = document.getElementById("btnHotkeys");

const _hotkeyStatus = (typeof showStatus === "function")
  ? showStatus
  : ((msg, ms=1400) => { try { statusEl.textContent = msg; setTimeout(()=>statusEl.textContent="", ms);} catch{} });

const HOTKEYS_KEY = "gmsf_note_hotkeys_v2";

const RESERVED_CODES = new Set([
  "Space",        // Play/Stop
  "KeyP",         // Pause/Resume
  "ArrowLeft", "ArrowRight", // paging
  "KeyB",         // close gear modal
  "Escape",       // cancel UI
  "KeyO", "KeyS", "KeyZ", "KeyY", "KeyC", "KeyV", "KeyA", // Ctrl combos
]);

// mapping noteId -> code (event.code)
let noteHotkeys = loadNoteHotkeys();

// state modal
let hotkeyModalOpen = false;
let captureNoteId = null;

// ---------- data helpers ----------
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
  // special by id
  if (noteId === NOTE_PACK?.repeatStartID || noteId === NOTE_PACK?.repeatEndID) return "Repeat";
  if (noteId === NOTE_PACK?.audioGearID || noteId === state?.audioGearID) return "Audio Rack";
  // fallback by image name
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

// ---------- modal DOM ----------
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

  // close by click outside
  back.addEventListener("click", (e)=>{ if(e.target===back) closeHotkeyModal(); });

  // close btn
  modal.querySelector("#hkClose").onclick = closeHotkeyModal;

  // reset
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
  // kind: "info" | "ok" | "err"
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
    z-index: 999; /* di atas hotkey modal */
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

  // ESC close
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

      // click -> capture
      btn.addEventListener("click", () => {
        captureNoteId = noteId;
        renderHotkeyModal();
      });

      // right click -> clear hotkey
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
  if (typeof modalBack !== "undefined" && modalBack?.style?.display === "flex") return false; // gear modal

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

/* =======================
   Gear editor
   ======================= */
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
  drawGear();
  updateGearReadout();
  if (gearCodeInput) gearCodeInput.value = (gearCodeEl.textContent || "").trim();
}

function closeGearEditor() {
  modalBack.style.display = "none";
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

/* ==============================
   MAIN CANVAS INPUT
   ============================== */

cv.addEventListener("pointerdown", async (e) => {
  cv.setPointerCapture(e.pointerId);

  if (modalBack.style.display === "flex") return;

  const hit = getCanvasTileFromEvent(e, cv, pageWidth, state.height, TILE);
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
    sel.x1 = ax; sel.y1 = y;
    sel.x2 = ax; sel.y2 = y;
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

  const hit = getCanvasTileFromEvent(e, cv, pageWidth, state.height, TILE);
  if (!hit) return;

  const ax = hit.x + songXOffset;
  const y = hit.y;

// Audio Convert
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

// ===== buttons =====
btnPrevPage.onclick = pageLeft;
btnNextPage.onclick = pageRight;
if (btnZoom) {
  btnZoom.type = "button";
  btnZoom.onclick = () => applyZoom(!zoomOn);
}

// Theme button (cycles canvas themes)
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

// Selection buttons
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

  // reset repeat + maxX
  repeatUsed = Array.from({ length: state.height }, () => Array(state.width).fill(false));
  refreshMaxX();
  resetPlayState();

  // reset transport
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

// ===== transport buttons =====
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
  startFromFirstNote();
};


btnPause.onclick = async () => {
  await audioCtx.resume();

  if (playing) {
    pausePlayback();
    return;
  }

  if (paused) {
    resumeFromCurrentView();
    return;
  }

  if (songXOffset > 0) {
    startFromCurrentView();
  }
};

// ===== hotkeys =====
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


// ===== init =====
(async function init() {
  await buildPalette();

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
