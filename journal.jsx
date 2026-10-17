/* Halaman Jurnal: input, edit, hapus, cari, filter kegiatan per bulan */

const UNIT_PRESETS = [
  { label: 'Kegiatan / orang', v: 'Kegiatan\norang' },
  { label: 'Kegiatan / lembar', v: 'Kegiatan\nlembar' },
  { label: 'Kali', v: 'Kali' },
  { label: 'Kegiatan', v: 'Kegiatan' },
];

function EntryForm({ initial, onSave, onClose, evidenceSuggestions, defaultDate }) {
  const toast = useToast();
  const blank = { date: defaultDate || U.todayISO(), description: '', unit: 'Kegiatan\norang', quantity: '', evidence: '' };
  const [f, setF] = useState(initial ? { ...initial } : blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const descRef = useRef(null);
  useEffect(() => { descRef.current && descRef.current.focus(); }, []);

  const validate = () => {
    const e = {};
    if (!f.date) e.date = 'Tanggal wajib diisi.';
    if (!f.description.trim()) e.description = 'Deskripsi kegiatan wajib diisi.';
    setErr(e); return !Object.keys(e).length;
  };
  const submit = async (again) => {
    if (!validate()) return;
    setBusy(true);
    try {
      await onSave({ ...f, description: f.description.trim(), unit: f.unit.trim(), quantity: String(f.quantity).trim(), evidence: f.evidence.trim() });
      toast.ok(initial ? 'Perubahan kegiatan tersimpan.' : 'Kegiatan berhasil disimpan.');
      if (again) { setF({ ...blank, date: f.date, unit: f.unit, evidence: '' }); descRef.current && descRef.current.focus(); }
      else onClose();
    } catch (e) { toast.err('Gagal menyimpan: ' + Store.msg(e)); }
    finally { setBusy(false); }
  };
  const day = f.date ? U.dayName(f.date) : '—';

  return (
    <Modal title={initial ? 'Edit Kegiatan' : 'Tambah Kegiatan'} onClose={onClose} foot={<>
      <button className="btn" onClick={onClose} disabled={busy}>Batal</button>
      {!initial && <button className="btn" onClick={() => submit(true)} disabled={busy}>Simpan & tambah lagi</button>}
      <button className="btn btn-primary" onClick={() => submit(false)} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <div className="grid2">
          <Field label="Tanggal" warn={err.date}>
            <input className="inp" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} required />
          </Field>
          <Field label="Hari (otomatis)">
            <input className="inp" value={f.date ? `${day}, ${U.fmtLong(f.date)}` : ''} readOnly tabIndex={-1} style={{ background: 'var(--soft)' }} />
          </Field>
        </div>
        <Field label="Deskripsi Kegiatan" warn={err.description} hint="Teks Arab didukung dan akan ditulis kanan-ke-kiri di dokumen Word.">
          <textarea ref={descRef} className="inp" rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Contoh: Melaksanakan proses belajar mengajar di kelas VIII 4 mata pelajaran bahasa Arab dengan materi …" />
        </Field>
        <div className="grid3">
          <Field label="Satuan" hint="Tekan Enter untuk baris kedua.">
            <textarea className="inp" rows={2} value={f.unit} onChange={(e) => set('unit', e.target.value)} />
          </Field>
          <Field label="Jumlah">
            <input className="inp" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} inputMode="numeric" placeholder="35" />
          </Field>
          <Field label="Evidence">
            <input className="inp" list="ev-list" value={f.evidence} onChange={(e) => set('evidence', e.target.value)} placeholder="PBM" />
            <datalist id="ev-list">{evidenceSuggestions.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
        </div>
        <div className="chips">
          {UNIT_PRESETS.map((p) => <button type="button" key={p.label} className="chip" onClick={() => set('unit', p.v)}>{p.label}</button>)}
        </div>
        {evidenceSuggestions.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Evidence yang sering dipakai</div>
            <div className="chips">{evidenceSuggestions.slice(0, 8).map((x) => <button type="button" key={x} className="chip" onClick={() => set('evidence', x)}>{x}</button>)}</div>
          </div>
        )}
        <button type="submit" className="hide" />
      </form>
    </Modal>
  );
}

function JournalView({ store, period, setPeriod, entries, reload, loading, allEvidence }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [fEv, setFEv] = useState('');
  const [fDate, setFDate] = useState('');
  const [form, setForm] = useState(null); // {initial?}
  const [del, setDel] = useState(null);

  useEffect(() => { setFDate(''); }, [period]);

  const evOptions = useMemo(() => [...new Set(entries.map((e) => e.evidence).filter(Boolean))].sort(), [entries]);
  const dates = useMemo(() => [...new Set(entries.map((e) => e.date))].sort(), [entries]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return entries.filter((e) => (!fEv || e.evidence === fEv) && (!fDate || e.date === fDate) && (!s || [e.description, e.unit, e.evidence, String(e.quantity)].join(' ').toLowerCase().includes(s)));
  }, [entries, q, fEv, fDate]);
  const groups = useMemo(() => DocxEngine.groupByDate(filtered), [filtered]);
  const allGroups = useMemo(() => DocxEngine.groupByDate(entries), [entries]);
  const numberOf = useMemo(() => Object.fromEntries(allGroups.map((g, i) => [g.date, i + 1])), [allGroups]);

  const nextPos = (date, excludeId) => { const l = entries.filter((e) => e.date === date && e.id !== excludeId); return l.length ? Math.max(...l.map((e) => e.position || 0)) + 1 : 0; };

  const save = async (data, initial) => {
    if (initial) {
      const pos = initial.date === data.date ? initial.position || 0 : nextPos(data.date, initial.id);
      await store.updateEntry(initial.id, { ...data, position: pos });
    } else {
      await store.addEntry({ ...data, position: nextPos(data.date) });
    }
    if (U.periodOf(data.date) !== period) setPeriod(U.periodOf(data.date));
    await reload();
  };
  const duplicate = async (e) => {
    try { await store.addEntry({ ...e, position: nextPos(e.date) }); toast.ok('Kegiatan diduplikasi.'); await reload(); }
    catch (er) { toast.err('Gagal menduplikasi: ' + Store.msg(er)); }
  };
  const move = async (g, idx, dir) => {
    const items = [...g.items]; const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    [items[idx], items[j]] = [items[j], items[idx]];
    try {
      for (let i = 0; i < items.length; i++) if ((items[i].position || 0) !== i) await store.updateEntry(items[i].id, { ...items[i], position: i });
      await reload();
    } catch (er) { toast.err('Gagal mengubah urutan: ' + Store.msg(er)); }
  };
  const defaultDate = U.periodOf(U.todayISO()) === period ? U.todayISO() : `${period}-01`;
  const filtering = q || fEv || fDate;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Jurnal Harian</h1>
          <p>Catat kegiatan harian. Satu tanggal dapat berisi banyak kegiatan.</p>
        </div>
        <div className="row head-actions">
          <MonthBar period={period} setPeriod={setPeriod} />
          <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" /><span className="btn-label">Tambah Kegiatan</span></button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b>{allGroups.length}</b><span>Hari tercatat</span></div>
        <div className="stat"><b>{entries.length}</b><span>Kegiatan</span></div>
        <div className="stat"><b>{U.periodLabel(period).split(' ')[0].slice(0, 3)} {period.slice(0, 4)}</b><span>Periode laporan</span></div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari deskripsi, satuan, evidence…" aria-label="Cari kegiatan" />
        </div>
        <select className="inp" value={fDate} onChange={(e) => setFDate(e.target.value)} aria-label="Filter tanggal">
          <option value="">Semua tanggal</option>
          {dates.map((d) => <option key={d} value={d}>{U.dayName(d)}, {U.fmtShort(d)}</option>)}
        </select>
        <select className="inp" value={fEv} onChange={(e) => setFEv(e.target.value)} aria-label="Filter evidence">
          <option value="">Semua evidence</option>
          {evOptions.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <button className="btn" onClick={() => { setQ(''); setFEv(''); setFDate(''); }} disabled={!filtering}>Reset</button>
      </div>

      {loading ? <Spinner text="Memuat kegiatan…" /> : groups.length === 0 ? (
        <div className="empty">
          <h3>{filtering ? 'Tidak ada kegiatan yang cocok' : `Belum ada kegiatan di ${U.periodLabel(period)}`}</h3>
          <p>{filtering ? 'Ubah kata kunci atau reset filter.' : 'Tambahkan kegiatan pertama untuk bulan ini.'}</p>
          {!filtering && <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" /> Tambah Kegiatan</button>}
        </div>
      ) : groups.map((g) => (
        <div className="day" key={g.date}>
          <div className="day-head">
            <span className="day-num">{numberOf[g.date]}</span>
            <div className="grow"><b>{U.dayName(g.date)}, {U.fmtLong(g.date)}</b><span>{g.items.length} kegiatan</span></div>
            <button className="btn btn-sm" onClick={() => setForm({ date: g.date })}><Icon name="plus" /> Kegiatan</button>
          </div>
          {g.items.map((e, i) => (
            <div className="entry" key={e.id}>
              <div className="entry-desc">{e.description}</div>
              <div className="entry-meta"><small>Satuan</small>{e.unit || '—'}</div>
              <div className="entry-meta"><small>Jumlah</small><span className="mono">{e.quantity || '—'}</span></div>
              <div className="entry-meta"><small>Evidence</small>{e.evidence ? <span className="tag">{e.evidence}</span> : '—'}</div>
              <div className="entry-actions">
                {!filtering && <button className="btn btn-ghost btn-icon" title="Naikkan" aria-label="Naikkan" disabled={i === 0} onClick={() => move(g, i, -1)}><Icon name="up" /></button>}
                {!filtering && <button className="btn btn-ghost btn-icon" title="Turunkan" aria-label="Turunkan" disabled={i === g.items.length - 1} onClick={() => move(g, i, 1)}><Icon name="down" /></button>}
                <button className="btn btn-ghost btn-icon" title="Duplikat" aria-label="Duplikat" onClick={() => duplicate(e)}><Icon name="copy" /></button>
                <button className="btn btn-ghost btn-icon" title="Edit" aria-label="Edit" onClick={() => setForm({ initial: e })}><Icon name="edit" /></button>
                <button className="btn btn-ghost btn-icon" title="Hapus" aria-label="Hapus" style={{ color: 'var(--err)' }} onClick={() => setDel(e)}><Icon name="trash" /></button>
              </div>
            </div>
          ))}
        </div>
      ))}

      <button className="btn btn-primary fab" onClick={() => setForm({})} aria-label="Tambah kegiatan"><Icon name="plus" size={24} /></button>

      {form && <EntryForm initial={form.initial} defaultDate={form.date || defaultDate} evidenceSuggestions={allEvidence} onClose={() => setForm(null)} onSave={(d) => save(d, form.initial)} />}
      {del && <Confirm title="Hapus kegiatan?" text={`Kegiatan pada ${U.dayName(del.date)}, ${U.fmtLong(del.date)} akan dihapus permanen.`} onClose={() => setDel(null)} onOk={async () => {
        try { await store.deleteEntry(del.id); toast.ok('Kegiatan dihapus.'); await reload(); }
        catch (er) { toast.err('Gagal menghapus: ' + Store.msg(er)); throw er; }
      }} />}
    </div>
  );
}

Object.assign(window, { JournalView, EntryForm });
