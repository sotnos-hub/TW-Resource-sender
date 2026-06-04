// TW Resource Router - Debug Tool by Sotnos
// Quickbar: javascript:$.getScript('https://cdn.jsdelivr.net/gh/sotnos-hub/TW-Resource-sender@main/TW_Debug.js');

(function () {
  'use strict';

  if (document.getElementById('rr-debug')) {
    document.getElementById('rr-debug').remove();
  }

  var vid = window.game_data ? window.game_data.village.id : null;
  var pid = window.game_data ? window.game_data.player.id : null;

  if (!vid) { alert('No game_data found! Run this on a Tribal Wars game page.'); return; }

  // Inject panel
  var panel = document.createElement('div');
  panel.id = 'rr-debug';
  panel.style.cssText = 'position:fixed;top:50px;right:10px;width:420px;max-height:80vh;overflow-y:auto;background:#1a0d00;border:2px solid #7c4a0a;border-radius:8px;color:#d4a855;font-family:monospace;font-size:11px;z-index:99999;padding:12px;';
  panel.innerHTML = '<b style="color:#f0c060;font-size:13px;">TW Debug Tool</b> <span style="color:#5a3a10;">vid=' + vid + ' pid=' + pid + '</span>' +
    '<button onclick="document.getElementById(\'rr-debug\').remove()" style="float:right;background:#3a1e00;border:1px solid #7c4a0a;color:#f0c060;cursor:pointer;border-radius:4px;padding:2px 8px;">X</button>' +
    '<hr style="border-color:#3a2000;margin:8px 0;">' +
    '<div id="rr-dbg-btns" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;"></div>' +
    '<div id="rr-dbg-out" style="background:#0a0500;padding:8px;border-radius:4px;white-space:pre-wrap;word-break:break-all;color:#b09050;min-height:40px;">Click a test button above...</div>';
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

  // Test 1: get_groups
  btn('Test get_groups', function() {
    log('Fetching /game.php?screen=overview_villages&action=get_groups ...');
    $.ajax({ url: '/game.php?village=' + vid + '&screen=overview_villages&action=get_groups',
      success: function(d) { log('RESULT:\n' + JSON.stringify(d, null, 2)); },
      error: function(x) { log('ERROR: ' + x.status + ' ' + x.statusText); }
    });
  });

  // Test 2: get_villages no group
  btn('Test get_villages (all)', function() {
    log('Fetching get_villages (no group)...');
    $.ajax({ url: '/game.php?village=' + vid + '&screen=overview_villages&action=get_villages',
      success: function(d) { log('RESULT:\n' + JSON.stringify(d, null, 2)); },
      error: function(x) { log('ERROR: ' + x.status + ' ' + x.statusText); }
    });
  });

  // Test 3: get_villages group=0
  btn('Test get_villages group=0', function() {
    log('Fetching get_villages&group_id=0...');
    $.ajax({ url: '/game.php?village=' + vid + '&screen=overview_villages&action=get_villages&group_id=0',
      success: function(d) { log('RESULT:\n' + JSON.stringify(d, null, 2)); },
      error: function(x) { log('ERROR: ' + x.status + ' ' + x.statusText); }
    });
  });

  // Test 4: overview_villages HTML scrape
  btn('Scrape overview HTML', function() {
    log('Fetching overview_villages page HTML...');
    $.ajax({ url: '/game.php?village=' + vid + '&screen=overview_villages',
      success: function(html) {
        // Look for village links
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var links = doc.querySelectorAll('a[href*="village="]');
        var found = [];
        links.forEach(function(a) {
          var m = a.href.match(/village=(\d+)/);
          var coord = (a.textContent + ' ' + (a.closest('tr') ? a.closest('tr').textContent : '')).match(/(\d{3,})\|(\d{3,})/);
          if (m && coord && found.indexOf(m[1]) === -1) {
            found.push(m[1]);
          }
        });
        // Also look for group select
        var grpSel = doc.querySelector('select[name="group"]') || doc.querySelector('#group_id');
        var grpOptions = grpSel ? Array.from(grpSel.options).map(function(o){ return o.value + ': ' + o.text; }) : ['No group select found'];
        log('Village IDs found in HTML: ' + found.length + '\n' + found.join(', ') +
            '\n\nGroup select options:\n' + grpOptions.join('\n') +
            '\n\nRaw snippet (first 2000 chars):\n' + html.substring(0, 2000));
      },
      error: function(x) { log('ERROR: ' + x.status + ' ' + x.statusText); }
    });
  });

  // Test 5: info_player
  btn('Test info_player', function() {
    log('Fetching info_player villages...');
    $.ajax({ url: '/game.php?village=' + vid + '&screen=info_player&ajax=load_villages_for_player&player_id=' + pid,
      success: function(d) { log('RESULT:\n' + JSON.stringify(d, null, 2)); },
      error: function(x) { log('ERROR: ' + x.status + ' ' + x.statusText); }
    });
  });

  // Test 6: Check game_data
  btn('Check game_data', function() {
    var gd = window.game_data;
    log('game_data.village: ' + JSON.stringify(gd.village, null, 2) +
        '\ngame_data.player: ' + JSON.stringify(gd.player, null, 2) +
        '\ngame_data.features (keys): ' + Object.keys(gd).join(', '));
  });

  // Test 7: TWstats village list
  btn('Test TWstats endpoint', function() {
    log('Fetching /game.php?screen=overview&action=overview_villages...');
    $.ajax({ url: '/game.php?village=' + vid + '&screen=overview&action=overview_villages',
      success: function(d) { log('RESULT:\n' + JSON.stringify(d, null, 2)); },
      error: function(x) { log('ERROR: ' + x.status + ' ' + x.statusText); }
    });
  });

  // Test 8: Ally overview
  btn('Test ally/group list', function() {
    log('Fetching ally overview...');
    $.ajax({ url: '/game.php?village=' + vid + '&screen=overview_villages&mode=combined',
      success: function(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var rows = doc.querySelectorAll('table#villages_list tr, table.vis tr');
        var result = 'Rows found: ' + rows.length + '\n\n';
        rows.forEach(function(row, i) {
          if (i < 5) result += 'Row ' + i + ': ' + row.textContent.trim().substring(0, 120) + '\n';
        });
        result += '\n\nFirst 1500 chars of HTML:\n' + html.substring(0, 1500);
        log(result);
      },
      error: function(x) { log('ERROR: ' + x.status + ' ' + x.statusText); }
    });
  });

})();
