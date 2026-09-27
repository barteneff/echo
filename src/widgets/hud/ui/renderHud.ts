import { SEED } from '@shared/config';

/** Shell markup for the ECHO HUD overlay. */
export function renderHud(root: HTMLElement): void {
  root.innerHTML = `
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
}
