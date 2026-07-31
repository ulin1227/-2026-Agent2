import type { Metadata } from "next";
import "../globals.css";
import "./orchard.css";
import "./fm01.css";

export const metadata: Metadata = {
  title: "無痛交接 FlowLink｜智能交接系統",
  description: "讓交接延續知識，讓新人少走彎路。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
