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

/* ─── Chemin racine — modifiable via le panneau de config du portfolio ───
   Vide sur le serveur : server.py résout tout chemin relatif depuis son
   propre dossier "cours/" (VIEWER_ROOT), pas depuis un disque local. La
   valeur Windows (G:\...) n'a de sens que pour un lancement en local sur
   le PC — le panneau ⚙️ Configuration permet toujours de la redéfinir. */
const DEFAULT_ROOT = '';
function getRafRoot() {
  const r = (localStorage.getItem('raf_root') || DEFAULT_ROOT).replace(/\\/g, '/');
  if (!r) return '';
  return r.replace(/\/+$/, '') + '/';
}

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

/* ─── Échappe une chaîne pour utilisation dans un attribut onclick JS ─── */
function escQ(s) { return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

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
  const r = document.documentElement;
  if (theme.primary)   r.style.setProperty('--primary', theme.primary);
  if (theme.primaryH)  r.style.setProperty('--primary-h', theme.primaryH);
  if (theme.accent)    r.style.setProperty('--accent', theme.accent);
  if (theme.bg)        r.style.setProperty('--bg', theme.bg);
  if (theme.surface)   r.style.setProperty('--surface', theme.surface);
  if (theme.gradientStart || theme.gradientEnd) {
    const gs = theme.gradientStart || '#388bfd';
    const ge = theme.gradientEnd   || '#7c3aed';
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
  if (h.description) {
    const d = document.querySelector('.hero-desc');
    if (d) d.textContent = h.description;
  }
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
  if (a.email) {
    const el = document.getElementById('profileEmail');
    if (el) { el.textContent = a.email; el.href = 'mailto:' + a.email; }
  }

  /* ── Contact ── */
  if (a.email) {
    setLink('contactEmail',    'mailto:' + a.email, a.email);
    setLink('contactEmailBtn', 'mailto:' + a.email + '?subject=Contact Portfolio BTS SIO', null);
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
    const techs = (p.techs || []).map(t => `<span>${t}</span>`).join('');
    const kpis = (p.kpis || []).map(k => `<span><b>${k.value}</b> ${k.label}</span>`).join('');
    const comps = (p.competences || []).map(c => `<span>${c}</span>`).join('');
    const links = (p.links || []).map(l =>
      `<button class="plink plink-${l.style||'main'}" onclick="openFile(this)" data-path="${escQ(l.path)}">${l.label}</button>`
    ).join('');
    return `<article class="project-card${isFeatured?' card-featured':''}" data-cat="${cats}" data-animate>
      <div class="project-top">
        ${isFeatured ? `<span class="project-star">⭐ ${p.featuredLabel || 'Projet phare'}</span>` : '<span></span>'}
        <div class="project-techs">${techs}</div>
      </div>
      <div class="project-icon">${p.icon||'📁'}</div>
      <h3>${p.title}</h3>
      <p>${p.description}</p>
      ${kpis ? `<div class="project-kpis">${kpis}</div>` : ''}
      ${comps ? `<div class="project-comps">${comps}</div>` : ''}
      <div class="project-links">${links}</div>
    </article>`;
  }).join('');

  // Re-attach filter logic after dynamic render
  const filterBtns = document.querySelectorAll('.filter');
  const projectCards = document.querySelectorAll('.project-card');
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

/* =====================================================
   CODE VIEWER — fonctions principales
   ===================================================== */

/* Ouvre le modal depuis un bouton avec data-path */
async function openFile(el) {
  const rel  = el.dataset.path;
  // config.json stocke des chemins avec séparateurs Windows ('\') — server.py
  // (Linux) attend des '/'.
  const full = (getRafRoot() + rel).replace(/\\/g, '/');
  _openPath(full, rel.split(/[\\/]/).pop());
}

/* Ouvre un chemin absolu (appelé depuis l'explorateur de dossier) */
async function openFilePath(full) {
  _openPath(full, full.split('\\').pop());
}

async function _openPath(full, displayName) {
  const modal = document.getElementById('codeModal');
  const body  = document.getElementById('cmBody');
  modal.classList.add('active');
  document.getElementById('cmFilename').textContent = displayName;
  document.getElementById('cmIcon').textContent     = '📄';
  document.getElementById('cmLang').textContent     = '';
  document.getElementById('cmMeta').textContent     = '';
  body.innerHTML    = `<div class="cm-loading">⏳ Chargement de <strong>${displayName}</strong>…</div>`;
  body.dataset.code = '';
  _setCopyAction('hidden');

  const isFileProto  = window.location.protocol === 'file:';
  const isLiveServer = window.location.port === '5500' || window.location.port === '5501';
  if (isFileProto || isLiveServer) {
    const reason = isLiveServer
      ? '⚠️ VS Code Live Server ne peut pas exécuter PHP — viewer.php est servi comme texte brut.'
      : '⚠️ Le portfolio est ouvert en fichier local.';
    body.innerHTML = `<div class="cm-error">
      ${reason}<br><br>
      <strong>Solution :</strong> double-clique sur <code>Lancer le portfolio.bat</code><br>
      puis accède à : <a href="http://localhost:8080" target="_blank" style="color:#7c83fd">http://localhost:8080</a>
    </div>`;
    return;
  }

  try {
    const res  = await fetch(APP_ROOT + 'viewer.php?path=' + encodeURIComponent(full));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('Réponse invalide du serveur (pas du JSON). Vérifiez que viewer.php est bien servi par Python/WAMP.'); }
    _renderModal(data);
  } catch (e) {
    body.innerHTML = `<div class="cm-error">❌ ${e.message}</div>`;
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
    body.innerHTML = `<div class="cm-error">❌ ${data.error}<br>
      <small>${data.fullPath || ''}</small></div>`;
    _setCopyAction('hidden');
    return;
  }

  /* ── Fichier texte / code ── */
  if (data.type === 'text') {
    const lang = getLang(data.ext);
    document.getElementById('cmIcon').textContent     = lang.icon;
    document.getElementById('cmFilename').textContent = data.name;
    document.getElementById('cmLang').textContent     = lang.name;
    document.getElementById('cmMeta').textContent     = `${data.lines} lignes`;

    const hlLang = (typeof hljs !== 'undefined' && hljs.getLanguage(lang.hl)) ? lang.hl : 'plaintext';
    const highlighted = (typeof hljs !== 'undefined')
      ? hljs.highlight(data.content, { language: hlLang }).value
      : _escapeHtml(data.content);

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

    const rows = data.items.map(item => {
      const lg   = item.isDir ? { icon: '📁' } : getLang(item.ext);
      const size = fmtSize(item.size);
      return `<div class="cm-dir-item" onclick="openFilePath('${escQ(item.path)}')">
        <span class="cm-dir-icon">${lg.icon}</span>
        <span class="cm-dir-name">${item.name}</span>
        <span class="cm-dir-size">${size}</span>
      </div>`;
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
    body.innerHTML    = `<div class="cm-img-wrap"><img src="${data.data}" alt="${data.name}"></div>`;
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
      <iframe src="${data.data}" class="cm-pdf-embed" title="${data.name}"></iframe>
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
    body.innerHTML = `
      <div class="cm-binary">
        <div class="cm-binary-icon">${icon}</div>
        <p class="cm-binary-name">${data.name}</p>
        <p class="cm-binary-size">${fmtSize(data.size)}</p>
        <p class="cm-binary-note">Ce type de fichier (.${data.ext}) ne peut pas être affiché directement dans le navigateur.${data.tip ? `<br><small>${_escapeHtml(data.tip)}</small>` : ''}</p>
        <button class="btn btn-primary" onclick="copyClip('${escQ(data.path)}')">📋 Copier le chemin Windows</button>
      </div>`;
    body.dataset.code = '';
    _setCopyAction('hidden');
  }
}

/* Ferme le modal code */
function closeModal() {
  // Optionnel : la page SISR (encore minimale) n'a pas ces modals.
  document.getElementById('codeModal')?.classList.remove('active');
}

/* =====================================================
   PANNEAU DE CONFIGURATION — chemin racine
   ===================================================== */
function openConfig() {
  const current = localStorage.getItem('raf_root') || DEFAULT_ROOT;
  document.getElementById('cfgInput').value = current;
  document.getElementById('cfgModal').classList.add('active');
}
function closeConfig() {
  document.getElementById('cfgModal')?.classList.remove('active');
}
function saveConfig() {
  const val = document.getElementById('cfgInput').value.trim();
  if (!val) return;
  localStorage.setItem('raf_root', val);
  closeConfig();
  showToast('✅ Chemin racine sauvegardé ! Rechargement…');
  setTimeout(() => location.reload(), 1200);
}
function resetConfig() {
  localStorage.removeItem('raf_root');
  document.getElementById('cfgInput').value = DEFAULT_ROOT;
  showToast('↩️ Chemin réinitialisé');
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

function _escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ─── Toast ─── */
function showToast(msg) {
  const toast = document.getElementById('toast');
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

  /* ─── Fermer les modals avec Échap ─── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeConfig(); }
  });

  /* ─── Affiche le chemin racine actuel dans le footer ─── */
  const rootDisplay = document.getElementById('rootDisplay');
  if (rootDisplay) {
    const r = localStorage.getItem('raf_root') || DEFAULT_ROOT;
    rootDisplay.textContent = r;
  }

  /* ─── Barre de progression de lecture ─── */
  const progressBar = document.getElementById('progress-bar');
  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    const total    = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = (scrolled / total * 100) + '%';
  });

  /* ─── Navbar : fond au scroll + lien actif ─── */
  const navbar    = document.getElementById('navbar');
  const navLinks  = document.querySelectorAll('.nav-link');
  const sections  = document.querySelectorAll('section[id]');

  window.addEventListener('scroll', () => {
    // Fond navbar
    navbar.classList.toggle('scrolled', window.scrollY > 60);

    // Bouton retour en haut
    const toTop = document.getElementById('toTop');
    toTop.classList.toggle('visible', window.scrollY > 400);

    // Bouton admin (apparaît après 400px de scroll)
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.classList.toggle('visible', window.scrollY > 400);

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

  navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('open');
    navLinksEl.classList.toggle('open');
  });
  // Fermer le menu en cliquant sur un lien
  navLinksEl.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navToggle.classList.remove('open');
      navLinksEl.classList.remove('open');
    });
  });

  /* ─── Retour en haut ─── */
  document.getElementById('toTop').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Bouton actif
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

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
      const target = document.querySelector(link.getAttribute('href'));
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
