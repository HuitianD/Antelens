import type { Metadata } from 'next';
import './globals.css';
import './polish.css';
export const metadata:Metadata={title:'Antelens',description:'Your requests, findings, and supporting evidence.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
