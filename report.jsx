/* Halaman Laporan: pratinjau berhalaman, unduh Word, unduh PDF, cetak */

function PagePreview({ page, geo, width }) {
  const ref = useRef(null);
  const scale = Math.min(1, width / geo.w);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.innerHTML = '';
    page.style.transform = `scale(${scale})`;
    el.appendChild(page);
  }, [page, scale]);
  return <div className="page-scale" ref={ref} style={{ width: geo.w * scale, height: geo.h * scale }} />;
}

function ReportView({ store, period, setPeriod, entries, loading, profile, template, goto }) {
  const toast = useToast();
  const [signDate, setSignDate] = useState(U.lastDayOfPeriod(period));
  const [render, setRender] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState('');
  const [width, setWidth] = useState(800);
  const wrapRef = useRef(null);

  useEffect(() => { setSignDate(U.lastDayOfPeriod(period)); }, [period]);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, el.clientWidth - 24)));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const data = useMemo(() => ({ profile, period, entries, signDate }), [profile, period, entries, signDate]);

  useEffect(() => {
    if (!template || loading) return;
    let alive = true;
    setRendering(true);
    const t = setTimeout(async () => {
      try { const r = await Exporter.renderReport(template.buf, data); if (alive) setRender(r); }
      catch (e) { if (alive) { setRender(null); toast.err('Pratinjau gagal: ' + e.message); } }
      finally { if (alive) setRendering(false); }
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [template, data, loading]);

  const run = async (kind) => {
    if (!template) return;
    setBusy(kind);
    try {
      if (kind === 'docx') { await Exporter.downloadDocx(template.buf, data); toast.ok('File Word berhasil dibuat dan diunduh.'); }
      if (kind === 'pdf') { const n = await Exporter.downloadPdf(template.buf, data, (i, t) => setBusy(`pdf ${i}/${t}`)); toast.ok(`PDF ${n} halaman berhasil diunduh.`); }
      if (kind === 'print') { await Exporter.print(template.buf, data); }
    } catch (e) { toast.err('Gagal: ' + (e.message || e)); }
    finally { setBusy(''); }
  };

  const days = new Set(entries.map((e) => e.date)).size;
  const pdfLabel = busy.startsWith('pdf') ? (busy.length > 3 ? `Membuat PDF ${busy.slice(4)}…` : 'Membuat PDF…') : 'Unduh PDF';

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Laporan Bulanan</h1>
          <p>Diisi ke template Word asli: {template ? template.name : '—'}</p>
        </div>
        <MonthBar period={period} setPeriod={setPeriod} />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end', gap: 14 }}>
          <div className="field" style={{ width: 210 }}>
            <label>Tanggal tanda tangan</label>
            <input className="inp" type="date" value={signDate} onChange={(e) => e.target.value && setSignDate(e.target.value)} />
          </div>
          <div className="grow small muted" style={{ minWidth: 180, paddingBottom: 10 }}>
            {days} hari · {entries.length} kegiatan{render ? ` · ${render.pages.length} halaman` : ''}
            {!profile.nama && <> · <a href="#" onClick={(e) => { e.preventDefault(); goto('profil'); }}>lengkapi profil</a></>}
          </div>
          <div className="row">
            <button className="btn btn-primary" disabled={!template || !!busy} onClick={() => run('docx')}><Icon name="word" />{busy === 'docx' ? 'Membuat…' : 'Unduh Word'}</button>
            <button className="btn" disabled={!template || !!busy} onClick={() => run('pdf')}><Icon name="pdf" />{pdfLabel}</button>
            <button className="btn" disabled={!template || !!busy} onClick={() => run('print')}><Icon name="print" />{busy === 'print' ? 'Menyiapkan…' : 'Cetak'}</button>
          </div>
        </div>
        {entries.length === 0 && !loading && <div className="notice warn" style={{ marginTop: 14 }}>Belum ada kegiatan di {U.periodLabel(period)}. Laporan akan berisi tabel kosong.</div>}
      </div>

      <div className="report-wrap" ref={wrapRef}>
        {(!render || rendering) && <Spinner text="Menyusun pratinjau dari template…" />}
        {render && (
          <div className="report-pages" style={{ opacity: rendering ? 0.4 : 1 }}>
            {render.pages.map((p, i) => (
              <div key={i}>
                <PagePreview page={p} geo={render.geo} width={width} />
                <div className="page-label">Halaman {i + 1} dari {render.pages.length}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ReportView });
