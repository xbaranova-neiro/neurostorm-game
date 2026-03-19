import { ROLES } from "./data.js";
import { computeArchetype } from "./diagnostics.js";
import { Game } from "./game.js";
import { track } from "./analytics.js";

const $ = (id) => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.remove("screen--active");
    s.hidden = true;
  });
  const el = $(`screen-${name}`);
  if (el) {
    el.hidden = false;
    el.classList.add("screen--active");
  }
}

function buildRoles() {
  const grid = $("role-grid");
  grid.replaceChildren();
  ROLES.forEach((r) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "role-card";
    const pitch = r.pitch || r.desc || "";
    const story = r.story || "";
    b.innerHTML = `<span class="role-card__emoji" aria-hidden="true">${r.emoji}</span><span class="role-card__name">${r.name}</span><span class="role-card__pitch">${pitch}</span>${story ? `<span class="role-card__story">${story}</span>` : ""}`;
    b.addEventListener("click", () => {
      selectedRole = r;
      track("role_selected", { role: r.id });
      showScreen("onboarding");
    });
    grid.appendChild(b);
  });
}

let selectedRole = ROLES[5];
let game = null;

function startGameFlow() {
  showScreen("game");
  const field = $("game-field");
  const hud = {
    money: $("hud-money"),
    time: $("hud-time"),
    energy: $("hud-energy"),
    barTime: $("bar-time"),
    barEnergy: $("bar-energy"),
    timer: $("hud-timer"),
    combo: $("hud-combo"),
    wave: $("hud-wave"),
    pulse: $("hud-pulse"),
  };
  $("hud-role").textContent = selectedRole.name;

  if (game) game.stop();
  game = new Game({
    field,
    hud,
    forkOverlay: $("fork-overlay"),
    forkTitle: $("fork-title"),
    forkChoices: $("fork-choices"),
    onEnd: showResult,
  });
  game.setRole(selectedRole);
  game.start();
}

function showResult(stats) {
  const arch = computeArchetype(stats);
  track("final_archetype", { key: arch.key, stats });

  showScreen("result");
  $("result-headline").textContent = "Смена закончилась — вот что она показала";
  $("result-money").textContent = `Заработано за смену: ${formatRub(stats.moneyEnd)}`;
  const missed = stats.missedIncome || 0;
  $("result-missed").textContent =
    missed > 2000
      ? `Упущено из-за ручного режима и нерешительности: ~ ${formatRub(missed)}. Не приговор — точка роста.`
      : "Упущения умеренные — запас по темпу есть. Систему можно наращивать без авралов.";
  $("result-archetype").textContent = `Ваш режим на рынке: ${arch.title}`;
  const subEl = $("result-subtitle");
  subEl.textContent = arch.subtitle || "";
  subEl.hidden = !arch.subtitle;
  $("result-body").textContent = arch.pain;
  const insEl = $("result-insight");
  insEl.textContent = arch.insight ? `В точку: ${arch.insight}` : "";
  insEl.hidden = !arch.insight;

  const mistakes = $("result-mistakes");
  mistakes.replaceChildren();
  (arch.mistakes || []).forEach((m) => {
    const li = document.createElement("li");
    li.textContent = m;
    mistakes.appendChild(li);
  });
  const mistakesBlock = document.querySelector(".result-block--mistakes");
  if (mistakesBlock) mistakesBlock.hidden = !(arch.mistakes && arch.mistakes.length);
  $("result-case-title").textContent = arch.caseTitle;
  $("result-case-text").textContent = arch.caseText;

  const zones = $("result-zones");
  zones.replaceChildren();
  arch.zones.forEach((z) => {
    const li = document.createElement("li");
    li.textContent = z;
    zones.appendChild(li);
  });
  $("result-step").textContent = arch.step;

  const toolsEl = $("result-tools");
  toolsEl.replaceChildren();
  (arch.tools || []).forEach((t) => {
    const span = document.createElement("span");
    span.className = "tool-pill";
    span.textContent = t;
    toolsEl.appendChild(span);
  });

  window.__neurostorm_last = { stats, arch };

  $("btn-to-cta").onclick = () => {
    showScreen("cta");
    $("cta-sub").textContent = arch.ctaSub;
    const main = $("btn-cta-main");
    const sec = $("btn-cta-secondary");
    main.textContent = arch.ctaMain;
    sec.textContent = arch.ctaSecondary;
    main.onclick = () => {
      track("cta_click", { which: "main", archetype: arch.key });
      alert("Здесь — ваша форма, бот или CRM. Событие уже в консоли.");
    };
    sec.onclick = () => {
      track("cta_click", { which: "secondary", archetype: arch.key });
      showScreen("role");
    };
  };
}

function formatRub(n) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n)) + " ₽";
}

function init() {
  const startBtn = $("btn-start");
  const okBtn = $("btn-onboarding-ok");
  if (!startBtn) {
    console.error("neurostorm: не найден #btn-start");
    return;
  }
  buildRoles();
  startBtn.addEventListener("click", () => {
    showScreen("role");
  });
  if (okBtn) {
    okBtn.addEventListener("click", () => {
      startGameFlow();
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
