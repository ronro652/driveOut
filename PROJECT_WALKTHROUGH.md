# DriveOut — Project Walkthrough

## What the App Does

DriveOut solves a real-world problem: **"I want to take public transit, but the nearest station is too far to walk."** It plans multi-modal trips where you **drive (or walk) to a transit station**, then **ride transit to your destination** — or the reverse. It compares options and shows the fastest routes on an interactive map.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3, **Flask** (lightweight web framework) |
| **External APIs** | Google Maps Platform — Geocoding, Places, Distance Matrix, Directions |
| **API Client** | `googlemaps` Python SDK |
| **Templating** | **Jinja2** (server-side rendering, comes with Flask) |
| **Frontend** | Vanilla JS, CSS3 (custom properties, grid, flexbox) |
| **Maps UI** | Google Maps JavaScript API |
| **Storage** | `localStorage` (favorites) |
| **PWA** | Service Worker + Web App Manifest |
| **Deployment** | **Render.com** with **Gunicorn** (WSGI production server) |
| **Config** | `python-dotenv` for environment variables |

---

## Architecture — File by File

### Backend Layer

**`src/config.py`** — Central configuration. Loads the Google Maps API key from `.env` and defines tuning constants: max drive time (15 min), station search radius (15 km), walk threshold (3 min), ranking penalty per leg (0.15), cache size, etc.

**`src/app.py`** — Flask application factory. Creates the Flask instance, sets template/static directories, and calls `register_routes(app)`. Entry point for both development (`python app.py`) and production (`gunicorn app:app`).

**`src/routes.py`** — HTTP layer. A single route `GET/POST /` handles everything:

1. On **GET**: renders the empty form
2. On **POST**: parses form inputs, validates them, calls `_plan_trip()`, and renders results

The `_plan_trip` function orchestrates the entire trip-planning pipeline:

- Geocode both addresses
- Check for a direct drive option
- Find transit stations (near origin **or** destination, depending on search mode)
- Filter stations by drive time
- Build multi-modal route options
- Rank and return top 5

**`src/services.py`** — The core business logic. Key functions:

| Function | What it does |
|----------|-------------|
| `geocode_address()` | Converts address strings to lat/lng coordinates, with an in-memory cache |
| `find_transit_stations()` | Uses Google Places API to find transit stations within 15km |
| `filter_by_drive_time()` | Uses Distance Matrix API to batch-check drive times to all stations, keeping only those within the user's max |
| `get_direct_drive()` | Returns a "just drive" option if the destination is close enough |
| `get_transit_options()` | Gets transit routes via Google Directions API, parsing line names, vehicle types, stops, and times |
| `build_options_from_origin()` | Builds full trips: **drive to station -> wait -> transit to destination** |
| `build_options_from_dest()` | Builds reverse trips: **transit to station -> drive to destination** |
| `_rank_score()` | Scoring algorithm: `arrival_time * (1 + 0.15 * leg_count)` — faster is better, fewer transfers is better |
| `_dedup_by_closer_station()` | If two stations serve the same transit line, keeps only the closer one |
| `_make_drive_or_walk_step()` | Smart mode selection — if drive time is under 3 min, suggests walking instead |
| `_resolve_waits()` | Calculates wait times at stations using real departure epoch timestamps from the API |

### Frontend Layer

**`templates/index.html`** — The main (and only) page. Server-side rendered with Jinja2. Contains:

- Inline SVG icon sprite (driving, transit, bus, train, tram, walking, waiting icons)
- Form with address inputs, swap button, date/time pickers, search mode radio, drive time/wait sliders
- Favorites chips rendered below each input
- Results cards showing step-by-step route breakdowns
- Google Maps container

**`templates/partials/step.html`** — A Jinja2 partial/include for rendering individual route steps. Picks the right icon based on vehicle type and color-codes by travel mode.

**`static/js/map.js`** — Google Maps visualization:

- Color-coded route polylines: blue (driving), purple dashed (transit), green (walking)
- Markers at origin (A), destination (Z), and intermediate waypoints
- Click a route card to see that specific route on the map
- Sequential leg rendering to avoid API rate limits

**`static/js/favorites.js`** — localStorage-based favorites system. Save locations with custom labels, display as clickable chips, prevent duplicates.

**`static/js/form.js`** — Swap button (exchanges start/destination) and loading spinner on submit.

**`static/css/style.css`** — Dark theme UI using CSS custom properties. Responsive layout (2-column on desktop, single column on mobile). Color-coded step indicators matching map polylines.

### PWA Layer

**`static/manifest.json`** — Web App Manifest enabling "Add to Home Screen" on mobile. App name, theme color (#7c3aed purple), standalone display mode.

**`static/sw.js`** — Service Worker with a **network-first strategy** for HTML/API calls and **cache-first for static assets**. Provides basic offline support.

### Deployment

**`render.yaml`** — Infrastructure-as-code for Render.com. Defines a Python web service running `gunicorn app:app`, with the API key as an environment variable.

---

## Design Patterns & Architectural Decisions

### 1. Strategy Pattern (Search Mode)

The `search_mode` parameter (`"origin"` vs `"destination"`) switches between two different trip-building strategies — `build_options_from_origin()` vs `build_options_from_dest()`. Same interface, different algorithms.

### 2. Pipeline / Chain Pattern

The trip-planning flow in `_plan_trip()` is a clear data pipeline:

```
Geocode -> Find Stations -> Filter by Drive Time -> Build Options -> Rank -> Return Top N
```

Each stage transforms data and passes it to the next.

### 3. Caching (Memoization)

`geocode_address()` implements a manual dictionary cache (`_geocode_cache`) with a max size of 500 entries. When full, it clears entirely — a simple bounded cache to avoid unbounded memory growth.

### 4. Separation of Concerns

The backend is cleanly split into three layers:

- **`config.py`** — configuration/constants
- **`routes.py`** — HTTP handling, form parsing, validation
- **`services.py`** — pure business logic (no Flask imports, no HTTP awareness)

This means `services.py` is independently testable and could be reused with a different web framework.

### 5. Graceful Degradation

- If a station's drive time is under 3 minutes, it automatically suggests **walking** instead (`_make_drive_or_walk_step`)
- If no transit options exist, it falls back to a **direct drive** option
- If the Google API returns errors for individual stations, they're silently skipped rather than crashing

### 6. Deduplication Strategy

`_dedup_by_closer_station()` is a smart optimization — if multiple nearby stations serve the same bus/train line, it only keeps the one with the shortest drive. This prevents showing 5 nearly-identical routes from different stations on the same line.

### 7. Weighted Ranking Algorithm

`_rank_score()` uses `arrival_time * (1 + 0.15 * legs)` — this penalizes routes with more transfers even if they arrive at the same time, which matches how real commuters think (fewer transfers = less stress).

### 8. Server-Side Rendering (SSR) with Jinja2

No SPA framework — the server renders the full HTML. This is a deliberate choice:

- Simpler architecture (no build step, no client-side routing)
- Better for SEO
- Faster initial load
- The Google Maps JS API handles the interactive parts

### 9. Progressive Web App (PWA)

The manifest + service worker turn this into an installable app on mobile. The service worker uses network-first for dynamic content and cache-first for static assets — good offline resilience without stale data.

---

## Key Interview Talking Points

1. **Real-world problem solving** — This fills a gap that Google Maps itself doesn't address well (drive-to-transit trips).

2. **API orchestration** — A single trip requires 4+ Google API calls (geocode, places, distance matrix, directions), and the code manages this efficiently with batch calls (distance matrix handles all stations in one request).

3. **Smart wait-time handling** — The `threshold_wait` system is clever: if you'd wait 20 min at the station but your threshold is 5 min, it tells you to **wait 15 min at home** then leave, so you only wait 5 min at the station.

4. **Production-ready** — Environment variables, Gunicorn, Render deployment config, PWA support, input validation, error handling.

5. **No over-engineering** — Vanilla JS instead of React, server-side rendering instead of SPA, simple dictionary cache instead of Redis. The right tool for the job at the right scale.
