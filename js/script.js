/* =====================================================
   PORTFOLIO BTS SIO SLAM — Raphael TILACDHARY JEAN
   script.js — Interactions et animations
   ===================================================== */

/* ─── Racine de l'appli, calculée depuis l'URL de ce script lui-même ───
   Ce fichier est partagé par plusieurs pages à des profondeurs différentes
   (racine, /slam/, …) qui le chargent chacune via un chemin relatif adapté
   à leur propre profondeur. Mais lui doit ensuite appeler /viewer.php, qui
   n'existe qu'à un seul endroit sur le serveur (la racine de l'appli) —
   donc pas question d'écrire un chemin en dur : on retrouve l'URL réelle
   par laquelle CE script a été chargé (toujours ".../js/script.js") et on
   lui retire "js/script.js" pour obtenir la racine, quelle que soit la
   profondeur de la page qui l'a inclus. */
const APP_ROOT = (() => {
  const src = document.currentScript && document.currentScript.src;
  return src ? src.replace(/js\/script\.js(?:\?.*)?$/, '') : './';
})();

/* ─── Chemins des fichiers de cours ───
   Tous les chemins (data-path, config.json) sont relatifs au dossier
   cours/ du serveur : server.py les résout depuis VIEWER_ROOT et refuse
   tout ce qui en sort. L'ancien réglage « ⚙️ Chemin » (racine Windows
   stockée en localStorage) datait de l'usage local sur le PC ; il ne
   pouvait plus rien faire derrière le bac à sable et a été retiré. */

/* ─── Mapping extension → langue / icône / id Highlight.js ─── */
const LANG_INFO = {
  py:   { name: 'Python',     icon: '🐍', hl: 'python'      },
  java: { name: 'Java',       icon: '☕', hl: 'java'        },
  sql:  { name: 'SQL',        icon: '🗄️', hl: 'sql'         },
  html: { name: 'HTML',       icon: '🌐', hl: 'html'        },
  css:  { name: 'CSS',        icon: '🎨', hl: 'css'         },
  js:   { name: 'JavaScript', icon: '⚡', hl: 'javascript'   },
  php:  { name: 'PHP',        icon: '🐘', hl: 'php'         },
  md:   { name: 'Markdown',   icon: '📝', hl: 'markdown'    },
  txt:  { name: 'Texte',      icon: '📄', hl: 'plaintext'   },
  json: { name: 'JSON',       icon: '📋', hl: 'json'        },
  xml:  { name: 'XML',        icon: '📋', hl: 'xml'         },
  sh:   { name: 'Shell',      icon: '💻', hl: 'bash'        },
  bat:  { name: 'Batch',      icon: '💻', hl: 'dos'         },
  ts:   { name: 'TypeScript', icon: '⚡', hl: 'typescript'  },
  c:    { name: 'C',          icon: '⚙️', hl: 'c'           },
  cpp:  { name: 'C++',        icon: '⚙️', hl: 'cpp'         },
  cs:   { name: 'C#',         icon: '⚙️', hl: 'csharp'      },
  rb:   { name: 'Ruby',       icon: '💎', hl: 'ruby'        },
  go:   { name: 'Go',         icon: '🔵', hl: 'go'          },
  rs:   { name: 'Rust',       icon: '🦀', hl: 'rust'        },
  '':   { name: 'Texte',      icon: '📄', hl: 'plaintext'   },
};
function getLang(ext) {
  return LANG_INFO[ext] || { name: ext.toUpperCase(), icon: '📄', hl: 'plaintext' };
}

/* ─── Formate une taille en octets ─── */
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return b + ' o';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' Ko';
  return (b / 1048576).toFixed(1) + ' Mo';
}

/* ─── Échappe une chaîne pour l'insérer dans du HTML (texte OU attribut) ───
   Tout ce qui vient de config.json ou du disque (titres, noms de fichiers)
   passe par ici avant un innerHTML : un « < » ou un guillemet dans un
   titre de projet ne doit pas pouvoir casser la page ni injecter de code. */
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ─── URL de téléchargement direct d'un fichier de cours/ ─── */
function coursUrl(rel) {
  return APP_ROOT + 'cours/' + rel.split('/').map(encodeURIComponent).join('/');
}

/* ─── Filtre projets : jetons entiers (évite « java » dans « javascript », fiabilise data-cat) ─── */
function projectCardMatchesFilter(cardEl, filter) {
  if (filter === 'all') return true;
  const raw = (cardEl.getAttribute('data-cat') || '').trim();
  if (!raw) return false;
  return raw.split(/\s+/).filter(Boolean).includes(filter);
}

/* ─── Phrases typewriter (définies ici pour pouvoir être surchargées par config) ─── */
var phrases = [
  'Développeur Python / Flask',
  'Passionné de Java et POO',
  'Explorateur de Cybersécurité',
  'Étudiant BTS SIO SLAM',
  'Créateur du jeu ZARMY ⚔️',
];

/* =====================================================
   FONCTIONS DE RENDU DEPUIS CONFIG
   ===================================================== */

function applyThemeFromConfig(theme) {
  if (!theme) return;
  // Valeurs du preset « GitHub Dark » de l'ANCIEN design, restées dans
  // config.json après la refonte « terminal » : appliquées telles quelles,
  // elles donnaient aux seules pages SLAM un fond gris-bleu et des survols
  // bleus, différents du reste du site. Ignorées ; un thème choisi
  // explicitement dans l'admin s'applique normalement.
  if (theme.primary === '#388bfd' && theme.bg === '#0d1117') return;
  const r = document.documentElement;
  if (theme.primary)   r.style.setProperty('--primary', theme.primary);
  if (theme.primaryH)  r.style.setProperty('--primary-h', theme.primaryH);
  if (theme.accent)    r.style.setProperty('--accent', theme.accent);
  if (theme.bg)        r.style.setProperty('--bg', theme.bg);
  if (theme.surface)   r.style.setProperty('--surface', theme.surface);
  if (theme.gradientStart || theme.gradientEnd) {
    const gs = theme.gradientStart || '#39ff6a';
    const ge = theme.gradientEnd   || '#34e5ff';
    r.style.setProperty('--gradient', `linear-gradient(135deg, ${gs} 0%, ${ge} 100%)`);
  }
}

function applyConfigToDOM(cfg) {
  const a = cfg.about || {};
  const h = cfg.hero  || {};

  const setText = (id, val) => {
    if (!val) return;
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  const setLink = (id, href, label) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (href) { el.href = href; if (label) el.textContent = label; }
    else if (label) el.textContent = label;
  };

  /* ── Héro ── */
  setText('heroBadge', h.badge);
  setText('heroName',  h.name);
  // Par id, et pas « le premier .hero-desc de la page » : les sous-pages
  // (Projets…) chargent aussi config.js, et leur propre sous-titre était
  // remplacé par la description de l'accueil SLAM.
  setText('heroDesc', h.description);
  if (h.stats) {
    const nums = document.querySelectorAll('.stat-num');
    const lbls = document.querySelectorAll('.stat-lbl');
    h.stats.forEach((s, i) => {
      if (nums[i]) nums[i].dataset.target = s.value;
      if (lbls[i]) lbls[i].textContent = s.label;
    });
  }

  /* ── À propos ── */
  setText('profileLocation',  a.location);
  setText('profileSchool',    a.school);
  setText('profileFormation', a.formation);
  setText('profileYear',      a.year);
  setText('profileSearch',    a.search);
  // L'adresse d'exemple de config.example.json (votre@email.tld) ne doit
  // jamais remplacer la vraie adresse écrite dans le HTML.
  const email = a.email && !/\.tld$/i.test(a.email) ? a.email : '';
  if (email) {
    const el = document.getElementById('profileEmail');
    if (el) { el.textContent = email; el.href = 'mailto:' + email; }
  }

  /* ── Contact ── */
  if (email) {
    setLink('contactEmail',    'mailto:' + email, email);
    setLink('contactEmailBtn', 'mailto:' + email + '?subject=Contact Portfolio BTS SIO', null);
  }
  setText('contactLocation', a.location);
  if (a.linkedin) setLink('contactLinkedin', a.linkedin, a.linkedin);
  else setText('contactLinkedin', 'À ajouter');
  if (a.github)   setLink('contactGithub',   a.github,   a.github);
  else setText('contactGithub', 'À ajouter');
}

function renderProjectsFromConfig(projects) {
  const grid = document.getElementById('projectsGrid');
  if (!grid || !projects) return;
  const visible = projects.filter(p => p.visible !== false);
  grid.innerHTML = visible.map(p => {
    const isFeatured = p.featured;
    const catArr = [...(p.categories || [])];
    const isGrand =
      p.grandProject === true ||
      (Array.isArray(p.categories) && p.categories.includes('grand')) ||
      (typeof p.featuredLabel === 'string' && /grand\s*projet/i.test(p.featuredLabel.trim()));
    if (isGrand && !catArr.includes('grand')) catArr.push('grand');
    const cats = catArr.join(' ');
    const techs = (p.techs || []).map(t => `<span>${escHtml(t)}</span>`).join('');
    const kpis = (p.kpis || []).map(k => `<span><b>${escHtml(k.value)}</b> ${escHtml(k.label)}</span>`).join('');
    const comps = (p.competences || []).map(c => `<span>${escHtml(c)}</span>`).join('');
    const links = (p.links || []).map(l =>
      `<button type="button" class="plink plink-${l.style === 'sec' ? 'sec' : 'main'}" data-path="${escHtml(l.path)}">${escHtml(l.label)}</button>`
    ).join('');
    return `<article class="project-card${isFeatured?' card-featured':''}" data-cat="${escHtml(cats)}" data-animate>
      <div class="project-top">
        ${isFeatured ? `<span class="project-star">⭐ ${escHtml(p.featuredLabel || 'Projet phare')}</span>` : '<span></span>'}
        <div class="project-techs">${techs}</div>
      </div>
      <div class="project-icon" aria-hidden="true">${escHtml(p.icon || '📁')}</div>
      <h3>${escHtml(p.title)}</h3>
      <p>${escHtml(p.description)}</p>
      ${kpis ? `<div class="project-kpis">${kpis}</div>` : ''}
      ${comps ? `<div class="project-comps">${comps}</div>` : ''}
      <div class="project-links">${links}</div>
    </article>`;
  }).join('');

  // Re-attach filter logic after dynamic render
  const filterBtns = document.querySelectorAll('.filter');
  const projectCards = document.querySelectorAll('.project-card');
  hideEmptyFilters(filterBtns, projectCards);
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      projectCards.forEach(card => {
        if (projectCardMatchesFilter(card, filter)) {
          card.classList.remove('hidden');
          card.classList.remove('visible');
          setTimeout(() => card.classList.add('visible'), 50);
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });
}

/* Masque les boutons de filtre qui ne correspondraient à aucune carte :
   un filtre « Cybersécurité » qui affiche une grille vide donne
   l'impression d'un site cassé. Ils réapparaissent d'eux-mêmes dès
   qu'un projet de la catégorie est ajouté depuis l'admin. */
function hideEmptyFilters(filterBtns, projectCards) {
  filterBtns.forEach(btn => {
    const f = btn.dataset.filter;
    if (f === 'all') return;
    btn.hidden = ![...projectCards].some(card => projectCardMatchesFilter(card, f));
  });
}

/* Carte « rapport de stage » (page SISR) — alimentée par la section
   rapport de config.json, que l'onglet « Rapport de stage » de l'admin
   met à jour. Sans fichier déposé, le bouton est simplement masqué. */
function renderRapportFromConfig(r) {
  const card = document.getElementById('rapportCard');
  if (!card || !r) return;
  const set = (sel, val) => { const el = card.querySelector(sel); if (el && val) el.textContent = val; };
  set('[data-rapport="title"]', r.title);
  set('[data-rapport="description"]', r.description);
  const btn = card.querySelector('[data-rapport="download"]');
  const meta = card.querySelector('[data-rapport="meta"]');
  if (btn && r.url) {
    // L'URL est enregistrée depuis la racine (« /files/… ») : on la
    // rattache à APP_ROOT pour rester valable derrière un préfixe d'URL.
    btn.href = APP_ROOT + r.url.replace(/^\/+/, '');
    btn.hidden = false;
    if (meta) {
      const ext = (r.filename || '').split('.').pop().toUpperCase();
      meta.textContent = [ext, fmtSize(r.size)].filter(Boolean).join(' · ');
    }
  }
}

/* =====================================================
   CODE VIEWER — fonctions principales
   ===================================================== */

let _modalOpener = null;

/* Ouvre le modal depuis un élément portant data-path (bouton de projet,
   preuve du référentiel, entrée de dossier dans l'explorateur…). */
function openFile(el) {
  // config.json stocke des chemins avec séparateurs Windows ('\') — server.py
  // (Linux) attend des '/'.
  const rel = el.dataset.path.replace(/\\/g, '/');
  if (!el.closest('#codeModal')) _modalOpener = el;
  _openPath(rel, rel.split('/').filter(Boolean).pop() || rel);
}

async function _openPath(rel, displayName) {
  const modal = document.getElementById('codeModal');
  const body  = document.getElementById('cmBody');
  modal.classList.add('active');
  document.getElementById('cmFilename').textContent = displayName;
  document.getElementById('cmIcon').textContent     = '📄';
  document.getElementById('cmLang').textContent     = '';
  document.getElementById('cmMeta').textContent     = '';
  body.innerHTML    = `<div class="cm-loading">⏳ Chargement de <strong>${escHtml(displayName)}</strong>…</div>`;
  body.dataset.code = '';
  _setCopyAction('hidden');
  modal.querySelector('.cm-close-btn')?.focus();

  if (window.location.protocol === 'file:') {
    body.innerHTML = `<div class="cm-error">
      ⚠️ Le portfolio est ouvert en fichier local : le lecteur a besoin du serveur.<br><br>
      <strong>Solution :</strong> lancer <code>python3 server.py</code>
      puis ouvrir <a href="http://localhost:8080" target="_blank" rel="noopener">http://localhost:8080</a>
    </div>`;
    return;
  }

  try {
    const res  = await fetch(APP_ROOT + 'viewer.php?path=' + encodeURIComponent(rel));
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Réponse invalide du serveur (HTTP ${res.status}).`); }
    _renderModal(data);
  } catch (e) {
    body.innerHTML = `<div class="cm-error">❌ ${escHtml(e.message)}</div>`;
  }
}

/* Reconfigure le bouton d'action de l'en-tête du modal ("Copier le code"
   par défaut) selon ce qui est réellement utile pour le type de fichier
   affiché — le laisser sur "Copier le code" pour un PDF ou une image ne
   fait juste rien au clic, ce qui est le bug signalé. */
function _setCopyAction(mode, payload) {
  const btn = document.getElementById('cmCopyBtn');
  if (!btn) return;
  if (mode === 'hidden') {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  if (mode === 'code') {
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg> Copier le code`;
    btn.onclick = copyModalCode;
  } else if (mode === 'open') {
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
      </svg> Ouvrir dans un onglet`;
    btn.onclick = () => window.open(payload, '_blank');
  }
}

function _renderModal(data) {
  const body = document.getElementById('cmBody');

  if (data.error) {
    body.innerHTML = `<div class="cm-error">❌ ${escHtml(data.error)}</div>`;
    _setCopyAction('hidden');
    return;
  }

  /* ── Fichier texte / code ── */
  if (data.type === 'text') {
    const lang = getLang(data.ext);
    document.getElementById('cmIcon').textContent     = lang.icon;
    document.getElementById('cmFilename').textContent = data.name;
    document.getElementById('cmLang').textContent     = lang.name;
    document.getElementById('cmMeta').textContent     = `${data.lines} lignes` + (data.note ? ` · ${data.note}` : '');

    const hlLang = (typeof hljs !== 'undefined' && hljs.getLanguage(lang.hl)) ? lang.hl : 'plaintext';
    const highlighted = (typeof hljs !== 'undefined')
      ? hljs.highlight(data.content, { language: hlLang }).value
      : escHtml(data.content);

    // Numéros de lignes — split sur le HTML mis en évidence
    const lines = highlighted.split('\n');
    const withNums = lines.map((line, i) =>
      `<div class="cm-line"><span class="cm-ln">${i + 1}</span><span class="cm-code">${line || ' '}</span></div>`
    ).join('');

    body.innerHTML    = `<pre class="cm-pre hljs"><code>${withNums}</code></pre>`;
    body.dataset.code = data.content;
    _setCopyAction('code');
  }

  /* ── Dossier ── */
  else if (data.type === 'dir') {
    document.getElementById('cmIcon').textContent     = '📁';
    document.getElementById('cmFilename').textContent = data.name;
    document.getElementById('cmLang').textContent     = 'Dossier';
    document.getElementById('cmMeta').textContent     = `${data.items.length} élément(s)`;

    // Boutons (et non des <div> cliquables) : atteignables au clavier. Le
    // clic est géré par le gestionnaire délégué sur [data-path].
    const rows = data.items.map(item => {
      const lg   = item.isDir ? { icon: '📁' } : getLang(item.ext);
      const size = fmtSize(item.size);
      return `<button type="button" class="cm-dir-item" data-path="${escHtml(item.path)}">
        <span class="cm-dir-icon" aria-hidden="true">${lg.icon}</span>
        <span class="cm-dir-name">${escHtml(item.name)}</span>
        <span class="cm-dir-size">${size}</span>
      </button>`;
    }).join('');

    body.innerHTML    = `<div class="cm-dir-list">${rows}</div>`;
    body.dataset.code = '';
    _setCopyAction('hidden');
  }

  /* ── Image ── */
  else if (data.type === 'image') {
    document.getElementById('cmIcon').textContent     = '🖼️';
    document.getElementById('cmFilename').textContent = data.name;
    document.getElementById('cmLang').textContent     = data.ext.toUpperCase();
    document.getElementById('cmMeta').textContent     = '';
    body.innerHTML    = `<div class="cm-img-wrap"><img src="${data.data}" alt="${escHtml(data.name)}"></div>`;
    body.dataset.code = '';
    _setCopyAction('open', data.data);
  }

  /* ── PDF : affiché directement, comme une image ──
     <iframe> plutôt que <embed> : un plugin injecté via innerHTML ne se
     déclenche pas de façon fiable selon les navigateurs (c'est pourquoi
     "ça n'affichait pas") — un iframe pointant vers le data: URI, si. */
  else if (data.type === 'pdf') {
    document.getElementById('cmIcon').textContent     = '📄';
    document.getElementById('cmFilename').textContent = data.name;
    document.getElementById('cmLang').textContent     = 'PDF';
    document.getElementById('cmMeta').textContent     = fmtSize(data.size);
    body.innerHTML = `<div class="cm-pdf-wrap">
      <iframe src="${data.data}" class="cm-pdf-embed" title="${escHtml(data.name)}"></iframe>
    </div>`;
    body.dataset.code = '';
    _setCopyAction('open', data.data);
  }

  /* ── Binaire (docx non extractible, xlsx, zip…) ── */
  else if (data.type === 'binary') {
    const icons = { pdf:'📄',docx:'📝',doc:'📝',odt:'📝',xlsx:'📊',xls:'📊',pptx:'📊',zip:'🗜️',rar:'🗜️' };
    const icon  = icons[data.ext] || '📦';
    document.getElementById('cmIcon').textContent     = icon;
    document.getElementById('cmFilename').textContent = data.name;
    document.getElementById('cmLang').textContent     = data.ext.toUpperCase();
    document.getElementById('cmMeta').textContent     = fmtSize(data.size);
    // Pas d'aperçu possible : on propose le téléchargement direct (le
    // dossier cours/ est servi statiquement). L'ancien bouton « Copier le
    // chemin Windows » renvoyait un chemin du serveur, inutile au visiteur.
    body.innerHTML = `
      <div class="cm-binary">
        <div class="cm-binary-icon" aria-hidden="true">${icon}</div>
        <p class="cm-binary-name">${escHtml(data.name)}</p>
        <p class="cm-binary-size">${fmtSize(data.size)}</p>
        <p class="cm-binary-note">Ce type de fichier (.${escHtml(data.ext)}) ne peut pas être affiché directement dans le navigateur.${data.tip ? `<br><small>${escHtml(data.tip)}</small>` : ''}</p>
        <a class="btn btn-primary" href="${escHtml(coursUrl(data.path))}" download>⬇️ Télécharger le fichier</a>
      </div>`;
    body.dataset.code = '';
    _setCopyAction('hidden');
  }
}

/* Ferme le modal code et rend le focus à l'élément qui l'avait ouvert */
function closeModal() {
  // Optionnel : la page SISR et la page contact n'ont pas ce modal.
  const modal = document.getElementById('codeModal');
  if (!modal || !modal.classList.contains('active')) return;
  modal.classList.remove('active');
  _modalOpener?.focus();
  _modalOpener = null;
}

/* Copie le code affiché */
function copyModalCode() {
  const code = document.getElementById('cmBody').dataset.code;
  if (code) copyClip(code, '📋 Code copié dans le presse-papier !');
}

/* Copie n'importe quel texte */
function copyClip(text, msg) {
  const m = msg || '📋 Copié dans le presse-papier !';
  navigator.clipboard.writeText(text).then(() => showToast(m)).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast(m);
  });
}

/* ─── Toast ─── */
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 2800);
}

document.addEventListener('DOMContentLoaded', () => {

  /* ─── Appliquer la config dynamique si disponible ─── */
  if (window.PORTFOLIO_CONFIG) {
    const cfg = window.PORTFOLIO_CONFIG;
    applyThemeFromConfig(cfg.theme);
    applyConfigToDOM(cfg);
    if (cfg.projects) renderProjectsFromConfig(cfg.projects);
    if (cfg.hero && cfg.hero.phrases && cfg.hero.phrases.length > 0) {
      phrases.length = 0;
      cfg.hero.phrases.forEach(p => phrases.push(p));
    }
  }

  if (window.PORTFOLIO_CONFIG) renderRapportFromConfig(window.PORTFOLIO_CONFIG.rapport);

  /* ─── Lecteur de fichiers : tout élément [data-path] l'ouvre ───
     Délégation sur le document : couvre les boutons écrits dans le HTML,
     ceux générés depuis config.json et les entrées de dossier du modal. */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-path]');
    if (!el || !document.getElementById('codeModal')) return;
    e.preventDefault();
    e.stopPropagation();
    openFile(el);
  });

  /* ─── Clavier : Échap ferme le modal (ou le menu mobile) ; Tab reste
     piégé dans le modal ouvert au lieu de repartir dans la page derrière. */
  document.addEventListener('keydown', e => {
    const modal = document.getElementById('codeModal');
    const modalOpen = modal?.classList.contains('active');
    if (e.key === 'Escape') {
      if (modalOpen) closeModal();
      else if (navLinksEl.classList.contains('open')) { setMenu(false); navToggle.focus(); }
      return;
    }
    if (e.key === 'Tab' && modalOpen) {
      const items = [...modal.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')]
        .filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });

  /* ─── Barre de progression de lecture ─── */
  const progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    window.addEventListener('scroll', () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = (total > 0 ? window.scrollY / total * 100 : 0) + '%';
    }, { passive: true });
  }

  /* ─── Navbar : fond au scroll + lien actif ─── */
  const navbar    = document.getElementById('navbar');
  // Seuls les liens d'ancre (#section) suivent le défilement. Les liens vers
  // une autre page gardent la classe « active » posée dans le HTML — avant,
  // elle disparaissait au premier défilement sur toutes les sous-pages.
  const navLinks  = document.querySelectorAll('.nav-link[href^="#"]');
  const sections  = document.querySelectorAll('section[id]');
  const toTop     = document.getElementById('toTop');

  window.addEventListener('scroll', () => {
    // Fond navbar
    navbar.classList.toggle('scrolled', window.scrollY > 60);

    // Bouton retour en haut
    toTop?.classList.toggle('visible', window.scrollY > 400);

    if (!sections.length) return;

    // Lien actif selon section visible
    let current = '';
    sections.forEach(section => {
      if (window.scrollY >= section.offsetTop - 120) {
        current = section.id;
      }
    });
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
      }
    });
  });

  /* ─── Menu hamburger mobile ─── */
  const navToggle  = document.getElementById('navToggle');
  const navLinksEl = document.getElementById('navLinks');

  navToggle.setAttribute('aria-controls', 'navLinks');
  navToggle.setAttribute('aria-expanded', 'false');
  const setMenu = open => {
    navToggle.classList.toggle('open', open);
    navLinksEl.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  };
  navToggle.addEventListener('click', () => setMenu(!navLinksEl.classList.contains('open')));
  // Fermer le menu en cliquant sur un lien, ou n'importe où en dehors
  navLinksEl.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setMenu(false));
  });
  document.addEventListener('click', e => {
    if (navLinksEl.classList.contains('open') && !navbar.contains(e.target)) setMenu(false);
  });

  /* ─── Retour en haut ─── */
  toTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ─── Accordéon du référentiel ───
     Les lignes sont des <button> (focus + Entrée/Espace natifs) ;
     aria-expanded annonce l'état aux lecteurs d'écran. */
  document.querySelectorAll('.ref-row').forEach(row => {
    row.setAttribute('aria-expanded', 'false');
    row.addEventListener('click', () => {
      const open = row.parentElement.classList.toggle('open');
      row.setAttribute('aria-expanded', String(open));
    });
  });

  /* ─── Typewriter effect (Hero) ─── */
  // Page sans bloc hero animé (ex: la page SISR, encore minimale) : pas de
  // #typewriter dans le DOM. Sans ce garde, l'appel plus bas plantait et
  // coupait tout le reste de ce bloc DOMContentLoaded (observers, filtres...).
  const typeEl = document.getElementById('typewriter');
  if (typeEl) {
    let phraseIdx = 0, charIdx = 0, deleting = false;

    function type() {
      const current = phrases[phraseIdx];
      if (deleting) {
        typeEl.textContent = current.slice(0, charIdx--);
      } else {
        typeEl.textContent = current.slice(0, charIdx++);
      }

      let delay = deleting ? 40 : 80;

      if (!deleting && charIdx > current.length) {
        delay = 1800;
        deleting = true;
      } else if (deleting && charIdx < 0) {
        deleting = false;
        phraseIdx = (phraseIdx + 1) % phrases.length;
        charIdx = 0;
        delay = 300;
      }
      setTimeout(type, delay);
    }
    type();
  }

  /* ─── Animations au scroll (Intersection Observer) ─── */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // Animer les barres de progression quand elles deviennent visibles
        entry.target.querySelectorAll('.bar-fill').forEach(bar => {
          bar.style.width = bar.dataset.w + '%';
        });
        // Animer les compteurs
        entry.target.querySelectorAll('.stat-num').forEach(counter => {
          animateCounter(counter);
        });
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));

  /* ─── Filet de sécurité pour les révélations au scroll ───
     [data-animate] démarre à opacity:0 et n'est révélé que par
     l'IntersectionObserver. Si celui-ci ne se déclenche pas au bon moment
     — arrivée directe sur une ancre (/sisr/#cv), onglet ouvert en
     arrière-plan, restauration de position de scroll — la section reste
     invisible et l'écran paraît vide. On révèle donc manuellement, peu
     après le chargement, tout ce qui est déjà dans le viewport.
     Les éléments hors écran gardent leur animation d'apparition. */
  function revealWhatIsOnScreen() {
    document.querySelectorAll('[data-animate]:not(.visible)').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        el.classList.add('visible');
        el.querySelectorAll('.bar-fill').forEach(bar => {
          bar.style.width = bar.dataset.w + '%';
        });
        el.querySelectorAll('.stat-num').forEach(animateCounter);
      }
    });
  }
  window.addEventListener('load', () => setTimeout(revealWhatIsOnScreen, 350));

  /* ─── Compteurs animés ─── */
  function animateCounter(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const target = parseInt(el.dataset.target);
    const duration = 1200;
    const step = target / (duration / 16);
    let current = 0;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = Math.floor(current);
      if (current >= target) clearInterval(timer);
    }, 16);
  }

  /* ─── Barres de progression (section compétences) ─── */
  // Déclenché aussi par l'observer ci-dessus via les .bar-fill
  const skillObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.bar-fill').forEach(bar => {
          bar.style.width = bar.dataset.w + '%';
        });
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.skill-block').forEach(el => skillObserver.observe(el));

  /* ─── Filtres projets (statiques — si config non chargée) ─── */
  const filterBtns = document.querySelectorAll('.filter');
  const projectCards = document.querySelectorAll('.project-card');

  if (!window.PORTFOLIO_CONFIG || !window.PORTFOLIO_CONFIG.projects) {
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.dataset.filter;

        projectCards.forEach(card => {
          if (projectCardMatchesFilter(card, filter)) {
            card.classList.remove('hidden');
            card.classList.remove('visible');
            setTimeout(() => card.classList.add('visible'), 50);
          } else {
            card.classList.add('hidden');
          }
        });
      });
    });
  }

  /* ─── Onglets référentiel BTS SIO ─── */
  const tabBtns   = document.querySelectorAll('.tab');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach((btn, i) => {
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', btn.dataset.tab);
    btn.setAttribute('aria-selected', String(btn.classList.contains('active')));
    // Flèches gauche/droite : passer d'un onglet à l'autre (motif ARIA « tabs »)
    btn.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = tabBtns[(i + (e.key === 'ArrowRight' ? 1 : tabBtns.length - 1)) % tabBtns.length];
      next.focus();
      next.click();
    });
    btn.addEventListener('click', () => {
      // Bouton actif
      tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // Panneau actif
      const target = btn.dataset.tab;
      tabPanels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === target) {
          panel.classList.add('active');
          // Ré-déclencher les animations dans ce panneau
          panel.querySelectorAll('[data-animate]').forEach(el => {
            el.classList.remove('visible');
            setTimeout(() => el.classList.add('visible'), 60);
          });
        }
      });
    });
  });

  /* ─── Smooth scroll pour tous les liens ancres ─── */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const id = link.getAttribute('href').slice(1);
      // getElementById plutôt que querySelector : « # » seul (ou un id
      // exotique) levait une SyntaxError au clic.
      const target = id && document.getElementById(id);
      if (target) {
        e.preventDefault();
        const navH = navbar.offsetHeight;
        const top  = target.getBoundingClientRect().top + window.scrollY - navH - 16;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* ─── Animation d'entrée initiale pour le Hero ─── */
  setTimeout(() => {
    document.querySelectorAll('.hero [data-animate]').forEach(el => {
      el.classList.add('visible');
    });
  }, 100);

});
