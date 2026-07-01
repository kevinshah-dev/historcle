import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "pk_test_cmVsYXRlZC1zd2lmdC02NS5jbGVyay5hY2NvdW50cy5kZXYk";

export const metadata: Metadata = {
  title: "Historcle | CloseEnough Games",
  description: "A daily geography-history game. Read the event, place it on the globe, and score by distance.",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090c0d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProviders publishableKey={clerkPublishableKey}>{children}</AppProviders>
      </body>
    </html>
  );
}
