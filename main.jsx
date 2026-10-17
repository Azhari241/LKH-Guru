/* Aplikasi utama */

const NAV = [
  { id: 'jurnal', label: 'Jurnal', icon: 'journal' },
  { id: 'laporan', label: 'Laporan', icon: 'report' },
  { id: 'profil', label: 'Profil', icon: 'user' },
  { id: 'template', label: 'Template', icon: 'file' },
  { id: 'backup', label: 'Backup', icon: 'db' },
];

function Workspace({ store, user, onLogout }) {
  const toast = useToast();
  const [view, setView] = useState(() => localStorage.getItem('jhg.view') || 'jurnal');
  const [period, setPeriod] = useState(() => localStorage.getItem('jhg.period') || U.periodOf(U.todayISO()));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [template, setTpl] = useState(null);
  const [tplInfo, setTplInfo] = useState(null);
  const [samples, setSamples] = useState([]);
  const [allEvidence, setAllEvidence] = useState([]);
  const [bootErr, setBootErr] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [access, setAccess] = useState([]);
  const checkAccess = useCallback(async () => {
    try {
      const r = await store.checkTables();
      setAccess(r);
      if (r.length && !r.some((x) => x.status === 'fail')) toast.ok('Akses tabel database terverifikasi.');
      return r;
    } catch (e) { const r = [{ table: 'database', status: 'fail', kind: 'other', text: Store.msg(e) }]; setAccess(r); return r; }
  }, [store]);

  useEffect(() => { localStorage.setItem('jhg.view', view); window.scrollTo(0, 0); }, [view]);
  useEffect(() => { localStorage.setItem('jhg.period', period); }, [period]);

  const setTemplate = (t, res) => { setTpl(t); setTplInfo(res.info); setSamples(res.samples || []); };

  const reload = useCallback(async () => {
    setLoading(true);
    try { setEntries(await store.listEntries(`${period}-01`, U.lastDayOfPeriod(period))); }
    catch (e) { toast.err('Gagal memuat kegiatan: ' + Store.msg(e)); }
    finally { setLoading(false); }
  }, [store, period]);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const s = new Map(); entries.forEach((e) => e.evidence && s.set(e.evidence, (s.get(e.evidence) || 0) + 1));
    setAllEvidence((old) => { const merged = new Map(old.map((x) => [x, 0])); s.forEach((v, k) => merged.set(k, v)); return [...merged.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 30); });
  }, [entries]);

  useEffect(() => {
    (async () => {
      try {
        const acc = await checkAccess();
        const blocked = acc.some((x) => x.status === 'fail');
        let t = null;
        if (!blocked) { try { t = await store.getTemplate(); } catch (e) { toast.err('Gagal memuat template akun: ' + Store.msg(e)); } }
        if (!t) t = await Exporter.fetchDefaultTemplate();
        const res = await Exporter.inspect(t.buf);
        setTemplate(t, res);
        let p = null;
        if (!blocked) { try { p = await store.getProfile(); } catch (e) { toast.err('Gagal memuat profil: ' + Store.msg(e)); } }
        if (!p && !blocked) { p = profileFromTemplate(res.info); try { await store.saveProfile(p); } catch (e) { /* abaikan, tetap pakai lokal */ } }
        setProfile({ ...profileFromTemplate(res.info), ...p });
      } catch (e) { setBootErr(Store.msg(e)); }
    })();
  }, [store]);

  if (bootErr) return <div className="auth"><div className="card card-pad auth-card stack"><h1 style={{ margin: 0 }}>Gagal memuat</h1><p className="muted">{bootErr}</p><button className="btn btn-primary" onClick={() => location.reload()}><Icon name="refresh" /> Coba lagi</button><button className="btn" onClick={onLogout}>Keluar</button></div></div>;
  if (!profile || !template) return <div className="auth"><Spinner text="Menyiapkan data akun…" /></div>;

  const common = { store, period, setPeriod, entries, reload, loading };
  const go = (v) => { setView(v); setMoreOpen(false); };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><div className="brand-mark">JH</div><div><b>Jurnal Harian Guru</b><span>{profile.mapel || 'Laporan kinerja'}</span></div></div>
        {NAV.map((n) => <button key={n.id} className={'nav-btn ' + (view === n.id ? 'on' : '')} onClick={() => go(n.id)}><Icon name={n.icon} />{n.label}</button>)}
        <div className="side-foot">
          <span className={'badge ' + (store.kind === 'local' ? 'local' : '')}><span className="d" />{store.label}</span>
          <div style={{ marginTop: 8 }}>{user.email}</div>
          <button className="btn btn-sm btn-block" onClick={onLogout}><Icon name="logout" /> Keluar</button>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand-mark">JH</div>
        <div className="grow"><b>{NAV.find((n) => n.id === view).label}</b></div>
        <span className={'badge ' + (store.kind === 'local' ? 'local' : '')}><span className="d" />{store.kind === 'local' ? 'Uji' : 'Online'}</span>
        <button className="btn btn-ghost btn-icon" onClick={() => setMoreOpen(true)} aria-label="Menu lainnya"><Icon name="menu" /></button>
      </header>

      <main className="main">
        {store.kind === 'local' && <div className="notice warn" style={{ marginBottom: 16 }}>Mode uji aktif — data hanya di browser ini dan tidak tersinkron ke perangkat lain. Hubungkan Supabase untuk penyimpanan permanen.</div>}
        <TableAccessNotice results={access} onRetry={async () => { const r = await checkAccess(); if (!r.some((x) => x.status === 'fail')) { try { const p = await store.getProfile(); if (p) setProfile((o) => ({ ...o, ...p })); } catch (e) { /* ditampilkan saat dipakai */ } reload(); } }} />
        {view === 'jurnal' && <JournalView {...common} allEvidence={allEvidence} />}
        {view === 'laporan' && <ReportView {...common} profile={profile} template={template} goto={go} />}
        {view === 'profil' && <ProfileView store={store} profile={profile} setProfile={setProfile} tplInfo={tplInfo} />}
        {view === 'template' && <TemplateView store={store} template={template} setTemplate={setTemplate} tplInfo={tplInfo} samples={samples} reload={reload} profile={profile} setProfile={setProfile} />}
        {view === 'backup' && <BackupView store={store} profile={profile} setProfile={setProfile} template={template} setTemplate={setTemplate} reload={reload} />}
      </main>

      <nav className="bottomnav">
        {NAV.slice(0, 3).map((n) => <button key={n.id} className={view === n.id ? 'on' : ''} onClick={() => go(n.id)}><Icon name={n.icon} />{n.label}</button>)}
        <button className={['template', 'backup'].includes(view) ? 'on' : ''} onClick={() => setMoreOpen(true)}><Icon name="menu" />Lainnya</button>
      </nav>

      {moreOpen && (
        <Modal title="Menu" onClose={() => setMoreOpen(false)} size="sm">
          <div className="stack" style={{ gap: 6 }}>
            {NAV.map((n) => <button key={n.id} className={'nav-btn ' + (view === n.id ? 'on' : '')} onClick={() => go(n.id)}><Icon name={n.icon} />{n.label}</button>)}
            <div className="small muted" style={{ padding: '10px 12px 0', borderTop: '1px solid var(--line)', marginTop: 6 }}>{store.label} · {user.email}</div>
            <button className="btn btn-block" onClick={onLogout}><Icon name="logout" /> Keluar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function App() {
  const toast = useToast();
  const [store, setStore] = useState(() => { try { return Store.create(); } catch (e) { return null; } });
  const [user, setUser] = useState(undefined);
  const [setup, setSetup] = useState(!store);

  useEffect(() => {
    if (!store) { setUser(null); return; }
    let off = () => {};
    store.session().then((u) => setUser(u)).catch((e) => { toast.err(Store.msg(e)); setUser(null); });
    off = store.onAuth((u) => setUser((old) => (old && u && old.id === u.id ? old : u)));
    return () => off();
  }, [store]);

  const ready = () => { try { setStore(Store.create()); setSetup(false); setUser(undefined); } catch (e) { toast.err(Store.msg(e)); } };
  const logout = async () => { try { await store.signOut(); toast.ok('Anda telah keluar.'); } catch (e) { toast.err(Store.msg(e)); } setUser(null); };
  const changeServer = () => { Store.setMode(null); setSetup(true); setStore(null); };

  if (setup || !store) return <SetupScreen onReady={ready} />;
  if (user === undefined) return <div className="auth"><Spinner text="Memeriksa sesi…" /></div>;
  if (!user) return <AuthScreen store={store} onAuthed={setUser} onChangeServer={changeServer} />;
  return <Workspace key={user.id} store={store} user={user} onLogout={logout} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<ToastHost><App /></ToastHost>);
