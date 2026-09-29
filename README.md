# Sunwise · Solar Predict v8

Sunwise is a mobile-first, installable solar forecast and battery planning app. It keeps the v7 forecasting engine in `app-v7.js` as a preserved baseline and runs the v8 interface from `app-v8.js`.

## Use

Serve this folder from an HTTPS static host (or `localhost` while developing), then open `index.html`. HTTPS is required by browsers for installation, offline service workers, and device location. The app fetches forecast data from Open-Meteo; forecasts need an internet connection. The shell can open offline after its first successful load.

## Setup

The first run is prefilled for a two-array 3 kWp system (2 kWp pergola and 1 kWp garage), 8 kWh battery, 79% round-trip efficiency, and 31p / 9p day and cheap rates. The initial coordinates are a UK Wirral-area example and are editable. Check the panel direction and location before relying on the estimate. The overnight charge guide uses a simple rule of thumb: first subtract typical daily household use from tomorrow’s solar forecast (not below zero), then subtract the remaining solar from battery capacity. For example, an 8 kWh battery, 6 kWh forecast solar and 2 kWh daily use suggests adding 4 kWh. The estimate is capped at battery capacity, uses round-trip efficiency for its grid and cost estimate, and does not depend on current battery charge. It uses daily totals rather than hourly household modelling or inverter control.

Settings and up to 30 calibration readings are stored in this browser only. Calibration is based on finished-day total generation and is deliberately bounded. The battery estimate is a guide and does not send commands to an inverter.

## Notes

- Per-array tilted irradiance and temperature data come from Open-Meteo.
- Solar value is a simple day-rate comparison and does not account for household demand or export payments.
- The web app is PWA-ready. A lightweight Android WebView wrapper and GitHub Actions APK/AAB build live in `android-apk/`; see its README for installation and Play upload-key setup. The wrapper loads the hosted site and needs internet access.

