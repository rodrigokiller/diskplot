// Writes site/index.html and site/pt/index.html from one template, so the two
// languages cannot drift apart. Run with: npm run site:build
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://www.diskplot.com/";
const REPO = "https://github.com/rodrigokiller/diskplot";
const RELEASES = REPO + "/releases";

const en = {
  lang: "en",
  locale: "en_US",
  path: "",
  other: { href: "pt/", lang: "pt-BR", label: "Português" },
  dl: {
    title: "Download Diskplot for Windows",
    description: "Download the Diskplot installer or the portable build for Windows 10 and 11, with release notes for every version.",
    h: "Download",
    lead: "Free and open source. The installer updates itself; the portable build is a single executable that needs no installation.",
    back: "Back to the overview",
  },
  currency: "USD",
  title: "Diskplot: free disk space analyzer for Windows, with treemap and tree",
  description:
    "Diskplot scans a drive and shows what is using the space, as a treemap and a sortable tree in one window. Free and open source for Windows 10 and 11.",
  ogTitle: "Diskplot: disk space analyzer for Windows",
  ogDescription: "Treemap and tree in one window. Free and open source.",
  appDescription: "Disk space analyzer for Windows that shows a treemap and a sortable tree side by side.",
  nav: ["Views", "Features", "Speed", "Compared", "Questions"],
  download: "Download",
  downloadFull: "Download for Windows",
  source: "Source on GitHub",
  h1: "Disk space analyzer for Windows.",
  lead: "Diskplot scans a drive or a folder and shows what is using the space, as a treemap and a sortable tree in one window.",
  fine: "Free and open source, MIT license. Windows 10 and 11. No account, no telemetry.",
  demo: { path: "Path in the sample", plan: "Interactive sample of the treemap", loc: "Location", sample: "Sample disk", measured: "Measured", note: "Note", noteText: "Sample data. Click a folder to open it.", scale: "Scale" },
  views: {
    h: "Treemap and tree in one window.",
    p: "The treemap shows proportions at a glance. The tree gives exact sizes, file counts and dates, sortable by any column. Selection is shared: pick an item in one view and it is highlighted in the other.",
    alt: "Diskplot with a treemap of a drive on the left and a tree of folders with sizes on the right",
    cap: "A scan of a project folder. The shade of a block follows its share of the current view.",
  },
  features: {
    h: "Features",
    rows: [
      ["Live view", "The treemap and the tree fill in while the scan runs. There is no waiting for a progress bar to finish."],
      ["Scan comparison", "Each scan saves a small snapshot. The next scan of the same location lists what grew, what is new and what is gone."],
      ["Clutter detection", "Recognises node_modules, build output, package manager caches, virtual environments, temp folders and browser caches, and totals them."],
      ["Search and filters", "Search by name across the whole scan as you type. Filter by minimum size, by age or by file type."],
      ["Duplicate files", "Files of equal length are compared by content. Runs on request, not during the scan."],
      ["Size on disk", "Sizes are the space actually allocated, so compressed, sparse and online-only cloud files are counted for what they occupy."],
      ["Folder levels", "The treemap opens four levels of folders by default and draws deeper ones as a single block. The limit is adjustable."],
      ["Themes", "Two themes, each in light and dark. English and Brazilian Portuguese."],
    ],
  },
  safe: {
    h: "Nothing is deleted without confirmation.",
    p: "Removed items go to the Recycle Bin. There is no automatic cleanup and no one-click fix.",
    alt: "The Clutter tab listing node_modules and build folders with their sizes",
    cap: "The Clutter tab.",
  },
  speed: {
    h: "Scan speed",
    p: "Folders are listed in bulk through the Windows directory API, in parallel on all cores. Administrator rights are not required.",
    cols: ["Scanned", "Files", "Folders", "Time"],
    rows: [
      ["A folder of source code projects", "634,060", "67,152", "1.9 s"],
      ["A user profile", "2,148,709", "574,860", "10.0 s"],
      ["A full system drive", "3,156,306", "861,554", "30 s"],
    ],
    note: "Measured on the author's Windows 11 desktop with a warm file cache. A first scan after boot takes longer.",
  },
  compare: {
    h: "Compared with other tools",
    items: [
      ["WizTree", "Reads the NTFS file table directly, which is faster than walking folders, Diskplot included. Requires administrator rights. Closed source, with a paid licence for commercial use."],
      ["SpaceSniffer", "A treemap with live updates. Freeware, closed source. No tree view."],
      ["WinDirStat", "Open source, with a tree and a treemap coloured by file type. Diskplot adds scan comparison and clutter totals."],
    ],
  },
  faq: {
    h: "Questions",
    items: [
      ["Is it free?", "Yes. Diskplot is released under the MIT license and can be used at home and at work at no cost."],
      ["Does it need administrator rights?", "No. It scans everything the current account can read. Folders it cannot open are counted and listed. Run it as administrator to include them."],
      ["Why do sizes differ from File Explorer?", "Diskplot reports the space allocated on disk. Compressed files, sparse files and online-only OneDrive files occupy less than their length. A file with several hard links is counted once per name."],
      ["Does it send data anywhere?", "No. The only network request is to GitHub, to check for a newer version."],
      ["Is there a version for macOS or Linux?", "Not yet. Windows 10 and 11 are the supported systems."],
    ],
  },
  close: { h: "Download Diskplot", p: "Installer and portable build for Windows 10 and 11." },
  foot: ["Diskplot is free software under the MIT license.", "Report a problem", "Release notes", "Made by"],
};

const pt = {
  lang: "pt-BR",
  locale: "pt_BR",
  path: "pt/",
  other: { href: "../", lang: "en", label: "English" },
  dl: {
    title: "Baixar o Diskplot para Windows",
    description: "Baixe o instalador ou a versão portátil do Diskplot para Windows 10 e 11, com as notas de cada versão.",
    h: "Baixar",
    lead: "Grátis e de código aberto. O instalador se atualiza sozinho; a versão portátil é um único executável que não precisa de instalação.",
    back: "Voltar para a visão geral",
  },
  currency: "BRL",
  title: "Diskplot: analisador de espaço em disco grátis para Windows, com treemap e árvore",
  description:
    "O Diskplot escaneia uma unidade e mostra o que está ocupando o espaço, em um treemap e em uma árvore ordenável na mesma janela. Grátis e de código aberto para Windows 10 e 11.",
  ogTitle: "Diskplot: analisador de espaço em disco para Windows",
  ogDescription: "Treemap e árvore na mesma janela. Grátis e de código aberto.",
  appDescription: "Analisador de espaço em disco para Windows que mostra um treemap e uma árvore ordenável lado a lado.",
  nav: ["Vistas", "Recursos", "Velocidade", "Comparado", "Perguntas"],
  download: "Baixar",
  downloadFull: "Baixar para Windows",
  source: "Código no GitHub",
  h1: "Analisador de espaço em disco para Windows.",
  lead: "O Diskplot escaneia uma unidade ou uma pasta e mostra o que está ocupando o espaço, em um treemap e em uma árvore ordenável na mesma janela.",
  fine: "Grátis e de código aberto, licença MIT. Windows 10 e 11. Sem conta, sem telemetria.",
  demo: { path: "Caminho no exemplo", plan: "Exemplo interativo do treemap", loc: "Local", sample: "Disco de exemplo", measured: "Medido", note: "Nota", noteText: "Dados de exemplo. Clique em uma pasta para abrir.", scale: "Escala" },
  views: {
    h: "Treemap e árvore na mesma janela.",
    p: "O treemap mostra as proporções de relance. A árvore dá tamanhos exatos, contagem de arquivos e datas, ordenável por qualquer coluna. A seleção é compartilhada: escolha um item em uma vista e ele é destacado na outra.",
    alt: "Diskplot com o treemap de uma unidade à esquerda e a árvore de pastas com tamanhos à direita",
    cap: "Scan de uma pasta de projeto (interface em inglês). O tom de cada bloco segue a fatia dele na vista atual.",
  },
  features: {
    h: "Recursos",
    rows: [
      ["Vista ao vivo", "O treemap e a árvore vão sendo preenchidos enquanto o scan roda. Não é preciso esperar uma barra de progresso terminar."],
      ["Comparação de scans", "Cada scan salva um pequeno retrato. O próximo scan do mesmo local lista o que cresceu, o que é novo e o que sumiu."],
      ["Detecção de tralha", "Reconhece node_modules, saída de build, caches de gerenciadores de pacotes, ambientes virtuais, pastas temporárias e caches de navegador, e soma tudo."],
      ["Busca e filtros", "Busca por nome no scan inteiro enquanto você digita. Filtros por tamanho mínimo, por idade e por tipo de arquivo."],
      ["Arquivos duplicados", "Arquivos do mesmo tamanho são comparados pelo conteúdo. Roda sob demanda, não durante o scan."],
      ["Tamanho em disco", "Os tamanhos são o espaço realmente alocado, então arquivos compactados, esparsos e de nuvem que estão só online contam pelo que ocupam."],
      ["Níveis de pasta", "O treemap abre quatro níveis de pastas por padrão e desenha os mais fundos como um bloco só. O limite é ajustável."],
      ["Temas", "Dois temas, cada um em claro e escuro. Inglês e português do Brasil."],
    ],
  },
  safe: {
    h: "Nada é apagado sem confirmação.",
    p: "O que é removido vai para a Lixeira. Não há limpeza automática nem botão de resolver tudo.",
    alt: "A aba de tralha listando pastas node_modules e de build com os tamanhos",
    cap: "A aba de tralha (interface em inglês).",
  },
  speed: {
    h: "Velocidade do scan",
    p: "As pastas são listadas em lote pela API de diretórios do Windows, em paralelo em todos os núcleos. Não precisa de permissão de administrador.",
    cols: ["Escaneado", "Arquivos", "Pastas", "Tempo"],
    rows: [
      ["Uma pasta de projetos de código", "634.060", "67.152", "1,9 s"],
      ["Um perfil de usuário", "2.148.709", "574.860", "10,0 s"],
      ["Uma unidade de sistema inteira", "3.156.306", "861.554", "30 s"],
    ],
    note: "Medido no desktop Windows 11 do autor, com o cache de arquivos quente. O primeiro scan depois de ligar o computador demora mais.",
  },
  compare: {
    h: "Comparado com outras ferramentas",
    items: [
      ["WizTree", "Lê a tabela de arquivos do NTFS direto, o que é mais rápido do que percorrer pastas, o Diskplot incluído. Exige permissão de administrador. Código fechado, com licença paga para uso comercial."],
      ["SpaceSniffer", "Um treemap com atualização ao vivo. Gratuito, de código fechado. Não tem vista em árvore."],
      ["WinDirStat", "Código aberto, com árvore e treemap colorido por tipo de arquivo. O Diskplot acrescenta a comparação de scans e a soma da tralha."],
    ],
  },
  faq: {
    h: "Perguntas",
    items: [
      ["É grátis?", "Sim. O Diskplot usa a licença MIT e pode ser usado em casa e no trabalho sem custo."],
      ["Precisa de permissão de administrador?", "Não. Ele escaneia tudo o que a conta atual consegue ler. As pastas que não consegue abrir são contadas e listadas. Execute como administrador para incluí-las."],
      ["Por que os tamanhos são diferentes dos do Explorador de Arquivos?", "O Diskplot mostra o espaço alocado no disco. Arquivos compactados, esparsos e arquivos do OneDrive que estão só online ocupam menos do que o tamanho indica. Um arquivo com vários hard links é contado uma vez por nome."],
      ["Ele envia dados para algum lugar?", "Não. O único acesso à rede é ao GitHub, para verificar se existe uma versão mais nova."],
      ["Tem versão para macOS ou Linux?", "Ainda não. Os sistemas suportados são Windows 10 e 11."],
    ],
  },
  close: { h: "Baixe o Diskplot", p: "Instalador e versão portátil para Windows 10 e 11." },
  foot: ["O Diskplot é software livre sob a licença MIT.", "Relatar um problema", "Notas de versão", "Feito por"],
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const MARK = `<svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M2 2h13v28H2z" fill="var(--t5)" />
            <path d="M17 2h13v13H17z" fill="var(--t4)" />
            <path d="M17 17h6v13h-6z" fill="var(--t3)" />
            <path d="M25 17h5v6h-5z" fill="var(--t2)" />
            <path d="M25 25h5v5h-5z" fill="var(--t2)" opacity="0.6" />
          </svg>`;

// Two square cells, the current language filled in. `sub` is the page's own
// folder inside the language root ("" or "download/").
function langSwitch(t, sub) {
  const toOther = (sub ? "../" : "") + t.other.href + sub;
  const cells = [
    { code: "EN", lang: "en", name: "English" },
    { code: "PT", lang: "pt-BR", name: "Português" },
  ];
  return `<div class="lang" role="group" aria-label="Language">${cells
    .map((c) =>
      c.lang === t.lang
        ? `<span aria-current="true" title="${c.name}">${c.code}</span>`
        : `<a href="${toOther}" lang="${c.lang}" hreflang="${c.lang}" title="${c.name}">${c.code}</a>`,
    )
    .join("")}</div>`;
}

function downloadPage(t) {
  const up = t.path ? "../../" : "../";
  const url = BASE + t.path + "download/";
  return `<!doctype html>
<html lang="${t.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(t.dl.title)}</title>
    <meta name="description" content="${esc(t.dl.description)}" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="en" href="${BASE}download/" />
    <link rel="alternate" hreflang="pt-BR" href="${BASE}pt/download/" />
    <link rel="icon" href="${up}favicon.ico" sizes="any" />
    <link rel="icon" href="${up}icon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#11121a" media="(prefers-color-scheme: dark)" />
    <meta property="og:title" content="${esc(t.dl.title)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${BASE}img/og.png" />
    <link rel="stylesheet" href="${up}style.css" />
    <script src="${up}theme.js"></script>
  </head>
  <body>
    <header class="top">
      <div class="wrap">
        <a class="brand" href="../" aria-label="Diskplot">
          ${MARK}
          Diskplot
        </a>
        <nav>
          <a href="../">${t.dl.back}</a>
        </nav>
        ${langSwitch(t, "download/")}
        ${themeToggle(t)}
        <a class="btn small line" href="${REPO}">GitHub</a>
      </div>
    </header>
    <main class="wrap downloads">
      <h1>${t.dl.h}</h1>
      <p class="lede">${t.dl.lead}</p>
      <div id="latest" class="latest" aria-live="polite"></div>
      <div id="versions"></div>
      <noscript><p class="lede"><a href="${RELEASES}">github.com/rodrigokiller/diskplot/releases</a></p></noscript>
    </main>
    <footer>
      <div class="wrap">
        <span>${t.foot[0]}</span>
        <a href="${RELEASES}">GitHub Releases</a>
        <span>${t.foot[3]} <a href="https://sanguanini.dev">Rodrigo Sanguanini</a></span>
      </div>
    </footer>
    <script src="${up}releases.js" defer></script>
  </body>
</html>
`;
}

function themeToggle(t) {
  const label = t.lang === "en" ? "Switch between light and dark" : "Alternar entre claro e escuro";
  return `<button class="theme-toggle" id="theme" type="button" aria-label="${label}" title="${label}">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.75 2.75h10.5v10.5H2.75z" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M2.75 2.75H8v10.5H2.75z" fill="currentColor" />
          </svg>
        </button>`;
}

function page(t) {
  const up = t.path ? "../" : "";
  const url = BASE + t.path;
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.faq.items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  const appLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Diskplot",
    description: t.appDescription,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Windows 10, Windows 11",
    url,
    downloadUrl: url + "download/",
    license: "https://opensource.org/license/mit",
    isAccessibleForFree: true,
    inLanguage: t.lang,
    author: { "@type": "Person", name: "Rodrigo Sanguanini", url: "https://sanguanini.dev" },
    offers: { "@type": "Offer", price: "0", priceCurrency: t.currency },
  };
  const ids = ["views", "features", "speed", "compare", "faq"];
  return `<!doctype html>
<html lang="${t.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(t.title)}</title>
    <meta name="description" content="${esc(t.description)}" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="en" href="${BASE}" />
    <link rel="alternate" hreflang="pt-BR" href="${BASE}pt/" />
    <link rel="alternate" hreflang="x-default" href="${BASE}" />
    <link rel="icon" href="${up}favicon.ico" sizes="any" />
    <link rel="icon" href="${up}icon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#11121a" media="(prefers-color-scheme: dark)" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${t.locale}" />
    <meta property="og:title" content="${esc(t.ogTitle)}" />
    <meta property="og:description" content="${esc(t.ogDescription)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${BASE}img/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preload" href="${up}fonts/barlow-semi-condensed-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="${up}style.css" />
    <script src="${up}theme.js"></script>
    <script type="application/ld+json">${JSON.stringify(appLd)}</script>
    <script type="application/ld+json">${JSON.stringify(faqLd)}</script>
  </head>
  <body>
    <header class="top">
      <div class="wrap">
        <a class="brand" href="./" aria-label="Diskplot">
          ${MARK}
          Diskplot
        </a>
        <nav>
          ${t.nav.map((label, i) => `<a href="#${ids[i]}">${label}</a>`).join("\n          ")}
        </nav>
        ${langSwitch(t, "")}
        ${themeToggle(t)}
        <a class="btn small" href="download/">${t.download}</a>
      </div>
    </header>

    <main>
      <div class="hero-band">
        <div class="hero wrap">
          <div class="hero-head">
            <h1>${t.h1}</h1>
            <div>
              <p>${t.lead}</p>
              <div class="cta">
                <a class="btn" href="download/">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">
                    <path d="M8 2v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11" />
                  </svg>
                  ${t.downloadFull}
                </a>
                <a class="btn line" href="${REPO}">${t.source}</a>
              </div>
              <p class="fine">${t.fine}</p>
            </div>
          </div>

          <div class="sheet">
            <div class="crumbs" id="crumbs" aria-label="${esc(t.demo.path)}"></div>
            <div class="plan" id="plan" role="group" aria-label="${esc(t.demo.plan)}"></div>
            <div class="titleblock">
              <div><span class="k">${t.demo.loc}</span><span class="v">${t.demo.sample}</span></div>
              <div><span class="k">${t.demo.measured}</span><span class="v" id="measured"></span></div>
              <div class="grow hide-s"><span class="k">${t.demo.note}</span><span class="v">${t.demo.noteText}</span></div>
              <div class="scale"><i></i><span><span class="k">${t.demo.scale}</span><span class="v" id="scale"></span></span></div>
            </div>
          </div>
        </div>
      </div>

      <section id="views" class="wrap">
        <h2>${t.views.h}</h2>
        <p class="lede">${t.views.p}</p>
        <figure class="shot">
          <picture>
            <source srcset="${up}img/plan-dark-crop.png" media="(max-width: 600px) and (prefers-color-scheme: dark)" width="880" height="600" />
            <source srcset="${up}img/plan-light-crop.png" media="(max-width: 600px)" width="880" height="600" />
            <source srcset="${up}img/plan-dark.png" media="(prefers-color-scheme: dark)" />
            <img src="${up}img/plan-light.png" width="1440" height="900" alt="${esc(t.views.alt)}" />
          </picture>
          <figcaption>${t.views.cap}</figcaption>
        </figure>
      </section>

      <section id="features" class="wrap">
        <h2>${t.features.h}</h2>
        <div class="schedule">
          ${t.features.rows.map(([h, p]) => `<div>\n            <h3>${h}</h3>\n            <p>${p}</p>\n          </div>`).join("\n          ")}
        </div>
      </section>

      <section class="wrap">
        <div class="split">
          <div>
            <h2>${t.safe.h}</h2>
            <p class="lede">${t.safe.p}</p>
          </div>
          <figure class="shot">
            <picture>
              <source srcset="${up}img/clutter-dark.png" media="(prefers-color-scheme: dark)" />
              <img src="${up}img/clutter-light.png" width="580" height="270" loading="lazy" alt="${esc(t.safe.alt)}" />
            </picture>
            <figcaption>${t.safe.cap}</figcaption>
          </figure>
        </div>
      </section>

      <section id="speed" class="wrap">
        <h2>${t.speed.h}</h2>
        <p class="lede">${t.speed.p}</p>
        <table>
          <thead>
            <tr>
              <th>${t.speed.cols[0]}</th>
              ${t.speed.cols.slice(1).map((c) => `<th class="num">${c}</th>`).join("\n              ")}
            </tr>
          </thead>
          <tbody>
            ${t.speed.rows.map((r) => `<tr>\n              <td>${r[0]}</td>\n              ${r.slice(1).map((c) => `<td class="num">${c}</td>`).join("\n              ")}\n            </tr>`).join("\n            ")}
          </tbody>
        </table>
        <p class="note">${t.speed.note}</p>
      </section>

      <section id="compare" class="wrap">
        <h2>${t.compare.h}</h2>
        <div class="compare">
          ${t.compare.items.map(([h, p]) => `<div>\n            <h3>${h}</h3>\n            <p>${p}</p>\n          </div>`).join("\n          ")}
        </div>
      </section>

      <section id="faq" class="wrap">
        <h2>${t.faq.h}</h2>
        <div class="faq">
          ${t.faq.items.map(([q, a]) => `<details>\n            <summary>${q}</summary>\n            <p>${a}</p>\n          </details>`).join("\n          ")}
        </div>
      </section>
    </main>

    <div class="close">
      <div class="wrap">
        <div>
          <h2>${t.close.h}</h2>
          <p>${t.close.p}</p>
        </div>
        <div class="cta">
          <a class="btn" href="download/">${t.downloadFull}</a>
          <a class="btn line" href="${REPO}">${t.source}</a>
        </div>
      </div>
    </div>

    <footer>
      <div class="wrap">
        <span>${t.foot[0]}</span>
        <a href="${REPO}/issues">${t.foot[1]}</a>
        <a href="${REPO}/releases">${t.foot[2]}</a>
        <span>${t.foot[3]} <a href="https://sanguanini.dev">Rodrigo Sanguanini</a></span>
      </div>
    </footer>

    <script src="${up}demo.js" defer></script>
  </body>
</html>
`;
}

writeFileSync("site/index.html", page(en));
writeFileSync("site/pt/index.html", page(pt));
mkdirSync("site/download", { recursive: true });
mkdirSync("site/pt/download", { recursive: true });
writeFileSync("site/download/index.html", downloadPage(en));
writeFileSync("site/pt/download/index.html", downloadPage(pt));
writeFileSync(
  "site/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${["", "pt/", "download/", "pt/download/"].map((p) => `  <url>\n    <loc>${BASE}${p}</loc>\n    <xhtml:link rel="alternate" hreflang="en" href="${BASE}" />\n    <xhtml:link rel="alternate" hreflang="pt-BR" href="${BASE}pt/" />\n  </url>`).join("\n")}
</urlset>
`,
);
writeFileSync("site/robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`);
console.log("site written");
