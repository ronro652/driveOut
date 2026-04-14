from datetime import datetime, timedelta

from flask import render_template, request

from config import API_KEY, DEFAULT_MAX_DRIVE_MIN, DEFAULT_THRESHOLD_WAIT_MIN, MAX_OPTIONS, get_logger

log = get_logger("routes")
from services import (
    geocode_address,
    find_transit_stations,
    filter_by_drive_time,
    get_direct_drive,
    build_options_from_origin,
    build_options_from_dest,
    _rank_score,
    _stamp_step_times,
)

FORM_DEFAULTS = {
    "start": "",
    "dest": "",
    "max_drive": DEFAULT_MAX_DRIVE_MIN,
    "departure_date": "",
    "departure_time": "",
    "search_mode": "origin",
}


def _parse_departure(date_str, time_str):
    if not date_str or not time_str:
        return None
    try:
        return datetime.strptime(f"{date_str.strip()} {time_str.strip()}", "%Y-%m-%d %H:%M")
    except ValueError:
        return None


def _read_form():
    return {key: request.form.get(key, default) for key, default in FORM_DEFAULTS.items()}


def _validate_params(saddr, daddr, md):
    if not saddr or not daddr:
        raise ValueError("Please enter both start and destination addresses.")
    if md < 1 or md > 60:
        raise ValueError("Max drive time must be between 1 and 60 minutes.")


def _plan_trip(saddr, daddr, md, th, search_mode, base_time):
    log.info("plan_trip: '%s' -> '%s', mode=%s, max_drive=%s, depart=%s", saddr, daddr, search_mode, md, base_time)
    sc = geocode_address(saddr)
    dc = geocode_address(daddr)

    direct = get_direct_drive(sc, dc, md, departure_time=base_time)

    if search_mode == "destination":
        stations = find_transit_stations(dc)
        filtered = filter_by_drive_time(dc, stations, md, departure_time=base_time)
        if not filtered and not direct:
            raise ValueError(
                "No transit stations within your max drive time from the destination. "
                "Try increasing the max drive time or choose another destination."
            )
        results = build_options_from_dest(filtered, sc, dc, max_options=MAX_OPTIONS, base_time=base_time) if filtered else []
    else:
        stations = find_transit_stations(sc)
        filtered = filter_by_drive_time(sc, stations, md, departure_time=base_time)
        if not filtered and not direct:
            raise ValueError(
                "No transit stations within your max drive time. "
                "Try increasing the max drive time or choose another start location."
            )
        results = build_options_from_origin(filtered, sc, dc, max_options=MAX_OPTIONS,
                                            threshold_wait=th, base_time=base_time) if filtered else []

    if direct:
        results.append(direct)
        results.sort(key=_rank_score)
        results = results[:MAX_OPTIONS]

    if not results:
        raise ValueError("No routes found for this trip.")

    log.info("Returning %d route options", len(results))
    for opt in results:
        arrival_dt = base_time + timedelta(minutes=opt["arrival_min"])
        opt["arrival_time"] = arrival_dt.strftime("%H:%M")
        if "start_time" not in opt["steps"][0]:
            _stamp_step_times(opt["steps"], base_time)

    map_data = None
    if results:
        map_data = {
            "origin": {"lat": sc[0], "lng": sc[1]},
            "destination": {"lat": dc[0], "lng": dc[1]},
            "api_key": API_KEY,
            "results": results,
        }

    return results, map_data


def register_routes(app):
    @app.route("/", methods=["GET", "POST"])
    def index():
        results = None
        error = None

        if request.method == "POST":
            try:
                saddr = (request.form.get("start") or "").strip()
                daddr = (request.form.get("dest") or "").strip()
                md = float(request.form.get("max_drive") or DEFAULT_MAX_DRIVE_MIN)
                th = DEFAULT_THRESHOLD_WAIT_MIN
                search_mode = request.form.get("search_mode", "origin")
                _validate_params(saddr, daddr, md)

                departure = _parse_departure(
                    request.form.get("departure_date"),
                    request.form.get("departure_time"),
                )
                base_time = departure or datetime.now()
                results, map_data = _plan_trip(saddr, daddr, md, th, search_mode, base_time)
            except ValueError as e:
                log.warning("Validation error: %s", e)
                error = str(e)
                map_data = None
            except Exception as e:
                log.exception("Unexpected error during trip planning")
                error = f"Something went wrong: {e}"
                map_data = None
        else:
            map_data = None

        form = _read_form() if request.method == "POST" else FORM_DEFAULTS.copy()

        return render_template("index.html", results=results, errors=error, form=form, map_data=map_data)
