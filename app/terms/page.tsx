import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Simple Collection Manager.'
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <section className="legal-card">
        <a className="back-link legal-back-link" href="/">&larr; Back</a>
        <h1>Terms of Service</h1>
        <p>
          Viny Mods provides Simple Collection Manager as an independent tool for organizing collections and supporting
          workflows that use the Nexus Mods API.
        </p>
        <p>
          You are responsible for how you use your API key, the data you submit, and your compliance with the terms of
          any external services accessed through the app.
        </p>
        <p>This project is not affiliated with, endorsed by, or operated by Nexus Mods.</p>
      </section>
    </main>
  );
}
