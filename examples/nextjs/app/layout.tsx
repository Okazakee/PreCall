import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PreCall · Next.js integration example",
  description:
    "A minimal Next.js Route Handler that turns a client inquiry into an internal pre-call brief with the precall package.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
