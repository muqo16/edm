const { analyze, learn } = require('./logic.js');

// fizik modeli: vida i (aci a_i) ic yone itilince mil -u_i yonune kayar
function apply(e, acts, N, a0, pitch, trueK) {
  for (const a of acts) {
    const err = 1 + (Math.random() - .5) * .06; // +-3% el hatasi
    const mmv = a.deg / 360 * pitch * err;
    if (a.single) { // sikilan vida mili -u_i yonune iter
      const ang = (a0 + (360 / N) * (a.screw - 1)) * Math.PI / 180;
      const mv = trueK * mmv * (a.tighten ? -1 : 1);
      e[0] += mv * Math.cos(ang); e[1] += mv * Math.sin(ang);
    } else {
      const tAng = (a0 + (360 / N) * (a.tight - 1)) * Math.PI / 180;
      const mv = trueK * mmv * -1; // sikilan vidanin -u yonu
      e[0] += mv * Math.cos(tAng); e[1] += mv * Math.sin(tAng);
      const lAng = (a0 + (360 / N) * (a.loose - 1)) * Math.PI / 180; // gevseyen: +u yonu
      const lv = trueK * mmv;
      e[0] += lv * Math.cos(lAng); e[1] += lv * Math.sin(lAng);
    }
  }
}

function run(N, trueK, a0, e0, pitch, tol, noise, quant) {
  const cfg = { pitch, K: 3, tol, dir: 1, a0, nScrews: N };
  let e = [...e0], prev = null;
  for (let it = 1; it <= 12; it++) {
    const q = v => Math.round((v + (Math.random() - .5) * 2 * noise) / quant) * quant;
    const R = [q(e[0]), q(e[1]), q(-e[0]), q(-e[1])];
    const cur = analyze(R, cfg);
    if (prev) { const L = learn(prev, cur, cfg.K, cfg.tol); if (L && L.changed) cfg.K = L.K; }
    const res = analyze(R, cfg);
    if (res.ok) return it;
    prev = cur;
    apply(e, res.actions, N, a0, pitch, trueK);
  }
  return 99;
}

let allOk = true;
for (const [N, pitch] of [[4, .7], [5, .7], [6, .7], [6, 1.0], [7, .7], [8, 1.25]]) {
  const hist = {}; let fail = 0, T = 0;
  for (const tk of [0.8, 1.5, 2.5, 4, 6, -2.5, 10])
    for (const a0 of [0, 25, 77, 200])
      for (let t = 0; t < 150; t++) {
        const e0 = [(Math.random() - .5) * .12, (Math.random() - .5) * .12];
        const r = run(N, tk, a0, e0, pitch, 0.005, 0.0005, 0.001);
        T++; if (r === 99) fail++; else hist[r] = (hist[r] || 0) + 1;
      }
  if (fail) allOk = false;
  console.log(`${N} vida, hatve ${pitch}: ${T} senaryo | olcum sayisi dagilimi`, JSON.stringify(hist), '| yakinsamayan:', fail);
}

// Esik/sinir testleri
const c = { pitch: .7, K: 3, tol: .005, dir: 1, a0: 0, nScrews: 6 };
console.log('\nSinir testleri:');
console.log(' sifir okuma  ->', analyze([0, 0, 0, 0], c).ok ? 'OK(SIFIRLANDI)' : 'HATA');
console.log(' tolerans ici ->', analyze([.002, 0, -.002, 0], c).ok ? 'OK(SIFIRLANDI)' : 'HATA');
console.log(' parse("-0,012") =', require('./logic.js').parse('-0,012'), '| parse("1.5") =', require('./logic.js').parse('1.5'), '| parse("abc") =', require('./logic.js').parse('abc'));
const x = analyze([.030, .020, -.030, -.020], c);
const sum = x.actions.reduce((s, a) => s + a.deg * 0, 0);
console.log(' ornek(30,20,-30,-20 um) eylemler:', JSON.stringify(x.actions.map(a => ({ ...a, deg: +a.deg.toFixed(1) }))));
// 5 vida: toplam sikma = toplam gevsetme (mil kaymasin diye) kontrolu
const y = analyze([.03, -.02, -.03, .02], { ...c, nScrews: 5 });
const t = y.actions.reduce((s, a) => s + (a.tighten ? a.deg : -a.deg), 0);
console.log(' 5 vida: net sikma-gevsetme farki (0 olmali):', t.toFixed(6));
process.exit(allOk ? 0 : 1);

