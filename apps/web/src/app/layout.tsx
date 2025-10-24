import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { Providers } from '../components/Providers';

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
              <nav className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-8">
                  <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-600 rounded-lg"></div>
                      <span className="text-xl font-bold text-gray-900">Supplify</span>
                    </div>
                  </div>
                </div>
              </nav>
              <main>{children}</main>
            </div>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}

