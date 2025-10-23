import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AuthProvider } from './auth-provider';
import { ChatProvider } from '../components/ChatProvider';
import { TestModeRoleSwitcher } from '../components/TestModeRoleSwitcher';
import { RoleBasedNavigation } from '@/components/RoleBasedNavigation';
import { UserMenu } from '@/components/UserMenu';
import { AdminNotifications } from '@/components/AdminNotifications';

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
        <AuthProvider>
          <ChatProvider>
            <Providers>
              <div className="min-h-screen bg-gray-50">
                <Navigation />
                <main>{children}</main>
                <TestModeRoleSwitcher />
              </div>
            </Providers>
          </ChatProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

function Navigation() {
  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg"></div>
              <span className="text-xl font-bold text-gray-900">Supplify</span>
            </div>
            
            <RoleBasedNavigation />
          </div>

          <div className="flex items-center gap-4">
            <AdminNotifications />
            <button className="text-gray-600 hover:text-gray-900">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  );
}

