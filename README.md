# API Sniffer Pro v3

Extension Chrome untuk menyadap (sniff) traffic API langsung dari browser.

**Fitur:**
- Intercept semua request HTTP (fetch & XHR)
- Ekstrak token otomatis: Bearer, JWT, API Key, Cookie
- Lihat daftar request terbaru + klik untuk detail lengkap
- Search/filter token dan request
- Pause/Resume capture kapan saja
- Export ke `.env`, JSON, atau cURL script
- Copy token individual dengan satu klik
- Live update realtime via storage events
- Tampilkan domain count, request count, token count

## Cara Install

1. Buka Chrome → ketik `chrome://extensions`
2. Aktifkan **Developer mode** (pojok kanan atas)
3. Klik **Load unpacked**
4. Pilih folder `chrome_sniffer_upgraded` ini
5. Extension **API Sniffer Pro** muncul di toolbar

## Cara Pakai

1. Buka website target
2. Klik icon extension
3. Lakukan interaksi di website (login, klik menu, dll)
4. Token terekstrak otomatis → tab **Tokens**
5. Lihat semua request → tab **Requests** → klik untuk detail
6. Export data → tab **Export**
7. Gunakan tombol **Pause** untuk berhenti sementara

## Perbaikan di v3 (dari v2)

- Fix bug `sendMessage` loop di background.js
- Tambah fitur Pause/Resume capture
- Live update menggunakan `chrome.storage.onChanged` (lebih reliable)
- Tambah search/filter di semua panel
- Tambah request list view dengan click-to-detail
- Tambah copy token individual
- Tambah domain counter
- Sanitasi serialisasi JSON (hindari crash di response body besar)
- Perbaikan XHR response header parsing
- Token key menggunakan hostname sebagai prefix (menghindari collision)
