import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'The Print Edition — The Atlantic',
  icons: { icon: '/covers/202609.png' },
  description:
    'Explore five years of The Atlantic in the print archive. September 2021–September 2026.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
