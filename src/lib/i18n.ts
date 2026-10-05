// Widget chrome only — the assistant itself answers in whatever language the patient writes.
const strings = {
  en: {
    title: "Ask us anything",
    subtitle: "Usually answers in seconds, 24/7",
    greeting:
      "Hi! 👋 I can answer questions about treatments, prices and travel. What are you interested in?",
    placeholder: "Type your message…",
    send: "Send",
    typing: "Typing…",
    error: "Message not sent. Please try again.",
    human: "A coordinator has joined the chat",
    disclaimer: "AI assistant · not medical advice",
  },
  tr: {
    title: "Bize her şeyi sorun",
    subtitle: "7/24, genelde saniyeler içinde yanıt",
    greeting: "Merhaba! 👋 Tedaviler, fiyatlar ve seyahat hakkında sorularınızı yanıtlayabilirim. Neyle ilgileniyorsunuz?",
    placeholder: "Mesajınızı yazın…",
    send: "Gönder",
    typing: "Yazıyor…",
    error: "Mesaj gönderilemedi. Lütfen tekrar deneyin.",
    human: "Bir koordinatör sohbete katıldı",
    disclaimer: "Yapay zekâ asistanı · tıbbi tavsiye değildir",
  },
  ru: {
    title: "Задайте нам вопрос",
    subtitle: "Отвечаем за секунды, 24/7",
    greeting: "Здравствуйте! 👋 Отвечу на вопросы о процедурах, ценах и поездке. Что вас интересует?",
    placeholder: "Напишите сообщение…",
    send: "Отправить",
    typing: "Печатает…",
    error: "Сообщение не отправлено. Попробуйте ещё раз.",
    human: "К чату подключился координатор",
    disclaimer: "ИИ-ассистент · не медицинская консультация",
  },
  de: {
    title: "Fragen Sie uns",
    subtitle: "Antwort meist in Sekunden, rund um die Uhr",
    greeting: "Hallo! 👋 Ich beantworte Fragen zu Behandlungen, Preisen und Anreise. Wofür interessieren Sie sich?",
    placeholder: "Nachricht schreiben…",
    send: "Senden",
    typing: "Schreibt…",
    error: "Nachricht nicht gesendet. Bitte erneut versuchen.",
    human: "Eine Koordinatorin ist dem Chat beigetreten",
    disclaimer: "KI-Assistent · keine medizinische Beratung",
  },
  ar: {
    title: "اسألنا أي شيء",
    subtitle: "نرد خلال ثوانٍ، على مدار الساعة",
    greeting: "مرحباً! 👋 يمكنني الإجابة عن أسئلتك حول العلاجات والأسعار والسفر. بماذا تهتم؟",
    placeholder: "اكتب رسالتك…",
    send: "إرسال",
    typing: "يكتب…",
    error: "لم تُرسل الرسالة. حاول مرة أخرى.",
    human: "انضم منسق إلى المحادثة",
    disclaimer: "مساعد ذكاء اصطناعي · ليست استشارة طبية",
  },
  az: {
    title: "Bizə sual verin",
    subtitle: "7/24, adətən saniyələr içində cavab",
    greeting: "Salam! 👋 Müalicələr, qiymətlər və səfər haqqında suallarınızı cavablandıra bilərəm. Nə ilə maraqlanırsınız?",
    placeholder: "Mesajınızı yazın…",
    send: "Göndər",
    typing: "Yazır…",
    error: "Mesaj göndərilmədi. Yenidən cəhd edin.",
    human: "Koordinator söhbətə qoşuldu",
    disclaimer: "Süni intellekt köməkçisi · tibbi məsləhət deyil",
  },
} as const;

export type WidgetLocale = keyof typeof strings;
export type WidgetStrings = (typeof strings)[WidgetLocale];

export function pickLocale(input: string | null | undefined): WidgetLocale {
  const code = (input ?? "").toLowerCase().slice(0, 2);
  return code in strings ? (code as WidgetLocale) : "en";
}

export const widgetStrings = (locale: WidgetLocale): WidgetStrings => strings[locale];
export const isRtl = (locale: WidgetLocale) => locale === "ar";
