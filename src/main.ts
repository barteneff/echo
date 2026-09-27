import './styles.css';
import { AudioAnalyzer, emptyAudio } from './audio/analyzer';
import { SemanticMapper, type AudioFrame } from './audio/semantic';
import { Engine } from './engine/Engine';
import { SoftWave } from './signals/SoftWave';
import {
  FACTIONS,
  type WarComboId,
} from './wars/catalog';
import { FLAT_OPS, type FlatOpId } from './flat2d/catalog';
import { CoverArt } from './media/CoverArt';

const SEED = 847291;

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <canvas id="stage"></canvas>
  <div class="hud">
    <div class="top">
      <div class="brand">
        <h1>ECHO</h1>
        <p>signal destruction system</p>
      </div>
      <div class="meta">
        <div>stage <strong id="signal-name">Wave</strong></div>
        <div>seed <strong>${SEED}</strong></div>
        <div>mode <strong id="mode-label">idle</strong></div>
      </div>
    </div>

    <div class="center-hint" id="hint">
      <h2>Load a track. Break the signal.</h2>
      <p>
        <em>Signals</em> birth → <em>Wars</em> territory fight → <em>Flat</em> 2D field.
      </p>
      <label class="btn primary file-btn">
        Load audio
        <input id="file-hint" type="file" accept="audio/*" />
      </label>
    </div>

    <div class="bottom">
      <div class="mode-row">
        <div class="mode-tabs">
          <button class="signal-btn active" id="mode-signals" type="button">Signals</button>
          <button class="signal-btn wars" id="mode-wars" type="button">Wars</button>
          <button class="signal-btn flat" id="mode-flat" type="button">Flat</button>
        </div>
        <div class="view-tabs">
          <button class="signal-btn active" id="view-orbit" type="button">Orbit</button>
          <button class="signal-btn" id="view-front" type="button">Front</button>
        </div>
        <label class="slider-wrap" title="Camera shake">
          <span>Shake</span>
          <input id="shake" type="range" min="0" max="100" value="20" />
          <em id="shake-val">20%</em>
        </label>
      </div>

      <div class="signals hidden" id="signals"></div>

      <div class="wars-bar hidden" id="wars-bar">
        <div class="wars-factions" id="wars-factions"></div>
        <button class="signal-btn" id="wars-reset" type="button">Reset map</button>
        <span class="flat-hint" id="wars-combo">territory: —</span>
      </div>

      <div class="flat-bar hidden" id="flat-bar">
        <div class="wars-effects" id="flat-ops"></div>
        <span class="flat-hint" id="flat-combo">ops: —</span>
      </div>

      <div class="transport">
        <button class="btn" id="play" disabled>Play</button>
        <label class="btn file-btn">
          Track
          <input id="file" type="file" accept="audio/*" />
        </label>
        <label class="btn file-btn hidden" id="cover-btn" title="Album cover">
          Cover
          <input id="cover" type="file" accept="image/*" />
        </label>
        <div class="meters">
          <div class="meter"><span>Impact</span><div class="bar"><i id="m-impact"></i></div></div>
          <div class="meter"><span>Body</span><div class="bar"><i id="m-body"></i></div></div>
          <div class="meter"><span>Texture</span><div class="bar"><i id="m-texture"></i></div></div>
          <div class="meter beat"><span>Motion</span><div class="bar"><i id="m-motion"></i></div></div>
        </div>
        <button class="btn hidden" id="auto" title="Toggle auto timeline">Auto</button>
      </div>
      <div class="time-row">
        <span id="clock">00:00</span>
        <div class="scrub"><i id="scrub"></i></div>
        <span id="clip">clip 0.0s</span>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const signals = [new SoftWave()];

const engine = new Engine(canvas, signals, SEED);
engine.timeline.setAuto(false);
const audio = new AudioAnalyzer();
const semantic = new SemanticMapper();
const coverArt = new CoverArt();

const signalsEl = document.querySelector('#signals')!;
const warsBar = document.querySelector('#wars-bar')!;
const flatBar = document.querySelector('#flat-bar')!;
const factionsEl = document.querySelector('#wars-factions')!;
const warsResetBtn = document.querySelector<HTMLButtonElement>('#wars-reset')!;
const flatOpsEl = document.querySelector('#flat-ops')!;
const signalName = document.querySelector('#signal-name')!;
const modeLabel = document.querySelector('#mode-label')!;
const hint = document.querySelector('#hint')!;
const playBtn = document.querySelector<HTMLButtonElement>('#play')!;
const autoBtn = document.querySelector<HTMLButtonElement>('#auto')!;
const clockEl = document.querySelector('#clock')!;
const clipEl = document.querySelector('#clip')!;
const scrubEl = document.querySelector<HTMLElement>('#scrub')!;
const shakeInput = document.querySelector<HTMLInputElement>('#shake')!;
const shakeVal = document.querySelector('#shake-val')!;
const modeSignalsBtn = document.querySelector<HTMLButtonElement>('#mode-signals')!;
const modeWarsBtn = document.querySelector<HTMLButtonElement>('#mode-wars')!;
const modeFlatBtn = document.querySelector<HTMLButtonElement>('#mode-flat')!;
const viewOrbitBtn = document.querySelector<HTMLButtonElement>('#view-orbit')!;
const viewFrontBtn = document.querySelector<HTMLButtonElement>('#view-front')!;
const meters = {
  impact: document.querySelector<HTMLElement>('#m-impact')!,
  body: document.querySelector<HTMLElement>('#m-body')!,
  texture: document.querySelector<HTMLElement>('#m-texture')!,
  motion: document.querySelector<HTMLElement>('#m-motion')!,
};

FACTIONS.forEach((f) => {
  const row = document.createElement('div');
  row.className = 'faction-row';
  row.dataset.faction = String(f.id);
  row.innerHTML = `
    <span class="faction-dot" style="background:${f.color}"></span>
    <span class="faction-name" style="color:${f.color}">${f.name}</span>
    <span class="faction-bind">${f.bind}</span>
    <div class="faction-bar"><i style="background:${f.color}"></i></div>
    <em class="faction-pct">0%</em>
  `;
  factionsEl.appendChild(row);
});

warsResetBtn.addEventListener('click', () => {
  engine.applyWarCombo('territory' as WarComboId);
  syncWarsUi();
});

FLAT_OPS.forEach((op) => {
  const btn = document.createElement('button');
  btn.className = 'signal-btn' + (engine.isFlatEffect(op.id) ? ' active' : '');
  btn.textContent = op.name;
  btn.dataset.fx = op.id;
  btn.addEventListener('click', () => {
    engine.setFlatEffect(op.id as FlatOpId, !engine.isFlatEffect(op.id));
    syncFlatButtons();
  });
  flatOpsEl.appendChild(btn);
});

function syncSignalButtons(): void {
  const mode = engine.getAppMode();
  if (mode === 'wars') signalName.textContent = 'TERRITORY';
  else if (mode === 'flat2d') signalName.textContent = 'Dirty VFX';
  else signalName.textContent = 'Wave';
}

function syncAutoBtn(): void {
  const on = engine.timeline.isAuto();
  autoBtn.textContent = on ? 'Auto ●' : 'Auto ○';
  autoBtn.style.color = on ? 'var(--echo-accent)' : '';
}

function syncViewButtons(): void {
  const front = engine.getViewMode() === 'front';
  viewOrbitBtn.classList.toggle('active', !front);
  viewFrontBtn.classList.toggle('active', front);
}

function syncWarsUi(): void {
  const stats = engine.getWarsStats();
  const pal = coverArt.isLoaded() ? coverArt.getPalette() : null;
  factionsEl.querySelectorAll<HTMLElement>('.faction-row').forEach((row) => {
    const id = Number(row.dataset.faction);
    const st = stats.find((s) => s.id === id);
    const share = st?.share ?? 0;
    const bar = row.querySelector<HTMLElement>('.faction-bar i');
    const pct = row.querySelector('.faction-pct');
    const dot = row.querySelector<HTMLElement>('.faction-dot');
    const name = row.querySelector<HTMLElement>('.faction-name');
    if (bar) bar.style.width = `${Math.round(share * 100)}%`;
    if (pct) pct.textContent = `${Math.round(share * 100)}%`;
    if (pal && dot && name) {
      const color = id === 0 ? pal.bass : id === 1 ? pal.mid : pal.high;
      dot.style.background = color;
      name.style.color = color;
      if (bar) bar.style.background = color;
    }
  });
  const comboEl = document.querySelector('#wars-combo');
  if (comboEl) comboEl.textContent = `territory: ${engine.getWarsCombo()}`;
}

function syncFlatButtons(): void {
  flatOpsEl.querySelectorAll<HTMLButtonElement>('[data-fx]').forEach((btn) => {
    btn.classList.toggle('active', engine.isFlatEffect(btn.dataset.fx as FlatOpId));
  });
  const comboEl = document.querySelector('#flat-combo');
  if (comboEl) comboEl.textContent = `combo: ${engine.getFlatCombo()}`;
}

function setAppMode(mode: 'signals' | 'wars' | 'flat2d'): void {
  engine.setAppMode(mode);
  modeSignalsBtn.classList.toggle('active', mode === 'signals');
  modeWarsBtn.classList.toggle('active', mode === 'wars');
  modeFlatBtn.classList.toggle('active', mode === 'flat2d');
  signalsEl.classList.add('hidden');
  warsBar.classList.toggle('hidden', mode !== 'wars');
  flatBar.classList.toggle('hidden', mode !== 'flat2d');
  autoBtn.disabled = true;
  viewOrbitBtn.disabled = mode === 'flat2d';
  viewFrontBtn.disabled = mode === 'flat2d';
  syncViewButtons();
  syncSignalButtons();
  if (mode === 'wars') {
    syncWarsUi();
    clipEl.textContent = 'territory war';
  } else if (mode === 'flat2d') {
    syncFlatButtons();
    clipEl.textContent = '2D compositor';
  }
}

syncAutoBtn();
syncViewButtons();
syncWarsUi();
syncFlatButtons();

shakeInput.addEventListener('input', () => {
  const v = Number(shakeInput.value) / 100;
  engine.setShakeAmount(v);
  shakeVal.textContent = `${Math.round(v * 100)}%`;
});
engine.setShakeAmount(Number(shakeInput.value) / 100);

modeSignalsBtn.addEventListener('click', () => setAppMode('signals'));
modeWarsBtn.addEventListener('click', () => setAppMode('wars'));
modeFlatBtn.addEventListener('click', () => setAppMode('flat2d'));

viewOrbitBtn.addEventListener('click', () => {
  if (engine.getAppMode() === 'flat2d') return;
  engine.setViewMode('orbit');
  syncViewButtons();
});
viewFrontBtn.addEventListener('click', () => {
  if (engine.getAppMode() === 'flat2d') return;
  engine.setViewMode('front');
  syncViewButtons();
});

async function loadTrack(file: File): Promise<void> {
  await audio.loadFile(file);
  playBtn.disabled = false;
  playBtn.textContent = 'Play';
  hint.classList.add('hidden');
  modeLabel.textContent = file.name.slice(0, 28);
  await audio.play();
  playBtn.textContent = 'Pause';
}

function onFile(input: HTMLInputElement): void {
  const file = input.files?.[0];
  if (file) void loadTrack(file);
  input.value = '';
}

document.querySelector<HTMLInputElement>('#file')!.addEventListener('change', (e) => {
  onFile(e.target as HTMLInputElement);
});
document.querySelector<HTMLInputElement>('#file-hint')!.addEventListener('change', (e) => {
  onFile(e.target as HTMLInputElement);
});

document.querySelector<HTMLInputElement>('#cover')!.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  void (async () => {
    await coverArt.loadFile(file);
    engine.setCover(coverArt);
    syncWarsUi();
  })();
});

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  if (file.type.startsWith('audio/')) void loadTrack(file);
  else if (file.type.startsWith('image/')) {
    void (async () => {
      await coverArt.loadFile(file);
      engine.setCover(coverArt);
      syncWarsUi();
    })();
  }
});

playBtn.addEventListener('click', () => {
  if (!audio.hasTrack()) return;
  audio.toggle();
  playBtn.textContent = audio.isPlaying() ? 'Pause' : 'Play';
});

autoBtn.addEventListener('click', () => {
  if (engine.getAppMode() !== 'signals') return;
  engine.timeline.setAuto(!engine.timeline.isAuto());
  syncAutoBtn();
});

function synthFrame(time: number): AudioFrame {
  const phase = time * 0.35;
  const bass = 0.25 + Math.max(0, Math.sin(phase)) * 0.55;
  const mid = 0.25 + Math.max(0, Math.sin(phase + 2.1)) * 0.55;
  const high = 0.25 + Math.max(0, Math.sin(phase + 4.2)) * 0.55;
  const energy = Math.min(1, (bass + mid + high) / 3);
  const beat = Math.sin(time * Math.PI * 2) > 0.97;
  const waveform = new Float32Array(128);
  const spectrum = new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    spectrum[i] =
      (Math.sin(time * 2 + i * 0.3) * 0.5 + 0.5) *
      (i < 8 ? bass : i < 24 ? mid : high);
  }
  const raw = {
    bass: Math.min(1, Math.max(0, bass)),
    mid: Math.min(1, Math.max(0, mid)),
    high: Math.min(1, Math.max(0, high)),
    energy,
    beat,
    waveform,
    spectrum,
    bands: {
      sub: bass * 0.7,
      kick: bass,
      lowMid: mid * 0.8,
      highMid: mid,
      air: high,
    },
    onsetKick: beat ? 0.9 : 0,
    onsetMid: Math.max(0, Math.sin(time * 3.1)) > 0.95 ? 0.8 : 0,
    onsetHat: Math.max(0, Math.sin(time * 5.2)) > 0.95 ? 0.7 : 0,
    flux: energy * 0.4,
  };
  return { ...raw, ...semantic.map(1 / 60, raw) };
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

let last = performance.now();
let time = 0;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  let data: AudioFrame;
  if (!audio.hasTrack()) {
    data = synthFrame(time);
  } else {
    const live = audio.isPlaying() ? audio.sample(dt) : emptyAudio();
    data = { ...live, ...semantic.map(dt, live) };
  }

  const drive = data;
  engine.update(time, dt, drive);

  meters.impact.style.width = `${data.impact * 100}%`;
  meters.body.style.width = `${data.body * 100}%`;
  meters.texture.style.width = `${data.texture * 100}%`;
  meters.motion.style.width = `${data.motion * 100}%`;

  if (engine.getAppMode() === 'wars') {
    syncWarsUi();
    clipEl.textContent = engine.getWarsCombo();
    const comboEl = document.querySelector('#wars-combo');
    if (comboEl) comboEl.textContent = `territory: ${engine.getWarsCombo()}`;
  } else if (engine.getAppMode() === 'flat2d') {
    clipEl.textContent = engine.getFlatCombo();
    const comboEl = document.querySelector('#flat-combo');
    if (comboEl) comboEl.textContent = `ops: ${engine.getFlatCombo()}`;
  } else {
    const state = engine.getState();
    if (state) {
      syncSignalButtons();
      clipEl.textContent = `clip ${state.clipTime.toFixed(1)}s`;
    }
  }

  if (audio.hasTrack()) {
    const cur = audio.getCurrentTime();
    const dur = audio.getDuration();
    clockEl.textContent = `${fmt(cur)} / ${fmt(dur)}`;
    scrubEl.style.width = dur > 0 ? `${(cur / dur) * 100}%` : '0%';
  } else {
    clockEl.textContent = fmt(time);
    scrubEl.style.width = `${((time % 45) / 45) * 100}%`;
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
