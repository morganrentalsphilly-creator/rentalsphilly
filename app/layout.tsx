import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rentals Philly — Hand-picked Philly rentals, scheduled by text",
  description: "Tell us what you want. A real agent hand-picks rentals that fit, books your tours, and follows up. No endless scrolling.",
  openGraph: {
    title: "Rentals Philly",
    description: "Hand-picked Philadelphia rentals. Real agent. Booked by text.",
    url: "https://rentalsphilly.vercel.app",
    siteName: "Rentals Philly",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rentals Philly",
    description: "Hand-picked Philadelphia rentals. Real agent. Booked by text.",
  },
  // Apple touch icon falls back to /apple-icon if you add one in /public
  appleWebApp: {
    title: "Rentals Philly",
    statusBarStyle: "default",
    capable: true,
  },
};

// Force mobile viewport handling: prevent maximum-scale=1 (Apple rejects forms
// that block pinch zoom for accessibility) but ensure correct width.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#b58e54",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Leaflet CSS for the Philly zip map picker. Lightweight (~14KB). */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
