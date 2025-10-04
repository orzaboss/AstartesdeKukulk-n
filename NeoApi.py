import requests
import json

def consultar_neo_ws():
    nasa_api_key = "Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B"  
    url_nasa = f"https://api.nasa.gov/neo/rest/v1/feed?start_date=2025-10-01&end_date=2025-10-03&api_key={nasa_api_key}"
    
    response = requests.get(url_nasa)
    if response.status_code == 200:
        print("\n=== Resultados de la NASA (NEOws) ===")
        data = response.json()
     
        for date, objects in data['near_earth_objects'].items():
            print(f"Fecha: {date}")
            for obj in objects:
                print(f"  NEO: {obj['name']}, Magnitud: {obj['absolute_magnitude_h']}, Distancia: {obj['close_approach_data'][0]['miss_distance']['kilometers']} km")
    else:
        print("Error al obtener datos de la NASA:", response.status_code)

consultar_neo_ws()
