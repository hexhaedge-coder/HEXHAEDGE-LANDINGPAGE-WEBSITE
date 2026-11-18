// Runs before first paint so the page never flashes the wrong theme.
// Cream is the default; dark only when the visitor switched it on.
(function () {
  var theme = "light";
  try {
    var saved = window.localStorage.getItem("hx-theme");
    if (saved === "dark" || saved === "light") theme = saved;
  } catch (e) { /* storage blocked: keep cream */ }
  document.documentElement.setAttribute("data-theme", theme);

  // Web fonts load without blocking the first paint: the page shows at once
  // in the fallback fonts, then switches when the font file arrives.
  var fonts = document.getElementById("hx-fonts");
  if (fonts) {
    var on = function () { fonts.media = "all"; };
    if (fonts.sheet) on(); else fonts.addEventListener("load", on);
  }

  // Offline cache for instant repeat visits.
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }
})();
