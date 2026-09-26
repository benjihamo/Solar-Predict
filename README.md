# Solar Predict v5

Mobile-first solar forecast PWA.

## v5 changes
- Uses Open-Meteo Global Tilted Irradiance (GTI) directly for each array.
- Applies each array's tilt and compass azimuth to the weather request.
- Compass azimuth in the UI: 0° north, 90° east, 180° south, 270° west.
- Uses a unique `app-v5.js` filename to avoid stale browser caching.
- Shows a visible error if the forecast request fails instead of remaining on Loading.
- Keeps the simple battery charging simulation and 31p/9p tariff settings.

## Current placeholder system values
- Pergola: 2 kWp, 30°, 180° (south)
- Garage: 1 kWp, 30°, 155° (SSE)
- Battery: 8 kWh, 50% starting SOC, 10% minimum SOC, 79% round-trip efficiency

These are editable in the app and should be replaced with measured system values during calibration.
