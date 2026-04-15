# DriveOut: Real-time Navigation & Live Transit Plan

## Context
DriveOut is a multi-modal trip planner (drive to station + transit) that currently only plans trips — it shows results but has no navigation, no live tracking, and no real-time transit data. The goal is to turn it into a usable navigation app for Israel, with live location tracking, Google Maps navigation handoff, departure alerts, and eventually real-time transit arrivals.

**Constraints:**
- Google Maps API free tier (~$200/month credit, single user = plenty)
- Israel real-time transit: MOT SIRI API requires IP whitelisting (application needed), Open Bus Stride API is free/open
- PWA already set up (manifest.json, sw.js, installable)
- Redirect to Google Maps/Waze for driving navigation (not in-app turn-by-turn)

---

## Phase 1: Navigation Essentials (no new APIs)

### 1A. "Use My Location" button
- Add a GPS icon button next to the start address input
- Browser `navigator.geolocation.getCurrentPosition()` → send lat/lng to server
- New backend endpoint `POST /reverse-geocode` using `gmaps.reverse_geocode()`
- Fill the address input with the returned address

**Files:**
- `src/routes.py` — add `/reverse-geocode` endpoint
- `src/services.py` — add `reverse_geocode_coords(lat, lng)` function
- `templates/index.html` — add location button next to start input
- `static/js/form.js` — geolocation click handler + fetch to backend
- `static/css/style.css` — style the location button

### 1B. "Navigate" button on driving steps
- Add a navigate icon/button on every DRIVING and WALKING step
- On click → open Google Maps with directions:
  `https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&travelmode=driving`
- Data already available: each step has `start_location` and `end_location`

**Files:**
- `templates/partials/step.html` — add navigate link for DRIVING/WALKING steps
- `static/css/style.css` — style navigate button

### 1C. "Start Trip" mode
- Add a "Start Trip" button on the selected route option
- Clicking it enters **Trip Mode**:
  - Hides the form and other options
  - Shows the active route as a full-screen step-by-step view
  - Large current step display with "Next: ..." preview
  - Countdown: "Leave in X minutes" or "Depart now"
  - Navigate button for current driving step
  - "End Trip" button to return to results
- Persist trip state in `sessionStorage` so refreshing doesn't lose it

**Files:**
- `templates/index.html` — add "Start Trip" button, trip mode container
- `static/js/trip.js` (new) — trip mode logic, countdown timer, step tracking
- `static/css/style.css` — trip mode styles (full-width steps, large countdown)

### 1D. Departure countdown
- After results load, show on each option: "Leave at HH:MM" and "in X min"
- Live-updating countdown (every second)
- Based on `wait_before_min` and step start times already computed

**Files:**
- `templates/index.html` — add countdown element to option header
- `static/js/trip.js` — countdown timer logic

---

## Phase 2: Live Tracking on Map

### 2A. User location on map
- In trip mode, use `navigator.geolocation.watchPosition()` for continuous tracking
- Show blue pulsing dot on the Google Map
- Re-center map on user position (with option to stop auto-center)

### 2B. Progress tracking
- Compare user lat/lng to step waypoints
- When user is within ~200m of a step endpoint, auto-advance to next step
- Show distance + ETA to next waypoint
- Vibrate/sound when reaching a waypoint

### 2C. Route deviation detection
- If user is >500m off the expected route, show "Off route" warning
- Offer "Re-plan trip" button that re-queries from current location

**Files:**
- `static/js/map.js` — add blue dot marker, watchPosition, auto-center
- `static/js/trip.js` — proximity detection, step auto-advance, re-plan
- `static/css/style.css` — blue dot pulse animation, off-route warning

---

## Phase 3: Push Notifications

### 3A. "Remind me to leave" button
- After selecting a route, user can tap "Set reminder"
- Requests `Notification.requestPermission()` if not already granted
- Schedules a notification for `departure_time - X minutes`

### 3B. Service Worker notifications
- Use `setTimeout` in the trip.js for foreground notifications
- Use Service Worker `self.registration.showNotification()` for background
- Notification types:
  - "Time to leave in 5 minutes"
  - "Depart now — walk/drive to [station]"
  - "Your bus/train arrives in 2 minutes" (Phase 4 data)

### 3C. Background trip monitoring
- If user closes the tab but has an active trip, Service Worker continues
- Periodic sync or scheduled notification fires at the right time

**Files:**
- `static/sw.js` — add notification handlers, background trip state
- `static/js/trip.js` — notification scheduling, permission request
- `templates/index.html` — "Set reminder" button in trip mode

---

## Phase 4: Real-time Transit Data (Israel)

### 4A. Open Bus Stride API integration
- Free API at `https://open-bus-stride-api.hasadna.org.il/docs`
- Query real-time bus arrivals and delays
- No authentication required
- Show delay badges on transit steps: "On time" / "+3 min late"

### 4B. SIRI integration (requires MOT application)
- Apply for IP whitelisting with Israel Ministry of Transport
- SIRI-SM stop monitoring: query a stop ID, get real-time vehicle ETAs
- XML response → parse and show live arrival times
- This is the most accurate source but requires approval

### 4C. Live transit updates in trip mode
- During an active trip, poll every 60s for updated transit times
- If a bus/train is significantly delayed → alert user
- If a connection is missed → auto re-plan from current location

**Files:**
- `src/services.py` — add `get_realtime_arrivals(stop_id)` using Open Bus / SIRI
- `src/routes.py` — add `/api/realtime` endpoint for polling
- `static/js/trip.js` — polling logic, delay display updates
- `templates/partials/step.html` — delay badge UI

---

## Implementation Order

| Order | Task | Effort | New APIs |
|-------|------|--------|----------|
| 1 | 1B. Navigate button (Google Maps redirect) | Small | None |
| 2 | 1A. "Use my location" geolocation | Small | Reverse Geocoding |
| 3 | 1D. Departure countdown on results | Small | None |
| 4 | 1C. Start Trip mode | Medium | None |
| 5 | 2A. Live user location on map | Medium | Browser Geolocation |
| 6 | 2B. Progress tracking & step auto-advance | Medium | None |
| 7 | 3A-B. Push notifications | Medium | Notification API |
| 8 | 2C. Route deviation & re-plan | Medium | None |
| 9 | 4A. Open Bus real-time integration | Large | Open Bus Stride |
| 10 | 4B. SIRI integration | Large | MOT SIRI |

---

## Verification
- After each phase, run the Flask app and test in browser (mobile viewport)
- Phase 1: Verify navigate button opens Google Maps, geolocation fills address, countdown ticks
- Phase 2: Verify blue dot appears on map, steps auto-advance near waypoints
- Phase 3: Verify notifications fire at scheduled time (test with short delay)
- Phase 4: Verify real-time delay badges appear on transit steps
