import { OBJECT_TYPES, FORKS } from "./data.js";
import { track } from "./analytics.js";
import { MARKET_HEADLINES, WAVE_THEMES, CHAOS_LINES, COMBO_FLAVOR } from "./narrative.js";

const SESSION_MS = 70_000;
const WAVE_MS = SESSION_MS / 3;

function formatMoney(n) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n)) + " ₽";
}

/** Только число для HUD: символ ₽ уже в разметке */
function formatMoneyHud(n) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function pickWeighted(random, items, weightKey) {
  const w = items.reduce((a, b) => a + b[weightKey], 0);
  let t = random() * w;
  for (const it of items) {
    t -= it[weightKey];
    if (t <= 0) return it;
  }
  return items[items.length - 1];
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export class Game {
  /**
   * @param {{ field: HTMLElement; hud: object; onEnd: (stats: object) => void; }} opts
   */
  constructor(opts) {
    this.field = opts.field;
    this.hud = opts.hud;
    this.onEnd = opts.onEnd;
    this.role = null;
    this.running = false;
    this.startTime = 0;
    this.lastFrame = 0;
    this.spawnAcc = 0;
    this.spawnInterval = 1350;
    this.baseSpawnInterval = 1350;
    this.nextId = 1;
    this.entities = new Map();
    this.combo = 0;
    this.comboTier = 1; // 1, 2, 3
    this.nextGoodMultiplier = 1;
    this.chaos = false;
    this.chaosBannerShown = false;
    this.forkOverlay = opts.forkOverlay;
    this.forkTitle = opts.forkTitle;
    this.forkChoices = opts.forkChoices;
    this.forkPending = false;
    this.pendingForkTime = 0;
    /** Не идёт в зачёт 70 с смены (пауза на развилке) */
    this.pauseMsTotal = 0;
    this._pauseWallStart = 0;
    this._forkFrozenElapsed = 0;
    this.gameHint = typeof document !== "undefined" ? document.getElementById("game-hint") : null;
    this.forkContext = typeof document !== "undefined" ? document.getElementById("fork-context") : null;
    this._lastHudWave = 0;
    this._pulseSlot = -1;
    this.rng = Math.random;

    this.money = 0;
    this.time = 100;
    this.energy = 100;
    this.missedIncome = 0;

    this.stats = {
      trapHits: 0,
      trapSwiped: 0,
      goodCaught: 0,
      goodMissed: 0,
      highValueCaught: 0,
      textCaught: 0,
      visualCaught: 0,
      structureCaught: 0,
      boosterCaught: 0,
      forkBold: 0,
      forkCaution: 0,
      forkMargin: 0,
      comboMax: 0,
      wavesCompleted: 0,
    };

    this._raf = null;
    this._boundLoop = this.loop.bind(this);

    this.CATCHER_W = 90;
    this.CATCHER_H = 18;
    this.catcherX = 0;
    this.catcherEl = null;
    this._pointerId = null;
    /** Свайп: дельта от последней позиции в координатах поля */
    this._dragLastFieldX = 0;
    /** Стрелки / клавиши */
    this._holdLeft = false;
    this._holdRight = false;
    this.MOVE_PX_PER_SEC = 360;

    this._onPointerDown = this.onFieldPointerDown.bind(this);
    this._onPointerMove = this.onFieldPointerMove.bind(this);
    this._onPointerUp = this.onFieldPointerUp.bind(this);
    this._onDocPointerUp = this.onDocPointerUp.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);
    this._arrowLeftDown = (e) => this._onArrowPointerDown(e, "left");
    this._arrowRightDown = (e) => this._onArrowPointerDown(e, "right");
  }

  setRole(role) {
    this.role = role;
  }

  start() {
    this.running = true;
    this.startTime = performance.now();
    this.lastFrame = this.startTime;
    this.spawnAcc = 0;
    this.entities.forEach((e) => e.el.remove());
    this.entities.clear();
    this.combo = 0;
    this.comboTier = 1;
    this.nextGoodMultiplier = 1;
    this.chaos = false;
    this.chaosBannerShown = false;
    this.forkPending = false;
    this.pauseMsTotal = 0;
    this._pauseWallStart = 0;
    this._forkFrozenElapsed = 0;
    this._lastHudWave = 0;
    this._pulseSlot = -1;
    this.money = 0;
    this.time = 100;
    this.energy = 100;
    this.missedIncome = 0;
    this.stats = {
      trapHits: 0,
      trapSwiped: 0,
      goodCaught: 0,
      goodMissed: 0,
      highValueCaught: 0,
      textCaught: 0,
      visualCaught: 0,
      structureCaught: 0,
      boosterCaught: 0,
      forkBold: 0,
      forkCaution: 0,
      forkMargin: 0,
      comboMax: 0,
      wavesCompleted: 0,
    };

    this.catcherEl = document.createElement("div");
    this.catcherEl.className = "catcher";
    this.field.appendChild(this.catcherEl);
    this.catcherX = (this.field.clientWidth - this.CATCHER_W) / 2;
    this._pointerId = null;
    this._holdLeft = false;
    this._holdRight = false;

    this.field.addEventListener("pointerdown", this._onPointerDown, { passive: false });
    this.field.addEventListener("pointermove", this._onPointerMove, { passive: false });
    this.field.addEventListener("pointerup", this._onPointerUp);
    this.field.addEventListener("pointercancel", this._onPointerUp);
    document.addEventListener("pointerup", this._onDocPointerUp);
    document.addEventListener("pointercancel", this._onDocPointerUp);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);

    const btnL = document.getElementById("game-arrow-left");
    const btnR = document.getElementById("game-arrow-right");
    if (btnL) {
      btnL.addEventListener("pointerdown", this._arrowLeftDown, { passive: false });
      btnL.addEventListener("pointercancel", () => { this._holdLeft = false; });
    }
    if (btnR) {
      btnR.addEventListener("pointerdown", this._arrowRightDown, { passive: false });
      btnR.addEventListener("pointercancel", () => { this._holdRight = false; });
    }

    try {
      this.field.focus({ preventScroll: true });
    } catch {
      this.field.focus();
    }

    track("game_start", { role: this.role?.id });
    this._raf = requestAnimationFrame(this._boundLoop);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.field.removeEventListener("pointerdown", this._onPointerDown);
    this.field.removeEventListener("pointermove", this._onPointerMove);
    this.field.removeEventListener("pointerup", this._onPointerUp);
    this.field.removeEventListener("pointercancel", this._onPointerUp);
    document.removeEventListener("pointerup", this._onDocPointerUp);
    document.removeEventListener("pointercancel", this._onDocPointerUp);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    const btnL = document.getElementById("game-arrow-left");
    const btnR = document.getElementById("game-arrow-right");
    if (btnL) btnL.removeEventListener("pointerdown", this._arrowLeftDown);
    if (btnR) btnR.removeEventListener("pointerdown", this._arrowRightDown);
    this._holdLeft = false;
    this._holdRight = false;
    this._pointerId = null;
    if (this.catcherEl) { this.catcherEl.remove(); this.catcherEl = null; }
    this.entities.forEach((e) => e.el.remove());
    this.entities.clear();
    this.field.classList.remove("game-field--paused");
    if (this.gameHint) this.gameHint.hidden = false;
  }

  getWave(t) {
    if (t < WAVE_MS) return 1;
    if (t < WAVE_MS * 2) return 2;
    return 3;
  }

  vibrate(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }

  loop(now) {
    if (!this.running) return;
    const dt = this.forkPending ? 0 : Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const elapsed = this.forkPending
      ? this._forkFrozenElapsed
      : now - this.startTime - this.pauseMsTotal;

    if (elapsed >= SESSION_MS) {
      this.stats.wavesCompleted = 3;
      this.finish();
      return;
    }

    const wave = this.getWave(elapsed);
    const prevWave = this.getWave(elapsed - dt * 1000);
    if (wave > prevWave) {
      this.stats.wavesCompleted = wave - 1;
      track("wave_completed", { wave: this.stats.wavesCompleted });
    }

    this.chaos = this.energy < 20;
    if (this.chaos && !this.chaosBannerShown) {
      this.chaosBannerShown = true;
      const b = document.getElementById("chaos-banner");
      if (b) {
        b.textContent = CHAOS_LINES[Math.floor(this.rng() * CHAOS_LINES.length)];
        b.hidden = false;
        setTimeout(() => {
          b.hidden = true;
        }, 2800);
      }
    }

    if (this.hud.wave && wave !== this._lastHudWave) {
      this._lastHudWave = wave;
      const theme = WAVE_THEMES[wave - 1];
      if (theme) {
        this.hud.wave.textContent = `${theme.title} — ${theme.line}`;
      }
    }

    const progress = elapsed / SESSION_MS;
    this.baseSpawnInterval = 1350 - progress * 520;
    if (this.chaos) this.baseSpawnInterval *= 0.72;
    this.spawnInterval = this.baseSpawnInterval;

    const speedMul = 1 + (wave - 1) * 0.22 + (this.chaos ? 0.35 : 0);
    const vy = (this.field.clientHeight * 0.42) * speedMul;

    if (!this.forkPending) {
      let dir = 0;
      if (this._holdLeft) dir -= 1;
      if (this._holdRight) dir += 1;
      if (dir !== 0) {
        const maxX = Math.max(0, this.field.clientWidth - this.CATCHER_W);
        this.catcherX = clamp(this.catcherX + dir * this.MOVE_PX_PER_SEC * dt, 0, maxX);
      }

      this.spawnAcc += dt * 1000;
      while (this.spawnAcc >= this.spawnInterval) {
        this.spawnAcc -= this.spawnInterval;
        this.spawnEntity(wave);
      }

      const h = this.field.clientHeight;
      const catcherTop = h - 32;

      if (this.catcherEl) {
        this.catcherEl.style.transform = `translate(${this.catcherX}px, ${catcherTop}px)`;
        this.catcherEl.style.width = `${this.CATCHER_W}px`;
        // Визуальный отклик на комбо
        const isCombo = this.comboTier > 1;
        this.catcherEl.classList.toggle("catcher--combo", isCombo);
      }

      const toRemove = [];
      for (const [id, e] of this.entities) {
        if (e.collected || e.defused) continue;

        e.y += vy * dt;
        e.el.style.transform = `translate(${e.x}px, ${e.y}px)`;

        // Таймер горящего объекта
        if (e.kind === "good" && e.burning) {
          if (now > e.burnDeadline) {
            this.applyBurnMiss(e);
            toRemove.push(id);
            continue;
          }
        }

        // Проверка коллизии с каучером
        const eH = e.el.offsetHeight || 36;
        const eW = e.el.offsetWidth || 76;
        const entityBottom = e.y + eH;
        if (entityBottom >= catcherTop && entityBottom <= catcherTop + this.CATCHER_H + 24) {
          const entityLeft = e.x;
          const entityRight = e.x + eW;
          if (entityRight >= this.catcherX && entityLeft <= this.catcherX + this.CATCHER_W) {
            if (e.kind === "good") { this.collectGood(e); }
            else if (e.kind === "trap") { this.tapTrap(e); }
            else if (e.kind === "boost") { this.collectBoost(e); }
            toRemove.push(id);
            continue;
          }
        }

        // Упал за нижний край
        if (e.y > h + 20) {
          if (e.kind === "good") {
            this.missGood(e, false);
          } else if (e.kind === "trap") {
            // Уклонились — это хорошо
            this.stats.trapSwiped++;
          } else if (e.kind === "boost") {
            this.resetCombo("miss_boost");
          }
          toRemove.push(id);
        }
      }
      toRemove.forEach((id) => this.removeEntity(id));
    }

    this.updateHud(elapsed);
    this._raf = requestAnimationFrame(this._boundLoop);
  }

  spawnEntity(wave) {
    if (this.forkPending) return;
    // Развилка по расписанию
    this.pendingForkTime += this.spawnInterval;
    const forkEvery = wave >= 3 ? 9000 : 12000;
    if (this.pendingForkTime >= forkEvery && this.entities.size < 8) {
      this.pendingForkTime = 0;
      this.openFork();
      return;
    }

    const pool = OBJECT_TYPES.map((o) => {
      let w = 1;
      if (o.kind === "good") w = wave >= 2 ? 1.15 : 1;
      if (o.kind === "trap") w = wave === 1 ? 0.55 : wave === 2 ? 1 : 1.25;
      if (o.kind === "boost") w = wave === 1 ? 0.4 : 0.95;
      if (this.chaos && o.kind === "trap") w *= 1.35;
      return { ...o, _w: w };
    });

    const def = pickWeighted(this.rng, pool, "_w");
    const id = this.nextId++;
    const el = document.createElement("div");
    el.className = `floating-obj floating-obj--${def.kind === "trap" ? "trap" : def.kind === "boost" ? "boost" : "good"}`;
    /** В полёте только короткий label — иначе «кирпич» не читается в динамике */
    el.innerHTML = `<span class="floating-obj__label">${escHtml(def.label)}</span>`;
    el.dataset.kind = def.kind;
    el.dataset.oid = String(id);

    const margin = 6;
    /** Ширина карточки ~ max-width в CSS; не выходим за поле */
    const cardW = Math.min(132, this.field.clientWidth * 0.46);
    const maxX = Math.max(margin, this.field.clientWidth - cardW - margin);
    const x = margin + this.rng() * maxX;
    const y = -40 - this.rng() * 30;

    const burning = def.kind === "good" && this.rng() < 0.28 + wave * 0.05;
    if (burning) {
      el.classList.add("floating-obj--burn");
    }

    this.field.appendChild(el);
    const entity = {
      id,
      el,
      def,
      kind: def.kind,
      x,
      y,
      collected: false,
      defused: false,
      burning,
      burnDeadline: burning ? performance.now() + 2600 : 0,
    };
    this.entities.set(id, entity);
  }

  openFork() {
    const wall = performance.now();
    this._forkFrozenElapsed = wall - this.startTime - this.pauseMsTotal;
    this._pauseWallStart = wall;
    this.forkPending = true;
    this.field.classList.add("game-field--paused");
    if (this.gameHint) this.gameHint.hidden = true;

    const fork = FORKS[Math.floor(this.rng() * FORKS.length)];
    this.forkTitle.textContent = fork.title;
    if (this.forkContext) this.forkContext.textContent = fork.context || "";
    this.forkChoices.replaceChildren();
    fork.choices.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fork-choice";
      const hintHtml = c.hint
        ? `<span class="fork-choice__hint">${escHtml(c.hint)}</span>`
        : "";
      btn.innerHTML = `<span class="fork-choice__text">${escHtml(c.text)}</span>${hintHtml}`;
      btn.addEventListener("click", () => this.resolveFork(fork.id, c));
      this.forkChoices.appendChild(btn);
    });
    this.forkOverlay.hidden = false;
    track("decision_choice", { fork: fork.id, phase: "show" });
  }

  resolveFork(forkId, choice) {
    const wall = performance.now();
    const pauseDur = wall - this._pauseWallStart;
    this.pauseMsTotal += pauseDur;
    for (const e of this.entities.values()) {
      if (e.burning && e.burnDeadline) e.burnDeadline += pauseDur;
    }

    this.forkOverlay.hidden = true;
    this.forkPending = false;
    this.field.classList.remove("game-field--paused");
    if (this.gameHint) this.gameHint.hidden = false;
    this.lastFrame = wall;

    this.money = clampMoney(this.money + choice.money);
    this.time = clamp(this.time + choice.time, 0, 100);
    this.energy = clamp(this.energy + choice.energy, 0, 100);
    this.stats.forkBold += choice.bold || 0;
    this.stats.forkCaution += choice.caution || 0;
    this.stats.forkMargin += choice.margin || 0;
    track("decision_choice", { fork: forkId, bold: choice.bold, caution: choice.caution });
    this.floatPop(choice.money >= 0 ? `+${formatMoney(choice.money)}` : formatMoney(choice.money));
  }

  onFieldPointerDown(ev) {
    if (this.forkPending) return;
    ev.preventDefault();
    this._pointerId = ev.pointerId;
    const rect = this.field.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    this._dragLastFieldX = x;
    const maxX = Math.max(0, this.field.clientWidth - this.CATCHER_W);
    this.catcherX = clamp(x - this.CATCHER_W / 2, 0, maxX);
    try {
      this.field.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }

  onFieldPointerMove(ev) {
    if (this.forkPending || ev.pointerId !== this._pointerId) return;
    ev.preventDefault();
    const rect = this.field.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const dx = x - this._dragLastFieldX;
    this._dragLastFieldX = x;
    const maxX = Math.max(0, this.field.clientWidth - this.CATCHER_W);
    this.catcherX = clamp(this.catcherX + dx, 0, maxX);
  }

  onFieldPointerUp(ev) {
    if (ev.pointerId === this._pointerId) {
      this._pointerId = null;
    }
  }

  /** Отпускание пальца вне поля / на стрелке — сбрасываем удержание кнопок */
  onDocPointerUp() {
    this._holdLeft = false;
    this._holdRight = false;
  }

  onKeyDown(ev) {
    if (!this.running || this.forkPending) return;
    const k = ev.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") {
      ev.preventDefault();
      this._holdLeft = true;
    }
    if (k === "ArrowRight" || k === "d" || k === "D") {
      ev.preventDefault();
      this._holdRight = true;
    }
  }

  onKeyUp(ev) {
    const k = ev.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") this._holdLeft = false;
    if (k === "ArrowRight" || k === "d" || k === "D") this._holdRight = false;
  }

  _onArrowPointerDown(ev, side) {
    if (this.forkPending || !this.running) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (side === "left") this._holdLeft = true;
    else this._holdRight = true;
    try {
      if (ev.currentTarget && typeof ev.currentTarget.setPointerCapture === "function") {
        ev.currentTarget.setPointerCapture(ev.pointerId);
      }
    } catch {
      /* ignore */
    }
  }

  collectGood(e) {
    e.collected = true;
    const mult = this.nextGoodMultiplier * this.comboTier;
    this.nextGoodMultiplier = 1;
    const gain = e.def.money * mult;
    this.money = clampMoney(this.money + gain);
    this.time = clamp(this.time + (e.def.time || 0), 0, 100);
    this.energy = clamp(this.energy + (e.def.energy || 0), 0, 100);
    this.combo++;
    if (this.combo >= 5) this.comboTier = 3;
    else if (this.combo >= 3) this.comboTier = 2;
    else this.comboTier = 1;
    this.stats.comboMax = Math.max(this.stats.comboMax, this.combo);
    this.stats.goodCaught++;
    const tags = e.def.tags || [];
    if (tags.includes("money")) this.stats.highValueCaught++;
    if (tags.includes("text")) this.stats.textCaught++;
    if (tags.includes("visual")) this.stats.visualCaught++;
    if (tags.includes("structure")) this.stats.structureCaught++;
    this.floatPop(`+${formatMoney(gain)}${this.comboTier > 1 ? ` · x${this.comboTier}` : ""}`);
    this.vibrate(10);
    this.removeEntity(e.id);
  }

  collectBoost(e) {
    e.collected = true;
    this.stats.boosterCaught++;
    const b = e.def.boost;
    if (b === "time") {
      this.time = clamp(this.time + (e.def.amount || 10), 0, 100);
      this.floatPop(`+${e.def.amount} времени`);
    } else if (b === "energy") {
      this.energy = clamp(this.energy + (e.def.amount || 8), 0, 100);
      this.floatPop(`+${e.def.amount} энергии`);
    } else if (b === "combo2") {
      this.nextGoodMultiplier = 2;
      this.floatPop("x2 к следующему");
    }
    const tags = e.def.tags || [];
    if (tags.includes("text")) this.stats.textCaught++;
    if (tags.includes("visual")) this.stats.visualCaught++;
    if (tags.includes("structure")) this.stats.structureCaught++;
    track("booster_caught", { id: e.def.id });
    this.vibrate(12);
    this.removeEntity(e.id);
  }

  tapTrap(e) {
    this.stats.trapHits++;
    track("trap_hit", { id: e.def.id, how: "tap" });
    const m = e.def.money || -5000;
    const tm = e.def.time || -5;
    const en = e.def.energy || -5;
    this.money = clampMoney(this.money + m);
    this.time = clamp(this.time + tm, 0, 100);
    this.energy = clamp(this.energy + en, 0, 100);
    this.resetCombo("trap_tap");
    this.floatPop("Ловушка!");
    this.vibrate([20, 40, 20]);
    this.removeEntity(e.id);
  }

  hitTrapBottom(e) {
    this.stats.trapHits++;
    track("trap_hit", { id: e.def.id, how: "miss_swipe" });
    const m = (e.def.money || -5000) * 0.85;
    const tm = (e.def.time || -5) * 0.85;
    const en = (e.def.energy || -5) * 0.85;
    this.money = clampMoney(this.money + m);
    this.time = clamp(this.time + tm, 0, 100);
    this.energy = clamp(this.energy + en, 0, 100);
    this.resetCombo("trap_bottom");
    this.vibrate(25);
    this.removeEntity(e.id);
  }

  missGood(e, fromBurn) {
    this.stats.goodMissed++;
    const base = Math.abs(e.def.money || 5000) * 0.35;
    this.missedIncome += base;
    this.time = clamp(this.time - 4, 0, 100);
    this.energy = clamp(this.energy - 2, 0, 100);
    this.resetCombo("miss_good");
    this.floatPop(fromBurn ? "Упущено!" : "Не успели");
    this.removeEntity(e.id);
  }

  applyBurnMiss(e) {
    if (e.collected) return;
    e.collected = true;
    const gross = Math.abs(e.def.money || 5000);
    this.missedIncome += gross * 0.85;
    this.money = clampMoney(this.money - gross * 0.12);
    this.time = clamp(this.time - 6, 0, 100);
    this.energy = clamp(this.energy - 3, 0, 100);
    this.stats.goodMissed++;
    this.resetCombo("burn");
    this.floatPop("Сгорающая возможность!");
    this.removeEntity(e.id);
  }

  resetCombo(reason) {
    this.combo = 0;
    this.comboTier = 1;
    this.nextGoodMultiplier = 1;
    void reason;
  }

  removeEntity(id) {
    const e = this.entities.get(id);
    if (e) {
      e.el.remove();
      this.entities.delete(id);
    }
  }

  floatPop(text) {
    const p = document.createElement("div");
    p.className = "pop";
    p.textContent = text;
    p.style.left = "50%";
    p.style.top = "40%";
    p.style.color = text.includes("Ловушка") ? "var(--bad)" : "var(--good)";
    this.field.appendChild(p);
    setTimeout(() => p.remove(), 950);
  }

  updateHud(elapsed) {
    const left = Math.max(0, SESSION_MS - elapsed);
    const sec = Math.ceil(left / 1000);
    this.hud.timer.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    this.hud.money.textContent = formatMoneyHud(this.money);
    this.hud.time.textContent = String(Math.round(this.time));
    this.hud.energy.textContent = String(Math.round(this.energy));
    this.hud.barTime.style.width = `${this.time}%`;
    this.hud.barEnergy.style.width = `${this.energy}%`;
    let comboTxt = "";
    if (this.combo >= 5) {
      comboTxt = `Комбо ×3 · ${COMBO_FLAVOR[5] || ""}`;
    } else if (this.combo >= 3) {
      comboTxt = `Комбо ×2 · ${COMBO_FLAVOR[3] || ""}`;
    } else if (this.combo >= 2) {
      comboTxt = `${COMBO_FLAVOR[2] || "Серия"} · ${this.combo} подряд`;
    } else if (this.combo > 0) {
      comboTxt = `Серия ${this.combo}`;
    }
    this.hud.combo.textContent = comboTxt;

    if (this.hud.pulse && MARKET_HEADLINES.length) {
      const slot = Math.floor(elapsed / 5200) % MARKET_HEADLINES.length;
      if (slot !== this._pulseSlot) {
        this._pulseSlot = slot;
        this.hud.pulse.textContent = MARKET_HEADLINES[slot];
      }
    }
  }

  finish() {
    this.stop();
    const stats = this.getStats();
    this.onEnd(stats);
  }

  getStats() {
    return {
      ...this.stats,
      moneyEnd: this.money,
      timeEnd: this.time,
      energyEnd: this.energy,
      missedIncome: this.missedIncome,
      roleId: this.role?.id,
    };
  }
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function clampMoney(m) {
  return clamp(m, 0, 500000);
}
