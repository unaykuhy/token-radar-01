(function () {
  var R = window.RADAR || {};
  var rows = R.rows || [];

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

  function markSelected(slug) {
    document.querySelectorAll('#board-body tr.selected').forEach(function (x) { x.classList.remove('selected'); });
    var tr = document.querySelector('#board-body tr[data-slug="' + slug + '"]');
    if (tr) tr.classList.add('selected');
  }

  function barRow(label, value, logv, maxlog, cls) {
    var w = cls ? 100 : Math.max(0, Math.min(100, (Number(value) / 1.2) * 100));
    return '<div class="breakdown-row">' +
      '<span class="br-label">' + label + '</span>' +
      '<span class="br-mult num">' + (cls ? esc(value) : '×' + Number(value).toFixed(2)) + '</span>' +
      '<span class="br-bar"><span class="br-fill" style="width:' + w.toFixed(1) + '%"></span></span>' +
      '</div>';
  }

  window.showDetail = function (slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    if (!r) return;
    var lg = function (v) { return Math.log(Math.max(Number(v) || 1, 1)); };
    var maxlog = lg(r.implied_value_usd) || 1;
    var factors = [
      ['TVL', money(r.tvl_usd), lg(r.tvl_usd), true],
      ['Category', r.category_multiple, lg(r.category_multiple), false],
      ['Growth ' + pct(r.change_7d), r.growth_multiplier, lg(r.growth_multiplier), false],
      ['Age ' + r.age_days + 'd', r.age_multiplier, lg(r.age_multiplier), false],
      ['Chains ' + (r.chains || []).length, r.chain_multiplier, lg(r.chain_multiplier), false],
      ['Implied value', money(r.implied_value_usd), maxlog, true]
    ];
    var steps = (r.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var peers = rows.filter(function (x) { return x.category === r.category && x.slug !== r.slug; })
      .sort(function (a, b) { return a.rank - b.rank; }).slice(0, 5)
      .map(function (p) {
        return '<button class="peer" data-slug="' + esc(p.slug) + '">' + esc(p.rank) + '. ' + esc(p.name) +
          ' <span class="num">' + money(p.implied_value_usd) + '</span></button>';
      }).join('');
    var candleHtml;
    if (r.change_7d != null && r.tvl_usd != null && (1 + r.change_7d / 100) !== 0) {
      var open = r.tvl_usd / (1 + r.change_7d / 100);
      var close = r.tvl_usd;
      var hi = Math.max(open, close), lo = Math.min(open, close);
      var up = close >= open;
      var pad = 4, span = hi - lo;
      var yOf = function (v) { return span > 0 ? pad + (1 - (v - lo) / span) * (40 - pad * 2) : 20; };
      var topY = yOf(hi), botY = yOf(lo), bodyH = Math.max(3, botY - topY);
      if (topY + bodyH > 40 - pad) topY = 40 - pad - bodyH;
      candleHtml =
        '<div class="tvl-candle">' +
          '<div class="tvl-candle-top">' +
            '<span class="tvl-title">TVL, past 7 days</span>' +
            '<span class="tvl-candle-nums">open <b>' + money(open) + '</b> · close <b>' + money(close) + '</b></span>' +
          '</div>' +
          '<svg class="tvl-svg" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="TVL candle">' +
            '<rect class="tvl-candle-body ' + (up ? 'up' : 'down') + '" x="42" y="' + topY.toFixed(2) +
              '" width="16" height="' + bodyH.toFixed(2) + '" rx="1"></rect>' +
          '</svg>' +
          '<p class="tvl-candle-note">TVL, past 7 days — one candle: open = TVL 7 days ago, derived from the 7d change; close = TVL on 14 Nov 2026. No daily prices in the snapshot.</p>' +
        '</div>';
    } else {
      candleHtml = '<div class="tvl-candle"><p class="tvl-candle-empty">No 7-day change on record, so no TVL candle.</p></div>';
    }
    $('detail').innerHTML =
      '<button class="close-btn" title="Close">✕</button>' +
      '<h2><span class="num">' + esc(r.rank) + '</span> ' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.category) + ' · ' + (r.chains || []).map(esc).join(', ') +
        ' · Listed ' + esc(r.listed_at || '—') + ' · ' + r.age_days + ' days old</p>' +
      '<div class="values">' +
        '<div><span class="big num">' + money(r.implied_value_usd) + '</span><span class="vlabel">implied value</span></div>' +
        '<div><span class="big num">' + money(r.airdrop_value_usd) + '</span><span class="vlabel">airdrop (7%)</span></div>' +
      '</div>' +
      candleHtml +
      '<h3>Value breakdown</h3>' +
      factors.map(function (f) { return barRow(f[0], f[1], f[2], maxlog, f[3]); }).join('') +
      '<h3>Farm plan</h3>' +
      '<div class="steps"><ol>' + steps + '</ol></div>' +
      '<h3>Similar protocols</h3>' +
      '<div class="peers">' + (peers || '<em>None</em>') + '</div>';
    var d = $('detail');
    d.hidden = false;
    d.querySelector('.close-btn').addEventListener('click', function () {
      d.hidden = true;
      d.innerHTML = '';
      document.querySelectorAll('#board-body tr.selected').forEach(function (x) { x.classList.remove('selected'); });
    });
    d.querySelectorAll('.peer').forEach(function (b) {
      b.addEventListener('click', function () {
        window.showDetail(b.getAttribute('data-slug'));
        markSelected(b.getAttribute('data-slug'));
      });
    });
    markSelected(slug);
  };

  window.renderLive = function () {
    var live = R.live || [];
    var body = live.map(function (r) {
      var cls = r.change_7d == null ? 'flat' : r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : 'flat';
      var ratio = r.tvl_usd && r.mcap_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) : '—';
      return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.category) + '</td>' +
        '<td>' + (r.chains || []).map(esc).join(', ') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num ' + cls + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ratio + '</td></tr>';
    }).join('');
    $('live').innerHTML =
      '<h2>Already has a token — market values, not model values</h2>' +
      '<table class="board live-table"><thead><tr>' +
      '<th>Name</th><th>Category</th><th>Chains</th><th class="num">TVL</th>' +
      '<th class="num">Market cap</th><th class="num">7d</th><th class="num">MCap/TVL</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>';
  };
})();
