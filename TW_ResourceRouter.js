// TW Resource Router v3.0.0 — Made by Sotnos
// Run from Market > Trade > Send resources
// Quickbar: javascript:$.getScript('https://cdn.jsdelivr.net/gh/sotnos-hub/TW-Resource-sender@main/TW_ResourceRouter.js?bust=' + Date.now());

(function () {
  'use strict';

  if (!window.game_data) { alert('Run this on a Tribal Wars game page.'); return; }
  if (window.game_data.screen !== 'market') {
    alert('Resource Router: Please go to Market \u2192 Trade \u2192 Send resources first, then run the script.');
    return;
  }
  if (document.getElementById('rr-panel')) {
    document.getElementById('rr-panel').remove();
    document.getElementById('rr-styles') && document.getElementById('rr-styles').remove();
  }

  var SCRIPT_KEY   = 'tw_rr_v3';
  var TRADER_CARRY = 1000;
  var LOG_MAX      = 200;

  function lsGet(k, fb) { try { return localStorage.getItem(k) || fb; } catch(e) { return fb; } }
  function lsSet(k, v)  { try { localStorage.setItem(k, v); } catch(e) {} }

  var cfg = loadCfg();
  function loadCfg() {
    try { return JSON.parse(lsGet(SCRIPT_KEY, 'null')) || defaultCfg(); } catch(e) { return defaultCfg(); }
  }
  function saveCfg() { lsSet(SCRIPT_KEY, JSON.stringify(cfg)); }
  function defaultCfg() {
    return {
      targetCoords:   window.game_data.village.coord,
      reserveWood:    5000,
      reserveClay:    5000,
      reserveIron:    5000,
      sendRatio:      { wood: 33, clay: 33, iron: 34 },
      smallMarketMax: 5,
      relayThreshold: 3,
      autoBalance:    true,
    };
  }

  function coordToXY(c) {
    var m = String(c).match(/(\d+)\|(\d+)/);
    return m ? { x: parseInt(m[1]), y: parseInt(m[2]) } : null;
  }
  function dist(a, b) { return Math.sqrt((a.x-b.x)*(a.x-b.x)+(a.y-b.y)*(a.y-b.y)); }
  function csrf() { return window.game_data.csrf; }
  function vid()  { return window.game_data.village.id; }

  // ── CSS (LA-style: tan/parchment, dark headers, amber accents) ────────────
  var CSS = `
    #rr-panel {
      position: fixed; top: 40px; right: 10px; width: 520px; max-height: 88vh;
      background: #f4e8c1; border: 2px solid #7c5a1e;
      box-shadow: 3px 3px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4);
      font-family: Verdana, Geneva, sans-serif; font-size: 12px; color: #333;
      z-index: 99999; display: flex; flex-direction: column; border-radius: 3px;
    }
    #rr-titlebar {
      background: linear-gradient(180deg, #c8a045 0%, #a07828 50%, #8a6418 100%);
      padding: 5px 8px; display: flex; align-items: center; justify-content: space-between;
      border-bottom: 2px solid #5a3e0a; cursor: move; user-select: none;
      border-radius: 2px 2px 0 0;
    }
    #rr-titlebar span { color: #fff5d0; font-weight: bold; font-size: 12px; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
    #rr-titlebar small { color: #ffe090; font-size: 10px; margin-left: 6px; }
    #rr-close {
      background: #7c3a0a; border: 1px solid #5a2a04; color: #ffd080;
      width: 18px; height: 18px; line-height: 16px; text-align: center;
      cursor: pointer; font-size: 11px; border-radius: 2px; font-weight: bold;
    }
    #rr-close:hover { background: #a04010; }
    #rr-tabs { display: flex; background: #d4b870; border-bottom: 1px solid #7c5a1e; }
    .rr-tab {
      padding: 4px 14px; cursor: pointer; font-size: 11px; color: #5a3e0a;
      border-right: 1px solid #7c5a1e; font-weight: bold;
      background: linear-gradient(180deg, #dfc880 0%, #c8a845 100%);
    }
    .rr-tab:hover { background: linear-gradient(180deg, #eedda0 0%, #d4b455 100%); }
    .rr-tab.active {
      background: #f4e8c1; color: #3a1e00; border-bottom: 2px solid #f4e8c1;
      margin-bottom: -1px; z-index: 1;
    }
    #rr-body { overflow-y: auto; padding: 10px; flex: 1; max-height: calc(88vh - 80px); }
    .rr-section {
      background: #ede0b0; border: 1px solid #b89040;
      border-radius: 2px; margin-bottom: 8px;
    }
    .rr-section-head {
      background: linear-gradient(180deg, #c8a845 0%, #a07828 100%);
      color: #fff5d0; font-weight: bold; font-size: 11px;
      padding: 3px 8px; letter-spacing: 0.05em;
    }
    .rr-section-body { padding: 8px; }
    .rr-row { display: flex; align-items: center; margin-bottom: 5px; gap: 6px; }
    .rr-row label { color: #5a3e0a; min-width: 130px; font-size: 11px; }
    .rr-row input[type=text], .rr-row input[type=number] {
      background: #fff8e8; border: 1px solid #9a7030;
      padding: 2px 5px; font-size: 11px; width: 90px; color: #3a1e00;
      box-shadow: inset 1px 1px 2px rgba(0,0,0,0.1);
    }
    .rr-row input[type=checkbox] { accent-color: #8a6418; width: 14px; height: 14px; }
    .rr-ratio-row { display: flex; gap: 12px; align-items: center; }
    .rr-ratio-row span { color: #5a3e0a; font-size: 11px; min-width: 12px; }
    .rr-ratio-row input { width: 50px !important; }
    .rr-note { font-size: 10px; color: #7a5a1a; margin-top: 3px; font-style: italic; }

    /* Settings action button */
    #rr-load-btn {
      width: 100%; padding: 6px;
      background: linear-gradient(180deg, #e8b830 0%, #c09010 50%, #a07808 100%);
      border: 1px solid #7a5808; border-bottom: 2px solid #5a3808;
      color: #fff5d0; font-weight: bold; font-size: 12px; letter-spacing: 0.05em;
      cursor: pointer; border-radius: 2px; font-family: Verdana, sans-serif;
      text-shadow: 0 1px 2px rgba(0,0,0,0.4);
    }
    #rr-load-btn:hover { background: linear-gradient(180deg, #f0c840 0%, #d0a018 50%, #b08810 100%); }
    #rr-load-btn:active { transform: translateY(1px); border-bottom-width: 1px; }

    /* Send queue table */
    #rr-queue-wrap { display: none; }
    #rr-queue-info {
      background: #d4b870; border: 1px solid #7c5a1e; border-radius: 2px;
      padding: 5px 8px; margin-bottom: 8px; font-size: 11px; color: #3a1e00;
    }
    #rr-queue-info b { color: #7a3a00; }
    #rr-spacebar-hint {
      background: linear-gradient(180deg, #ede0b0, #ddd0a0);
      border: 1px solid #9a7030; border-radius: 2px;
      padding: 5px 10px; margin-bottom: 8px; text-align: center;
      font-size: 11px; color: #5a3e0a;
    }
    #rr-spacebar-hint kbd {
      background: #fff8e8; border: 1px solid #9a7030; border-bottom: 2px solid #7a5010;
      border-radius: 3px; padding: 1px 7px; font-size: 12px; font-family: monospace;
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    #rr-queue-table { width: 100%; border-collapse: collapse; }
    #rr-queue-table thead tr {
      background: linear-gradient(180deg, #c8a845 0%, #a07828 100%);
      color: #fff5d0; font-size: 11px;
    }
    #rr-queue-table thead th { padding: 4px 6px; text-align: left; font-weight: bold; border-right: 1px solid #7a5808; }
    #rr-queue-table tbody tr { border-bottom: 1px solid #c8a845; }
    #rr-queue-table tbody tr:nth-child(even) { background: #ede0b0; }
    #rr-queue-table tbody tr:nth-child(odd)  { background: #f4e8c1; }
    #rr-queue-table tbody tr.rr-sent { opacity: 0.4; }
    #rr-queue-table tbody tr.rr-active { background: #fff5c0 !important; outline: 2px solid #c8a020; }
    #rr-queue-table td { padding: 4px 6px; font-size: 11px; vertical-align: middle; }
    .rr-village-name { font-weight: bold; color: #3a1e00; }
    .rr-coords { color: #7a5a1a; font-size: 10px; }
    .rr-res { font-family: monospace; font-size: 11px; }
    .rr-wood { color: #5a7a1a; }
    .rr-clay { color: #8a5a1a; }
    .rr-iron { color: #4a5a6a; }
    .rr-route { font-size: 10px; color: #7a5a1a; font-style: italic; }
    .rr-traders { font-size: 11px; color: #3a1e00; }
    .rr-send-btn {
      background: linear-gradient(180deg, #e8b830 0%, #c09010 50%, #a07808 100%);
      border: 1px solid #7a5808; border-bottom: 2px solid #5a3808;
      color: #fff5d0; font-weight: bold; font-size: 11px;
      padding: 3px 10px; cursor: pointer; border-radius: 2px;
      font-family: Verdana, sans-serif; white-space: nowrap;
      text-shadow: 0 1px 1px rgba(0,0,0,0.3);
    }
    .rr-send-btn:hover { background: linear-gradient(180deg, #f0c840 0%, #d0a018 50%, #b08810 100%); }
    .rr-send-btn:active { transform: translateY(1px); border-bottom-width: 1px; }
    .rr-send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
    .rr-sent-label { color: #5a8a1a; font-weight: bold; font-size: 11px; }
    .rr-skip-btn {
      background: #c8b090; border: 1px solid #9a7848; color: #5a3e0a;
      font-size: 10px; padding: 2px 6px; cursor: pointer; border-radius: 2px;
      margin-left: 3px;
    }
    .rr-skip-btn:hover { background: #b8a080; }
    #rr-progress {
      background: #c8a845; border: 1px solid #7c5a1e; border-radius: 2px;
      margin-bottom: 8px; overflow: hidden; height: 14px;
    }
    #rr-progress-bar {
      height: 100%; background: linear-gradient(90deg, #5a8a1a, #78b820);
      transition: width 0.3s; display: flex; align-items: center; justify-content: center;
      font-size: 9px; color: #fff; font-weight: bold; min-width: 30px;
    }
    #rr-log-box {
      background: #2a1e0a; border: 1px solid #5a3e0a; border-radius: 2px;
      padding: 6px; max-height: 200px; overflow-y: auto;
      font-family: 'Courier New', monospace; font-size: 10px;
    }
    .rr-log-info    { color: #c8a845; }
    .rr-log-success { color: #78c820; }
    .rr-log-warn    { color: #e09020; }
    .rr-log-error   { color: #e04820; }
    .rr-log-ts      { color: #5a4a1a; margin-right: 4px; }
    #rr-footer {
      text-align: center; font-size: 10px; color: #9a7030; padding: 4px;
      border-top: 1px solid #b89040; background: #e8d898;
    }
    #rr-footer b { color: #7a4a0a; }
  `;

  // ── Inject CSS ────────────────────────────────────────────────────────────
  var styleEl = document.createElement('style');
  styleEl.id = 'rr-styles';
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  // ── Build Panel ───────────────────────────────────────────────────────────
  var panel = document.createElement('div');
  panel.id = 'rr-panel';
  panel.innerHTML = `
    <div id="rr-titlebar">
      <div>
        <span>&#9876; Resource Router</span>
        <small>v3.0.0 &bull; Hold <kbd style="background:#5a3a00;border:1px solid #3a2000;color:#ffd080;padding:0 4px;border-radius:2px;font-size:9px;">Space</kbd> to send</small>
      </div>
      <div id="rr-close">&#10005;</div>
    </div>
    <div id="rr-tabs">
      <div class="rr-tab active" data-tab="settings">Settings</div>
      <div class="rr-tab" data-tab="queue">Send Queue</div>
      <div class="rr-tab" data-tab="log">Log</div>
    </div>
    <div id="rr-body">

      <!-- SETTINGS TAB -->
      <div id="rr-tab-settings" class="rr-tab-content">
        <div class="rr-section">
          <div class="rr-section-head">&#127919; Target Village</div>
          <div class="rr-section-body">
            <div class="rr-row">
              <label>Target Coords</label>
              <input type="text" id="rr-target" placeholder="564|417" value="${cfg.targetCoords}">
            </div>
            <div class="rr-note">All resources from your villages will be sent here (or to a relay village).</div>
          </div>
        </div>

        <div class="rr-section">
          <div class="rr-section-head">&#127846; Reserves (keep in each village)</div>
          <div class="rr-section-body">
            <div class="rr-row"><label>Wood</label><input type="number" id="rr-res-wood" value="${cfg.reserveWood}" min="0"></div>
            <div class="rr-row"><label>Clay</label><input type="number" id="rr-res-clay" value="${cfg.reserveClay}" min="0"></div>
            <div class="rr-row"><label>Iron</label><input type="number" id="rr-res-iron" value="${cfg.reserveIron}" min="0"></div>
          </div>
        </div>

        <div class="rr-section">
          <div class="rr-section-head">&#9878; Send Ratio (%)</div>
          <div class="rr-section-body">
            <div class="rr-ratio-row">
              <span>W</span><input type="number" id="rr-ratio-wood" value="${cfg.sendRatio.wood}" min="0" max="100">
              <span>C</span><input type="number" id="rr-ratio-clay" value="${cfg.sendRatio.clay}" min="0" max="100">
              <span>I</span><input type="number" id="rr-ratio-iron" value="${cfg.sendRatio.iron}" min="0" max="100">
            </div>
            <div class="rr-note">Must sum to 100. Auto-balance fills remaining trader capacity.</div>
          </div>
        </div>

        <div class="rr-section">
          <div class="rr-section-head">&#128256; Relay Settings</div>
          <div class="rr-section-body">
            <div class="rr-row">
              <label>Small market (max traders)</label>
              <input type="number" id="rr-small-max" value="${cfg.smallMarketMax}" min="1">
            </div>
            <div class="rr-row">
              <label>Relay distance bonus</label>
              <input type="number" id="rr-relay-thresh" value="${cfg.relayThreshold}" min="0">
            </div>
            <div class="rr-row">
              <label>Auto-balance fill</label>
              <input type="checkbox" id="rr-auto-balance" ${cfg.autoBalance ? 'checked' : ''}>
            </div>
          </div>
        </div>

        <button id="rr-load-btn">&#128269; LOAD SEND QUEUE</button>
        <div id="rr-load-status" style="margin-top:6px;font-size:11px;color:#5a3e0a;min-height:16px;"></div>
      </div>

      <!-- QUEUE TAB -->
      <div id="rr-tab-queue" class="rr-tab-content" style="display:none;">
        <div id="rr-queue-empty" style="padding:20px;text-align:center;color:#7a5a1a;font-style:italic;">
          Click "Load Send Queue" in Settings first.
        </div>
        <div id="rr-queue-wrap">
          <div id="rr-queue-info"></div>
          <div id="rr-progress"><div id="rr-progress-bar" style="width:0%">0%</div></div>
          <div id="rr-spacebar-hint">Hold <kbd>Space</kbd> to send one by one &mdash; or click each <b>Send</b> button manually</div>
          <table id="rr-queue-table">
            <thead>
              <tr>
                <th>Village</th>
                <th>&#127809; W &nbsp; &#127815; C &nbsp; &#9881; I</th>
                <th>Traders</th>
                <th>Route</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="rr-queue-body"></tbody>
          </table>
          <div style="margin-top:8px;padding:6px;background:#ede0b0;border:1px solid #b89040;border-radius:2px;font-size:10px;color:#7a5a1a;text-align:center;">
            &#9432; Each send is a manual action. The script does not auto-send.
          </div>
        </div>
      </div>

      <!-- LOG TAB -->
      <div id="rr-tab-log" class="rr-tab-content" style="display:none;">
        <div id="rr-log-box"><span style="color:#5a4a1a;font-style:italic;">Log will appear here...</span></div>
        <div style="margin-top:5px;text-align:right;">
          <button onclick="document.getElementById('rr-log-box').innerHTML=''" style="background:#c8a845;border:1px solid #7c5a1e;padding:2px 8px;font-size:10px;cursor:pointer;">Clear</button>
        </div>
      </div>

    </div>
    <div id="rr-footer">Made by <b>Sotnos</b> &bull; v3.0.0 &bull; One send per click &#10003;</div>
  `;
  document.body.appendChild(panel);

  // ── Logging ───────────────────────────────────────────────────────────────
  var logEntries = [];
  function log(msg, type) {
    type = type || 'info';
    var ts = new Date().toLocaleTimeString();
    var el = document.getElementById('rr-log-box');
    var div = document.createElement('div');
    div.className = 'rr-log-' + type;
    div.innerHTML = '<span class="rr-log-ts">[' + ts + ']</span> ' + msg;
    if (el) { el.appendChild(div); el.scrollTop = el.scrollHeight; }
  }
  function status(msg) {
    var el = document.getElementById('rr-load-status');
    if (el) el.textContent = msg;
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  function switchTab(name) {
    panel.querySelectorAll('.rr-tab').forEach(function(t) { t.classList.remove('active'); });
    panel.querySelectorAll('.rr-tab-content').forEach(function(t) { t.style.display = 'none'; });
    panel.querySelector('[data-tab="' + name + '"]').classList.add('active');
    document.getElementById('rr-tab-' + name).style.display = 'block';
  }
  panel.querySelectorAll('.rr-tab').forEach(function(tab) {
    tab.addEventListener('click', function() { switchTab(tab.dataset.tab); });
  });
  document.getElementById('rr-close').addEventListener('click', function() {
    panel.remove();
    document.getElementById('rr-styles') && document.getElementById('rr-styles').remove();
    document.removeEventListener('keydown', spaceHandler);
  });

  // ── Draggable titlebar ────────────────────────────────────────────────────
  (function() {
    var tb = document.getElementById('rr-titlebar');
    var dragging = false, ox = 0, oy = 0;
    tb.addEventListener('mousedown', function(e) {
      if (e.target.id === 'rr-close') return;
      dragging = true;
      ox = e.clientX - panel.offsetLeft;
      oy = e.clientY - panel.offsetTop;
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      panel.style.right = 'auto';
      panel.style.left = (e.clientX - ox) + 'px';
      panel.style.top  = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', function() { dragging = false; });
  })();

  // ── Collect settings from UI ──────────────────────────────────────────────
  function collectCfg() {
    cfg.targetCoords   = document.getElementById('rr-target').value.trim();
    cfg.reserveWood    = parseInt(document.getElementById('rr-res-wood').value)    || 0;
    cfg.reserveClay    = parseInt(document.getElementById('rr-res-clay').value)    || 0;
    cfg.reserveIron    = parseInt(document.getElementById('rr-res-iron').value)    || 0;
    cfg.sendRatio.wood = parseInt(document.getElementById('rr-ratio-wood').value)  || 33;
    cfg.sendRatio.clay = parseInt(document.getElementById('rr-ratio-clay').value)  || 33;
    cfg.sendRatio.iron = parseInt(document.getElementById('rr-ratio-iron').value)  || 34;
    cfg.smallMarketMax = parseInt(document.getElementById('rr-small-max').value)   || 5;
    cfg.relayThreshold = parseInt(document.getElementById('rr-relay-thresh').value)|| 3;
    cfg.autoBalance    = document.getElementById('rr-auto-balance').checked;
  }

  // ── Village fetch ─────────────────────────────────────────────────────────
  function fetchVillages() {
    return new Promise(function(resolve) {
      $.ajax({ url: '/game.php?village=' + vid() + '&screen=overview_villages',
        success: function(html) {
          var v = scrapeVillages(html);
          if (v.length > 0) return resolve(v);
          $.ajax({ url: '/game.php?village=' + vid() + '&screen=overview_villages&mode=combined',
            success: function(h2) {
              var v2 = scrapeVillages(h2);
              resolve(v2.length > 0 ? v2 : [{ id: window.game_data.village.id, name: window.game_data.village.name, coord: window.game_data.village.coord }]);
            }, error: function() { resolve([{ id: window.game_data.village.id, name: window.game_data.village.name, coord: window.game_data.village.coord }]); }
          });
        }, error: function() { resolve([{ id: window.game_data.village.id, name: window.game_data.village.name, coord: window.game_data.village.coord }]); }
      });
    });
  }

  function scrapeVillages(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var villages = [], seen = {};
    doc.querySelectorAll('a[href*="village="]').forEach(function(a) {
      var m = (a.getAttribute('href') || '').match(/[?&]village=(\d+)/);
      if (!m) return;
      var id = parseInt(m[1]);
      if (seen[id]) return;
      var el = a, texts = [a.textContent];
      for (var i = 0; i < 4 && el; i++) { texts.push(el.textContent); el = el.parentElement; }
      var coord = null;
      for (var t = 0; t < texts.length; t++) { var cm = texts[t].match(/(\d{3})\|(\d{3})/); if (cm) { coord = cm[1]+'|'+cm[2]; break; } }
      if (!coord) return;
      var name = a.textContent.replace(/\(\d+\|\d+\).*/, '').trim() || ('Village ' + id);
      seen[id] = true;
      villages.push({ id: id, name: name, coord: coord });
    });
    return villages;
  }

  // ── Market fetch ──────────────────────────────────────────────────────────
  function fetchMarket(villageId) {
    return new Promise(function(resolve) {
      $.ajax({ url: '/game.php?village=' + villageId + '&screen=market&mode=send',
        success: function(html) {
          var wood = 0, clay = 0, iron = 0, avail = 0, total = 0;
          var gm = html.match(/TribalWars\.updateGameData\((\{[\s\S]*?\})\);/);
          if (gm) {
            try {
              var gd = JSON.parse(gm[1]);
              if (gd.village) {
                wood = Math.floor(gd.village.wood_float  || gd.village.wood  || 0);
                clay = Math.floor(gd.village.stone_float || gd.village.stone || 0);
                iron = Math.floor(gd.village.iron_float  || gd.village.iron  || 0);
              }
            } catch(e) {}
          }
          // Merchant count from page text
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var allText = doc.body ? doc.body.textContent : '';
          var fracs = allText.match(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/g);
          if (fracs) {
            for (var i = 0; i < fracs.length; i++) {
              var p = fracs[i].match(/(\d+)\/(\d+)/);
              if (p) {
                var a2 = parseInt(p[1]), t2 = parseInt(p[2]);
                if (t2 > 0 && t2 <= 500 && a2 <= t2) { avail = a2; total = t2; break; }
              }
            }
          }
          resolve({ wood: wood, clay: clay, iron: iron, avail: avail, total: total });
        }, error: function() { resolve(null); }
      });
    });
  }

  // ── Compute send amounts ──────────────────────────────────────────────────
  function computeSend(mkt, destCoord, label) {
    var aw = Math.max(0, mkt.wood - cfg.reserveWood);
    var ac = Math.max(0, mkt.clay - cfg.reserveClay);
    var ai = Math.max(0, mkt.iron - cfg.reserveIron);
    var cap = mkt.avail * TRADER_CARRY;
    if (cap <= 0) return null;
    var sw, sc, si;
    if (cfg.autoBalance) {
      sw = Math.min(aw, Math.floor(cap * cfg.sendRatio.wood / 100));
      sc = Math.min(ac, Math.floor(cap * cfg.sendRatio.clay / 100));
      si = Math.min(ai, Math.floor(cap * cfg.sendRatio.iron / 100));
      var left = Math.max(0, cap - sw - sc - si);
      if (left > 0) {
        sw += Math.min(aw - sw, Math.floor(left / 3));
        sc += Math.min(ac - sc, Math.floor(left / 3));
        si += Math.min(ai - si, Math.max(0, left - Math.floor(left/3)*2));
      }
    } else {
      sw = Math.min(aw, Math.floor(cap / 3));
      sc = Math.min(ac, Math.floor(cap / 3));
      si = Math.min(ai, cap - 2*Math.floor(cap/3));
    }
    sw = Math.max(0, Math.floor(sw));
    sc = Math.max(0, Math.floor(sc));
    si = Math.max(0, Math.floor(si));
    if (sw + sc + si < 1) return null;
    return { sw: sw, sc: sc, si: si, dest: destCoord, label: label, traders: Math.ceil((sw+sc+si)/TRADER_CARRY) };
  }

  // ── Send resources (2-step) ───────────────────────────────────────────────
  function doSend(villageId, toCoord, wood, clay, iron) {
    return new Promise(function(resolve, reject) {
      var target = coordToXY(toCoord);
      if (!target) return reject('Bad coords: ' + toCoord);
      var h = csrf();
      $.ajax({
        url: '/game.php?village=' + villageId + '&screen=market&mode=send&h=' + h + '&try=confirm_send',
        method: 'POST',
        data: { wood: wood, stone: clay, iron: iron, x: target.x, y: target.y, target_type: 'coord' },
        success: function(html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var form = doc.querySelector('form');
          if (!form) return resolve({ direct: true });
          var data = {};
          form.querySelectorAll('input').forEach(function(inp) { if (inp.name) data[inp.name] = inp.value; });
          var action = form.getAttribute('action') || ('/game.php?village=' + villageId + '&screen=market&mode=send&h=' + h);
          $.ajax({
            url: action, method: 'POST', data: data,
            success: function() { resolve({ ok: true }); },
            error: function(x) { reject('Confirm failed: ' + x.status); }
          });
        },
        error: function(x) { reject('Step1 failed: ' + x.status); }
      });
    });
  }

  // ── Build queue ───────────────────────────────────────────────────────────
  var sendQueue = [];
  var currentIdx = 0;

  async function loadQueue() {
    collectCfg(); saveCfg();
    var targetXY = coordToXY(cfg.targetCoords);
    if (!targetXY) { status('Invalid target coords!'); return; }

    var btn = document.getElementById('rr-load-btn');
    btn.disabled = true; btn.textContent = 'Loading villages...';
    status('Fetching your villages...');
    log('Loading queue for target ' + cfg.targetCoords + '...', 'info');

    var villages = await fetchVillages();
    status('Probing ' + villages.length + ' markets...');
    log('Found ' + villages.length + ' villages. Probing markets...', 'info');

    var marketData = {};
    for (var i = 0; i < villages.length; i++) {
      var v = villages[i];
      var mkt = await fetchMarket(v.id);
      if (mkt) {
        marketData[v.id] = mkt;
        log(v.name + ' (' + v.coord + '): ' + mkt.avail + '/' + mkt.total + ' traders | W' + mkt.wood + ' C' + mkt.clay + ' I' + mkt.iron, 'info');
      } else {
        log('Could not read market for ' + v.name, 'warn');
      }
    }

    var bigVils   = villages.filter(function(v) { return marketData[v.id] && marketData[v.id].total > cfg.smallMarketMax; });
    var smallVils = villages.filter(function(v) { return marketData[v.id] && marketData[v.id].total > 0 && marketData[v.id].total <= cfg.smallMarketMax; });

    sendQueue = [];

    bigVils.forEach(function(bv) {
      var bm = marketData[bv.id];
      if (!bm || bm.avail < 1) return;
      var plan = computeSend(bm, cfg.targetCoords, 'direct \u2192 target');
      if (plan) sendQueue.push({ village: bv, mkt: bm, plan: plan });
    });

    smallVils.forEach(function(sv) {
      var sm = marketData[sv.id];
      if (!sm || sm.avail < 1) return;
      var svXY = coordToXY(sv.coord);
      var dtt = dist(svXY, targetXY);
      var bestRelay = null, bestDist = Infinity;
      bigVils.forEach(function(bv) {
        var bxy = coordToXY(bv.coord);
        if (!bxy) return;
        var d = dist(svXY, bxy);
        if (d < bestDist) { bestDist = d; bestRelay = bv; }
      });
      var dest, label;
      if (!bestRelay || dtt <= bestDist + cfg.relayThreshold) {
        dest = cfg.targetCoords; label = 'small \u2192 direct';
      } else {
        var rm = marketData[bestRelay.id];
        dest  = (rm && rm.avail > cfg.relayThreshold) ? bestRelay.coord : cfg.targetCoords;
        label = (dest === bestRelay.coord) ? 'relay \u2192 ' + bestRelay.name : 'small \u2192 direct (relay full)';
      }
      var plan = computeSend(sm, dest, label);
      if (plan) sendQueue.push({ village: sv, mkt: sm, plan: plan });
    });

    btn.disabled = false; btn.textContent = '\u{1F50D} LOAD SEND QUEUE';
    log('Queue ready: ' + sendQueue.length + ' villages to send from.', 'success');
    status('Queue loaded! ' + sendQueue.length + ' sends ready. Switch to Send Queue tab.');

    renderQueue();
    switchTab('queue');
  }

  // ── Render queue table ────────────────────────────────────────────────────
  function renderQueue() {
    document.getElementById('rr-queue-empty').style.display = 'none';
    document.getElementById('rr-queue-wrap').style.display  = 'block';

    var total = sendQueue.length;
    currentIdx = 0;
    updateProgress(0, total);

    var info = document.getElementById('rr-queue-info');
    var totalW = 0, totalC = 0, totalI = 0;
    sendQueue.forEach(function(e) { totalW += e.plan.sw; totalC += e.plan.sc; totalI += e.plan.si; });
    info.innerHTML = '<b>' + total + ' villages</b> ready to send &mdash; Total: <span class="rr-wood">W' + totalW + '</span> <span class="rr-clay">C' + totalC + '</span> <span class="rr-iron">I' + totalI + '</span> &mdash; Target: <b>' + cfg.targetCoords + '</b>';

    var tbody = document.getElementById('rr-queue-body');
    tbody.innerHTML = '';

    sendQueue.forEach(function(entry, idx) {
      var tr = document.createElement('tr');
      tr.id = 'rr-row-' + idx;
      if (idx === 0) tr.classList.add('rr-active');
      tr.innerHTML =
        '<td><div class="rr-village-name">' + entry.village.name + '</div><div class="rr-coords">(' + entry.village.coord + ')</div></td>' +
        '<td class="rr-res"><span class="rr-wood">W' + entry.plan.sw + '</span> <span class="rr-clay">C' + entry.plan.sc + '</span> <span class="rr-iron">I' + entry.plan.si + '</span></td>' +
        '<td class="rr-traders">' + entry.mkt.avail + '/' + entry.mkt.total + '</td>' +
        '<td class="rr-route">' + entry.plan.label + '<br><span style="color:#5a7a1a;font-size:10px;">\u2192 ' + entry.plan.dest + '</span></td>' +
        '<td><button class="rr-send-btn" id="rr-btn-' + idx + '">Send</button>' +
        '<button class="rr-skip-btn" id="rr-skip-' + idx + '">Skip</button></td>';
      tbody.appendChild(tr);

      document.getElementById('rr-btn-' + idx).addEventListener('click', function() { triggerSend(idx); });
      document.getElementById('rr-skip-' + idx).addEventListener('click', function() { skipRow(idx); });
    });

    scrollToActive();
  }

  function updateProgress(done, total) {
    var pct = total > 0 ? Math.round(done / total * 100) : 0;
    var bar = document.getElementById('rr-progress-bar');
    if (bar) { bar.style.width = pct + '%'; bar.textContent = done + '/' + total; }
  }

  function scrollToActive() {
    var activeRow = document.querySelector('#rr-queue-table tr.rr-active');
    if (activeRow) activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Send action ───────────────────────────────────────────────────────────
  var sending = false;
  var sentCount = 0;

  async function triggerSend(idx) {
    if (sending) return;
    var entry = sendQueue[idx];
    if (!entry || entry.sent || entry.skipped) return;

    sending = true;
    var btn = document.getElementById('rr-btn-' + idx);
    var row = document.getElementById('rr-row-' + idx);
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    log('Sending from ' + entry.village.name + ' (' + entry.village.coord + '): W' + entry.plan.sw + ' C' + entry.plan.sc + ' I' + entry.plan.si + ' \u2192 ' + entry.plan.dest, 'info');

    try {
      await doSend(entry.village.id, entry.plan.dest, entry.plan.sw, entry.plan.sc, entry.plan.si);
      entry.sent = true;
      sentCount++;
      if (row) { row.classList.remove('rr-active'); row.classList.add('rr-sent'); }
      var td = row ? row.lastElementChild : null;
      if (td) td.innerHTML = '<span class="rr-sent-label">\u2714 Sent</span>';
      log('OK: ' + entry.village.name, 'success');
      updateProgress(sentCount, sendQueue.length);
      advanceActive(idx);
    } catch(err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
      log('FAIL: ' + entry.village.name + ': ' + err, 'error');
    }
    sending = false;
  }

  function skipRow(idx) {
    var entry = sendQueue[idx];
    if (!entry || entry.sent || entry.skipped) return;
    entry.skipped = true;
    var row = document.getElementById('rr-row-' + idx);
    if (row) { row.classList.remove('rr-active'); row.classList.add('rr-sent'); }
    var td = row ? row.lastElementChild : null;
    if (td) td.innerHTML = '<span style="color:#9a7030;font-size:11px;">Skipped</span>';
    log('Skipped: ' + entry.village.name, 'warn');
    advanceActive(idx);
  }

  function advanceActive(fromIdx) {
    // Find next unsent row
    for (var i = fromIdx + 1; i < sendQueue.length; i++) {
      if (!sendQueue[i].sent && !sendQueue[i].skipped) {
        currentIdx = i;
        var row = document.getElementById('rr-row-' + i);
        if (row) { row.classList.add('rr-active'); }
        scrollToActive();
        return;
      }
    }
    currentIdx = -1; // all done
    log('All villages processed!', 'success');
  }

  // ── Spacebar handler ──────────────────────────────────────────────────────
  function spaceHandler(e) {
    if (e.code !== 'Space') return;
    // Don't fire if typing in an input
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(document.activeElement.tagName) >= 0) return;
    e.preventDefault();
    if (currentIdx >= 0 && currentIdx < sendQueue.length) {
      triggerSend(currentIdx);
    }
  }
  document.addEventListener('keydown', spaceHandler);

  // ── Wire up load button ───────────────────────────────────────────────────
  document.getElementById('rr-load-btn').addEventListener('click', loadQueue);

})();
