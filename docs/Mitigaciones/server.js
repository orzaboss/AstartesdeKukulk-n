// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('static')); // sirve ./static/index.html si lo pones allí

const NASA_API_KEY = process.env.NASA_API_KEY || 'Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B';
const NASA_BASE = 'https://api.nasa.gov/neo/rest/v1';

// ----- CONSTANTES -----
const MT_TNT_IN_JOULES = 4.184e15;         // <- arregla el error "MT_TNT_IN_JOULES is not defined"
const TARGET_DENSITY = 2700;
const DEFAULT_IMPACT_ANGLE_DEG = 45;
const DEFAULT_VELOCITY_KM_S = 20.0;

// util helpers
const toFloat = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const normalize = s => (s || '').toString().toLowerCase().replace(/[\(\)\[\],]/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();

// ----- pequeño mapa rápido para búsquedas comunes (opcional) -----
const QUICK_MAP = { 'bennu': '101955', 'apophis': '99942', 'eros': '433' };

// ----- función de simulación (adaptada del Python) -----
function estimarComposicionYdensidad(neo) {
  const orbital = neo.orbital_data || {};
  const spectral = ((orbital.spectral_type || '') + '').trim().toUpperCase();
  const albedo = toFloat(neo.albedo || orbital.albedo);
  if (spectral.startsWith('C')) return { composition: 'carbonaceo (C-type)', density: 1500 };
  if (spectral.startsWith('S')) return { composition: 'rocoso (S-type)', density: 3000 };
  if (spectral.startsWith('M')) return { composition: 'metalico (M-type)', density: 5300 };
  if (albedo !== null) {
    if (albedo < 0.1) return { composition: 'carbonaceo (por albedo)', density: 1500 };
    if (albedo > 0.4) return { composition: 'metalico (por albedo)', density: 5300 };
    return { composition: 'rocoso (por albedo)', density: 3000 };
  }
  return { composition: 'rocoso (asumido)', density: 3000 };
}

function seleccionarAcercamiento(neo) {
  const arr = (neo.close_approach_data || []).slice();
  if (!arr.length) return null;
  // preferir acercamientos futuros, si hay
  const parsed = arr.map(e => {
    if (!e.close_approach_date) return null;
    const d = new Date(e.close_approach_date + 'T00:00:00Z');
    if (isNaN(d)) return null;
    return { date: d, entry: e };
  }).filter(Boolean);
  if (!parsed.length) return arr[0];
  const hoy = new Date();
  const futuros = parsed.filter(p => p.date >= new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  if (futuros.length) {
    futuros.sort((a,b) => a.date - b.date);
    return futuros[0].entry;
  }
  parsed.sort((a,b) => b.date - a.date);
  return parsed[0].entry;
}

function calcularCrater(diameter_km, density, velocity_km_s, angle_deg) {
  if (!(diameter_km > 0)) return { diameter_km:0, radius_km:0, depth_km:0 };
  const angle_rad = angle_deg * Math.PI/180;
  const velocity_component = velocity_km_s * Math.max(Math.sin(angle_rad), 0.1);
  const crater_diameter_km = 1.161 * Math.pow((density/TARGET_DENSITY), 0.333) * Math.pow(diameter_km, 0.78) * Math.pow(velocity_component, 0.44);
  return { diameter_km: crater_diameter_km, radius_km: crater_diameter_km/2, depth_km: crater_diameter_km*0.2 };
}

function simularImpacto(neo) {
  const diam = (neo.estimated_diameter || {}).meters || {};
  const diam_min = Number(diam.estimated_diameter_min || 0);
  const diam_max = Number(diam.estimated_diameter_max || 0);
  const diam_prom_m = (diam_min && diam_max) ? (diam_min + diam_max)/2 : Math.max(diam_min, diam_max);
  const comp = estimarComposicionYdensidad(neo);
  const density = comp.density;
  const radio_m = diam_prom_m/2;
  const volumen_m3 = (4/3) * Math.PI * Math.pow(radio_m,3);
  const masa_kg = volumen_m3 * density;
  const acercamiento = seleccionarAcercamiento(neo);
  let velocidad_km_s = DEFAULT_VELOCITY_KM_S;
  let distancia_km = null, cuerpo_orbitado = null, fecha_cercana = null;
  if (acercamiento) {
    velocidad_km_s = toFloat(acercamiento.relative_velocity?.kilometers_per_second) || velocidad_km_s;
    distancia_km = toFloat(acercamiento.miss_distance?.kilometers);
    cuerpo_orbitado = acercamiento.orbiting_body;
    fecha_cercana = acercamiento.close_approach_date_full || acercamiento.close_approach_date;
  }
  const velocidad_m_s = velocidad_km_s * 1000;
  const energia_j = 0.5 * masa_kg * Math.pow(velocidad_m_s,2);
  const energia_mt = energia_j / MT_TNT_IN_JOULES;
  const crater = calcularCrater(diam_prom_m/1000, density, velocidad_km_s, DEFAULT_IMPACT_ANGLE_DEG);
  const blast_radius_km = energia_mt > 0 ? 0.32 * Math.pow(energia_mt, 1/3) : 0;
  const magnitud_ri = energia_j > 0 ? Math.max(0, 0.67 * Math.log10(energia_j) - 5.87) : 0;
  return {
    diameter_avg_m: diam_prom_m,
    diameter_min_m: diam_min,
    diameter_max_m: diam_max,
    composition: comp.composition,
    density_kg_m3: density,
    mass_kg: masa_kg,
    approach_date: fecha_cercana,
    approach_velocity_km_s: velocidad_km_s,
    approach_distance_km: distancia_km,
    approach_primary: cuerpo_orbitado,
    impact_angle_deg: DEFAULT_IMPACT_ANGLE_DEG,
    kinetic_energy_j: energia_j,
    kinetic_energy_mt: energia_mt,
    crater,
    blast_radius_km,
    seismic_magnitude: magnitud_ri
  };
}

// ----- ENDPOINT: /api/neos?query=... -----
app.get('/api/neos', async (req, res) => {
  try {
    const qRaw = (req.query.query || '').toString().trim();
    if (!qRaw) return res.json([]);
    const qLower = qRaw.toLowerCase();

    // quick map
    if (QUICK_MAP[qLower]) {
      try {
        const r0 = await axios.get(`${NASA_BASE}/neo/${QUICK_MAP[qLower]}`, { params: { api_key: NASA_API_KEY }});
        const neo = r0.data;
        const diam = (neo.estimated_diameter || {}).meters || {};
        const diamAvg = ((diam.estimated_diameter_min || 0) + (diam.estimated_diameter_max || 0)) / 2;
        return res.json([{
          id: neo.neo_reference_id || neo.id || neo.designation || neo.name,
          name: neo.name,
          diameter_m: diamAvg,
          is_hazardous: neo.is_potentially_hazardous_asteroid || false
        }]);
      } catch(e){
        console.warn('quick map lookup failed', e.message || e);
      }
    }

    // try direct lookup (user may pass an id)
    try {
      const rDirect = await axios.get(`${NASA_BASE}/neo/${encodeURIComponent(qRaw)}`, { params: { api_key: NASA_API_KEY }});
      if (rDirect && rDirect.data) {
        const neo = rDirect.data;
        const diam = (neo.estimated_diameter || {}).meters || {};
        const diamAvg = ((diam.estimated_diameter_min || 0) + (diam.estimated_diameter_max || 0)) / 2;
        return res.json([{
          id: neo.neo_reference_id || neo.id || neo.designation || neo.name,
          name: neo.name,
          diameter_m: diamAvg,
          is_hazardous: neo.is_potentially_hazardous_asteroid || false
        }]);
      }
    } catch (err) {
      // not found by direct id — ok, continuamos a búsqueda por nombre
      console.log('ID lookup failed (continuing to name search):', err.message || err.toString());
    }

    // paginado y búsqueda por nombre (normalizada)
    const results = [];
    const queryNorm = normalize(qRaw);
    let page = 0;
    const quickPages = 5;    // primero barrido ligero
    const maxPages = 50;     // máximo razonable (ajusta según tu cuota)
    const pagesToScan = Math.min(maxPages, quickPages);

    async function scan(limit) {
      for (; page < limit; page++) {
        const r = await axios.get(`${NASA_BASE}/neo/browse`, { params: { api_key: NASA_API_KEY, page }});
        const data = r.data || {};
        const neos = data.near_earth_objects || [];
        for (const neo of neos) {
          const nameNorm = normalize(neo.name || '');
          const designation = (neo.designation || '').toString().toLowerCase();
          if (nameNorm.includes(queryNorm) || queryNorm.includes(nameNorm) || designation.includes(queryNorm)) {
            const diam = (neo.estimated_diameter || {}).meters || {};
            const diamAvg = ((diam.estimated_diameter_min || 0) + (diam.estimated_diameter_max || 0)) / 2;
            results.push({
              id: neo.neo_reference_id || neo.id || neo.designation || neo.name,
              name: neo.name,
              diameter_m: diamAvg,
              is_hazardous: neo.is_potentially_hazardous_asteroid || false
            });
          }
        }
        if ((results.length) >= 8) break;
        if (!data.page || page >= (data.page.total_pages || page)) break;
      }
    }

    await scan(pagesToScan);

    // si no encontró nada en el barrido rápido, ampliar (opcional)
    if (results.length === 0 && page < maxPages) {
      await scan(maxPages);
    }

    // dedupe y responder
    const seen = new Set();
    const output = [];
    for (const r of results) {
      if (!seen.has(String(r.id))) { seen.add(String(r.id)); output.push(r); }
    }
    return res.json(output);
  } catch (err) {
    console.error('/api/neos error', err && (err.message || err.toString()));
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// ----- ENDPOINT: /api/neo/:id -----
app.get('/api/neo/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    // intento directo por ID (neo/<id>)
    try {
      const r = await axios.get(`${NASA_BASE}/neo/${encodeURIComponent(id)}`, { params: { api_key: NASA_API_KEY }});
      if (r && r.data) {
        const neo = r.data;
        const analysis = simularImpacto(neo);
        return res.json({
          id: neo.neo_reference_id || neo.id || neo.designation || neo.name,
          name: neo.name,
          estimated_diameter_m: analysis.diameter_avg_m,
          mass_kg: analysis.mass_kg,
          density_kg_m3: analysis.density_kg_m3,
          material: analysis.composition,
          approach: {
            date: analysis.approach_date,
            velocity_km_s: analysis.approach_velocity_km_s,
            miss_distance_km: analysis.approach_distance_km,
            orbiting_body: analysis.approach_primary
          },
          analysis
        });
      }
    } catch (err) {
      console.warn('ID lookup failed (continuing to name search):', err.message || err.toString());
      // no return: intentaremos búsqueda por nombre
    }

    // búsqueda por nombre si el id no era exacto
    let found = null;
    let page = 0;
    while (page < 5 && !found) {
      const r = await axios.get(`${NASA_BASE}/neo/browse`, { params: { api_key: NASA_API_KEY, page }});
      const list = (r.data && r.data.near_earth_objects) || [];
      for (const neo of list) {
        if ((neo.name || '').toLowerCase().includes(id.toLowerCase())) { found = neo; break; }
      }
      page++;
    }
    if (!found) {
      return res.status(404).json({ error: 'NEO not found' });
    }
    const analysis = simularImpacto(found);
    return res.json({
      id: found.neo_reference_id || found.id || found.designation || found.name,
      name: found.name,
      estimated_diameter_m: analysis.diameter_avg_m,
      mass_kg: analysis.mass_kg,
      density_kg_m3: analysis.density_kg_m3,
      material: analysis.composition,
      approach: {
        date: analysis.approach_date,
        velocity_km_s: analysis.approach_velocity_km_s,
        miss_distance_km: analysis.approach_distance_km,
        orbiting_body: analysis.approach_primary
      },
      analysis
    });

  } catch (err) {
    console.error('/api/neo/:id error:', err && (err.message || err.toString()));
    return res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`NEO proxy server listening at http://localhost:${PORT} (NASA key: ${Boolean(process.env.NASA_API_KEY) ? 'SET' : 'USING DEFAULT'})`));
