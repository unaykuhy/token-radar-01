(function () {
  var R = window.RADAR || {};
  var rows = (R.rows || []).slice().sort(function (a, b) { return (a.rank || 0) - (b.rank || 0); });
  var P = new URLSearchParams(location.search);
  var VIEW = P.get('view') || '';
  var FLOOR = Number(R.floor_usd) || 50000000;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return '&' + { '&': 'amp;', '<': 'lt;', '>': 'gt;', '"': 'quot;', "'": '#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function drawChart() {
    var host = el('chart');
    if (!host) return;
    var W = 1400, H = 860, L = 90, RT = 40, T = 40, B = 60;
    var pw = W - L - RT, ph = H - T - B;
    var maxRank = rows.length ? Math.max(rows[0].rank || 1, rows[rows.length - 1].rank || 1) : 200;
    if (maxRank < 2) maxRank = 2;
    function xOf(rank) { return L + ((rank - 1) / (maxRank - 1)) * pw; }
    function yOf(v) { return T + ph * (1 - Math.min(1, Math.max(0, (v || 0) / 900e6))); }
    var pts = rows.map(function (r) {
      return { x: xOf(r.rank || 1), y: yOf(r.implied_value_usd), r: r };
    });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + r1(p.x) + ' ' + r1(p.y); }).join(' ');
    var base = T + ph;
    var area = line + ' L' + r1(pts.length ? pts[pts.length - 1].x : L) + ' ' + r1(base) +
      ' L' + r1(pts.length ? pts[0].x : L) + ' ' + r1(base) + ' Z';

    var svg = '<svg viewBox="0 0 1400 860" role="img" aria-label="Implied value by rank">';
    svg += '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + r1(base) + '" class="axis"/>';
    svg += '<line x1="' + L + '" y1="' + r1(base) + '" x2="' + (W - RT) + '" y2="' + r1(base) + '" class="axis"/>';

    [0, 200e6, 400e6, 600e6, 800e6].forEach(function (v) {
      var y = r1(yOf(v));
      var lab = v === 0 ? '$0' : '$' + (v / 1e6) + 'M';
      svg += '<line x1="' + L + '" y1="' + y + '" x2="' + (W - RT) + '" y2="' + y + '" class="grid"/>';
      svg += '<text x="' + (L - 10) + '" y="' + (y + 4) + '" text-anchor="end" class="axis-label">' + lab + '</text>';
    });

    var xticks = [1];
    for (var t = 25; t <= maxRank; t += 25) xticks.push(t);
    xticks.forEach(function (rank) {
      var x = r1(xOf(rank));
      svg += '<line x1="' + x + '" y1="' + T + '" x2="' + x + '" y2="' + r1(base) + '" class="grid"/>';
      svg += '<text x="' + x + '" y="' + (H - B + 20) + '" text-anchor="middle" class="axis-label">' + rank + '</text>';
    });

    var fy = r1(yOf(FLOOR));
    svg += '<line x1="' + L + '" y1="' + fy + '" x2="' + (W - RT) + '" y2="' + fy + '" class="floor"/>';
    svg += '<text x="' + (L + 8) + '" y="' + (fy - 7) + '" class="floor-label">Floor $50M</text>';

    svg += '<path d="' + area + '" class="chart-area"/>';
    svg += '<path d="' + line + '" class="chart-line"/>';

    var dy = [-12, 18, -12];
    pts.slice(0, 3).forEach(function (p, i) {
      svg += '<circle cx="' + r1(p.x) + '" cy="' + r1(p.y) + '" r="4.5" class="chart-dot d' + (i + 1) + '"/>';
      svg += '<text x="' + r1(p.x + 8) + '" y="' + r1(p.y + dy[i]) + '" class="chart-name n' + (i + 1) + '">' + esc(p.r.name) + '</text>';
    });
    svg += '</svg>';

    host.innerHTML = '<h2>Implied value by rank</h2>' + svg +
      '<p class="chart-note">Dashed line: the snapshot\u2019s $50M TVL floor, shown for reference \u2014 this chart plots implied value by rank, not TVL.</p>';
  }

  function drawRadar() {
    var host = el('radar');
    if (!host) return;
    var CX = 500, CY = 500, RAD = 420;
    var lo = Math.log(1e6), hi = Math.log(1e9), span = hi - lo;
    function rr(v) {
      v = Math.max(v || 0, 1);
      var r = RAD * (hi - Math.log(v)) / span;
      return Math.max(0, Math.min(RAD, r));
    }

    var cats = [];
    var groups = {};
    rows.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (cats.indexOf(c) < 0) { cats.push(c); groups[c] = []; }
      groups[c].push(r);
    });
    cats.sort();
    var N = cats.length || 1, sector = (2 * Math.PI) / N;

    var pos = rows.map(function (r) {
      var c = r.category || 'Uncategorized';
      var g = groups[c], k = g.length, j = g.indexOf(r);
      var a = -Math.PI / 2 + cats.indexOf(c) * sector + sector * (k === 1 ? 0.5 : (j + 0.5) / k);
      var rad = rr(r.implied_value_usd);
      return { r: r, a: a, rad: rad, x: CX + Math.cos(a) * rad, y: CY + Math.sin(a) * rad };
    });

    var svg = '<svg viewBox="0 0 1000 1000" role="img" aria-label="Ship radar of protocols by implied value and category">';
    var r500 = rr(5e8), r100 = rr(1e8);

    // Fine grid pattern background (marine radar phosphor look)
    svg += '<defs><pattern id="radar-grid" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#0d1117"/><path d="M16 0 L0 0 L0 16" stroke="var(--accent)" stroke-width="0.3" opacity="0.15"/></pattern></defs>';
    svg += '<rect x="' + (CX - RAD) + '" y="' + (CY - RAD) + '" width="' + (2 * RAD) + '" height="' + (2 * RAD) + '" fill="url(#radar-grid)"/>';

    // Bearing spokes every 30 degrees
    for (var b = 0; b < 12; b++) {
      var ba = b * Math.PI / 6;
      var sx = r1(CX + Math.cos(ba) * RAD), sy = r1(CY + Math.sin(ba) * RAD);
      svg += '<line x1="500" y1="500" x2="' + sx + '" y2="' + sy + '" class="radar-spoke"/>';
    }

    // Rim and rings
    svg += '<circle cx="500" cy="500" r="' + r1(RAD) + '" class="radar-rim"/>';
    svg += '<circle cx="500" cy="500" r="' + r1(r500) + '" class="radar-ring"/>';
    svg += '<circle cx="500" cy="500" r="' + r1(r100) + '" class="radar-ring"/>';

    // Sweep angle and fade wedges (3 nested slices)
    var sweepA = -35 * Math.PI / 180;
    var half = Math.PI / 12;
    var sweepEnd = sweepA + half * 2;
    var sweepStart = sweepA - half;
    [0.22, 0.10, 0.04].forEach(function (op, idx) {
      var innerR = RAD * (0.15 + idx * 0.28);
      var x1 = r1(CX + Math.cos(sweepStart) * innerR), y1 = r1(CY + Math.sin(sweepStart) * innerR);
      var x2 = r1(CX + Math.cos(sweepEnd) * innerR), y2 = r1(CY + Math.sin(sweepEnd) * innerR);
      var x3 = r1(CX + Math.cos(sweepEnd) * RAD), y3 = r1(CY + Math.sin(sweepEnd) * RAD);
      var x4 = r1(CX + Math.cos(sweepStart) * RAD), y4 = r1(CY + Math.sin(sweepStart) * RAD);
      svg += '<path d="M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 + ' A' + RAD + ' ' + RAD + ' 0 0 1 ' + x3 + ' ' + y3 + ' L' + x4 + ' ' + y4 + ' A' + innerR + ' ' + innerR + ' 0 0 0 ' + x1 + ' ' + y1 + ' Z" class="radar-sweep-' + (idx + 1) + '"/>';
    });

    // Bright sweep line
    svg += '<line x1="500" y1="500" x2="' + r1(CX + Math.cos(sweepA) * RAD) + '" y2="' + r1(CY + Math.sin(sweepA) * RAD) + '" class="radar-sweep"/>';

    // Bearing numbers around rim every 30 degrees (nautical: 0 at top, 90 right, 180 bottom, 270 left)
    for (var bn = 0; bn < 12; bn++) {
      var bna = bn * Math.PI / 6;
      var bx = r1(CX + Math.cos(bna) * (RAD + 22)), by = r1(CY + Math.sin(bna) * (RAD + 22) + 4);
      var bearing = ((bn * 30) + 90) % 360;
      svg += '<text x="' + bx + '" y="' + by + '" class="radar-bearing" text-anchor="middle">' + bearing + '</text>';
    }

    // Ring labels at 225° diagonal (lower-left)
    var diag = 0.70710678;
    svg += '<text x="' + r1(CX - r500 * diag) + '" y="' + r1(CY + r500 * diag) + '" text-anchor="middle" class="ring-label">$500M</text>';
    svg += '<text x="' + r1(CX - r100 * diag) + '" y="' + r1(CY + r100 * diag) + '" text-anchor="middle" class="ring-label">$100M</text>';
    svg += '<text x="' + r1(CX - RAD * diag) + '" y="' + r1(CY + RAD * diag) + '" text-anchor="middle" class="ring-label">$1M</text>';
    svg += '<circle cx="500" cy="500" r="2" class="radar-center"/>';
    svg += '<text x="512" y="504" class="ring-label center-label" style="font-size:9px">$1B</text>';

    // Blips as glowing squares with center dot (monochrome phosphor)
    pos.forEach(function (p, i) {
      var size = i < 3 ? 5 : 3.5;
      var hw = size;
      var x = r1(p.x), y = r1(p.y);
      var cls = 'radar-blip' + (i < 3 ? ' top' + (i + 1) : '');
      // Square outline
      svg += '<rect x="' + r1(x - hw) + '" y="' + r1(y - hw) + '" width="' + r1(2 * hw) + '" height="' + r1(2 * hw) + '" class="' + cls + '"/>';
      // Bright center dot
      svg += '<circle cx="' + x + '" cy="' + y + '" r="1.5" fill="var(--accent)"/>';
    });

    // Top 20 labels with collision avoidance
    var placed = [];
    var placedCount = 0;
    pos.slice(0, 20).forEach(function (p) {
      var name = esc(p.r.name);
      var w = name.length * 6.5, h = 12;
      var angle = p.a;
      var lx = p.x + Math.cos(angle) * 16;
      var ly = p.y + Math.sin(angle) * 16;
      var anchor = lx > CX ? 'end' : 'start';
      var dx = anchor === 'end' ? -8 : 8;
      var overlap = function (bx, by) {
        for (var i = 0; i < placed.length; i++) {
          var pb = placed[i];
          if (bx < pb.x + pb.w && bx + w > pb.x && by < pb.y + pb.h && by + h > pb.y) return true;
        }
        return false;
      };
      var tries = 0;
      while (tries < 3 && overlap(lx + dx - (anchor === 'end' ? w : 0), ly - h / 2)) {
        ly += 14;
        tries++;
      }
      if (!overlap(lx + dx - (anchor === 'end' ? w : 0), ly - h / 2)) {
        svg += '<text x="' + r1(lx + dx) + '" y="' + r1(ly + 3) + '" text-anchor="' + anchor + '" class="radar-name">' + name + '</text>';
        placed.push({ x: lx + dx - (anchor === 'end' ? w : 0), y: ly - h / 2, w: w, h: h });
        placedCount++;
      }
    });
    // console.log('Radar labels placed:', placedCount);

    svg += '</svg>';

    host.innerHTML = '<h2>Ship radar</h2>' + svg +
      '<p class="radar-legend">Distance from center = implied value (closer = larger). Angle = category. Rings: $1B center, $500M, $100M, $1M rim.</p>';
  }

  function drawNav() {
    var host = el('views');
    if (!host) return;
    var active = VIEW === 'chart' || VIEW === 'radar' ? VIEW : 'pre';
    var items = [
      { key: 'pre', label: 'Pre-token board', search: '' },
      { key: 'chart', label: 'Full chart', search: '?view=chart' },
      { key: 'radar', label: 'Ship radar', search: '?view=radar' }
    ];
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.label;
      if (it.key === active) b.className = 'active';
      b.addEventListener('click', function () { location.search = it.search; });
      host.appendChild(b);
    });
  }

  drawNav();
  if (VIEW === 'chart') {
    document.body.classList.add('chart-view');
    drawChart();
  } else if (VIEW === 'radar') {
    document.body.classList.add('radar-view');
    drawRadar();
  }
})();
