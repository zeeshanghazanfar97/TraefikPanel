import type { Metadata } from "next";
import Script from "next/script";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans" });
const jetBrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Traefik Panel",
  description: "Interactive Traefik dynamic.yml editor"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{`
          (function () {
            try {
              var theme = localStorage.getItem('traefik-panel-theme');
              if (theme === 'dark') document.documentElement.classList.add('dark');
            } catch (e) {}
          })();
        `}</Script>
      </head>
      <body className={cn(spaceGrotesk.variable, jetBrainsMono.variable, "font-sans antialiased")}>{children}</body>
    </html>
  );
}
