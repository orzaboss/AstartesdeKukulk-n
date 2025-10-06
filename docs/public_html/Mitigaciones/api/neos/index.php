<?php
header('Content-Type: application/json; charset=utf-8');

$query = isset($_GET['query']) ? trim($_GET['query']) : '';
if ($query === '') {
    echo json_encode(['error' => 'Falta query']);
    exit;
}

// Respuesta de prueba
echo json_encode([
    'ok' => true,
    'endpoint' => '/Mitigaciones/api/neos',
    'received_query' => $query
]);
