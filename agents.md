# Technical Blueprint & Architecture: Bot PO WhatsApp x Google Sheets Integration

Dokumen ini merupakan spesifikasi arsitektur teknis, desain antarmuka, alur kerja sistem, dan panduan implementasi terpadu untuk integrasi bot WhatsApp (**OpenWA Gateway**) dengan **Google Sheets API v4** serta modul **Hybrid OCR / Document Extraction**.

---

## 1. Identitas Sistem & Komponen Arsitektur

### A. Komponen Utama
1. **WhatsApp API Gateway Server:**
   - **Host Live:** `https://openwa.ebite.biz.id` (Source: [rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA)).
   - **Peran:** Mengelola sesi koneksi WhatsApp, menerima pesan masuk, dan mengekspos endpoint REST API.
   - **Komunikasi:**
     - **Inbound:** Webhook HTTP `POST /webhook` (Event: `message.received`).
     - **Outbound:** REST API `POST /api/sessions/{sessionId}/messages/send-text`.
2. **Bot Backend Engine (Aplikasi Ini):**
   - Node.js + Express (Service pengolah webhook, parser percakapan, OCR, dan CRUD).
3. **Google Sheets API v4:**
   - **Spreadsheet ID:** `15n9joeQAoic8FvP5V_-bChqjHKjFeMG0WGHzQ4xHGPk`
   - **Kredensial:** OAuth 2.0 Web Client (`client_secret_1074882063533-384atdnvkdg3sls0iltiquvt32lihbrm.apps.googleusercontent.com.json`) dengan token persisten `token.json`.
4. **Hybrid Document Parser (OCR & PDF):**
   - **PDF:** Ekstraksi lokal langsung menggunakan `pdf-parse` (Cepat, 100% akurat, tanpa biaya).
   - **Foto/Gambar:** Ekstraksi terstruktur menggunakan **Google Gemini 1.5 Flash Vision** (Free tier 1.500 request/hari via Google AI Studio).

---

## 2. Struktur Data Spreadsheet & Aturan Bisnis

### A. Skema Kolom Tab Transaksi: `PO 2026` (23 Kolom, A - W)
Setiap baris mewakili 1 item transaksi PO:
- **A (0):** `NO.` - Nomor urut baris (Integer auto-increment).
- **B (1):** `STATUS` - Status transaksi (`Open`, `Close`, `Pending`, `Cancelled`).
- **C (2):** `DATE` - Tanggal PO (Format: `DD/MM/YYYY`).
- **D (3):** `NO. PO` - Nomor dokumen resmi PO (Contoh: `PO-2026-001`).
- **E (4):** `SUPPLIER` - Nama vendor/supplier penyedia barang.
- **F (5):** `QUOT. / Vendor Reff` - Nomor penawaran harga vendor (Opsional).
- **G (6):** `Kode Item Material` - Kode identitas material (Contoh: `RM00355`, validasi ke master).
- **H (7):** `Nama Material` - Deskripsi nama barang (Auto-fill dari master).
- **I (8):** `Quantity` - Jumlah unit yang dipesan.
- **J (9):** `TTD P Endik / P Adhis` - Status verifikasi/tanda tangan pimpinan.
- **K (10):** `Em` - Status kirim email ke supplier (`Sent`/`Done`).
- **L (11):** `DO` - Nomor atau status Surat Jalan / Delivery Order.
- **M (12):** `Fkt/Inv` - Nomor Faktur Pajak / Invoice vendor.
- **N (13):** `Price Unit` - Harga satuan (Angka murni).
- **O (14):** `Discount` - Diskon (Persen/Desimal, default: 0).
- **P (15):** `PPN` - Nilai PPN (Nominal/Formula, default: 0).
- **Q (16):** `TOTAL` - Formula: `=(Quantity * Price Unit) * (1 - Discount) + PPN`.
- **R (17):** `No. GRPO` - Nomor Goods Receipt PO di gudang.
- **S (18):** `LAST DATE OF GRPO JOB DONE` - Tanggal selesai penerimaan barang di gudang.
- **T (19):** `TANGGAL BAYAR` - Tanggal pembayaran finance.
- **U (20):** `TANGGAL INVOICE` - Tanggal cetak invoice vendor.
- **V (21):** `NO. INVOICE` - Nomor invoice resmi vendor.
- **W (22):** `KET` - Keterangan memo operasional.

### B. Master Lookup Sheet (In-Memory Cache)
1. **`database Material`:**
   - Kolom: `No.`, `Kode Item Material`, `Nama Material` (1.506 baris).
   - Digunakan untuk auto-complete nama material dari kode barang.
2. **`database Supplier Material`:**
   - Kolom: `No.`, `Kode Item Material`, `Nama Material`, `Supplier Utama`, `Total Frekuensi PO`, `Total Qty Diorder`.
   - Digunakan untuk rekomendasi vendor saat pencarian material.

### C. Aturan Multi-Item & Delete
1. **Multi-Item PO:** Pada setiap baris item baru, kolom `NO. PO`, `DATE`, dan `SUPPLIER` **wajib selalu diisi** (tidak boleh dikosongkan) agar filter/sort di Google Sheet tetap valid.
2. **Soft Delete:** Perintah hapus tidak menghapus baris dimensi sheet (`deleteDimension`), melainkan mengubah Kolom B (`STATUS`) menjadi `Cancelled` atau `Deleted`.

---

## 3. Desain Antarmuka Pengguna WhatsApp (UX & Interaksi)

Menghindari penggunaan tombol lama WhatsApp (*Quick Reply Buttons*) yang telah dimatikan Meta untuk gateway web non-resmi, bot menggunakan **Interactive Text Menu & Step-by-Step Guided Wizard**.

### A. Menu Utama (`start` atau `menu`)
```text
🤖 *SISTEM REKAP PO 2026*
Halo! Silakan pilih menu di bawah ini:

1️⃣ *1* - Input PO Baru (Multi-Item)
2️⃣ *2* - Cari Data (Supplier / Material / Harga)
3️⃣ *3* - Update Status PO (GRPO / Pembayaran)
4️⃣ *4* - Hapus / Batalkan PO

📷 _Atau langsung kirim Foto / PDF dokumen PO untuk input otomatis via OCR!_
💡 _Ketik angka pilihan (1-4) atau ketik 'batal'_
```

### B. Alur Input PO Multi-Item (Metode Keranjang)
1. **User Memilih `1`:**
   - Bot meminta Header: `Nomor PO` dan `Nama Supplier`.
2. **User Mengisi Header:**
   - Contoh: `PO-2026-020, PT Buana Logam Perkasa`
3. **User Mengisi Daftar Barang Sekaligus (Multiline):**
   ```text
   RM00355 20 25000
   RM00356 10 40000
   OT00120 5 150000
   ```
4. **Validasi & Rangkuman Nota:**
   - Bot memvalidasi kode barang ke sheet Master dan menghitung total tagihan.
   - Menampilkan konfirmasi nota ke user.
5. **Eksekusi:**
   - User membalas `SIMPAN` -> Bot mengeksekusi *batch append* ke sheet `PO 2026`.

### C. Alur Pencarian Data (Menu `2`)
- **Pilihan 1 - Rekomendasi Supplier:** Menampilkan vendor yang paling sering diorder berdasarkan kode/nama material.
- **Pilihan 2 - Cek Master Material:** Mencari kecocokan kode atau deskripsi spesifikasi barang.
- **Pilihan 3 - Cek Riwayat Harga & Status PO:** Menampilkan harga order terakhir dan status penyelesaian pembayaran.

---

## 4. Alur Kerja Modul Hybrid OCR / Dokumen Parser

```
                     [Pengguna WhatsApp]
                              │
                Kirim Foto PO / Dokumen PDF
                              │
                              ▼
        [OpenWA Gateway: openwa.ebite.biz.id]
                              │
             Webhook POST: message.received
                              │
                              ▼
                 [Bot Backend Service]
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
      Tipe Dokumen?                       Tipe Gambar?
            │                                   │
            ▼                                   ▼
    [Local pdf-parse]                 [Google Gemini 1.5 Flash]
  (Ekstrak teks digital)             (Vision Multimodal Ekstraksi)
            │                                   │
            └─────────────────┬─────────────────┘
                              │
                              ▼
                { Format JSON Terstruktur }
             (No PO, Supplier, Tgl, List Item)
                              │
                              ▼
            [Fuzzy Match ke database Material]
            (Lengkapi kode barang & harga satuan)
                              │
                              ▼
            [Kirim Ringkasan Draft ke WhatsApp]
                 "Ketik YA untuk Simpan"
                              │
                       User Balas: YA
                              │
                              ▼
            [Append ke Google Sheet: PO 2026]
```

---

## 5. Struktur Folder & Modul Proyek

```
C:\reandy\bot-with-openwa\bot-po-whatsapp\
├── credentials/
│   ├── client_secret.json          # Google OAuth 2.0 Client credentials
│   └── token.json                  # Persistent OAuth Refresh Token
├── src/
│   ├── config/
│   │   ├── googleAuth.js           # Google OAuth2 client initialization & token loader
│   │   └── env.js                  # Environment variable configuration
│   ├── services/
│   │   ├── sheetsService.js        # Google Sheets CRUD (Append, Update, Search, Soft-Delete)
│   │   ├── cacheService.js         # In-memory caching for Master Material (1.506 rows)
│   │   ├── openwaService.js        # REST client to call openwa.ebite.biz.id API
│   │   ├── geminiVisionService.js  # Google Gemini 1.5 Flash Vision OCR parser
│   │   └── pdfParserService.js     # Fast digital PDF extractor
│   ├── handlers/
│   │   ├── webhookHandler.js       # Router event webhook (message.received)
│   │   ├── conversationManager.js  # State machine untuk sesi interaktif step-by-step
│   │   ├── commandHandler.js       # Parser perintah langsung (!cari, !cekpo, !inputpo)
│   │   └── mediaHandler.js         # Handler foto/PDF untuk OCR
│   └── server.js                   # Express application entry point (Port 3000)
├── auth-google.js                  # One-time script untuk otorisasi token.json pertama kali
├── .env.example
├── .gitignore
├── agents.md                       # Blueprint teknis proyek
└── package.json
```

---

## 6. Daftar Dependensi Paket (`package.json`)

- `express`: Web framework HTTP penerima webhook OpenWA.
- `googleapis`: SDK resmi Google Cloud untuk Google Sheets API v4.
- `axios`: HTTP client untuk interaksi dengan OpenWA REST Gateway.
- `@google/generative-ai`: SDK resmi Google Gemini AI untuk vision OCR.
- `pdf-parse`: Parser file PDF digital lokal tanpa biaya API.
- `dotenv`: Manajemen environment variable.
- `fuse.js`: Algoritma pencarian fuzzy string untuk mencocokkan nama barang ke master data.

---

## 7. Rencana Eksekusi Bertahap (Action Roadmap)

1. **Tahap 1: Setup Proyek & Dependensi**
   - Inisialisasi `package.json` dan instalasi dependensi.
   - Konfigurasi `.env` dan pemindahan file kredensial `client_secret.json`.
2. **Tahap 2: Autentikasi Google OAuth 2.0**
   - Menjalankan `auth-google.js` untuk membuat file persisten `token.json`.
3. **Tahap 3: Implementasi Google Sheets Service & In-Memory Cache**
   - Pengambilan master data tab `database Material` & `database Supplier Material`.
   - Fungsi Append PO (Multi-item), Update Baris, dan Soft Delete status.
4. **Tahap 4: Implementasi Client OpenWA Gateway**
   - Menghubungkan bot dengan instance `openwa.ebite.biz.id` via REST API.
5. **Tahap 5: Implementasi Modul OCR & Parser PDF**
   - Setup Google Gemini 1.5 Flash Vision & `pdf-parse`.
   - Modul auto-matching deskripsi barang ke master kode item.
6. **Tahap 6: Sistem Percakapan Interaktif (Wizard Manager)**
   - State machine multi-step (`start` -> Menu -> Input -> Konfirmasi `YA/BATAL`).
7. **Tahap 7: Testing & Verifikasi End-to-End**
   - Uji coba live penerimaan webhook, pencarian master, input PO multi-item, dan parsing scan dokumen PO.
