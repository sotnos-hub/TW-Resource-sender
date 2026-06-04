// TW Resource Router v2.3.0 — Made by Sotnos
// Quickbar: javascript:$.getScript('https://cdn.jsdelivr.net/gh/sotnos-hub/TW-Resource-sender@main/TW_ResourceRouter.js');

(function () {
  'use strict';

  if (document.getElementById('rr-container')) {
    document.getElementById('rr-container').style.transform = 'translateX(0)';
    return;
  }

  const SCRIPT_KEY   = 'tw_resource_router_v2';
  const TRADER_CARRY = 1000;
  const LOG_MAX      = 100;

  function lsGet(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch(e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch(e) {}
  }

  let settings   = loadSettings();
  let logEntries = [];

  function loadSettings() {
    try { return JSON.parse(lsGet(SCRIPT_KEY, 'null')) || defaultSettings(); }
    catch(e) { return defaultSettings(); }
  }
  function saveSettings() { lsSet(SCRIPT_KEY, JSON.stringify(settings)); }
  function defaultSettings() {
    return {
      targetCoords:   (window.game_data && window.game_data.village) ? window.game_data.village.coord : '',
      groupId:        '0',
      reserveWood:    5000,
      reserveClay:    5000,
      reserveIron:    5000,
      sendRatio:      { wood: 33, clay: 33, iron: 34 },
      smallMarketMax: 5,
      relayThreshold: 3,
      dryRun:         true,
      autoBalance:    true,
    };
  }

  function coordToXY(coord) {
    var m = String(coord).match(/(\d+)\|(\d+)/);
    if (!m) return null;
    return { x: parseInt(m[1]), y: parseInt(m[2]) };
  }
  function distance(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }
  function addLog(msg, type) {
    type = type || 'info';
    var ts = new Date().toLocaleTimeString();
    logEntries.unshift({ ts: ts, msg: msg, type: type });
    if (logEntries.length > LOG_MAX) logEntries.pop();
    refreshLog();
  }
  function refreshLog() {
    var el = document.getElementById('rr-log-body');
    if (!el) return;
    el.innerHTML = logEntries.map(function(e) {
      return '<div class="rr-log-entry rr-log-' + e.type + '"><span class="rr-log-ts">[' + e.ts + ']</span> <span>' + e.msg + '</span></div>';
    }).join('');
  }
  function injectCSS(css) {
    var el = document.createElement('style');
    el.id = 'rr-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }
  function getCurrentVillageId() {
    return (window.game_data && window.game_data.village) ? window.game_data.village.id : null;
  }
  function getPlayerId() {
    return (window.game_data && window.game_data.player) ? window.game_data.player.id : null;
  }

  // ── Village fetching: tries multiple known TW API patterns ───────────────
  function fetchGroupVillages(groupId) {
    return new Promise(function(resolve) {
      var vid = getCurrentVillageId();
      var pid = getPlayerId();

      // Method 1: overview_villages with mode=combined (most common modern TW)
      function tryMethod1() {
        var url = '/game.php?village=' + vid + '&screen=overview_villages&mode=combined' + (groupId && groupId !== '0' ? '&group=' + groupId : '');
        $.ajax({ url: url, success: function(html) {
          var villages = parseVillagesFromHTML(html);
          if (villages.length > 0) { addLog('Villages loaded via overview HTML (' + villages.length + ')', 'info'); resolve(villages); }
          else tryMethod2();
        }, error: tryMethod2 });
      }

      // Method 2: info screen JSON action
      function tryMethod2() {
        var url = '/game.php?village=' + vid + '&screen=info_player&ajax=load_villages_for_player&player_id=' + pid;
        $.ajax({ url: url, success: function(d) {
          try {
            var p = typeof d === 'string' ? JSON.parse(d) : d;
            var list = p.villages || p.data || [];
            if (list.length > 0) {
              // Filter by group if needed
              if (groupId && groupId !== '0') list = list.filter(function(v) { return String(v.group_id) === String(groupId) || (v.groups && v.groups.indexOf(parseInt(groupId)) >= 0); });
              addLog('Villages loaded via info_player (' + list.length + ')', 'info');
              resolve(list.map(normalizeVillage));
            } else tryMethod3();
          } catch(e) { tryMethod3(); }
        }, error: tryMethod3 });
      }

      // Method 3: TWstats-style village list from overview
      function tryMethod3() {
        var url = '/game.php?village=' + vid + '&screen=overview_villages&action=get_villages&group_id=' + (groupId || '0');
        $.ajax({ url: url, success: function(d) {
          try {
            var p = typeof d === 'string' ? JSON.parse(d) : d;
            var list = p.villages || p.data || [];
            if (list.length > 0) { addLog('Villages loaded via get_villages action (' + list.length + ')', 'info'); resolve(list.map(normalizeVillage)); }
            else tryMethod4();
          } catch(e) { tryMethod4(); }
        }, error: tryMethod4 });
      }

      // Method 4: Parse the current page's village selector dropdown
      function tryMethod4() {
        addLog('Trying village selector fallback...', 'warn');
        var villages = parseVillagesFromSelector();
        if (villages.length > 0) { addLog('Villages loaded from page selector (' + villages.length + ')', 'info'); resolve(villages); }
        else tryMethod5();
      }

      // Method 5: Fetch map overview page and scrape villages
      function tryMethod5() {
        var url = '/game.php?village=' + vid + '&screen=overview';
        $.ajax({ url: url, success: function(html) {
          var villages = parseVillagesFromOverview(html);
          if (villages.length > 0) { addLog('Villages loaded from overview page (' + villages.length + ')', 'info'); resolve(villages); }
          else {
            // Last resort: just use the current village
            addLog('WARNING: Could only find current village. Check group setting.', 'warn');
            var gd = window.game_data;
            resolve([{ id: gd.village.id, name: gd.village.name, coord: gd.village.coord }]);
          }
        }, error: function() {
          addLog('WARNING: All village fetch methods failed. Using current village only.', 'warn');
          var gd = window.game_data;
          resolve([{ id: gd.village.id, name: gd.village.name, coord: gd.village.coord }]);
        }});
      }

      tryMethod1();
    });
  }

  function normalizeVillage(v) {
    // Normalize various TW API response shapes into { id, name, coord }
    var coord = v.coord || v.coordinates || (v.x && v.y ? v.x + '|' + v.y : '');
    return { id: v.id || v.village_id, name: v.name || v.village_name || ('Village ' + v.id), coord: coord };
  }

  function parseVillagesFromHTML(html) {
    // Parse village rows from overview_villages HTML table
    var villages = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');
    // Try table rows with village links
    doc.querySelectorAll('table tr').forEach(function(row) {
      var link = row.querySelector('a[href*="village="]');
      var coordEl = row.querySelector('span.village_anchor') || row.querySelector('td:nth-child(2)');
      if (link) {
        var m = link.href.match(/village=(\d+)/);
        var coordM = (row.textContent || '').match(/(\d{3,})\|(\d{3,})/);
        if (m && coordM) {
          villages.push({ id: parseInt(m[1]), name: link.textContent.trim(), coord: coordM[1] + '|' + coordM[2] });
        }
      }
    });
    return villages;
  }

  function parseVillagesFromSelector() {
    // Parse from the village dropdown that TW shows in the header
    var villages = [];
    var selectors = ['#village_switch_right select', '#menu_row select', 'select[name="village_id"]', '.village-select select'];
    for (var i = 0; i < selectors.length; i++) {
      var sel = document.querySelector(selectors[i]);
      if (sel) {
        sel.querySelectorAll('option').forEach(function(opt) {
          if (!opt.value) return;
          var coordM = (opt.textContent || '').match(/(\d{3,})\|(\d{3,})/);
          if (coordM) {
            villages.push({ id: parseInt(opt.value), name: opt.textContent.replace(/\(.*\)/, '').trim(), coord: coordM[1] + '|' + coordM[2] });
          }
        });
        if (villages.length > 0) break;
      }
    }
    return villages;
  }

  function parseVillagesFromOverview(html) {
    var villages = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');
    // Look for the village list JSON embedded in the page (TW often embeds it)
    var scripts = doc.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].textContent || '';
      // Try to find village array in JS
      var m = src.match(/villages\s*[:=]\s*(\[[\s\S]*?\])/);
      if (m) {
        try {
          var list = JSON.parse(m[1]);
          if (list.length > 0) return list.map(normalizeVillage);
        } catch(e) {}
      }
    }
    return villages;
  }

  // ── Group fetching ────────────────────────────────────────────────────────
  function getGroups() {
    return new Promise(function(resolve) {
      var vid = getCurrentVillageId();

      function tryGroupMethod1() {
        $.ajax({ url: '/game.php?village=' + vid + '&screen=overview_villages&action=get_groups',
          success: function(d) {
            try {
              var p = typeof d === 'string' ? JSON.parse(d) : d;
              var groups = p.groups || p.data || [];
              if (groups.length > 0) { resolve(groups); return; }
            } catch(e) {}
            tryGroupMethod2();
          }, error: tryGroupMethod2 });
      }

      function tryGroupMethod2() {
        // Scrape groups from the overview_villages page dropdown
        $.ajax({ url: '/game.php?village=' + vid + '&screen=overview_villages',
          success: function(html) {
            var groups = [];
            var doc = new DOMParser().parseFromString(html, 'text/html');
            // Look for group select dropdown
            var groupSel = doc.querySelector('select[name="group"]') || doc.querySelector('#group_id') || doc.querySelector('select.group_selector');
            if (groupSel) {
              groupSel.querySelectorAll('option').forEach(function(opt) {
                groups.push({ id: opt.value, group_id: opt.value, name: opt.textContent.trim() });
              });
            }
            // Also look in page scripts for group data
            if (groups.length === 0) {
              var scripts = doc.querySelectorAll('script');
              for (var i = 0; i < scripts.length; i++) {
                var src = scripts[i].textContent || '';
                var m = src.match(/groups\s*[:=]\s*(\[[\s\S]*?\])/);
                if (m) {
                  try { groups = JSON.parse(m[1]); break; } catch(e) {}
                }
              }
            }
            resolve(groups);
          }, error: function() { resolve([]); }
        });
      }

      tryGroupMethod1();
    });
  }

  // ── Market / send helpers ─────────────────────────────────────────────────
  function fetchVillageMarket(villageId) {
    return new Promise(function(resolve) {
      $.ajax({ url: '/game.php?village=' + villageId + '&screen=market&mode=send',
        success: function(html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          function txt(sel) { var el = doc.querySelector(sel); return el ? parseInt(el.textContent) || 0 : 0; }
          // Try multiple possible selectors for merchant count
          var avail = txt('#market_merchant_available_count') || txt('.market-merchant-count') || 0;
          var total = txt('#market_merchant_total') || txt('.market-merchant-total') || 0;
          // If not found in those selectors, try text search
          if (total === 0) {
            var merchantText = html.match(/(\d+)\s*\/\s*(\d+)\s*Kaufleute|(\d+)\s*\/\s*(\d+)\s*[Mm]erchants?|(\d+)\s*\/\s*(\d+)\s*[Hh]andlare/);
            if (merchantText) {
              avail = parseInt(merchantText[1] || merchantText[3] || merchantText[5]) || 0;
              total = parseInt(merchantText[2] || merchantText[4] || merchantText[6]) || 0;
            }
          }
          resolve({
            merchants_available: avail,
            merchants_total:     total,
            wood:    txt('#wood')    || txt('#current_wood'),
            clay:    txt('#stone')   || txt('#current_stone'),
            iron:    txt('#iron')    || txt('#current_iron'),
            storage: txt('#storage') || txt('#current_storage')
          });
        },
        error: function() { resolve(null); }
      });
    });
  }

  function getCsrfToken(villageId) {
    return new Promise(function(resolve) {
      $.ajax({ url: '/game.php?village=' + villageId + '&screen=market&mode=send',
        success: function(html) {
          var m = html.match(/name="h" value="([^"]+)"/);
          resolve(m ? m[1] : '');
        },
        error: function() { resolve(''); }
      });
    });
  }

  function sendResources(fromVillageId, toCoord, wood, clay, iron, token) {
    return new Promise(function(resolve, reject) {
      var target = coordToXY(toCoord);
      if (!target) return reject('Invalid target coords');
      if (settings.dryRun) {
        addLog('[DRY RUN] Would send from VID ' + fromVillageId + ' -> ' + toCoord + ': W' + wood + ' C' + clay + ' I' + iron, 'dry');
        return resolve({ dry: true });
      }
      $.ajax({ url: '/game.php?village=' + fromVillageId + '&screen=market&mode=send', method: 'POST',
        data: { x: target.x, y: target.y, wood: wood, stone: clay, iron: iron, h: token, submit: 'Versenden' },
        success: function(d) { resolve(d); }, error: reject });
    });
  }

  // ── Core routing logic ────────────────────────────────────────────────────
  async function runRouter() {
    addLog('>> Starting Resource Router v2.3.0...', 'info');
    var targetXY = coordToXY(settings.targetCoords);
    if (!targetXY) { addLog('ERROR: Invalid target coordinates!', 'error'); return; }

    addLog('Fetching villages (group: "' + (settings.groupId || 'All') + '")...', 'info');
    var villages;
    try { villages = await fetchGroupVillages(settings.groupId); }
    catch(e) { addLog('ERROR: ' + e, 'error'); return; }
    if (!villages || !villages.length) { addLog('ERROR: No villages found. Try selecting "All Villages".', 'error'); return; }
    addLog('Found ' + villages.length + ' villages.', 'info');

    addLog('Probing markets...', 'info');
    var marketData = {};
    for (var i = 0; i < villages.length; i++) {
      var v = villages[i];
      var mkt = await fetchVillageMarket(v.id);
      if (mkt) {
        marketData[v.id] = Object.assign({}, mkt, { coords: v.coord, id: v.id, name: v.name });
        addLog('  ' + v.name + ' (' + v.coord + '): ' + mkt.merchants_available + '/' + mkt.merchants_total + ' traders - W' + mkt.wood + ' C' + mkt.clay + ' I' + mkt.iron, 'info');
      } else {
        addLog('  WARNING: Could not fetch market for ' + v.name, 'warn');
      }
    }

    var bigVillages   = villages.filter(function(v) { return marketData[v.id] && marketData[v.id].merchants_total > settings.smallMarketMax; });
    var smallVillages = villages.filter(function(v) { return marketData[v.id] && marketData[v.id].merchants_total <= settings.smallMarketMax; });
    addLog('Big markets: ' + bigVillages.length + '  |  Small markets: ' + smallVillages.length, 'info');

    function computeSend(mkt, destCoord, label) {
      var avail_w  = Math.max(0, mkt.wood - settings.reserveWood);
      var avail_c  = Math.max(0, mkt.clay - settings.reserveClay);
      var avail_i  = Math.max(0, mkt.iron - settings.reserveIron);
      var capacity = mkt.merchants_available * TRADER_CARRY;
      var sw, sc, si;
      if (settings.autoBalance) {
        sw = Math.min(avail_w, Math.floor(capacity * settings.sendRatio.wood / 100));
        sc = Math.min(avail_c, Math.floor(capacity * settings.sendRatio.clay / 100));
        si = Math.min(avail_i, Math.floor(capacity * settings.sendRatio.iron / 100));
        var leftover = Math.max(0, capacity - sw - sc - si);
        if (leftover > 0) {
          var ew = Math.min(avail_w - sw, Math.floor(leftover / 3));
          var ec = Math.min(avail_c - sc, Math.floor(leftover / 3));
          var ei = Math.min(avail_i - si, leftover - ew - ec);
          sw += ew; sc += ec; si += ei;
        }
      } else {
        sw = Math.min(avail_w, Math.floor(capacity / 3));
        sc = Math.min(avail_c, Math.floor(capacity / 3));
        si = Math.min(avail_i, capacity - 2 * Math.floor(capacity / 3));
      }
      return { send_w: Math.max(0, Math.floor(sw)), send_c: Math.max(0, Math.floor(sc)), send_i: Math.max(0, Math.floor(si)), dest: destCoord, label: label };
    }

    var sendPlan = [];

    for (var b = 0; b < bigVillages.length; b++) {
      var bv = bigVillages[b]; var bm = marketData[bv.id];
      if (!bm || bm.merchants_available < 1) { addLog('  SKIP ' + bv.name + ': no traders.', 'warn'); continue; }
      var bp = computeSend(bm, settings.targetCoords, 'direct->target');
      if (bp.send_w + bp.send_c + bp.send_i < 1) { addLog('  SKIP ' + bv.name + ': nothing to send after reserves.', 'warn'); continue; }
      sendPlan.push({ village: bv, plan: bp });
    }

    for (var s = 0; s < smallVillages.length; s++) {
      var sv = smallVillages[s]; var sm = marketData[sv.id];
      if (!sm || sm.merchants_available < 1) { addLog('  SKIP ' + sv.name + ' (small): no traders.', 'warn'); continue; }
      var svXY = coordToXY(sv.coord);
      var distToTarget = distance(svXY, targetXY);
      var bestRelay = null, bestDist = Infinity;
      for (var r = 0; r < bigVillages.length; r++) {
        var rd = distance(svXY, coordToXY(bigVillages[r].coord));
        if (rd < bestDist) { bestDist = rd; bestRelay = bigVillages[r]; }
      }
      var destCoord, destLabel;
      if (!bestRelay || distToTarget <= bestDist + settings.relayThreshold) {
        destCoord = settings.targetCoords; destLabel = 'small->direct->target';
      } else {
        var rm = marketData[bestRelay.id];
        if (!rm || rm.merchants_available * TRADER_CARRY < settings.relayThreshold * TRADER_CARRY) {
          destCoord = settings.targetCoords; destLabel = 'small->direct(relay-full)->target';
        } else {
          destCoord = bestRelay.coord; destLabel = 'small->relay[' + bestRelay.name + ']->target';
        }
      }
      var sp = computeSend(sm, destCoord, destLabel);
      if (sp.send_w + sp.send_c + sp.send_i < 1) { addLog('  SKIP ' + sv.name + ': nothing to send after reserves.', 'warn'); continue; }
      sendPlan.push({ village: sv, plan: sp });
    }

    addLog('---------------------------------', 'info');
    addLog('Send Plan: ' + sendPlan.length + ' villages', 'info');
    var totalW = 0, totalC = 0, totalI = 0;

    for (var p = 0; p < sendPlan.length; p++) {
      var entry = sendPlan[p]; var ep = entry.plan;
      totalW += ep.send_w; totalC += ep.send_c; totalI += ep.send_i;
      addLog('  SEND ' + entry.village.name + ' (' + entry.village.coord + ') [' + ep.label + ']: W' + ep.send_w + ' C' + ep.send_c + ' I' + ep.send_i + ' -> ' + ep.dest, 'send');
      if (!settings.dryRun) {
        var token = await getCsrfToken(entry.village.id);
        if (!token) { addLog('    WARNING: No CSRF token for ' + entry.village.name, 'warn'); continue; }
        try {
          await sendResources(entry.village.id, ep.dest, ep.send_w, ep.send_c, ep.send_i, token);
          addLog('    OK: Sent from ' + entry.village.name, 'success');
        } catch(err) {
          addLog('    FAIL: ' + entry.village.name + ': ' + err, 'error');
        }
        await new Promise(function(r) { setTimeout(r, 700 + Math.random() * 500); });
      }
    }

    addLog('---------------------------------', 'info');
    addLog('DONE' + (settings.dryRun ? ' (DRY RUN - no real sends)' : '') + '. Total: W' + totalW + ' C' + totalC + ' I' + totalI, 'success');
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  var CSS = '#rr-container{position:fixed;top:60px;right:0;width:380px;max-height:92vh;background:linear-gradient(170deg,#1a120a 0%,#251808 60%,#1c110a 100%);border:2px solid #7c4a0a;border-right:none;border-radius:10px 0 0 10px;box-shadow:-4px 4px 20px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,180,60,.15);font-family:Georgia,"Palatino Linotype",serif;color:#d4a855;z-index:99999;display:flex;flex-direction:column;transition:transform .3s ease;}#rr-container.rr-collapsed{transform:translateX(360px);}#rr-header{background:linear-gradient(90deg,#3a1e00,#5c2e00);border-radius:8px 0 0 0;padding:9px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #7c4a0a;cursor:pointer;user-select:none;}#rr-header h2{margin:0;font-size:14px;color:#f0c060;text-shadow:0 0 8px rgba(240,160,40,.5);letter-spacing:.03em;}#rr-toggle-btn{background:none;border:none;color:#f0c060;font-size:18px;cursor:pointer;padding:0 4px;line-height:1;}#rr-body{overflow-y:auto;padding:12px 14px;flex:1;}.rr-section{margin-bottom:12px;background:rgba(0,0,0,.25);border:1px solid rgba(124,74,10,.4);border-radius:6px;padding:10px 12px;}.rr-section-title{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#b07830;margin-bottom:8px;font-weight:bold;}.rr-row{display:flex;align-items:center;margin-bottom:7px;gap:8px;}.rr-row label{font-size:12px;color:#c8903a;flex:1;}.rr-row input[type=text],.rr-row input[type=number],.rr-row select{background:#120b04;border:1px solid #6b3e0a;color:#f0c060;border-radius:4px;padding:4px 7px;font-size:12px;font-family:monospace;width:110px;outline:none;}.rr-row input:focus,.rr-row select:focus{border-color:#d4a855;}.rr-row input[type=checkbox]{accent-color:#d4a855;width:16px;height:16px;}.rr-ratio-row{display:flex;gap:8px;align-items:center;margin-bottom:6px;}.rr-ratio-row label{font-size:11px;color:#a07028;width:34px;}.rr-ratio-row input{width:54px;}#rr-run-btn{width:100%;padding:10px;background:linear-gradient(180deg,#7a3e00,#5a2800);border:1px solid #c07020;border-radius:6px;color:#f8d070;font-size:14px;font-weight:bold;font-family:Georgia,serif;letter-spacing:.06em;cursor:pointer;text-shadow:0 1px 3px rgba(0,0,0,.5);transition:background .15s,box-shadow .15s;margin-bottom:10px;}#rr-run-btn:hover{background:linear-gradient(180deg,#9a5000,#7a3800);box-shadow:0 0 12px rgba(200,120,30,.4);}#rr-run-btn:active{transform:scale(.98);}#rr-log{background:#0d0700;border:1px solid rgba(100,60,5,.5);border-radius:5px;padding:8px;max-height:200px;overflow-y:auto;font-family:"Courier New",monospace;font-size:11px;}.rr-log-entry{padding:2px 0;border-bottom:1px solid rgba(100,60,5,.2);}.rr-log-ts{color:#5a4020;margin-right:4px;}.rr-log-info{color:#b09050;}.rr-log-warn{color:#e0a030;}.rr-log-error{color:#e05030;}.rr-log-send{color:#80c0e0;}.rr-log-success{color:#60c060;}.rr-log-dry{color:#9060c0;}#rr-footer{text-align:center;font-size:10px;color:#5a3a10;padding:6px 0 8px;letter-spacing:.08em;border-top:1px solid rgba(100,60,5,.3);}#rr-footer span{color:#8a5a20;}.rr-tab-bar{display:flex;gap:2px;margin-bottom:10px;}.rr-tab{flex:1;padding:5px;text-align:center;font-size:11px;background:rgba(0,0,0,.3);border:1px solid rgba(100,60,5,.4);border-radius:4px;cursor:pointer;color:#8a6030;transition:background .15s;}.rr-tab.active{background:rgba(120,70,0,.5);color:#f0c060;border-color:#c07020;}.rr-tab-content{display:none;}.rr-tab-content.active{display:block;}#rr-collapse-hint{position:absolute;left:-28px;top:50%;transform:translateY(-50%);background:#3a1e00;border:1px solid #7c4a0a;border-right:none;border-radius:6px 0 0 6px;padding:10px 5px;cursor:pointer;color:#f0c060;font-size:14px;writing-mode:vertical-lr;user-select:none;}.rr-note{font-size:10px;color:#6a4020;margin-top:3px;}';

  // ── Build UI ──────────────────────────────────────────────────────────────
  function buildUI() {
    if (document.getElementById('rr-styles')) document.getElementById('rr-styles').remove();
    injectCSS(CSS);

    var container = document.createElement('div');
    container.id = 'rr-container';
    container.innerHTML =
      '<div id="rr-collapse-hint" title="Toggle Panel">&#9876;</div>' +
      '<div id="rr-header"><h2>&#9876; Resource Router</h2><button id="rr-toggle-btn">&#9668;</button></div>' +
      '<div id="rr-body">' +
        '<div class="rr-tab-bar">' +
          '<div class="rr-tab active" data-tab="settings">&#9881; Settings</div>' +
          '<div class="rr-tab" data-tab="log">&#128220; Log</div>' +
          '<div class="rr-tab" data-tab="help">? Help</div>' +
        '</div>' +
        '<div class="rr-tab-content active" id="rr-tab-settings">' +
          '<div class="rr-section"><div class="rr-section-title">&#127919; Target</div>' +
            '<div class="rr-row"><label>Target Coords</label><input type="text" id="rr-target" placeholder="564|417" value="' + settings.targetCoords + '"></div>' +
            '<div class="rr-row"><label>Village Group</label><select id="rr-group"><option value="0">Loading...</option></select></div>' +
            '<div class="rr-note">Select "All Villages" if groups do not appear</div>' +
          '</div>' +
          '<div class="rr-section"><div class="rr-section-title">&#127846; Reserves (keep per village)</div>' +
            '<div class="rr-row"><label>Wood</label><input type="number" id="rr-res-wood" value="' + settings.reserveWood + '" min="0"></div>' +
            '<div class="rr-row"><label>Clay</label><input type="number" id="rr-res-clay" value="' + settings.reserveClay + '" min="0"></div>' +
            '<div class="rr-row"><label>Iron</label><input type="number" id="rr-res-iron" value="' + settings.reserveIron + '" min="0"></div>' +
          '</div>' +
          '<div class="rr-section"><div class="rr-section-title">&#9878; Send Ratio (%)</div>' +
            '<div class="rr-ratio-row"><label>W</label><input type="number" id="rr-ratio-wood" value="' + settings.sendRatio.wood + '" min="0" max="100"></div>' +
            '<div class="rr-ratio-row"><label>C</label><input type="number" id="rr-ratio-clay" value="' + settings.sendRatio.clay + '" min="0" max="100"></div>' +
            '<div class="rr-ratio-row"><label>I</label><input type="number" id="rr-ratio-iron" value="' + settings.sendRatio.iron + '" min="0" max="100"></div>' +
            '<div class="rr-note">Must sum to 100. Leftover capacity auto-fills.</div>' +
          '</div>' +
          '<div class="rr-section"><div class="rr-section-title">&#128256; Relay Settings</div>' +
            '<div class="rr-row"><label>Small market limit</label><input type="number" id="rr-small-max" value="' + settings.smallMarketMax + '" min="1"></div>' +
            '<div class="rr-row"><label>Relay distance bonus</label><input type="number" id="rr-relay-thresh" value="' + settings.relayThreshold + '" min="0"></div>' +
            '<div class="rr-row"><label>Auto-balance fill</label><input type="checkbox" id="rr-auto-balance"' + (settings.autoBalance ? ' checked' : '') + '></div>' +
          '</div>' +
          '<div class="rr-section"><div class="rr-section-title">&#9881; Mode</div>' +
            '<div class="rr-row"><label>&#129514; Dry Run (no real sends)</label><input type="checkbox" id="rr-dry-run"' + (settings.dryRun ? ' checked' : '') + '></div>' +
            '<div style="font-size:10px;color:#c05050;margin-top:2px;" id="rr-dry-warning">' + (settings.dryRun ? 'DRY RUN ON - nothing will actually be sent.' : 'LIVE MODE - sends will execute!') + '</div>' +
          '</div>' +
          '<button id="rr-run-btn">&#9654; SEND RESOURCES</button>' +
        '</div>' +
        '<div class="rr-tab-content" id="rr-tab-log">' +
          '<div id="rr-log"><div id="rr-log-body" style="color:#5a4020;font-style:italic;">Log will appear here after running...</div></div>' +
          '<div style="margin-top:6px;text-align:right;"><button id="rr-clear-log" style="background:#1a0d00;border:1px solid #5a3010;color:#a06020;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px;">Clear Log</button></div>' +
        '</div>' +
        '<div class="rr-tab-content" id="rr-tab-help">' +
          '<div class="rr-section" style="font-size:11px;color:#b09050;line-height:1.7;">' +
            '<b style="color:#f0c060;">How it works:</b><br>' +
            '1. Enter target coords (e.g. 564|417).<br>' +
            '2. Choose a village group, or leave on "All Villages".<br>' +
            '3. Set reserves - each village keeps this amount.<br>' +
            '4. Set W/C/I send ratio (must sum to 100).<br>' +
            '5. Villages with traders &lt;= small market limit relay via a nearby big-market village.<br>' +
            '6. Enable Dry Run first to preview - then disable to send for real.<br>' +
            '7. Press SEND RESOURCES.<br><br>' +
            '<b style="color:#f0c060;">Tips:</b><br>' +
            '- If group dropdown is empty, select "All Villages" - the script will still find all your villages.<br>' +
            '- Check the log tab for detailed per-village results.' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="rr-footer">Made by <span>Sotnos</span> &bull; v2.3.0</div>';

    document.body.appendChild(container);
    loadGroupOptions();

    container.querySelectorAll('.rr-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        container.querySelectorAll('.rr-tab').forEach(function(t) { t.classList.remove('active'); });
        container.querySelectorAll('.rr-tab-content').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById('rr-tab-' + tab.dataset.tab).classList.add('active');
      });
    });

    function toggleCollapse() {
      container.classList.toggle('rr-collapsed');
      document.getElementById('rr-toggle-btn').textContent = container.classList.contains('rr-collapsed') ? '>' : '<';
    }
    document.getElementById('rr-toggle-btn').addEventListener('click', function(e) { e.stopPropagation(); toggleCollapse(); });
    document.getElementById('rr-collapse-hint').addEventListener('click', toggleCollapse);

    document.getElementById('rr-dry-run').addEventListener('change', function(e) {
      var el = document.getElementById('rr-dry-warning');
      el.style.color = e.target.checked ? '#c05050' : '#c08030';
      el.textContent = e.target.checked ? 'DRY RUN ON - nothing will actually be sent.' : 'LIVE MODE - sends will execute!';
    });

    document.getElementById('rr-run-btn').addEventListener('click', function() {
      collectSettings(); saveSettings();
      container.querySelectorAll('.rr-tab').forEach(function(t) { t.classList.remove('active'); });
      container.querySelectorAll('.rr-tab-content').forEach(function(t) { t.classList.remove('active'); });
      document.querySelector('[data-tab="log"]').classList.add('active');
      document.getElementById('rr-tab-log').classList.add('active');
      logEntries = [];
      runRouter();
    });

    document.getElementById('rr-clear-log').addEventListener('click', function() { logEntries = []; refreshLog(); });
  }

  function collectSettings() {
    settings.targetCoords   = document.getElementById('rr-target').value.trim();
    settings.groupId        = document.getElementById('rr-group').value;
    settings.reserveWood    = parseInt(document.getElementById('rr-res-wood').value)    || 0;
    settings.reserveClay    = parseInt(document.getElementById('rr-res-clay').value)    || 0;
    settings.reserveIron    = parseInt(document.getElementById('rr-res-iron').value)    || 0;
    settings.sendRatio.wood = parseInt(document.getElementById('rr-ratio-wood').value)  || 33;
    settings.sendRatio.clay = parseInt(document.getElementById('rr-ratio-clay').value)  || 33;
    settings.sendRatio.iron = parseInt(document.getElementById('rr-ratio-iron').value)  || 34;
    settings.smallMarketMax = parseInt(document.getElementById('rr-small-max').value)   || 5;
    settings.relayThreshold = parseInt(document.getElementById('rr-relay-thresh').value)|| 3;
    settings.autoBalance    = document.getElementById('rr-auto-balance').checked;
    settings.dryRun         = document.getElementById('rr-dry-run').checked;
  }

  async function loadGroupOptions() {
    var sel = document.getElementById('rr-group');
    sel.innerHTML = '<option value="0">-- All Villages --</option>';
    var groups = await getGroups();
    if (groups.length > 0) {
      groups.forEach(function(g) {
        var gid = g.group_id || g.id;
        if (!gid || gid === '0' || g.name === 'Alle Dörfer' || g.name === 'All villages' || g.name === 'Alla byar') return;
        var opt = document.createElement('option');
        opt.value = gid;
        opt.textContent = g.name;
        if (String(gid) === String(settings.groupId)) opt.selected = true;
        sel.appendChild(opt);
      });
      addLog('Loaded ' + groups.length + ' groups.', 'info');
    } else {
      addLog('No groups found - using All Villages mode.', 'warn');
    }
  }

  if (!window.game_data) {
    console.warn('TW Resource Router: game_data not found. Are you on a game page?');
    return;
  }
  buildUI();

})();
