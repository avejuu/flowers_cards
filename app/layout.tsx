import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Blumenkarten', description: 'Ein kleines Nachschlagewerk für deine Floristik.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="de"><body>{children}</body></html>; }
