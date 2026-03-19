/**
 * Замените на отправку в вашу аналитику (GA4, Matomo, свой endpoint).
 */
export function track(event, payload = {}) {
  const row = { event, ...payload, t: Date.now() };
  // eslint-disable-next-line no-console
  console.info("[analytics]", row);
  try {
    window.dispatchEvent(new CustomEvent("neurostorm_analytics", { detail: row }));
  } catch {
    /* ignore */
  }
}
