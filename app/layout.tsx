import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-script";

const pulseFont = Bricolage_Grotesque({
  variable: "--font-pulse",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulse",
  description: "Strangers glow on a night-side Earth. Tap a light, start talking.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#14183a" },
    { media: "(prefers-color-scheme: light)", color: "#f3f1fa" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${pulseFont.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
