import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://scm.vinymods.com.br'),
  title: {
    default: 'Simple Collection Manager',
    template: '%s | Simple Collection Manager'
  },
  description: 'Create, edit, and publish Nexus Mods collections from the browser.',
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.svg'
  },
  openGraph: {
    title: 'Simple Collection Manager',
    description: 'Create, edit, and publish Nexus Mods collections from the browser.',
    siteName: 'Simple Collection Manager',
    images: [
      {
        url: '/social-thumb.jpg',
        width: 1200,
        height: 630,
        alt: 'Simple Collection Manager'
      }
    ],
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Simple Collection Manager',
    description: 'Create, edit, and publish Nexus Mods collections from the browser.',
    images: ['/social-thumb.jpg']
  },
  other: {
    'google-adsense-account': 'ca-pub-4143553417003850'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
