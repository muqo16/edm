// EXCETEK Tel Erozyon Parametre & Kopma Analiz Cekirdegi (tarayici + node ortak)
(function (root) {
  // Referans: EXCETEK NO.1511 (Brass 0.25mm, SKD 10mm, NORMAL)
  const BASE_1511 = { PM: 10, OV: 5, ON: 13, OFF: 9, AON: 6, AOFF: 9, SV: 34, WT: 10, WF: 7, WA: 4, FR: 200, F: 4.1 };

  const MAT = {
    skd: { name: 'SKD / Takım Çeliği', dON: 0, dOFF: 0, dSV: 0, speedK: 1.0 },
    steel: { name: 'Çelik (S45C / 1040)', dON: 0, dOFF: -1, dSV: -1, speedK: 1.05 },
    ss: { name: 'Paslanmaz (304 / 316)', dON: -1, dOFF: 2, dSV: 3, speedK: 0.85 },
    alu: { name: 'Alüminyum', dON: -2, dOFF: 3, dSV: 4, speedK: 1.35 },
    carbide: { name: 'Karbür (WC)', dON: -3, dOFF: 4, dSV: 6, speedK: 0.55 },
    copper: { name: 'Bakır / Pirinç', dON: -1, dOFF: 2, dSV: 3, speedK: 0.90 }
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

  function compute(inp) {
    const mat = MAT[inp.mat] || MAT.skd;
    const th = Math.max(1, +inp.th || 12.5);
    const flush = inp.flush || 'single'; // closed, single (alt bos/ust yakin), double (ikisi de acik)
    const gap = Math.max(0, +inp.gap || 0); // Alt veya ust en buyuk nozul boslugu (mm)
    const cond = Math.max(1, +inp.cond || 15); // Su iletkenligi (uS)
    const wire = +inp.wire || 0.25;
    const coated = !!inp.coated;
    const profile = inp.profile || 'arc'; // straight, arc, taper, corner
    const mode = inp.mode || 'safe'; // safe, balanced, fast

    // Risk puani (0..100)
    let risk = 10;
    const warnings = [];
    if (flush === 'double') {
      risk += 45;
      warnings.push(`Çift taraflı açık su basma (${gap} mm). EXCETEK ekranında NORMAL yerine "Open" modunu seçin.`);
    } else if (flush === 'single') {
      risk += 30;
      warnings.push(`Tek taraflı açık su (üst nozul yakın, alt nozul fikstür yüzünden ~${gap} mm aşağıda). Alt basınç yarığa girmediği için SV ve OFF artırılmalı.`);
    } else if (gap >= 5) {
      risk += 20;
      warnings.push(`Nozul boşluğu (${gap} mm). Su basıncı kaçar; OFF ve SV artırın.`);
    }
    if (cond >= 20) {
      risk += 20;
      warnings.push(`Su iletkenliği yüksek (${cond} µS). Reçineyi yenileyip 8–14 µS bandına indirin.`);
    } else if (cond >= 16) {
      risk += 10;
      warnings.push(`Su iletkenliği sınırda (${cond} µS). 10–14 µS arası daha kararlıdır.`);
    }
    if (profile === 'arc' || profile === 'taper') {
      risk += 12;
      warnings.push('Kavisli/eğik kesimde cüruf tahliyesi zorlaşır; WF artırıp SV yükseltmek kopmayı önler.');
    } else if (profile === 'corner') {
      risk += 15;
      warnings.push('Keskin köşelerde ark yığılması olur; köşe kontrolünü (AOFF/SV) güvenli tutun.');
    }
    if (wire <= 0.20) {
      risk += 10;
      warnings.push(`İnce tel (${wire} mm) daha düşük enerji (ON) ve gerginlik (WT) ister.`);
    }
    risk = Math.min(100, risk);

    // Baslangic parametreleri
    let PM = 10;
    let OV = 5;
    let ON = 12 + mat.dON;
    let OFF = 10 + mat.dOFF;
    let AON = 6;
    let AOFF = 10 + Math.max(0, mat.dOFF);
    let SV = 36 + mat.dSV;
    let WT = wire >= 0.25 ? 10 : (wire >= 0.20 ? 7 : 5);
    let WF = 8;
    let WA = 4;
    let FR = 100;

    // Kalinlik etkisi (12.5mm civari referans)
    if (th > 25) { ON += 1; OFF += 2; SV += 2; }
    else if (th < 8) { ON -= 2; OFF += 1; SV += 2; }

    // Acik su basma duzeltmesi
    if (flush === 'double') {
      ON -= 2; OFF += 5; AON = 5; AOFF += 4; SV += 8; WF += 2; WT -= 1; WA = 5;
    } else if (flush === 'single') {
      ON -= 1; OFF += 3; AON = 5; AOFF += 2; SV += 5; WF += 2; WT -= 1; WA = 5;
    } else if (gap >= 5) {
      ON -= 1; OFF += 2; AOFF += 2; SV += 3; WF += 1; WA = 5;
    }

    // Iletkenlik duzeltmesi
    if (cond >= 20) { OFF += 1; AOFF += 1; SV += 2; }
    else if (cond >= 16) { OFF += 1; }

    // Profil etkisi
    if (profile === 'arc' || profile === 'taper') { OFF += 1; SV += 1; WF += 1; }
    if (profile === 'corner') { AOFF += 2; SV += 2; }

    // Tel capi & kaplama
    if (wire < 0.25) { ON -= 2; OFF += 1; }
    if (wire >= 0.30) { ON += 1; WT += 2; }
    if (coated) { ON += 1; OFF -= 1; WF -= 1; }

    // Mod ayari
    if (mode === 'safe') {
      OFF += 1;
      AOFF += 1;
      SV += 1;
      FR = 100;
    } else if (mode === 'fast') {
      if (flush === 'closed') { ON += 1; OFF -= 1; SV -= 2; FR = 130; }
      else { ON += 1; OFF -= 1; SV -= 2; FR = 100; }
    }

    const params = {
      PM: clamp(PM, 6, 12),
      OV: clamp(OV, 3, 7),
      ON: clamp(ON, 5, 16),
      OFF: clamp(OFF, 7, 22),
      AON: clamp(AON, 3, 10),
      AOFF: clamp(AOFF, 8, 20),
      SV: clamp(SV, 30, 52),
      WT: clamp(WT, 4, 14),
      WF: clamp(WF, 5, 14),
      WA: clamp(WA, 2, 7),
      FR: clamp(FR, 80, 150)
    };

    // Tahmini kesim hizi (mm/dk)
    const duty = params.ON / (params.ON + params.OFF);
    const baseDuty = 13 / (13 + 9);
    const svFactor = Math.pow(34 / params.SV, 0.7);
    const thFactor = Math.pow(12 / th, 0.72);
    const estF = Math.max(0.8, Math.min(6.5, 4.1 * (duty / baseDuty) * svFactor * thFactor * mat.speedK * (coated ? 1.15 : 1)));

    // EXCETEK "Other" dugme onerisi
    const excetekMode = flush !== 'closed' ? 'Open' : (mode === 'safe' ? 'SLOW' : 'NORMAL');

    return {
      params,
      base: BASE_1511,
      risk,
      riskLabel: risk >= 65 ? 'KRİTİK' : (risk >= 40 ? 'YÜKSEK' : (risk >= 22 ? 'ORTA' : 'DÜŞÜK')),
      excetekMode,
      estF: +estF.toFixed(2),
      warnings
    };
  }

  // Gercek sure karsilastirma (dakika)
  function compareTime(lenMm, fastF, fastBreaksPerHr, manRatio, autoMin, manMin, safeF, safeBreaksPerHr) {
    const fastCut = lenMm / Math.max(0.2, fastF);
    const fastBreaks = (fastCut / 60) * fastBreaksPerHr;
    const avgDowntime = (1 - manRatio) * autoMin + manRatio * manMin;
    const fastTotal = fastCut + fastBreaks * avgDowntime;

    const safeCut = lenMm / Math.max(0.2, safeF);
    const safeBreaks = (safeCut / 60) * safeBreaksPerHr;
    const safeTotal = safeCut + safeBreaks * avgDowntime;

    return {
      fastCut: Math.round(fastCut),
      fastBreaks: +fastBreaks.toFixed(1),
      fastTotal: Math.round(fastTotal),
      safeCut: Math.round(safeCut),
      safeBreaks: +safeBreaks.toFixed(1),
      safeTotal: Math.round(safeTotal),
      savedMin: Math.round(fastTotal - safeTotal)
    };
  }

  const api = { compute, compareTime, BASE_1511, MAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WIRE = api;
})(typeof self !== 'undefined' ? self : this);
