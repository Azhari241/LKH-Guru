/*
 * Store — lapisan data.
 *  - "supabase": data permanen di Supabase/PostgreSQL, login email + kata sandi, dilindungi RLS.
 *  - "local"   : mode uji di perangkat ini saja (untuk mencoba tanpa server). Ditandai jelas di UI.
 */
(function () {
  const CFG_KEY = 'jhg.supabase.config';
  const MODE_KEY = 'jhg.mode';
  const LOCAL_KEY = 'jhg.local.db';
  const U = window.U;

  const getConfig = () => {
    if (window.JHG_CONFIG && window.JHG_CONFIG.url && window.JHG_CONFIG.anonKey) return { ...window.JHG_CONFIG, fixed: true };
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) { return null; }
  };
  const setConfig = (c) => { if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c)); else localStorage.removeItem(CFG_KEY); };

  /** Ambil teks dari error apa pun (Error, PostgrestError, AuthError, objek polos) — tidak pernah "[object Object]". */
  const rawText = (e) => {
    if (e == null) return 'Kesalahan tidak diketahui.';
    if (typeof e === 'string') return e;
    const parts = [e.message, e.error_description, e.msg, e.details, e.hint].filter((x) => typeof x === 'string' && x.trim());
    if (parts.length) return parts.join(' — ');
    try { const j = JSON.stringify(e); return j && j !== '{}' ? j : 'Kesalahan tidak diketahui.'; } catch (x) { return 'Kesalahan tidak diketahui.'; }
  };

  /**
   * Klasifikasi error Supabase -> { kind, code, text }.
   * kind: network | key | dataapi | schema | table | grant | rls | auth | login | other
   */
  const classify = (e, table) => {
    if (e && e.kind && e.text) return e;
    const code = (e && (e.code || e.error_code)) ? String(e.code || e.error_code) : '';
    const status = e && e.status;
    const m = rawText(e);
    const tbl = table ? ` tabel ${table}` : '';
    const out = (kind, text) => ({ kind, code, text: code && !text.includes(code) ? `${text} (kode: ${code})` : text });
    if (/Invalid login credentials/i.test(m)) return out('login', 'Email atau kata sandi salah.');
    if (/Email not confirmed/i.test(m)) return out('login', 'Email belum dikonfirmasi. Buka tautan konfirmasi di kotak masuk email Anda.');
    if (/User already registered/i.test(m)) return out('login', 'Email sudah terdaftar. Silakan masuk.');
    if (/Password should be at least/i.test(m)) return out('login', 'Kata sandi minimal 6 karakter.');
    if (/Signups not allowed/i.test(m)) return out('auth', 'Pendaftaran akun baru dinonaktifkan di Supabase (Authentication → Sign In / Providers).');
    if (/Sesi berakhir/i.test(m)) return { kind: 'auth', code: '', text: 'Anda belum masuk atau sesi berakhir. Silakan masuk kembali.' };
    if (/row-level security/i.test(m)) return out('rls', `Kebijakan RLS menolak permintaan pada${tbl || ' tabel'}. Data hanya boleh ditulis atas nama akun yang sedang masuk (auth.uid() = user_id).`);
    if (code === '42501' || /permission denied for (table|schema|relation)/i.test(m)) return out('grant', `Hak akses${tbl || ' tabel'} ditolak untuk role database. Berikan GRANT ke role "authenticated" dengan menjalankan supabase/fix-permissions.sql.`);
    if (code === 'PGRST106' || /schema must be one of|Invalid schema/i.test(m)) return out('schema', 'Skema "public" tidak diekspos di Data API. Aktifkan di Project Settings → Data API → Exposed schemas.');
    if (code === 'PGRST205' || code === '42P01' || /Could not find the table|relation .* does not exist/i.test(m)) return out('table', `Tabel${tbl || ''} belum ada. Jalankan supabase/schema.sql di SQL Editor.`);
    if (code === 'PGRST301' || code === 'PGRST302' || /Invalid API key|No API key|JWSError|JWT/i.test(m) || status === 401) return out('key', 'API key tidak valid untuk proyek ini. Salin ulang anon/publishable key dari Project Settings → API Keys.');
    if (/Failed to fetch|NetworkError|Load failed|ERR_NAME_NOT_RESOLVED/i.test(m)) return out('network', 'Server tidak dapat dijangkau. Periksa koneksi internet dan Project URL.');
    return out('other', m);
  };
  const msg = (e, table) => classify(e, table).text;
  const chk = ({ data, error }, table) => {
    if (error) { const c = classify(error, table); const er = new Error(c.text); er.kind = c.kind; er.code = c.code; er.text = c.text; throw er; }
    return data;
  };

  const normUrl = (u) => String(u || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1.*$/i, '');
  const jwtRole = (k) => { try { const p = k.split('.')[1]; return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).role || null; } catch (e) { return null; } };

  /**
   * Uji koneksi SEBELUM login, bertahap. Tidak membaca data pribadi.
   * Penolakan akses tabel untuk role anon dianggap BENAR (aman), bukan kegagalan.
   */
  async function checkServer(cfg) {
    const steps = [];
    const add = (id, label, status, text) => steps.push({ id, label, status, text });
    const url = normUrl(cfg.url); const key = String(cfg.anonKey || '').trim();

    // 1. Validasi URL & API key
    let fmtOk = true;
    if (!/^https:\/\/[^\s/?#]+$/i.test(url)) { fmtOk = false; add('format', 'URL & API key', 'fail', 'Project URL harus berbentuk https://<id-proyek>.supabase.co.'); }
    else if (/^sb_secret_/i.test(key) || jwtRole(key) === 'service_role') { fmtOk = false; add('format', 'URL & API key', 'fail', 'Ini secret/service_role key. Jangan dipakai di browser. Gunakan anon atau publishable key.'); }
    else if (!/^sb_publishable_/i.test(key) && !(key.split('.').length === 3 && jwtRole(key))) { fmtOk = false; add('format', 'URL & API key', 'fail', 'Format API key tidak dikenali. Gunakan "anon public" (eyJ…) atau "publishable" (sb_publishable_…).'); }
    else add('format', 'URL & API key', 'ok', `Format benar (${/^sb_publishable_/i.test(key) ? 'publishable key' : 'anon key'}).`);
    if (!fmtOk) return { ok: false, url, steps };

    const headers = { apikey: key };
    if (!/^sb_/i.test(key)) headers.Authorization = 'Bearer ' + key;

    // 2. Konektivitas + validitas key (endpoint Auth publik)
    let settings = null;
    try {
      const r = await fetch(`${url}/auth/v1/settings`, { headers });
      if (r.status === 401 || r.status === 403) { add('server', 'Server Supabase', 'fail', 'Server dapat dijangkau, tetapi API key tidak valid untuk proyek ini.'); return { ok: false, url, steps }; }
      if (!r.ok) { add('server', 'Server Supabase', 'fail', `Server merespons status ${r.status}. Periksa Project URL atau status proyek (mungkin dijeda).`); return { ok: false, url, steps }; }
      settings = await r.json().catch(() => null);
      add('server', 'Server Supabase', 'ok', 'Server dapat dijangkau dan API key diterima.');
    } catch (e) { add('server', 'Server Supabase', 'fail', 'Server tidak dapat dijangkau. Periksa koneksi internet dan Project URL.'); return { ok: false, url, steps }; }

    // 3. Autentikasi (email + kata sandi)
    if (settings && settings.external && settings.external.email === false) add('auth', 'Autentikasi', 'fail', 'Login email dinonaktifkan. Aktifkan provider Email di Authentication → Sign In / Providers.');
    else if (settings && settings.disable_signup) add('auth', 'Autentikasi', 'warn', 'Login email aktif, tetapi pendaftaran akun baru dimatikan. Buat akun dari dashboard Supabase.');
    else add('auth', 'Autentikasi', 'ok', settings && settings.mailer_autoconfirm ? 'Login email aktif. Akun baru langsung aktif.' : 'Login email aktif. Akun baru perlu konfirmasi lewat email.');

    // 4. Data API (tanpa login: hanya memastikan endpoint & tabel ada)
    try {
      const r = await fetch(`${url}/rest/v1/jhg_entries?select=id&limit=1`, { headers });
      let body = null; try { body = await r.json(); } catch (e) { body = null; }
      const code = body && body.code ? String(body.code) : '';
      if (r.ok) add('dataapi', 'Data API', 'ok', 'Data API aktif. Data pribadi tetap tersembunyi oleh RLS sampai Anda masuk.');
      else if (code === '42501') add('dataapi', 'Data API', 'ok', 'Data API aktif. Role anon tidak punya akses tabel (benar dan aman). Akses tabel akan diperiksa setelah Anda masuk.');
      else if (code === 'PGRST205' || code === '42P01') add('dataapi', 'Data API', 'fail', 'Data API aktif, tetapi tabel jhg_* belum ada. Jalankan supabase/schema.sql di SQL Editor.');
      else if (code === 'PGRST106') add('dataapi', 'Data API', 'fail', 'Skema "public" tidak diekspos. Aktifkan di Project Settings → Data API → Exposed schemas.');
      else if (r.status === 404 && !code) add('dataapi', 'Data API', 'fail', 'Data API tidak aktif. Aktifkan di Project Settings → Data API.');
      else if (r.status === 401 && (code === 'PGRST301' || /api key/i.test(rawText(body)))) add('dataapi', 'Data API', 'fail', 'API key ditolak oleh Data API.');
      else add('dataapi', 'Data API', 'warn', `Respons tidak terduga: ${classify(body || { message: 'status ' + r.status }).text}`);
    } catch (e) { add('dataapi', 'Data API', 'fail', 'Data API tidak dapat dijangkau.'); }

    steps.push({ id: 'tables', label: 'Akses tabel', status: 'wait', text: 'Diperiksa otomatis setelah Anda masuk (memerlukan identitas pengguna).' });
    return { ok: !steps.some((s) => s.status === 'fail'), url, steps };
  }

  // ---------------- Supabase ----------------
  function supabaseStore(cfg) {
    if (!window.supabase || !window.supabase.createClient) throw new Error('Pustaka Supabase gagal dimuat. Periksa koneksi internet.');
    const ck = normUrl(cfg.url) + '|' + cfg.anonKey.trim();
    window.__jhgClients = window.__jhgClients || {};
    const sb = window.__jhgClients[ck] || (window.__jhgClients[ck] = window.supabase.createClient(normUrl(cfg.url), cfg.anonKey.trim(), { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'jhg-auth' } }));
    let user = null;
    const uidOrThrow = () => { if (!user) throw new Error('Sesi berakhir. Silakan masuk kembali.'); return user.id; };
    const cols = 'id,date,description,unit,quantity,evidence,position,created_at,updated_at';
    return {
      kind: 'supabase',
      label: 'Supabase',
      async session() { const { data } = await sb.auth.getSession(); user = data.session ? data.session.user : null; return user ? { email: user.email, id: user.id } : null; },
      onAuth(cb) { const { data } = sb.auth.onAuthStateChange((_e, s) => { user = s ? s.user : null; cb(user ? { email: user.email, id: user.id } : null); }); return () => data.subscription.unsubscribe(); },
      async signIn(email, password) { const d = chk(await sb.auth.signInWithPassword({ email, password })); user = d.user; return { email: user.email, id: user.id }; },
      async signUp(email, password) {
        const d = chk(await sb.auth.signUp({ email, password }));
        if (!d.session) return { needsConfirm: true };
        user = d.user; return { email: user.email, id: user.id };
      },
      async resetPassword(email) { chk(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] })); },
      async signOut() { await sb.auth.signOut(); user = null; },
      /**
       * Pemeriksaan akses tabel SETELAH login (role authenticated). Hanya membaca kolom user_id.
       * Juga memastikan RLS bekerja: semua baris yang terlihat harus milik pengguna ini.
       */
      async checkTables() {
        if (!user) return [{ table: '-', status: 'fail', kind: 'auth', text: 'Pengguna belum masuk.' }];
        const out = [];
        for (const t of ['jhg_profiles', 'jhg_entries', 'jhg_templates']) {
          const { data, error } = await sb.from(t).select('user_id').limit(200);
          if (error) { const c = classify(error, t); out.push({ table: t, status: 'fail', kind: c.kind, text: c.text }); continue; }
          const foreign = (data || []).filter((r) => r.user_id !== user.id).length;
          if (foreign) out.push({ table: t, status: 'fail', kind: 'rls', text: `RLS tidak membatasi data: ${foreign} baris milik akun lain terlihat. Periksa kebijakan RLS tabel ini.` });
          else out.push({ table: t, status: 'ok', kind: 'ok', text: `Dapat diakses. Hanya data milik akun ini yang terlihat (${(data || []).length} baris).` });
        }
        return out;
      },
      async getProfile() { const d = chk(await sb.from('jhg_profiles').select('data').eq('user_id', uidOrThrow()).maybeSingle(), 'jhg_profiles'); return d ? d.data : null; },
      async saveProfile(data) { chk(await sb.from('jhg_profiles').upsert({ user_id: uidOrThrow(), data, updated_at: new Date().toISOString() }), 'jhg_profiles'); return data; },
      async listEntries(from, to) {
        uidOrThrow();
        let q = sb.from('jhg_entries').select(cols).order('date').order('position').order('created_at');
        if (from) q = q.gte('date', from); if (to) q = q.lte('date', to);
        const out = []; let start = 0;
        for (;;) { const d = chk(await q.range(start, start + 999), 'jhg_entries'); out.push(...d); if (d.length < 1000) break; start += 1000; }
        return out;
      },
      async addEntry(e) { const row = { user_id: uidOrThrow(), date: e.date, description: e.description, unit: e.unit || '', quantity: String(e.quantity ?? ''), evidence: e.evidence || '', position: e.position || 0 }; return chk(await sb.from('jhg_entries').insert(row).select(cols).single(), 'jhg_entries'); },
      async updateEntry(id, e) { const row = { date: e.date, description: e.description, unit: e.unit || '', quantity: String(e.quantity ?? ''), evidence: e.evidence || '', position: e.position || 0, updated_at: new Date().toISOString() }; return chk(await sb.from('jhg_entries').update(row).eq('id', id).select(cols).single(), 'jhg_entries'); },
      async deleteEntry(id) { chk(await sb.from('jhg_entries').delete().eq('id', id), 'jhg_entries'); },
      async bulkInsert(list) {
        const uid = uidOrThrow(); let n = 0;
        for (let i = 0; i < list.length; i += 200) {
          const rows = list.slice(i, i + 200).map((e) => ({ user_id: uid, date: e.date, description: e.description, unit: e.unit || '', quantity: String(e.quantity ?? ''), evidence: e.evidence || '', position: e.position || 0 }));
          chk(await sb.from('jhg_entries').insert(rows), 'jhg_entries'); n += rows.length;
        }
        return n;
      },
      async deleteAllEntries() { chk(await sb.from('jhg_entries').delete().eq('user_id', uidOrThrow()), 'jhg_entries'); },
      async getTemplate() { const d = chk(await sb.from('jhg_templates').select('file_name,docx_base64,updated_at').eq('user_id', uidOrThrow()).maybeSingle(), 'jhg_templates'); return d ? { name: d.file_name, buf: U.b64ToBuf(d.docx_base64), updated_at: d.updated_at } : null; },
      async saveTemplate(name, buf) { chk(await sb.from('jhg_templates').upsert({ user_id: uidOrThrow(), file_name: name, docx_base64: U.bufToB64(buf), updated_at: new Date().toISOString() }), 'jhg_templates'); },
      async deleteTemplate() { chk(await sb.from('jhg_templates').delete().eq('user_id', uidOrThrow()), 'jhg_templates'); },
    };
  }

  // ---------------- Lokal (mode uji) ----------------
  function localStore() {
    const read = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch (e) { return {}; } };
    const write = (db) => {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(db)); }
      catch (e) { throw new Error('Penyimpanan perangkat penuh. Gunakan mode Supabase untuk data besar.'); }
    };
    const db = () => { const d = read(); d.entries = d.entries || []; return d; };
    const now = () => new Date().toISOString();
    return {
      kind: 'local',
      label: 'Mode uji (perangkat ini)',
      async session() { const d = db(); return d.user ? { email: d.user, id: 'local' } : null; },
      onAuth() { return () => {}; },
      async signIn(email) { const d = db(); d.user = email || 'uji@lokal'; write(d); return { email: d.user, id: 'local' }; },
      async signUp(email) { return this.signIn(email); },
      async resetPassword() { throw new Error('Tidak tersedia di mode uji.'); },
      async signOut() { const d = db(); delete d.user; write(d); },
      async checkTables() { return []; },
      async getProfile() { return db().profile || null; },
      async saveProfile(p) { const d = db(); d.profile = p; write(d); return p; },
      async listEntries(from, to) { return U.sortEntries(db().entries.filter((e) => (!from || e.date >= from) && (!to || e.date <= to))); },
      async addEntry(e) { const d = db(); const row = { ...e, quantity: String(e.quantity ?? ''), id: U.uid(), created_at: now(), updated_at: now() }; d.entries.push(row); write(d); return row; },
      async updateEntry(id, e) { const d = db(); const i = d.entries.findIndex((x) => x.id === id); if (i < 0) throw new Error('Kegiatan tidak ditemukan.'); d.entries[i] = { ...d.entries[i], ...e, quantity: String(e.quantity ?? ''), updated_at: now() }; write(d); return d.entries[i]; },
      async deleteEntry(id) { const d = db(); d.entries = d.entries.filter((x) => x.id !== id); write(d); },
      async bulkInsert(list) { const d = db(); list.forEach((e, i) => d.entries.push({ ...e, quantity: String(e.quantity ?? ''), id: U.uid(), created_at: new Date(Date.now() + i).toISOString(), updated_at: now() })); write(d); return list.length; },
      async deleteAllEntries() { const d = db(); d.entries = []; write(d); },
      async getTemplate() { const t = db().template; return t ? { name: t.name, buf: U.b64ToBuf(t.b64), updated_at: t.updated_at } : null; },
      async saveTemplate(name, buf) { const d = db(); d.template = { name, b64: U.bufToB64(buf), updated_at: now() }; write(d); },
      async deleteTemplate() { const d = db(); delete d.template; write(d); },
    };
  }

  function create() {
    const mode = localStorage.getItem(MODE_KEY);
    if (mode === 'local') return localStore();
    const cfg = getConfig();
    if (cfg && cfg.url && cfg.anonKey) return supabaseStore(cfg);
    return null;
  }
  const setMode = (m) => { if (m) localStorage.setItem(MODE_KEY, m); else localStorage.removeItem(MODE_KEY); };

  window.Store = { create, getConfig, setConfig, setMode, supabaseStore, msg, classify, checkServer, normUrl };
})();
