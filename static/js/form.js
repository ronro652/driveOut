(function() {
  // ── Swap button ──
  var swapBtn = document.getElementById('swap-btn');
  if (swapBtn) {
    swapBtn.addEventListener('click', function() {
      var start = document.getElementById('start');
      var dest = document.getElementById('dest');
      if (start && dest) {
        var tmp = start.value;
        start.value = dest.value;
        dest.value = tmp;
      }
    });
  }

  // ── GPS "Use my location" ──
  var gpsBtn = document.getElementById('gps-btn');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', function() {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
      }
      gpsBtn.classList.add('loading');
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          fetch('/reverse-geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.address) {
              document.getElementById('start').value = data.address;
            } else {
              alert(data.error || 'Could not determine your address.');
            }
          })
          .catch(function() { alert('Failed to get address from location.'); })
          .finally(function() { gpsBtn.classList.remove('loading'); });
        },
        function(err) {
          gpsBtn.classList.remove('loading');
          alert('Location access denied. Please allow location access and try again.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  // ── Range slider live output ──
  var range = document.getElementById('max_drive');
  if (range) {
    var output = range.parentElement.querySelector('.range-value');
    function updateRange() {
      if (output) output.textContent = range.value + ' min';
    }
    range.addEventListener('input', updateRange);
    updateRange();
  }

  // ── Loading spinner on submit ──
  var form = document.getElementById('trip-form');
  var submitBtn = document.getElementById('submit-btn');
  if (form && submitBtn) {
    form.addEventListener('submit', function() {
      var btnText = submitBtn.querySelector('.btn-text');
      var btnSpinner = submitBtn.querySelector('.btn-spinner');
      var btnArrow = submitBtn.querySelector('.btn-arrow');
      if (btnText) btnText.textContent = 'Searching\u2026';
      if (btnSpinner) btnSpinner.removeAttribute('hidden');
      if (btnArrow) btnArrow.style.display = 'none';
      submitBtn.disabled = true;
    });
  }

  // ── Option card expand/collapse ──
  document.addEventListener('click', function(e) {
    var card = e.target.closest('.option-card[data-option-index]');
    if (!card) return;

    var wasActive = card.classList.contains('active');
    document.querySelectorAll('.option-card').forEach(function(c) {
      c.classList.remove('active');
    });
    if (!wasActive) {
      card.classList.add('active');
    }
  });
})();
