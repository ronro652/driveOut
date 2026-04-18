(function() {
  var metaEl = document.getElementById('trip-meta');
  if (!metaEl) return;
  var meta = JSON.parse(metaEl.textContent);
  var baseTime = new Date(meta.base_time);

  // ── Departure countdowns ──
  function updateCountdowns() {
    var now = new Date();
    document.querySelectorAll('.option-card[data-depart-time]').forEach(function(card) {
      var departStr = card.getAttribute('data-depart-time');
      if (!departStr) return;
      var parts = departStr.split(':');
      var departDate = new Date(baseTime);
      departDate.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);

      var el = card.querySelector('[data-countdown]');
      if (!el) return;

      var diffMs = departDate - now;
      var diffMin = Math.round(diffMs / 60000);

      if (diffMin <= 0) {
        el.textContent = 'Depart now';
        el.classList.add('urgent');
      } else if (diffMin <= 60) {
        el.textContent = 'Leave in ' + diffMin + ' min';
        el.classList.toggle('urgent', diffMin <= 5);
      } else {
        var h = Math.floor(diffMin / 60);
        var m = diffMin % 60;
        el.textContent = 'Leave in ' + h + 'h ' + m + 'm';
        el.classList.remove('urgent');
      }
    });
  }

  updateCountdowns();
  setInterval(updateCountdowns, 15000);

  // ── Haversine distance (meters) ──
  function haversineM(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Start Trip mode ──
  var tripActive = false;
  var tripOptionIndex = null;
  var watchId = null;
  var userLat = null;
  var userLng = null;
  var currentStepIndex = 0;
  var stepWaypoints = [];
  var WAYPOINT_RADIUS = 200; // meters

  function buildStepWaypoints() {
    stepWaypoints = [];
    var card = document.querySelector('.option-card[data-option-index="' + tripOptionIndex + '"]');
    if (!card) return;
    card.querySelectorAll('.step[data-step-index]').forEach(function(el) {
      var lat = parseFloat(el.getAttribute('data-end-lat'));
      var lng = parseFloat(el.getAttribute('data-end-lng'));
      stepWaypoints.push({
        el: el,
        endLat: isNaN(lat) ? null : lat,
        endLng: isNaN(lng) ? null : lng
      });
    });
  }

  function highlightCurrentStep() {
    stepWaypoints.forEach(function(wp, i) {
      wp.el.classList.remove('step-current', 'step-completed');
      if (i < currentStepIndex) {
        wp.el.classList.add('step-completed');
      } else if (i === currentStepIndex) {
        wp.el.classList.add('step-current');
      }
    });
  }

  function updateProgressUI(distM) {
    var progressEl = document.getElementById('trip-progress');
    var distEl = document.getElementById('trip-progress-distance');
    var etaEl = document.getElementById('trip-progress-eta');
    var fillEl = document.getElementById('trip-progress-fill');
    if (!progressEl) return;

    if (!tripActive || stepWaypoints.length === 0) {
      progressEl.style.display = 'none';
      return;
    }

    progressEl.style.display = '';

    // Distance to next waypoint
    if (distEl) {
      if (distM !== null) {
        distEl.textContent = distM < 1000
          ? Math.round(distM) + ' m to next'
          : (distM / 1000).toFixed(1) + ' km to next';
      } else {
        distEl.textContent = 'Waiting for location\u2026';
      }
    }

    // Step progress
    if (etaEl) {
      etaEl.textContent = 'Step ' + (currentStepIndex + 1) + ' / ' + stepWaypoints.length;
    }

    // Progress bar
    if (fillEl) {
      var pct = stepWaypoints.length > 0
        ? Math.round((currentStepIndex / stepWaypoints.length) * 100)
        : 0;
      fillEl.style.width = pct + '%';
    }
  }

  // ── Route deviation detection ──
  var OFF_ROUTE_THRESHOLD = 500; // meters
  var offRouteShown = false;

  function distToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var lenSq = dx * dx + dy * dy;
    var t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return haversineM(px, py, ax + t * dx, ay + t * dy);
  }

  function checkDeviation() {
    if (!tripActive || userLat === null || stepWaypoints.length === 0) return;

    var wp = stepWaypoints[currentStepIndex];
    if (!wp || wp.endLat === null) return;

    // Get start of current step (end of previous, or route origin)
    var startLat, startLng;
    if (currentStepIndex > 0 && stepWaypoints[currentStepIndex - 1].endLat !== null) {
      startLat = stepWaypoints[currentStepIndex - 1].endLat;
      startLng = stepWaypoints[currentStepIndex - 1].endLng;
    } else {
      // Use the step's own endpoint — if no prior reference, just check distance to endpoint
      startLat = wp.endLat;
      startLng = wp.endLng;
    }

    var dist = distToSegment(userLat, userLng, startLat, startLng, wp.endLat, wp.endLng);

    var warningEl = document.getElementById('off-route-warning');
    if (!warningEl) return;

    if (dist > OFF_ROUTE_THRESHOLD) {
      if (!offRouteShown) {
        warningEl.style.display = '';
        offRouteShown = true;
      }
    } else {
      if (offRouteShown) {
        warningEl.style.display = 'none';
        offRouteShown = false;
      }
    }
  }

  function advanceStep() {
    currentStepIndex++;
    // Skip past steps without location data (WAITING steps)
    while (currentStepIndex < stepWaypoints.length &&
           stepWaypoints[currentStepIndex].endLat === null) {
      currentStepIndex++;
    }
    if (currentStepIndex >= stepWaypoints.length) {
      currentStepIndex = stepWaypoints.length - 1;
    }
    // Clear off-route warning on advance
    offRouteShown = false;
    var warningEl = document.getElementById('off-route-warning');
    if (warningEl) warningEl.style.display = 'none';
    highlightCurrentStep();

    // Scroll current step into view
    var nextWp = stepWaypoints[currentStepIndex];
    if (nextWp && nextWp.el) {
      nextWp.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function checkProximity() {
    if (!tripActive || userLat === null || stepWaypoints.length === 0) return;

    var wp = stepWaypoints[currentStepIndex];
    if (!wp || wp.endLat === null) {
      updateProgressUI(null);
      return;
    }

    var dist = haversineM(userLat, userLng, wp.endLat, wp.endLng);
    updateProgressUI(dist);

    if (dist <= WAYPOINT_RADIUS) {
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
      advanceStep();
      updateProgressUI(null);
    }
  }

  function startLocationTracking() {
    if (!navigator.geolocation || watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      function(pos) {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        if (window.DriveOutMap) {
          window.DriveOutMap.updateUserLocation(userLat, userLng, pos.coords.accuracy);
        }
        checkProximity();
        checkDeviation();
      },
      function(err) {
        console.warn('Location tracking error:', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function stopLocationTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    userLat = null;
    userLng = null;
    if (window.DriveOutMap) {
      window.DriveOutMap.removeUserLocation();
    }
  }

  function enterTripMode(optionIndex) {
    var card = document.querySelector('.option-card[data-option-index="' + optionIndex + '"]');
    if (!card) return;

    tripActive = true;
    tripOptionIndex = optionIndex;
    sessionStorage.setItem('driveout_trip', JSON.stringify({ index: optionIndex }));

    // Hide everything except the active option
    document.querySelector('.card:has(#trip-form)').style.display = 'none';
    document.querySelectorAll('.option-card').forEach(function(c) {
      if (c.getAttribute('data-option-index') !== String(optionIndex)) {
        c.style.display = 'none';
      }
    });

    // Add trip-mode class for styling
    document.body.classList.add('trip-mode');

    // Make sure the active card is expanded
    card.classList.add('active');

    // Show end-trip button and center-lock button
    var endBtn = document.getElementById('end-trip-btn');
    if (endBtn) endBtn.style.display = '';
    var centerBtn = document.getElementById('center-lock-btn');
    if (centerBtn) centerBtn.style.display = '';

    // Initialize step tracking (skip leading WAITING steps)
    currentStepIndex = 0;
    buildStepWaypoints();
    while (currentStepIndex < stepWaypoints.length &&
           stepWaypoints[currentStepIndex].endLat === null) {
      currentStepIndex++;
    }
    highlightCurrentStep();
    updateProgressUI(null);

    // Start live location tracking
    startLocationTracking();
  }

  function exitTripMode() {
    tripActive = false;
    tripOptionIndex = null;
    sessionStorage.removeItem('driveout_trip');

    document.querySelector('.card:has(#trip-form)').style.display = '';
    document.querySelectorAll('.option-card').forEach(function(c) {
      c.style.display = '';
    });
    document.body.classList.remove('trip-mode');

    var endBtn = document.getElementById('end-trip-btn');
    if (endBtn) endBtn.style.display = 'none';
    var centerBtn = document.getElementById('center-lock-btn');
    if (centerBtn) centerBtn.style.display = 'none';

    // Stop live location tracking and reset progress
    stopLocationTracking();
    currentStepIndex = 0;
    stepWaypoints = [];
    var progressEl = document.getElementById('trip-progress');
    if (progressEl) progressEl.style.display = 'none';

    // Remove step highlights and off-route warning
    document.querySelectorAll('.step-current, .step-completed').forEach(function(el) {
      el.classList.remove('step-current', 'step-completed');
    });
    offRouteShown = false;
    var warningEl = document.getElementById('off-route-warning');
    if (warningEl) warningEl.style.display = 'none';
  }

  // Attach start-trip buttons
  document.querySelectorAll('.start-trip-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var card = btn.closest('.option-card');
      var idx = card ? card.getAttribute('data-option-index') : null;
      if (idx !== null) enterTripMode(idx);
    });
  });

  // End trip button
  var endBtn = document.getElementById('end-trip-btn');
  if (endBtn) {
    endBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      exitTripMode();
    });
  }

  // Center-lock toggle
  var centerBtn = document.getElementById('center-lock-btn');
  if (centerBtn) {
    centerBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isActive = centerBtn.classList.toggle('active');
      if (window.DriveOutMap) {
        window.DriveOutMap.setAutoCenter(isActive);
        // If re-enabling, immediately pan to user
        if (isActive && userLat !== null) {
          window.DriveOutMap.updateUserLocation(userLat, userLng, 50);
        }
      }
    });
  }

  // Re-plan from current location
  var replanBtn = document.getElementById('replan-btn');
  if (replanBtn) {
    replanBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (userLat === null) return;

      replanBtn.textContent = 'Re-planning\u2026';
      replanBtn.disabled = true;

      fetch('/reverse-geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: userLat, lng: userLng })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.address) {
          exitTripMode();
          var startInput = document.getElementById('start');
          if (startInput) startInput.value = data.address;
          var form = document.getElementById('trip-form');
          if (form) form.submit();
        } else {
          replanBtn.textContent = 'Re-plan trip';
          replanBtn.disabled = false;
        }
      })
      .catch(function() {
        replanBtn.textContent = 'Re-plan trip';
        replanBtn.disabled = false;
      });
    });
  }

  // Restore trip mode from session
  var saved = sessionStorage.getItem('driveout_trip');
  if (saved) {
    try {
      var data = JSON.parse(saved);
      enterTripMode(data.index);
    } catch (e) { /* ignore */ }
  }
})();
