// EDM salgi hesap cekirdegi (tarayici + node test ortak)
(function (root) {
  function parse(s) {
    if (typeof s === 'number') return s;
    const v = parseFloat(String(s).trim().replace(',', '.').replace('−', '-'));
    return isNaN(v) ? NaN : v;
  }
  // r: [r0,r90,r180,r270] mm ; cfg: {pitch(mm),K,tol(mm TIR),dir(+1/-1),a0(deg)}
  function analyze(r, cfg) {
    const ex = (r[0] - r[2]) / 2, ey = cfg.dir * (r[1] - r[3]) / 2;
    const mag = Math.hypot(ex, ey), tir = 2 * mag;
    const res = { ex, ey, mag, tir, ok: tir <= cfg.tol, actions: [] };
    if (res.ok) return res;
    const cx = -ex, cy = -ey, a0 = cfg.a0 * Math.PI / 180;
    const N = Math.round(cfg.nScrews || 6);
    if (N % 2 === 1) {
      // tek sayida vida: her vida ayri. t>0 sik, t<0 gevset (mm). Esit aralikli: sum(t)=0
      for (let i = 0; i < N; i++) {
        const ang = a0 + i * 2 * Math.PI / N;
        const t = -(2 / N) * (cx * Math.cos(ang) + cy * Math.sin(ang)) / cfg.K;
        const deg = Math.abs(t) / cfg.pitch * 360;
        if (deg < 0.02) continue;
        res.actions.push({ single: true, screw: i + 1, tighten: t > 0, deg });
      }
      res.actions.sort((a, b) => (a.tighten ? 1 : 0) - (b.tighten ? 1 : 0)); // once gevsetler
      return res;
    }
    const M = N / 2, factor = 2 / M;
    for (let p = 0; p < M; p++) {
      const ang = a0 + p * (Math.PI / M);
      const s = factor * (cx * Math.cos(ang) + cy * Math.sin(ang)) / cfg.K; // vida hareketi mm
      const deg = Math.abs(s) / cfg.pitch * 360;
      if (deg < 0.02) continue;
      const loose = s > 0 ? p : p + M, tight = s > 0 ? p + M : p;
      res.actions.push({ loose: loose + 1, tight: tight + 1, deg });
    }
    return res;
  }
  // onceki olcum (prev) + onceki turda uygulanan duzeltme -> gercek etki orani g
  // g = gercek_hareket / istenen_hareket. Yeni K = g*K (isaretli olabilir)
  function learn(prev, cur, K, tol) {
    const cx = -prev.ex, cy = -prev.ey;
    const n2 = cx * cx + cy * cy;
    // gurultuden ogrenmeyi onle: onceki TIR hedefin 2 kati ve en az 8 um olmali
    const minTir = Math.max(0.008, 2 * (tol || 0.005));
    if (2 * Math.sqrt(n2) < minTir) return null;
    const dx = cur.ex - prev.ex, dy = cur.ey - prev.ey;
    const g = (dx * cx + dy * cy) / n2;
    const pr = (dx * cy - dy * cx) / n2; // beklenen yone dik bilesen
    // etki beklenen dogrultuda degil => ayna (yon) hatasi
    if (Math.abs(pr) > 0.5 && Math.abs(pr) > 0.5 * Math.abs(g)) return { g, K, changed: false, mismatch: true };
    if (Math.abs(g) < 0.1) return { g, K, changed: false, reason: 'etki yok' };
    let nk = K * g;
    const sign = nk < 0 ? -1 : 1;
    nk = sign * Math.min(30, Math.max(0.3, Math.abs(nk)));
    return { g, K: nk, changed: true };
  }
  const api = { parse, analyze, learn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EDM = api;
})(typeof self !== 'undefined' ? self : this);


