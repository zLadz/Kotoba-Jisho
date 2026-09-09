import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kotoba',
  description: 'Dicionário japonês–português',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto w-full max-w-2xl px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
