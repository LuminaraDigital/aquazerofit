/**
 * /google-play/privacy-policy — the privacy-policy URL declared in Play
 * Console. The substance stays in Privacy.tsx so the website and the Play
 * listing cannot disagree.
 */
import PrivacyPage from './Privacy';

export default function GooglePlayPrivacyPage() {
  return <PrivacyPage googlePlay />;
}
