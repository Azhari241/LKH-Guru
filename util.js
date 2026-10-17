/* Utilitas tanggal & umum — Jurnal Harian Guru */
(function () {
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const BULAN_PREFIX = { jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, agu: 7, agt: 7, ags: 7, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11 };

  const pad = (n) => String(n).padStart(2, '0');
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const toISO = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const todayISO = () => toISO(new Date());
  const dayName = (iso) => HARI[parseISO(iso).getDay()];
  const fmtShort = (iso) => { const d = parseISO(iso); return `${pad(d.getDate())} ${BULAN_SINGKAT[d.getMonth()]} ${d.getFullYear()}`; };
  const fmtLong = (iso) => { const d = parseISO(iso); return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
  const periodOf = (iso) => iso.slice(0, 7);
  const periodLabel = (p) => { const [y, m] = p.split('-').map(Number); return `${BULAN[m - 1]} ${y}`; };
  const lastDayOfPeriod = (p) => { const [y, m] = p.split('-').map(Number); return toISO(new Date(y, m, 0)); };
  const shiftPeriod = (p, delta) => { const [y, m] = p.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

  /** "01 Sep 2026" / "1 September 2026" -> "2026-09-01" */
  function parseIndoDate(text) {
    const m = String(text || '').match(/(\d{1,2})\s*([A-Za-z]+)\.?\s*(\d{4})/);
    if (!m) return null;
    const mi = BULAN_PREFIX[m[2].slice(0, 3).toLowerCase()];
    if (mi === undefined) return null;
    const d = new Date(Number(m[3]), mi, Number(m[1]));
    return isNaN(d) ? null : toISO(d);
  }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

  function bufToB64(buf) {
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToBuf(b64) {
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function sortEntries(list) {
    return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.position || 0) - (b.position || 0) || String(a.created_at || '').localeCompare(String(b.created_at || ''))));
  }
  /** Satuan disimpan dengan "\n" untuk baris bertumpuk (mis. "Kegiatan\norang"). */
  const oneLine = (s) => String(s || '').replace(/\s*\n\s*/g, ' ').trim();

  window.U = { HARI, BULAN, BULAN_SINGKAT, pad, parseISO, toISO, todayISO, dayName, fmtShort, fmtLong, periodOf, periodLabel, lastDayOfPeriod, shiftPeriod, parseIndoDate, uid, bufToB64, b64ToBuf, downloadBlob, sortEntries, oneLine };
})();
