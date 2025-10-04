# ChaacImpact

ChaacImpact unifica el modelo de simulacion con datos reales del servicio NeoWs de la NASA. El backend (Flask) consulta asteroides, calcula su energia cinetica y proyecta crater, onda de choque y personas afectadas. El frontend (Leaflet) muestra el impacto sobre un mapa interactivo.

## Requisitos

- Python 3.10 o superior
- pip
- Cuenta de la NASA (opcional) para crear tu propia clave API

## Instalacion rapida

1. Crear un entorno virtual (opcional):
   ```shell
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # Linux / macOS
   source .venv/bin/activate
   ```
2. Instalar dependencias:
   ```shell
   pip install -r requirements.txt
   ```
3. (Opcional) Definir tu clave de la NASA:
   ```shell
   set NASA_API_KEY=TU_CLAVE
   # o export NASA_API_KEY=TU_CLAVE
   ```

## Ejecutar el backend

```shell
python app.py
```

El servicio queda disponible en `http://localhost:5000/api` y expone:

- `GET /api/test` para revisar el estado
- `GET /api/buscar-asteroide?query=` nombre o ID
- `POST /api/simular-impacto` con el asteroide y las coordenadas seleccionadas

## Usar el frontend

1. Levanta un servidor estatico simple desde la carpeta del proyecto:
   ```shell
   python -m http.server 8000
   ```
2. Abre `http://localhost:8000/index.html` en tu navegador.
3. Busca un asteroide (ejemplos: `Apophis`, `Bennu`, `433`).
4. Marca el punto de impacto en el mapa y ejecuta la simulacion.

> Puedes abrir `index.html` directamente con doble clic, pero algunos navegadores bloquean peticiones `file://` hacia `http://localhost`; un servidor estatico evita ese problema.

## Notas tecnicas

- El calculo de poblacion usa una heuristica segun latitud/longitud. Si conoces la densidad real puedes escribirla antes de simular.
- Los modelos de crater, energia y magnitud sismica se basan en escalas semi empiricas y deben tomarse como aproximaciones educativas.
- El backend intenta refrescar los datos del asteroide con la API oficial cuando recibe un ID; si la llamada falla usa los valores presentes en el payload.


