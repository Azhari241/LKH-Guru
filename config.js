/*
 * Konfigurasi Supabase (opsional).
 * Isi dua nilai di bawah sebelum website dipublikasikan agar halaman pengaturan
 * server tidak muncul lagi. Nilai "anon key" aman diletakkan di sini karena
 * data dilindungi Row Level Security (lihat supabase/schema.sql).
 * Bila dibiarkan kosong, aplikasi akan meminta URL & anon key saat pertama dibuka.
 */
window.JHG_CONFIG = {
  url: '',
  anonKey: '',
};
