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

  // ── Start Trip mode ──
  var tripActive = false;
  var tripOptionIndex = null;
  var watchId = null;
  var userLat = null;
  var userLng = null;

  function startLocationTracking() {
    if (!navigator.geolocation || watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      function(pos) {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        if (window.DriveOutMap) {
          window.DriveOutMap.updateUserLocation(userLat, userLng, pos.coords.accuracy);
        }
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

    // Stop live location tracking
    stopLocationTracking();
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

  // Restore trip mode from session
  var saved = sessionStorage.getItem('driveout_trip');
  if (saved) {
    try {
      var data = JSON.parse(saved);
      enterTripMode(data.index);
    } catch (e) { /* ignore */ }
  }
})();
