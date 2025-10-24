import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { Providers } from '../components/Providers';
import { Navigation } from '../components/Navigation';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Supplify - B2B Food Supply Platform',
  description: 'Complete B2B food supply management platform with inventory, ordering, and analytics',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <AuthProvider>
            <div className="min-h-screen bg-gray-50">
              <Navigation />
              <main>{children}</main>
            </div>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}

