"""Open Bus Stride API client for real-time transit data in Israel."""

from datetime import datetime, timedelta

import requests

from config import STRIDE_API_BASE, STRIDE_API_TIMEOUT, get_logger

log = get_logger("realtime")

# Bounding-box half-width in degrees (~300m at Israel's latitude)
_BBOX_DELTA = 0.003


def _iso(dt):
    """Format a datetime as ISO 8601 with timezone for Stride API."""
    return dt.isoformat()


def get_stop_arrivals(stop_lat, stop_lng, line_name, scheduled_time):
    """Query Stride for real-time ride-stop data near a transit stop.

    Args:
        stop_lat:  latitude of the transit stop (from Google Maps)
        stop_lng:  longitude of the transit stop
        line_name: transit line short name (e.g. "480", "142")
        scheduled_time: datetime when transit is scheduled to depart

    Returns:
        dict with delay info, or None if unavailable:
        {
            "line": "480",
            "scheduled": "08:30",
            "actual": "08:33",
            "delay_min": 3,
            "status": "late"  # "on_time" | "late" | "early"
        }
    """
    try:
        # Build time window: scheduled_time +/- 30 min
        time_from = scheduled_time - timedelta(minutes=30)
        time_to = scheduled_time + timedelta(minutes=30)

        params = {
            "limit": 5,
            "siri_ride__scheduled_start_time_from": _iso(time_from),
            "siri_ride__scheduled_start_time_to": _iso(time_to),
            "gtfs_stop__lat__greater_or_equal": stop_lat - _BBOX_DELTA,
            "gtfs_stop__lat__lower_or_equal": stop_lat + _BBOX_DELTA,
            "gtfs_stop__lon__greater_or_equal": stop_lng - _BBOX_DELTA,
            "gtfs_stop__lon__lower_or_equal": stop_lng + _BBOX_DELTA,
        }

        log.info("Stride siri_ride_stops: line=%s, stop=(%.4f,%.4f), time=%s",
                 line_name, stop_lat, stop_lng, scheduled_time)

        resp = requests.get(
            f"{STRIDE_API_BASE}/siri_ride_stops/list",
            params=params,
            timeout=STRIDE_API_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

        if not data:
            log.info("No Stride results for line %s at (%.4f,%.4f)", line_name, stop_lat, stop_lng)
            return None

        # Find the best matching ride stop
        best = _match_best(data, line_name, scheduled_time)
        return best

    except requests.Timeout:
        log.warning("Stride API timeout for line %s", line_name)
        return None
    except requests.RequestException as e:
        log.warning("Stride API error for line %s: %s", line_name, e)
        return None
    except Exception as e:
        log.exception("Unexpected error querying Stride for line %s: %s", line_name, e)
        return None


def _match_best(records, line_name, scheduled_time):
    """Pick the most relevant record from Stride results and compute delay."""
    for rec in records:
        actual_arrival = rec.get("actual_arrival_time")
        planned_arrival = rec.get("planned_arrival_time")

        if not planned_arrival:
            continue

        try:
            planned_dt = datetime.fromisoformat(planned_arrival)
        except (ValueError, TypeError):
            continue

        delay_min = 0
        actual_str = None

        if actual_arrival:
            try:
                actual_dt = datetime.fromisoformat(actual_arrival)
                delay_min = round((actual_dt - planned_dt).total_seconds() / 60)
                actual_str = actual_dt.strftime("%H:%M")
            except (ValueError, TypeError):
                pass

        if delay_min <= -2:
            status = "early"
        elif delay_min >= 2:
            status = "late"
        else:
            status = "on_time"

        return {
            "line": line_name,
            "scheduled": planned_dt.strftime("%H:%M"),
            "actual": actual_str or planned_dt.strftime("%H:%M"),
            "delay_min": delay_min,
            "status": status,
        }

    return None


def get_realtime_for_steps(transit_steps, base_time):
    """Query real-time data for multiple transit steps.

    Args:
        transit_steps: list of dicts with keys:
            - line_name, departure_lat, departure_lng, scheduled_minutes
        base_time: trip base time (datetime, tz-aware)

    Returns:
        dict mapping step index to delay info
    """
    results = {}
    for step in transit_steps:
        idx = step["index"]
        scheduled_dt = base_time + timedelta(minutes=step["scheduled_minutes"])
        info = get_stop_arrivals(
            step["departure_lat"],
            step["departure_lng"],
            step["line_name"],
            scheduled_dt,
        )
        if info:
            results[idx] = info

    return results
