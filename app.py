import requests

API_KEY = "Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B"
busqueda = input("¿Qué asteroide quieres buscar? (nombre o ID): ").strip()

def mostrar_info(neo):
    print(f"\n✓ Encontrado: {neo['name']}")
    print(f"  ID (neo_reference_id): {neo['neo_reference_id']}")
    print(f"  Peligroso: {'Sí' if neo['is_potentially_hazardous_asteroid'] else 'No'}")
    diam = neo['estimated_diameter']['meters']
    print(f"  Diámetro estimado: {diam['estimated_diameter_min']:.2f}–{diam['estimated_diameter_max']:.2f} m")

if busqueda.isdigit():
    # si es ID, usa el end‑point lookup
    url = f"https://api.nasa.gov/neo/rest/v1/neo/{busqueda}"
    resp = requests.get(url, params={'api_key': API_KEY})
    if resp.status_code == 200:
        mostrar_info(resp.json())
    else:
        print("No se encontró ningún asteroide con ese ID.")
else:
    # si es nombre, recorre las páginas de browse
    page = 0
    encontrado = False
    while True:
        resp = requests.get("https://api.nasa.gov/neo/rest/v1/neo/browse",
                            params={'api_key': API_KEY, 'page': page})
        data = resp.json()
        for neo in data['near_earth_objects']:
            if busqueda.lower() in neo['name'].lower():
                mostrar_info(neo)
                encontrado = True
                break
        if encontrado or page >= data['page']['total_pages'] - 1:
            break
        page += 1
    if not encontrado:
        print(f"No se encontró el asteroide '{busqueda}'.")
