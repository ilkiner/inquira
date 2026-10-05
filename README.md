# Inquira — Sağlık turizmi klinikleri için AI hasta asistanı

Yurt dışından gelen hasta sorularını (WhatsApp/web) **saniyeler içinde, hastanın kendi dilinde** yanıtlar,
hastayı nitelendirir (tedavi, ülke, tarih, iletişim) ve sıcak lead'i koordinatöre devreder.

**Neden:** Sağlık turizminde hastalar gece birkaç kliniğe birden yazar. İlk 5 dakikada cevap verilmeyen
lead'in nitelendirilme şansı ~21 kat düşer; 48 saat bekleyen soru genelde rakibe gider. Klinik koordinatörleri
7/24, 6 dilde anında cevap veremez — Inquira verir.

## Ne var (MVP)

- **Gömülebilir sohbet widget'ı** — herhangi bir siteye tek satır: `<script src="https://alanınız/embed.js" async></script>`
  - 6 dilde arayüz (EN, TR, RU, DE, AR, AZ); AI her dilde cevap verir
  - Sayfa yenilense de konuşma kaldığı yerden devam eder
- **AI asistan** (Claude) — yalnızca `src/lib/clinic-config.ts` içindeki bilgilerle konuşur
  - Fiyatları sadece aralık olarak verir, teşhis koymaz, sonuç vaat etmez
  - Öğrendiğini lead kaydına yazar (`update_lead`), gerektiğinde koordinatöre devreder (`handoff_to_coordinator`)
  - 0–100 rezervasyon olasılığı puanı
- **Koordinatör paneli** (`/dashboard`, şifreli)
  - Aşamaya göre lead listesi, konuşma geçmişi, çıkarılan bilgiler
  - "Sohbeti devral": AI susar, koordinatör widget'a doğrudan yazar; "AI'ya geri ver"
  - Tek tıkla WhatsApp'ta devam
- **Telegram bildirimleri** — yeni iletişim bilgisi, sıcak lead (puan ≥ 70), devir talebi, AI hatası

## Çalıştırma

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY ve DASHBOARD_PASSWORD'ü doldur
npm run dev
```

- `http://localhost:3000` — widget gömülü demo klinik sitesi
- `http://localhost:3000/dashboard` — koordinatör paneli

Supabase ayarlanmazsa veriler bellekte tutulur (yeniden başlatınca silinir). Kalıcı veri için:
`supabase/migrations/0001_init.sql`'i çalıştırın, `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY`'i girin.
Service role anahtarı yalnızca sunucuda kullanılır.

## Kontroller

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Yapı

```
src/lib/clinic-config.ts    # Klinik bilgisi = AI'nın bilgi tabanı (gerçek klinikle değiştirin)
src/lib/agent/              # Sistem talimatı, araçlar, konuşma döngüsü
src/lib/store/              # Bellek ve Supabase depoları (aynı arayüz)
src/app/api/chat/           # Widget API'si (gönder + yeni mesajları çek)
src/app/widget/             # iframe içindeki sohbet arayüzü
src/app/dashboard/          # Koordinatör paneli + server action'lar
src/proxy.ts                # Panel girişi koruması
public/embed.js             # Sitelere eklenen yükleyici
```

## Bilinen sınırlar / sıradaki adımlar

1. **WhatsApp Business (Cloud API) kanalı** — en önemli adım; Meta işletme doğrulaması gerektirir.
2. **Fotoğraf yükleme** (saç/diş ön değerlendirmesi) — Claude görsel okuyabiliyor; depolama + izin akışı eklenecek.
3. **Çoklu klinik (multi-tenant)** — şu an her kurulum tek klinik; satış öncesi `clinics` tablosu + giriş.
4. Hız sınırlama ve konuşma kilidi süreç içi; birden çok sunucuya ölçeklerken Redis / DB kilidine taşınmalı.
5. Gerçek konuşmalarla değerlendirme seti (eval) kurulup talimat iyileştirilmeli.
