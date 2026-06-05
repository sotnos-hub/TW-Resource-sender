// TW Resource Router - Debug Tool v2 by Sotnos
// Quickbar: javascript:$.getScript('https://cdn.jsdelivr.net/gh/sotnos-hub/TW-Resource-sender@main/TW_Debug.js');

(function () {
  'use strict';

  if (document.getElementById('rr-debug')) document.getElementById('rr-debug').remove();

  var vid = window.game_data ? window.game_data.village.id : null;
  if (!vid) { alert('No game_data! Run on a TW game page.'); return; }

  var panel = document.createElement('div');
  panel.id = 'rr-debug';
  panel.style.cssText = 'position:fixed;top:50px;right:10px;width:480px;max-height:85vh;overflow-y:auto;background:#1a0d00;border:2px solid #7c4a0a;border-radius:8px;color:#d4a855;font-family:monospace;font-size:11px;z-index:99999;padding:12px;';
  panel.innerHTML = '<b style="color:#f0c060;font-size:13px;">TW Market Debug v2</b> <span style="color:#5a3a10;">vid=' + vid + '</span>' +
    '<button onclick="document.getElementById(\'rr-debug\').remove()" style="float:right;background:#3a1e00;border:1px solid #7c4a0a;color:#f0c060;cursor:pointer;border-radius:4px;padding:2px 8px;">X</button>' +
    '<hr style="border-color:#3a2000;margin:8px 0;">' +
    '<div id="rr-dbg-btns" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;"></div>' +
    '<div id="rr-dbg-out" style="background:#0a0500;padding:8px;border-radius:4px;white-space:pre-wrap;word-break:break-all;color:#b09050;min-height:60px;">Click a button...</div>';
  document.body.appendChild(panel);

  var out = document.getElementById('rr-dbg-out');
  var btns = document.getElementById('rr-dbg-btns');

  function log(txt) { out.textContent = txt; }
  function btn(label, fn) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'background:#3a1e00;border:1px solid #7c4a0a;color:#f0c060;cursor:pointer;border-radius:4px;padding:3px 7px;font-size:10px;';
    b.onclick = fn;
    btns.appendChild(b);
  }

  // Test 1: Fetch market send page and show ALL form fields
  btn('Inspect market/send form', function() {
    log('Fetching market send page...');
    $.ajax({ url: '/game.php?village=' + vid + '&screen=market&mode=send',
      success: function(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var forms = doc.querySelectorAll('form');
        var result = 'Forms found: ' + forms.length + '\n\n';
        forms.forEach(function(form, fi) {
          result += '--- Form ' + fi + ' ---\n';
          result += 'action: ' + (form.action || form.getAttribute('action') || 'none') + '\n';
          result += 'method: ' + (form.method || 'none') + '\n';
          var inputs = form.querySelectorAll('input, select, textarea');
          inputs.forEach(function(inp) {
            result += '  [' + inp.type + '] name="' + inp.name + '" value="' + inp.value + '"\n';
          });
          result += '\n';
        });
        // Also show the h/csrf token
        var hMatch = html.match(/name="h" value="([^"]+)"/);
        var csrfMatch = html.match(/name="csrf[^"]*" value="([^"]+)"/i);
        var gameDataCsrf = html.match(/"csrf"\s*:\s*"([^"]+)"/);
        result += '\nToken search:\n';
        result += 'name="h": ' + (hMatch ? hMatch[1] : 'NOT FOUND') + '\n';
        result += 'name="csrf*": ' + (csrfMatch ? csrfMatch[1] : 'NOT FOUND') + '\n';
        result += 'game_data.csrf: ' + (gameDataCsrf ? gameDataCsrf[1] : 'NOT FOUND') + '\n';
        result += '\ngame_data.csrf directly: ' + (window.game_data.csrf || 'NOT FOUND') + '\n';
        log(result);
      },
      error: function(x) { log('ERROR: ' + x.status + ' ' + x.statusText); }
    });
  });

  // Test 2: Fetch market/own page
  btn('Inspect market/own form', function() {
    log('Fetching market own page...');
    $.ajax({ url: '/game.php?village=' + vid + '&screen=market&mode=own_offer',
      success: function(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var forms = doc.querySelectorAll('form');
        var result = 'Forms: ' + forms.length + '\n\n';
        forms.forEach(function(form, fi) {
          result += '--- Form ' + fi + ' action=' + (form.getAttribute('action') || 'none') + ' method=' + form.method + '\n';
          form.querySelectorAll('input,select').forEach(function(inp) {
            result += '  [' + inp.type + '] name="' + inp.name + '" value="' + (inp.value||'') + '"\n';
          });
        });
        log(result);
      },
      error: function(x) { log('ERROR ' + x.status); }
    });
  });

  // Test 3: Show game_data.csrf and market object
  btn('game_data market/csrf', function() {
    var gd = window.game_data;
    log('game_data.csrf: ' + JSON.stringify(gd.csrf) +
        '\ngame_data.market: ' + JSON.stringify(gd.market, null, 2) +
        '\ngame_data.link_base: ' + gd.link_base);
  });

  // Test 4: Try actual send with game_data.csrf token to 523|396 (1 wood only, dry approach)
  btn('Test POST to market/send (1 wood)', function() {
    if (!confirm('This will attempt to send 1 wood from current village to 523|396. OK?')) return;
    var csrf = window.game_data.csrf;
    log('Attempting POST with csrf=' + csrf + '...');
    $.ajax({
      url: '/game.php?village=' + vid + '&screen=market&mode=send',
      method: 'POST',
      data: { x: 523, y: 396, wood: 1, stone: 0, iron: 0, h: csrf, submit: 'send' },
      success: function(d) { log('POST RESPONSE (first 2000 chars):\n' + String(d).substring(0, 2000)); },
      error: function(x) { log('POST ERROR: ' + x.status + ' ' + x.statusText + '\n' + x.responseText.substring(0,500)); }
    });
  });

  // Test 5: Try with 'Versenden' submit value
  btn('Test POST submit=Versenden', function() {
    if (!confirm('This will attempt to send 1 wood. OK?')) return;
    var csrf = window.game_data.csrf;
    $.ajax({
      url: '/game.php?village=' + vid + '&screen=market&mode=send',
      method: 'POST',
      data: { x: 523, y: 396, wood: 1, stone: 0, iron: 0, h: csrf, submit: 'Versenden' },
      success: function(d) { log('POST RESPONSE:\n' + String(d).substring(0, 2000)); },
      error: function(x) { log('POST ERROR: ' + x.status + '\n' + x.responseText.substring(0,500)); }
    });
  });

  // Test 6: Check what the actual send form URL looks like in DOM right now
  btn('Check current page forms', function() {
    var forms = document.querySelectorAll('form');
    var result = 'Forms on current page: ' + forms.length + '\n\n';
    forms.forEach(function(form, fi) {
      result += '--- Form ' + fi + ' ---\n';
      result += 'action: ' + (form.getAttribute('action') || 'none') + '\n';
      result += 'method: ' + form.method + '\n';
      form.querySelectorAll('input,select').forEach(function(inp) {
        result += '  [' + inp.type + '] name="' + inp.name + '" value="' + (inp.value||'') + '"\n';
      });
      result += '\n';
    });
    log(result);
  });

  // Test 7: Show raw market send HTML (first 3000 chars)
  btn('Raw market/send HTML', function() {
    log('Fetching...');
    $.ajax({ url: '/game.php?village=' + vid + '&screen=market&mode=send',
      success: function(html) { log(html.substring(0, 3000)); },
      error: function(x) { log('ERROR ' + x.status); }
    });
  });

})();
