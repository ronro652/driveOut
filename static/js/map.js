(function() {
  var dataEl = document.getElementById('map-data');
  if (!dataEl) return;
  var mapData = JSON.parse(dataEl.textContent);
  var apiKey = mapData.api_key;
  if (!apiKey) return;

  var MODE_COLORS = {
    DRIVING: { stroke: '#3b82f6', fill: '#3b82f6', border: '#1d4ed8' },
    TRANSIT: { stroke: '#a855f7', fill: '#a855f7', border: '#7e22ce' },
    WALKING: { stroke: '#10b981', fill: '#10b981', border: '#065f46' },
    WAITING: null
  };

  var gmap, dirService;
  var activeRenderers = [];
  var activeMarkers = [];
  var userMarker = null;
  var userAccuracyCircle = null;
  var autoCenter = true;

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

    if (step.travel_mode === 'TRANSIT') {
      var line = new google.maps.Polyline({
        path: [start, end],
        map: gmap,
        strokeColor: colors.stroke,
        strokeWeight: 4,
        strokeOpacity: 0,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, strokeWeight: 4, scale: 3 },
          offset: '0', repeat: '16px'
        }]
      });
      activeRenderers.push({ setMap: function(m) { line.setMap(m); } });
      if (callback) callback();
      return;
    }

    var travelMode = step.travel_mode === 'WALKING'
      ? google.maps.TravelMode.WALKING
      : google.maps.TravelMode.DRIVING;

    var renderer = new google.maps.DirectionsRenderer({
      map: gmap, suppressMarkers: true, preserveViewport: true,
      polylineOptions: { strokeColor: colors.stroke, strokeWeight: 5, strokeOpacity: 0.8 }
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

    addMarker(origin, 'A', '#10b981', '#065f46', 'Start');
    addMarker(dest, String.fromCharCode(65 + Math.min(opt.steps.length, 25)), '#ef4444', '#b91c1c', 'Destination');

    var waypointLabel = 66;
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

    var i = 0;
    function next() {
      if (i < steps.length) {
        renderLeg(steps[i++], next);
      }
    }
    next();
  }

  // Watch for active card changes (driven by form.js)
  function observeActiveCard() {
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.target.classList.contains('active') && m.target.hasAttribute('data-option-index')) {
          var idx = parseInt(m.target.getAttribute('data-option-index'), 10);
          showOption(idx);
          document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });

    document.querySelectorAll('.option-card[data-option-index]').forEach(function(card) {
      observer.observe(card, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function initMap() {
    var origin = new google.maps.LatLng(mapData.origin.lat, mapData.origin.lng);
    gmap = new google.maps.Map(document.getElementById('map'), {
      zoom: 10,
      center: origin,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#0f1520' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#0f1520' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1929' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
        { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] }
      ],
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true
    });
    dirService = new google.maps.DirectionsService();

    showOption(0);
    observeActiveCard();
  }

  // ── User location (blue dot) ──
  function updateUserLocation(lat, lng, accuracy) {
    if (!gmap) return;
    var pos = new google.maps.LatLng(lat, lng);

    if (!userMarker) {
      userMarker = new google.maps.Marker({
        position: pos,
        map: gmap,
        title: 'Your location',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2.5
        },
        zIndex: 999
      });
      userAccuracyCircle = new google.maps.Circle({
        map: gmap,
        center: pos,
        radius: accuracy || 50,
        fillColor: '#4285F4',
        fillOpacity: 0.1,
        strokeColor: '#4285F4',
        strokeOpacity: 0.3,
        strokeWeight: 1,
        clickable: false
      });
    } else {
      userMarker.setPosition(pos);
      userAccuracyCircle.setCenter(pos);
      userAccuracyCircle.setRadius(accuracy || 50);
    }

    if (autoCenter) {
      gmap.panTo(pos);
    }
  }

  function removeUserLocation() {
    if (userMarker) { userMarker.setMap(null); userMarker = null; }
    if (userAccuracyCircle) { userAccuracyCircle.setMap(null); userAccuracyCircle = null; }
  }

  function setAutoCenter(enabled) {
    autoCenter = enabled;
  }

  // Public API for other scripts (trip.js)
  window.DriveOutMap = {
    updateUserLocation: updateUserLocation,
    removeUserLocation: removeUserLocation,
    setAutoCenter: setAutoCenter,
    showOption: showOption,
    getMap: function() { return gmap; }
  };

  var s = document.createElement('script');
  s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(apiKey) + '&callback=window.initDriveOutMap';
  s.async = true;
  s.defer = true;
  window.initDriveOutMap = initMap;
  document.head.appendChild(s);
})();
