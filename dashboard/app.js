(function () {
  var R = window.RADAR || {};
  var rows = R.rows || [];
  var wl = new Set(R.watchlist || []);
  var S = { tab: 'board', category: 'all', chain: 'all', watchlistOnly: false, q: '', sort: 'implied_value_usd', dir: -1 };
  var HERO = location.search.indexOf('view=hero') >= 0;
  var PARAMS = new URLSearchParams(location.search);
  var PARAM_CATEGORY = PARAMS.get('category') || '';
  var PARAM_DETAIL = PARAMS.get('detail') || '';
  var DETAIL_VIEW = PARAMS.get('view') === 'detail';
  var METHOD_VIEW = PARAMS.get('view') === 'method';
  var LIVE_VIEW = PARAMS.get('view') === 'live';
  var SPLIT_VIEW = PARAMS.get('view') === 'split';
  if (PARAM_CATEGORY) S.category = PARAM_CATEGORY;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return '&' + { '&': 'amp;', '<': 'lt;', '>': 'gt;', '"': 'quot;', "'": '#39;' }[c];
    });
  }
  function money(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function pct(v) {
    if (v == null || isNaN(v)) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function $(id) { return document.getElementById(id); }

  function filtered() {
    var q = S.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (S.category !== 'all' && r.category !== S.category) return false;
      if (S.chain !== 'all' && !(r.chains || []).includes(S.chain)) return false;
      if (S.watchlistOnly && !wl.has(r.slug)) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var x = a[S.sort], y = b[S.sort];
      if (typeof x === 'string' || typeof y === 'string') {
        return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y)) * S.dir;
      }
      return ((x == null ? -Infinity : x) - (y == null ? -Infinity : y)) * S.dir;
    });
  }

  function renderStats() {
    var tvl = 0, imp = 0;
    rows.forEach(function (r) { tvl += r.tvl_usd || 0; imp += r.implied_value_usd || 0; });
    $('stats').innerHTML = esc(rows.length) + ' protocols · ' + wl.size + ' watchlist · total TVL ' +
      money(tvl) + ' · total implied ' + money(imp);
    var tops = rows.filter(function (r) { return wl.has(r.slug); })
      .sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); }).slice(0, 3);
    $('risers').textContent = 'Fastest risers: ' + tops.map(function (r) {
      return r.name + ' ' + pct(r.change_7d);
    }).join(' · ');
    if (R.as_of) {
      var asOf = $('as-of');
      if (asOf) asOf.textContent = 'Data: ' + R.as_of;
    }
  }

  var HONEST_TEXT = 'Implied value is an estimate from 14 Nov 2026 data, not a promise a token will launch.';

  function categoryMultiplesHtml() {
    var seen = {}, cats = [];
    rows.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (!(c in seen)) { seen[c] = r.category_multiple; cats.push(c); }
    });
    var freq = {};
    cats.forEach(function (c) { var k = String(seen[c]); freq[k] = (freq[k] || 0) + 1; });
    var globalKey = null, gmax = -1;
    Object.keys(freq).forEach(function (k) {
      if (freq[k] > gmax) { gmax = freq[k]; globalKey = k; }
    });
    var list = cats.map(function (c) {
      return { name: c, mult: seen[c], global: String(seen[c]) === globalKey };
    }).sort(function (a, b) {
      return b.mult - a.mult || a.name.localeCompare(b.name);
    });
    function fmt(v) { return '\u00d7' + Number(v).toFixed(2).replace('.', ','); }
    var half = Math.ceil(list.length / 2);
    var html = '<div class="cat-multiples"><h3>Category multiples used by the board</h3><table class="multiples"><tbody>';
    for (var i = 0; i < half; i++) {
      html += '<tr>';
      for (var col = 0; col < 2; col++) {
        var item = list[col === 0 ? i : i + half];
        if (!item) { html += '<td></td>'; continue; }
        html += '<td><span class="cat-name">' + esc(item.name) + '</span> ' +
          '<span class="cat-mult">' + fmt(item.mult) + '</span>' +
          (item.global ? ' <span class="global-tag">global median</span>' : '') + '</td>';
      }
      html += '</tr>';
    }
    return html + '</tbody></table></div>';
  }

  function renderHowto() {
    $('howto').textContent = 'Click a row for detail. Click a header to sort.';
    $('honest').textContent = HONEST_TEXT;
    $('method').innerHTML =
      '<h2>Methodology</h2>' +
      '<p class="method-formula">Implied value = TVL \u00d7 category multiple (median mcap/TVL of live-token peers in the same category; categories with fewer than 3 live-token peers use the global median) \u00d7 growth (7-day change, clamped \u00b130%) \u00d7 age (1 + 10% per year, max 2 years) \u00d7 chains (1 + 5% per chain, max 4 chains). Airdrop value = 7% of implied value. The board ranks 200 protocols: 40 watchlist + 18 off-list (pre-token, at or above the $50M floor, left out by the watchlist rule) + 142 below the floor.</p>' +
      categoryMultiplesHtml() +
      '<p class="method-honest">' + esc(HONEST_TEXT) + '</p>';
  }

  function renderFilters() {
    var cats = [];
    rows.forEach(function (r) { if (cats.indexOf(r.category) < 0) cats.push(r.category); });
    cats.sort();
    var chains = [];
    rows.forEach(function (r) { (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    chains.sort();
    var f = $('filters');
    f.innerHTML = '';
    var input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search name or slug';
    input.value = S.q;
    input.addEventListener('input', function () { S.q = input.value; renderBoard(); });
    f.appendChild(input);
    var chips = document.createElement('div');
    chips.className = 'chips';
    function chip(label, on, count, fn) {
      var b = document.createElement('button');
      b.className = 'chip' + (on ? ' active' : '');
      b.innerHTML = esc(label) + (count != null ? ' <span class="count">' + count + '</span>' : '');
      b.addEventListener('click', fn);
      return b;
    }
    cats.forEach(function (c) {
      var n = rows.filter(function (r) { return r.category === c; }).length;
      chips.appendChild(chip(c, S.category === c, n, function () { S.category = c; renderFilters(); renderBoard(); }));
    });
    chips.appendChild(chip('All', S.category === 'all', rows.length, function () { S.category = 'all'; renderFilters(); renderBoard(); }));
    var sel = document.createElement('select');
    sel.appendChild(new Option('All chains', 'all'));
    chains.forEach(function (c) { sel.appendChild(new Option(c, c)); });
    sel.value = S.chain;
    sel.addEventListener('change', function () { S.chain = sel.value; renderBoard(); });
    f.appendChild(sel);
    f.appendChild(chip('Watchlist only', S.watchlistOnly, null, function () {
      S.watchlistOnly = !S.watchlistOnly; renderFilters(); renderBoard();
    }));
    f.insertBefore(chips, sel);
  }

  function riskOf(r) {
    var c = r.change_7d;
    if (c == null || c >= 0) return ['low', 'Steady'];
    if (c < -10) return ['high', 'Sharp drop'];
    return ['mid', 'Down'];
  }

  function renderBoard() {
    document.querySelectorAll('.th-sort').forEach(function (th) {
      th.classList.remove('asc', 'desc');
      if (th.getAttribute('data-key') === S.sort) th.classList.add(S.dir === 1 ? 'asc' : 'desc');
      th.onclick = function () {
        var k = th.getAttribute('data-key');
        if (S.sort === k) S.dir = -S.dir;
        else { S.sort = k; S.dir = k === 'name' || k === 'category' ? 1 : -1; }
        renderBoard();
      };
    });
    var body = $('board-body');
    body.innerHTML = '';
    var list = filtered();
    if (HERO) list = list.slice(0, 30);
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-slug', r.slug);
      var risk = riskOf(r);
      var changeCls = r.change_7d == null ? 'flat' : r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : 'flat';
      var rankCls = r.rank <= 3 ? ' medal-' + r.rank : '';
      tr.innerHTML =
        '<td class="num' + rankCls + '">' + esc(r.rank) + '</td>' +
        '<td class="name">' + esc(r.name) + (wl.has(r.slug) ? ' <span class="wl-dot" title="Watchlist"></span>' : '') +
          (r.listed_at && r.listed_at >= '2026-01-01' ? ' <span class="badge-new">NEW</span>' : '') + '</td>' +
        '<td class="cat">' + esc(r.category) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + changeCls + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num">' + money(r.airdrop_value_usd) + '</td>' +
        '<td>' + (r.listed_at ? esc(r.listed_at) : '—') + '</td>' +
        '<td class="num">' + (r.starting_capital_usd != null ? money(r.starting_capital_usd) : '—') + '</td>' +
        '<td><span class="risk-label risk-' + risk[0] + '">' + risk[1] + '</span></td>';
      tr.addEventListener('click', function () {
        document.querySelectorAll('#board-body tr.selected').forEach(function (x) { x.classList.remove('selected'); });
        tr.classList.add('selected');
        if (typeof window.showDetail === 'function') window.showDetail(r.slug);
      });
      body.appendChild(tr);
    });
  }

  function renderTabs() {
    var tabs = $('tabs');
    tabs.innerHTML = '';
    [['board', 'Pre-token board'], ['live', 'Already has a token']].forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'tab' + (S.tab === t[0] ? ' active' : '');
      b.textContent = t[1];
      b.addEventListener('click', function () { S.tab = t[0]; renderTabs(); applyTab(); });
      tabs.appendChild(b);
    });
  }

  function applyTab() {
    var board = document.querySelector('.board-wrap');
    var live = $('live');
    if (board) board.hidden = S.tab !== 'board';
    if (live) live.hidden = S.tab !== 'live';
    if (S.tab === 'live' && typeof window.renderLive === 'function') window.renderLive();
  }

  renderStats();
  renderHowto();
  renderFilters();
  renderBoard();
  renderTabs();
  applyTab();

  function renderLiveStrip() {
    var live = (R.live || []).slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); }).slice(0, 6);
    var el = $('live');
    if (!el) return;
    el.innerHTML = '<strong>Already trading:</strong> ' + live.map(function (r) { return esc(r.name) + ' ' + money(r.mcap_usd); }).join(' \u00b7 ');
    el.hidden = false;
  }

  if (HERO) {
    document.body.classList.add('hero');
    window.addEventListener('load', function () {
      if (typeof window.showDetail === 'function') window.showDetail('gauntlet');
      renderLiveStrip();
    });
  }

  if (DETAIL_VIEW) {
    document.body.classList.add('detail-view');
  }
  if (METHOD_VIEW) {
    document.body.classList.add('method-view');
    window.addEventListener('load', function () {
      if (typeof window.renderLive === 'function') window.renderLive(12);
      var lv2 = $('live');
      if (lv2) lv2.hidden = false;
    });
  }
  if (LIVE_VIEW) {
    document.body.classList.add('live-view');
    window.addEventListener('load', function () {
      S.tab = 'live';
      renderTabs();
      if (typeof window.renderLive === 'function') window.renderLive(33);
      var lv = $('live');
      if (lv) lv.hidden = false;
    });
  }
  if (SPLIT_VIEW) {
    document.body.classList.add('split-view');
  }
  window.addEventListener('load', function () {
    if (!HERO && PARAM_DETAIL && typeof window.showDetail === 'function') window.showDetail(PARAM_DETAIL);
  });
})();
