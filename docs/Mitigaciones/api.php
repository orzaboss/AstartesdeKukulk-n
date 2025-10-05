<?php
// api.php - Backend PHP para consultar API de NASA y calcular mitigaciones
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Configuración
$NASA_API_KEY = getenv('NASA_API_KEY') ?: 'Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B';
$NASA_BASE = 'https://api.nasa.gov/neo/rest/v1';

// Constantes
const MT_TNT_IN_JOULES = 4.184e15;
const TARGET_DENSITY = 2700;
const DEFAULT_IMPACT_ANGLE_DEG = 45;
const DEFAULT_VELOCITY_KM_S = 20.0;

// Mapa rápido para búsquedas comunes
$QUICK_MAP = ['bennu' => '101955', 'apophis' => '99942', 'eros' => '433'];

// Funciones auxiliares
function toFloat($v) {
    $n = floatval($v);
    return is_finite($n) ? $n : null;
}

function normalize($s) {
    $s = strtolower(trim($s));
    $s = preg_replace('/[\(\)\[\],]/', ' ', $s);
    $s = preg_replace('/[^a-z0-9\s]/', ' ', $s);
    $s = preg_replace('/\s+/', ' ', $s);
    return trim($s);
}

function estimarComposicionYdensidad($neo) {
    $orbital = $neo['orbital_data'] ?? [];
    $spectral = strtoupper(trim($orbital['spectral_type'] ?? ''));
    $albedo = toFloat($neo['albedo'] ?? $orbital['albedo'] ?? null);
    
    if (strpos($spectral, 'C') === 0) return ['composition' => 'carbonaceo (C-type)', 'density' => 1500];
    if (strpos($spectral, 'S') === 0) return ['composition' => 'rocoso (S-type)', 'density' => 3000];
    if (strpos($spectral, 'M') === 0) return ['composition' => 'metalico (M-type)', 'density' => 5300];
    
    if ($albedo !== null) {
        if ($albedo < 0.1) return ['composition' => 'carbonaceo (por albedo)', 'density' => 1500];
        if ($albedo > 0.4) return ['composition' => 'metalico (por albedo)', 'density' => 5300];
        return ['composition' => 'rocoso (por albedo)', 'density' => 3000];
    }
    
    return ['composition' => 'rocoso (asumido)', 'density' => 3000];
}

function seleccionarAcercamiento($neo) {
    $arr = $neo['close_approach_data'] ?? [];
    if (empty($arr)) return null;
    
    $parsed = array_filter(array_map(function($e) {
        if (empty($e['close_approach_date'])) return null;
        $date = strtotime($e['close_approach_date'] . ' 00:00:00');
        if (!$date) return null;
        return ['date' => $date, 'entry' => $e];
    }, $arr));
    
    if (empty($parsed)) return $arr[0];
    
    $hoy = time();
    $futuros = array_filter($parsed, function($p) use ($hoy) {
        return $p['date'] >= $hoy;
    });
    
    if (!empty($futuros)) {
        usort($futuros, function($a, $b) { return $a['date'] - $b['date']; });
        return $futuros[0]['entry'];
    }
    
    usort($parsed, function($a, $b) { return $b['date'] - $a['date']; });
    return $parsed[0]['entry'];
}

function calcularCrater($diameter_km, $density, $velocity_km_s, $angle_deg) {
    if (!($diameter_km > 0)) return ['diameter_km' => 0, 'radius_km' => 0, 'depth_km' => 0];
    
    $angle_rad = deg2rad($angle_deg);
    $velocity_component = $velocity_km_s * max(sin($angle_rad), 0.1);
    $crater_diameter_km = 1.161 * pow(($density / TARGET_DENSITY), 0.333) * pow($diameter_km, 0.78) * pow($velocity_component, 0.44);
    
    return [
        'diameter_km' => $crater_diameter_km,
        'radius_km' => $crater_diameter_km / 2,
        'depth_km' => $crater_diameter_km * 0.2
    ];
}

function simularImpacto($neo) {
    $diam = $neo['estimated_diameter']['meters'] ?? [];
    $diam_min = floatval($diam['estimated_diameter_min'] ?? 0);
    $diam_max = floatval($diam['estimated_diameter_max'] ?? 0);
    $diam_prom_m = ($diam_min && $diam_max) ? ($diam_min + $diam_max) / 2 : max($diam_min, $diam_max);
    
    $comp = estimarComposicionYdensidad($neo);
    $density = $comp['density'];
    $radio_m = $diam_prom_m / 2;
    $volumen_m3 = (4/3) * M_PI * pow($radio_m, 3);
    $masa_kg = $volumen_m3 * $density;
    
    $acercamiento = seleccionarAcercamiento($neo);
    $velocidad_km_s = DEFAULT_VELOCITY_KM_S;
    $distancia_km = null;
    $cuerpo_orbitado = null;
    $fecha_cercana = null;
    
    if ($acercamiento) {
        $velocidad_km_s = toFloat($acercamiento['relative_velocity']['kilometers_per_second'] ?? null) ?? $velocidad_km_s;
        $distancia_km = toFloat($acercamiento['miss_distance']['kilometers'] ?? null);
        $cuerpo_orbitado = $acercamiento['orbiting_body'] ?? null;
        $fecha_cercana = $acercamiento['close_approach_date_full'] ?? $acercamiento['close_approach_date'] ?? null;
    }
    
    $velocidad_m_s = $velocidad_km_s * 1000;
    $energia_j = 0.5 * $masa_kg * pow($velocidad_m_s, 2);
    $energia_mt = $energia_j / MT_TNT_IN_JOULES;
    $crater = calcularCrater($diam_prom_m / 1000, $density, $velocidad_km_s, DEFAULT_IMPACT_ANGLE_DEG);
    $blast_radius_km = $energia_mt > 0 ? 0.32 * pow($energia_mt, 1/3) : 0;
    $magnitud_ri = $energia_j > 0 ? max(0, 0.67 * log10($energia_j) - 5.87) : 0;
    
    return [
        'diameter_avg_m' => $diam_prom_m,
        'diameter_min_m' => $diam_min,
        'diameter_max_m' => $diam_max,
        'composition' => $comp['composition'],
        'density_kg_m3' => $density,
        'mass_kg' => $masa_kg,
        'approach_date' => $fecha_cercana,
        'approach_velocity_km_s' => $velocidad_km_s,
        'approach_distance_km' => $distancia_km,
        'approach_primary' => $cuerpo_orbitado,
        'impact_angle_deg' => DEFAULT_IMPACT_ANGLE_DEG,
        'kinetic_energy_j' => $energia_j,
        'kinetic_energy_mt' => $energia_mt,
        'crater' => $crater,
        'blast_radius_km' => $blast_radius_km,
        'seismic_magnitude' => $magnitud_ri
    ];
}

function fetchNASA($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) return null;
    return json_decode($response, true);
}

// Router
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$query = $_GET;

// Endpoint: /api/neos
if (preg_match('#/api/neos#', $path)) {
    $qRaw = trim($query['query'] ?? '');
    if (empty($qRaw)) {
        echo json_encode([]);
        exit;
    }
    
    $qLower = strtolower($qRaw);
    
    // Quick map
    if (isset($QUICK_MAP[$qLower])) {
        $data = fetchNASA("$NASA_BASE/neo/{$QUICK_MAP[$qLower]}?api_key=$NASA_API_KEY");
        if ($data) {
            $diam = $data['estimated_diameter']['meters'] ?? [];
            $diamAvg = (($diam['estimated_diameter_min'] ?? 0) + ($diam['estimated_diameter_max'] ?? 0)) / 2;
            echo json_encode([[
                'id' => $data['neo_reference_id'] ?? $data['id'] ?? $data['name'],
                'name' => $data['name'],
                'diameter_m' => $diamAvg,
                'is_hazardous' => $data['is_potentially_hazardous_asteroid'] ?? false
            ]]);
            exit;
        }
    }
    
    // Búsqueda directa por ID
    $data = fetchNASA("$NASA_BASE/neo/" . urlencode($qRaw) . "?api_key=$NASA_API_KEY");
    if ($data) {
        $diam = $data['estimated_diameter']['meters'] ?? [];
        $diamAvg = (($diam['estimated_diameter_min'] ?? 0) + ($diam['estimated_diameter_max'] ?? 0)) / 2;
        echo json_encode([[
            'id' => $data['neo_reference_id'] ?? $data['id'] ?? $data['name'],
            'name' => $data['name'],
            'diameter_m' => $diamAvg,
            'is_hazardous' => $data['is_potentially_hazardous_asteroid'] ?? false
        ]]);
        exit;
    }
    
    // Búsqueda por nombre (paginado)
    $results = [];
    $queryNorm = normalize($qRaw);
    $maxPages = 10;
    
    for ($page = 0; $page < $maxPages && count($results) < 8; $page++) {
        $data = fetchNASA("$NASA_BASE/neo/browse?api_key=$NASA_API_KEY&page=$page");
        if (!$data) break;
        
        foreach (($data['near_earth_objects'] ?? []) as $neo) {
            $nameNorm = normalize($neo['name'] ?? '');
            $designation = strtolower($neo['designation'] ?? '');
            
            if (strpos($nameNorm, $queryNorm) !== false || strpos($queryNorm, $nameNorm) !== false || strpos($designation, $queryNorm) !== false) {
                $diam = $neo['estimated_diameter']['meters'] ?? [];
                $diamAvg = (($diam['estimated_diameter_min'] ?? 0) + ($diam['estimated_diameter_max'] ?? 0)) / 2;
                $results[] = [
                    'id' => $neo['neo_reference_id'] ?? $neo['id'] ?? $neo['name'],
                    'name' => $neo['name'],
                    'diameter_m' => $diamAvg,
                    'is_hazardous' => $neo['is_potentially_hazardous_asteroid'] ?? false
                ];
                if (count($results) >= 8) break;
            }
        }
    }
    
    // Eliminar duplicados
    $seen = [];
    $output = [];
    foreach ($results as $r) {
        $id = strval($r['id']);
        if (!isset($seen[$id])) {
            $seen[$id] = true;
            $output[] = $r;
        }
    }
    
    echo json_encode($output);
    exit;
}

// Endpoint: /api/neo/:id
if (preg_match('#/api/neo/([^/]+)#', $path, $matches)) {
    $id = $matches[1];
    
    // Intento directo por ID
    $data = fetchNASA("$NASA_BASE/neo/" . urlencode($id) . "?api_key=$NASA_API_KEY");
    if ($data) {
        $analysis = simularImpacto($data);
        echo json_encode([
            'id' => $data['neo_reference_id'] ?? $data['id'] ?? $data['name'],
            'name' => $data['name'],
            'estimated_diameter_m' => $analysis['diameter_avg_m'],
            'mass_kg' => $analysis['mass_kg'],
            'density_kg_m3' => $analysis['density_kg_m3'],
            'material' => $analysis['composition'],
            'approach' => [
                'date' => $analysis['approach_date'],
                'velocity_km_s' => $analysis['approach_velocity_km_s'],
                'miss_distance_km' => $analysis['approach_distance_km'],
                'orbiting_body' => $analysis['approach_primary']
            ],
            'analysis' => $analysis
        ]);
        exit;
    }
    
    // Búsqueda por nombre
    $found = null;
    for ($page = 0; $page < 5 && !$found; $page++) {
        $data = fetchNASA("$NASA_BASE/neo/browse?api_key=$NASA_API_KEY&page=$page");
        if (!$data) break;
        
        foreach (($data['near_earth_objects'] ?? []) as $neo) {
            if (stripos($neo['name'] ?? '', $id) !== false) {
                $found = $neo;
                break;
            }
        }
    }
    
    if (!$found) {
        http_response_code(404);
        echo json_encode(['error' => 'NEO not found']);
        exit;
    }
    
    $analysis = simularImpacto($found);
    echo json_encode([
        'id' => $found['neo_reference_id'] ?? $found['id'] ?? $found['name'],
        'name' => $found['name'],
        'estimated_diameter_m' => $analysis['diameter_avg_m'],
        'mass_kg' => $analysis['mass_kg'],
        'density_kg_m3' => $analysis['density_kg_m3'],
        'material' => $analysis['composition'],
        'approach' => [
            'date' => $analysis['approach_date'],
            'velocity_km_s' => $analysis['approach_velocity_km_s'],
            'miss_distance_km' => $analysis['approach_distance_km'],
            'orbiting_body' => $analysis['approach_primary']
        ],
        'analysis' => $analysis
    ]);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Endpoint not found']);
