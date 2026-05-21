'use client';

// Tiny client component just to host the window.print() onClick. The rest of
// the print sheet is a Server Component so it can hit Supabase directly.

export default function PrintButton() {
  return (
    <button className="print-btn" onClick={() => window.print()}>
      Print
    </button>
  );
}
