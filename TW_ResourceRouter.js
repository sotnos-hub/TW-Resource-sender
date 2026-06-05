// TW Resource Router v2.6.0 — Made by Sotnos
// Quickbar: javascript:$.getScript('https://cdn.jsdelivr.net/gh/sotnos-hub/TW-Resource-sender@main/TW_ResourceRouter.js?bust=' + Date.now());

(function () {
  'use strict';

  var REQUIRED_SCREEN = 'market';

  // ── Guard: must be run from the market screen ────────────────────────────
  if (!window.game_data) {
    alert('TW Resource Router: Please open this on a Tribal Wars game page.');
    return;
  }
  if (window.game_data.screen !== REQUIRED_SCREEN) {
    alert('Resource Router: Please navigate to your Market first, then run the script again.\n\n(Market → Trade → Send resources)');
    return;
  }

  if (document.getElementById('rr-container')) {
    document.getElementById('rr-container').style.transform = 'translateX(0)';
    return;
  }

  var SCRIPT_KEY   = 'tw_resource_router_v2';
  var TRADER_CARRY = 1000;
  var LOG_MAX      = 100;

  function lsGet(key, fb) { try { return localStorage.getItem(key) || fb; } catch(e) { return fb; } }
  function lsSet(key, v)  { try { localStorage.setItem(key, v); } catch(e) {} }

  var settings   = loadSettings();
  var logEntries = [];

  function loadSettings() {
    try { return JSON.parse(lsGet(SCRIPT_KEY, 'null')) || defaultSettings(); }
    catch(e) { return defaultSettings(); }
  }
  function saveSettings() { lsSet(SCRIPT_KEY, JSON.stringify(settings)); }
  function defaultSettings() {
    return {
      targetCoords:   window.game_data.village.coord,
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
  function csrf() { return window.game_data.csrf; }
  function getCurrentVillageId() { return window.game_data.village.id; }

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

  // ── Village fetching: scrape overview_villages HTML ───────────────────────
  function fetchAllVillages() {
    return new Promise(function(resolve) {
      var vid = getCurrentVillageId();
      addLog('Loading village list...', 'info');

      $.ajax({
        url: '/game.php?village=' + vid + '&screen=overview_villages',
        success: function(html) {
          var villages = scrapeVillageTable(html);
          if (villages.length > 0) {
            addLog('Found ' + villages.length + ' villages.', 'info');
            resolve(villages);
          } else {
            // Fallback: combined mode
            $.ajax({
              url: '/game.php?village=' + vid + '&screen=overview_villages&mode=combined',
              success: function(html2) {
                var v2 = scrapeVillageTable(html2);
                if (v2.length > 0) {
                  addLog('Found ' + v2.length + ' villages (combined mode).', 'info');
                  resolve(v2);
                } else {
                  addLog('WARN: Only found current village.', 'warn');
                  resolve([{ id: window.game_data.village.id, name: window.game_data.village.name, coord: window.game_data.village.coord }]);
                }
              },
              error: function() {
                resolve([{ id: window.game_data.village.id, name: window.game_data.village.name, coord: window.game_data.village.coord }]);
              }
            });
          }
        },
        error: function() {
          resolve([{ id: window.game_data.village.id, name: window.game_data.village.name, coord: window.game_data.village.coord }]);
        }
      });
    });
  }

  function scrapeVillageTable(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var villages = [];
    var seen = {};
    doc.querySelectorAll('a[href*="village="]').forEach(function(a) {
      var hrefM = (a.getAttribute('href') || '').match(/[?&]village=(\d+)/);
      if (!hrefM) return;
      var vid = parseInt(hrefM[1]);
      if (seen[vid]) return;
      var texts = [a.textContent];
      var el = a.parentElement;
      for (var i = 0; i < 4 && el; i++) { texts.push(el.textContent); el = el.parentElement; }
      var coord = null;
      for (var t = 0; t < texts.length; t++) {
        var cm = texts[t].match(/(\d{3})\|(\d{3})/);
        if (cm) { coord = cm[1] + '|' + cm[2]; break; }
      }
      if (!coord) return;
      var name = a.textContent.replace(/\(\d+\|\d+\).*/, '').trim() || ('Village ' + vid);
      seen[vid] = true;
      villages.push({ id: vid, name: name, coord: coord });
    });
    return villages;
  }

  // ── Market data: fetch send page, parse merchants + resources ─────────────
  // Debug showed: hidden field with no name = 138000 (this is the storage/max merchants calc)
  // Merchants shown as "X/Y" in the page, resources from game_data embedded in page
  function fetchVillageMarket(villageId) {
    return new Promise(function(resolve) {
      $.ajax({
        url: '/game.php?village=' + villageId + '&screen=market&mode=send',
        success: function(html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');

          // ── Resources: read from embedded game_data in the fetched page ──
          var wood = 0, clay = 0, iron = 0, storage = 0;
          var gdMatch = html.match(/TribalWars\.updateGameData\((\{[\s\S]*?\})\);/);
          if (gdMatch) {
            try {
              var gd = JSON.parse(gdMatch[1]);
              if (gd.village) {
                wood    = Math.floor(gd.village.wood_float  || gd.village.wood  || 0);
                clay    = Math.floor(gd.village.stone_float || gd.village.stone || 0);
                iron    = Math.floor(gd.village.iron_float  || gd.village.iron  || 0);
                storage = gd.village.storage_max || 0;
              }
            } catch(e) {}
          }

          // ── Merchant count: look for "X/Y" pattern near merchant text ──
          // The page shows available/total in format like "35/35" or "1/35"
          var avail = 0, total = 0;

          // Method A: look for the merchant display element
          var merchantEl = doc.querySelector('.market-merchant-count, #market_merchant_available_count, .merchantCount');
          if (merchantEl) {
            var mtext = merchantEl.textContent.trim();
            var mm = mtext.match(/(\d+)\s*\/\s*(\d+)/);
            if (mm) { avail = parseInt(mm[1]); total = parseInt(mm[2]); }
          }

          // Method B: scan all text nodes for "X/Y" near the word merchant
          if (total === 0) {
            var bodyHtml = doc.body ? doc.body.innerHTML : html;
            // Find merchant count pattern - TW shows it as digits/digits
            var merchantSection = bodyHtml.match(/merchant[^<]{0,300}/i);
            if (merchantSection) {
              var mm2 = merchantSection[0].match(/(\d+)\s*\/\s*(\d+)/);
              if (mm2) { avail = parseInt(mm2[1]); total = parseInt(mm2[2]); }
            }
          }

          // Method C: look for the hidden input with large value (trader capacity)
          // Debug showed: [hidden] name="" value="138000" — this is max_capacity = total_traders * 1000 * something
          // Also try scanning all text for a fraction
          if (total === 0) {
            var allText = doc.body ? doc.body.textContent : '';
            var fractions = allText.match(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/g);
            if (fractions) {
              // The merchant count will be a reasonable number like 0/35, 23/114 etc.
              for (var fi = 0; fi < fractions.length; fi++) {
                var parts = fractions[fi].match(/(\d+)\s*\/\s*(\d+)/);
                if (parts) {
                  var a2 = parseInt(parts[1]), t2 = parseInt(parts[2]);
                  // Sanity check: merchants are between 0-200, available <= total
                  if (t2 > 0 && t2 <= 500 && a2 <= t2) {
                    avail = a2; total = t2; break;
                  }
                }
              }
            }
          }

          resolve({ merchants_available: avail, merchants_total: total, wood: wood, clay: clay, iron: iron, storage: storage });
        },
        error: function() { resolve(null); }
      });
    });
  }

  // ── Send resources: 2-step process on this TW server ─────────────────────
  // Step 1: POST to &try=confirm_send — returns confirmation page
  // Step 2: POST the confirmation form to actually send
  // The CSRF token goes in the URL as &h=TOKEN, not as a form field
  function sendResources(fromVillageId, toCoord, wood, clay, iron) {
    return new Promise(function(resolve, reject) {
      var target = coordToXY(toCoord);
      if (!target) return reject('Invalid coords: ' + toCoord);

      if (settings.dryRun) {
        addLog('[DRY RUN] VID:' + fromVillageId + ' -> ' + toCoord + ': W' + wood + ' C' + clay + ' I' + iron, 'dry');
        return resolve({ dry: true });
      }

      var h = csrf();
      var baseUrl = '/game.php?village=' + fromVillageId + '&screen=market&mode=send&h=' + h;

      // Step 1: Submit the send form to get confirmation page
      $.ajax({
        url: baseUrl + '&try=confirm_send',
        method: 'POST',
        data: {
          wood:        wood,
          stone:       clay,
          iron:        iron,
          x:           target.x,
          y:           target.y,
          target_type: 'coord'
        },
        success: function(html) {
          // Step 2: Parse confirmation page and submit it
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var confirmForm = doc.querySelector('form');
          if (!confirmForm) {
            // No confirm form = might have sent directly, or error
            // Check if it contains an error message
            var bodyText = doc.body ? doc.body.textContent : html;
            if (bodyText.indexOf('error') > -1 || bodyText.indexOf('Error') > -1) {
              return reject('Server error on step 1: ' + bodyText.substring(0, 200));
            }
            // Some versions send directly without confirm step
            addLog('    Note: No confirm form found, assuming direct send.', 'info');
            return resolve({ direct: true });
          }

          // Gather all hidden fields from the confirm form
          var confirmData = {};
          confirmForm.querySelectorAll('input').forEach(function(inp) {
            if (inp.name) confirmData[inp.name] = inp.value;
          });

          // Get confirm form action URL
          var confirmAction = confirmForm.getAttribute('action') || (baseUrl + '&action=send');

          // Step 2: Submit confirmation
          $.ajax({
            url: confirmAction.indexOf('http') === 0 ? confirmAction : confirmAction,
            method: 'POST',
            data: confirmData,
            success: function(d) { resolve({ confirmed: true, response: d }); },
            error: function(x) { reject('Confirm POST failed: ' + x.status); }
          });
        },
        error: function(x) { reject('Step 1 POST failed: ' + x.status); }
      });
    });
  }

  // ── Core routing ──────────────────────────────────────────────────────────
  async function runRouter() {
    addLog('>> Resource Router v2.6.0 starting...', 'info');

    var targetXY = coordToXY(settings.targetCoords);
    if (!targetXY) { addLog('ERROR: Invalid target coordinates!', 'error'); return; }
    addLog('Target: ' + settings.targetCoords, 'info');

    var villages = await fetchAllVillages();
    if (!villages || villages.length === 0) { addLog('ERROR: No villages found.', 'error'); return; }

    addLog('Probing ' + villages.length + ' village markets (this takes a moment)...', 'info');
    var marketData = {};
    for (var i = 0; i < villages.length; i++) {
      var v = villages[i];
      var mkt = await fetchVillageMarket(v.id);
      if (mkt) {
        marketData[v.id] = Object.assign({}, mkt, { id: v.id, name: v.name, coord: v.coord });
        var traderStr = mkt.merchants_available + '/' + mkt.merchants_total;
        if (mkt.merchants_total === 0) traderStr = '?/? (could not read)';
        addLog('  ' + v.name + ' (' + v.coord + '): ' + traderStr + ' traders | W' + mkt.wood + ' C' + mkt.clay + ' I' + mkt.iron, 'info');
      } else {
        addLog('  WARN: No market data for ' + v.name, 'warn');
      }
    }

    var bigVillages   = villages.filter(function(v) { return marketData[v.id] && marketData[v.id].merchants_total > settings.smallMarketMax; });
    var smallVillages = villages.filter(function(v) { return marketData[v.id] && marketData[v.id].merchants_total > 0 && marketData[v.id].merchants_total <= settings.smallMarketMax; });
    var unknownVillages = villages.filter(function(v) { return marketData[v.id] && marketData[v.id].merchants_total === 0; });
    addLog('Big markets: ' + bigVillages.length + ' | Small: ' + smallVillages.length + ' | Unreadable: ' + unknownVillages.length, 'info');

    function computeSend(mkt, destCoord, label) {
      var aw = Math.max(0, mkt.wood - settings.reserveWood);
      var ac = Math.max(0, mkt.clay - settings.reserveClay);
      var ai = Math.max(0, mkt.iron - settings.reserveIron);
      var cap = mkt.merchants_available * TRADER_CARRY;
      if (cap <= 0) return null;
      var sw, sc, si;
      if (settings.autoBalance) {
        sw = Math.min(aw, Math.floor(cap * settings.sendRatio.wood / 100));
        sc = Math.min(ac, Math.floor(cap * settings.sendRatio.clay / 100));
        si = Math.min(ai, Math.floor(cap * settings.sendRatio.iron / 100));
        var left = Math.max(0, cap - sw - sc - si);
        if (left > 0) {
          sw += Math.min(aw - sw, Math.floor(left / 3));
          sc += Math.min(ac - sc, Math.floor(left / 3));
          si += Math.min(ai - si, Math.max(0, left - Math.floor(left / 3) * 2));
        }
      } else {
        sw = Math.min(aw, Math.floor(cap / 3));
        sc = Math.min(ac, Math.floor(cap / 3));
        si = Math.min(ai, cap - 2 * Math.floor(cap / 3));
      }
      sw = Math.max(0, Math.floor(sw));
      sc = Math.max(0, Math.floor(sc));
      si = Math.max(0, Math.floor(si));
      if (sw + sc + si < 1) return null;
      return { send_w: sw, send_c: sc, send_i: si, dest: destCoord, label: label };
    }

    var sendPlan = [];

    bigVillages.forEach(function(bv) {
      var bm = marketData[bv.id];
      if (!bm || bm.merchants_available < 1) { addLog('  SKIP ' + bv.name + ': no free traders.', 'warn'); return; }
      var bp = computeSend(bm, settings.targetCoords, 'direct->target');
      if (!bp) { addLog('  SKIP ' + bv.name + ': nothing above reserve.', 'warn'); return; }
      sendPlan.push({ village: bv, plan: bp });
    });

    smallVillages.forEach(function(sv) {
      var sm = marketData[sv.id];
      if (!sm || sm.merchants_available < 1) { addLog('  SKIP ' + sv.name + ': no traders.', 'warn'); return; }
      var svXY = coordToXY(sv.coord);
      var dtt = distance(svXY, targetXY);
      var bestRelay = null, bestDist = Infinity;
      bigVillages.forEach(function(bv) {
        var bxy = coordToXY(bv.coord);
        if (!bxy) return;
        var d = distance(svXY, bxy);
        if (d < bestDist) { bestDist = d; bestRelay = bv; }
      });
      var dest, label;
      if (!bestRelay || dtt <= bestDist + settings.relayThreshold) {
        dest = settings.targetCoords; label = 'small->direct->target';
      } else {
        var rm = marketData[bestRelay.id];
        dest = (rm && rm.merchants_available > settings.relayThreshold) ? bestRelay.coord : settings.targetCoords;
        label = (dest === bestRelay.coord) ? 'small->relay[' + bestRelay.name + ']' : 'small->direct(relay-full)';
      }
      var sp = computeSend(sm, dest, label);
      if (!sp) { addLog('  SKIP ' + sv.name + ': nothing above reserve.', 'warn'); return; }
      sendPlan.push({ village: sv, plan: sp });
    });

    addLog('---------------------------------', 'info');
    addLog('Send Plan: ' + sendPlan.length + ' villages', 'info');
    var totalW = 0, totalC = 0, totalI = 0;

    for (var p = 0; p < sendPlan.length; p++) {
      var entry = sendPlan[p]; var ep = entry.plan;
      totalW += ep.send_w; totalC += ep.send_c; totalI += ep.send_i;
      addLog('  >> ' + entry.village.name + ' (' + entry.village.coord + ') [' + ep.label + ']: W' + ep.send_w + ' C' + ep.send_c + ' I' + ep.send_i + ' -> ' + ep.dest, 'send');
      if (!settings.dryRun) {
        try {
          await sendResources(entry.village.id, ep.dest, ep.send_w, ep.send_c, ep.send_i);
          addLog('    OK: ' + entry.village.name, 'success');
        } catch(err) {
          addLog('    FAIL: ' + entry.village.name + ': ' + err, 'error');
        }
        await new Promise(function(r) { setTimeout(r, 800 + Math.random() * 600); });
      }
    }

    addLog('---------------------------------', 'info');
    addLog('DONE' + (settings.dryRun ? ' (DRY RUN)' : '') + ' | W' + totalW + ' C' + totalC + ' I' + totalI, 'success');
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  var CSS = '#rr-container{position:fixed;top:60px;right:0;width:380px;max-height:92vh;background:linear-gradient(170deg,#1a120a 0%,#251808 60%,#1c110a 100%);border:2px solid #7c4a0a;border-right:none;border-radius:10px 0 0 10px;box-shadow:-4px 4px 20px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,180,60,.15);font-family:Georgia,"Palatino Linotype",serif;color:#d4a855;z-index:99999;display:flex;flex-direction:column;transition:transform .3s ease;}#rr-container.rr-collapsed{transform:translateX(360px);}#rr-header{background:linear-gradient(90deg,#3a1e00,#5c2e00);border-radius:8px 0 0 0;padding:9px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #7c4a0a;cursor:pointer;user-select:none;}#rr-header h2{margin:0;font-size:14px;color:#f0c060;text-shadow:0 0 8px rgba(240,160,40,.5);letter-spacing:.03em;}#rr-toggle-btn{background:none;border:none;color:#f0c060;font-size:18px;cursor:pointer;padding:0 4px;line-height:1;}#rr-body{overflow-y:auto;padding:12px 14px;flex:1;}.rr-section{margin-bottom:12px;background:rgba(0,0,0,.25);border:1px solid rgba(124,74,10,.4);border-radius:6px;padding:10px 12px;}.rr-section-title{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#b07830;margin-bottom:8px;font-weight:bold;}.rr-row{display:flex;align-items:center;margin-bottom:7px;gap:8px;}.rr-row label{font-size:12px;color:#c8903a;flex:1;}.rr-row input[type=text],.rr-row input[type=number]{background:#120b04;border:1px solid #6b3e0a;color:#f0c060;border-radius:4px;padding:4px 7px;font-size:12px;font-family:monospace;width:110px;outline:none;}.rr-row input:focus{border-color:#d4a855;}.rr-row input[type=checkbox]{accent-color:#d4a855;width:16px;height:16px;}.rr-ratio-row{display:flex;gap:8px;align-items:center;margin-bottom:6px;}.rr-ratio-row label{font-size:11px;color:#a07028;width:34px;}.rr-ratio-row input{width:54px;}#rr-run-btn{width:100%;padding:10px;background:linear-gradient(180deg,#7a3e00,#5a2800);border:1px solid #c07020;border-radius:6px;color:#f8d070;font-size:14px;font-weight:bold;font-family:Georgia,serif;letter-spacing:.06em;cursor:pointer;text-shadow:0 1px 3px rgba(0,0,0,.5);transition:background .15s,box-shadow .15s;margin-bottom:10px;}#rr-run-btn:hover{background:linear-gradient(180deg,#9a5000,#7a3800);box-shadow:0 0 12px rgba(200,120,30,.4);}#rr-run-btn:active{transform:scale(.98);}#rr-log{background:#0d0700;border:1px solid rgba(100,60,5,.5);border-radius:5px;padding:8px;max-height:220px;overflow-y:auto;font-family:"Courier New",monospace;font-size:11px;}.rr-log-entry{padding:2px 0;border-bottom:1px solid rgba(100,60,5,.2);}.rr-log-ts{color:#5a4020;margin-right:4px;}.rr-log-info{color:#b09050;}.rr-log-warn{color:#e0a030;}.rr-log-error{color:#e05030;}.rr-log-send{color:#80c0e0;}.rr-log-success{color:#60c060;}.rr-log-dry{color:#9060c0;}#rr-footer{text-align:center;font-size:10px;color:#5a3a10;padding:6px 0 8px;letter-spacing:.08em;border-top:1px solid rgba(100,60,5,.3);}#rr-footer span{color:#8a5a20;}.rr-tab-bar{display:flex;gap:2px;margin-bottom:10px;}.rr-tab{flex:1;padding:5px;text-align:center;font-size:11px;background:rgba(0,0,0,.3);border:1px solid rgba(100,60,5,.4);border-radius:4px;cursor:pointer;color:#8a6030;transition:background .15s;}.rr-tab.active{background:rgba(120,70,0,.5);color:#f0c060;border-color:#c07020;}.rr-tab-content{display:none;}.rr-tab-content.active{display:block;}#rr-collapse-hint{position:absolute;left:-28px;top:50%;transform:translateY(-50%);background:#3a1e00;border:1px solid #7c4a0a;border-right:none;border-radius:6px 0 0 6px;padding:10px 5px;cursor:pointer;color:#f0c060;font-size:14px;writing-mode:vertical-lr;user-select:none;}.rr-note{font-size:10px;color:#6a4020;margin-top:3px;}.rr-alert{font-size:11px;background:rgba(180,80,0,.2);border:1px solid #c07020;border-radius:4px;padding:6px 8px;margin-bottom:8px;color:#f0a040;}';

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
          '<div class="rr-alert">&#9876; Run from your Market screen (Trade &rarr; Send resources)</div>' +
          '<div class="rr-section"><div class="rr-section-title">&#127919; Target</div>' +
            '<div class="rr-row"><label>Target Coords</label><input type="text" id="rr-target" placeholder="564|417" value="' + settings.targetCoords + '"></div>' +
            '<div class="rr-note">Enter the coords of the village to receive all resources.</div>' +
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
            '<div class="rr-row"><label>Small market limit</label><input type="number" id="rr-small-max" value="' + settings.smallMarketMax + '" min="1" title="Villages with this many or fewer total traders are treated as small"></div>' +
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
          '<div id="rr-log"><div id="rr-log-body" style="color:#5a4020;font-style:italic;">Log will appear here...</div></div>' +
          '<div style="margin-top:6px;text-align:right;"><button id="rr-clear-log" style="background:#1a0d00;border:1px solid #5a3010;color:#a06020;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px;">Clear Log</button></div>' +
        '</div>' +
        '<div class="rr-tab-content" id="rr-tab-help">' +
          '<div class="rr-section" style="font-size:11px;color:#b09050;line-height:1.7;">' +
            '<b style="color:#f0c060;">How to use:</b><br>' +
            '1. Navigate to your Market &rarr; Trade &rarr; Send resources.<br>' +
            '2. Run the script from that page.<br>' +
            '3. Enter target coords and set your reserves.<br>' +
            '4. Enable Dry Run first to preview the plan.<br>' +
            '5. Disable Dry Run and press Send Resources to execute.<br><br>' +
            '<b style="color:#f0c060;">Relay logic:</b><br>' +
            'Villages with &lt;= small market limit traders relay through the nearest big-market village if it is closer to the target. If the relay is full, they send direct instead.<br><br>' +
            '<b style="color:#f0c060;">Quickbar:</b><br>' +
            '<span style="color:#80c0e0;font-size:10px;word-break:break-all;">javascript:$.getScript(\'https://cdn.jsdelivr.net/gh/sotnos-hub/TW-Resource-sender@main/TW_ResourceRouter.js?bust=\' + Date.now());</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="rr-footer">Made by <span>Sotnos</span> &bull; v2.6.0</div>';

    document.body.appendChild(container);

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

  buildUI();

})();
