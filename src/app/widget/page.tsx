import type { Metadata } from "next";
import { clinic } from "@/lib/clinic-config";
import { isRtl, pickLocale, widgetStrings } from "@/lib/i18n";
import { ChatWidget } from "./chat-widget";

export const metadata: Metadata = { title: `${clinic.name} — chat` };

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale = pickLocale(lang);
  return (
    <ChatWidget
      clinicName={clinic.name}
      strings={widgetStrings(locale)}
      dir={isRtl(locale) ? "rtl" : "ltr"}
    />
  );
}
