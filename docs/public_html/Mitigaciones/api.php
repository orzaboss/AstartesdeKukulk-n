<?php
// script.php (versión validada + clear-cache + diagnósticos)
// Guardar UTF-8 sin BOM. Reemplaza YOUR_NASA_API_KEY_HERE por tu clave.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('Access-Control-Allow-Origin: *');

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

$NASA_BASE = 'https://api.nasa.gov/neo/rest/v1';
$NASA_API_KEY = 'Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B';

$QUICK_MAP = [
    'bennu'      => '101955',
    'apophis'    => '99942',
    'eros'       => '433',
    'itokawa'    => '25143',
    'ryugu'      => '162173',
    'didymos'    => '65803',
    'dimorphos'  => '65803',
    'psyche'     => '16',
    'vesta'      => '4',
    'ceres'      => '1',
    'pallas'     => '2',
    'juno'       => '3',
    'toutatis'   => '4179',
    'geographos' => '1620',
    'bacchus'    => '2063',
    'castalia'   => '4769'
];

// ---------------- Helpers ----------------
function sys_cache_dir() {
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'neo_cache';
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    return $dir;
}
function sys_cache_path($key) {
    return sys_cache_dir() . DIRECTORY_SEPARATOR . $key;
}
function clear_cache_dir() {
    $dir = sys_cache_dir();
    if (!is_dir($dir)) return;
    foreach (glob($dir . DIRECTORY_SEPARATOR . '*') as $f) @unlink($f);
}

function fetchNASA_raw($url, $cache_ttl = 0) {
    if ($cache_ttl > 0) {
        $cacheKey = 'raw_' . md5($url);
        $cacheFile = sys_cache_path($cacheKey);
        if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cache_ttl)) {
            $body = @file_get_contents($cacheFile);
            return ['body' => $body, 'http' => 200, 'error' => 'cached'];
        }
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'NEO-Search-Agent/validated/1.0'
    ]);
    $body = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($cache_ttl > 0 && $body !== false && $httpCode >= 200 && $httpCode < 300) {
        $cacheKey = 'raw_' . md5($url);
        @file_put_contents(sys_cache_path($cacheKey), $body);
    }

    return ['body' => $body, 'http' => $httpCode, 'error' => $err];
}

function is_valid_neo($data) {
    // Consideramos válido si existe name y al menos un id reconocible
    if (!is_array($data)) return false;
    if (empty($data['name'])) return false;
    if (!empty($data['neo_reference_id'])) return true;
    if (!empty($data['id'])) return true;
    // si no hay id, no es válido para nuestro uso
    return false;
}

function avgDiameterMeters($neo) {
    $diam = $neo['estimated_diameter']['meters'] ?? null;
    if (!$diam) return 0;
    $min = $diam['estimated_diameter_min'] ?? 0;
    $max = $diam['estimated_diameter_max'] ?? 0;
    return ($min + $max) / 2.0;
}

function fetchNASA($url, &$diagnostics = null, $cache_ttl = 0) {
    $res = fetchNASA_raw($url, $cache_ttl);
    if (is_array($diagnostics)) {
        $diagnostics['checked_urls'][] = $url;
        $diagnostics['raw_responses'][$url] = ['http' => $res['http'], 'curl_error' => $res['error']];
    }
    if ($res['body'] === false) {
        if (is_array($diagnostics)) $diagnostics['fetch_errors'][$url] = ['http' => $res['http'], 'error' => $res['error'], 'body_snippet' => null];
        error_log("fetchNASA curl failed: {$res['error']} - url:$url");
        return null;
    }
    $json = json_decode($res['body'], true);
    if ($json === null) {
        $snippet = substr($res['body'], 0, 2000);
        if (is_array($diagnostics)) $diagnostics['fetch_errors'][$url] = ['http' => $res['http'], 'error' => $res['error'], 'body_snippet' => $snippet];
        error_log("fetchNASA decode error for URL: $url ; http={$res['http']}; snippet: " . substr($snippet,0,500));
        return null;
    }
    // Si la estructura JSON no representa un NEO válido, déjalo claro en diagnostics y devuelve null
    if (!is_valid_neo($json)) {
        if (is_array($diagnostics)) {
            $diagnostics['invalid_neo_responses'][$url] = [
                'http' => $res['http'],
                'body_snippet' => substr($res['body'], 0, 2000),
                'reason' => 'missing required id or name fields'
            ];
        }
        error_log("fetchNASA: JSON recibido no tiene campos esperados (name/id) - url:$url");
        return null;
    }
    if (is_array($diagnostics)) $diagnostics['fetch_ok'][$url] = ['http' => $res['http']];
    return $json;
}

function normalize($s) {
    $s = mb_strtolower(trim((string)$s), 'UTF-8');
    $trans = @iconv('UTF-8', 'ASCII//TRANSLIT', $s);
    if ($trans !== false) $s = $trans;
    $s = preg_replace('/[^a-z0-9 ]/', '', $s);
    $s = preg_replace('/\s+/', ' ', $s);
    return $s;
}

// ---------------- Entradas ----------------
$query = isset($_GET['query']) ? trim((string)$_GET['query']) : '';
$debug = isset($_GET['debug']) && ($_GET['debug'] === '1' || strtolower($_GET['debug']) === 'true');
$use_cache_seconds = isset($_GET['cache_ttl']) ? intval($_GET['cache_ttl']) : 0;
$clear_cache = isset($_GET['clear_cache']) && ($_GET['clear_cache'] === '1' || strtolower($_GET['clear_cache']) === 'true');

if ($clear_cache) {
    clear_cache_dir();
    // devolvemos confirmación para que el cliente sepa que la cache fue borrada
    echo json_encode(['status' => 'cache_cleared']);
    exit;
}

$normalizedQuick = [];
foreach ($QUICK_MAP as $k => $id) {
    $normalizedQuick[normalize($k)] = ['id' => $id, 'label' => $k];
}

$diagnostics = ['queried' => $query, 'qNorm' => normalize($query), 'checked_quick_keys' => array_keys($normalizedQuick), 'checked_urls' => [], 'raw_responses' => [], 'fetch_errors' => [], 'fetch_ok' => [], 'invalid_neo_responses' => []];

if ($query === '') {
    echo json_encode(['status' => 'ok', 'message' => 'no query provided', 'map_count' => count($QUICK_MAP)], JSON_UNESCAPED_UNICODE);
    exit;
}

$qNorm = normalize($query);
$results = [];

// 1) Exacto en mapa normalizado
if (isset($normalizedQuick[$qNorm])) {
    $neoId = $normalizedQuick[$qNorm]['id'];
    $url = "{$NASA_BASE}/neo/{$neoId}?api_key={$NASA_API_KEY}";
    $data = fetchNASA($url, $diagnostics, $use_cache_seconds);
    if ($data) {
        // aquí garantizamos que data es válido y no tendremos id null
        $results[] = [
            'id' => $data['neo_reference_id'] ?? $data['id'] ?? null,
            'name' => $data['name'] ?? $normalizedQuick[$qNorm]['label'],
            'diameter_m' => avgDiameterMeters($data),
            'is_hazardous' => $data['is_potentially_hazardous_asteroid'] ?? false
        ];
        echo json_encode($results, JSON_UNESCAPED_UNICODE);
        exit;
    } else {
        $diagnostics['quick_lookup_failed'] = true;
    }
}

// 2) Parcial en mapa normalizado
$partialMatches = [];
foreach ($normalizedQuick as $kNorm => $info) {
    if (strpos($kNorm, $qNorm) !== false || strpos($qNorm, $kNorm) !== false) {
        $partialMatches[$info['id']] = $info['label'];
    }
}
if (!empty($partialMatches)) {
    foreach ($partialMatches as $neoId => $label) {
        $url = "{$NASA_BASE}/neo/{$neoId}?api_key={$NASA_API_KEY}";
        $d = fetchNASA($url, $diagnostics, $use_cache_seconds);
        if ($d) {
            $results[] = [
                'id' => $d['neo_reference_id'] ?? $d['id'] ?? null,
                'name' => $d['name'] ?? $label,
                'diameter_m' => avgDiameterMeters($d),
                'is_hazardous' => $d['is_potentially_hazardous_asteroid'] ?? false
            ];
        } else {
            $diagnostics['partial_fetch_failed_ids'][] = $neoId;
        }
    }
    if (!empty($results)) {
        echo json_encode($results, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// 3) Si es sólo números - ID directo
if (preg_match('/^\d+$/', $query)) {
    $url = "{$NASA_BASE}/neo/" . urlencode($query) . "?api_key={$NASA_API_KEY}";
    $d = fetchNASA($url, $diagnostics, $use_cache_seconds);
    if ($d) {
        $results[] = [
            'id' => $d['neo_reference_id'] ?? $d['id'] ?? null,
            'name' => $d['name'] ?? '',
            'diameter_m' => avgDiameterMeters($d),
            'is_hazardous' => $d['is_potentially_hazardous_asteroid'] ?? false
        ];
        echo json_encode($results, JSON_UNESCAPED_UNICODE);
        exit;
    } else {
        $diagnostics['direct_id_failed'] = true;
    }
}

// 4) Browse (fallback)
$maxPages = 5;
$found = [];
for ($page = 0; $page < $maxPages && count($found) < 12; $page++) {
    $url = "{$NASA_BASE}/neo/browse?api_key={$NASA_API_KEY}&page={$page}";
    $data = fetchNASA_raw($url, $use_cache_seconds);
    // parsear manualmente aquí para poder validar cada NEO y registrar snippets si es necesario
    if ($data['body'] === false) {
        $diagnostics['raw_responses'][$url] = ['http' => $data['http'], 'curl_error' => $data['error'], 'body_snippet' => null];
        continue;
    }
    $json = @json_decode($data['body'], true);
    if (!is_array($json) || !isset($json['near_earth_objects'])) {
        $diagnostics['raw_responses'][$url] = ['http' => $data['http'], 'curl_error' => $data['error'], 'body_snippet' => substr($data['body'],0,2000)];
        continue;
    }
    foreach ($json['near_earth_objects'] as $neo) {
        $name = $neo['name'] ?? '';
        $nameNorm = normalize($name);
        if (strpos(mb_strtolower($name, 'UTF-8'), mb_strtolower($query, 'UTF-8')) !== false
            || strpos($nameNorm, $qNorm) !== false
            || strpos($qNorm, $nameNorm) !== false) {
            if (is_valid_neo($neo)) {
                $found[] = [
                    'id' => $neo['neo_reference_id'] ?? $neo['id'] ?? null,
                    'name' => $name,
                    'diameter_m' => avgDiameterMeters($neo),
                    'is_hazardous' => $neo['is_potentially_hazardous_asteroid'] ?? false
                ];
            } else {
                // si el NEO del browse no tiene id, lo registramos en diagnostics
                $diagnostics['invalid_browse_entries'][] = ['name' => $name, 'snippet' => substr(json_encode($neo),0,300)];
            }
            if (count($found) >= 12) break 2;
        }
    }
    // pequeña pausa opcional para evitar rate-limit (no habilitada por defecto)
}

if (!empty($found)) {
    echo json_encode($found, JSON_UNESCAPED_UNICODE);
    exit;
}

// nada -> debug o vacío
if ($debug) {
    echo json_encode(['status' => 'not_found', 'diagnostics' => $diagnostics], JSON_UNESCAPED_UNICODE);
} else {
    echo json_encode([], JSON_UNESCAPED_UNICODE);
}
exit;