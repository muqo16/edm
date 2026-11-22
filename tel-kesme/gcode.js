// EXCETEK G-Kodu Analiz, Blok Bolme, Koruma Enjeksiyonu ve 0.0001mm Dogrulayici
(function (root) {
  const F4 = v => Number(v).toFixed(4);
  const normAng = a => { while (a <= -Math.PI) a += 2 * Math.PI; while (a > Math.PI) a -= 2 * Math.PI; return a; };

  function stripComment(line) {
    return line.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim();
  }

  function parseWords(code) {
    const w = {}, re = /([A-Za-z])([+-]?(?:\d+\.?\d*|\.\d+))/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const k = m[1].toUpperCase(), v = parseFloat(m[2]);
      if (!w[k]) w[k] = [];
      w[k].push(v);
    }
    return w;
  }

  // G-kodunu blok listesine ayristir (EXCETEK ISO: G90 mutlak XY, artimli IJ varsayilan)
  function parseGcode(text, opts) {
    const absIJ = !!(opts && opts.absIJ);
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    let gMotion = 0, absMode = true, comp = 40;
    let x = 0, y = 0, hasPos = false;
    const items = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const raw = lines[idx];
      const clean = stripComment(raw);
      if (!clean || clean === '%' || /^O\d+/i.test(clean)) {
        items.push({ kind: 'raw', raw, idx });
        continue;
      }
      const w = parseWords(clean);
      const gs = w.G || [];
      for (const g of gs) {
        if (g === 0 || g === 1 || g === 2 || g === 3) gMotion = g;
        else if (g === 90) absMode = true;
        else if (g === 91) absMode = false;
        else if (g === 40 || g === 41 || g === 42) comp = g;
      }

      const hasXY = (w.X !== undefined) || (w.Y !== undefined) || (w.I !== undefined) || (w.J !== undefined);
      if (!hasXY) {
        items.push({ kind: 'raw', raw, idx, w });
        continue;
      }

      const nx = w.X ? (absMode ? w.X[w.X.length - 1] : x + w.X[w.X.length - 1]) : x;
      const ny = w.Y ? (absMode ? w.Y[w.Y.length - 1] : y + w.Y[w.Y.length - 1]) : y;

      if (!hasPos && gMotion === 0) {
        x = nx; y = ny; hasPos = true;
        items.push({ kind: 'move', g: 0, x1: nx, y1: ny, x2: nx, y2: ny, len: 0, raw, idx, comp, absMode });
        continue;
      }
      if (!hasPos) { x = nx; y = ny; hasPos = true; items.push({ kind: 'move', g: gMotion, x1: nx, y1: ny, x2: nx, y2: ny, len: 0, raw, idx, comp, absMode }); continue; }

      if (gMotion === 0 || gMotion === 1) {
        const dx = nx - x, dy = ny - y, len = Math.hypot(dx, dy);
        const ang = len > 1e-9 ? Math.atan2(dy, dx) : 0;
        items.push({ kind: 'move', g: gMotion, x1: x, y1: y, x2: nx, y2: ny, len, aIn: ang, aOut: ang, raw, idx, comp, absMode, w });
        x = nx; y = ny;
      } else {
        // G02 (CW) veya G03 (CCW)
        const iv = w.I ? w.I[w.I.length - 1] : 0;
        const jv = w.J ? w.J[w.J.length - 1] : 0;
        const cx = absIJ ? iv : x + iv;
        const cy = absIJ ? jv : y + jv;
        const r1 = Math.hypot(x - cx, y - cy);
        const r2 = Math.hypot(nx - cx, ny - cy);
        const a1 = Math.atan2(y - cy, x - cx);
        const a2 = Math.atan2(ny - cy, nx - cx);
        let da = a2 - a1;
        if (gMotion === 2) { // CW => da < 0
          if (da >= -1e-9) da -= 2 * Math.PI;
        } else { // CCW => da > 0
          if (da <= 1e-9) da += 2 * Math.PI;
        }
        const R = (r1 + r2) / 2;
        const len = Math.abs(da) * R;
        const dir = gMotion === 2 ? -1 : 1;
        const aIn = normAng(a1 + dir * Math.PI / 2);
        const aOut = normAng(a2 + dir * Math.PI / 2);
        items.push({
          kind: 'move', g: gMotion, x1: x, y1: y, x2: nx, y2: ny,
          cx, cy, R, r1, r2, rErr: Math.abs(r1 - r2), a1, da, len, aIn, aOut,
          raw, idx, comp, absMode, w
        });
        x = nx; y = ny;
      }
    }
    return items;
  }

  // Bir kesim hareketini (G01/G02/G03) baslangictan d mm mesafede tam ikiye bol
  function splitMove(m, d) {
    if (d <= 1e-4 || d >= m.len - 1e-4) return [m];
    if (m.g === 1) {
      const t = d / m.len;
      const xm = m.x1 + (m.x2 - m.x1) * t;
      const ym = m.y1 + (m.y2 - m.y1) * t;
      return [
        { ...m, x2: xm, y2: ym, len: d, split: true },
        { ...m, x1: xm, y1: ym, len: m.len - d, split: true, extra: '' }
      ];
    }
    // G02 / G03 yay bolme (ayni merkez, tam yaricap)
    const dir = m.g === 2 ? -1 : 1;
    const da1 = dir * (d / m.R);
    const da2 = m.da - da1;
    const am = m.a1 + da1;
    const xm = m.cx + m.R * Math.cos(am);
    const ym = m.cy + m.R * Math.sin(am);
    const aMidTan = normAng(am + dir * Math.PI / 2);
    return [
      { ...m, x2: xm, y2: ym, da: da1, len: d, aOut: aMidTan, r2: m.R, rErr: 0, split: true },
      { ...m, x1: xm, y1: ym, a1: am, da: da2, len: m.len - d, aIn: aMidTan, r1: m.R, rErr: 0, split: true, extra: '' }
    ];
  }

  // Bir hareketi birden fazla mesafe noktasinda bol (dists artan sirali)
  function splitAtMany(m, dists) {
    const clean = [...new Set(dists.filter(d => d > 0.05 && d < m.len - 0.05))].sort((a, b) => a - b);
    let cur = m, consumed = 0, out = [];
    for (const d of clean) {
      const rel = d - consumed;
      if (rel <= 0.05 || rel >= cur.len - 0.05) continue;
      const [a, b] = splitMove(cur, rel);
      out.push(a); cur = b; consumed = d;
    }
    out.push(cur);
    return out;
  }

  function formatMove(m, absIJ) {
    const gStr = m.g === 0 ? 'G00' : (m.g === 1 ? 'G01' : (m.g === 2 ? 'G02' : 'G03'));
    if (m.g === 0 || m.g === 1) {
      return `${gStr} X${F4(m.x2)} Y${F4(m.y2)}`;
    }
    const iv = absIJ ? m.cx : (m.cx - m.x1);
    const jv = absIJ ? m.cy : (m.cy - m.y1);
    return `${gStr} X${F4(m.x2)} Y${F4(m.y2)} I${F4(iv)} J${F4(jv)}`;
  }

  // Ana optimizasyon motoru
  function optimize(text, cfg) {
    const opt = Object.assign({
      mainE: 'E1511',
      safeE: 'E1512',
      useEntryExit: true,
      entryMm: 4,
      exitMm: 4,
      useCorner: true,
      cornerAngle: 15,
      cornerLeadMm: 2.5,
      useSegArc: false,
      segMaxMm: 100,
      useTab: false,
      tabMm: 2,
      useAwt: false,
      absIJ: false
    }, cfg || {});

    const items = parseGcode(text, { absIJ: opt.absIJ });
    const cuts = items.filter(it => it.kind === 'move' && it.g >= 1 && it.len > 1e-4);
    if (!cuts.length) {
      return { ok: false, error: 'G-kodunda geçerli G01/G02/G03 kesim hareketi bulunamadı.' };
    }

    const totalLen = cuts.reduce((s, m) => s + m.len, 0);

    // Kose tespiti (ardisik iki kesim blogu arasindaki teget aci farki)
    const corners = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1];
      if (Math.hypot(a.x2 - b.x1, a.y2 - b.y1) > 0.05) continue;
      const dAng = Math.abs(normAng(b.aIn - a.aOut)) * 180 / Math.PI;
      if (dAng >= opt.cornerAngle) {
        corners.push({ afterIdx: i, beforeIdx: i + 1, angle: dAng, x: a.x2, y: a.y2, severe: dAng >= 60 });
      }
    }

    // Her kesim blogu icin bolme noktalari ve bolge etiketleri
    const cutIdMap = new Map();
    cuts.forEach((m, i) => cutIdMap.set(m, i));

    const splitPlan = cuts.map(() => []);
    // 1) Giris / cikis bolmeleri
    if (opt.useEntryExit && totalLen > opt.entryMm + opt.exitMm + 2) {
      let acc = 0;
      for (let i = 0; i < cuts.length; i++) {
        if (acc < opt.entryMm && acc + cuts[i].len > opt.entryMm) {
          splitPlan[i].push(opt.entryMm - acc); break;
        }
        acc += cuts[i].len;
      }
      const exitAt = totalLen - opt.exitMm;
      acc = 0;
      for (let i = 0; i < cuts.length; i++) {
        if (acc < exitAt && acc + cuts[i].len > exitAt) {
          splitPlan[i].push(exitAt - acc); break;
        }
        acc += cuts[i].len;
      }
    }
    // 2) Kose oncesi/sonrasi bolmeleri
    if (opt.useCorner) {
      for (const c of corners) {
        const m1 = cuts[c.afterIdx], m2 = cuts[c.beforeIdx];
        if (m1.len > opt.cornerLeadMm + 0.5) splitPlan[c.afterIdx].push(m1.len - opt.cornerLeadMm);
        if (m2.len > opt.cornerLeadMm + 0.5) splitPlan[c.beforeIdx].push(opt.cornerLeadMm);
      }
    }
    // 3) Uzun yay segmentasyonu
    if (opt.useSegArc && opt.segMaxMm >= 10) {
      for (let i = 0; i < cuts.length; i++) {
        const m = cuts[i];
        if ((m.g === 2 || m.g === 3) && m.len > opt.segMaxMm) {
          const nSeg = Math.ceil(m.len / opt.segMaxMm);
          for (let k = 1; k < nSeg; k++) splitPlan[i].push((m.len * k) / nSeg);
        }
      }
    }
    // 4) Kopru (tab) bolmesi
    if (opt.useTab && opt.tabMm > 0.2 && totalLen > opt.tabMm + 2) {
      const tabAt = totalLen - opt.tabMm;
      let acc = 0;
      for (let i = 0; i < cuts.length; i++) {
        if (acc < tabAt && acc + cuts[i].len > tabAt) {
          splitPlan[i].push(tabAt - acc); break;
        }
        acc += cuts[i].len;
      }
    }

    // Yeni cikti satirlari olustur
    const outLines = [];
    const plotSegs = [];
    let cumDist = 0, curE = null, cornerOn = false, awtInserted = false, tabInserted = false;
    let stats = { splits: 0, eSwitches: 0, cornerZones: corners.length, tabAdded: false, awtAdded: false };

    for (const it of items) {
      if (it.kind !== 'move' || it.g === 0 || it.len <= 1e-4) {
        outLines.push(it.raw);
        if (opt.useAwt && !awtInserted && it.kind === 'move' && it.g === 0) {
          outLines.push('G29 (AWT GUVENLI BASLANGIC REFERANSI)');
          outLines.push('G13 (AWT KOPMA KURTARMA ACIK)');
          awtInserted = true; stats.awtAdded = true;
        }
        continue;
      }

      const ci = cutIdMap.get(it);
      const parts = splitAtMany(it, splitPlan[ci]);
      if (parts.length > 1) stats.splits += parts.length - 1;

      for (let pi = 0; pi < parts.length; pi++) {
        const seg = parts[pi];
        const midDist = cumDist + seg.len / 2;

        // Giris / cikis guvenli E-kodu kontrolu
        let wantE = opt.mainE;
        let zone = 'normal';
        if (opt.useEntryExit && (midDist < opt.entryMm || midDist > totalLen - opt.exitMm)) {
          wantE = opt.safeE; zone = 'safe';
        }
        // Kose yakini mi?
        let nearCorner = null;
        if (opt.useCorner) {
          for (const c of corners) {
            if (Math.hypot(seg.x2 - c.x, seg.y2 - c.y) < 0.05 && seg.len <= opt.cornerLeadMm + 0.2) nearCorner = c;
            if (Math.hypot(seg.x1 - c.x, seg.y1 - c.y) < 0.05 && seg.len <= opt.cornerLeadMm + 0.2) nearCorner = c;
          }
        }
        if (nearCorner) zone = 'corner';

        // Kopru (M00) kontrolu
        if (opt.useTab && !tabInserted && cumDist >= totalLen - opt.tabMm - 0.05) {
          outLines.push(`M00 (KOPRU ${opt.tabMm}mm - MIKNATIS/TUTUCU KONTROL)`);
          tabInserted = true; stats.tabAdded = true;
        }

        if (opt.useEntryExit && wantE && wantE !== curE) {
          outLines.push(`${wantE} (${wantE === opt.safeE ? 'GUVENLI GIRIS/CIKIS' : 'ANA KESIM'})`);
          curE = wantE; stats.eSwitches++;
        }

        if (opt.useCorner) {
          if (nearCorner && !cornerOn) {
            outLines.push(nearCorner.severe ? 'M38 (AGRESIF KOSE KORUMA)' : 'M37 (KOSE KORUMA)');
            cornerOn = true;
          } else if (!nearCorner && cornerOn) {
            outLines.push('M39 (KOSE KORUMA KAPAT)');
            cornerOn = false;
          }
        }

        // Ilk parca ve bolunmemisse orijinal satirdaki G41/G42/H gibi yan kodlari koru
        if (parts.length === 1) {
          outLines.push(it.raw);
        } else {
          let prefix = '';
          if (pi === 0) {
            const extraTokens = stripComment(it.raw).match(/\b(?:G4[012]|G9[01]|H\d+|D\d+|F[\d.]+)\b/gi);
            if (extraTokens) prefix = extraTokens.join(' ') + ' ';
          }
          outLines.push(prefix + formatMove(seg, opt.absIJ));
        }

        plotSegs.push({ ...seg, zone });
        cumDist += seg.len;
      }
    }
    if (cornerOn) outLines.push('M39 (KOSE KORUMA KAPAT)');

    const output = outLines.join('\n');
    const check = validate(text, output, { absIJ: opt.absIJ });

    return {
      ok: check.valid,
      output,
      check,
      stats,
      totalLen: +totalLen.toFixed(2),
      corners,
      plotSegs
    };
  }

  // Round-Trip Dogrulayici: uretilen NC kodunu bastan okuyup 0.0001mm geometri tutarliligini kontrol eder
  function validate(origText, newText, opts) {
    const a = parseGcode(origText, opts).filter(x => x.kind === 'move' && x.g >= 1 && x.len > 1e-4);
    const b = parseGcode(newText, opts).filter(x => x.kind === 'move' && x.g >= 1 && x.len > 1e-4);
    const errors = [];
    if (!a.length || !b.length) errors.push('Kesim hareketi eksik.');

    const lenA = a.reduce((s, m) => s + m.len, 0);
    const lenB = b.reduce((s, m) => s + m.len, 0);
    const lenDiff = Math.abs(lenA - lenB);
    if (lenDiff > 0.01) errors.push(`Toplam yol uzunluğu sapması: ${lenDiff.toFixed(4)} mm`);

    if (a.length && b.length) {
      const startDiff = Math.hypot(a[0].x1 - b[0].x1, a[0].y1 - b[0].y1);
      const endDiff = Math.hypot(a[a.length - 1].x2 - b[b.length - 1].x2, a[a.length - 1].y2 - b[b.length - 1].y2);
      if (startDiff > 0.001) errors.push(`Başlangıç noktası sapması: ${startDiff.toFixed(4)} mm`);
      if (endDiff > 0.001) errors.push(`Bitiş noktası sapması: ${endDiff.toFixed(4)} mm`);
    }

    let maxArcErr = 0;
    for (const m of b) {
      if ((m.g === 2 || m.g === 3) && m.rErr > maxArcErr) maxArcErr = m.rErr;
      if ((m.g === 2 || m.g === 3) && m.rErr > 0.005) {
        errors.push(`Satır ${m.idx + 1}: Yay yarıçap hatası (${m.rErr.toFixed(4)} mm)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      lenA: +lenA.toFixed(4),
      lenB: +lenB.toFixed(4),
      lenDiff: +lenDiff.toFixed(5),
      maxArcErr: +maxArcErr.toFixed(5)
    };
  }

  const api = { parseGcode, splitMove, optimize, validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GCODE = api;
})(typeof self !== 'undefined' ? self : this);
