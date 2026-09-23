/* Nimo - glowing wireframe/particle orb on a 2D canvas (no libraries). */
(function (root) {
  'use strict';

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

  function createOrb(canvas) {
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, DPR = 1, R = 100, cx = 0, cy = 0;
    var i, j;

    // 1. Shell: latitude rings of fine dots -> the striped mesh look.
    var shell = [];
    var RINGS = 46;
    for (i = 1; i < RINGS; i++) {
      var lat = -Math.PI / 2 + Math.PI * i / RINGS;
      var cnt = Math.max(8, Math.round(96 * Math.cos(lat)));
      for (j = 0; j < cnt; j++) {
        var lon = 2 * Math.PI * j / cnt + (i % 2) * 0.03;
        shell.push([Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]);
      }
    }
    // 2. Network: nodes on the surface joined to their nearest neighbours.
    var nodes = [], edges = [];
    for (i = 0; i < 150; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      nodes.push([s * Math.cos(th) * 0.985, u * 0.985, s * Math.sin(th) * 0.985]);
    }
    for (i = 0; i < nodes.length; i++) {
      var d = [];
      for (j = 0; j < nodes.length; j++) if (j !== i) {
        var dx = nodes[i][0] - nodes[j][0], dy = nodes[i][1] - nodes[j][1], dz = nodes[i][2] - nodes[j][2];
        d.push([dx * dx + dy * dy + dz * dz, j]);
      }
      d.sort(function (a, b) { return a[0] - b[0]; });
      for (var k = 0; k < 3; k++) if (i < d[k][1]) edges.push([i, d[k][1]]);
    }
    // 3. Core: a cloud of particles inside the sphere.
    var core = [];
    for (i = 0; i < 900; i++) {
      core.push({ p: [gauss() * 0.45, gauss() * 0.5, gauss() * 0.45], ph: Math.random() * 6.28, sp: rnd(0.4, 1.6) });
    }
    // 4. Spikes around the rim.
    var spikes = [];
    for (i = 0; i < 110; i++) {
      var u2 = Math.random() * 2 - 1, t2 = Math.random() * Math.PI * 2, s2 = Math.sqrt(1 - u2 * u2);
      spikes.push({ p: [s2 * Math.cos(t2), u2, s2 * Math.sin(t2)], len: rnd(0.03, 0.09), ph: Math.random() * 6.28 });
    }

    var energy = 0.15, target = 0.15, level = 0, rotY = 0, rotX = -0.35, hue = 0; // hue 0 = cyan
    var mode = 'sleeping', t0 = performance.now();

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      R = Math.min(W, H) * 0.3;
      cx = W / 2; cy = H * 0.44;
    }
    window.addEventListener('resize', resize);
    resize();

    var BUCKETS = 10;
    function project(p, cY, sY, cX, sX, scale) {
      var x = p[0] * cY + p[2] * sY, z = -p[0] * sY + p[2] * cY;
      var y = p[1] * cX - z * sX; z = p[1] * sX + z * cX;
      var f = 1 / (1 + z * 0.25);
      return [cx + x * R * scale * f, cy + y * R * scale * f, z];
    }
    function color(a, bright) {
      // cyan -> slightly greener when awake
      var r = Math.round(40 + 60 * bright), g = Math.round(210 + 40 * bright + 20 * hue), b = Math.round(255 - 60 * hue);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
    }

    function frame(now) {
      var t = (now - t0) / 1000;
      energy += (Math.max(target, level) - energy) * 0.08;
      hue += (((mode === 'listening' || mode === 'speaking') ? 1 : 0) - hue) * 0.05;
      rotY += 0.0025 + energy * 0.012;
      var cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(rotX), sX = Math.sin(rotX);
      var pulse = 1 + energy * 0.06 * Math.sin(t * (mode === 'speaking' ? 11 : 4)) + energy * 0.03;

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

      // halo
      var g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.8);
      g.addColorStop(0, 'rgba(0,200,255,' + (0.05 + energy * 0.12) + ')');
      g.addColorStop(0.55, 'rgba(0,120,180,' + (0.03 + energy * 0.05) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      var b, q, arr;
      // shell dots, bucketed by depth for speed
      var buckets = []; for (b = 0; b < BUCKETS; b++) buckets.push([]);
      for (i = 0; i < shell.length; i++) {
        q = project(shell[i], cY, sY, cX, sX, pulse);
        b = Math.min(BUCKETS - 1, Math.max(0, Math.floor((1 - q[2]) / 2 * BUCKETS)));
        buckets[b].push(q);
      }
      var dot = Math.max(1.1, R / 115);
      for (b = 0; b < BUCKETS; b++) {
        arr = buckets[b]; if (!arr.length) continue;
        ctx.fillStyle = color((0.10 + 0.55 * b / BUCKETS) * (0.75 + energy * 0.5), 0);
        for (i = 0; i < arr.length; i++) ctx.fillRect(arr[i][0], arr[i][1], dot, dot);
      }

      // network lines
      var pn = nodes.map(function (n) { return project(n, cY, sY, cX, sX, pulse); });
      var lb = []; for (b = 0; b < BUCKETS; b++) lb.push([]);
      for (i = 0; i < edges.length; i++) {
        var A = pn[edges[i][0]], B = pn[edges[i][1]];
        b = Math.min(BUCKETS - 1, Math.max(0, Math.floor((1 - (A[2] + B[2]) / 2) / 2 * BUCKETS)));
        lb[b].push(A, B);
      }
      ctx.lineWidth = Math.max(0.6, R / 260);
      for (b = 0; b < BUCKETS; b++) {
        arr = lb[b]; if (!arr.length) continue;
        ctx.strokeStyle = color((0.06 + 0.55 * b / BUCKETS) * (0.6 + energy * 0.8), 0.6);
        ctx.beginPath();
        for (i = 0; i < arr.length; i += 2) { ctx.moveTo(arr[i][0], arr[i][1]); ctx.lineTo(arr[i + 1][0], arr[i + 1][1]); }
        ctx.stroke();
      }
      for (i = 0; i < pn.length; i++) {
        if (pn[i][2] > 0.2) continue;
        ctx.fillStyle = color(0.5 + energy * 0.4, 1);
        ctx.fillRect(pn[i][0] - dot, pn[i][1] - dot, dot * 2, dot * 2);
      }

      // spikes
      ctx.beginPath();
      for (i = 0; i < spikes.length; i++) {
        var sp = spikes[i];
        var L = 1 + sp.len * (1 + energy * 2.5 * (0.5 + 0.5 * Math.sin(t * 6 + sp.ph)));
        var p1 = project(sp.p, cY, sY, cX, sX, pulse * 1.01), p2 = project([sp.p[0] * L, sp.p[1] * L, sp.p[2] * L], cY, sY, cX, sX, pulse);
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
      }
      ctx.strokeStyle = color(0.25 + energy * 0.4, 0.3); ctx.stroke();

      // core
      var coreA = 0.2 + energy * 0.6, spread = 0.7 + energy * 0.5;
      for (i = 0; i < core.length; i++) {
        var c = core[i], w = Math.sin(t * c.sp + c.ph) * 0.06;
        q = project([c.p[0] * spread + w, c.p[1] * spread, c.p[2] * spread - w], cY, sY, cX, sX, pulse);
        ctx.fillStyle = color(coreA * (0.4 + 0.6 * Math.abs(Math.sin(t * c.sp * 2 + c.ph))), 1);
        ctx.fillRect(q[0], q[1], dot * 1.2, dot * 1.2);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      setMode: function (m) {
        mode = m;
        target = { off: 0.12, sleeping: 0.2, listening: 0.55, thinking: 0.45, speaking: 0.8 }[m] || 0.15;
      },
      setLevel: function (v) { level = Math.min(1, v); }
    };
  }
  root.NimoOrb = { createOrb: createOrb };
})(this);
