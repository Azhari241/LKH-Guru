/* Profil, Template, Backup */

function profileFromTemplate(info) {
  const id = info.identity || {};
  return {
    nama: id.nama || '', nip: id.nip || '', pangkat: id.pangkat || '', mapel: id.mapel || '',
    kop: info.kop || [], judul: info.title || '', kota: info.city || '',
    kepala_nama: info.kepala ? info.kepala.name : '', kepala_nip: info.kepala ? info.kepala.nip : '',
    nama_ttd: info.guru ? info.guru.name : '',
  };
}

function ProfileView({ store, profile, setProfile, tplInfo }) {
  const toast = useToast();
  const [f, setF] = useState(profile);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(profile), [profile]);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const kopLabels = (tplInfo && tplInfo.kop) || [];
  const dirty = JSON.stringify(f) !== JSON.stringify(profile);
  const save = async () => {
    setBusy(true);
    try { await store.saveProfile(f); setProfile(f); toast.ok('Profil berhasil disimpan.'); }
    catch (e) { toast.err('Gagal menyimpan profil: ' + Store.msg(e)); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <div className="page-head">
        <div><h1>Profil Guru</h1><p>Data ini mengisi identitas, kop, dan tanda tangan pada template.</p></div>
        <div className="row">
          <button className="btn" disabled={!dirty || busy} onClick={() => setF(profile)}>Batalkan</button>
          <button className="btn btn-primary" disabled={!dirty || busy} onClick={save}><Icon name="check" />{busy ? 'Menyimpan…' : 'Simpan Profil'}</button>
        </div>
      </div>
      <div className="stack">
        <div className="card card-pad stack">
          <div className="sec-title">Identitas Guru</div>
          <div className="grid2">
            <Field label="Nama (identitas)"><input className="inp" value={f.nama} onChange={(e) => set('nama', e.target.value)} /></Field>
            <Field label="NIP"><input className="inp mono" value={f.nip} onChange={(e) => set('nip', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Pangkat / Golongan"><input className="inp" value={f.pangkat} onChange={(e) => set('pangkat', e.target.value)} /></Field>
            <Field label="Mata Pelajaran"><input className="inp" value={f.mapel} onChange={(e) => set('mapel', e.target.value)} /></Field>
          </div>
        </div>
        <div className="card card-pad stack">
          <div className="sec-title">Identitas Instansi (kop surat)</div>
          <p className="hint" style={{ margin: 0 }}>Font, ukuran, logo, dan garis kop tetap mengikuti template. Hanya teksnya yang dapat diganti.</p>
          {kopLabels.map((orig, i) => (
            <Field key={i} label={`Baris kop ${i + 1}`}>
              <input className="inp" value={(f.kop && f.kop[i]) ?? orig} onChange={(e) => { const k = [...(f.kop || kopLabels)]; k[i] = e.target.value; set('kop', k); }} />
            </Field>
          ))}
          <div className="grid2">
            <Field label="Judul laporan"><input className="inp" value={f.judul} onChange={(e) => set('judul', e.target.value)} /></Field>
            <Field label="Kota (tempat tanda tangan)"><input className="inp" value={f.kota} onChange={(e) => set('kota', e.target.value)} /></Field>
          </div>
        </div>
        <div className="card card-pad stack">
          <div className="sec-title">Tanda Tangan</div>
          <div className="grid2">
            <Field label="Nama Kepala Madrasah"><input className="inp" value={f.kepala_nama} onChange={(e) => set('kepala_nama', e.target.value)} /></Field>
            <Field label="NIP Kepala Madrasah"><input className="inp mono" value={f.kepala_nip} onChange={(e) => set('kepala_nip', e.target.value)} /></Field>
            <Field label="Nama guru (pada tanda tangan)" hint="Boleh berbeda penulisan dengan identitas (mis. huruf kecil)."><input className="inp" value={f.nama_ttd} onChange={(e) => set('nama_ttd', e.target.value)} /></Field>
            <Field label="NIP guru (tanda tangan)" hint="Otomatis sama dengan NIP identitas."><input className="inp mono" value={f.nip} readOnly style={{ background: 'var(--soft)' }} /></Field>
          </div>
          {tplInfo && tplInfo.guru && tplInfo.guru.nip && tplInfo.guru.nip !== f.nip && (
            <div className="notice warn">Catatan: NIP pada tanda tangan di template asli tertulis <span className="mono">{tplInfo.guru.nip}</span>, berbeda dengan NIP identitas. Laporan akan memakai NIP identitas <span className="mono">{f.nip}</span>.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateView({ store, template, setTemplate, tplInfo, samples, reload, profile, setProfile }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);

  const upload = async (file) => {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) { toast.err('Pilih file Word berformat .docx.'); return; }
    setBusy('upload');
    try {
      const buf = await file.arrayBuffer();
      const res = await Exporter.inspect(buf);
      await store.saveTemplate(file.name, buf);
      setTemplate({ name: file.name, buf, builtin: false }, res);
      toast.ok(`Template "${file.name}" tersimpan. Terdeteksi ${Object.keys(res.info.columns).length} kolom tabel.`);
    } catch (e) { toast.err('Template ditolak: ' + Store.msg(e)); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };
  const resetDefault = async () => {
    setBusy('reset');
    try { await store.deleteTemplate(); const t = await Exporter.fetchDefaultTemplate(); const res = await Exporter.inspect(t.buf); setTemplate(t, res); toast.ok('Kembali ke template bawaan.'); }
    catch (e) { toast.err('Gagal: ' + Store.msg(e)); }
    finally { setBusy(''); }
  };
  const importSamples = async () => {
    try { const n = await store.bulkInsert(samples); toast.ok(`${n} kegiatan dari template berhasil diimpor.`); await reload(); }
    catch (e) { toast.err('Gagal impor: ' + Store.msg(e)); throw e; }
  };
  const useIdentity = async () => {
    const p = { ...profile, ...profileFromTemplate(tplInfo) };
    try { await store.saveProfile(p); setProfile(p); toast.ok('Profil diisi dari template.'); }
    catch (e) { toast.err('Gagal: ' + Store.msg(e)); }
  };
  const cols = tplInfo ? tplInfo.columns : {};
  const colNames = { no: 'No.', tanggal: 'Hari/Tanggal', deskripsi: 'Deskripsi Kegiatan', satuan: 'Satuan', jumlah: 'Jumlah', evidence: 'Evidence' };
  const sampleMonths = [...new Set(samples.map((s) => U.periodLabel(U.periodOf(s.date))))];

  return (
    <div>
      <div className="page-head">
        <div><h1>Template Word</h1><p>Format dokumen diambil apa adanya dari file Word. Aplikasi hanya mengisi data.</p></div>
        <div className="row">
          <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hide" onChange={(e) => upload(e.target.files[0])} />
          <button className="btn btn-primary" disabled={!!busy} onClick={() => fileRef.current.click()}><Icon name="upload" />{busy === 'upload' ? 'Memeriksa…' : 'Unggah / Ganti Template'}</button>
        </div>
      </div>
      <div className="stack">
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h2>{template ? template.name : '—'}</h2>
              <span className="small muted">{template && template.builtin ? 'Template bawaan (file yang Anda unggah di awal)' : 'Template unggahan, tersimpan di akun Anda'}</span>
            </div>
            <div className="row">
              <button className="btn btn-sm" disabled={!template} onClick={() => U.downloadBlob(new Blob([template.buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), template.name)}><Icon name="download" /> Unduh template</button>
              {template && !template.builtin && <button className="btn btn-sm" disabled={!!busy} onClick={() => setConfirm('reset')}>Pakai template bawaan</button>}
            </div>
          </div>
          {tplInfo && (
            <dl className="kv">
              <dt>Kop surat</dt><dd>{tplInfo.kop.length} baris · logo & garis kop dipertahankan</dd>
              <dt>Judul</dt><dd>{tplInfo.title || '—'}</dd>
              <dt>Identitas</dt><dd>{Object.keys(tplInfo.identity).map((k) => k.toUpperCase()).join(', ') || '—'}</dd>
              <dt>Kolom tabel</dt><dd>{Object.keys(cols).map((k) => colNames[k]).join(' · ')}</dd>
              <dt>Tempat, tanggal</dt><dd>{tplInfo.city ? `${tplInfo.city}, ${tplInfo.signDateText}` : 'tidak ditemukan'}</dd>
              <dt>Tanda tangan</dt><dd>{[tplInfo.kepala && 'Kepala Madrasah', tplInfo.guru && 'Guru'].filter(Boolean).join(' · ') || 'tidak ditemukan'}</dd>
              <dt>Baris contoh</dt><dd>{tplInfo.sampleRows} baris (dipakai sebagai pola baris; isinya diganti data jurnal)</dd>
            </dl>
          )}
        </div>
        <div className="card card-pad stack">
          <div className="sec-title">Cara kerja pengisian</div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Kop, logo, garis ganda, font (Tahoma, Book Antiqua, dll.), margin, dan ukuran kertas tidak diubah.</li>
            <li>Baris tabel contoh dipakai sebagai pola: setiap kegiatan menjadi satu baris dengan format yang sama; No. dan Hari/Tanggal digabung per tanggal.</li>
            <li>Bila kegiatan banyak, Word menambah halaman otomatis dan judul tabel diulang di halaman berikutnya.</li>
            <li>Template pengganti harus memiliki tabel dengan kolom "Deskripsi Kegiatan" dan minimal satu baris contoh.</li>
          </ul>
        </div>
        {tplInfo && (
          <div className="card card-pad stack">
            <div className="sec-title">Ambil data dari template</div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="grow small">Isi profil (nama, NIP, kop, kepala madrasah) dengan data yang tertulis di template.</div>
              <button className="btn btn-sm" onClick={useIdentity}>Isi profil dari template</button>
            </div>
            {samples.length > 0 && (
              <div className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <div className="grow small">Template berisi <b>{samples.length} kegiatan</b> ({sampleMonths.join(', ')}). Impor sebagai data jurnal agar tidak perlu mengetik ulang.</div>
                <button className="btn btn-sm" onClick={() => setConfirm('import')}>Impor {samples.length} kegiatan</button>
              </div>
            )}
          </div>
        )}
      </div>
      {confirm === 'reset' && <Confirm title="Pakai template bawaan?" text="Template unggahan akan dihapus dari akun Anda dan laporan kembali memakai template bawaan." okText="Ya, pakai bawaan" onClose={() => setConfirm(null)} onOk={resetDefault} />}
      {confirm === 'import' && <Confirm title="Impor kegiatan dari template?" danger={false} okText="Impor" text={`${samples.length} kegiatan akan ditambahkan ke jurnal. Jika sebelumnya sudah diimpor, data akan menjadi ganda.`} onClose={() => setConfirm(null)} onOk={importSamples} />}
    </div>
  );
}

function BackupView({ store, profile, setProfile, template, setTemplate, reload }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState(null);
  const [mode, setMode] = useState('merge');

  const doBackup = async () => {
    setBusy('backup');
    try {
      const entries = await store.listEntries();
      const payload = {
        app: 'jurnal-harian-guru', version: 1, exported_at: new Date().toISOString(),
        profile, entries: entries.map(({ date, description, unit, quantity, evidence, position }) => ({ date, description, unit, quantity, evidence, position })),
        template: template && !template.builtin ? { name: template.name, docx_base64: U.bufToB64(template.buf) } : null,
      };
      U.downloadBlob(new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }), `backup-jurnal-guru-${U.todayISO()}.json`);
      toast.ok(`Backup berhasil: ${entries.length} kegiatan.`);
    } catch (e) { toast.err('Backup gagal: ' + Store.msg(e)); }
    finally { setBusy(''); }
  };
  const pick = async (file) => {
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (j.app !== 'jurnal-harian-guru' || !Array.isArray(j.entries)) throw new Error('File bukan backup Jurnal Harian Guru.');
      const bad = j.entries.find((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !e.description);
      if (bad) throw new Error('Isi backup rusak (tanggal/deskripsi tidak valid).');
      setPending({ name: file.name, data: j });
    } catch (e) { toast.err('Tidak dapat membaca backup: ' + e.message); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const restore = async () => {
    const j = pending.data;
    try {
      if (mode === 'replace') await store.deleteAllEntries();
      const n = await store.bulkInsert(j.entries);
      if (j.profile) { await store.saveProfile(j.profile); setProfile(j.profile); }
      if (j.template && j.template.docx_base64) {
        const buf = U.b64ToBuf(j.template.docx_base64);
        const res = await Exporter.inspect(buf);
        await store.saveTemplate(j.template.name, buf); setTemplate({ name: j.template.name, buf, builtin: false }, res);
      }
      await reload();
      toast.ok(`Pemulihan berhasil: ${n} kegiatan dipulihkan.`);
      setPending(null);
    } catch (e) { toast.err('Pemulihan gagal: ' + Store.msg(e)); throw e; }
  };

  return (
    <div>
      <div className="page-head"><div><h1>Backup & Pemulihan</h1><p>Simpan salinan seluruh data ke file, lalu pulihkan kapan saja.</p></div></div>
      <div className="grid2">
        <div className="card card-pad stack">
          <h2>Backup data</h2>
          <p className="small muted" style={{ margin: 0 }}>Mengunduh file .json berisi profil, semua kegiatan dari semua bulan, dan template unggahan.</p>
          <button className="btn btn-primary" disabled={!!busy} onClick={doBackup}><Icon name="download" />{busy ? 'Menyiapkan…' : 'Unduh Backup'}</button>
        </div>
        <div className="card card-pad stack">
          <h2>Pulihkan data</h2>
          <p className="small muted" style={{ margin: 0 }}>Pilih file backup .json yang pernah diunduh dari aplikasi ini.</p>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hide" onChange={(e) => pick(e.target.files[0])} />
          <button className="btn" onClick={() => fileRef.current.click()}><Icon name="upload" /> Pilih File Backup</button>
        </div>
      </div>
      {pending && (
        <Modal title="Pulihkan backup" onClose={() => setPending(null)} size="sm" foot={<>
          <button className="btn" onClick={() => setPending(null)}>Batal</button>
          <RestoreButton onRun={restore} danger={mode === 'replace'} />
        </>}>
          <div className="stack">
            <div className="small"><b>{pending.name}</b><br />{pending.data.entries.length} kegiatan · dibuat {new Date(pending.data.exported_at).toLocaleString('id-ID')}</div>
            <label className="row small" style={{ cursor: 'pointer' }}><input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Gabungkan dengan data yang ada</label>
            <label className="row small" style={{ cursor: 'pointer' }}><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Ganti semua kegiatan dengan isi backup</label>
            {mode === 'replace' && <div className="notice warn">Semua kegiatan yang ada sekarang akan dihapus terlebih dahulu.</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
function RestoreButton({ onRun, danger }) {
  const [b, setB] = useState(false);
  return <button className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} disabled={b} onClick={async () => { setB(true); try { await onRun(); } catch (e) { /* toast sudah tampil */ } finally { setB(false); } }}>{b ? 'Memulihkan…' : 'Pulihkan'}</button>;
}

Object.assign(window, { ProfileView, TemplateView, BackupView, profileFromTemplate });
