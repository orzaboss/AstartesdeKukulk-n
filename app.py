import math
from datetime import datetime, date
from typing import Dict, Optional, Tuple

import requests

API_KEY = "Nxvxz1N0ARXVVH9oNBdI8-----------------------------uQXtZiF9pLTdhIxD29B"
NASA_BASE_URL = "https://api.nasa.gov/neo/rest/v1"

GRAVITY_EARTH = 9.80665  # m/s^2
TARGET_DENSITY = 2700  # kg/m^3, corteza continental
MT_TNT_IN_JOULES = 4.184e15
DEFAULT_IMPACT_ANGLE_DEG = 45
DEFAULT_VELOCITY_KM_S = 20.0
DEFAULT_APPROACH_LIMIT = 100  # paginas maximas al buscar por nombre


def pedir_busqueda() -> str:
    return input("Que asteroide quieres buscar? (nombre o ID): ").strip()


def buscar_por_id(asteroid_id: str) -> Optional[Dict]:
    url = f"{NASA_BASE_URL}/neo/{asteroid_id}"
    resp = requests.get(url, params={"api_key": API_KEY}, timeout=30)
    if resp.status_code == 200:
        return resp.json()
    return None


def buscar_por_nombre(fragmento: str) -> Optional[Dict]:
    page = 0
    while page < DEFAULT_APPROACH_LIMIT:
        resp = requests.get(
            f"{NASA_BASE_URL}/neo/browse",
            params={"api_key": API_KEY, "page": page},
            timeout=30,
        )
        if resp.status_code != 200:
            break
        data = resp.json()
        for neo in data.get("near_earth_objects", []):
            if fragmento.lower() in neo.get("name", "").lower():
                return neo
        total_pages = data.get("page", {}).get("total_pages")
        if total_pages is None or page >= total_pages - 1:
            break
        page += 1
    return None


def to_float(value: Optional[str]) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def estimar_composicion_y_densidad(neo: Dict) -> Tuple[str, float]:
    orbital_data = neo.get("orbital_data") or {}
    spectral = (orbital_data.get("spectral_type") or "").strip().upper()
    albedo = to_float(orbital_data.get("albedo"))

    if spectral.startswith("C"):
        return "carbonaceo (C-type)", 1500
    if spectral.startswith("S"):
        return "rocoso (S-type)", 3000
    if spectral.startswith("M"):
        return "metalico (M-type)", 5300

    if albedo is not None:
        if albedo < 0.1:
            return "carbonaceo (C-type asumido por albedo)", 1500
        if albedo > 0.4:
            return "metalico (M-type asumido por albedo)", 5300
        return "rocoso (S-type asumido por albedo)", 3000

    return "rocoso (S-type asumido)", 3000


def seleccionar_acercamiento(neo: Dict) -> Optional[Dict]:
    acercamientos = neo.get("close_approach_data") or []
    if not acercamientos:
        return None

    parsed = []
    for entrada in acercamientos:
        fecha_txt = entrada.get("close_approach_date")
        if not fecha_txt:
            continue
        try:
            fecha = datetime.strptime(fecha_txt, "%Y-%m-%d").date()
        except ValueError:
            continue
        parsed.append((fecha, entrada))

    if not parsed:
        return acercamientos[0]

    hoy = date.today()
    futuros = [item for item in parsed if item[0] >= hoy]
    if futuros:
        futuros.sort(key=lambda x: x[0])
        return futuros[0][1]

    parsed.sort(key=lambda x: x[0], reverse=True)
    return parsed[0][1]


def calcular_crater(diameter_km: float, density: float, velocity_km_s: float, angle_deg: float) -> Dict:
    if diameter_km <= 0:
        return {"diameter_km": 0.0, "radius_km": 0.0, "depth_km": 0.0}

    angle_rad = math.radians(angle_deg)
    velocity_component = velocity_km_s * max(math.sin(angle_rad), 0.1)

    crater_diameter_km = 1.161 * ((density / TARGET_DENSITY) ** 0.333) * (diameter_km ** 0.78) * (velocity_component ** 0.44)
    crater_radius_km = crater_diameter_km / 2.0
    crater_depth_km = crater_diameter_km * 0.2

    return {
        "diameter_km": crater_diameter_km,
        "radius_km": crater_radius_km,
        "depth_km": crater_depth_km,
    }


def simular_impacto(neo: Dict) -> Dict:
    diametros = neo.get("estimated_diameter", {}).get("meters", {})
    diam_min = float(diametros.get("estimated_diameter_min", 0))
    diam_max = float(diametros.get("estimated_diameter_max", 0))
    diam_prom_m = (diam_min + diam_max) / 2 if (diam_min and diam_max) else max(diam_min, diam_max)

    composicion, densidad = estimar_composicion_y_densidad(neo)

    radio_m = diam_prom_m / 2
    volumen_m3 = (4.0 / 3.0) * math.pi * (radio_m ** 3)
    masa_kg = volumen_m3 * densidad

    acercamiento = seleccionar_acercamiento(neo)
    velocidad_km_s = DEFAULT_VELOCITY_KM_S
    distancia_km = None
    cuerpo_orbitado = None
    fecha_cercana = None

    if acercamiento:
        velocidad_km_s = to_float(acercamiento.get("relative_velocity", {}).get("kilometers_per_second")) or DEFAULT_VELOCITY_KM_S
        distancia_km = to_float(acercamiento.get("miss_distance", {}).get("kilometers"))
        cuerpo_orbitado = acercamiento.get("orbiting_body")
        fecha_cercana = acercamiento.get("close_approach_date_full") or acercamiento.get("close_approach_date")

    velocidad_m_s = velocidad_km_s * 1000
    energia_j = 0.5 * masa_kg * (velocidad_m_s ** 2)
    energia_mt = energia_j / MT_TNT_IN_JOULES

    crater = calcular_crater(diam_prom_m / 1000, densidad, velocidad_km_s, DEFAULT_IMPACT_ANGLE_DEG)

    blast_radius_km = 0.32 * (energia_mt ** (1 / 3)) if energia_mt > 0 else 0.0
    magnitud_ri = max(0.0, 0.67 * math.log10(energia_j) - 5.87) if energia_j > 0 else 0.0

    return {
        "diameter_avg_m": diam_prom_m,
        "diameter_min_m": diam_min,
        "diameter_max_m": diam_max,
        "composition": composicion,
        "density_kg_m3": densidad,
        "mass_kg": masa_kg,
        "approach_date": fecha_cercana,
        "approach_velocity_km_s": velocidad_km_s,
        "approach_distance_km": distancia_km,
        "approach_primary": cuerpo_orbitado,
        "impact_angle_deg": DEFAULT_IMPACT_ANGLE_DEG,
        "kinetic_energy_j": energia_j,
        "kinetic_energy_mt": energia_mt,
        "crater": crater,
        "blast_radius_km": blast_radius_km,
        "seismic_magnitude": magnitud_ri,
    }


def mostrar_resultados(neo: Dict, analisis: Dict) -> None:
    print("\n=== Datos basicos del asteroide ===")
    print(f"Nombre: {neo.get('name')}")
    print(f"ID (neo_reference_id): {neo.get('neo_reference_id')}")
    es_peligroso = "Si" if neo.get("is_potentially_hazardous_asteroid") else "No"
    print(f"Potencialmente peligroso: {es_peligroso}")

    orbit_class = (neo.get("orbital_data", {}).get("orbit_class", {}) or {}).get("orbit_class_type")
    if orbit_class:
        print(f"Tipo orbital (segun JPL): {orbit_class}")

    print("\n=== Propiedades fisicas estimadas ===")
    print(f"Diametro minimo: {analisis['diameter_min_m']:.1f} m")
    print(f"Diametro maximo: {analisis['diameter_max_m']:.1f} m")
    print(f"Diametro medio: {analisis['diameter_avg_m']:.1f} m")
    print(f"Composicion estimada: {analisis['composition']}")
    print(f"Densidad asumida: {analisis['density_kg_m3']:.0f} kg/m^3")
    print(f"Masa aproximada: {analisis['mass_kg']:.3e} kg")

    print("\n=== Impacto hipotetico con la Tierra ===")
    if analisis.get("approach_date"):
        print(f"Basado en el acercamiento: {analisis['approach_date']} (referencia: {analisis.get('approach_primary') or 'Tierra'})")
        if analisis.get("approach_distance_km"):
            print(f"Distancia minima proyectada: {analisis['approach_distance_km']:.0f} km")
    print(f"Velocidad de impacto considerada: {analisis['approach_velocity_km_s']:.1f} km/s")
    print(f"Angulo de impacto asumido: {analisis['impact_angle_deg']} grados")
    print(f"Energia cinetica: {analisis['kinetic_energy_j']:.3e} J")
    print(f"Energia equivalente: {analisis['kinetic_energy_mt']:.1f} Mt de TNT")

    crater = analisis["crater"]
    print("\n=== Crater de impacto estimado ===")
    print(f"Diametro final: {crater['diameter_km']:.2f} km")
    print(f"Radio: {crater['radius_km']:.2f} km")
    print(f"Profundidad: {crater['depth_km']:.2f} km")

    print("\n=== Efectos secundarios aproximados ===")
    print(f"Radio de onda de choque severa: {analisis['blast_radius_km']:.2f} km")
    print(f"Magnitud sismica equivalente: M {analisis['seismic_magnitude']:.1f}")
    print("Nota: Valores estimados usando supuestos estandar (impacto en roca, angulo de 45 grados, densidad de la corteza terrestre).")


def main() -> None:
    busqueda = pedir_busqueda()
    if not busqueda:
        print("No se ingreso ningun valor.")
        return

    if busqueda.isdigit():
        neo = buscar_por_id(busqueda)
    else:
        neo = buscar_por_id(busqueda) or buscar_por_nombre(busqueda)

    if not neo:
        print("No se encontro informacion para ese asteroide.")
        return

    analisis = simular_impacto(neo)
    mostrar_resultados(neo, analisis)


if __name__ == "__main__":
    try:
        main()
    except requests.RequestException as exc:
        print(f"Error al consultar la API de la NASA: {exc}")
