import { ROLES } from "./data.js";
import { computeArchetype } from "./diagnostics.js";
import { Game } from "./game.js";
import { track } from "./analytics.js";

const $ = (id) => document.getElementById(id);

/** GetCourse: основной сценарий — модалка + официальный скрипт и startWidget (как раньше). Вкладка — только по кнопке. */
const GC_WIDGET_NUMERIC_ID = "1548726";
const GC_WIDGET_ORIGIN = "https://xeniabaranova-school.ru";
const GC_SCRIPT_ID = "d48ff3838cc31a339002de310cb84f2fcb4f866e";
const GC_SCRIPT_SRC = `${GC_WIDGET_ORIGIN}/pl/lite/widget/script?id=${GC_WIDGET_NUMERIC_ID}`;

function buildGetcourseWidgetUrl() {
  const qs = window.location.search ? `${window.location.search.substring(1)}&` : "";
  let url = `${GC_WIDGET_ORIGIN}/pl/lite/widget/widget?${qs}id=${GC_WIDGET_NUMERIC_ID}&ref=${encodeURIComponent(document.referrer)}&loc=${encodeURIComponent(window.location.href)}`;
  try {
    if (window.clrtQueryData) {
      url += `&clrtQueryData=${encodeURIComponent(JSON.stringify(window.clrtQueryData))}`;
    }
  } catch {
    /* ignore */
  }
  return url;
}

function openGetcourseInNewTab() {
  const url = buildGetcourseWidgetUrl();
  window.open(url, "_blank", "noopener,noreferrer");
}

function gcWidgetFallbackHtml() {
  const href = buildGetcourseWidgetUrl();
  return `<p class="gc-popup__err">Не удалось встроить форму. <a href="${href}" target="_blank" rel="noopener">Открыть в новой вкладке</a></p>`;
}

function closeGetcoursePopup() {
  const overlay = $("gc-popup-overlay");
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("gc-popup-open");
}

/** Модалка с виджетом GetCourse (основной сценарий по зелёной кнопке) */
function openGetcourseModal() {
  const overlay = $("gc-popup-overlay");
  const wrap = $("gc-popup-frame-wrap");
  if (!overlay || !wrap) return;

  overlay.hidden = false;
  document.body.classList.add("gc-popup-open");

  if (wrap.querySelector("iframe")) return;
  if (wrap.dataset.gcLoading === "1") return;
  if (document.getElementById(GC_SCRIPT_ID)) return;

  wrap.replaceChildren();
  wrap.dataset.gcLoading = "1";
  wrap.style.overflow = "hidden";

  const s = document.createElement("script");
  s.id = GC_SCRIPT_ID;
  s.src = GC_SCRIPT_SRC;
  s.async = true;
  s.onerror = () => {
    wrap.dataset.gcLoading = "0";
    wrap.innerHTML = gcWidgetFallbackHtml();
  };
  s.onload = () => {
    wrap.dataset.gcLoading = "0";
    const starter = window[`startWidget${GC_SCRIPT_ID}`];
    if (typeof starter === "function") {
      try {
        starter();
      } catch (e) {
        console.error("neurostorm: GetCourse startWidget", e);
        wrap.innerHTML = gcWidgetFallbackHtml();
        return;
      }
    } else {
      wrap.innerHTML = gcWidgetFallbackHtml();
      return;
    }
    wrap.style.overflow = "auto";
    wrap.style.maxHeight = "calc(92vh - 56px)";
    requestAnimationFrame(() => {
      const ifr = wrap.querySelector("iframe");
      if (!ifr) return;
      const parsed = parseInt(String(ifr.style.height || "0"), 10);
      if (parsed < 120) ifr.style.minHeight = `${Math.min(520, Math.round(window.innerHeight * 0.75))}px`;
    });
  };
  wrap.appendChild(s);
}

function openGetcourseWidgetFromCta() {
  openGetcourseModal();
}

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
    barMoney: $("bar-money"),
    barTime: $("bar-time"),
    barEnergy: $("bar-energy"),
    statMoney: $("hud-stat-money"),
    statTime: $("hud-stat-time"),
    statEnergy: $("hud-stat-energy"),
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
    onEnd: (stats) => showResult(stats, selectedRole),
  });
  game.setRole(selectedRole);
  game.start();
}

function showResult(stats, role) {
  const arch = computeArchetype(stats);
  track("final_archetype", { key: arch.key, stats });

  showScreen("result");
  $("result-headline").textContent = "Смена закончилась — вот что она показала";
  $("result-money").textContent = `Заработано за смену: ${formatRub(stats.moneyEnd)}`;
  const missed = stats.missedIncome || 0;
  const earned = Math.max(0, stats.moneyEnd || 0);
  $("result-missed").textContent =
    missed > 2000
      ? formatMissedLine(missed, earned)
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
  $("result-case-title").textContent = (role && role.caseTitle) || arch.caseTitle;
  $("result-case-text").textContent = (role && role.caseText) || arch.caseText;

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
    $("cta-recap-arch").textContent = arch.title;
    $("cta-recap-stat").textContent = `+ ${formatRub(stats.moneyEnd)} заработано`;
    $("cta-sub").textContent = arch.ctaSub;
    const main = $("btn-cta-main");
    const sec = $("btn-cta-secondary");
    main.textContent = arch.ctaMain;
    sec.textContent = arch.ctaSecondary;
    main.onclick = () => {
      track("cta_click", { which: "main", archetype: arch.key });
      openGetcourseWidgetFromCta();
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

/** Доля упущенного от кассы — чтобы большая «заработано» не обесценивала абсолют */
function formatMissedShare(missed, earned) {
  if (earned <= 0) return "";
  const pct = (missed / earned) * 100;
  const formatted =
    pct < 0.05
      ? "менее 0,1"
      : new Intl.NumberFormat("ru-RU", {
          maximumFractionDigits: pct < 10 ? 1 : 0,
          minimumFractionDigits: 0,
        }).format(Math.round(pct * 10) / 10);
  return ` (~${formatted}% от выручки за смену)`;
}

function formatMissedLine(missed, earned) {
  const share = formatMissedShare(missed, earned);
  const tail =
    earned > 0 && missed / earned < 0.12
      ? " На одной смене цифра кажется небольшой на фоне кассы — но это уже доля выручки, а не «мелочь в кармане»."
      : "";
  return `Упущенный потенциал (промахи по выгоде и дорогие решения на развилках): ~ ${formatRub(missed)}${share}.${tail} Не приговор — точка роста.`;
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

  const gcClose = $("gc-popup-close");
  const gcBackdrop = $("gc-popup-backdrop");
  const gcOpenTab = $("gc-popup-open-tab");
  const ctaNewTab = $("btn-cta-form-newtab");
  if (gcClose) gcClose.addEventListener("click", closeGetcoursePopup);
  if (gcBackdrop) gcBackdrop.addEventListener("click", closeGetcoursePopup);
  if (gcOpenTab) {
    gcOpenTab.addEventListener("click", () => {
      track("cta_form_new_tab", { from: "modal_header" });
      openGetcourseInNewTab();
    });
  }
  if (ctaNewTab) {
    ctaNewTab.addEventListener("click", () => {
      track("cta_form_new_tab", { from: "cta_screen" });
      openGetcourseInNewTab();
    });
  }
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const overlay = $("gc-popup-overlay");
    if (overlay && !overlay.hidden) {
      closeGetcoursePopup();
      ev.preventDefault();
    }
  });

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
