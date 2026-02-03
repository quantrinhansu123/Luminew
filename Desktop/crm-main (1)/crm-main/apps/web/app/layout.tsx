import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { Toaster } from 'sonner';
import "./globals.css";

const roboto = Roboto({ 
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  variable: "--font-roboto"
});

export const metadata: Metadata = {
  title: "CRM - Lead Management System",
  description: "Hệ thống quản lý khách hàng tiềm năng",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={roboto.className} suppressHydrationWarning>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
