// Download page: reads the published releases from GitHub and lists them.
// Release notes may carry one block per language, marked <!--lang:en--> and
// <!--lang:pt-->; only the block for this page's language is shown.
(function () {
  var REPO = "rodrigokiller/diskplot";
  var pt = document.documentElement.lang.indexOf("pt") === 0;
  var T = pt
    ? {
        loading: "Buscando as versões...",
        none: "Ainda não há uma versão publicada. Enquanto isso, dá para compilar a partir do código no GitHub.",
        failed: "Não foi possível consultar o GitHub agora. As versões estão em",
        version: "Versão",
        released: "publicada em",
        installer: "Instalador para Windows",
        installerMeta: "Recomendado. Cria atalhos e se atualiza sozinho.",
        portable: "Versão portátil para Windows",
        portableMeta: "Um único executável. Não instala nada.",
        appimage: "Linux, AppImage",
        deb: "Linux, pacote .deb",
        dmg: "macOS",
        experimental: "Experimental, pouco testado.",
        download: "Baixar",
        earlier: "Versões anteriores",
        notes: "Notas desta versão",
        unsigned: "O executável ainda não tem assinatura digital, então o Windows pode mostrar o aviso do SmartScreen na primeira execução. Escolha \"Mais informações\" e \"Executar assim mesmo\".",
      }
    : {
        loading: "Loading versions...",
        none: "No version has been published yet. Until then, Diskplot can be built from the source on GitHub.",
        failed: "GitHub could not be reached right now. The versions are at",
        version: "Version",
        released: "released",
        installer: "Windows installer",
        installerMeta: "Recommended. Adds shortcuts and updates itself.",
        portable: "Windows portable",
        portableMeta: "A single executable. Installs nothing.",
        appimage: "Linux, AppImage",
        deb: "Linux, .deb package",
        dmg: "macOS",
        experimental: "Experimental, lightly tested.",
        download: "Download",
        earlier: "Earlier versions",
        notes: "Notes for this version",
        unsigned: "The executable is not code signed yet, so Windows may show a SmartScreen warning on first run. Choose \"More info\", then \"Run anyway\".",
      };

  var latest = document.getElementById("latest");
  var versions = document.getElementById("versions");
  if (!latest || !versions) return;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function size(bytes) {
    var mb = bytes / 1048576;
    var s = mb >= 100 ? String(Math.round(mb)) : mb.toFixed(1);
    return (pt ? s.replace(".", ",") : s) + " MB";
  }
  function date(iso) {
    return new Date(iso).toLocaleDateString(pt ? "pt-BR" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  // Which downloadable each asset is, in the order they are offered.
  var KINDS = [
    { key: "installer", test: /-Setup-.*\.exe$/i },
    { key: "portable", test: /\.exe$/i },
    { key: "appimage", test: /\.AppImage$/i, experimental: true },
    { key: "deb", test: /\.deb$/i, experimental: true },
    { key: "dmg", test: /\.dmg$/i, experimental: true },
  ];
  function classify(assets) {
    var out = [];
    var used = {};
    KINDS.forEach(function (k) {
      for (var i = 0; i < assets.length; i++) {
        var a = assets[i];
        if (!used[a.name] && k.test.test(a.name)) {
          used[a.name] = true;
          out.push({ kind: k, asset: a });
          break;
        }
      }
    });
    return out;
  }

  function pickLanguage(body) {
    var want = pt ? "pt" : "en";
    var parts = (body || "").split(/<!--\s*lang:(\w+)\s*-->/);
    if (parts.length < 3) return body || "";
    var first = "";
    for (var i = 1; i < parts.length; i += 2) {
      if (!first) first = parts[i + 1];
      if (parts[i] === want) return parts[i + 1];
    }
    return first;
  }

  // A small subset of Markdown, built as DOM nodes so nothing is injected.
  function inline(parent, text) {
    text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).forEach(function (piece) {
      if (/^`[^`]+`$/.test(piece)) parent.appendChild(el("code", null, piece.slice(1, -1)));
      else if (/^\*\*[^*]+\*\*$/.test(piece)) parent.appendChild(el("strong", null, piece.slice(2, -2)));
      else if (piece) parent.appendChild(document.createTextNode(piece));
    });
  }
  function notes(body) {
    var box = el("div", "notes");
    var list = null;
    pickLanguage(body).split(/\r?\n/).forEach(function (line) {
      var m;
      if ((m = line.match(/^#{1,4}\s+(.*)/))) {
        list = null;
        inline(box.appendChild(el("h3")), m[1]);
      } else if ((m = line.match(/^\s*[-*]\s+(.*)/))) {
        if (!list) list = box.appendChild(el("ul"));
        inline(list.appendChild(el("li")), m[1]);
      } else if (line.trim()) {
        list = null;
        inline(box.appendChild(el("p")), line.trim());
      }
    });
    return box;
  }

  function showLatest(r) {
    latest.textContent = "";
    var head = latest.appendChild(el("div", "latest-head"));
    head.appendChild(el("strong", null, T.version + " " + r.tag_name.replace(/^v/, "")));
    head.appendChild(el("span", null, T.released + " " + date(r.published_at)));
    var files = latest.appendChild(el("div", "files"));
    classify(r.assets).forEach(function (f, i) {
      var box = files.appendChild(el("div", "file"));
      box.appendChild(el("span", "what", T[f.kind.key]));
      box.appendChild(el("span", "meta", (T[f.kind.key + "Meta"] || (f.kind.experimental ? T.experimental : "")) + " " + size(f.asset.size)));
      var a = box.appendChild(el("a", "btn" + (i === 0 ? "" : " line"), T.download));
      a.href = f.asset.browser_download_url;
    });
    latest.appendChild(el("p", "empty", T.unsigned));
    var n = notes(r.body);
    if (n.childNodes.length) {
      n.insertBefore(el("h3", null, T.notes), n.firstChild);
      latest.appendChild(n);
    }
  }

  function showEarlier(list) {
    if (list.length === 0) return;
    versions.appendChild(el("h2", "versions-title", T.earlier));
    list.forEach(function (r) {
      var d = versions.appendChild(el("details", "version"));
      var s = d.appendChild(el("summary", null, r.tag_name.replace(/^v/, "")));
      s.appendChild(el("span", null, date(r.published_at)));
      d.appendChild(notes(r.body));
      var assets = d.appendChild(el("div", "assets"));
      classify(r.assets).forEach(function (f) {
        var a = assets.appendChild(el("a", null, T[f.kind.key] + " (" + size(f.asset.size) + ")"));
        a.href = f.asset.browser_download_url;
      });
    });
  }

  function message(text, link) {
    latest.textContent = "";
    var p = latest.appendChild(el("p", "empty", text + " "));
    if (link) {
      var a = p.appendChild(el("a", null, "github.com/" + REPO + "/releases"));
      a.href = "https://github.com/" + REPO + "/releases";
    }
  }

  message(T.loading);
  fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=30", { headers: { Accept: "application/vnd.github+json" } })
    .then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    })
    .then(function (all) {
      var list = all.filter(function (r) { return !r.draft && !r.prerelease; });
      if (list.length === 0) return message(T.none, true);
      showLatest(list[0]);
      showEarlier(list.slice(1));
    })
    .catch(function () {
      message(T.failed, true);
    });
})();
