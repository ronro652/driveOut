import re
from datetime import datetime, timedelta

import googlemaps

from config import API_KEY, STATION_SEARCH_RADIUS_M, MAX_GEOCODE_CACHE, WALK_THRESHOLD_MIN, LEG_PENALTY

gmaps = googlemaps.Client(key=API_KEY)
_geocode_cache = {}


def _strip_html(text):
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", str(text)).strip()


def _normalize_address(addr):
    return " ".join((addr or "").strip().split()).lower()


def geocode_address(address):
    key = _normalize_address(address)
    if not key:
        raise ValueError("Start and destination addresses are required.")
    if key in _geocode_cache:
        return _geocode_cache[key]
    if len(_geocode_cache) >= MAX_GEOCODE_CACHE:
        _geocode_cache.clear()
    results = gmaps.geocode(address)
    if not results:
        raise ValueError(f"Could not find location: '{address}'")
    loc = results[0]["geometry"]["location"]
    coords = (loc["lat"], loc["lng"])
    _geocode_cache[key] = coords
    return coords


def find_transit_stations(coords, radius_m=STATION_SEARCH_RADIUS_M):
    places = gmaps.places_nearby(location=coords, radius=radius_m, type="transit_station")
    return [
        {"name": p["name"], "location": (p["geometry"]["location"]["lat"], p["geometry"]["location"]["lng"])}
        for p in places.get("results", [])
    ]


def filter_by_drive_time(origin_coords, stations, max_drive_min, departure_time=None):
    if not stations:
        return []
    max_drive_sec = max_drive_min * 60
    dep = departure_time or datetime.now()
    destinations = [s["location"] for s in stations]
    matrix = gmaps.distance_matrix(
        origins=[origin_coords],
        destinations=destinations,
        mode="driving",
        departure_time=dep,
    )
    rows = matrix.get("rows", [])
    if not rows:
        return []
    elements = rows[0].get("elements", [])
    viable = []
    for station, element in zip(stations, elements):
        if element.get("status") != "OK":
            continue
        drive_sec = element.get("duration", {}).get("value", 0)
        if drive_sec <= max_drive_sec:
            dist = element.get("distance", {}).get("value", 0)
            station["drive_distance_km"] = round(dist / 1000, 1)
            station["drive_time_min"] = round(drive_sec / 60, 1)
            viable.append(station)
    return viable


def get_direct_drive(origin_coords, dest_coords, max_drive_min, departure_time=None):
    """Return a drive-only option if origin→dest is within max_drive_min, else None."""
    dep = departure_time or datetime.now()
    matrix = gmaps.distance_matrix(
        origins=[origin_coords],
        destinations=[dest_coords],
        mode="driving",
        departure_time=dep,
    )
    rows = matrix.get("rows", [])
    if not rows:
        return None
    el = rows[0].get("elements", [{}])[0]
    if el.get("status") != "OK":
        return None
    drive_sec = el.get("duration", {}).get("value", 0)
    if drive_sec > max_drive_min * 60:
        return None
    dist_m = el.get("distance", {}).get("value", 0)
    drive_min = round(drive_sec / 60, 1)
    drive_km = round(dist_m / 1000, 1)
    return {
        "wait_before_min": 0.0,
        "station": "Direct drive",
        "total_time_min": drive_min,
        "arrival_min": drive_min,
        "steps": [{
            "instruction": "Drive directly to destination",
            "travel_mode": "DRIVING",
            "distance_km": drive_km,
            "duration_min": drive_min,
            "wait_min": 0.0,
        }],
    }


def get_walking_info(origin_coords, dest_coords):
    """Get walking distance/time between two points."""
    matrix = gmaps.distance_matrix(
        origins=[origin_coords],
        destinations=[dest_coords],
        mode="walking",
    )
    rows = matrix.get("rows", [])
    if not rows:
        return None
    el = rows[0].get("elements", [{}])[0]
    if el.get("status") != "OK":
        return None
    return {
        "distance_km": round(el["distance"]["value"] / 1000, 1),
        "duration_min": round(el["duration"]["value"] / 60, 1),
    }


def _make_drive_or_walk_step(station, origin_coords, dest_coords, instruction):
    """Create a DRIVING step, or replace with WALKING if drive is short enough."""
    if station["drive_time_min"] <= WALK_THRESHOLD_MIN:
        walk = get_walking_info(origin_coords, dest_coords)
        if walk:
            return {
                "instruction": instruction.replace("Drive", "Walk"),
                "travel_mode": "WALKING",
                "distance_km": walk["distance_km"],
                "duration_min": walk["duration_min"],
                "wait_min": 0.0,
            }, walk["duration_min"]
    return {
        "instruction": instruction,
        "travel_mode": "DRIVING",
        "distance_km": station["drive_distance_km"],
        "duration_min": station["drive_time_min"],
        "wait_min": 0.0,
    }, station["drive_time_min"]


def _parse_transit_steps(leg):
    steps = []
    for step in leg["steps"]:
        raw = step.get("html_instructions") or step.get("instructions", "")
        info = {
            "instruction": _strip_html(raw) or "Continue",
            "travel_mode": step.get("travel_mode", "TRANSIT"),
            "distance_km": round(step["distance"]["value"] / 1000, 1),
            "duration_min": round(step["duration"]["value"] / 60, 1),
        }
        if info["travel_mode"] == "TRANSIT":
            d = step.get("transit_details", {})
            line = d.get("line", {})
            info.update({
                "line_name": line.get("short_name") or line.get("name") or "Transit",
                "departure_time_epoch": d.get("departure_time", {}).get("value"),
                "arrival_time_epoch": d.get("arrival_time", {}).get("value"),
                "departure_stop": (d.get("departure_stop") or {}).get("name", ""),
                "arrival_stop": (d.get("arrival_stop") or {}).get("name", ""),
            })
        steps.append(info)
    return {
        "transit_distance_km": round(leg["distance"]["value"] / 1000, 1),
        "transit_time_min": round(leg["duration"]["value"] / 60, 1),
        "steps": steps,
    }


def get_transit_options(origin_coords, dest_coords, departure_time=None):
    start_time = departure_time or datetime.now()
    routes = gmaps.directions(
        origin=origin_coords,
        destination=dest_coords,
        mode="transit",
        departure_time=start_time,
    )
    if not routes:
        return []
    return [_parse_transit_steps(route["legs"][0]) for route in routes[:4]]


def _clean_step(step):
    sc = step.copy()
    sc.pop("departure_time_epoch", None)
    sc.pop("arrival_time_epoch", None)
    return sc


def _resolve_waits(transit_steps, cursor):
    steps = []
    for s in transit_steps:
        sc = _clean_step(s)
        wait_min = 0.0
        if sc["travel_mode"] == "TRANSIT" and s.get("departure_time_epoch"):
            dep = datetime.fromtimestamp(s["departure_time_epoch"])
            wait_min = max(round((dep - cursor).total_seconds() / 60, 1), 0.0)
            cursor = dep + timedelta(minutes=sc["duration_min"])
        else:
            cursor += timedelta(minutes=sc["duration_min"])
        sc["wait_min"] = wait_min
        steps.append(sc)
    return steps, cursor


def _count_legs(option):
    """Count transport legs only (DRIVING and TRANSIT, not WALKING or WAITING)."""
    return sum(1 for s in option["steps"] if s["travel_mode"] in ("DRIVING", "TRANSIT"))


def _rank_score(option):
    """Lower is better. Ranks by arrival time with a penalty per transport leg."""
    legs = _count_legs(option)
    arrival = option["arrival_min"]
    return arrival * (1 + LEG_PENALTY * legs)


def build_options_from_origin(stations, start_coords, dest_coords, max_options=5, threshold_wait=5, base_time=None):
    """Drive (or walk) from origin to station, then transit to destination."""
    base = base_time or datetime.now()
    all_opts = []
    for st in stations:
        move_step, move_min = _make_drive_or_walk_step(
            st, start_coords, st["location"], f"Drive to {st['name']}")
        arrival = base + timedelta(minutes=move_min)
        legs = get_transit_options(st["location"], dest_coords, departure_time=arrival)

        for leg in legs:
            first = leg["steps"][0]
            station_wait = 0.0
            if first["travel_mode"] == "TRANSIT" and first.get("departure_time_epoch"):
                dep_time = datetime.fromtimestamp(first["departure_time_epoch"])
                station_wait = max(round((dep_time - arrival).total_seconds() / 60, 1), 0.0)

            if station_wait > threshold_wait:
                wait_before = station_wait - threshold_wait
                steps = [
                    {"instruction": f"Wait at origin for {wait_before:.0f} min", "travel_mode": "WAITING",
                     "distance_km": 0, "duration_min": wait_before, "wait_min": 0.0},
                    move_step,
                    {"instruction": f"Wait at station for {threshold_wait:.0f} min", "travel_mode": "WAITING",
                     "distance_km": 0, "duration_min": threshold_wait, "wait_min": 0.0},
                ]
                for s in leg["steps"]:
                    sc = _clean_step(s)
                    sc["wait_min"] = 0.0
                    steps.append(sc)
                total = round(wait_before + move_min + threshold_wait + leg["transit_time_min"], 1)
                all_opts.append({"wait_before_min": wait_before, "station": st["name"],
                                 "total_time_min": total, "arrival_min": total, "steps": steps})
            else:
                steps = [move_step]
                resolved, cursor = _resolve_waits(leg["steps"], arrival)
                steps.extend(resolved)
                total = round((cursor - base).total_seconds() / 60, 1)
                all_opts.append({"wait_before_min": 0.0, "station": st["name"],
                                 "total_time_min": total, "arrival_min": total, "steps": steps})

    all_opts.sort(key=_rank_score)
    return all_opts[:max_options]


def build_options_from_dest(stations, start_coords, dest_coords, max_options=5, base_time=None):
    """Transit from origin to station near destination, then drive (or walk) to destination."""
    base = base_time or datetime.now()
    all_opts = []
    for st in stations:
        move_step, move_min = _make_drive_or_walk_step(
            st, st["location"], dest_coords, f"Drive from {st['name']} to destination")
        legs = get_transit_options(start_coords, st["location"], departure_time=base)

        for leg in legs:
            resolved, cursor = _resolve_waits(leg["steps"], base)
            steps = resolved + [move_step]
            total = round((cursor - base).total_seconds() / 60 + move_min, 1)
            all_opts.append({"wait_before_min": 0.0, "station": st["name"],
                             "total_time_min": total, "arrival_min": total, "steps": steps})

    all_opts.sort(key=_rank_score)
    return all_opts[:max_options]
