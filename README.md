# YKS Takip Uygulaması

YKS öğrencisinin yanlış yaptığı soruları fotoğraf + ses kaydı ile kaydetmesi, hafta sonu tekrar yapması ve koçun istatistikleri izlemesi için mobil öncelikli React + Vite uygulaması.

## Özellikler

- Firebase Auth ile e-posta/şifre giriş-kayıt
- Rol tabanlı panel yönlendirmesi (Koç / Öğrenci)
- Öğrenci için:
  - Fotoğraf yükleme (kamera/galeri)
  - TYT/AYT → Ders → Konu kademeli seçim
  - MediaRecorder ile ses kaydı
  - Medya bloblarının IndexedDB'de saklanması
  - Hafta sonu karışık haftalık tekrar
  - Doğru/Yanlış sonucuna göre bir sonraki haftaya devretme
- Koç için:
  - Günlük ders/konu bazlı yükleme sayıları
  - Haftalık tekrar doğru/yanlış istatistikleri
  - Önceki haftadan devreden sorularda bu hafta doğru yapılanların sayısı
  - Ders/Konu liste yönetimi

## Kurulum

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Firebase Ortam Değişkenleri

`.env` dosyasını aşağıdaki değişkenlerle doldurun:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Değerler girilmezse uygulama çökmek yerine **"Firebase bağlantısı kurulmadı"** uyarısı gösterir.

## GitHub Pages

- Vite `base` ayarı: `/yks-takip/`
- `main` branch'e push sonrası `.github/workflows/deploy-pages.yml` otomatik build+deploy çalıştırır.
