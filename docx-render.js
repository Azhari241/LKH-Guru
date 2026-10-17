/*
 * DocxRender — menyajikan dokumen Word (hasil isian template) menjadi halaman A4 HTML
 * untuk pratinjau, cetak, dan PDF. Semua ukuran dibaca dari XML template:
 * ukuran kertas, margin, font, ukuran huruf, perataan, indentasi, tab, lebar kolom,
 * garis tabel, arsiran, sel gabung, gambar (logo) dan garis kop.
 */
(function (root) {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const { kids, kid, all, getAttr, vMergeOf } = root.DocxEngine.helpers;
  const tw = (v) => (Number(v) || 0) / 15;
  const emu = (v) => (Number(v) || 0) / 9525;
  const onOff = (el) => { if (!el) return undefined; const v = getAttr(el, 'val'); return !(v === '0' || v === 'false' || v === 'off' || v === 'none'); };
  const A = (el, name) => (el ? el.getAttribute(name) : null);

  const FONT_MAP = {
    tahoma: "Tahoma, Verdana, 'DejaVu Sans', 'Segoe UI', sans-serif",
    'book antiqua': "'Book Antiqua', 'Palatino Linotype', Palatino, 'URW Palladio L', 'P052', Georgia, serif",
    'bell mt': "'Bell MT', 'Bodoni MT', 'Libre Bodoni', Georgia, 'Times New Roman', serif",
    'aachen bt': "'Aachen BT', 'Rockwell Extra Bold', Rockwell, 'Roboto Slab', Georgia, serif",
    'times new roman': "'Times New Roman', Times, 'Liberation Serif', serif",
    calibri: "Calibri, Carlito, 'Segoe UI', sans-serif",
    arial: "Arial, 'Liberation Sans', Helvetica, sans-serif",
    cambria: "Cambria, Caladea, Georgia, serif",
  };
  const cssFont = (name) => { if (!name) return null; const k = name.toLowerCase(); return FONT_MAP[k] || `'${name}', Tahoma, sans-serif`; };

  // ---------- Paket & gaya ----------
  async function preparePackage(zip, doc) {
    const parse = async (p) => { const f = zip.file(p); if (!f) return null; return new DOMParser().parseFromString(await f.async('string'), 'application/xml'); };
    const styles = await parse('word/styles.xml');
    const theme = await parse('word/theme/theme1.xml');
    const relsDoc = await parse('word/_rels/document.xml.rels');
    const media = {};
    if (relsDoc) {
      const rs = relsDoc.getElementsByTagName('Relationship');
      for (let i = 0; i < rs.length; i++) {
        const id = rs[i].getAttribute('Id'); const target = rs[i].getAttribute('Target') || '';
        if (!/image/i.test(rs[i].getAttribute('Type') || '')) continue;
        const path = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, '');
        const f = zip.file(path); if (!f) continue;
        const ext = path.split('.').pop().toLowerCase();
        const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' }[ext] || 'image/png';
        media[id] = `data:${mime};base64,` + (await f.async('base64'));
      }
    }
    return { doc, styles: makeStyles(styles, theme), media };
  }

  function makeStyles(stylesDoc, themeDoc) {
    const byId = {};
    if (stylesDoc) all(stylesDoc, 'style').forEach((s) => { byId[getAttr(s, 'styleId')] = s; });
    const dd = stylesDoc && all(stylesDoc, 'docDefaults')[0];
    const rDef = dd && all(dd, 'rPrDefault')[0];
    const pDef = dd && all(dd, 'pPrDefault')[0];
    const theme = { minor: 'Calibri', major: 'Cambria' };
    if (themeDoc) {
      const mi = themeDoc.getElementsByTagNameNS(A_NS, 'minorFont')[0]; const ma = themeDoc.getElementsByTagNameNS(A_NS, 'majorFont')[0];
      const lat = (e) => e && e.getElementsByTagNameNS(A_NS, 'latin')[0];
      if (lat(mi)) theme.minor = lat(mi).getAttribute('typeface') || theme.minor;
      if (lat(ma)) theme.major = lat(ma).getAttribute('typeface') || theme.major;
    }
    const findDefault = (type) => Object.values(byId).find((s) => getAttr(s, 'type') === type && (getAttr(s, 'default') === '1' || getAttr(s, 'default') === 'true'));
    const chain = (id) => { const out = []; let s = id && byId[id]; let guard = 0; while (s && guard++ < 20) { out.unshift(s); const b = kid(s, 'basedOn'); s = b ? byId[getAttr(b, 'val')] : null; } return out; };
    return { byId, rDef: rDef && kid(rDef, 'rPr'), pDef: pDef && kid(pDef, 'pPr'), theme, chain, defPara: findDefault('paragraph'), defTable: findDefault('table') };
  }

  function applyRPr(o, rPr, st) {
    if (!rPr) return o;
    const f = kid(rPr, 'rFonts');
    if (f) {
      const th = (v) => (v ? (/major/i.test(v) ? st.theme.major : st.theme.minor) : null);
      const asc = getAttr(f, 'ascii') || getAttr(f, 'hAnsi') || th(getAttr(f, 'asciiTheme') || getAttr(f, 'hAnsiTheme'));
      const cs = getAttr(f, 'cs') || th(getAttr(f, 'cstheme'));
      if (asc) o.font = asc; if (cs) o.csFont = cs;
      if (getAttr(f, 'hint')) o.hint = getAttr(f, 'hint');
    }
    const b = kid(rPr, 'b'); if (b) o.bold = onOff(b);
    const bcs = kid(rPr, 'bCs'); if (bcs) o.boldCs = onOff(bcs);
    const i = kid(rPr, 'i'); if (i) o.italic = onOff(i);
    const u = kid(rPr, 'u'); if (u) o.underline = onOff(u);
    const caps = kid(rPr, 'caps'); if (caps) o.caps = onOff(caps);
    const strike = kid(rPr, 'strike'); if (strike) o.strike = onOff(strike);
    const c = kid(rPr, 'color'); if (c) { const v = getAttr(c, 'val'); o.color = v && v !== 'auto' ? '#' + v : null; }
    const sz = kid(rPr, 'sz'); if (sz) o.size = Number(getAttr(sz, 'val')) / 2;
    const szCs = kid(rPr, 'szCs'); if (szCs) o.sizeCs = Number(getAttr(szCs, 'val')) / 2;
    const rtl = kid(rPr, 'rtl'); if (rtl) o.rtl = onOff(rtl);
    const va = kid(rPr, 'vertAlign'); if (va) o.vert = getAttr(va, 'val');
    const rs = kid(rPr, 'rStyle'); if (rs) o.rStyle = getAttr(rs, 'val');
    return o;
  }
  function applyPPr(o, pPr) {
    if (!pPr) return o;
    const jc = kid(pPr, 'jc'); if (jc) o.jc = getAttr(jc, 'val');
    const sp = kid(pPr, 'spacing');
    if (sp) { ['before', 'after', 'line'].forEach((k) => { const v = getAttr(sp, k); if (v != null && v !== '') o[k] = Number(v); }); const lr = getAttr(sp, 'lineRule'); if (lr) o.lineRule = lr; }
    const ind = kid(pPr, 'ind');
    if (ind) {
      const g = (a, b) => getAttr(ind, a) || getAttr(ind, b);
      if (g('left', 'start') != null) o.indL = Number(g('left', 'start'));
      if (g('right', 'end') != null) o.indR = Number(g('right', 'end'));
      if (getAttr(ind, 'firstLine') != null) { o.first = Number(getAttr(ind, 'firstLine')); }
      if (getAttr(ind, 'hanging') != null) { o.first = -Number(getAttr(ind, 'hanging')); }
    }
    const tabs = kid(pPr, 'tabs');
    if (tabs) {
      o.tabs = [...(o.tabs || [])];
      kids(tabs, 'tab').forEach((t) => {
        const pos = Number(getAttr(t, 'pos')); const val = getAttr(t, 'val');
        if (val === 'clear') o.tabs = o.tabs.filter((x) => x.pos !== pos); else o.tabs.push({ pos, val });
      });
      o.tabs.sort((a, b) => a.pos - b.pos);
    }
    if (kid(pPr, 'pageBreakBefore')) o.pageBreakBefore = onOff(kid(pPr, 'pageBreakBefore'));
    return o;
  }
  function paraProps(p, st) {
    const pPr = kid(p, 'pPr');
    const ps = pPr && kid(pPr, 'pStyle');
    const sid = ps ? getAttr(ps, 'val') : st.defPara && getAttr(st.defPara, 'styleId');
    const pp = applyPPr({ before: 0, after: 0, line: 240, lineRule: 'auto', indL: 0, indR: 0, first: 0, jc: 'left', tabs: [] }, st.pDef);
    const rp = applyRPr({ font: 'Times New Roman', size: 10 }, st.rDef, st);
    st.chain(sid).forEach((s) => { applyPPr(pp, kid(s, 'pPr')); applyRPr(rp, kid(s, 'rPr'), st); });
    applyPPr(pp, pPr);
    return { pp, rp, markRPr: pPr && kid(pPr, 'rPr') };
  }
  function runProps(base, rPr, st) {
    const o = { ...base };
    const rs = rPr && kid(rPr, 'rStyle');
    if (rs) {
      const id = getAttr(rs, 'val');
      st.chain(id).forEach((s) => applyRPr(o, kid(s, 'rPr'), st));
      if (/hyperlink/i.test(id)) o.underline = true;
    }
    return applyRPr(o, rPr, st);
  }
  function styleRun(span, o) {
    const cs = o.rtl || o.hint === 'cs';
    const fam = cssFont(cs ? o.csFont || o.font : o.font);
    if (fam) span.style.fontFamily = fam + ", 'Traditional Arabic', 'Noto Naskh Arabic', serif";
    const size = cs && o.sizeCs ? o.sizeCs : o.size;
    if (size) span.style.fontSize = size + 'pt';
    if (cs ? o.boldCs ?? o.bold : o.bold) span.style.fontWeight = '700';
    if (o.italic) span.style.fontStyle = 'italic';
    const deco = [o.underline && 'underline', o.strike && 'line-through'].filter(Boolean).join(' ');
    if (deco) span.style.textDecoration = deco;
    if (o.caps) span.style.textTransform = 'uppercase';
    if (o.color) span.style.color = o.color;
    if (o.vert === 'superscript') { span.style.verticalAlign = 'super'; span.style.fontSize = (size || 10) * 0.65 + 'pt'; }
    if (o.vert === 'subscript') { span.style.verticalAlign = 'sub'; span.style.fontSize = (size || 10) * 0.65 + 'pt'; }
    if (o.rtl) { span.dir = 'rtl'; span.style.unicodeBidi = 'embed'; }
  }

  // ---------- Gambar & bentuk ----------
  function renderDrawing(drawing, ctx) {
    const inline = drawing.getElementsByTagNameNS(WP_NS, 'inline')[0];
    const anchor = drawing.getElementsByTagNameNS(WP_NS, 'anchor')[0];
    const box = inline || anchor; if (!box) return null;
    const ext = box.getElementsByTagNameNS(WP_NS, 'extent')[0];
    const w = emu(A(ext, 'cx')); const h = emu(A(ext, 'cy'));
    const blip = drawing.getElementsByTagNameNS(A_NS, 'blip')[0];
    let el = null;
    if (blip) {
      const id = blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:embed');
      if (ctx.media[id]) { el = document.createElement('img'); el.src = ctx.media[id]; el.alt = ''; el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.display = 'block'; }
    } else {
      const geom = drawing.getElementsByTagNameNS(A_NS, 'prstGeom')[0];
      if (geom && geom.getAttribute('prst') === 'line') {
        const ln = drawing.getElementsByTagNameNS(A_NS, 'ln')[0];
        const lw = Math.max(1, emu(A(ln, 'w') || 9525));
        const clr = ln && ln.getElementsByTagNameNS(A_NS, 'srgbClr')[0];
        const dbl = ln && /dbl|thickThin|thinThick|tri/.test(A(ln, 'cmpd') || '');
        el = document.createElement('div');
        el.style.width = w + 'px'; el.style.height = '0';
        el.style.borderTop = `${dbl ? Math.max(3, Math.round(lw)) : Math.max(1, Math.round(lw))}px ${dbl ? 'double' : 'solid'} ${clr ? '#' + clr.getAttribute('val') : '#000'}`;
        el.style.transform = `translateY(-${Math.round(lw / 2)}px)`;
      }
    }
    if (!el) return null;
    if (inline) { el.style.display = 'inline-block'; el.style.verticalAlign = 'bottom'; return { inline: el }; }
    const ph = anchor.getElementsByTagNameNS(WP_NS, 'positionH')[0];
    const pv = anchor.getElementsByTagNameNS(WP_NS, 'positionV')[0];
    const off = (p) => { const o = p && p.getElementsByTagNameNS(WP_NS, 'posOffset')[0]; return o ? emu(o.textContent) : 0; };
    const align = (p) => { const a = p && p.getElementsByTagNameNS(WP_NS, 'align')[0]; return a ? a.textContent : null; };
    el.style.position = 'absolute';
    const ah = align(ph);
    if (ah === 'center') { el.style.left = '50%'; el.style.marginLeft = -w / 2 + 'px'; }
    else if (ah === 'right') { el.style.right = '0'; }
    else el.style.left = off(ph) + 'px';
    el.style.top = off(pv) + 'px';
    el.style.zIndex = A(anchor, 'behindDoc') === '1' ? '0' : '2';
    return { anchor: el };
  }

  // ---------- Paragraf ----------
  function renderParagraph(p, ctx) {
    const st = ctx.styles; const { pp, rp, markRPr } = paraProps(p, st);
    const div = document.createElement('div');
    div.className = 'dx-p';
    div.style.paddingTop = tw(pp.before) + 'px';
    div.style.paddingBottom = tw(pp.after) + 'px';
    div.style.paddingLeft = tw(pp.indL) + 'px';
    div.style.paddingRight = tw(pp.indR) + 'px';
    if (pp.first) div.style.textIndent = tw(pp.first) + 'px';
    div.style.textAlign = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[pp.jc] || 'left';
    if (pp.lineRule === 'exact' || pp.lineRule === 'atLeast') div.style.lineHeight = tw(pp.line) + 'px';
    else div.style.lineHeight = String(1.2 * (pp.line || 240) / 240);
    const markProps = runProps(rp, markRPr, st);
    styleRun(div, { ...markProps, rtl: false, underline: false });

    const segs = [[]]; const anchors = []; let hasContent = false;
    const pushText = (txt, props) => { if (!txt) return; const s = document.createElement('span'); styleRun(s, props); s.textContent = txt; segs[segs.length - 1].push(s); hasContent = true; };
    const doRun = (r) => {
      const props = runProps(rp, kid(r, 'rPr'), st);
      for (let n = r.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1) continue;
        const ln = n.localName;
        if (ln === 't') pushText(n.textContent, props);
        else if (ln === 'tab') segs.push([]);
        else if (ln === 'br' || ln === 'cr') { if (getAttr(n, 'type') === 'page') ctx.pageBreak = true; else { segs[segs.length - 1].push(document.createElement('br')); hasContent = true; } }
        else if (ln === 'noBreakHyphen') pushText('\u2011', props);
        else if (ln === 'drawing' || ln === 'AlternateContent') {
          const d = ln === 'drawing' ? n : (n.getElementsByTagNameNS(W, 'drawing')[0]);
          if (!d) continue;
          const res = renderDrawing(d, ctx);
          if (res && res.inline) { segs[segs.length - 1].push(res.inline); hasContent = true; }
          if (res && res.anchor) anchors.push(res.anchor);
        }
      }
    };
    const walk = (el) => {
      for (let n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1 || n.namespaceURI !== W) continue;
        const ln = n.localName;
        if (ln === 'r') doRun(n);
        else if (/^(hyperlink|smartTag|ins|fldSimple|customXml|moveTo|bdo|dir)$/.test(ln)) walk(n);
        else if (ln === 'sdt') { const c = kid(n, 'sdtContent'); if (c) walk(c); }
      }
    };
    walk(p);

    if (segs.length === 1) segs[0].forEach((n) => div.appendChild(n));
    else {
      let start = pp.indL + pp.first;
      segs.forEach((seg, i) => {
        if (i === segs.length - 1) { seg.forEach((n) => div.appendChild(n)); return; }
        const stop = (pp.tabs.find((t) => t.pos > start + 30) || { pos: (Math.floor(start / 720) + 1) * 720 }).pos;
        const box = document.createElement('span');
        box.style.display = 'inline-block'; box.style.minWidth = tw(stop - start) + 'px'; box.style.textIndent = '0';
        seg.forEach((n) => box.appendChild(n));
        if (!seg.length) box.innerHTML = '&#8203;';
        div.appendChild(box);
        start = stop;
      });
    }
    if (!hasContent && segs.length === 1) div.appendChild(document.createTextNode('\u00a0'));
    anchors.forEach((a) => div.appendChild(a));
    if (anchors.length) div.style.position = 'relative';
    return { el: div, pageBreakBefore: !!pp.pageBreakBefore };
  }

  // ---------- Tabel ----------
  function borderCss(b) {
    if (!b) return null;
    const val = getAttr(b, 'val');
    if (!val || val === 'none' || val === 'nil') return 'none';
    const px = Math.max(1, Math.round((Number(getAttr(b, 'sz')) || 4) / 6));
    const c = getAttr(b, 'color'); const color = c && c !== 'auto' ? '#' + c : '#000';
    if (/double/.test(val)) return `${Math.max(3, px * 3)}px double ${color}`;
    if (/dot/.test(val)) return `${px}px dotted ${color}`;
    if (/dash/.test(val)) return `${px}px dashed ${color}`;
    return `${px}px solid ${color}`;
  }
  function readBorders(el, o) {
    if (!el) return o;
    [['top', 'top'], ['left', 'left'], ['start', 'left'], ['bottom', 'bottom'], ['right', 'right'], ['end', 'right'], ['insideH', 'insideH'], ['insideV', 'insideV']].forEach(([x, k]) => { const b = kid(el, x); if (b) o[k] = borderCss(b); });
    return o;
  }
  function readMar(el, o) {
    if (!el) return o;
    [['top', 'top'], ['left', 'left'], ['start', 'left'], ['bottom', 'bottom'], ['right', 'right'], ['end', 'right']].forEach(([x, k]) => { const m = kid(el, x); if (m) o[k] = tw(getAttr(m, 'w')); });
    return o;
  }
  function tableModel(tbl, ctx) {
    const st = ctx.styles; const tblPr = kid(tbl, 'tblPr');
    const ts = tblPr && kid(tblPr, 'tblStyle');
    const sid = ts ? getAttr(ts, 'val') : st.defTable && getAttr(st.defTable, 'styleId');
    const borders = {}; const mar = { top: 0, bottom: 0, left: 7.2, right: 7.2 };
    let chainList = st.chain(sid);
    if (st.defTable && !chainList.includes(st.defTable)) chainList = [st.defTable, ...chainList];
    chainList.forEach((s) => { const p = kid(s, 'tblPr'); if (p) { readBorders(kid(p, 'tblBorders'), borders); readMar(kid(p, 'tblCellMar'), mar); } });
    if (tblPr) { readBorders(kid(tblPr, 'tblBorders'), borders); readMar(kid(tblPr, 'tblCellMar'), mar); }
    const ind = tblPr && kid(tblPr, 'tblInd');
    const jcEl = tblPr && kid(tblPr, 'jc');
    const grid = kids(kid(tbl, 'tblGrid') || tbl, 'gridCol').map((g) => tw(getAttr(g, 'w')));
    const rows = kids(tbl, 'tr').map((tr) => {
      const trPr = kid(tr, 'trPr');
      const gb = trPr && kid(trPr, 'gridBefore');
      let g = gb ? Number(getAttr(gb, 'val')) : 0;
      const hEl = trPr && kid(trPr, 'trHeight');
      const cells = kids(tr, 'tc').map((tc) => {
        const tcPr = kid(tc, 'tcPr'); const gs = tcPr && kid(tcPr, 'gridSpan');
        const span = gs ? Number(getAttr(gs, 'val')) : 1;
        const c = { tc, g, span, vm: vMergeOf(tc) }; g += span; return c;
      });
      return { tr, cells, gridBefore: gb ? Number(getAttr(gb, 'val')) : 0, header: !!(trPr && kid(trPr, 'tblHeader')), h: hEl ? tw(getAttr(hEl, 'val')) : 0, hRule: hEl ? getAttr(hEl, 'hRule') : null };
    });
    if (!grid.length && rows[0]) rows[0].cells.forEach((c) => { const w = kid(kid(c.tc, 'tcPr') || c.tc, 'tcW'); grid.push(w ? tw(getAttr(w, 'w')) : 100); });
    return { tbl, grid, rows, borders, mar, ind: ind ? tw(getAttr(ind, 'w')) : 0, jc: jcEl ? getAttr(jcEl, 'val') : null };
  }
  function renderCellContent(tc, ctx, td) {
    for (let n = tc.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1 || n.namespaceURI !== W) continue;
      if (n.localName === 'p') td.appendChild(renderParagraph(n, ctx).el);
      else if (n.localName === 'tbl') { const m = tableModel(n, ctx); td.appendChild(buildTable(m, m.rows.map((_, i) => i), ctx)); }
    }
  }
  function buildTable(m, idxs, ctx) {
    const t = document.createElement('table');
    t.className = 'dx-tbl';
    const total = m.grid.reduce((a, b) => a + b, 0);
    t.style.width = total + 'px';
    if (m.ind) t.style.marginLeft = m.ind + 'px';
    if (m.jc === 'center') { t.style.marginLeft = 'auto'; t.style.marginRight = 'auto'; }
    const cg = document.createElement('colgroup');
    m.grid.forEach((w) => { const c = document.createElement('col'); c.style.width = w + 'px'; cg.appendChild(c); });
    t.appendChild(cg);
    const tb = document.createElement('tbody'); t.appendChild(tb);
    const B = m.borders;
    idxs.forEach((ri, k) => {
      const row = m.rows[ri]; const tr = document.createElement('tr');
      if (row.h) tr.style.height = row.h + 'px';
      if (row.gridBefore) { const td = document.createElement('td'); td.colSpan = row.gridBefore; td.style.border = 'none'; tr.appendChild(td); }
      row.cells.forEach((c) => {
        const contig = k > 0 && idxs[k - 1] === ri - 1;
        if (c.vm === 'continue' && contig && m.rows[ri - 1].cells.some((x) => x.g === c.g && x.vm)) return;
        let span = 1;
        for (let j = k + 1; j < idxs.length && idxs[j] === idxs[j - 1] + 1; j++) {
          const nc = m.rows[idxs[j]].cells.find((x) => x.g === c.g);
          if (c.vm && nc && nc.vm === 'continue') span++; else break;
        }
        const td = document.createElement('td');
        if (c.span > 1) td.colSpan = c.span;
        if (span > 1) td.rowSpan = span;
        const tcPr = kid(c.tc, 'tcPr');
        const shd = tcPr && kid(tcPr, 'shd'); const fill = shd && getAttr(shd, 'fill');
        if (fill && fill !== 'auto') td.style.background = '#' + fill;
        const va = tcPr && kid(tcPr, 'vAlign'); const vav = va ? getAttr(va, 'val') : 'top';
        td.style.verticalAlign = vav === 'center' ? 'middle' : vav === 'bottom' ? 'bottom' : 'top';
        const mar = readMar(tcPr && kid(tcPr, 'tcMar'), { ...m.mar });
        td.style.padding = `${mar.top}px ${mar.right}px ${mar.bottom}px ${mar.left}px`;
        const lastRowIdx = k + span - 1;
        const cb = readBorders(tcPr && kid(tcPr, 'tcBorders'), {});
        const side = (own, edge, inner) => (own !== undefined ? own : (edge ? B[edge] : B[inner])) || 'none';
        td.style.borderTop = side(cb.top, k === 0 ? 'top' : null, 'insideH');
        td.style.borderBottom = side(cb.bottom, lastRowIdx === idxs.length - 1 ? 'bottom' : null, 'insideH');
        td.style.borderLeft = side(cb.left, c.g === 0 ? 'left' : null, 'insideV');
        td.style.borderRight = side(cb.right, c.g + c.span >= m.grid.length ? 'right' : null, 'insideV');
        renderCellContent(c.tc, ctx, td);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    return t;
  }

  // ---------- Halaman ----------
  function pageGeometry(doc) {
    const body = all(doc, 'body')[0]; const sect = kid(body, 'sectPr');
    const sz = sect && kid(sect, 'pgSz'); const mg = sect && kid(sect, 'pgMar');
    const g = (el, k, d) => { const v = el && getAttr(el, k); return v != null && v !== '' ? Number(v) : d; };
    const pw = g(sz, 'w', 11906), ph = g(sz, 'h', 16838);
    const o = { w: tw(pw), h: tw(ph), top: tw(Math.abs(g(mg, 'top', 1440))), bottom: tw(Math.abs(g(mg, 'bottom', 1440))), left: tw(g(mg, 'left', 1440)), right: tw(g(mg, 'right', 1440)) };
    o.cw = o.w - o.left - o.right; o.ch = o.h - o.top - o.bottom;
    return o;
  }

  /** Menyajikan dokumen ke dalam elemen-elemen halaman (.dx-page). */
  async function renderPages(pkg) {
    const ctx = { styles: pkg.styles, media: pkg.media };
    const doc = pkg.doc; const geo = pageGeometry(doc);
    const body = all(doc, 'body')[0];
    let mainTbl = null; try { mainTbl = root.DocxEngine.analyze(doc).nodes.main; } catch (e) { mainTbl = null; }
    const host = document.createElement('div');
    host.className = 'dx-root dx-measure';
    host.style.cssText = `position:absolute;left:-30000px;top:0;width:${geo.cw}px;visibility:hidden;`;
    document.body.appendChild(host);
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* abaikan */ } }

    const items = []; let model = null; let headerIdx = []; let headerH = 0;
    kids(body).forEach((b) => {
      if (b.localName === 'p') {
        ctx.pageBreak = false;
        const r = renderParagraph(b, ctx); host.appendChild(r.el);
        items.push({ kind: 'block', el: r.el, h: r.el.offsetHeight, breakBefore: r.pageBreakBefore });
        if (ctx.pageBreak) items.push({ kind: 'break' });
      } else if (b.localName === 'tbl') {
        const m = tableModel(b, ctx);
        if (b === mainTbl) {
          model = m;
          const full = buildTable(m, m.rows.map((_, i) => i), ctx); host.appendChild(full);
          const trs = full.querySelectorAll(':scope > tbody > tr');
          m.rows.forEach((row, i) => { const h = trs[i] ? trs[i].getBoundingClientRect().height : 0; if (row.header && i === headerIdx.length) { headerIdx.push(i); headerH += h; } else items.push({ kind: 'row', idx: i, h }); });
          if (!headerIdx.length) { headerIdx = [0]; const first = items.findIndex((x) => x.kind === 'row' && x.idx === 0); if (first >= 0) { headerH = items[first].h; items.splice(first, 1); } }
        } else {
          const el = buildTable(m, m.rows.map((_, i) => i), ctx); host.appendChild(el);
          items.push({ kind: 'block', el, h: el.getBoundingClientRect().height });
        }
      }
    });

    const pages = []; let cur; let used = 0; let chunk = null;
    const newPage = () => { cur = { items: [] }; pages.push(cur); used = 0; chunk = null; };
    newPage();
    items.forEach((it) => {
      if (it.kind === 'break') { newPage(); return; }
      if (it.breakBefore && cur.items.length) newPage();
      if (it.kind === 'row') {
        let extra = chunk ? 0 : headerH;
        if (used + extra + it.h > geo.ch + 0.5 && cur.items.length) { newPage(); extra = headerH; }
        if (!chunk) { chunk = { kind: 'chunk', rows: [...headerIdx] }; cur.items.push(chunk); }
        chunk.rows.push(it.idx); used += extra + it.h;
      } else {
        chunk = null;
        if (used + it.h > geo.ch + 0.5 && cur.items.length) newPage();
        cur.items.push(it); used += it.h;
      }
    });

    const out = pages.map((pg, pi) => {
      const page = document.createElement('div');
      page.className = 'dx-page';
      page.dataset.page = String(pi + 1);
      page.style.width = geo.w + 'px'; page.style.height = geo.h + 'px';
      const content = document.createElement('div');
      content.className = 'dx-content';
      content.style.cssText = `position:absolute;left:${geo.left}px;top:${geo.top}px;width:${geo.cw}px;`;
      pg.items.forEach((it) => { if (it.kind === 'chunk') content.appendChild(buildTable(model, it.rows, ctx)); else content.appendChild(it.el); });
      page.appendChild(content);
      return page;
    });
    host.remove();
    return { pages: out, geo };
  }

  root.DocxRender = { preparePackage, renderPages, pageGeometry };
})(window);
