import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { CommandPalette } from "../components/command-palette";
import { JsonLd } from "../components/json-ld";
import { ServiceWorkerRegister } from "../components/service-worker";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { THEME_INIT_SCRIPT } from "../components/theme-toggle";
import { SITE, absoluteUrl } from "../lib/site";
import "./globals.css";

// All three typefaces are served from our own origin (the CSP forbids third-party fonts).
// Paths point at the files shipped by the @fontsource-variable packages and geist.
const display = localFont({
  src: "../../../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2",
  weight: "200 800",
  variable: "--font-display",
  display: "swap",
});
const body = localFont({
  src: "../../../../node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-body",
  display: "swap",
});
const mono = localFont({
  src: "../../../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  weight: "100 900",
  variable: "--font-mono",
  display: "swap",
  preload: false, // used for small labels and data; loads when first needed
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: ["online tools", "open source", "privacy", "json formatter", "pdf merge", "image compressor", "developer tools"],
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name}: ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
  },
  twitter: { card: "summary_large_image", title: `${SITE.name}: ${SITE.tagline}`, description: SITE.description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The default look is light paper whatever the OS says, so the browser UI should match it.
  themeColor: "#f4f0e6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col font-sans">
        <a href="#main" className="sr-only z-50 bg-foreground px-4 py-2 text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <CommandPalette />
        <ServiceWorkerRegister />
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE.name,
            url: absoluteUrl("/"),
            description: SITE.description,
            potentialAction: { "@type": "SearchAction", target: `${absoluteUrl("/tools")}?q={search_term_string}`, "query-input": "required name=search_term_string" },
          }}
        />
      </body>
    </html>
  );
}
