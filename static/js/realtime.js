(function() {
  var metaEl = document.getElementById('trip-meta');
  if (!metaEl) return;
  var meta = JSON.parse(metaEl.textContent);
  var baseTime = meta.base_time;

  // Collect transit steps from all option cards
  function getTransitSteps(card) {
    var steps = [];
    card.querySelectorAll('.step[data-transit-line]').forEach(function(el) {
      var idx = parseInt(el.getAttribute('data-step-index'), 10);
      var line = el.getAttribute('data-transit-line');
      var lat = parseFloat(el.getAttribute('data-departure-lat'));
      var lng = parseFloat(el.getAttribute('data-departure-lng'));
      var timeEl = el.querySelector('.step-time');
      var timeStr = timeEl ? timeEl.textContent.trim() : null;

      if (isNaN(lat) || isNaN(lng) || !line) return;

      // Calculate scheduled_minutes from base_time and step start_time
      var scheduledMin = 0;
      if (timeStr) {
        var parts = timeStr.split(':');
        var bt = new Date(baseTime);
        var stepDate = new Date(bt);
        stepDate.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
        scheduledMin = Math.round((stepDate - bt) / 60000);
        if (scheduledMin < 0) scheduledMin = 0;
      }

      steps.push({
        index: idx,
        line_name: line,
        departure_lat: lat,
        departure_lng: lng,
        scheduled_minutes: scheduledMin
      });
    });
    return steps;
  }

  function applyDelays(card, delays) {
    Object.keys(delays).forEach(function(idxStr) {
      var info = delays[idxStr];
      var stepEl = card.querySelector('.step[data-step-index="' + idxStr + '"]');
      if (!stepEl) return;

      var badge = stepEl.querySelector('[data-delay-badge]');
      if (!badge) return;

      badge.className = 'delay-badge';

      if (info.status === 'on_time') {
        badge.textContent = 'On time';
        badge.classList.add('on-time');
      } else if (info.status === 'late') {
        badge.textContent = '+' + info.delay_min + ' min';
        badge.classList.add('late');
      } else if (info.status === 'early') {
        badge.textContent = info.delay_min + ' min early';
        badge.classList.add('early');
      }
    });
  }

  function setLoadingBadges(card) {
    card.querySelectorAll('[data-delay-badge]').forEach(function(badge) {
      badge.className = 'delay-badge loading';
      badge.textContent = 'checking\u2026';
    });
  }

  function fetchDelays(card, callback) {
    var steps = getTransitSteps(card);
    if (steps.length === 0) {
      if (callback) callback({});
      return;
    }

    fetch('/api/realtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_time: baseTime, steps: steps })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var delays = data.delays || {};
      applyDelays(card, delays);
      if (callback) callback(delays);
    })
    .catch(function(err) {
      console.warn('Realtime fetch failed:', err);
      // Clear loading badges on error
      card.querySelectorAll('[data-delay-badge]').forEach(function(badge) {
        badge.className = 'delay-badge';
        badge.textContent = '';
      });
      if (callback) callback({});
    });
  }

  // ── Initial fetch for all visible cards ──
  document.querySelectorAll('.option-card').forEach(function(card) {
    var steps = getTransitSteps(card);
    if (steps.length > 0) {
      setLoadingBadges(card);
      fetchDelays(card);
    }
  });

  // ── Trip mode polling ──
  var pollInterval = null;
  var delayAlertEl = document.getElementById('delay-alert');

  function startPolling(card) {
    if (pollInterval) return;
    pollInterval = setInterval(function() {
      fetchDelays(card, function(delays) {
        checkForSignificantDelays(delays);
      });
    }, 60000); // Poll every 60 seconds
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (delayAlertEl) delayAlertEl.style.display = 'none';
  }

  function checkForSignificantDelays(delays) {
    if (!delayAlertEl) return;

    var worstDelay = null;
    Object.keys(delays).forEach(function(idx) {
      var d = delays[idx];
      if (d.status === 'late' && d.delay_min >= 5) {
        if (!worstDelay || d.delay_min > worstDelay.delay_min) {
          worstDelay = d;
        }
      }
    });

    if (worstDelay) {
      var msgEl = delayAlertEl.querySelector('.delay-alert-msg');
      if (msgEl) {
        msgEl.textContent = 'Line ' + worstDelay.line + ' is delayed by ' + worstDelay.delay_min + ' min';
      }
      delayAlertEl.style.display = '';
    } else {
      delayAlertEl.style.display = 'none';
    }
  }

  // Expose for trip.js to call
  window.DriveOutRealtime = {
    startPolling: startPolling,
    stopPolling: stopPolling,
    fetchDelays: fetchDelays,
    setLoadingBadges: setLoadingBadges
  };
})();
