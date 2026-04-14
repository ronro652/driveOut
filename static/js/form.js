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
