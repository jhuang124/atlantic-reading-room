import type { Metadata } from 'next';
import './globals.css';
import './themes.css';
import './shelf.css';
import './front.css';
export const metadata: Metadata = {
  title: 'The Print Edition — The Atlantic',
  icons: { icon: '/covers/202609.jpg' },
  description:
    'Read The Atlantic in the searchable print archive. January 2020–September 2026.',
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
