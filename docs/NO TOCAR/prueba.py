import requests
import math

def buscar_asteroide(nombre):
    api_key = "Nxvxz1N0ARXVVH9oNBdI8uQX-----------------------------tZiF9pLTdhIxD29B"  # Reemplaza con tu API Key de la NASA
    url = f"https://api.nasa.gov/neo/rest/v1/neo/browse?api_key=Nxvxz1N0ARXVVH9oNBdI8uQXtZiF9pLTdhIxD29B"
    
    response = requests.get(url)
    if response.status_code != 200:
        print("Error al obtener datos de la NASA:", response.status_code)
        return None

    data = response.json()
    
    for obj in data["near_earth_objects"]:
        if nombre.lower() in obj["name"].lower():
            diametro = (obj["estimated_diameter"]["meters"]["estimated_diameter_min"] +
                        obj["estimated_diameter"]["meters"]["estimated_diameter_max"]) / 2
            velocidad_kms = float(obj["close_approach_data"][0]["relative_velocity"]["kilometers_per_second"])
            distancia_km = float(obj["close_approach_data"][0]["miss_distance"]["kilometers"])
            return {
                "nombre": obj["name"],
                "diametro": diametro,
                "velocidad": velocidad_kms,
                "distancia": distancia_km
            }
    return None


def simular_impacto(datos, zona):
    # Constantes físicas
    densidad_meteorito = 3000  # kg/m³
    densidad_terreno = 2500    # kg/m³
    angulo_impacto = 45        # grados
    g = 9.81
    k = 1.161

    diametro = datos["diametro"]
    velocidad_kms = datos["velocidad"]
    velocidad_ms = velocidad_kms * 1000

    masa = (4/3) * math.pi * (diametro/2)**3 * densidad_meteorito
    energia = 0.5 * masa * velocidad_ms**2
    crater = k * ((densidad_meteorito / densidad_terreno)**0.333) * (diametro**0.78) * (velocidad_ms**0.44) * (g**-0.22) * (math.sin(math.radians(angulo_impacto))**(1/3))
    
    print("\n===== SIMULACIÓN DE IMPACTO =====")
    print(f"Zona de impacto: {zona}")
    print(f"Asteroide: {datos['nombre']}")
    print(f"Diámetro: {diametro:.2f} m")
    print(f"Velocidad: {velocidad_kms:.2f} km/s")
    print(f"Distancia actual: {datos['distancia']:,.0f} km")
    print(f"Energía liberada: {energia:.2e} Joules")
    print(f"Diámetro estimado del cráter: {crater:.2f} m ({crater/1000:.2f} km)")
    print("=================================\n")


def main():
    print("=== SIMULADOR DE IMPACTO DE ASTEROIDES (NASA NeoWs) ===")
    print("Ejemplos de nombres comunes: Apophis, Eros, Bennu, Ganymed, Itokawa, Didymos, etc.")
    
    nombre_asteroide = input("\nIntroduce el nombre del asteroide que quieres simular: ")
    datos = buscar_asteroide(nombre_asteroide)
    
    if datos:
        zona = input("Introduce la zona donde impactará (por ejemplo: 'Yucatán', 'Sahara', 'Pacífico'): ")
        simular_impacto(datos, zona)
    else:
        print(" No se encontró un asteroide con ese nombre en la base de datos actual.")


if __name__ == "__main__":
    main()
