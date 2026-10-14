# Technical Blueprint & Architecture: Bot PO WhatsApp x Google Sheets Integration

Dokumen ini merupakan spesifikasi arsitektur teknis, desain antarmuka, alur kerja sistem, skema struktur data, dan panduan deployment produksi ke Virtual Private Server (VPS) agar sistem dapat beroperasi 100% secara stabil, aman, dan otomatis.

---

## 1. Arsitektur Aplikasi & Topologi Sistem

### A. Diagram Arsitektur Komponen
```
 [PENGGUNA WHATSAPP]
        │
        ▼ (Chat WA, Foto PO, Dokumen PDF)
┌─────────────────────────────────────────────────────────┐
│       WHATSAPP API GATEWAY (Self-Hosted Live)           │
│             https://openwa.ebite.biz.id                 │
│         (Engine: whatsapp-web.js / Baileys)             │
└───────────────┬─────────────────────────▲───────────────┘
                │                         │
     HTTP POST  │ Webhook                 │ REST API Outbound
  (Event: msg)  │ (JSON Payload)          │ (POST /messages/send-text)
                ▼                         │
┌─────────────────────────────────────────────────────────┐
│                   VPS BOT SERVER                        │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ NGINX REVERSE PROXY (Port 80/443 SSL Let's Encrypt) │ │
│ └─────────────────────────┬───────────────────────────┘ │
│                           │ Proxy Pass http://127.0.0.1:3000
│ ┌─────────────────────────▼───────────────────────────┐ │
│ │ NODE.JS BACKEND ENGINE (Managed by PM2 Process Mgr) │ │
│ │                                                     │ │
│ │  ├── 1. Webhook Router & HMAC Verifier             │ │
│ │  ├── 2. Whitelist Security Guard                    │ │
│ │  ├── 3. Conversation State Machine (Multi-Step)     │ │
│ │  ├── 4. In-Memory Cache + Fuse.js (Fuzzy Match)     │ │
│ │  └── 5. Hybrid Document Parser Engine               │ │
│ └──────────────┬─────────────────────────┬────────────┘ │
└────────────────┼─────────────────────────┼──────────────┘
                 │                         │
                 ▼                         ▼
   ┌───────────────────────────┐ ┌───────────────────────────┐
   │    GOOGLE SHEETS API v4   │ │  GOOGLE GEMINI 1.5 FLASH  │
   │ Spreadsheet ID:           │ │ Vision Multimodal AI      │
   │ 15n9joeQAoic8FvP5V...     │ │ (Gratis 1.500 scan/hari   │
   │                           │ │  via Google AI Studio)    │
   │ • PO 2026 (Transaksi)     │ │                           │
   │ • database Material       │ │ • Ekstraksi Tabel PO Foto │
   │ • database Supplier Mat.  │ │ • Konversi ke JSON Format │
   └───────────────────────────┘ └───────────────────────────┘
```

### B. Komponen & Peran
1. **OpenWA Gateway (`https://openwa.ebite.biz.id`):**
   - Menjaga koneksi sesi WhatsApp tetap aktif (`Session ID: 997f4002-105`).
   - Meneruskan setiap pesan masuk ke endpoint Webhook VPS melalui HTTP `POST /webhook`.
   - Menerima instruksi pengiriman pesan teks melalui endpoint REST API `/api/sessions/{sessionId}/messages/send-text`.
2. **Nginx Reverse Proxy & SSL Certbot (Di VPS):**
   - Menerima koneksi HTTPS aman dari internet pada port `443` menggunakan sertifikat SSL Let's Encrypt.
   - Meneruskan *traffic* lokal ke aplikasi Node.js di `http://127.0.0.1:3000`.
3. **Bot Engine Node.js (Express):**
   - **`server.js`**: Web server penerima webhook dan pengecek kesehatan (`/health`).
   - **`conversationManager.js`**: Mesin pengelola sesi percakapan interaktif per kontak WA.
   - **`cacheService.js`**: Menyimpan 1.506 master material dan master supplier di RAM untuk respon instan (<5ms).
   - **`sheetsService.js`**: Mengeksekusi penambahan baris (append multi-item), pencarian, update kolom tertentu, dan pembatalan (*soft delete*).
   - **`pdfParserService.js`**: Ekstraktor teks digital untuk dokumen PO berbentuk file PDF.
   - **`geminiVisionService.js`**: AI vision untuk membaca foto atau pindaian dokumen PO fisik.

---

## 2. Struktur Data Lengkap

### A. Skema Kolom Tab Transaksi: `PO 2026` (23 Kolom, A - W)
Setiap baris di tab ini mewakili 1 item pesanan material dalam suatu PO:

| Kolom | Index (0-based) | Nama Kolom Header | Tipe Data | Deskripsi & Validasi |
| :---: | :---: | :--- | :---: | :--- |
| **A** | 0 | `NO.` | Integer | Nomor urut baris (Auto-increment berdasarkan baris terakhir). |
| **B** | 1 | `STATUS` | String | Status PO: `Open`, `Close`, `Pending`, `Cancelled`. |
| **C** | 2 | `DATE` | Date (DD/MM/YYYY) | Tanggal penerbitan PO resmi. |
| **D** | 3 | `NO. PO` | String | Nomor resmi dokumen PO (Wajib diisi di setiap baris item). |
| **E** | 4 | `SUPPLIER` | String | Nama vendor penyedia barang (Wajib diisi di setiap baris). |
| **F** | 5 | `QUOT. / Vendor Reff` | String | Nomor referensi penawaran harga vendor (Opsional). |
| **G** | 6 | `Kode Item Material` | String | Primary Key Material (Format: `RMxxxxx`, `OTxxxxx`, `FGxxxxx`, `TOxxxxx`, `STxxxxx`). |
| **H** | 7 | `Nama Material` | String | Deskripsi nama & spesifikasi teknis barang (Auto-fill dari master). |
| **I** | 8 | `Quantity` | Numeric | Jumlah kuantitas barang yang dipesan. |
| **J** | 9 | `TTD P Endik / P Adhis`| String | Status verifikasi pimpinan. |
| **K** | 10 | `Em` | String | Status kirim email ke vendor (`Sent`/`Done`). |
| **L** | 11 | `DO` | String | Nomor Surat Jalan / Delivery Order gudang. |
| **M** | 12 | `Fkt/Inv` | String | Nomor Faktur Pajak / Invoice tagihan vendor. |
| **N** | 13 | `Price Unit` | Currency/Num | Harga satuan barang (Angka murni tanpa format simbol). |
| **O** | 14 | `Discount` | Numeric | Diskon desimal/persen (Contoh: `0.1` untuk 10%, default: 0). |
| **P** | 15 | `PPN` | Currency/Num | Nilai PPN (Nominal, default: 0). |
| **Q** | 16 | `TOTAL` | Formula | Rumus: `=((I{row}*N{row})*(1-O{row}))+P{row}`. |
| **R** | 17 | `No. GRPO` | String | Nomor Goods Receipt PO di gudang. |
| **S** | 18 | `LAST DATE OF GRPO JOB DONE` | Date | Tanggal penyelesaian penerimaan barang gudang. |
| **T** | 19 | `TANGGAL BAYAR` | Date | Tanggal realisasi pembayaran dari divisi keuangan. |
| **U** | 20 | `TANGGAL INVOICE` | Date | Tanggal cetak invoice vendor. |
| **V** | 21 | `NO. INVOICE` | String | Nomor invoice resmi vendor. |
| **W** | 22 | `KET` | String | Catatan operasional bebas atau alasan pembatalan PO. |

### B. Master Lookup 1: `database Material`
- **Total Data:** 1.506 baris unik.
- **Kolom:**
  - `A`: No.
  - `B`: Kode Item Material (Key unik, e.g. `RM00088`, `OT00355`).
  - `C`: Nama Material (Spesifikasi barang lengkap).
- **Penggunaan:** Validasi kode barang saat input PO dan auto-fill deskripsi barang.

### C. Master Lookup 2: `database Supplier Material`
- **Kolom:**
  - `A`: No.
  - `B`: Kode Item Material
  - `C`: Nama Material
  - `D`: Supplier Utama (Sering Diorder)
  - `E`: Total Frekuensi PO (Akumulasi 2017-2026)
  - `F`: Total Qty Diorder
- **Penggunaan:** Rekomendasi vendor otomatis saat user mencari barang.

### D. Struktur State Session Percakapan (In-Memory)
```javascript
// userSessions.get(chatId)
{
  state: 'INPUT_PO_ITEMS', // MAIN_MENU | WAIT_SEARCH_* | INPUT_PO_* | CONFIRM_OCR_PO | UPDATE_PO_*
  data: {
    noPo: 'PO-2026-001',
    supplier: 'PT Buana Logam Perkasa',
    date: '14/10/2026',
    items: [
      { kode: 'RM00355', nama: 'Hex Nipples 1/2', qty: 20, harga: 25000, diskon: 0, ppn: 0 }
    ]
  },
  lastActive: 1776150000000 // Timestamp (Expired setelah 15 menit inaktif)
}
```

---

## 3. Alur Kerja & Flow Percakapan (State Machine)

### Flow 1: Menu Utama & Navigasi
```
[User kirim 'start' / 'menu']
            │
            ▼
┌──────────────────────────────────────┐
│       Tampilkan Pesan Menu:          │
│ 1. Input PO Baru (Multi-Item)        │
│ 2. Cari Data (Supplier/Barang/Harga) │
│ 3. Update Status (GRPO/Bayar/Inv)    │
│ 4. Hapus / Batalkan PO               │
└──────────────────────────────────────┘
            │
    Pilih Angka (1 - 4)
```

---

### Flow 2: Input PO Multi-Item (Metode Keranjang)
```
[User pilih '1']
       │
       ▼
[Bot]: Minta Nomor PO & Nama Supplier
       Contoh: "PO-2026-020, PT Buana Logam Perkasa"
       │
       ▼
[User]: Memasukkan header PO
       │
       ▼
[Bot]: Membuka keranjang barang (Langkah 2/2)
       │
       ▼
[User]: Mengirim daftar barang (Bisa 1 baris atau multiline sekaligus):
       "RM00355 20 25000"
       "RM00356 10 40000"
       │
       ▼
[Bot Engine]:
  ├── 1. Validasi Kode ke Cache In-Memory
  ├── 2. Auto-ambil Nama Material resmi
  ├── 3. Hitung subtotal & total belanja
  └── 4. Tampilkan Nota Rangkuman Keranjang
       │
       ▼
[User Kirim]:
  ├── Baris lagi -> Tambah barang ke keranjang
  ├── 'BATAL'    -> Hapus keranjang
  └── 'SIMPAN'   -> Commit data ke Spreadsheet
                         │
                         ▼
             [Batch Append ke PO 2026]
                         │
                         ▼
             [Bot]: "✅ Berhasil Disimpan!"
```

---

### Flow 3: Pencarian Data (Supplier, Material, Riwayat PO)
- **Cari Supplier:** User ketik nama/kode barang -> Bot mencari di master supplier -> Menampilkan nama vendor utama, jumlah riwayat order, dan total unit yang pernah dibeli.
- **Cari Material:** User ketik kata kunci -> Fuzzy search (Fuse.js) menampilkan daftar kode dan spesifikasi material yang cocok.
- **Cek Status PO:** User ketik Nomor PO -> Bot menampilkan status transaksi, vendor, daftar barang, status penerimaan barang (GRPO), dan status pelunasan finance.

---

### Flow 4: Update Transaksi PO
```
[User pilih '3' atau '!updatepo']
       │
       ▼
[User]: Masukkan Nomor PO (e.g. PO-2026-001)
       │
       ▼
[Bot]: Tampilkan Pilihan Sub-Update:
       1. Input No. GRPO & Selesai Penerimaan Gudang
       2. Input Tanggal Bayar (Finance)
       3. Input No. Invoice Vendor
       4. Ubah Status PO (Close/Pending)
       │
       ▼
[User]: Memilih opsi dan memasukkan nilai update
       │
       ▼
[Bot Engine]: Eksekusi batchUpdate ke seluruh baris item PO terkait pada sheet 'PO 2026'.
```

---

### Flow 5: Hybrid OCR & Ekstraksi Dokumen
```
[User kirim Foto / PDF Dokumen PO]
                 │
                 ▼
     [Deteksi Format File]
      ├── Jika PDF  ──► Local pdf-parse (Ekstrak teks digital langsung)
      └── Jika Foto ──► Google Gemini 1.5 Flash Vision (Multimodal AI)
                 │
                 ▼
     [Hasil JSON Terstruktur]
     (No PO, Supplier, Tgl, Items)
                 │
                 ▼
     [Fuzzy Matching Nama Barang ke database Material]
     (Lengkapi kode barang otomatis)
                 │
                 ▼
     [Kirim Draf Nota ke WhatsApp Pengguna]
     "Ketik YA untuk Simpan, atau BATAL"
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
   User: 'YA'         User: 'BATAL'
       │                   │
[Append ke PO 2026]    [Hapus Draf]
```

---

## 4. Panduan Step-by-Step Menjalankan Bot 100% di VPS

Ikuti langkah-langkah di bawah ini untuk men-deploy bot ke server Linux Ubuntu/Debian Anda hingga berjalan online 24/7.

### Langkah 1: Persiapan Server VPS
Login ke VPS Anda via SSH:
```bash
ssh root@ip-vps-anda
```
Perbarui package repository:
```bash
apt update && apt upgrade -y
apt install -y git curl ufw build-essential
```

---

### Langkah 2: Install Node.js (v20 atau v22 LTS) & PM2
Pasang Node.js menggunakan NodeSource:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Verifikasi instalasi
node -v # Harus v22.x.x
npm -v

# Install PM2 Process Manager secara global
npm install -g pm2
```

---

### Langkah 3: Clone Project dari GitHub
Masuk ke direktori web atau home, lalu clone repository:
```bash
cd /var/www
git clone https://github.com/reandyferdinanto/bot-po-whatsapp.git
cd bot-po-whatsapp
```
Install seluruh dependensi produksi:
```bash
npm install --production
```

---

### Langkah 4: Upload File Kredensial Google
File `client_secret.json` dan `token.json` **tidak ada di GitHub** demi keamanan. Anda perlu mengunggahnya ke folder `credentials/` di VPS:

1. Buat folder `credentials` di VPS:
   ```bash
   mkdir -p credentials
   ```
2. Dari laptop lokal Anda (buka PowerShell baru), salin kedua file tersebut ke VPS menggunakan `scp`:
   ```powershell
   scp "C:\reandy\bot-with-openwa\bot-po-whatsapp\credentials\client_secret.json" root@ip-vps-anda:/var/www/bot-po-whatsapp/credentials/client_secret.json
   scp "C:\reandy\bot-with-openwa\bot-po-whatsapp\credentials\token.json" root@ip-vps-anda:/var/www/bot-po-whatsapp/credentials/token.json
   ```
   *(Catatan: Jika Anda belum melakukan otorisasi di lokal untuk mendapatkan `token.json`, Anda bisa menjalankan `npm run auth` langsung di VPS).*

---

### Langkah 5: Konfigurasi File Environment (`.env`)
Di dalam folder project VPS (`/var/www/bot-po-whatsapp`), buat file `.env`:
```bash
nano .env
```
Isi dengan konfigurasi berikut:
```env
PORT=3000

# OpenWA Gateway
OPENWA_BASE_URL=https://openwa.ebite.biz.id
OPENWA_API_KEY=owa_k1_masukkan_api_key_anda_dari_dashboard
OPENWA_SESSION_ID=997f4002-105
OPENWA_WEBHOOK_SECRET=

# Google Sheets
GOOGLE_SPREADSHEET_ID=15n9joeQAoic8FvP5V_-bChqjHKjFeMG0WGHzQ4xHGPk
GOOGLE_CREDENTIALS_PATH=./credentials/client_secret.json
GOOGLE_TOKEN_PATH=./credentials/token.json

# Gemini AI Vision OCR (Dapatkan gratis di https://aistudio.google.com)
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxx

# Security: Nomor HP yang diizinkan (kosongkan jika semua nomor diizinkan)
ALLOWED_NUMBERS=
```
Simpan file (`Ctrl + O`, lalu `Enter`, lalu `Ctrl + X`).

---

### Langkah 6: Setup Nginx & SSL HTTPS (Certbot)
Agar webhook OpenWA dapat mengirim pesan secara aman melalui protokol HTTPS publik:

1. Install Nginx dan Certbot:
   ```bash
   apt install -y nginx certbot python3-certbot-nginx
   ```
2. Buat file konfigurasi Nginx untuk domain bot Anda (contoh domain: `botpo.domainanda.com`):
   ```bash
   nano /etc/nginx/sites-available/bot-po
   ```
   Isi konfigurasi reverse proxy:
   ```nginx
   server {
       listen 80;
       server_name botpo.domainanda.com;

       client_max_body_size 50M;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
3. Aktifkan konfigurasi dan restart Nginx:
   ```bash
   ln -s /etc/nginx/sites-available/bot-po /etc/nginx/sites-enabled/
   nginx -t
   systemctl restart nginx
   ```
4. Pasang Sertifikat SSL HTTPS Gratis:
   ```bash
   certbot --nginx -d botpo.domainanda.com
   ```
   *(Certbot akan otomatis memperbarui konfigurasi Nginx ke port 443 HTTPS).*

---

### Langkah 7: Jalankan Aplikasi Menggunakan PM2
Agar aplikasi berjalan di background dan otomatis hidup kembali saat server reboot:
```bash
cd /var/www/bot-po-whatsapp

# Menjalankan bot dengan PM2
pm2 start src/server.js --name "bot-po"

# Simpan proses agar otomatis jalan saat boot
pm2 save
pm2 startup
```
Periksa status dan log aplikasi:
```bash
pm2 status
pm2 logs bot-po
```
Log akan menampilkan:
```text
🚀 Memulai Bot PO WhatsApp x Google Sheets Server
📡 OpenWA Host    : https://openwa.ebite.biz.id
📱 Session ID     : 997f4002-105
📊 Spreadsheet ID : 15n9joeQAoic8FvP5V_-bChqjHKjFeMG0WGHzQ4xHGPk
🔑 Token Google OAuth2 terdeteksi.
🔄 Memulai sinkronisasi Master Data dari Google Sheets...
✅ Master Data tersinkronisasi: 1506 Material, 1506 Supplier Master.
✅ Server bot berjalan di: http://localhost:3000
🔗 Webhook endpoint : http://localhost:3000/webhook
```

---

### Langkah 8: Daftarkan Webhook di Dashboard OpenWA
1. Buka browser dan login ke dashboard Anda: **`https://openwa.ebite.biz.id`**.
2. Masuk ke menu **Webhooks** (atau pilih Sesi `997f4002-105` -> Webhooks).
3. Klik **Create Webhook**:
   - **URL**: `https://botpo.domainanda.com/webhook`
   - **Events**: Centang `message.received`.
   - **Retry Count**: `3`
4. Klik **Save**.
5. Klik tombol **Test Webhook** untuk memastikan koneksi berhasil (`200 OK`).

---

### Langkah 9: Verifikasi & Uji Coba End-to-End
Buka aplikasi WhatsApp di smartphone Anda, lalu kirim pesan ke nomor yang tertaut pada sesi OpenWA:
1. Kirim pesan: **`start`** atau **`menu`** -> Bot akan membalas dengan menu pilihan 1-4.
2. Kirim pesan: **`!cari RM00355`** -> Bot membalas rekomendasi supplier dan frekuensi riwayat order.
3. Kirim foto / file PDF dokumen PO -> Bot membalas ringkasan draf PO dan menunggu konfirmasi `YA` sebelum disimpan ke sheet `PO 2026`.

---

## 5. Maintenance & Pemeliharaan Rutin

1. **Melihat Log Real-time:**
   ```bash
   pm2 logs bot-po
   ```
2. **Restart Bot Jika Ada Perubahan Kode:**
   ```bash
   pm2 restart bot-po
   ```
3. **Memperbarui Kode dari GitHub:**
   ```bash
   cd /var/www/bot-po-whatsapp
   git pull origin main
   pm2 restart bot-po
   ```
4. **Backup Token:**
   Simpan salinan cadangan file `credentials/token.json` di tempat aman agar tidak perlu mengulang proses consent login browser jika server berpindah.
