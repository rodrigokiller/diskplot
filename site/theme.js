// Light and dark. The page follows the system until the visitor picks one;
// the choice is kept for the next visit. Loaded in the head so the right
// colours are in place before the first paint.
(function () {
  var root = document.documentElement;
  var saved = null;
  try {
    saved = localStorage.getItem("theme");
  } catch (e) {
    // No storage: the page just follows the system.
  }
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;

  var system = window.matchMedia("(prefers-color-scheme: dark)");
  function current() {
    return root.dataset.theme || (system.matches ? "dark" : "light");
  }

  // Screenshots are picked with media queries, which only know the system
  // setting. When the visitor overrides it, point them the same way.
  function syncPictures() {
    var forced = root.dataset.theme;
    var sources = document.querySelectorAll("source[media]");
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      if (!s.dataset.media) s.dataset.media = s.media;
      s.media = forced
        ? s.dataset.media.replace("(prefers-color-scheme: dark)", forced === "dark" ? "(min-width: 0px)" : "(max-width: 0px)")
        : s.dataset.media;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    syncPictures();
    var button = document.getElementById("theme");
    if (!button) return;
    button.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      // Choosing what the system already says means following it again.
      if (next === (system.matches ? "dark" : "light")) {
        delete root.dataset.theme;
        try {
          localStorage.removeItem("theme");
        } catch (e) {}
      } else {
        root.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch (e) {}
      }
      syncPictures();
    });
  });
})();
