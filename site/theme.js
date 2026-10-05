// Light and dark. The page opens light; the visitor's choice is kept in
// localStorage for the next visit. Loaded in the head so the right colours
// are in place before the first paint.
(function () {
  var root = document.documentElement;
  var theme = "light";
  try {
    if (localStorage.getItem("theme") === "dark") theme = "dark";
  } catch (e) {
    // No storage: the page stays light.
  }
  root.dataset.theme = theme;

  // Screenshots are picked with media queries, which only know the system
  // setting. Point them at the theme that is actually showing.
  function syncPictures() {
    var sources = document.querySelectorAll("source[media]");
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      if (!s.dataset.media) s.dataset.media = s.media;
      s.media = s.dataset.media.replace("(prefers-color-scheme: dark)", theme === "dark" ? "(min-width: 0px)" : "(max-width: 0px)");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    syncPictures();
    var button = document.getElementById("theme");
    if (!button) return;
    button.addEventListener("click", function () {
      theme = theme === "dark" ? "light" : "dark";
      root.dataset.theme = theme;
      try {
        localStorage.setItem("theme", theme);
      } catch (e) {}
      syncPictures();
    });
  });
})();
