# Inquira — Sağlık turizmi klinikleri için AI hasta asistanı

Yurt dışından gelen hasta sorularını (web sitesi ve WhatsApp) **saniyeler içinde, hastanın kendi dilinde** yanıtlar,
hastayı nitelendirir (tedavi, ülke, tarih, iletişim) ve sıcak lead'i koordinatöre devreder.

**Neden:** Sağlık turizminde hastalar gece birkaç kliniğe birden yazar. İlk 5 dakikada cevap verilmeyen
lead'in nitelendirilme şansı ~21 kat düşer; 48 saat bekleyen soru genelde rakibe gider. Klinik koordinatörleri
7/24, 6 dilde anında cevap veremez — Inquira verir.

## Özellikler

- **Web sohbet widget'ı** — herhangi bir siteye tek satır: `<script src="https://alanınız/embed.js" async></script>`
  - 6 dilde arayüz (EN, TR, RU, DE, AR, AZ); AI her dilde cevap verir
  - Sayfa yenilense de konuşma kaldığı yerden devam eder
- **WhatsApp kanalı** (WhatsApp Business Cloud API)
  - Hasta kliniğin WhatsApp numarasına yazar, AI aynı yerden cevap verir
  - Fotoğraf/ses gelince koordinatöre bildirim; koordinatörün panelden yazdığı mesaj hastanın WhatsApp'ına gider
- **AI asistan** — ücretsiz/ucuz herhangi bir OpenAI uyumlu sağlayıcı (varsayılan NVIDIA; Groq, Gemini, OpenRouter)
  - Yalnızca `src/lib/clinic-config.ts` içindeki bilgilerle konuşur; fiyatı aralık olarak verir, teşhis koymaz
  - Öğrendiğini lead kaydına yazar, 0–100 rezervasyon olasılığı puanı verir, gerektiğinde koordinatöre devreder
  - AI çalışmazsa (kota bitti vb.) hastaya nazik bir mesaj gider, koordinatöre uyarı düşer
- **Koordinatör paneli** (`/dashboard`, şifreli)
  - Aşamaya göre lead listesi, konuşma geçmişi, çıkarılan bilgiler, kanal (Web / WhatsApp)
  - "Sohbeti devral": AI susar, koordinatör yazar; "AI'ya geri ver"
- **Telegram bildirimleri** — yeni iletişim bilgisi, sıcak lead (puan ≥ 70), devir talebi, fotoğraf, hata

## Çalıştırma

```bash
npm install
cp .env.example .env.local   # en az LLM_API_KEY ve DASHBOARD_PASSWORD
npm run dev
```

- `http://localhost:3000` — widget gömülü demo klinik sitesi
- `http://localhost:3000/dashboard` — koordinatör paneli

### AI anahtarı (ücretsiz)
https://build.nvidia.com → giriş → bir modelde "Get API Key". Anahtarı `LLM_API_KEY`'e yazın.
Başka sağlayıcı için `.env.example`'daki 3 satırı (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`) değiştirmek yeterli.

### Kalıcı veritabanı (opsiyonel)
`DATABASE_URL` boşsa veriler bellekte tutulur (yeniden başlatınca silinir). Kalıcı veri için herhangi bir
PostgreSQL (ör. Neon ücretsiz planı): `db/0001_init.sql`'i bir kez çalıştırın, bağlantı adresini `DATABASE_URL`'e yazın.

### WhatsApp (opsiyonel)
Meta for Developers'da bir WhatsApp Business uygulaması açın, `WHATSAPP_*` değişkenlerini doldurun ve
webhook adresi olarak `https://alanınız/api/whatsapp`'ı girin (doğrulama jetonu = `WHATSAPP_VERIFY_TOKEN`,
"messages" alanına abone olun). Not: hastanın son mesajından 24 saat sonra WhatsApp yalnızca onaylı şablon
mesajlarına izin verir.

## Kontroller

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Testler AI ve WhatsApp'ı sahte istemcilerle, veritabanı kodunu gerçek Postgres'le (PGlite) çalıştırır.

## Yapı

```
src/lib/clinic-config.ts           # Klinik bilgisi = AI'nın bilgi tabanı (gerçek klinikle değiştirin)
src/lib/agent/                     # Sistem talimatı, araçlar, konuşma döngüsü
src/lib/store/                     # Bellek ve Postgres depoları (aynı arayüz)
src/lib/whatsapp.ts                # İmza doğrulama, mesaj ayrıştırma, gönderme
src/lib/channels/whatsapp-inbound.ts
src/app/api/chat/                  # Web widget API'si
src/app/api/whatsapp/              # WhatsApp webhook
src/app/widget/                    # iframe içindeki sohbet arayüzü
src/app/dashboard/                 # Koordinatör paneli + server action'lar
src/proxy.ts                       # Panel girişi koruması
public/embed.js                    # Sitelere eklenen yükleyici
db/0001_init.sql                   # Veritabanı şeması
```

## Bilinen sınırlar / sıradaki adımlar

1. **Gerçek AI ile deneme** — ücretsiz açık modellerin TR/RU/AZ kalitesi gerçek konuşmalarla ölçülmeli.
2. **Çoklu klinik (multi-tenant)** — şu an her kurulum tek klinik; 3+ müşteride `clinics` tablosu + giriş.
3. **Fotoğrafı AI'ya göstermek** (saç/diş ön değerlendirmesi) — görsel destekli model + depolama gerekir.
4. **24 saat sonrası WhatsApp şablon mesajları** (takip/hatırlatma).
5. Hız sınırlama ve konuşma kilidi süreç içi; birden çok sunucuya ölçeklerken Redis / DB kilidine taşınmalı.
6. KVKK/GDPR: gizlilik metni ve veri saklama süresi. Ücretsiz Gemini planı veriyi eğitimde kullanabilir — gerçek hastada kullanmayın.
