// The plan in the hero: a small squarified treemap over example data,
// drawn the way the app draws a real disk. Click a folder to open it.
(function () {
  var plan = document.getElementById("plan");
  var crumbs = document.getElementById("crumbs");
  if (!plan || !crumbs) return;
  var pt = document.documentElement.lang.indexOf("pt") === 0;
  var hint = pt ? "Clique em uma pasta para abrir" : "Click a folder to open it";

  // [name, GB] for a file, [name, [children]] for a folder. Example data.
  var DATA = ["C:", [
    ["Users", [
      ["Videos", [["holiday-2024.mp4", 38], ["screen-recordings", [["demo-take-3.mkv", 21], ["demo-take-2.mkv", 19], ["standup.mkv", 6]]], ["wedding.mov", 27]]],
      ["Downloads", [["ubuntu-24.04.iso", 5.8], ["win11.iso", 6.4], ["installer-old.exe", 2.1], ["dataset.zip", 14], ["dataset (1).zip", 14]]],
      ["Projects", [
        ["shop-frontend", [["node_modules", [["next", 0.9], ["@swc", 0.7], ["typescript", 0.3], ["others", 2.2]]], [".next", [["cache", 3.8], ["server", 0.6]]], ["src", 0.2]]],
        ["api", [["target", [["debug", 6.1], ["release", 2.4]]], ["src", 0.1]]],
        ["ml-notebook", [[".venv", 4.6], ["checkpoints", [["epoch-12.pt", 3.2], ["epoch-11.pt", 3.2], ["epoch-10.pt", 3.2]]]]]
      ]],
      ["AppData", [["Local", [["Temp", 7.5], ["npm-cache", 3.1], ["Chrome", [["Cache", 2.6], ["Profile", 1.2]]], ["Docker", [["wsl", [["ext4.vhdx", 46]]]]]]], ["Roaming", 4.2]]],
      ["Pictures", [["2023", 9], ["2024", 12], ["raw", 22]]]
    ]],
    ["Program Files", [["Games", [["OpenWorld", [["textures.pak", 41], ["audio.pak", 12], ["video", 9]]], ["Racer", 24]]], ["Editors", 6.5], ["Office", 4.8]]],
    ["Windows", [["WinSxS", 11], ["System32", 7.2], ["Installer", 5.4], ["SoftwareDistribution", 3.9], ["others", 4.1]]],
    ["pagefile.sys", 16],
    ["hiberfil.sys", 12.8]
  ]];

  function build(raw, parent) {
    var node = { name: raw[0], parent: parent, size: 0, kids: null };
    if (Array.isArray(raw[1])) {
      node.kids = raw[1].map(function (r) { return build(r, node); }).sort(function (a, b) { return b.size - a.size; });
      node.size = node.kids.reduce(function (a, k) { return a + k.size; }, 0);
    } else node.size = raw[1];
    return node;
  }
  var root = build(DATA, null);
  var view = root;

  function gb(n) {
    var s = n >= 100 ? Math.round(n) : n.toFixed(1);
    return (pt ? String(s).replace(".", ",") : s) + " GB";
  }
  function tone(share) {
    return share >= 0.05 ? 5 : share >= 0.02 ? 4 : share >= 0.008 ? 3 : share >= 0.003 ? 2 : 1;
  }

  // Squarify `kids` into the box, calling place(kid, x, y, w, h).
  function squarify(kids, total, x, y, w, h, place) {
    var scale = (w * h) / total, i = 0;
    while (i < kids.length && w > 1 && h > 1) {
      var short = Math.min(w, h), sum = 0, min = Infinity, max = 0, worst = Infinity, j = i;
      while (j < kids.length) {
        var a = kids[j].size * scale, ns = sum + a, mx = Math.max(max, a), mn = Math.min(min, a);
        var ratio = Math.max((short * short * mx) / (ns * ns), (ns * ns) / (short * short * mn));
        if (j > i && ratio > worst) break;
        sum = ns; max = mx; min = mn; worst = ratio; j++;
      }
      var thick = sum / short, at = w >= h ? y : x;
      for (var k = i; k < j; k++) {
        var len = (kids[k].size * scale) / thick;
        if (w >= h) place(kids[k], x, at, thick, len); else place(kids[k], at, y, len, thick);
        at += len;
      }
      if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
      i = j;
    }
  }

  function draw(from) {
    var W = plan.clientWidth, H = plan.clientHeight;
    plan.textContent = "";
    var frag = document.createDocumentFragment();
    function place(node, x, y, w, h, depth) {
      var el = document.createElement("div");
      el.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px";
      if (node.kids) {
        var labelled = w > 56 && h > 34;
        el.className = "cell dir d" + Math.min(depth, 3);
        el.title = node.name + ", " + gb(node.size);
        el.addEventListener("click", function (e) { e.stopPropagation(); open(node, el); });
        if (labelled) {
          var label = document.createElement("div");
          label.className = "label";
          label.innerHTML = "<span></span><span></span>";
          label.firstChild.textContent = node.name;
          if (w > 150) label.lastChild.textContent = gb(node.size);
          el.appendChild(label);
        }
        var pad = 2, top = labelled ? 18 : pad, bw = depth === 1 ? 2 : 1;
        var iw = w - pad * 2 - bw * 2, ih = h - top - pad - bw * 2;
        if (iw > 4 && ih > 4) {
          var inner = document.createElement("div");
          inner.style.cssText = "position:absolute;left:" + pad + "px;top:" + top + "px;width:" + iw + "px;height:" + ih + "px";
          squarify(node.kids, node.size, 0, 0, iw, ih, function (k, kx, ky, kw, kh) { inner.appendChild(place(k, kx, ky, kw, kh, depth + 1)); });
          el.appendChild(inner);
        }
      } else {
        el.className = "cell file v" + tone(node.size / view.size) + (w < 52 || h < 20 ? " tiny" : "");
        el.title = node.name + ", " + gb(node.size);
        el.textContent = node.name;
        if (h > 36) {
          var s = document.createElement("small");
          s.textContent = gb(node.size);
          el.appendChild(s);
        }
      }
      return el;
    }
    squarify(view.kids, view.size, 0, 0, W, H, function (k, x, y, w, h) { frag.appendChild(place(k, x, y, w, h, 1)); });
    plan.appendChild(frag);

    if (from) {
      plan.style.setProperty("--il", from.l + "px");
      plan.style.setProperty("--it", from.t + "px");
      plan.style.setProperty("--ir", from.r + "px");
      plan.style.setProperty("--ib", from.b + "px");
      plan.classList.remove("zooming");
      void plan.offsetWidth;
      plan.classList.add("zooming");
    }

    crumbs.textContent = "";
    var path = [];
    for (var n = view; n; n = n.parent) path.unshift(n);
    path.forEach(function (n, i) {
      if (i) {
        var sep = document.createElement("span");
        sep.className = "sep";
        sep.textContent = "/";
        sep.setAttribute("aria-hidden", "true");
        crumbs.appendChild(sep);
      }
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = n.name;
      if (n === view) b.setAttribute("aria-current", "true");
      b.addEventListener("click", function () { view = n; draw(null); });
      crumbs.appendChild(b);
    });
    var h = document.createElement("span");
    h.className = "hint";
    h.textContent = hint;
    crumbs.appendChild(h);

    var measured = document.getElementById("measured");
    if (measured) measured.textContent = gb(view.size);
    var scale = document.getElementById("scale");
    if (scale) scale.textContent = gb(Math.max(0.1, (576 * view.size) / (W * H)));
  }

  function open(node, el) {
    var p = plan.getBoundingClientRect(), r = el.getBoundingClientRect();
    view = node;
    draw({ l: r.left - p.left, t: r.top - p.top, r: p.right - r.right, b: p.bottom - r.bottom });
  }

  var timer;
  window.addEventListener("resize", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { draw(null); }, 80);
  });
  draw(null);
})();
