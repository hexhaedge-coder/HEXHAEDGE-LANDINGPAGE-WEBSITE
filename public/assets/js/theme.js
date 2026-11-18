// Theme switch shared by every page. Buttons carry [data-theme-toggle].
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function paint(btn) {
  const dark = currentTheme() === "dark";
  btn.innerHTML = (dark ? ICON_SUN : ICON_MOON) + `<span>${dark ? "Cream" : "Dark"}</span>`;
  btn.setAttribute("aria-pressed", String(dark));
  btn.setAttribute("aria-label", dark ? "Switch to cream theme" : "Switch to dark theme");
}

export function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("hx-theme", theme); } catch (e) { /* ignore */ }
  document.querySelectorAll("[data-theme-toggle]").forEach(paint);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#16110d" : "#f3ede1");
}

export function initThemeToggles() {
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    paint(btn);
    btn.addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));
  });
}
