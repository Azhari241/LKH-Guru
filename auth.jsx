/* Pengaturan server & login pribadi */

function SetupScreen({ onReady }) {
  const toast = useToast();
  const cfg0 = Store.getConfig() || {};
  const [url, setUrl] = useState(cfg0.url || '');
  const [key, setKey] = useState(cfg0.anonKey || '');
  const [sql, setSql] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { fetch('supabase/schema.sql').then((r) => r.text()).then(setSql).catch(() => setSql('-- gagal memuat supabase/schema.sql')); }, []);

  const connect = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await Store.checkServer({ url, anonKey: key });
      setResult(r);
      if (!r.ok) { toast.err('Pengujian belum lolos: ' + r.steps.find((s) => s.status === 'fail').text); return; }
      Store.setConfig({ url: r.url, anonKey: key.trim() });
      Store.setMode('supabase');
      toast.ok('Server Supabase terhubung. Silakan masuk; akses tabel diperiksa setelah login.');
      setTimeout(onReady, 900);
    } catch (e) { toast.err('Pengujian gagal: ' + Store.msg(e)); }
    finally { setBusy(false); }
  };
  const copySql = async () => { try { await navigator.clipboard.writeText(sql); toast.ok('SQL disalin.'); } catch (e) { toast.err('Tidak dapat menyalin. Pilih teks secara manual.'); } };

  return (
    <div className="auth">
      <div className="card card-pad auth-card wide stack">
        <div className="brand" style={{ padding: 0 }}><div className="brand-mark">JH</div><div><b>Jurnal Harian Guru</b><span>Pengaturan server data</span></div></div>
        <h1 style={{ margin: 0 }}>Hubungkan ke Supabase</h1>
        <p className="muted small" style={{ margin: 0 }}>Data disimpan di database PostgreSQL Supabase milik Anda sehingga dapat dibuka dari HP dan laptop dengan akun yang sama.</p>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Buat proyek gratis di <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com</a>.</li>
          <li>Buka <b>SQL Editor</b>, tempel SQL di bawah, lalu klik <b>Run</b>.</li>
          <li>Buka <b>Project Settings → API</b>, salin <b>Project URL</b> dan <b>anon public key</b> ke kolom berikut.</li>
        </ol>
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><span className="lbl">supabase/schema.sql</span><button className="btn btn-sm" onClick={copySql}><Icon name="copy" /> Salin SQL</button></div>
          <div className="code">{sql}</div>
        </div>
        <Field label="Project URL"><input className="inp mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxxxxxx.supabase.co" /></Field>
        <Field label="Anon public key"><input className="inp mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" /></Field>
        <button className="btn btn-primary btn-block" disabled={busy} onClick={connect}>{busy ? 'Menguji koneksi…' : 'Uji & Hubungkan'}</button>
        {result && <CheckList steps={result.steps} />}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }} className="row">
          <div className="grow small muted">Hanya ingin mencoba dulu? Mode uji menyimpan data di perangkat ini saja (tidak tersinkron).</div>
          <button className="btn btn-sm" onClick={() => { Store.setMode('local'); onReady(); }}>Coba mode uji</button>
        </div>
      </div>
    </div>
  );
}

/** Daftar hasil pemeriksaan bertahap */
function CheckList({ steps }) {
  const mark = { ok: '✓', fail: '✕', warn: '!', wait: '…' };
  return (
    <div className="checklist">
      {steps.map((s) => (
        <div key={s.id || s.table} className={'chk chk-' + s.status}>
          <span className="chk-mark">{mark[s.status]}</span>
          <div><b>{s.label || s.table}</b><div className="small">{s.text}</div></div>
        </div>
      ))}
    </div>
  );
}

/** Peringatan akses tabel setelah login + SQL perbaikan */
function TableAccessNotice({ results, onRetry }) {
  const toast = useToast();
  const [sql, setSql] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('supabase/fix-permissions.sql').then((r) => r.text()).then(setSql).catch(() => setSql('-- gagal memuat supabase/fix-permissions.sql')); }, []);
  const failed = results.filter((r) => r.status === 'fail');
  if (!failed.length) return null;
  const grant = failed.some((r) => r.kind === 'grant');
  const copy = async () => { try { await navigator.clipboard.writeText(sql); toast.ok('SQL perbaikan disalin.'); } catch (e) { toast.err('Tidak dapat menyalin. Pilih teks secara manual.'); } };
  return (
    <div className="notice warn stack" style={{ marginBottom: 16, gap: 10 }}>
      <div><b>Akses database belum lengkap — data belum dapat disimpan.</b></div>
      <CheckList steps={results.map((r) => ({ ...r, label: r.table }))} />
      {grant && <div className="small">Penyebab: role <span className="mono">authenticated</span> belum diberi hak akses tabel. Buka <b>SQL Editor</b> di proyek Supabase yang sama, jalankan <span className="mono">supabase/fix-permissions.sql</span>, lalu klik Periksa ulang. Skrip ini tidak menghapus data dan tidak mematikan RLS.</div>}
      <div className="row">
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } }}><Icon name="refresh" />{busy ? 'Memeriksa…' : 'Periksa ulang'}</button>
        <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>{open ? 'Sembunyikan SQL' : 'Lihat SQL perbaikan'}</button>
        <button className="btn btn-sm" onClick={copy}><Icon name="copy" /> Salin SQL</button>
      </div>
      {open && <div className="code">{sql}</div>}
    </div>
  );
}

function AuthScreen({ store, onAuthed, onChangeServer }) {
  const toast = useToast();
  const [tab, setTab] = useState('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const local = store.kind === 'local';

  const submit = async (e) => {
    e.preventDefault();
    if (!local && (!email.trim() || !pw)) { toast.err('Isi email dan kata sandi.'); return; }
    setBusy(true);
    try {
      if (tab === 'forgot') { await store.resetPassword(email.trim()); toast.ok('Tautan atur ulang kata sandi telah dikirim ke email Anda.'); setTab('in'); return; }
      if (tab === 'up') {
        if (pw.length < 6) throw new Error('Kata sandi minimal 6 karakter.');
        if (pw !== pw2) throw new Error('Konfirmasi kata sandi tidak sama.');
        const r = await store.signUp(email.trim(), pw);
        if (r.needsConfirm) { toast.ok('Akun dibuat. Buka email Anda dan klik tautan konfirmasi, lalu masuk.'); setTab('in'); return; }
        toast.ok('Akun berhasil dibuat.'); onAuthed(r); return;
      }
      const u = await store.signIn(email.trim(), pw);
      toast.ok('Berhasil masuk.'); onAuthed(u);
    } catch (er) { toast.err(Store.msg(er)); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <form className="card card-pad auth-card stack" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}><div className="brand-mark">JH</div><div><b>Jurnal Harian Guru</b><span>Laporan kinerja bulanan</span></div></div>
        <h1 style={{ margin: 0 }}>{tab === 'up' ? 'Buat akun pribadi' : tab === 'forgot' ? 'Lupa kata sandi' : 'Masuk'}</h1>
        {local && <div className="notice warn">Mode uji: data hanya tersimpan di browser perangkat ini.</div>}
        {tab !== 'forgot' && !local && (
          <div className="tabs"><button type="button" className={tab === 'in' ? 'on' : ''} onClick={() => setTab('in')}>Masuk</button><button type="button" className={tab === 'up' ? 'on' : ''} onClick={() => setTab('up')}>Daftar</button></div>
        )}
        <Field label="Email"><input className="inp" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" required={!local} /></Field>
        {tab !== 'forgot' && !local && <Field label="Kata sandi"><input className="inp" type="password" autoComplete={tab === 'up' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>}
        {tab === 'up' && <Field label="Ulangi kata sandi"><input className="inp" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Memproses…' : tab === 'up' ? 'Daftar' : tab === 'forgot' ? 'Kirim tautan' : local ? 'Mulai mode uji' : 'Masuk'}</button>
        {!local && (
          <div className="row small" style={{ justifyContent: 'space-between' }}>
            {tab === 'forgot' ? <a href="#" onClick={(e) => { e.preventDefault(); setTab('in'); }}>← Kembali</a> : <a href="#" onClick={(e) => { e.preventDefault(); setTab('forgot'); }}>Lupa kata sandi?</a>}
            {!(Store.getConfig() || {}).fixed && <a href="#" onClick={(e) => { e.preventDefault(); onChangeServer(); }}>Ganti server</a>}
          </div>
        )}
        {local && <a href="#" className="small" onClick={(e) => { e.preventDefault(); onChangeServer(); }}>Gunakan Supabase</a>}
      </form>
    </div>
  );
}

Object.assign(window, { SetupScreen, AuthScreen, CheckList, TableAccessNotice });
