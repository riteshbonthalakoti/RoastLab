import { Noto_Sans_Telugu, Noto_Sans_Devanagari } from 'next/font/google';

// Meme captions are drawn in the browser: memegen.link cannot render Telugu/Devanagari glyphs.
export const teFont = Noto_Sans_Telugu({ subsets: ['telugu'], weight: ['800'], display: 'swap', preload: false });
export const hiFont = Noto_Sans_Devanagari({ subsets: ['devanagari'], weight: ['800'], display: 'swap', preload: false });
