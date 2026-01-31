// notePack.js
export const AUDIOGEARSPACE = 5;

export const NOTE_PACK = {
  audioGearID: 15,
  repeatStartID: 12,
  repeatEndID: 13,
  notes: {}, 
  uiOrder: [],   
  gearInfo: {},  
  maxNoteId: 0,
};

function fmt(s, n) { return s.replace("%d", String(n)); }
function sounds(format, idxList) { return idxList.map(i => fmt(format, i)); }

const NORMAL = [24,22,20,18,17,15,13,12,10,8,6,5,3,1];
const FLAT   = [23,21,19,17,16,14,12,11,9,7,5,4,2,0];
const SHARP  = [25,23,21,19,18,16,14,13,11,9,7,6,4,2];
const DRUM   = [0,1,2,3,4,5,6, 0,1,2,3,4,5,6];

function add(id, image, sndOrNull) {
  NOTE_PACK.notes[id] = { image, sounds: sndOrNull };
  NOTE_PACK.uiOrder[id] = id;
}
function setGear(id, letter, accidental) {
  NOTE_PACK.gearInfo[id] = { letter, accidental };
}
function swapUI(a, b) {
  const t = NOTE_PACK.uiOrder[a];
  NOTE_PACK.uiOrder[a] = NOTE_PACK.uiOrder[b];
  NOTE_PACK.uiOrder[b] = t;
}

function triple(soundFmt, startId, imgN, imgS, imgF, gearLetter) {
  add(startId,   imgN, sounds(soundFmt, NORMAL));
  add(startId+1, imgS, sounds(soundFmt, SHARP));
  add(startId+2, imgF, sounds(soundFmt, FLAT));

  if (gearLetter) {
    setGear(startId,   gearLetter, "-");
    setGear(startId+1, gearLetter, "#");
    setGear(startId+2, gearLetter, "b");
  }

  swapUI(startId, startId+1);
  swapUI(startId, startId+2);
}

add(0, "assets/Free/Images/grid.png", null);

triple("assets/Proprietary/Sound/piano_%d.wav", 1,
  "assets/Proprietary/Images/piano.png",
  "assets/Proprietary/Images/pianoSharp.png",
  "assets/Proprietary/Images/pianoFlat.png",
  "P"
);

triple("assets/Proprietary/Sound/bass_%d.wav", 4,
  "assets/Proprietary/Images/bass.png",
  "assets/Proprietary/Images/bassSharp.png",
  "assets/Proprietary/Images/bassFlat.png",
  "B"
);

add(7, "assets/Proprietary/Images/drum.png", sounds("assets/Proprietary/Sound/drum_%d.wav", DRUM));
setGear(7, "D", "-");

add(8, "assets/Proprietary/Images/blank.png", null);

triple("assets/Proprietary/Sound/sax_%d.wav", 9,
  "assets/Proprietary/Images/sax.png",
  "assets/Proprietary/Images/saxSharp.png",
  "assets/Proprietary/Images/saxFlat.png",
  "S"
);

add(12, "assets/Proprietary/Images/repeatStart.png", null);
add(13, "assets/Proprietary/Images/repeatEnd.png", null);

add(14, "assets/Proprietary/Images/spooky.png", sounds("assets/Proprietary/Sound/spooky_%d.wav", NORMAL));

add(15, "assets/Proprietary/Images/audioGear.png", null);

triple("assets/Proprietary/Sound/flute_%d.wav", 16,
  "assets/Proprietary/Images/flute.png",
  "assets/Proprietary/Images/fluteSharp.png",
  "assets/Proprietary/Images/fluteFlat.png",
  "F"
);

add(19, "assets/Proprietary/Images/festive.png", sounds("assets/Proprietary/Sound/festive_%d.wav", NORMAL));

triple("assets/Proprietary/Sound/spanish_guitar_%d.wav", 20,
  "assets/Proprietary/Images/guitar.png",
  "assets/Proprietary/Images/guitarSharp.png",
  "assets/Proprietary/Images/guitarFlat.png",
  "G"
);

triple("assets/Proprietary/Sound/violin_%d.wav", 23,
  "assets/Proprietary/Images/violin.png",
  "assets/Proprietary/Images/violinSharp.png",
  "assets/Proprietary/Images/violinFlat.png",
  "V"
);

triple("assets/Proprietary/Sound/lyre_%d.wav", 26,
  "assets/Proprietary/Images/lyre.png",
  "assets/Proprietary/Images/lyreSharp.png",
  "assets/Proprietary/Images/lyreFlat.png",
  "L"
);

triple("assets/Proprietary/Sound/electric_guitar_%d.wav", 29,
  "assets/Proprietary/Images/electricg.png",
  "assets/Proprietary/Images/electricgsharp.png",
  "assets/Proprietary/Images/electricgflat.png",
  "E"
);

triple("assets/Proprietary/Sound/mexican_trumpet_%d.wav", 32,
  "assets/Proprietary/Images/mtrumpet.png",
  "assets/Proprietary/Images/mtrumpetsharp.png",
  "assets/Proprietary/Images/mtrumpetflat.png",
  "T"
);

NOTE_PACK.maxNoteId = Math.max(...Object.keys(NOTE_PACK.notes).map(Number));
