/* -----------------------
   SCRIPT.JS - COMPLETO
-------------------------*/

/* ---------- Estado ---------- */
let asteroids = [];
let selectedAsteroid = null;
let currentResults = null;
let selectedStrategyIndex = 0;
let animationFrame = null;
let stars = [];

/* ---------- Material properties ---------- */
const materialProperties = {
  "silicato": { ablationEfficiency: 0.10, ionEfficiency: 0.15, exhaustVelocity: 30000 },
  "condrita": { ablationEfficiency: 0.12, ionEfficiency: 0.18, exhaustVelocity: 32000 },
  "carbonáceo": { ablationEfficiency: 0.08, ionEfficiency: 0.12, exhaustVelocity: 28000 },
  "metálico": { ablationEfficiency: 0.15, ionEfficiency: 0.22, exhaustVelocity: 35000 }
};

/* ---------- Local Asteroid Dataset ---------- */
// To allow this app to function offline without external API calls, we define
// a small set of example near‑Earth objects with approximate parameters.
// Each entry includes an id (matching NASA's neo_reference_id when possible),
// a human friendly name, a diameter in metres, an orbital velocity in m/s,
// a material type for efficiency calculations, and a bulk density in kg/m3.
// Mass is computed at runtime from diameter and density.
const localAsteroids = [
  {
    id: '101955',
    name: 'Bennu',
    diameter: 492,        // m
    velocity: 28000,      // m/s (approx)
    material: 'carbonáceo',
    density: 1260         // kg/m³ (measured bulk density of Bennu)
  },
  {
    id: '99942',
    name: 'Apophis',
    diameter: 370,
    velocity: 30700,
    material: 'silicato',
    density: 3200         // kg/m³ (silicate)
  },
  {
    id: '433',
    name: 'Eros',
    diameter: 16840,
    velocity: 17000,
    material: 'silicato',
    density: 2700
  },
  {
    id: '25143',
    name: 'Itokawa',
    diameter: 350,
    velocity: 29000,
    material: 'silicato',
    density: 1900
  },
  {
    id: '162173',
    name: 'Ryugu',
    diameter: 900,
    velocity: 20000,
    material: 'carbonáceo',
    density: 1190
  }
];

// Compute mass from diameter and density: assume spherical shape
function computeMassFromDiameter(d, density = 2000) {
  // d in metres; density in kg/m3
  const radius = d / 2.0;
  const volume = (4.0 / 3.0) * Math.PI * Math.pow(radius, 3);
  return volume * density;
}

// Search our local dataset for asteroids matching the query (case insensitive).
function searchLocalNeos(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];
  return localAsteroids.filter(ast => {
    return ast.name.toLowerCase().includes(q) || ast.id === q;
  }).map(ast => {
    return {
      id: ast.id,
      name: ast.name,
      diameter_m: ast.diameter,
      is_hazardous: false
    };
  });
}

// Fetch detail for a local asteroid by id. Computes mass using diameter and density.
function getLocalNeo(id) {
  const ast = localAsteroids.find(a => a.id === id || a.name.toLowerCase() === id.toLowerCase());
  if (!ast) return null;
  const mass = computeMassFromDiameter(ast.diameter, ast.density);
  return {
    id: ast.id,
    name: ast.name,
    diameter: ast.diameter,
    velocity: ast.velocity,
    mass: mass,
    density: ast.density,
    material: ast.material,
    analysis: null
  };
}

/* ---------- Helpers de formato ---------- */
function fmt(value, unit = '', decimals = 2) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'number' || !isFinite(value)) return String(value) + (unit ? (' ' + unit) : '');
  if (Math.abs(value) < 1e-12) value = 0;
  const abs = Math.abs(value);
  let options = { maximumFractionDigits: decimals };
  if (abs >= 1000) options.maximumFractionDigits = 2;
  if (abs < 0.01 && abs > 0) options.maximumFractionDigits = 6;
  return value.toLocaleString('es-ES', options) + (unit ? (' ' + unit) : '');
}

function fmtSmart(value, unit) {
  if (unit === 'm') {
    if (Math.abs(value) >= 1000) return fmt(value / 1000, 'km', 2);
    return fmt(value, 'm', 0);
  }
  if (unit === 'kg') {
    if (Math.abs(value) >= 1e6) return fmt(value / 1e6, 'millones t', 2);
    if (Math.abs(value) >= 1000) return fmt(value / 1000, 't', 2);
    return fmt(value, 'kg', 0);
  }
  if (unit === 'm/s') {
    if (Math.abs(value) >= 1000) return fmt(value / 1000, 'km/s', 3);
    return fmt(value, 'm/s', 0);
  }
  return fmt(value, unit, 2);
}

/* ---------- Canvas hi-DPI y starfield ---------- */
const canvas = document.getElementById('vizCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(300, Math.floor(rect.width * dpr));
  canvas.height = Math.max(300, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stars.forEach(s => { s.x = Math.min(s.x, rect.width - 1); s.y = Math.min(s.y, rect.height - 1); });
  drawInitialCanvas();
}

window.addEventListener('resize', () => { clearTimeout(window._rv); window._rv = setTimeout(resizeCanvas, 120); });

function drawStarfield() {
  stars = [];
  const count = Math.max(60, Math.floor((canvas.width * canvas.height) / (1200 * 1200) * 100));
  const rect = canvas.getBoundingClientRect();
  for (let i=0;i<count;i++) {
    stars.push({ x: Math.random() * rect.width, y: Math.random() * rect.height, radius: Math.random() * 1.4 + 0.3, alpha: Math.random() * 0.6 + 0.2 });
  }
}

function drawInitialCanvas() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0,0,rect.width,rect.height);
  const g = ctx.createLinearGradient(0,0,0,rect.height);
  g.addColorStop(0, '#030515'); g.addColorStop(1, '#06102a');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,rect.width,rect.height);

  stars.forEach(s => {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI*2);
    ctx.fillStyle = `rgba(200,200,255,${s.alpha})`;
    ctx.fill();
  });

  ctx.fillStyle = '#86bfff';
  ctx.font = '16px "Segoe UI", Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Selecciona un asteroide y calcula estrategias', rect.width/2, rect.height/2);
}

/* ---------- Inicialización ---------- */
function init() {
  resizeCanvas();
  drawStarfield();
  drawInitialCanvas();
  bindUI();
}
window.addEventListener('load', init);

/* ---------- UI: fetch endpoints (ACTUALIZADO PARA HOSTINGER / Mitigaciones) ---------- */
async function loadNeos(query='') {
  const select = document.getElementById('neoSelect');
  select.disabled = true;
  select.innerHTML = '';
  // If no query, prompt user to enter a term
  if (!query) {
    const opt = document.createElement('option');
    opt.text = 'Introduce término y pulsa Buscar';
    opt.disabled = true;
    select.appendChild(opt);
    select.disabled = false;
    return;
  }
  // Perform a local search against our built‑in data set. This avoids
  // dependence on remote servers and allows the app to work offline.
  try {
    const list = searchLocalNeos(query);
    asteroids = Array.isArray(list) ? list : [];
    select.innerHTML = '';
    if (asteroids.length === 0) {
      const opt = document.createElement('option');
      opt.text = 'No se encontraron resultados';
      opt.disabled = true;
      select.appendChild(opt);
      select.disabled = false;
      return;
    }
    asteroids.forEach((n) => {
      const opt = document.createElement('option');
      opt.value = n.id;
      // Show approximate diameter when available
      opt.text = `${n.name} ${n.diameter_m ? `• ${Math.round(n.diameter_m)} m` : ''}`;
      select.appendChild(opt);
    });
    select.disabled = false;
  } catch (err) {
    console.error('Error loadNeos (local):', err);
    const opt = document.createElement('option');
    opt.text = 'Error de búsqueda local';
    opt.disabled = true;
    select.appendChild(opt);
    select.disabled = false;
  }
}

async function fetchNeoDetailAndSelect(id) {
  // Try to find the asteroid from the local dataset. This avoids
  // dependence on remote services.
  try {
    const asteroid = getLocalNeo(String(id));
    if (!asteroid) throw new Error('Asteroide no encontrado');
    selectAsteroid(asteroid, null);
    const detailsEl = document.getElementById('asteroidDetails');
    detailsEl.innerHTML = `<strong>${asteroid.name}</strong>
      <div style="margin-top:8px">Diámetro: ${fmtSmart(asteroid.diameter,'m')} • Masa: ${fmtSmart(asteroid.mass,'kg')} • Veloc.: ${fmtSmart(asteroid.velocity,'m/s')}</div>`;
  } catch (err) {
    console.error('fetchNeoDetailAndSelect local error:', err);
    alert('No se pudo obtener detalle del asteroide.');
  }
}

/* ---------- UI binding ---------- */
function bindUI() {
  document.getElementById('searchBtn').addEventListener('click', () => {
    const q = document.getElementById('searchQuery').value.trim();
    loadNeos(q);
  });
  document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('neoSelect').innerHTML = '';
    document.getElementById('asteroidDetails').innerHTML = 'Ninguno';
    asteroids = []; selectedAsteroid = null;
    drawInitialCanvas();
  });
  document.getElementById('loadDetailBtn').addEventListener('click', () => {
    const sel = document.getElementById('neoSelect');
    if (!sel.value) { alert('Selecciona un elemento del listado'); return; }
    fetchNeoDetailAndSelect(sel.value);
  });
  document.getElementById('neoSelect').addEventListener('dblclick', (e) => {
    const val = e.target.value || e.target.options?.[e.target.selectedIndex]?.value;
    if (val) fetchNeoDetailAndSelect(val);
  });

  document.getElementById('calcBtn').addEventListener('click', () => {
    if (!selectedAsteroid) { alert('Selecciona un asteroide antes de calcular'); return; }
    calculateAllStrategies();
  });
}

/* ---------- Selección visual ---------- */
function selectAsteroid(asteroid, cardElement) {
  selectedAsteroid = asteroid;
  selectedAsteroid._visSeed = (String(asteroid.id).split('').reduce((s,ch)=> s + ch.charCodeAt(0), 0) % 997) || 1;
  document.querySelectorAll('.asteroid-card').forEach(c=>c.classList.remove('selected'));
  if (cardElement && cardElement.classList) cardElement.classList.add('selected');
  const details = document.getElementById('asteroidDetails');
  details.innerHTML = `<strong>${asteroid.name}</strong><div style="margin-top:8px">Masa: ${fmtSmart(asteroid.mass,'kg')}<br>Material: ${asteroid.material}</div>`;
  if (typeof animateComparison === 'function' && currentResults && currentResults[selectedStrategyIndex]) {
    animateComparison(currentResults[selectedStrategyIndex]);
  } else {
    drawStaticForAsteroid();
  }
}

/* ---------- Cálculos de estrategias ---------- */
function calculateKineticImpact(asteroid, timeSeconds) {
  const impactorMass = 500;
  const impactorVelocity = 10000;
  const beta = 1.9;
  const deltaV = (beta * impactorMass * impactorVelocity) / Math.max(asteroid.mass || 1, 1);
  const deviation = deltaV * timeSeconds;
  const earthRadii = deviation / 6371000;
  return {
    method: "Impacto Cinético",
    formula: "Δv = (β × m_impactor × v_impactor) / m_asteroide",
    parameters: { "Masa impactor": `${impactorMass} kg`, "Velocidad impactor": `${impactorVelocity} m/s`, "Factor β": beta, "Masa asteroide": fmtSmart(asteroid.mass,'kg') },
    deltaV, deviation, earthRadii, timeSecondsUsed: timeSeconds
  };
}

function calculateGravitationalTractor(asteroid, timeSeconds) {
  const spacecraftMass = 20000;
  const operationDistance = 100;
  const G = 6.674e-11;
  const force = (G * spacecraftMass * Math.max(asteroid.mass,1)) / (operationDistance * operationDistance);
  const acceleration = force / Math.max(asteroid.mass,1);
  const deltaV = acceleration * timeSeconds;
  const deviation = deltaV * timeSeconds;
  const earthRadii = deviation / 6371000;
  return {
    method: "Tractor Gravitacional",
    formula: "F = G × m_nave × m_asteroide / r²; Δv = (F/m) × t",
    parameters: { "Masa nave": `${spacecraftMass} kg`, "Distancia operación": `${operationDistance} m`, "Constante G": `${G.toExponential(3)}`, "Tiempo (s)": `${Math.round(timeSeconds)}` },
    deltaV, deviation, earthRadii, timeSecondsUsed: timeSeconds
  };
}

function calculateLaserAblation(asteroid, timeSeconds) {
  const laserPower = 1e6;
  const matProps = materialProperties[asteroid.material] || materialProperties["silicato"];
  const efficiency = matProps.ablationEfficiency;
  const ablationVelocity = 1000;
  const massFlowRate = (laserPower * efficiency) / (0.5 * ablationVelocity * ablationVelocity);
  const deltaV = (massFlowRate * ablationVelocity * timeSeconds) / Math.max(asteroid.mass,1);
  const deviation = deltaV * timeSeconds;
  const earthRadii = deviation / 6371000;
  return {
    method: "Ablación Láser",
    formula: "Δv = (ṁ × v_ablation × t) / m_asteroide",
    parameters: { "Potencia láser": `${(laserPower/1e6).toFixed(1)} MW`, "Material": asteroid.material, "Eficiencia": `${(efficiency*100).toFixed(1)}%`, "Velocidad ablación": `${ablationVelocity} m/s`, "Flujo masa": massFlowRate.toExponential(2) },
    deltaV, deviation, earthRadii, timeSecondsUsed: timeSeconds
  };
}

function calculateIonBeam(asteroid, timeSeconds) {
  const beamPower = 5e5;
  const matProps = materialProperties[asteroid.material] || materialProperties["silicato"];
  const efficiency = matProps.ionEfficiency;
  const exhaustVelocity = matProps.exhaustVelocity;
  const thrust = (2 * beamPower * efficiency) / exhaustVelocity;
  const acceleration = thrust / Math.max(asteroid.mass,1);
  const deltaV = acceleration * timeSeconds;
  const deviation = deltaV * timeSeconds;
  const earthRadii = deviation / 6371000;
  return {
    method: "Haz de Iones",
    formula: "F = (2 × P × η) / v_exhaust; Δv = (F/m) × t",
    parameters: { "Potencia haz": `${(beamPower/1e3).toFixed(0)} kW`, "Material": asteroid.material, "Eficiencia": `${(efficiency*100).toFixed(1)}%`, "Velocidad eyección": `${exhaustVelocity} m/s`, "Empuje": thrust.toExponential(2) },
    deltaV, deviation, earthRadii, timeSecondsUsed: timeSeconds
  };
}

function calculateNuclearExplosion(asteroid, timeSeconds) {
  const yieldMegatons = 1;
  const yieldJoules = yieldMegatons * 4.184e15;
  const efficiency = 0.05;
  const standoffDistance = asteroid.diameter || 10;
  const energyTransferred = yieldJoules * efficiency;
  const deltaV = Math.sqrt((2 * energyTransferred) / Math.max(asteroid.mass,1));
  const deviation = deltaV * timeSeconds;
  const earthRadii = deviation / 6371000;
  return {
    method: "Explosión Nuclear",
    formula: "Δv = √(2 × E_transferred / m_asteroide)",
    parameters: { "Rendimiento": `${yieldMegatons} Megaton`, "Energía total": `${yieldJoules.toExponential(2)} J`, "Eficiencia": `${(efficiency*100)}%`, "Distancia detonación": `${standoffDistance} m` },
    deltaV, deviation, earthRadii, timeSecondsUsed: timeSeconds
  };
}

function calculateRequiredDeltaV(timeSeconds) {
  const earthRadius = 6.371e6;
  return earthRadius / Math.max(timeSeconds, 1);
}

/* ---------- Orquestador ---------- */
function calculateAllStrategies() {
  if (!selectedAsteroid) { alert('Por favor selecciona un asteroide primero'); return; }
  const warningTimeYears = parseFloat(document.getElementById('warningTime').value) || 0;
  const distanceAU = parseFloat(document.getElementById('distance').value) || 1.5;
  const AU = 1.495978707e11;
  const distanceMeters = distanceAU * AU;
  const timeByDistance = (selectedAsteroid.velocity && selectedAsteroid.velocity > 0) ? (distanceMeters / selectedAsteroid.velocity) : (warningTimeYears * 365.25*24*3600);
  const timeByWarning = warningTimeYears * 365.25 * 24 * 3600;
  const timeSecondsUsed = Math.min(timeByDistance, timeByWarning) || timeByWarning;
  const deltaV_required = calculateRequiredDeltaV(timeSecondsUsed);

  currentResults = [
    calculateKineticImpact(selectedAsteroid, timeSecondsUsed),
    calculateGravitationalTractor(selectedAsteroid, timeSecondsUsed),
    calculateLaserAblation(selectedAsteroid, timeSecondsUsed),
    calculateIonBeam(selectedAsteroid, timeSecondsUsed),
    calculateNuclearExplosion(selectedAsteroid, timeSecondsUsed)
  ];
  currentResults.forEach(r => { r.success = r.deltaV >= deltaV_required; r.timeSecondsUsed = timeSecondsUsed; });

  displayResults(currentResults, deltaV_required, timeSecondsUsed);

  const best = currentResults.reduce((acc, cur, idx) => {
    if (cur.success && cur.earthRadii > acc.earthRadii) return { ...cur, idx };
    return acc;
  }, { earthRadii: -1, idx: -1 });

  const pick = (best.idx >= 0) ? best.idx : 0;
  selectStrategy(pick);
}

/* ---------- Mostrar resultados ---------- */
function displayResults(results, deltaV_required, timeSecondsUsed) {
  const grid = document.getElementById('resultsGrid');
  grid.innerHTML = '';
  results.forEach((result, index) => {
    const card = document.createElement('div');
    card.className = 'strategy-card';
    card.onclick = () => selectStrategy(index);

    let paramsHTML = '';
    for (const [k,v] of Object.entries(result.parameters || {})) {
      paramsHTML += `<div class="result-item"><span class="result-label">${k}:</span> <span class="small">${v}</span></div>`;
    }
    let extraNote = '';
    if (result.method === 'Impacto Cinético') {
      const v_imp = 10000;
      const beta = 1.9;
      const m_req = (deltaV_required * Math.max(selectedAsteroid.mass,1)) / (beta * v_imp);
      extraNote = `<div class="result-item"><span class="result-label">Masa impactor requerida:</span> ${fmtSmart(m_req,'kg')}</div>`;
    }

    card.innerHTML = `
      <div class="strategy-title">${result.method}</div>
      <div class="formula">${result.formula}</div>
      ${paramsHTML}
      <div class="result-item"><span class="result-label">Δv obtenido:</span> ${fmt(result.deltaV, 'm/s', 6)}</div>
      <div class="result-item"><span class="result-label">Δv requerido:</span> ${fmt(deltaV_required, 'm/s', 6)}</div>
      <div class="result-item" style="color:${result.success ? '#00ff88' : '#ff6b35'}; font-weight:bold">${result.success ? '✅ MISIÓN EXITOSA' : '❌ INSUFICIENTE'}</div>
      ${extraNote}
      <div class="result-item"><span class="result-label">Desviación total:</span> ${fmt(result.deviation, 'm', 2)}</div>
      <div class="result-item"><span class="result-label">Radios terrestres:</span> ${fmt(result.earthRadii, 'R⊕', 3)}</div>
      <div class="result-item"><span class="result-label">Tiempo usado:</span> ${fmt(timeSecondsUsed/(365.25*24*3600), 'años', 2)}</div>
    `;
    grid.appendChild(card);
  });

  document.getElementById('resultsSummary').innerText = `Mostrando ${results.length} estrategias • Δv requerido: ${fmt(deltaV_required,'m/s',6)}`;
}

/* ---------- Selección de estrategia y animación ---------- */
function selectStrategy(index) {
  selectedStrategyIndex = index;
  document.querySelectorAll('.strategy-card').forEach((c,i)=> c.classList.toggle('selected-strategy', i===index));
  if (animationFrame) cancelAnimationFrame(animationFrame);
  if (currentResults && currentResults[index]) animateComparison(currentResults[index]);
}

/* ---------- Animación de comparación ---------- */
function calcMissDistance(deltaV, timeSeconds) { return deltaV * timeSeconds; }

function drawStaticForAsteroid() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0,0,rect.width,rect.height);
  const g = ctx.createLinearGradient(0,0,0,rect.height);
  g.addColorStop(0, '#030515'); g.addColorStop(1, '#06102a');
  ctx.fillStyle = g; ctx.fillRect(0,0,rect.width,rect.height);
  stars.forEach(s => {
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI*2);
    ctx.fillStyle = `rgba(200,200,255,${s.alpha})`; ctx.fill();
  });
  const cx = rect.width * 0.78, cy = rect.height * 0.55;
  const earthR = Math.max(18, Math.min(40, rect.width * 0.04));
  const grad = ctx.createRadialGradient(cx-3,cy-3,4, cx,cy,earthR);
  grad.addColorStop(0,'#6eb5ff'); grad.addColorStop(0.7,'#4a9eff'); grad.addColorStop(1,'#2a5a9f');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx,cy,earthR,0,Math.PI*2); ctx.fill();
  const startX = rect.width * 0.08, startY = rect.height * 0.12;
  const endX = cx - earthR*0.6, endY = cy;
  const ctrlX = (startX + endX)/2, ctrlY = startY - rect.height*0.14;
  ctx.strokeStyle = 'rgba(74,158,255,0.55)'; ctx.setLineDash([6,6]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(startX,startY); ctx.quadraticCurveTo(ctrlX,ctrlY,endX,endY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ff9500'; ctx.beginPath(); ctx.arc(startX, startY, 6, 0, Math.PI*2); ctx.fill();
}

function animateComparison(result) {
  if (!result) return;
  if (animationFrame) cancelAnimationFrame(animationFrame);

  const rect = canvas.getBoundingClientRect();
  const centerX = rect.width * 0.78, centerY = rect.height * 0.55;
  const earthR = Math.max(18, Math.min(40, rect.width * 0.04));
  const missMeters = calcMissDistance(result.deltaV, result.timeSecondsUsed);
  const missEarthRadii = missMeters / 6371000;
  const maxVisualPx = rect.width * 0.38;
  const devPx = Math.min(maxVisualPx, missEarthRadii * earthR);
  const startX = rect.width * 0.08, startY = rect.height * 0.12;
  const origEndX = centerX - earthR*0.6, origEndY = centerY;
  const defEndX = origEndX + devPx, defEndY = origEndY;
  const ctrlXorig = (startX + origEndX)/2, ctrlY = startY - rect.height*0.14;
  const ctrlXdef = (startX + defEndX)/2;
  const duration = 3200, startTime = performance.now();

  function bezierPoint(t, x0,y0, cx,cy, x1,y1) {
    const u = 1-t;
    return { x: (u*u)*x0 + 2*u*t*cx + (t*t)*x1, y: (u*u)*y0 + 2*u*t*cy + (t*t)*y1 };
  }

  function loop(now) {
    const elapsed = now - startTime, tt = ((elapsed % duration) / duration);
    ctx.clearRect(0,0,rect.width,rect.height);
    const g = ctx.createLinearGradient(0,0,0,rect.height);
    g.addColorStop(0, '#030515'); g.addColorStop(1, '#06102a');
    ctx.fillStyle = g; ctx.fillRect(0,0,rect.width,rect.height);
    stars.forEach(s => {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI*2);
      ctx.fillStyle = `rgba(200,200,255,${s.alpha})`; ctx.fill();
    });
    const earthGrad = ctx.createRadialGradient(centerX-3,centerY-3,4, centerX, centerY, earthR);
    earthGrad.addColorStop(0,'#6eb5ff'); earthGrad.addColorStop(0.7,'#4a9eff'); earthGrad.addColorStop(1,'#2a5a9f');
    ctx.fillStyle = earthGrad; ctx.beginPath(); ctx.arc(centerX,centerY,earthR,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(74,158,255,0.6)'; ctx.lineWidth = 2; ctx.setLineDash([6,6]);
    ctx.beginPath(); ctx.moveTo(startX,startY); ctx.quadraticCurveTo(ctrlXorig,ctrlY,origEndX,origEndY); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = result.success ? 'rgba(0,255,136,0.95)' : 'rgba(255,107,53,0.95)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(startX,startY); ctx.quadraticCurveTo(ctrlXdef,ctrlY,defEndX,defEndY); ctx.stroke();
    const posO = bezierPoint(tt, startX,startY, ctrlXorig,ctrlY, origEndX,origEndY);
    const posD = bezierPoint(tt, startX,startY, ctrlXdef,ctrlY, defEndX,defEndY);
    ctx.fillStyle = 'rgba(74,158,255,0.95)'; ctx.beginPath(); ctx.arc(posO.x, posO.y, 6, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,149,0,0.95)'; ctx.beginPath(); ctx.arc(posD.x, posD.y, 6, 0, Math.PI*2); ctx.fill();
    document.getElementById('vizInfo').innerHTML = `<strong>${result.method}</strong><br>Desviación estimada: ${fmt(missMeters/1000,'km',2)} (${fmt(missEarthRadii,'R⊕',3)})<br>Tiempo: ${fmt(result.timeSecondsUsed/(365.25*24*3600),'años',2)} • Estado: ${result.success ? '<span style="color:#00ff88">✓ Exitosa</span>' : '<span style="color:#ff6b35">✗ Insuficiente</span>'}`;
    animationFrame = requestAnimationFrame(loop);
  }
  animationFrame = requestAnimationFrame(loop);
}

drawInitialCanvas();