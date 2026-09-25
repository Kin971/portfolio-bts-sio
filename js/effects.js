/* =====================================================================
   PORTFOLIO BTS SIO — Raphael TILACDHARY JEAN
   effects.js — Effets visuels "terminal hacker"

   Volontairement séparé de script.js : ce fichier ne gère AUCUNE logique
   fonctionnelle (config, admin, viewer, filtres...) — uniquement du
   décor. S'il plante, le reste du site continue de fonctionner.

   Contenu :
   01. Détection prefers-reduced-motion
   02. Pluie Matrix (canvas)
   03. Séquence de boot
   04. Effet glitch sur le nom (data-text)
   ===================================================================== */

(() => {
  'use strict';

  /* ===================================================================
     01. REDUCED MOTION
     =================================================================== */
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Calculé une seule fois, avant tout : la séquence de boot (10.) et le
  // panneau de transition entre pages (11.) doivent se coordonner — sans
  // ça, le panneau de transition (opaque, au-dessus de tout) masquerait le
  // texte du boot pendant qu'il tape. Sur un tout premier chargement de
  // session, c'est le boot qui gère la révélation ; le panneau de
  // transition se contente alors de disparaître instantanément.
  const BOOT_WILL_PLAY = !REDUCED_MOTION && sessionStorage.getItem('raf_boot_seen') !== '1';

  /* ===================================================================
     02. PLUIE MATRIX
     Rendu sur un <canvas id="matrixCanvas"> placé en tout premier dans
     <body> (voir index.html / slam/index.html). Colonnes de caractères
     qui tombent, densité et vitesse volontairement faibles pour rester
     un fond discret et ne pas gêner la lecture — cf. --opacity en CSS.
     =================================================================== */
  function initMatrixRain() {
    const canvas = document.getElementById('matrixCanvas');
    if (!canvas || REDUCED_MOTION) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Jeu de caractères : katakana (esprit "Matrix" d'origine) + chiffres
    // + quelques symboles réseaux/hex, cohérent avec le thème SIO/SISR.
    const CHARS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789ABCDEF{}<>/\\#$%';

    let width, height, columns, drops, fontSize;
    let lastFrame = 0;
    const FRAME_INTERVAL = 55; // ms — throttle : pas besoin de 60fps pour cet effet

    function resize() {
      width  = canvas.width  = window.innerWidth;
      height = canvas.height = window.innerHeight;
      fontSize = width < 640 ? 13 : 15;
      columns = Math.floor(width / fontSize);
      drops = new Array(columns).fill(0).map(() => Math.floor(Math.random() * -40));
    }
    resize();
    window.addEventListener('resize', resize);

    function draw(now) {
      requestAnimationFrame(draw);
      if (document.hidden) return; // onglet en arrière-plan : on ne dessine pas (perf/batterie)
      if (now - lastFrame < FRAME_INTERVAL) return;
      lastFrame = now;

      // Traînée : on repeint un voile semi-transparent plutôt que de tout
      // effacer, ce qui donne l'effet de fondu classique des caractères.
      ctx.fillStyle = 'rgba(6, 8, 9, 0.18)';
      ctx.fillRect(0, 0, width, height);

      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < columns; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Tête de colonne plus lumineuse pour un effet de "chute" net.
        ctx.fillStyle = '#c8ffd8';
        ctx.fillText(char, x, y);
        ctx.fillStyle = 'rgba(57, 255, 106, 0.55)';
        ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], x, y - fontSize);

        if (y > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }
    requestAnimationFrame(draw);
  }

  /* ===================================================================
     03. SÉQUENCE DE BOOT
     Overlay plein écran affiché une seule fois par session (sessionStorage
     — pas à chaque navigation entre les pages SLAM/SISR, ce serait vite
     agaçant), avec des lignes tapées façon terminal avant de révéler le
     site. Skippable au clic ou avec n'importe quelle touche.
     =================================================================== */
  function initBootSequence() {
    const screen = document.getElementById('bootScreen');
    if (!screen) return;

    // Déjà vu cette session, ou reduced-motion : on saute direct.
    if (!BOOT_WILL_PLAY) {
      screen.remove();
      return;
    }

    const box = screen.querySelector('.boot-box');
    const skipBtn = screen.querySelector('.boot-skip');
    if (!box) { screen.remove(); return; }

    const host = location.hostname || 'localhost';
    const page = document.body.dataset.page || 'portfolio';
    const lines = [
      { text: `root@${host}:~$ ./init_portfolio.sh --profile=${page}`, cls: 'prompt' },
      { text: '[OK] Chargement du profil… ', okPrefix: true },
      { text: '[OK] Montage des projets… ', okPrefix: true },
      { text: '[OK] Vérification des accès… ', okPrefix: true },
      { text: 'Accès autorisé.', cls: 'ok' },
    ];

    let i = 0;
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      sessionStorage.setItem('raf_boot_seen', '1');
      screen.classList.add('hidden');
      setTimeout(() => screen.remove(), 550);
      document.removeEventListener('keydown', onSkip);
    }

    function onSkip() { finish(); }
    skipBtn?.addEventListener('click', onSkip);
    document.addEventListener('keydown', onSkip);

    function typeNext() {
      if (i >= lines.length) {
        setTimeout(finish, 450);
        return;
      }
      const l = lines[i++];
      const div = document.createElement('div');
      div.className = 'boot-line' + (l.cls ? ' ' + l.cls : '');
      if (l.okPrefix) {
        div.innerHTML = `<span class="ok">[OK]</span> ${l.text.replace('[OK] ', '')}`;
      } else {
        div.textContent = l.text;
      }
      box.appendChild(div);
      setTimeout(typeNext, l.cls === 'prompt' ? 420 : 260);
    }

    // Petit délai initial pour éviter un flash si le chargement est très rapide.
    setTimeout(typeNext, 200);

    // Filet de sécurité : si quelque chose bloque, jamais plus de 6s d'attente.
    setTimeout(finish, 6000);
  }

  /* ===================================================================
     04. EFFET GLITCH SUR LE NOM
     Le pseudo-effet glitch (voir CSS .gradient-text.glitch) a besoin d'un
     attribut data-text identique au texte affiché. Comme ce texte peut
     être injecté dynamiquement par config.json (page SLAM), on copie le
     textContent APRÈS le chargement de script.js — ce fichier est inclus
     après lui dans le HTML, et les gestionnaires DOMContentLoaded
     s'exécutent dans leur ordre d'enregistrement, donc script.js a déjà
     appliqué la config quand ce code tourne.
     =================================================================== */
  function initGlitchName() {
    document.querySelectorAll('.hero .gradient-text').forEach(el => {
      el.setAttribute('data-text', el.textContent);
      if (!REDUCED_MOTION) el.classList.add('glitch');
    });
  }

  /* ===================================================================
     05. TRANSITION ENTRE PAGES (SISR ↔ SLAM)
     #pageTransition couvre l'écran par défaut (voir CSS) pour qu'aucune
     page ne s'affiche "brute" avant que le JS tourne. Au chargement, on
     le retire en glissant vers la droite. Au clic sur un lien interne
     (pas une ancre #, pas mailto/http externe, pas un download, pas un
     target=_blank comme /admin), on rejoue l'animation en sens inverse
     puis on navigue seulement une fois qu'elle est visuellement finie —
     donne l'impression d'une vraie transition entre les deux pages alors
     que ce sont deux chargements HTML complets et indépendants.
     =================================================================== */
  function initPageTransitions() {
    const overlay = document.getElementById('pageTransition');
    if (!overlay) return;

    if (REDUCED_MOTION) { overlay.classList.add('hidden'); return; }

    if (BOOT_WILL_PLAY) {
      // Le boot va s'afficher et gère lui-même sa propre révélation —
      // ce panneau doit juste s'effacer sans jouer son animation, sous
      // peine de masquer le texte qui tape en dessous.
      overlay.classList.add('hidden');
    } else {
      // Arrivée normale (navigation entre pages) : on révèle en glissant.
      requestAnimationFrame(() => overlay.classList.add('leaving'));
      setTimeout(() => overlay.classList.add('hidden'), 650);
    }

    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;
      if (
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        /^https?:\/\//i.test(href) ||
        link.hasAttribute('download') ||
        link.target === '_blank'
      ) return;

      link.addEventListener('click', e => {
        // Un modificateur (ouvrir dans un nouvel onglet, etc.) doit garder
        // son comportement natif — pas de transition dans ce cas.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        overlay.classList.remove('hidden', 'leaving');
        setTimeout(() => { window.location.href = href; }, 480);
      });
    });
  }

  /* ===================================================================
     06. CURSEUR LUMINEUX
     Un halo doux qui suit le curseur — desktop uniquement (voir la media
     query "pointer: coarse" en CSS, qui le masque sur tactile). Purement
     décoratif, ne capte aucun événement (pointer-events: none).
     =================================================================== */
  function initCursorGlow() {
    if (REDUCED_MOTION || window.matchMedia('(pointer: coarse)').matches) return;

    const glow = document.createElement('div');
    glow.id = 'cursorGlow';
    document.body.appendChild(glow);

    let pendingX = 0, pendingY = 0, raf = null;
    window.addEventListener('mousemove', e => {
      pendingX = e.clientX;
      pendingY = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        glow.style.transform = `translate(${pendingX}px, ${pendingY}px)`;
        raf = null;
      });
    }, { passive: true });
  }

  /* ===================================================================
     07. INCLINAISON DES CARTES AU SURVOL
     Léger effet "tilt" 3D qui suit la position du curseur sur les cartes
     projets / cybersécurité / référentiel — desktop uniquement. La classe
     CSS ne fait que déclarer la transition ; la rotation elle-même est
     posée en inline-style ici car elle dépend de la position exacte du
     curseur, pas d'un état on/off.
     =================================================================== */
  function initCardTilt() {
    if (REDUCED_MOTION || window.matchMedia('(pointer: coarse)').matches) return;

    const selector = '.project-card, .cyber-card, .ref-card';
    // Délégation sur le document : ces cartes peuvent être (re)générées
    // dynamiquement (projets rendus depuis config.json) après ce point.
    document.addEventListener('mousemove', e => {
      const card = e.target.closest?.(selector);
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width  - 0.5;
      const py = (e.clientY - r.top)  / r.height - 0.5;
      card.style.transform =
        `perspective(700px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateY(-3px)`;
    }, { passive: true });

    document.addEventListener('mouseout', e => {
      const card = e.target.closest?.(selector);
      if (!card) return;
      // Ne réinitialise que si on quitte vraiment la carte (pas un enfant).
      if (card.contains(e.relatedTarget)) return;
      card.style.transform = '';
    }, { passive: true });
  }

  /* ===================================================================
     08. RECHARGEMENT AUTOMATIQUE
     Interroge /api/site-version (voir server.py — calcule la date de
     modification la plus récente parmi les fichiers du site, donc rien à
     incrémenter à la main à chaque déploiement).
     - En local (localhost) : sondage toutes les 4 s et rechargement
       automatique — pratique pendant qu'on édite le site.
     - En ligne : sondage espacé (60 s) et bannière avec un bouton
       « Recharger » : on ne recharge JAMAIS de force la page d'un
       visiteur en pleine lecture (un jury, un recruteur…).
     Coupé si l'onglet est en arrière-plan (pas de sondage inutile) et
     repris à son retour au premier plan.
     =================================================================== */
  function initLiveReload() {
    const IS_LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
    const POLL_MS = IS_LOCAL ? 4000 : 60000;
    let knownVersion = null;
    let timer = null;

    function onNewVersion() {
      const banner = document.getElementById('updateBanner');
      if (!banner) { if (IS_LOCAL) location.reload(); return; }
      if (IS_LOCAL) {
        banner.classList.add('show');
        setTimeout(() => location.reload(), 1100);
        return;
      }
      banner.innerHTML = '<span>Une nouvelle version du portfolio est en ligne.</span>' +
        '<button type="button" class="update-reload">Recharger</button>';
      banner.querySelector('button').addEventListener('click', () => location.reload());
      banner.classList.add('show');
    }

    async function check() {
      try {
        const res = await fetch(APP_ROOT + 'api/site-version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (knownVersion === null) {
          knownVersion = data.v;
          return;
        }
        if (data.v !== knownVersion) {
          clearInterval(timer);
          onNewVersion();
        }
      } catch {
        // Silencieux : une requête ratée (réseau, redémarrage du serveur
        // en cours) ne doit pas spammer la console, juste réessayer plus
        // tard au prochain intervalle.
      }
    }

    check();
    timer = setInterval(() => { if (!document.hidden) check(); }, POLL_MS);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && knownVersion !== null) check();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initMatrixRain();
    initBootSequence();
    initGlitchName();
    initPageTransitions();
    initCursorGlow();
    initCardTilt();
    initLiveReload();
  });
})();
