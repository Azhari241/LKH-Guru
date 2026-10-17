/*
 * DocxEngine — membaca & mengisi template Word (.docx) ASLI tanpa mendesain ulang.
 * Prinsip: semua elemen template (kop, logo, garis, font, margin, tabel, lebar kolom,
 * tanda tangan) dipertahankan. Engine hanya mengganti TEKS pada bagian yang dikenali,
 * dan menggandakan baris prototipe tabel kegiatan untuk setiap kegiatan.
 */
(function (root) {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';
  const U = root.U;

  const isEl = (n, name) => n && n.nodeType === 1 && n.namespaceURI === W && (!name || n.localName === name);
  const kids = (el, name) => { const out = []; for (let n = el.firstChild; n; n = n.nextSibling) if (isEl(n, name)) out.push(n); return out; };
  const kid = (el, name) => kids(el, name)[0] || null;
  const all = (el, name) => { const l = el.getElementsByTagNameNS(W, name); const out = []; for (let i = 0; i < l.length; i++) out.push(l[i]); return out; };
  const inGraphic = (n) => { for (let p = n.parentNode; p; p = p.parentNode) { if (p.nodeType === 1 && /^(txbxContent|drawing|pict|AlternateContent)$/.test(p.localName)) return true; } return false; };
  const texts = (el) => all(el, 't').filter((t) => !inGraphic(t));
  const textOf = (el) => texts(el).map((t) => t.textContent).join('');
  const mk = (doc, name) => doc.createElementNS(W, 'w:' + name);
  const setAttr = (el, name, val) => el.setAttributeNS(W, 'w:' + name, val);
  const getAttr = (el, name) => (el ? el.getAttributeNS(W, name) || el.getAttribute('w:' + name) : null);

  function stripIds(node) {
    const walk = (n) => {
      if (n.nodeType !== 1) return;
      if (n.hasAttributeNS && (n.hasAttributeNS(W14, 'paraId') || n.hasAttributeNS(W14, 'textId'))) {
        n.removeAttributeNS(W14, 'paraId'); n.removeAttributeNS(W14, 'textId');
      }
      for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
    };
    walk(node); return node;
  }

  function mkT(doc, text) {
    const t = mk(doc, 't');
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    t.textContent = text;
    return t;
  }
  function setT(t, text) {
    t.textContent = text;
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }
  function removeT(t) {
    const r = t.parentNode; r.removeChild(t);
    if (isEl(r, 'r') && !kids(r).some((c) => c.localName !== 'rPr')) {
      const par = r.parentNode; par.removeChild(r);
      if (isEl(par, 'hyperlink') && !kids(par, 'r').length) par.parentNode.removeChild(par);
    }
  }
  /** rPr tanda paragraf -> rPr run yang valid (buang ins/del/move/rPrChange). */
  function cleanRPr(rPr) {
    kids(rPr).forEach((c) => { if (/^(ins|del|moveFrom|moveTo|rPrChange)$/.test(c.localName)) rPr.removeChild(c); });
    return rPr;
  }
  function firstRunRPr(p) {
    for (const r of all(p, 'r')) { if (kid(r, 't') && !inGraphic(r)) { const rp = kid(r, 'rPr'); return rp ? rp.cloneNode(true) : null; } }
    const pPr = kid(p, 'pPr'); const mrp = pPr && kid(pPr, 'rPr');
    return mrp ? cleanRPr(mrp.cloneNode(true)) : null;
  }

  function setParagraphText(p, text) {
    const doc = p.ownerDocument; const ts = texts(p);
    if (!ts.length) {
      const r = mk(doc, 'r'); const rp = firstRunRPr(p); if (rp) r.appendChild(rp);
      r.appendChild(mkT(doc, text)); p.appendChild(r); return;
    }
    setT(ts[0], text);
    for (let i = 1; i < ts.length; i++) removeT(ts[i]);
  }

  /** "LABEL<tab>: nilai" -> mengganti nilai setelah titik dua, format run tetap. */
  function setValueAfterColon(p, value) {
    const ts = texts(p);
    const i = ts.findIndex((t) => t.textContent.includes(':'));
    if (i < 0) return false;
    const s = ts[i].textContent; const k = s.indexOf(':');
    const gap = (s.slice(k + 1).match(/^\s*/) || [''])[0] || ' ';
    setT(ts[i], s.slice(0, k + 1) + gap + value);
    for (let j = ts.length - 1; j > i; j--) removeT(ts[j]);
    return true;
  }

  // ---------- Arab (RTL) ----------
  const AR = '\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF';
  const AR_SEG = new RegExp(`[(\\[]*[${AR}][${AR}\\s()\\[\\]\u060C\u061B\u061F.!:\\-]*`, 'g');
  function splitBidi(line) {
    const out = []; let last = 0; let m;
    AR_SEG.lastIndex = 0;
    while ((m = AR_SEG.exec(line))) {
      let seg = m[0]; const trail = (seg.match(/\s+$/) || [''])[0];
      seg = seg.slice(0, seg.length - trail.length);
      if (m.index > last) out.push({ text: line.slice(last, m.index), rtl: false });
      out.push({ text: seg, rtl: true });
      last = m.index + seg.length;
      AR_SEG.lastIndex = last;
    }
    if (last < line.length) out.push({ text: line.slice(last), rtl: false });
    return out.filter((s) => s.text.length);
  }
  const RPR_AFTER_RTL = ['cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
  function makeRtlRPr(doc, rPr) {
    const rp = rPr ? rPr.cloneNode(true) : mk(doc, 'rPr');
    let f = kid(rp, 'rFonts');
    if (!f) { f = mk(doc, 'rFonts'); const before = kids(rp).find((c) => c.localName !== 'rStyle'); rp.insertBefore(f, before || null); }
    setAttr(f, 'hint', 'cs');
    if (!kid(rp, 'rtl')) {
      const rtl = mk(doc, 'rtl');
      const ref = kids(rp).find((c) => RPR_AFTER_RTL.includes(c.localName));
      rp.insertBefore(rtl, ref || null);
    }
    return rp;
  }

  function setCellLines(tc, lines, opt = {}) {
    const doc = tc.ownerDocument;
    const ps = kids(tc, 'p');
    const proto = ps[0] || mk(doc, 'p');
    const rPr = firstRunRPr(proto);
    const pPr = kid(proto, 'pPr');
    kids(tc).forEach((c) => { if (c.localName !== 'tcPr') tc.removeChild(c); });
    const list = lines && lines.length ? lines : [''];
    list.forEach((line) => {
      const p = stripIds(proto.cloneNode(false));
      if (pPr) p.appendChild(pPr.cloneNode(true));
      const segs = opt.bidi ? splitBidi(line) : [{ text: line, rtl: false }];
      segs.forEach((s) => {
        if (!s.text) return;
        const r = mk(doc, 'r');
        const rp = s.rtl ? makeRtlRPr(doc, rPr) : (rPr ? rPr.cloneNode(true) : null);
        if (rp) r.appendChild(rp);
        r.appendChild(mkT(doc, s.text));
        p.appendChild(r);
      });
      tc.appendChild(p);
    });
  }
  const cellLines = (tc) => (tc ? kids(tc, 'p').map((p) => textOf(p).replace(/\s+/g, ' ').trim()).filter(Boolean) : []);
  const vMergeOf = (tc) => { const pr = tc && kid(tc, 'tcPr'); const vm = pr && kid(pr, 'vMerge'); if (!vm) return null; return getAttr(vm, 'val') === 'restart' ? 'restart' : 'continue'; };
  const hasLineShape = (p) => {
    const els = p.getElementsByTagName('*');
    for (let i = 0; i < els.length; i++) { const e = els[i]; if ((e.localName === 'prstGeom' && e.getAttribute('prst') === 'line') || e.localName === 'line') return true; }
    return false;
  };

  const ID_KEYS = [
    ['nama', /^NAMA$/], ['nip', /^NIP$/], ['pangkat', /^(PANGKAT|GOLONGAN)/], ['mapel', /^(MATAPELAJARAN|MAPEL)/], ['bulan', /^(BULAN|PERIODE)/], ['jabatan', /^JABATAN$/],
  ];
  const PLACE_DATE = /([A-Za-z][A-Za-z .'-]*?)\s*,\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*$/;

  /** Analisis struktur template. Mengembalikan referensi node + ringkasan info. */
  function analyze(doc) {
    const body = all(doc, 'body')[0];
    if (!body) throw new Error('document.xml tidak valid.');
    const blocks = kids(body).filter((n) => n.localName === 'p' || n.localName === 'tbl');
    const main = blocks.find((b) => b.localName === 'tbl' && kids(b, 'tr')[0] && /deskripsi|uraian/i.test(textOf(kids(b, 'tr')[0])));
    if (!main) throw new Error('Tabel kegiatan (kolom "Deskripsi Kegiatan") tidak ditemukan di template.');
    const mainIdx = blocks.indexOf(main);
    const rows = kids(main, 'tr');
    let headerCount = 0;
    while (headerCount < rows.length) { const trPr = kid(rows[headerCount], 'trPr'); if (trPr && kid(trPr, 'tblHeader')) headerCount++; else break; }
    if (!headerCount) headerCount = 1;
    const cols = {};
    kids(rows[headerCount - 1], 'tc').forEach((tc, i) => {
      const t = textOf(tc).toLowerCase().replace(/\s+/g, ' ').trim();
      if (cols.no === undefined && /^(no\b|no\.|nomor)/.test(t)) cols.no = i;
      else if (cols.tanggal === undefined && /tanggal|hari/.test(t)) cols.tanggal = i;
      else if (cols.deskripsi === undefined && /deskripsi|uraian|kegiatan/.test(t)) cols.deskripsi = i;
      else if (cols.satuan === undefined && /satuan/.test(t)) cols.satuan = i;
      else if (cols.jumlah === undefined && /jumlah|volume|jml/.test(t)) cols.jumlah = i;
      else if (cols.evidence === undefined && /evid|bukti/.test(t)) cols.evidence = i;
    });
    if (cols.deskripsi === undefined) throw new Error('Kolom "Deskripsi Kegiatan" tidak ditemukan.');
    const dataRows = rows.slice(headerCount);
    if (!dataRows.length) throw new Error('Template harus memiliki minimal satu baris kegiatan contoh di bawah judul tabel.');
    const dcol = cols.tanggal !== undefined ? cols.tanggal : cols.no;
    const protoFirst = dataRows.find((r) => { const tc = kids(r, 'tc')[dcol]; return tc && (vMergeOf(tc) === 'restart' || textOf(tc).trim()); }) || dataRows[0];
    let protoCont = dataRows.find((r) => { const tc = kids(r, 'tc')[dcol]; return tc && vMergeOf(tc) === 'continue'; });
    if (!protoCont) {
      protoCont = protoFirst.cloneNode(true);
      ['no', 'tanggal'].forEach((k) => {
        const tc = cols[k] !== undefined && kids(protoCont, 'tc')[cols[k]];
        const vm = tc && kid(kid(tc, 'tcPr') || tc, 'vMerge');
        if (vm) { vm.removeAttributeNS(W, 'val'); vm.removeAttribute('w:val'); }
      });
    }

    // Identitas, kop & judul (sebelum tabel)
    const before = blocks.slice(0, mainIdx).filter((b) => b.localName === 'p');
    const identity = {}; const identityNodes = {};
    let firstIdIdx = -1;
    before.forEach((p, i) => {
      const t = textOf(p); const k = t.indexOf(':'); if (k < 0) return;
      const label = t.slice(0, k).replace(/[^A-Za-z]/g, '').toUpperCase();
      const hit = ID_KEYS.find(([, re]) => re.test(label));
      if (hit && !identityNodes[hit[0]]) { identityNodes[hit[0]] = p; identity[hit[0]] = t.slice(k + 1).trim(); if (firstIdIdx < 0) firstIdIdx = i; }
    });
    const head = firstIdIdx >= 0 ? before.slice(0, firstIdIdx) : before;
    const lineIdx = head.findIndex(hasLineShape);
    let kopNodes, titleNodes;
    if (lineIdx >= 0) { kopNodes = head.slice(0, lineIdx).filter((p) => textOf(p).trim()); titleNodes = head.slice(lineIdx + 1).filter((p) => textOf(p).trim()); }
    else { const ne = head.filter((p) => textOf(p).trim()); kopNodes = ne.slice(0, -1); titleNodes = ne.slice(-1); }

    // Tempat & tanggal, tanda tangan (setelah tabel)
    const after = blocks.slice(mainIdx + 1);
    const placeNode = after.find((b) => b.localName === 'p' && PLACE_DATE.test(textOf(b).trim()));
    const placeMatch = placeNode ? textOf(placeNode).trim().match(PLACE_DATE) : null;
    const sigTable = after.find((b) => b.localName === 'tbl');
    const signers = {};
    if (sigTable) {
      all(sigTable, 'tc').forEach((tc) => {
        const ps = kids(tc, 'p').filter((p) => textOf(p).trim());
        if (ps.length < 2) return;
        const last = ps[ps.length - 1]; const lt = textOf(last).trim();
        const hasNip = /^NIP/i.test(lt);
        const nameP = hasNip ? ps[ps.length - 2] : last;
        const roleText = ps.slice(0, hasNip ? -2 : -1).map((p) => textOf(p).trim()).join(' ');
        const key = /kepala/i.test(roleText) ? 'kepala' : /guru|pegawai|yang membuat|dibuat/i.test(roleText) ? 'guru' : (signers.kepala ? 'guru' : 'kepala');
        if (signers[key]) return;
        signers[key] = { nameP, nipP: hasNip ? last : null, name: textOf(nameP).trim(), nip: hasNip ? lt.replace(/^NIP\.?\s*:?\s*/i, '').trim() : '', role: roleText };
      });
    }

    const info = {
      columns: cols,
      identity,
      kop: kopNodes.map((p) => textOf(p).trim()),
      title: titleNodes.map((p) => textOf(p).trim()).join(' '),
      city: placeMatch ? placeMatch[1].trim() : '',
      signDateText: placeMatch ? placeMatch[2] : '',
      kepala: signers.kepala ? { name: signers.kepala.name, nip: signers.kepala.nip, role: signers.kepala.role } : null,
      guru: signers.guru ? { name: signers.guru.name, nip: signers.guru.nip, role: signers.guru.role } : null,
      sampleRows: dataRows.length,
    };
    return { info, nodes: { body, main, rows, headerCount, cols, dataRows, protoFirst, protoCont, identityNodes, kopNodes, titleNodes, placeNode, signers } };
  }

  function groupByDate(entries) {
    const groups = []; const map = {};
    U.sortEntries(entries).forEach((e) => { if (!map[e.date]) { map[e.date] = { date: e.date, items: [] }; groups.push(map[e.date]); } map[e.date].items.push(e); });
    return groups;
  }
  const lines = (s) => String(s == null ? '' : s).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  /**
   * Mengisi dokumen. data = { profile, period:'YYYY-MM', entries, signDate:'YYYY-MM-DD' }
   */
  function fill(doc, data) {
    const { info, nodes } = analyze(doc);
    const pf = data.profile || {};
    const idVals = { nama: pf.nama, nip: pf.nip, pangkat: pf.pangkat, mapel: pf.mapel, jabatan: pf.jabatan };
    Object.entries(nodes.identityNodes).forEach(([k, p]) => {
      if (k === 'bulan') {
        let v = U.periodLabel(data.period);
        const orig = info.identity.bulan || '';
        if (/[A-Z]/.test(orig) && orig === orig.toUpperCase()) v = v.toUpperCase();
        setValueAfterColon(p, v);
      } else if (idVals[k] != null && idVals[k] !== '') setValueAfterColon(p, String(idVals[k]));
    });
    (pf.kop || []).forEach((t, i) => { const p = nodes.kopNodes[i]; if (p && t && t.trim() && t.trim() !== info.kop[i]) setParagraphText(p, t.trim()); });
    if (pf.judul && pf.judul.trim() && pf.judul.trim() !== info.title && nodes.titleNodes[0]) {
      setParagraphText(nodes.titleNodes[0], pf.judul.trim());
      nodes.titleNodes.slice(1).forEach((p) => setParagraphText(p, ''));
    }

    // Tabel kegiatan
    const { main, rows, headerCount, cols, protoFirst, protoCont } = nodes;
    const pF = protoFirst.cloneNode(true); const pC = protoCont.cloneNode(true);
    rows.slice(headerCount).forEach((r) => main.removeChild(r));
    const groups = groupByDate(data.entries || []);
    const setC = (tcs, key, ls, opt) => { if (cols[key] !== undefined && tcs[cols[key]]) setCellLines(tcs[cols[key]], ls, opt); };
    if (!groups.length) {
      const r = stripIds(pF.cloneNode(true)); const tcs = kids(r, 'tc');
      Object.keys(cols).forEach((k) => setC(tcs, k, []));
      main.appendChild(r);
    }
    groups.forEach((g, gi) => {
      g.items.forEach((e, i) => {
        const r = stripIds((i === 0 ? pF : pC).cloneNode(true)); const tcs = kids(r, 'tc');
        if (i === 0) { setC(tcs, 'no', [`${gi + 1}.`]); setC(tcs, 'tanggal', [U.dayName(g.date), U.fmtShort(g.date)]); }
        else { setC(tcs, 'no', []); setC(tcs, 'tanggal', []); }
        setC(tcs, 'deskripsi', lines(e.description), { bidi: true });
        setC(tcs, 'satuan', lines(e.unit));
        setC(tcs, 'jumlah', lines(e.quantity));
        setC(tcs, 'evidence', lines(e.evidence), { bidi: true });
        main.appendChild(r);
      });
    });

    // Tempat, tanggal
    if (nodes.placeNode) {
      const city = (pf.kota || info.city || '').trim();
      const dateText = U.fmtLong(data.signDate || U.lastDayOfPeriod(data.period));
      const ts = texts(nodes.placeNode);
      const t = ts.find((x) => PLACE_DATE.test(x.textContent.trim()));
      if (t) setT(t, t.textContent.replace(PLACE_DATE, `${city}, ${dateText}`));
      else { const full = textOf(nodes.placeNode); setParagraphText(nodes.placeNode, (full.match(/^\s*/) || [''])[0] + `${city}, ${dateText}`); }
    }
    // Tanda tangan
    const sig = nodes.signers;
    const putSigner = (s, name, nip) => {
      if (!s) return;
      if (name && name.trim()) setParagraphText(s.nameP, name.trim());
      if (s.nipP && nip && nip.trim()) { const o = textOf(s.nipP).trim(); setParagraphText(s.nipP, (o.match(/^NIP\.?\s*:?\s*/i) || ['NIP. '])[0] + nip.trim()); }
    };
    putSigner(sig.kepala, pf.kepala_nama, pf.kepala_nip);
    putSigner(sig.guru, pf.nama_ttd || pf.nama, pf.nip);
    return doc;
  }

  /** Mengambil kegiatan yang sudah ada di tabel template (untuk impor). */
  function extractEntries(doc) {
    const { nodes } = analyze(doc);
    const { cols, dataRows } = nodes;
    const out = []; let cur = null; let pos = 0;
    dataRows.forEach((r) => {
      const tcs = kids(r, 'tc');
      const get = (k) => (cols[k] !== undefined ? cellLines(tcs[cols[k]]) : []);
      const dl = get('tanggal').join(' ');
      const d = U.parseIndoDate(dl);
      if (d) { cur = d; pos = 0; }
      const desc = get('deskripsi').join('\n');
      if (!cur || !desc) return;
      out.push({ date: cur, description: desc, unit: get('satuan').join('\n'), quantity: get('jumlah').join(' '), evidence: get('evidence').join('\n'), position: pos++ });
    });
    return out;
  }

  async function loadDocXml(JSZip, buf, DOMParserImpl) {
    const zip = await JSZip.loadAsync(buf);
    const f = zip.file('word/document.xml');
    if (!f) throw new Error('File bukan dokumen Word (.docx) yang valid.');
    const xml = await f.async('string');
    const doc = new DOMParserImpl().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Gagal membaca isi dokumen Word.');
    return { zip, doc };
  }
  function serialize(doc, XMLSerializerImpl) {
    let xml = new XMLSerializerImpl().serializeToString(doc);
    if (!/^<\?xml/.test(xml)) xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + xml;
    return xml;
  }
  async function buildDocx(JSZip, buf, data, impl) {
    const { zip, doc } = await loadDocXml(JSZip, buf, impl.DOMParser);
    fill(doc, data);
    zip.file('word/document.xml', serialize(doc, impl.XMLSerializer));
    return { zip, doc };
  }

  root.DocxEngine = { W, analyze, fill, extractEntries, loadDocXml, serialize, buildDocx, splitBidi, groupByDate, helpers: { kids, kid, all, textOf, isEl, getAttr, vMergeOf } };
})(typeof window !== 'undefined' ? window : globalThis);
