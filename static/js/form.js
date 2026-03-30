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

  // ── Loading spinner on submit ──
  var form = document.querySelector('form[action="/"]');
  var submitBtn = document.getElementById('submit-btn');
  if (form && submitBtn) {
    form.addEventListener('submit', function() {
      var btnText = submitBtn.querySelector('.btn-text');
      var btnSpinner = submitBtn.querySelector('.btn-spinner');
      if (btnText) btnText.textContent = 'Searching...';
      if (btnSpinner) btnSpinner.removeAttribute('hidden');
      submitBtn.disabled = true;
    });
  }
})();
