/* Komponen UI bersama */
const { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } = React;

const ICON_PATHS = {
  journal: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11M9 8h6M9 11h4',
  report: 'M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6M10 17h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  file: 'M6 3h8l4 4v14H6V3Zm8 0v4h4M9 12h6M9 16h4',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9V9Zm-5 6V4h11',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4',
  left: 'm15 6-6 6 6 6', right: 'm9 6 6 6-6 6', up: 'm6 15 6-6 6 6', down: 'm6 9 6 6 6-6',
  x: 'M6 6l12 12M18 6 6 18',
  word: 'M6 3h8l4 4v14H6V3Zm8 0v4h4M8.5 11l1.3 6 1.7-4.5 1.7 4.5 1.3-6',
  pdf: 'M6 3h8l4 4v14H6V3Zm8 0v4h4M9 17v-5h1.5a1.5 1.5 0 0 1 0 3H9',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7v-7Z',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 16v4h16v-4',
  download: 'M12 4v12m0 0-5-5m5 5 5-5M4 20h16',
  logout: 'M15 4h4v16h-4M10 16l4-4-4-4M14 12H3',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  check: 'm5 12 5 5 9-10',
  menu: 'M4 7h16M4 12h16M4 17h16',
  cal: 'M4 6h16v14H4V6Zm0 4h16M8 3v4M16 3v4',
};
function Icon({ name, size }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={size ? { width: size, height: size } : null} aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const ToastCtx = createContext(null);
function ToastHost({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, type = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, text, type }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), type === 'err' ? 6500 : 3200);
  }, []);
  const api = useMemo(() => ({ ok: (t) => push(t, 'ok'), err: (t) => push(t, 'err') }), [push]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={'toast ' + (t.type === 'err' ? 'err' : '')} onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
            <span className="dot" /> <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => useContext(ToastCtx);

function Modal({ title, onClose, children, foot, size }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal ' + (size === 'sm' ? 'modal-sm' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Tutup"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

function Confirm({ title, text, okText = 'Hapus', danger = true, onOk, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} size="sm" foot={<>
      <button className="btn" onClick={onClose} disabled={busy}>Batal</button>
      <button className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} disabled={busy} onClick={async () => { setBusy(true); try { await onOk(); onClose(); } finally { setBusy(false); } }}>{busy ? 'Memproses…' : okText}</button>
    </>}>
      <p style={{ margin: 0 }}>{text}</p>
    </Modal>
  );
}

function Field({ label, hint, children, warn }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
      {warn && <span className="warn-text">{warn}</span>}
    </div>
  );
}

function MonthBar({ period, setPeriod }) {
  return (
    <div className="monthbar">
      <button className="btn btn-ghost btn-icon" onClick={() => setPeriod(U.shiftPeriod(period, -1))} aria-label="Bulan sebelumnya"><Icon name="left" /></button>
      <input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} aria-label="Pilih bulan dan tahun" />
      <button className="btn btn-ghost btn-icon" onClick={() => setPeriod(U.shiftPeriod(period, 1))} aria-label="Bulan berikutnya"><Icon name="right" /></button>
    </div>
  );
}

function Spinner({ text }) { return <div className="loading"><span className="spin" /> {text || 'Memuat…'}</div>; }

Object.assign(window, { Icon, ToastHost, useToast, Modal, Confirm, Field, MonthBar, Spinner });
