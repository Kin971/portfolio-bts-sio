<?php
/**
 * viewer.php — Lecteur de fichiers locaux pour Portfolio BTS SIO
 * Lit n'importe quel fichier texte/code depuis le disque et retourne JSON
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$raw = isset($_GET['path']) ? $_GET['path'] : '';

if (!$raw) {
    echo json_encode(['error' => 'Aucun chemin fourni.']);
    exit;
}

// Normalise les séparateurs
$raw = str_replace('/', DIRECTORY_SEPARATOR, $raw);

// ── Résolution du chemin ──────────────────────────────────────
// Stratégie 1 : chemin absolu fourni directement (ex: C:\...\fichier)
$path = $raw;

// Stratégie 2 : chemin relatif → on cherche à côté de viewer.php
// (ex: "BTS SIO COURS\1ere Année\..." → C:\wamp64\www\portfolio\BTS SIO COURS\...)
if (!preg_match('/^[A-Za-z]:[\\\\\/]/', $raw)) {
    $fromHere = __DIR__ . DIRECTORY_SEPARATOR . ltrim($raw, '\\/');
    if (file_exists($fromHere)) $path = $fromHere;
}

// Stratégie 3 : essaie realpath() pour résoudre les symlinks/jonctions
$resolved = realpath($path);
if ($resolved) $path = $resolved;

if (!file_exists($path)) {
    echo json_encode([
        'error'    => 'Fichier introuvable : ' . basename($raw),
        'fullPath' => $path,
        'tip'      => 'Copiez vos dossiers projets (BTS SIO COURS, CYBER) dans C:\\wamp64\\www\\portfolio\\ — viewer.php les trouvera automatiquement.',
    ]);
    exit;
}

$ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$name = basename($path);

/**
 * Extrait le texte brut d'un fichier .docx (Office Open XML).
 */
function docx_plain_text(string $path): ?string {
    if (!class_exists('ZipArchive')) {
        return null;
    }
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        return null;
    }
    $xml = $zip->getFromName('word/document.xml');
    $zip->close();
    if ($xml === false || $xml === '') {
        return null;
    }
    libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    if (!$dom->loadXML($xml)) {
        return null;
    }
    $xpath = new DOMXPath($dom);
    $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
    $paragraphs = $xpath->query('//w:p');
    if ($paragraphs === false || $paragraphs->length === 0) {
        return null;
    }
    $lines = [];
    foreach ($paragraphs as $p) {
        $texts = $xpath->query('.//w:t', $p);
        $chunk = '';
        if ($texts !== false) {
            foreach ($texts as $t) {
                $chunk .= $t->nodeValue;
            }
        }
        $lines[] = $chunk;
    }
    $out = implode("\n", $lines);
    $out = preg_replace("/[ \t]+\n/", "\n", $out);
    return $out === '' ? null : $out;
}

/* ── Répertoire ── */
if (is_dir($path)) {
    $entries = @scandir($path);
    if ($entries === false) {
        echo json_encode(['error' => 'Impossible de lire le dossier.']);
        exit;
    }
    $items = [];
    foreach ($entries as $e) {
        if ($e === '.' || $e === '..') continue;
        $fp = $path . DIRECTORY_SEPARATOR . $e;
        $items[] = [
            'name'  => $e,
            'path'  => $fp,
            'isDir' => is_dir($fp),
            'ext'   => is_dir($fp) ? '' : strtolower(pathinfo($fp, PATHINFO_EXTENSION)),
            'size'  => is_file($fp) ? filesize($fp) : null,
        ];
    }
    // Dossiers d'abord, puis tri alphabétique insensible à la casse
    usort($items, function($a, $b) {
        if ($a['isDir'] !== $b['isDir']) return (int)$b['isDir'] - (int)$a['isDir'];
        return strcasecmp($a['name'], $b['name']);
    });
    echo json_encode([
        'type'  => 'dir',
        'name'  => $name,
        'path'  => $path,
        'items' => $items
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ── Image ── */
$imgExts = ['jpg','jpeg','png','gif','webp','svg','bmp','ico'];
if (in_array($ext, $imgExts)) {
    $raw = @file_get_contents($path);
    if ($raw === false) { echo json_encode(['error' => "Impossible de lire l'image."]); exit; }
    $mime = match($ext) {
        'svg'         => 'image/svg+xml',
        'gif'         => 'image/gif',
        'png'         => 'image/png',
        'webp'        => 'image/webp',
        'bmp'         => 'image/bmp',
        'ico'         => 'image/x-icon',
        default       => 'image/jpeg',
    };
    echo json_encode([
        'type' => 'image',
        'name' => $name,
        'path' => $path,
        'ext'  => $ext,
        'data' => 'data:' . $mime . ';base64,' . base64_encode($raw),
    ]);
    exit;
}

/* ── Word .docx → texte (affichage dans le viewer) ── */
if ($ext === 'docx') {
    $plain = docx_plain_text($path);
    if ($plain !== null) {
        $enc = mb_detect_encoding($plain, ['UTF-8', 'ISO-8859-1', 'Windows-1252', 'ASCII'], true);
        if ($enc && $enc !== 'UTF-8') {
            $plain = mb_convert_encoding($plain, 'UTF-8', $enc);
        }
        $plain = str_replace("\0", '', $plain);
        echo json_encode([
            'type'    => 'text',
            'name'    => $name,
            'path'    => $path,
            'ext'     => 'txt',
            'content' => $plain,
            'lines'   => substr_count($plain, "\n") + 1,
            'size'    => strlen($plain),
            'note'    => 'Contenu extrait du fichier Word (.docx)',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode([
        'type' => 'binary',
        'name' => $name,
        'path' => $path,
        'ext'  => $ext,
        'size' => filesize($path),
        'tip'  => 'Impossible d’extraire le texte de ce .docx (fichier corrompu ou format inhabituel).',
    ]);
    exit;
}

/* ── Fichier binaire (non affichable) ── */
$binExts = ['pdf','doc','odt','xlsx','xls','pptx','ppt','zip','rar','7z','exe','class','jar','pyc'];
if (in_array($ext, $binExts)) {
    echo json_encode([
        'type' => 'binary',
        'name' => $name,
        'path' => $path,
        'ext'  => $ext,
        'size' => filesize($path),
    ]);
    exit;
}

/* ── Fichier texte / code ── */
$raw = @file_get_contents($path);
if ($raw === false) {
    echo json_encode(['error' => 'Impossible de lire le fichier.']);
    exit;
}

// Détection et conversion vers UTF-8
$enc = mb_detect_encoding($raw, ['UTF-8', 'ISO-8859-1', 'Windows-1252', 'ASCII'], true);
if ($enc && $enc !== 'UTF-8') {
    $raw = mb_convert_encoding($raw, 'UTF-8', $enc);
}
// Supprime les caractères nuls éventuels
$raw = str_replace("\0", '', $raw);

echo json_encode([
    'type'    => 'text',
    'name'    => $name,
    'path'    => $path,
    'ext'     => $ext,
    'content' => $raw,
    'lines'   => substr_count($raw, "\n") + 1,
    'size'    => strlen($raw),
], JSON_UNESCAPED_UNICODE);
