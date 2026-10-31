import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import { appConfig } from "@/lib/config";
import { SessionProvider } from "@/lib/session";

export const metadata: Metadata = {
  title: `${appConfig.brandName} | إدارة التأجير`,
  description: "منصة إدارة التأجير المنتهي بالتمليك",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0B0B0C" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <SessionProvider>{children}</SessionProvider>
          <Toaster position="top-center" richColors dir="rtl" />
        </ThemeProvider>
      </body>
    </html>
  );
}
