import type { Metadata } from "next";
import "./globals.css";
import "./reader.css";
import "./browse.css";

export const metadata: Metadata = {
  title: "Atlas — Developer Portal",
  description: "A live map of any codebase",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
