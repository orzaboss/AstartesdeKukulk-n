import requests
import json

def consultar_neo_ws():
    nasa_api_key = "Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B"  
    url_nasa = f"https://api.nasa.gov/neo/rest/v1/feed?start_date=2025-10-01&end_date=2025-10-03&api_key=Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B"
    
    response = requests.get(url_nasa)
    if response.status_code == 200:
        print("\n=== Resultados de la NASA (NEOws) ===")
        data = response.json()
     
        for date, objects in data['near_earth_objects'].items():
            print(f"\nFecha: {date}")
            print(f"Cantidad de NEOs detectados: {len(objects)}")
            print("-" * 80)
            
            for obj in objects:
                neo_id = obj['id']
                nombre = obj['name']
                neo_reference_id = obj['neo_reference_id']
                magnitud = obj['absolute_magnitude_h']
                distancia = obj['close_approach_data'][0]['miss_distance']['kilometers']
                diametro_min = obj['estimated_diameter']['kilometers']['estimated_diameter_min']
                diametro_max = obj['estimated_diameter']['kilometers']['estimated_diameter_max']
                es_peligroso = "SÍ" if obj['is_potentially_hazardous_asteroid'] else "NO"
                
                print(f"  Asteroide: {nombre}")
                print(f"    - ID NASA: {neo_id}")
                print(f"    - Referencia: {neo_reference_id}")
                print(f"    - Diámetro estimado: {diametro_min:.3f} - {diametro_max:.3f} km")
                print(f"    - Magnitud absoluta: {magnitud}")
                print(f"    - Distancia mínima: {float(distancia):,.2f} km")
                print(f"    - Potencialmente peligroso: {es_peligroso}")
                print(f"    - Más info: https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr={neo_reference_id}")
                print()
    else:
        print("Error al obtener datos de la NASA:", response.status_code)

consultar_neo_ws()