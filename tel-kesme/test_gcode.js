const G = require('./gcode.js');

// Test 1: EXCETEK ekranindaki gercek P003 yay satirlari (Photo 2)
const p003Sample = `%
O0003
G90 G21 G42 H1
G00 X594.798 Y125.000
G01 X594.798 Y115.899
G02 X301.349 Y-5.651 I-293.449 J293.449
X7.899 Y115.899 I0.0 J415.0
G01 X7.899 Y125.000
G40
M02
%`;

const r1 = G.optimize(p003Sample, {
  mainE: 'E1511', safeE: 'E1512',
  useEntryExit: true, entryMm: 4, exitMm: 4,
  useCorner: true, cornerAngle: 15, cornerLeadMm: 2.5,
  useSegArc: true, segMaxMm: 120,
  useTab: true, tabMm: 2,
  useAwt: true
});

console.log('Test 1 (P003 Gercek Yaylar): ok =', r1.ok, '| totalLen =', r1.totalLen, 'mm | check =', JSON.stringify(r1.check));
console.log('  stats =', JSON.stringify(r1.stats), '| corners =', r1.corners.map(c => c.angle.toFixed(1) + 'deg'));
if (!r1.ok) { console.error('FAIL Test 1:', r1.check.errors); process.exit(1); }

// Test 2: Keskin 90 derece dikdortgen + yay karisik profil
const rectArc = `%
O0010
G90 G21
G00 X0.0 Y0.0
G41 H1 G01 X50.0 Y0.0
G01 X50.0 Y30.0
G03 X20.0 Y60.0 I-30.0 J0.0
G01 X0.0 Y60.0
G01 X0.0 Y0.0
G40
M30
%`;

const r2 = G.optimize(rectArc, {
  mainE: 'E1511', safeE: 'E1512',
  useEntryExit: true, entryMm: 4, exitMm: 4,
  useCorner: true, cornerAngle: 15, cornerLeadMm: 2.5,
  useSegArc: false, useTab: true, tabMm: 2, useAwt: true
});
console.log('Test 2 (Dikdortgen+Yay): ok =', r2.ok, '| totalLen =', r2.totalLen, 'mm | check =', JSON.stringify(r2.check));
console.log('  corners =', r2.corners.map(c => c.angle.toFixed(1) + 'deg'));
if (!r2.ok || r2.corners.length < 2) { console.error('FAIL Test 2'); process.exit(1); }

console.log('TUM G-KODU TESTLERI BASARILI');
