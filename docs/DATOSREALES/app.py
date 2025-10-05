import json
import math
import os
import urllib.parse
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, HTTPServer

import requests

# NASA API configuration.  A valid API key is required to fetch
# information about near earth objects.  You can register for a
# personal API key at https://api.nasa.gov/ if the default key
# becomes rate limited.
API_KEY = "Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B"
NASA_BASE_URL = "https://api.nasa.gov/neo/rest/v1"

# Physical constants used throughout the simulation.
GRAVITY_EARTH = 9.80665  # m/s^2, not currently used but retained for completeness
TARGET_DENSITY = 2700  # kg/m^3, average density of continental crust
MT_TNT_IN_JOULES = 4.184e15  # One megaton of TNT in joules
DEFAULT_IMPACT_ANGLE_DEG = 45
DEFAULT_VELOCITY_KM_S = 20.0
DEFAULT_APPROACH_LIMIT = 100  # maximum pages to browse when searching by name


def buscar_por_id(asteroid_id: str) -> dict | None:
    """Retrieve a near earth object by its NASA NEO reference ID.

    Parameters
    ----------
    asteroid_id : str
        The numeric identifier assigned by NASA's JPL.  Note that this
        should be passed as a string because the API accepts it
        directly in the URL.

    Returns
    -------
    dict | None
        A dictionary describing the NEO on success, or ``None`` if
        the object could not be fetched (non‑200 response).
    """
    url = f"{NASA_BASE_URL}/neo/{asteroid_id}"
    resp = requests.get(url, params={"api_key": API_KEY}, timeout=30)
    if resp.status_code == 200:
        return resp.json()
    return None


def buscar_por_nombre(fragmento: str) -> dict | None:
    """Search for a near earth object by a fragment of its name.

    The NASA browse endpoint paginates over all known NEOs.  This
    function iterates over pages until it finds a name containing
    ``fragmento``, returning the first match.  To avoid excessive
    network requests the search is capped at ``DEFAULT_APPROACH_LIMIT``
    pages.

    Parameters
    ----------
    fragmento : str
        A case–insensitive substring of the desired object's name.

    Returns
    -------
    dict | None
        The first matching NEO dictionary, or ``None`` if no match
        could be found within the search limit.
    """
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
            if fragmento.lower() in (neo.get("name") or "").lower():
                return neo
        total_pages = data.get("page", {}).get("total_pages")
        if total_pages is None or page >= total_pages - 1:
            break
        page += 1
    return None


def to_float(value: str | None) -> float | None:
    """Safely convert a string to a float.

    Returns ``None`` if the value is empty or cannot be converted.
    """
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def estimar_composicion_y_densidad(neo: dict) -> tuple[str, float]:
    """Estimate the composition and density of a NEO.

    The spectral type (when available) or albedo are used to infer
    whether the object is carbonaceous, silicate or metallic.  These
    categories map to typical densities used by the simulation.  If
    neither spectral type nor albedo are known the function defaults
    to a stony (S‑type) composition.
    """
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


def seleccionar_acercamiento(neo: dict) -> dict | None:
    """Pick the most relevant close approach from a NEO record.

    This helper selects the next upcoming close approach if available,
    otherwise returns the most recent past approach.  If no dates are
    parsable the first entry in ``close_approach_data`` is returned.
    """
    acercamientos = neo.get("close_approach_data") or []
    if not acercamientos:
        return None

    parsed: list[tuple[date, dict]] = []
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


def calcular_crater(diameter_km: float, density: float, velocity_km_s: float, angle_deg: float) -> dict:
    """Estimate crater dimensions resulting from an impact.

    The Schmidt–Holsapple scaling law is used to approximate the
    transient crater diameter for a spherical impactor striking at
    ``velocity_km_s`` km/s and ``angle_deg`` degrees.  For very small
    objects (``diameter_km <= 0``) the returned sizes are set to zero.

    Returns a dictionary containing the final crater diameter, radius
    and depth, all in kilometres.
    """
    if diameter_km <= 0:
        return {"diameter_km": 0.0, "radius_km": 0.0, "depth_km": 0.0}

    angle_rad = math.radians(angle_deg)
    # To avoid unrealistically small vertical velocity components at shallow angles,
    # we use a minimum sine of 0.1.
    velocity_component = velocity_km_s * max(math.sin(angle_rad), 0.1)

    # Empirical constant based on impact scaling relationships
    crater_diameter_km = 1.161 * ((density / TARGET_DENSITY) ** 0.333) * (diameter_km ** 0.78) * (velocity_component ** 0.44)
    crater_radius_km = crater_diameter_km / 2.0
    crater_depth_km = crater_diameter_km * 0.2

    return {
        "diameter_km": crater_diameter_km,
        "radius_km": crater_radius_km,
        "depth_km": crater_depth_km,
    }


def simular_impacto(neo: dict) -> dict:
    """Simulate the consequences of a NEO impacting Earth.

    This function combines estimated physical properties (derived from
    the NEO record) with a typical impact velocity and angle to
    compute kinetic energy, crater size, blast radius and seismic
    magnitude.  Where available the next close approach date and
    relative velocity are taken from the NEO's orbital data.

    Returns
    -------
    dict
        A dictionary summarising the simulated impact.  Units are
        documented inline for each field.
    """
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
    distancia_km: float | None = None
    cuerpo_orbitado: str | None = None
    fecha_cercana: str | None = None

    if acercamiento:
        velocidad_km_s = to_float(acercamiento.get("relative_velocity", {}).get("kilometers_per_second")) or DEFAULT_VELOCITY_KM_S
        distancia_km = to_float(acercamiento.get("miss_distance", {}).get("kilometers"))
        cuerpo_orbitado = acercamiento.get("orbiting_body")
        fecha_cercana = acercamiento.get("close_approach_date_full") or acercamiento.get("close_approach_date")

    velocidad_m_s = velocidad_km_s * 1000
    # Full kinetic energy of the incoming object (J).
    energia_j = 0.5 * masa_kg * (velocidad_m_s ** 2)
    energia_mt = energia_j / MT_TNT_IN_JOULES

    crater = calcular_crater(diam_prom_m / 1000, densidad, velocidad_km_s, DEFAULT_IMPACT_ANGLE_DEG)

    # Approximate blast radius (km) for 5 psi overpressure.
    blast_radius_km = 0.32 * (energia_mt ** (1 / 3)) if energia_mt > 0 else 0.0
    # Moment magnitude scale for seismic shock.
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


def simulate_custom(density: float, diameter_m: float, velocity_km_s: float, angle_deg: float) -> dict:
    """Simulate an impact for an arbitrary object.

    This helper exposes the same physics as ``simular_impacto`` but
    operates on basic shape and material parameters rather than
    requiring a NEO record.  A spherical impactor of diameter
    ``diameter_m`` metres and density ``density`` kg/m³ is assumed.

    Parameters
    ----------
    density : float
        Bulk density of the impactor in kg/m³.
    diameter_m : float
        Diameter of the impactor in metres.
    velocity_km_s : float
        Impact velocity in kilometres per second.
    angle_deg : float
        Impact angle measured from the horizontal plane.  A value of
        90° corresponds to a vertical impact.

    Returns
    -------
    dict
        A dictionary with the same keys as returned by
        ``simular_impacto`` where appropriate.  Orbital approach
        information is omitted because it does not apply to this
        synthetic object.
    """
    if diameter_m <= 0 or density <= 0 or velocity_km_s <= 0:
        return {
            "diameter_avg_m": max(0.0, diameter_m),
            "mass_kg": 0.0,
            "kinetic_energy_j": 0.0,
            "kinetic_energy_mt": 0.0,
            "crater": {"diameter_km": 0.0, "radius_km": 0.0, "depth_km": 0.0},
            "blast_radius_km": 0.0,
            "seismic_magnitude": 0.0,
        }

    radius_m = diameter_m / 2.0
    volumen_m3 = (4.0 / 3.0) * math.pi * (radius_m ** 3)
    masa_kg = volumen_m3 * density

    velocidad_m_s = velocity_km_s * 1000.0
    energia_j = 0.5 * masa_kg * (velocidad_m_s ** 2)
    energia_mt = energia_j / MT_TNT_IN_JOULES

    crater = calcular_crater(diameter_m / 1000.0, density, velocity_km_s, angle_deg)
    blast_radius_km = 0.32 * (energia_mt ** (1 / 3)) if energia_mt > 0 else 0.0
    magnitud_ri = max(0.0, 0.67 * math.log10(energia_j) - 5.87) if energia_j > 0 else 0.0

    return {
        "diameter_avg_m": diameter_m,
        "mass_kg": masa_kg,
        "kinetic_energy_j": energia_j,
        "kinetic_energy_mt": energia_mt,
        "crater": crater,
        "blast_radius_km": blast_radius_km,
        "seismic_magnitude": magnitud_ri,
    }


class ChaacHandler(BaseHTTPRequestHandler):
    """HTTP request handler for ChaacImpact.

    This handler serves the simulator interface and provides a small
    JSON API for retrieving NEO data and performing custom impact
    calculations.  All responses include basic CORS headers to allow
    JavaScript running in the browser to access the API.
    """

    def _set_headers(self, status: int = 200, content_type: str = "application/json") -> None:
        """Send HTTP headers for a response.

        Parameters
        ----------
        status : int
            HTTP status code to send.
        content_type : str
            MIME type of the payload being returned.
        """
        self.send_response(status)
        # Allow any origin to access the API.  In a production setting
        # consider restricting this to trusted origins.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-type", content_type)
        self.end_headers()

    def do_OPTIONS(self) -> None:
        """Handle CORS preflight requests."""
        self._set_headers(200)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Serve the interactive page
        if path in ("/", "/index.html"):
            file_path = os.path.join(os.path.dirname(__file__), "index.html")
            try:
                with open(file_path, "rb") as f:
                    content = f.read()
                self._set_headers(200, "text/html")
                self.wfile.write(content)
            except FileNotFoundError:
                self._set_headers(404, "text/plain")
                self.wfile.write(b"index.html not found")
            return

        # Search NASA's NEO database
        if path == "/api/neo":
            query = urllib.parse.parse_qs(parsed.query)
            neo_id = query.get("id", [None])[0]
            search_q = query.get("q", [None])[0]
            if not neo_id and not search_q:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Missing 'id' or 'q' parameter"}).encode())
                return
            neo = None
            try:
                # If a numeric ID is provided, try that first
                if neo_id and neo_id.isdigit():
                    neo = buscar_por_id(neo_id)
                # If nothing found and a query is present, perform a name search
                if neo is None and search_q:
                    neo = buscar_por_id(search_q) or buscar_por_nombre(search_q)
            except requests.RequestException as e:
                self._set_headers(502)
                self.wfile.write(json.dumps({"error": f"Error contacting NASA API: {str(e)}"}).encode())
                return
            if not neo:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Asteroid not found"}).encode())
                return
            analysis = simular_impacto(neo)
            self._set_headers(200)
            self.wfile.write(json.dumps({"neo": neo, "analysis": analysis}).encode())
            return

        # Compute a custom impact via query parameters
        if path == "/api/simulate":
            query = urllib.parse.parse_qs(parsed.query)
            try:
                density = float(query.get("density", [None])[0])
                diameter_m = float(query.get("diameter_m", [None])[0])
                velocity_km_s = float(query.get("velocity_km_s", [None])[0])
                angle_deg = float(query.get("angle_deg", [None])[0])
            except (TypeError, ValueError):
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid or missing parameters"}).encode())
                return
            result = simulate_custom(density, diameter_m, velocity_km_s, angle_deg)
            self._set_headers(200)
            self.wfile.write(json.dumps(result).encode())
            return

        # If no route matched return 404
        self._set_headers(404)
        self.wfile.write(json.dumps({"error": "Not found"}).encode())

    def do_POST(self) -> None:
        # Custom impact via JSON body
        if self.path == "/api/simulate":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body)
                density = float(data.get("density"))
                diameter_m = float(data.get("diameter_m"))
                velocity_km_s = float(data.get("velocity_km_s"))
                angle_deg = float(data.get("angle_deg"))
            except (ValueError, TypeError, json.JSONDecodeError):
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON body"}).encode())
                return
            result = simulate_custom(density, diameter_m, velocity_km_s, angle_deg)
            self._set_headers(200)
            self.wfile.write(json.dumps(result).encode())
            return

        self._set_headers(404)
        self.wfile.write(json.dumps({"error": "Not found"}).encode())


def run_server(port: int = 8000) -> None:
    """Start the HTTP server and listen forever.

    The server binds to all interfaces on the given port.  Because
    ``serve_forever`` blocks indefinitely this function never
    returns.
    """
    server_address = ("0.0.0.0", port)
    httpd = HTTPServer(server_address, ChaacHandler)
    print(f"ChaacImpact server listening on http://{server_address[0]}:{server_address[1]}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    run_server()