import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Simple Collection Manager.'
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <section className="legal-card">
        <a className="back-link legal-back-link" href="/">&larr; Back</a>
        <h1>Privacy Policy</h1>
        <p>
          The API key you provide is used only to validate your session and perform the actions you request inside the app.
        </p>
        <p>
          The key is not stored in browser localStorage. It is kept in an encrypted HttpOnly cookie for the session
          configured by the application.
        </p>
        <p>Viny Mods does not sell personal data and does not represent Nexus Mods.</p>
      </section>
    </main>
  );
}
