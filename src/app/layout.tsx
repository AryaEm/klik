import type { Metadata } from "next";
import { Fredoka, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Klik!",
  description: "Foto selfie online dengan efek webcam, diproses langsung di browser.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${fredoka.variable} ${geistSans.variable} ${geistMono.variable} dark h-dvh overflow-hidden antialiased`}
    >
      <body className="flex h-dvh w-screen flex-col overflow-hidden bg-surface text-zinc-100 selection:bg-brand selection:text-white">
        {children}
      </body>
    </html>
  );
}