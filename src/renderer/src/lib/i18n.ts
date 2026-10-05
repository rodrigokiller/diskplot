export type Lang = "en" | "pt";

const en = {
  "menu.file": "File",
  "menu.view": "View",
  "menu.help": "Help",
  "menu.chooseFolder": "Scan a folder...",
  "menu.rescan": "Scan again",
  "menu.start": "Back to drives",
  "tool.drives": "Drives",
  "menu.exit": "Exit",
  "menu.zoomOut": "Up one level",
  "menu.zoomRoot": "Whole scan",
  "menu.theme": "Theme",
  "menu.themeGrid": "Grid",
  "menu.themePaper": "Paper",
  "menu.mode": "Appearance",
  "menu.modeSystem": "Match Windows",
  "menu.modeLight": "Light",
  "menu.modeDark": "Dark",
  "menu.levels": "Folder levels on the plan",
  "menu.levelsAll": "All levels",
  "menu.back": "Back",
  "menu.forward": "Forward",
  "menu.language": "Language",
  "menu.fullscreen": "Full screen",
  "menu.website": "Website",
  "menu.source": "Source code on GitHub",
  "menu.update": "Check for updates",
  "menu.about": "About Diskplot",

  "start.title": "What should be measured?",
  "start.lead": "Pick a drive, or scan one folder. Nothing is changed on disk until you say so.",
  "start.drive": "Drive",
  "start.used": "Used",
  "start.free": "Free",
  "start.capacity": "Capacity",
  "start.scan": "Scan",
  "start.folder": "Scan a folder...",
  "start.drop": "You can also drop a folder anywhere on this window.",
  "start.noDrives": "No drives were found. Scan a folder instead.",
  "start.last": "Last scanned {when}",

  "scan.title": "Scanning {root}",
  "scan.cancel": "Stop",
  "scan.running": "running",
  "scan.files": "Files",
  "scan.folders": "Folders",
  "scan.bytes": "Measured",
  "scan.elapsed": "Elapsed",
  "scan.rate": "Files per second",
  "scan.sofar": "Largest so far",
  "scan.failed": "The scan could not finish",
  "scan.missing": "That folder no longer exists.",
  "scan.back": "Back to drives",

  "tab.tree": "Tree",
  "tab.largest": "Largest",
  "tab.types": "Types",
  "tab.clutter": "Clutter",
  "tab.dupes": "Duplicates",
  "tab.changes": "Changes",
  "tab.found": "Found",

  "col.name": "Name",
  "col.size": "Size",
  "col.share": "Of parent",
  "col.ofTotal": "Of total",
  "col.files": "Files",
  "col.modified": "Modified",
  "col.type": "Type",
  "col.change": "Change",
  "col.where": "Folder",

  "act.open": "Open",
  "act.reveal": "Show in Explorer",
  "act.copyPath": "Copy path",
  "act.zoom": "Open in plan",
  "act.trash": "Send to Recycle Bin",
  "act.cancel": "Cancel",
  "act.select": "Select",

  "search.placeholder": "Find by name",
  "filter.size": "Larger than",
  "filter.age": "Untouched for",
  "filter.any": "Any",
  "filter.clear": "Clear filters",
  "filter.days30": "30 days",
  "filter.days180": "6 months",
  "filter.days365": "1 year",
  "filter.days730": "2 years",
  "found.summary": "{count} matches, {bytes}",
  "found.capped": "Showing the largest {shown}.",
  "found.none": "Nothing matches. Loosen a filter or check the spelling.",
  "found.type": "Type .{ext}",

  "types.none": "no extension",
  "largest.note": "The {count} largest files in this scan.",

  "clutter.lead": "Folders that tools recreate on their own. Removing them is usually safe, but check before you do.",
  "clutter.total": "{bytes} could be reclaimed",
  "clutter.none": "No known clutter above 1 MB. This disk is tidier than most.",
  "clutter.deps": "Installed dependencies",
  "clutter.deps.hint": "Reinstall to restore",
  "clutter.build": "Build output",
  "clutter.build.hint": "Rebuilt on the next build",
  "clutter.cache": "Tool caches",
  "clutter.cache.hint": "Rebuilt when the tool runs",
  "clutter.pkgcache": "Package manager caches",
  "clutter.pkgcache.hint": "Downloaded again when needed",
  "clutter.temp": "Temporary files",
  "clutter.temp.hint": "Files in use will refuse to go",
  "clutter.browser": "Browser caches",
  "clutter.browser.hint": "Close the browser first",
  "clutter.system": "Windows leftovers",
  "clutter.system.hint": "Better removed with Disk Cleanup",
  "clutter.recycle": "Recycle Bin",
  "clutter.recycle.hint": "Empty it from the desktop",

  "dupes.lead": "Files with identical content. Diskplot compares sizes first, then reads the files, so this takes a while on large disks.",
  "dupes.min": "Smallest file to consider",
  "dupes.start": "Look for duplicates",
  "dupes.stop": "Stop",
  "dupes.reading": "Comparing {done} of {total} files",
  "dupes.hashing": "Reading {bytes} of {total}",
  "dupes.none": "No duplicates at this size. Try a smaller minimum.",
  "dupes.summary": "{groups} sets, {bytes} wasted",
  "dupes.copies": "{count} copies",
  "dupes.again": "Search again",

  "changes.lead": "Compared with the scan from {when}.",
  "changes.none": "Nothing moved by more than 4 MB since {when}.",
  "changes.first": "This is the first scan of this location. Scan it again later and this tab will show what grew.",
  "changes.total": "Total change",
  "changes.new": "new",
  "changes.removed": "Gone since then",
  "changes.against": "Compare with",

  "block.root": "Location",
  "block.total": "Measured",
  "block.files": "Files",
  "block.folders": "Folders",
  "block.scanned": "Scanned",
  "block.issues": "Unreadable",
  "block.scale": "Scale",
  "block.selected": "Selected",
  "block.in": "in {time}",

  "issues.title": "{count} items could not be read",
  "issues.lead": "Usually system folders that need administrator rights. Their size is missing from the totals.",
  "issues.more": "and {count} more",
  "issues.close": "Close",

  "trash.title": "Send to the Recycle Bin?",
  "trash.one": "{name}",
  "trash.many": "{count} items",
  "trash.size": "{bytes} will leave this location. You can restore it from the Recycle Bin.",
  "trash.confirm": "Send to Recycle Bin",
  "trash.failed": "{count} could not be removed. They may be in use or protected.",

  "tip.files": "{count} files",
  "tip.ofView": "{pct} of this view",
  "tip.rest": "Smaller items in {name}, too small to draw",
  "tip.link": "Link, not followed",
  "tip.error": "Could not be read",

  "upd.available": "Version {version} is available.",
  "upd.download": "Download",
  "upd.downloading": "Downloading the update, {pct}",
  "upd.ready": "Version {version} is ready.",
  "upd.install": "Restart and install",
  "upd.none": "You have the latest version.",
  "upd.dev": "Updates are checked in installed builds only.",
  "upd.error": "The update check failed. Try again later.",

  "about.line": "Version {version}. Free and open source under the MIT license.",
  "about.by": "Made by Rodrigo Sanguanini,",
  "copied": "Path copied",
  "now": "just now",
};

type Key = keyof typeof en;

const pt: Record<Key, string> = {
  "menu.file": "Arquivo",
  "menu.view": "Exibir",
  "menu.help": "Ajuda",
  "menu.chooseFolder": "Escanear uma pasta...",
  "menu.rescan": "Escanear de novo",
  "menu.start": "Voltar para as unidades",
  "tool.drives": "Unidades",
  "menu.exit": "Sair",
  "menu.zoomOut": "Subir um nível",
  "menu.zoomRoot": "Scan inteiro",
  "menu.theme": "Tema",
  "menu.themeGrid": "Grade",
  "menu.themePaper": "Papel",
  "menu.mode": "Aparência",
  "menu.modeSystem": "Igual ao Windows",
  "menu.modeLight": "Claro",
  "menu.modeDark": "Escuro",
  "menu.levels": "Níveis de pasta na planta",
  "menu.levelsAll": "Todos os níveis",
  "menu.back": "Voltar",
  "menu.forward": "Avançar",
  "menu.language": "Idioma",
  "menu.fullscreen": "Tela cheia",
  "menu.website": "Site do Diskplot",
  "menu.source": "Código fonte no GitHub",
  "menu.update": "Procurar atualizações",
  "menu.about": "Sobre o Diskplot",

  "start.title": "O que vamos medir?",
  "start.lead": "Escolha uma unidade ou escaneie uma pasta. Nada muda no disco até você mandar.",
  "start.drive": "Unidade",
  "start.used": "Usado",
  "start.free": "Livre",
  "start.capacity": "Capacidade",
  "start.scan": "Escanear",
  "start.folder": "Escanear uma pasta...",
  "start.drop": "Também dá para soltar uma pasta em qualquer lugar desta janela.",
  "start.noDrives": "Nenhuma unidade encontrada. Escaneie uma pasta.",
  "start.last": "Último scan {when}",

  "scan.title": "Escaneando {root}",
  "scan.cancel": "Parar",
  "scan.running": "em andamento",
  "scan.files": "Arquivos",
  "scan.folders": "Pastas",
  "scan.bytes": "Medido",
  "scan.elapsed": "Tempo",
  "scan.rate": "Arquivos por segundo",
  "scan.sofar": "Maiores até agora",
  "scan.failed": "O scan não conseguiu terminar",
  "scan.missing": "Essa pasta não existe mais.",
  "scan.back": "Voltar para as unidades",

  "tab.tree": "Árvore",
  "tab.largest": "Maiores",
  "tab.types": "Tipos",
  "tab.clutter": "Tralha",
  "tab.dupes": "Duplicados",
  "tab.changes": "Mudanças",
  "tab.found": "Busca",

  "col.name": "Nome",
  "col.size": "Tamanho",
  "col.share": "Da pasta",
  "col.ofTotal": "Do total",
  "col.files": "Arquivos",
  "col.modified": "Modificado",
  "col.type": "Tipo",
  "col.change": "Mudança",
  "col.where": "Pasta",

  "act.open": "Abrir",
  "act.reveal": "Mostrar no Explorer",
  "act.copyPath": "Copiar caminho",
  "act.zoom": "Abrir na planta",
  "act.trash": "Enviar para a Lixeira",
  "act.cancel": "Cancelar",
  "act.select": "Selecionar",

  "search.placeholder": "Buscar por nome",
  "filter.size": "Maior que",
  "filter.age": "Sem mexer há",
  "filter.any": "Qualquer",
  "filter.clear": "Limpar filtros",
  "filter.days30": "30 dias",
  "filter.days180": "6 meses",
  "filter.days365": "1 ano",
  "filter.days730": "2 anos",
  "found.summary": "{count} resultados, {bytes}",
  "found.capped": "Mostrando os {shown} maiores.",
  "found.none": "Nada encontrado. Afrouxe um filtro ou confira a grafia.",
  "found.type": "Tipo .{ext}",

  "types.none": "sem extensão",
  "largest.note": "Os {count} maiores arquivos deste scan.",

  "clutter.lead": "Pastas que as ferramentas recriam sozinhas. Remover costuma ser seguro, mas confira antes.",
  "clutter.total": "{bytes} podem ser liberados",
  "clutter.none": "Nenhuma tralha conhecida acima de 1 MB. Este disco está mais arrumado que a média.",
  "clutter.deps": "Dependências instaladas",
  "clutter.deps.hint": "Reinstale para recuperar",
  "clutter.build": "Saída de build",
  "clutter.build.hint": "Recriada no próximo build",
  "clutter.cache": "Caches de ferramentas",
  "clutter.cache.hint": "Refeitos quando a ferramenta rodar",
  "clutter.pkgcache": "Caches de gerenciadores de pacotes",
  "clutter.pkgcache.hint": "Baixados de novo quando preciso",
  "clutter.temp": "Arquivos temporários",
  "clutter.temp.hint": "Arquivos em uso vão se recusar a sair",
  "clutter.browser": "Caches de navegador",
  "clutter.browser.hint": "Feche o navegador antes",
  "clutter.system": "Sobras do Windows",
  "clutter.system.hint": "Melhor remover pela Limpeza de Disco",
  "clutter.recycle": "Lixeira",
  "clutter.recycle.hint": "Esvazie pela área de trabalho",

  "dupes.lead": "Arquivos com conteúdo idêntico. O Diskplot compara os tamanhos primeiro e depois lê os arquivos, então demora em discos grandes.",
  "dupes.min": "Menor arquivo a considerar",
  "dupes.start": "Procurar duplicados",
  "dupes.stop": "Parar",
  "dupes.reading": "Comparando {done} de {total} arquivos",
  "dupes.hashing": "Lendo {bytes} de {total}",
  "dupes.none": "Nenhum duplicado neste tamanho. Tente um mínimo menor.",
  "dupes.summary": "{groups} conjuntos, {bytes} desperdiçados",
  "dupes.copies": "{count} cópias",
  "dupes.again": "Procurar de novo",

  "changes.lead": "Comparado com o scan de {when}.",
  "changes.none": "Nada mudou mais que 4 MB desde {when}.",
  "changes.first": "Este é o primeiro scan deste local. Escaneie de novo mais tarde e esta aba mostra o que cresceu.",
  "changes.total": "Mudança total",
  "changes.new": "novo",
  "changes.removed": "Sumiu desde então",
  "changes.against": "Comparar com",

  "block.root": "Local",
  "block.total": "Medido",
  "block.files": "Arquivos",
  "block.folders": "Pastas",
  "block.scanned": "Scan",
  "block.issues": "Ilegíveis",
  "block.scale": "Escala",
  "block.selected": "Selecionado",
  "block.in": "em {time}",

  "issues.title": "{count} itens não puderam ser lidos",
  "issues.lead": "Em geral são pastas do sistema que pedem permissão de administrador. O tamanho delas fica fora dos totais.",
  "issues.more": "e mais {count}",
  "issues.close": "Fechar",

  "trash.title": "Enviar para a Lixeira?",
  "trash.one": "{name}",
  "trash.many": "{count} itens",
  "trash.size": "{bytes} vão sair deste local. Dá para restaurar pela Lixeira.",
  "trash.confirm": "Enviar para a Lixeira",
  "trash.failed": "{count} não puderam ser removidos. Podem estar em uso ou protegidos.",

  "tip.files": "{count} arquivos",
  "tip.ofView": "{pct} desta vista",
  "tip.rest": "Itens menores em {name}, pequenos demais para desenhar",
  "tip.link": "Link, não seguido",
  "tip.error": "Não pode ser lido",

  "upd.available": "A versão {version} está disponível.",
  "upd.download": "Baixar",
  "upd.downloading": "Baixando a atualização, {pct}",
  "upd.ready": "A versão {version} está pronta.",
  "upd.install": "Reiniciar e instalar",
  "upd.none": "Você já tem a versão mais recente.",
  "upd.dev": "Atualizações só são verificadas na versão instalada.",
  "upd.error": "Não deu para verificar atualizações. Tente mais tarde.",

  "about.line": "Versão {version}. Grátis e de código aberto, licença MIT.",
  "about.by": "Feito por Rodrigo Sanguanini,",
  "copied": "Caminho copiado",
  "now": "agora mesmo",
};

const tables: Record<Lang, Record<Key, string>> = { en, pt };

export type T = (key: Key, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): T {
  const table = tables[lang];
  return (key, vars) => {
    let s = table[key] ?? en[key] ?? key;
    if (vars) for (const k in vars) s = s.replace("{" + k + "}", String(vars[k]));
    return s;
  };
}

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "pt") return saved;
  } catch {
    // Storage can be unavailable; fall through to the system language.
  }
  return navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
}

// Formatting ---------------------------------------------------------------

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export interface Fmt {
  bytes(n: number): string;
  signedBytes(n: number): string;
  count(n: number): string;
  pct(fraction: number): string;
  date(seconds: number): string;
  when(ms: number): string;
  duration(ms: number): string;
}

export function makeFmt(lang: Lang, t: T): Fmt {
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const one = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const zero = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const day = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
  const full = new Intl.DateTimeFormat(locale, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const bytes = (n: number): string => {
    let v = Math.abs(n);
    let u = 0;
    while (v >= 1024 && u < UNITS.length - 1) {
      v /= 1024;
      u++;
    }
    return (u === 0 || v >= 100 ? zero.format(v) : one.format(v)) + " " + UNITS[u];
  };
  return {
    bytes,
    signedBytes: (n) => (n < 0 ? "-" : "+") + bytes(n),
    count: (n) => zero.format(n),
    pct: (f) => (f > 0 && f < 0.001 ? "<0" + one.format(0.1).slice(1) : one.format(f * 100)) + "%",
    date: (s) => (s > 0 ? day.format(s * 1000) : ""),
    when: (ms) => (Date.now() - ms < 60_000 ? t("now") : full.format(ms)),
    duration: (ms) => (ms < 10_000 ? one.format(ms / 1000) + " s" : ms < 60_000 ? zero.format(ms / 1000) + " s" : Math.floor(ms / 60_000) + " min " + zero.format((ms % 60_000) / 1000) + " s"),
  };
}
