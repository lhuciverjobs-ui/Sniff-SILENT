# Sniff-SILENT

Chrome extension untuk sniff traffic API langsung dari browser dengan mode side panel, session capture, filter target, dan fokus incognito.

## Fitur

- Intercept request HTTP berbasis `fetch` dan `XHR`
- Ekstrak token otomatis: Bearer, JWT, API Key, Cookie
- Side panel monitor yang tidak auto-close
- Mode standby, capture tidak langsung aktif
- Quick start untuk tab aktif
- Filter domain, path, method, dan keyword
- Session capture dengan scope tab aktif
- Smart highlight untuk `AUTH`, `TOKEN`, `ERROR`, `GRAPHQL`, `JSON`
- Duplicate collapse dengan counter
- Export ke `.env`, JSON, dan cURL
- Incognito-only flow untuk hasil yang lebih bersih

## Cara Install

1. Buka `chrome://extensions`
2. Aktifkan `Developer mode`
3. Klik `Load unpacked`
4. Pilih folder project ini
5. Buka detail extension lalu aktifkan `Allow in Incognito`

## Cara Pakai

1. Buka jendela incognito dengan `Ctrl + Shift + N`
2. Buka situs target di jendela incognito
3. Klik icon extension untuk membuka side panel
4. Tekan `Quick Start This Tab` untuk mulai paling cepat
5. Pantau request, token, dan highlight yang muncul

## Catatan

- Extension ini dikunci untuk penggunaan di incognito
- Capture default dalam kondisi mati sampai kamu mulai session
- Filter manual tetap tersedia kalau ingin hasil lebih sempit
