import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const pulseFont = Bricolage_Grotesque({
  variable: "--font-pulse",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulse",
  description: "Strangers glow on a night-side Earth. Tap a light, start talking.",
};

export const viewport: Viewport = {
  themeColor: "#14183a",
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
    <html lang="en" className={`${pulseFont.variable} h-full`}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
