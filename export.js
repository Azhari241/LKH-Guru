/* Ekspor: Word (.docx), PDF, dan cetak — semuanya dari template Word asli. */
(function () {
  const U = window.U;
  const impl = { DOMParser: window.DOMParser, XMLSerializer: window.XMLSerializer };
  const DEFAULT_TEMPLATE_URL = 'template/template-asli.docx';
  const DEFAULT_TEMPLATE_NAME = '1. LEMBAR KINERJA GURU BULAN SEPTEMBER 2026.docx';

  async function fetchDefaultTemplate() {
    const r = await fetch(DEFAULT_TEMPLATE_URL, { cache: 'force-cache' });
    if (!r.ok) throw new Error('Template bawaan tidak dapat dimuat.');
    return { name: DEFAULT_TEMPLATE_NAME, buf: await r.arrayBuffer(), builtin: true };
  }

  async function inspect(buf) {
    const { doc } = await DocxEngine.loadDocXml(JSZip, buf, impl.DOMParser);
    const a = DocxEngine.analyze(doc);
    let samples = [];
    try { samples = DocxEngine.extractEntries(doc); } catch (e) { samples = []; }
    return { info: a.info, samples };
  }

  async function buildDocxBlob(tplBuf, data) {
    const { zip } = await DocxEngine.buildDocx(JSZip, tplBuf, data, impl);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
    return { blob, zip };
  }

  async function renderReport(tplBuf, data) {
    const { zip, doc } = await DocxEngine.buildDocx(JSZip, tplBuf, data, impl);
    const pkg = await DocxRender.preparePackage(zip, doc);
    return DocxRender.renderPages(pkg);
  }

  const fileBase = (data) => `LEMBAR KINERJA GURU BULAN ${U.periodLabel(data.period).toUpperCase()}${data.profile && data.profile.nama ? ' - ' + data.profile.nama.replace(/[\\/:*?"<>|]/g, '') : ''}`;

  async function downloadDocx(tplBuf, data) {
    const { blob } = await buildDocxBlob(tplBuf, data);
    // Validasi: pastikan paket dapat dibaca ulang.
    const check = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await check.file('word/document.xml').async('string');
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    if (parsed.getElementsByTagName('parsererror').length) throw new Error('Validasi dokumen gagal.');
    U.downloadBlob(blob, fileBase(data) + '.docx');
    return blob.size;
  }

  async function downloadPdf(tplBuf, data, onProgress) {
    const { pages, geo } = await renderReport(tplBuf, data);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;';
    document.body.appendChild(host);
    try {
      const { jsPDF } = window.jspdf;
      const wmm = (geo.w * 25.4) / 96, hmm = (geo.h * 25.4) / 96;
      const pdf = new jsPDF({ unit: 'mm', format: [wmm, hmm], orientation: wmm > hmm ? 'l' : 'p', compress: true });
      for (let i = 0; i < pages.length; i++) {
        onProgress && onProgress(i + 1, pages.length);
        host.innerHTML = ''; host.appendChild(pages[i]);
        const canvas = await html2canvas(pages[i], { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false, width: geo.w, height: geo.h, windowWidth: geo.w });
        if (i > 0) pdf.addPage([wmm, hmm], wmm > hmm ? 'l' : 'p');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wmm, hmm, undefined, 'FAST');
      }
      pdf.setProperties({ title: fileBase(data) });
      const blob = pdf.output('blob');
      U.downloadBlob(blob, fileBase(data) + '.pdf');
      return pages.length;
    } finally { host.remove(); }
  }

  async function print(tplBuf, data) {
    const { pages } = await renderReport(tplBuf, data);
    let root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = '';
    pages.forEach((p) => root.appendChild(p));
    const imgs = [...root.querySelectorAll('img')];
    await Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
    const prevTitle = document.title; document.title = fileBase(data);
    await new Promise((r) => setTimeout(r, 60));
    window.print();
    document.title = prevTitle;
    return pages.length;
  }

  window.Exporter = { fetchDefaultTemplate, inspect, buildDocxBlob, renderReport, downloadDocx, downloadPdf, print, fileBase };
})();
