# Sunwise · Solar Predict v8

Sunwise is a mobile-first, installable solar forecast and battery planning app. It keeps the v7 forecasting engine in `app-v7.js` as a preserved baseline and runs the v8 interface from `app-v8.js`.

## Use

Serve this folder from an HTTPS static host (or `localhost` while developing), then open `index.html`. HTTPS is required by browsers for installation, offline service workers, and device location. The app fetches forecast data from Open-Meteo; forecasts need an internet connection. The shell can open offline after its first successful load.

## Setup

The first run is prefilled for a two-array 3 kWp system (2 kWp pergola and 1 kWp garage), 8 kWh battery, 50% starting charge, 10% reserve, 79% round-trip efficiency, and 31p / 9p day and cheap rates. The initial coordinates are a UK Wirral-area example and are editable. Check the panel direction and location before relying on the estimate.

Settings and up to 30 calibration readings are stored in this browser only. Calibration is based on finished-day total generation and is deliberately bounded. The battery simulation is an estimate and does not send commands to an inverter.

## Notes

- Per-array tilted irradiance and temperature data come from Open-Meteo.
- Solar value is a simple day-rate comparison and does not account for household demand or export payments.
- No Android APK is included yet. The web app is PWA-ready; APK packaging can follow after testing on target devices and choosing a wrapper/build pipeline.

