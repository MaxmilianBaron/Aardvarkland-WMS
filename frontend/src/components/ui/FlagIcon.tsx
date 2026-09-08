import type { Language } from '../../core/i18n/i18n';

interface FlagIconProps {
  code: Language;
}

export function FlagIcon({ code }: FlagIconProps) {
  return (
    <span className="flag-icon" aria-hidden="true">
      {code === 'cs' && <CzechFlag />}
      {code === 'en' && <BritishFlag />}
      {code === 'ua' && <UkrainianFlag />}
      {code === 'fr' && <FrenchFlag />}
      {code === 'de' && <GermanFlag />}
      {code === 'es' && <SpanishFlag />}
    </span>
  );
}

function CzechFlag() {
  return (
    <svg viewBox="0 0 640 480" focusable="false">
      <path fill="#fff" d="M0 0h640v240H0z" />
      <path fill="#d7141a" d="M0 240h640v240H0z" />
      <path fill="#11457e" d="M0 0l320 240L0 480z" />
    </svg>
  );
}

function BritishFlag() {
  return (
    <svg viewBox="0 0 640 480" focusable="false">
      <path fill="#012169" d="M0 0h640v480H0z" />
      <path fill="#fff" d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0z" />
      <path fill="#c8102e" d="m424 281 216 159v40L369 281zm-184 20 6 35L54 480H0zm400-301v3L391 191l2-44L590 0zM0 0l239 176h-60L0 42z" />
      <path fill="#fff" d="M241 0v480h160V0zM0 160v160h640V160z" />
      <path fill="#c8102e" d="M273 0v480h96V0zM0 193v96h640v-96z" />
    </svg>
  );
}

function UkrainianFlag() {
  return (
    <svg viewBox="0 0 640 480" focusable="false">
      <path fill="#0057b7" d="M0 0h640v240H0z" />
      <path fill="#ffd700" d="M0 240h640v240H0z" />
    </svg>
  );
}

function FrenchFlag() {
  return (
    <svg viewBox="0 0 640 480" focusable="false">
      <path fill="#002654" d="M0 0h213.34v480H0z" />
      <path fill="#fff" d="M213.33 0h213.34v480H213.33z" />
      <path fill="#ce1126" d="M426.66 0H640v480H426.66z" />
    </svg>
  );
}

function GermanFlag() {
  return (
    <svg viewBox="0 0 640 480" focusable="false">
      <path fill="#000" d="M0 0h640v160H0z" />
      <path fill="#dd0000" d="M0 160h640v160H0z" />
      <path fill="#ffce00" d="M0 320h640v160H0z" />
    </svg>
  );
}

function SpanishFlag() {
  return (
    <svg viewBox="0 0 640 480" focusable="false">
      <path fill="#aa151b" d="M0 0h640v120H0zM0 360h640v120H0z" />
      <path fill="#f1bf00" d="M0 120h640v240H0z" />
    </svg>
  );
}
