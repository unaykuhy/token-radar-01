(function () {
  var R = window.RADAR || {};
  var rows = R.rows || [];
  function markSelected(slug) {
    document.querySelectorAll('#board-body tr.selected').forEach(function (x) { x.classList.remove('selected'); });
    var tr = document.querySelector('#board-body tr[data-slug="' + slug + '"]');
    if (tr) tr.classList.add('selected');
  }
  function barRow(label, value, cls) {
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
    var factors = [
      ['TVL', money(r.tvl_usd), true],
      ['Category', r.category_multiple, false],
      ['Growth ' + pct(r.change_7d), r.growth_multiplier, false],
      ['Age ' + r.age_days + 'd', r.age_multiplier, false],
      ['Chains ' + (r.chains || []).length, r.chain_multiplier, false],
      ['Implied value', money(r.implied_value_usd), true]
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
      var pad = 6, span = hi - lo, CH = 90;
      var yOf = function (v) { return span > 0 ? pad + (1 - (v - lo) / span) * (CH - pad * 2) : CH / 2; };
      var topY = yOf(hi), botY = yOf(lo), bodyH = Math.max(6, botY - topY);
      if (topY + bodyH > CH - pad) topY = CH - pad - bodyH;
      var topVal = up ? close : open, botVal = up ? open : close;
      var pctTxt = r.change_7d == null ? '' : pct(r.change_7d) + ' \u00b7 7d';
      candleHtml =
        '<div class="tvl-candle">' +
          '<div class="tvl-candle-top">' +
            '<span class="tvl-title">TVL, past 7 days</span>' +
          '</div>' +
          '<div class="tvl-chart">' +
            '<div class="tvl-scale">' +
              '<span class="tvl-scale-val ' + (up ? 'up' : 'down') + '" style="top:' + Math.max(0, topY - 7).toFixed(1) + 'px">' + money(topVal) + '</span>' +
              '<span class="tvl-scale-val ' + (up ? 'up' : 'down') + '" style="top:' + Math.min(76, botY - 7).toFixed(1) + 'px">' + money(botVal) + '</span>' +
            '</div>' +
            '<svg class="tvl-svg" viewBox="0 0 60 90" role="img" aria-label="TVL candle">' +
              '<rect class="tvl-candle-body ' + (up ? 'up' : 'down') + '" x="10" y="' + topY.toFixed(2) +
                '" width="40" height="' + bodyH.toFixed(2) + '" rx="1"></rect>' +
            '</svg>' +
            '<div class="tvl-labels">' +
              '<span>open <b>' + money(open) + '</b></span>' +
              '<span>close <b>' + money(close) + '</b></span>' +
              (pctTxt ? '<span class="' + (up ? 'up' : 'down') + '">' + pctTxt + '</span>' : '') +
            '</div>' +
          '</div>' +
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
      factors.map(function (f) { return barRow(f[0], f[1], f[2]); }).join('') +
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
  window.renderLive = function (limit) {
    var live = R.live || [];
    var totalLive = live.length;
    live = live.slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); });
    if (limit && live.length > limit) live = live.slice(0, limit);
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
      '</tr></thead><tbody>' + body + '</tbody></table>' + (limit && totalLive > limit ? '<p class="live-note">Showing top ' + limit + ' of ' + totalLive + ' live-token protocols, ranked by market cap.</p>' : '');
  };
})();
