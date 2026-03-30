(function() {
  var STORAGE_KEY = 'driveout_favorites';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function save(favs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  }

  function addFavorite(label, address) {
    var favs = load();
    // Don't add duplicates by address
    if (favs.some(function(f) { return f.address === address; })) return;
    favs.push({ label: label, address: address });
    save(favs);
  }

  function removeFavorite(address) {
    var favs = load().filter(function(f) { return f.address !== address; });
    save(favs);
  }

  function showDialog(inputId) {
    var input = document.getElementById(inputId);
    var address = (input && input.value || '').trim();

    var overlay = document.createElement('div');
    overlay.className = 'fav-dialog-overlay';
    overlay.innerHTML =
      '<div class="fav-dialog">' +
        '<h3>Save location</h3>' +
        '<input type="text" id="fav-label" placeholder="Label (e.g. Home, Work)" autofocus>' +
        '<input type="text" id="fav-address" placeholder="Address" value="' + escapeAttr(address) + '">' +
        '<div class="fav-dialog-actions">' +
          '<button class="btn-sm btn-cancel" id="fav-cancel">Cancel</button>' +
          '<button class="btn-sm btn-save" id="fav-save">Save</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var labelInput = document.getElementById('fav-label');
    var addrInput = document.getElementById('fav-address');
    labelInput.focus();

    function close() { overlay.remove(); }

    document.getElementById('fav-cancel').addEventListener('click', close);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close();
    });

    function doSave() {
      var label = labelInput.value.trim();
      var addr = addrInput.value.trim();
      if (!label || !addr) return;
      addFavorite(label, addr);
      close();
      renderAll();
    }

    document.getElementById('fav-save').addEventListener('click', doSave);
    labelInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSave(); });
    addrInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSave(); });
  }

  function escapeAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderRow(containerId, inputId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var favs = load();
    var html = '';

    favs.forEach(function(f) {
      html +=
        '<span class="fav-chip" data-address="' + escapeAttr(f.address) + '" data-target="' + inputId + '">' +
          '<span class="fav-label">' + escapeHtml(f.label) + '</span>' +
          '<span class="fav-remove" data-address="' + escapeAttr(f.address) + '" title="Remove">&times;</span>' +
        '</span>';
    });

    html += '<span class="fav-add-chip" data-target="' + inputId + '">+ Save</span>';
    container.innerHTML = html;
  }

  function renderAll() {
    renderRow('fav-start', 'start');
    renderRow('fav-dest', 'dest');
  }

  // Event delegation
  document.addEventListener('click', function(e) {
    // Remove button
    var removeBtn = e.target.closest('.fav-remove');
    if (removeBtn) {
      e.stopPropagation();
      removeFavorite(removeBtn.getAttribute('data-address'));
      renderAll();
      return;
    }

    // Chip click -> fill input
    var chip = e.target.closest('.fav-chip');
    if (chip) {
      var targetId = chip.getAttribute('data-target');
      var input = document.getElementById(targetId);
      if (input) input.value = chip.getAttribute('data-address');
      return;
    }

    // Add button
    var addBtn = e.target.closest('.fav-add-chip');
    if (addBtn) {
      showDialog(addBtn.getAttribute('data-target'));
      return;
    }
  });

  // Initial render
  renderAll();
})();
