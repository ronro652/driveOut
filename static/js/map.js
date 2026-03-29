(function() {
  var dataEl = document.getElementById('map-data');
  if (!dataEl) return;
  var mapData = JSON.parse(dataEl.textContent);
  var apiKey = mapData.api_key;
  if (!apiKey) return;

  var MODE_COLORS = {
    DRIVING: { stroke: '#3b82f6', fill: '#3b82f6', border: '#1d4ed8' },
    TRANSIT: { stroke: '#7c3aed', fill: '#7c3aed', border: '#5b21b6' },
    WALKING: { stroke: '#22c55e', fill: '#22c55e', border: '#166534' },
    WAITING: null
  };

  var gmap, dirService;
  var activeRenderers = [];
  var activeMarkers = [];

  function clearMap() {
    activeRenderers.forEach(function(r) { r.setMap(null); });
    activeRenderers = [];
    activeMarkers.forEach(function(m) { m.setMap(null); });
    activeMarkers = [];
  }

  function addMarker(position, label, color, borderColor, title) {
    var m = new google.maps.Marker({
      position: position, map: gmap, title: title,
      label: { text: label, color: 'white', fontWeight: 'bold', fontSize: '11px' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE, scale: 9,
        fillColor: color, fillOpacity: 1,
        strokeColor: borderColor, strokeWeight: 1.5
      }
    });
    activeMarkers.push(m);
  }

  function renderLeg(step, callback) {
    var colors = MODE_COLORS[step.travel_mode];
    if (!colors || !step.start_location || !step.end_location) {
      if (callback) callback();
      return;
    }
    var start = new google.maps.LatLng(step.start_location.lat, step.start_location.lng);
    var end = new google.maps.LatLng(step.end_location.lat, step.end_location.lng);

    // Transit: dashed polyline (Directions JS API is unreliable for transit)
    if (step.travel_mode === 'TRANSIT') {
      var line = new google.maps.Polyline({
        path: [start, end],
        map: gmap,
        strokeColor: colors.stroke,
        strokeWeight: 4,
        strokeOpacity: 0,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeWeight: 4, scale: 3 },
          offset: '0', repeat: '16px'
        }]
      });
      activeRenderers.push({ setMap: function(m) { line.setMap(m); } });
      if (callback) callback();
      return;
    }

    // Driving/walking: use Directions API for accurate road paths
    var travelMode = step.travel_mode === 'WALKING'
      ? google.maps.TravelMode.WALKING
      : google.maps.TravelMode.DRIVING;

    var renderer = new google.maps.DirectionsRenderer({
      map: gmap, suppressMarkers: true, preserveViewport: true,
      polylineOptions: { strokeColor: colors.stroke, strokeWeight: 5, strokeOpacity: 0.85 }
    });
    activeRenderers.push(renderer);

    dirService.route(
      { origin: start, destination: end, travelMode: travelMode },
      function(response, status) {
        if (status === 'OK') renderer.setDirections(response);
        if (callback) callback();
      }
    );
  }

  function showOption(index) {
    clearMap();
    var opt = mapData.results[index];
    if (!opt) return;

    var origin = new google.maps.LatLng(mapData.origin.lat, mapData.origin.lng);
    var dest = new google.maps.LatLng(mapData.destination.lat, mapData.destination.lng);
    var bounds = new google.maps.LatLngBounds();
    bounds.extend(origin);
    bounds.extend(dest);

    addMarker(origin, 'A', '#22c55e', '#166534', 'Start');
    addMarker(dest, String.fromCharCode(65 + Math.min(opt.steps.length, 25)), '#ef4444', '#b91c1c', 'Destination');

    var waypointLabel = 66; // 'B'
    var steps = opt.steps.filter(function(s) {
      return MODE_COLORS[s.travel_mode] && s.start_location && s.end_location;
    });

    steps.forEach(function(step, i) {
      var stepStart = new google.maps.LatLng(step.start_location.lat, step.start_location.lng);
      var stepEnd = new google.maps.LatLng(step.end_location.lat, step.end_location.lng);
      bounds.extend(stepStart);
      bounds.extend(stepEnd);

      if (i > 0 && step.travel_mode !== steps[i - 1].travel_mode) {
        var colors = MODE_COLORS[step.travel_mode];
        addMarker(stepStart, String.fromCharCode(waypointLabel++), colors.fill, colors.border,
          step.travel_mode + ' leg start');
      }
    });

    gmap.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });

    // Render each leg sequentially to avoid API rate limits
    var i = 0;
    function next() {
      if (i < steps.length) {
        renderLeg(steps[i++], next);
      }
    }
    next();

    // Highlight the active card
    document.querySelectorAll('.option-card').forEach(function(card) {
      card.classList.remove('active');
    });
    var activeCard = document.querySelector('.option-card[data-option-index="' + index + '"]');
    if (activeCard) activeCard.classList.add('active');
  }

  function initMap() {
    var origin = new google.maps.LatLng(mapData.origin.lat, mapData.origin.lng);
    gmap = new google.maps.Map(document.getElementById('map'), {
      zoom: 10,
      center: origin,
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'simplified' }] }
      ],
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true
    });
    dirService = new google.maps.DirectionsService();

    showOption(0);

    document.querySelectorAll('.option-card[data-option-index]').forEach(function(card) {
      card.addEventListener('click', function() {
        var idx = parseInt(this.getAttribute('data-option-index'), 10);
        showOption(idx);
        document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  var s = document.createElement('script');
  s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(apiKey) + '&callback=window.initDriveOutMap';
  s.async = true;
  s.defer = true;
  window.initDriveOutMap = initMap;
  document.head.appendChild(s);
})();
