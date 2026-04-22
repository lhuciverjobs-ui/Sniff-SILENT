<p align="center">
  <img src="./assets/readme-banner.png" alt="Sniff-SILENT banner" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" />
  <img src="https://img.shields.io/badge/Mode-Incognito_Only-1a1a2e?style=for-the-badge&logo=googlechrome&logoColor=white" />
  <img src="https://img.shields.io/badge/Dibuat_Dengan-JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
  <img src="https://img.shields.io/badge/Lisensi-MIT-00ff88?style=for-the-badge" />
</p>

<p align="center">
  <b>Senyap. Tepat Sasaran. Tak Terlihat.</b><br/>
  Ekstensi Chrome untuk mencegat traffic API secara real-time — dirancang untuk sesi incognito, pemburu token, dan siapa saja yang perlu tahu apa yang sebenarnya dikirim browser.
</p>

---

## 🌑 Apa Itu Sniff-SILENT?

**Sniff-SILENT** menyusup ke `fetch` dan `XMLHttpRequest` di level halaman untuk menangkap seluruh traffic keluar dari browser — tanpa proxy, tanpa install sertifikat, tanpa harus bolak-balik ke tab DevTools.

Berjalan sebagai **side panel** yang persisten, mengekstrak artefak autentikasi secara otomatis, dan dibatasi hanya untuk jendela incognito agar hasil capture bersih dari kebisingan sesi normal.

> Dibuat untuk peneliti, developer, dan security engineer yang butuh visibilitas cepat dan fokus terhadap apa yang dilakukan sebuah web app — tanpa gangguan yang tidak perlu.

---

## ⚡ Kemampuan Utama

| Fitur | Keterangan |
|---|---|
| 🔌 **Pencegatan Traffic** | Hook `fetch` + `XMLHttpRequest` saat injeksi halaman |
| 🔑 **Ekstraksi Token** | Otomatis menarik Bearer token, JWT, API key, dan cookie |
| 🖥️ **Side Panel Persisten** | Tetap terbuka saat kamu berinteraksi dengan target |
| 🚀 **Quick Start** | Satu klik: ikat tab, set filter, beri nama sesi, mulai capture |
| 📦 **Capture Sesi** | Kelompokkan request ke dalam sesi bernama per flow atau target |
| 🏷️ **Penandaan Cerdas** | Auto-label `AUTH` `TOKEN` `ERROR` `GRAPHQL` `JSON` |
| 🔁 **Deduplikasi** | Gabungkan request berulang dengan penghitung tampilan |
| 📤 **Ekspor** | Output sebagai `.env`, `.json`, atau `cURL` |
| 🌑 **Incognito-First** | Hanya menerima traffic dari jendela incognito secara desain |

---

## 🕵️ Kenapa Harus Incognito?

Kebanyakan ekstensi menerima semua traffic begitu saja. Sniff-SILENT secara sengaja membatasi capture hanya ke jendela incognito karena alasan mendasar:

```
jendela normal  →  cookie dari 12 tab lain, sesi tersimpan,
                   state sebelum login, ad tracker, service worker...

incognito       →  bersih. hanya flow yang kamu uji.
```

**Manfaat nyata:**
- Tidak ada kontaminasi silang dari sesi harian kamu
- Alur login dan onboarding lebih mudah dicapture dalam kondisi bersih
- Isolasi per-target yang lebih mudah dikendalikan
- Lebih sedikit noise = sinyal lebih cepat ditemukan

> ⚠️ Chrome mengharuskan kamu mengaktifkan `Izinkan di Mode Samaran` secara manual dari halaman detail ekstensi. Ini disengaja — agar izin tersebut tetap eksplisit dan disadari pengguna.

---

## 🗂️ Struktur Proyek

```
Sniff-SILENT/
├── assets/
│   └── readme-banner.png
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon-master.png
├── background.js        ← Logika capture, storage, dedup, incognito gate
├── content.js           ← Jembatan: event halaman → runtime ekstensi
├── inject.js            ← Hook fetch/XHR di level halaman
├── manifest.json        ← Izin, side panel, content scripts
├── popup.html           ← UI side panel
├── popup.js             ← Kontroler side panel
└── README.md
```

<details>
<summary><b>📄 Tanggung Jawab Setiap File Inti</b></summary>

<br/>

**`inject.js`**
Berjalan di konteks halaman. Membungkus `fetch` dan `XMLHttpRequest` native untuk mencegat semua request keluar sebelum meninggalkan browser. Inilah yang menangkap traffic mentah.

**`content.js`**
Bertindak sebagai jembatan pesan. Menerima event dari `inject.js` (yang hidup di dunia halaman) dan meneruskannya ke runtime ekstensi agar bisa diproses oleh `background.js`.

**`background.js`**
Mesin utama. Menerapkan aturan capture, filter, dan logika sesi. Mengelola deduplikasi, menyimpan request dan token yang diekstrak ke storage ekstensi, serta menjalankan incognito gate.

**`popup.html` + `popup.js`**
Antarmuka side panel. Menampilkan log capture, mengontrol sesi, menangani ekspor, dan mengelola semua input filter.

**`manifest.json`**
Mendeklarasikan izin ekstensi (`declarativeNetRequest`, `storage`, `tabs`, `sidePanel`), mendaftarkan content script, dan mengatur perilaku incognito.

</details>

---

## 🛠️ Cara Instalasi

```
1.  Buka        →  chrome://extensions
2.  Aktifkan    →  Mode Developer
3.  Klik        →  Load unpacked
4.  Pilih       →  folder proyek ini
5.  Buka        →  halaman detail ekstensi
6.  Aktifkan    →  Izinkan di Mode Samaran
```

> ⚠️ Langkah ke-6 wajib dilakukan. Tanpanya, ekstensi akan termuat tapi tidak akan menerima traffic apapun.

---

## 🚀 Alur Penggunaan yang Disarankan

```
Ctrl + Shift + N       →  buka jendela incognito baru
Buka situs target      →  navigasi ke halaman yang ingin diuji
Klik ikon ekstensi     →  buka side panel
Tekan                  →  Quick Start This Tab
Lakukan aksi           →  login, trigger flow, hit endpoint
Pantau                 →  request, token, dan tag muncul real-time
Ekspor                 →  .env / .json / cURL saat selesai
```

---

## 🎛️ Kontrol Capture

Side panel menyediakan kontrol berikut:

```
[ Nama Sesi          ]  label untuk sesi capture ini
[ Mulai Sesi         ]  mulai sesi bernama baru
[ Hentikan Sesi      ]  akhiri capture dan bekukan log
[ Filter Domain      ]  batasi ke host tertentu
[ Filter Path        ]  cocokkan segmen path URL
[ Filter Method      ]  GET / POST / PUT / DELETE / dll.
[ Filter Kata Kunci  ]  cocokkan teks bebas terhadap URL atau body
[ Tab Aktif Saja     ]  toggle: batasi capture ke tab saat ini
```

---

## 📤 Format Ekspor

<details>
<summary><b>.env — format variabel lingkungan</b></summary>

```env
BEARER_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6...
API_KEY=sk-abc123...
```

</details>

<details>
<summary><b>.json — log terstruktur lengkap</b></summary>

```json
{
  "session": "target-login-2025",
  "captured": [...],
  "tokens": [...]
}
```

</details>

<details>
<summary><b>cURL — request yang bisa direproduksi</b></summary>

```bash
curl -X POST https://api.target.com/auth/login \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}'
```

</details>

---

## 🔖 Perilaku Saat Ini

| Perilaku | Status |
|---|---|
| Capture saat load | ❌ Nonaktif secara default |
| Incognito gate | ✅ Aktif — traffic non-incognito ditolak |
| Mode panel | ✅ Side panel (bukan popup) |
| Scope tab aktif | ✅ Didukung via toggle |
| Penggabungan duplikat | ✅ Aktif — penghitung ditampilkan pada request berulang |
| Penyimpanan | ✅ Local extension storage (tanpa request keluar) |

---

## ⚠️ Disclaimer

Sniff-SILENT ditujukan untuk **observasi traffic browser yang terkontrol dan berizin** — debugging saat development, reverse engineering API pada layanan yang kamu miliki atau sudah ada izin pengujiannya, dan riset keamanan dalam ruang lingkup yang jelas.

Jangan gunakan tool ini terhadap sistem yang tidak kamu miliki atau tidak memiliki izin eksplisit untuk diinspeksi.

---

<p align="center">
  <sub>Dibuat untuk tab incognito. Untuk yang penasaran. Untuk yang fokus.</sub><br/>
  <sub><code>lhuciverjobs-ui/Sniff-SILENT</code></sub>
</p>
