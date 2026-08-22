import { generatedTranslations } from './translations.generated';

export type Language = 'cs' | 'en' | 'ua' | 'fr' | 'de' | 'es';
export type BaseLanguage = 'cs' | 'en' | 'ua';
export type AddedLanguage = Exclude<Language, BaseLanguage>;
export type BaseTranslations<T> = Record<BaseLanguage, T>;

interface TranslationRow {
  fr: string;
  de: string;
  es: string;
}

const generatedCatalog = generatedTranslations as Readonly<Record<string, TranslationRow>>;
const translatedTreeCache = new WeakMap<object, Map<AddedLanguage, unknown>>();

export const supportedLanguages: readonly Language[] = ['cs', 'en', 'ua', 'fr', 'de', 'es'];

export const languageMenuItems: ReadonlyArray<{ language: Language; label: string }> = [
  { language: 'cs', label: 'Čeština' },
  { language: 'en', label: 'English' },
  { language: 'ua', label: 'Українська' },
  { language: 'fr', label: 'Français' },
  { language: 'de', label: 'Deutsch' },
  { language: 'es', label: 'Español' },
];

export const languageLocales: Readonly<Record<Language, string>> = {
  cs: 'cs-CZ',
  en: 'en-GB',
  ua: 'uk-UA',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
};

const manualOverrides: Readonly<Record<string, TranslationRow>> = {
  'warehouse management system': { fr: "système de gestion d'entrepôt", de: 'Lagerverwaltungssystem', es: 'sistema de gestión de almacenes' },
  'Inbound': { fr: 'Réception', de: 'Wareneingang', es: 'Entrada' },
  'Inbound work.': { fr: 'Travail de réception.', de: 'Wareneingang.', es: 'Trabajo de entrada.' },
  'Outbound': { fr: 'Expédition', de: 'Warenausgang', es: 'Salida' },
  'Outbound work.': { fr: "Travail d'expédition.", de: 'Warenausgang.', es: 'Trabajo de salida.' },
  'Picking': { fr: 'Préparation', de: 'Kommissionierung', es: 'Preparación de pedidos' },
  'Packing': { fr: 'Emballage', de: 'Verpackung', es: 'Embalaje' },
  'Putaway': { fr: 'Mise en stock', de: 'Einlagerung', es: 'Ubicación' },
  'Cycle count': { fr: 'Inventaire tournant', de: 'Zyklische Inventur', es: 'Inventario cíclico' },
  'Cycle counts': { fr: 'Inventaires tournants', de: 'Zyklische Inventuren', es: 'Inventarios cíclicos' },
  'Cycle count health': { fr: "État de l’inventaire tournant", de: 'Status der zyklischen Inventur', es: 'Estado del inventario cíclico' },
  'Stock quant': { fr: 'Stock par emplacement', de: 'Bestand je Lagerplatz', es: 'Existencias por ubicación' },
  'Warehouse worker': { fr: "Opérateur d'entrepôt", de: 'Lagermitarbeiter', es: 'Operario de almacén' },
  'Warehouse manager': { fr: "Responsable d'entrepôt", de: 'Lagerleiter', es: 'Responsable de almacén' },
  'Worker workspace': { fr: "Espace opérateur", de: 'Arbeitsbereich Mitarbeiter', es: 'Espacio del operario' },
  'Manager workspace': { fr: 'Espace responsable', de: 'Arbeitsbereich Lagerleitung', es: 'Espacio del responsable' },
  'Scanner / workstation': { fr: 'Scanner / poste de travail', de: 'Scanner / Arbeitsplatz', es: 'Escáner / puesto de trabajo' },
  'Active outbound work and shipping risk.': { fr: "Expéditions actives et risques d'envoi.", de: 'Aktive Warenausgänge und Versandrisiken.', es: 'Salidas activas y riesgo de envío.' },
  'is running...': { fr: 'est en cours...', de: 'wird ausgeführt...', es: 'está en curso...' },
  'finished.': { fr: 'terminé.', de: 'abgeschlossen.', es: 'finalizado.' },
  'failed': { fr: 'a échoué', de: 'ist fehlgeschlagen', es: 'falló' },
  'Carrier': { fr: 'Transporteur', de: 'Versanddienstleister', es: 'Transportista' },
  'Carriers': { fr: 'Transporteurs', de: 'Versanddienstleister', es: 'Transportistas' },
  'Add carrier': { fr: 'Ajouter un transporteur', de: 'Versanddienstleister hinzufügen', es: 'Agregar transportista' },
  'No carriers': { fr: 'Aucun transporteur', de: 'Keine Versanddienstleister', es: 'Sin transportistas' },
  'Carrier label': { fr: 'Étiquette transporteur', de: 'Versandetikett', es: 'Etiqueta del transportista' },
  'Carrier exceptions': { fr: 'Exceptions transporteur', de: 'Ausnahmen beim Versanddienstleister', es: 'Excepciones del transportista' },
  'Bin': { fr: 'Emplacement', de: 'Lagerplatz', es: 'Ubicación' },
  'Location': { fr: 'Emplacement', de: 'Lagerplatz', es: 'Ubicación' },
  'Locations': { fr: 'Emplacements', de: 'Lagerplätze', es: 'Ubicaciones' },
  'Add location': { fr: 'Ajouter un emplacement', de: 'Lagerplatz hinzufügen', es: 'Agregar ubicación' },
  'No locations': { fr: 'Aucun emplacement', de: 'Keine Lagerplätze', es: 'Sin ubicaciones' },
  'Save location': { fr: "Enregistrer l'emplacement", de: 'Lagerplatz speichern', es: 'Guardar ubicación' },
  'Update location': { fr: "Mettre à jour l'emplacement", de: 'Lagerplatz aktualisieren', es: 'Actualizar ubicación' },
  'Inventory': { fr: 'Stock', de: 'Bestand', es: 'Inventario' },
  'No inventory': { fr: 'Aucun stock', de: 'Kein Bestand', es: 'Sin inventario' },
  'live stock': { fr: 'stock en temps réel', de: 'Live-Bestand', es: 'existencias en tiempo real' },
  'Receiving': { fr: 'Réception', de: 'Wareneingang', es: 'Recepción' },
  'Active receiving': { fr: 'Réceptions actives', de: 'Aktiver Wareneingang', es: 'Recepción activa' },
  'Receiving API': { fr: 'API de réception', de: 'Wareneingangs-API', es: 'API de recepción' },
  'Receiving dock': { fr: 'Quai de réception', de: 'Wareneingangstor', es: 'Muelle de recepción' },
  'Receiving checks': { fr: 'Contrôles de réception', de: 'Wareneingangskontrollen', es: 'Controles de recepción' },
  'Release picking': { fr: 'Lancer la préparation', de: 'Kommissionierung freigeben', es: 'Liberar preparación de pedidos' },
  'Wave': { fr: 'Vague de préparation', de: 'Kommissionierwelle', es: 'Oleada de preparación' },
  'Waves': { fr: 'Vagues de préparation', de: 'Kommissionierwellen', es: 'Oleadas de preparación' },
  'Active waves': { fr: 'Vagues actives', de: 'Aktive Kommissionierwellen', es: 'Oleadas activas' },
  'No waves': { fr: 'Aucune vague', de: 'Keine Kommissionierwellen', es: 'Sin oleadas' },
  'Select a wave': { fr: 'Sélectionner une vague', de: 'Kommissionierwelle auswählen', es: 'Seleccionar una oleada' },
  'Wave detail': { fr: 'Détail de la vague', de: 'Details der Kommissionierwelle', es: 'Detalle de la oleada' },
  'Wave release': { fr: 'Lancement de la vague', de: 'Freigabe der Kommissionierwelle', es: 'Liberación de la oleada' },
  'Waves API': { fr: 'API des vagues', de: 'Kommissionierwellen-API', es: 'API de oleadas' },
  'Unreleased waves': { fr: 'Vagues non libérées', de: 'Nicht freigegebene Kommissionierwellen', es: 'Oleadas no liberadas' },
  'Release pick wave': { fr: 'Libérer la vague de préparation', de: 'Kommissionierwelle freigeben', es: 'Liberar oleada de preparación' },
  'Ship shipment': { fr: "Expédier l'envoi", de: 'Sendung versenden', es: 'Enviar el envío' },
};

export function pickLanguage<T>(language: Language, copy: BaseTranslations<T>): T {
  if (language === 'cs' || language === 'en' || language === 'ua') return copy[language];
  return translateTree(copy.en, language);
}

export function translateEnglish(language: Language, english: string): string {
  if (language !== 'fr' && language !== 'de' && language !== 'es') return english;
  return manualOverrides[english]?.[language] ?? generatedCatalog[english]?.[language] ?? english;
}

export function languageLocale(language: Language): string {
  return languageLocales[language];
}

function translateTree<T>(value: T, language: AddedLanguage): T {
  if (typeof value === 'string') return translateEnglish(language, value) as T;
  if (value === null || typeof value !== 'object') return value;

  const cachedByLanguage = translatedTreeCache.get(value);
  const cached = cachedByLanguage?.get(language);
  if (cached) return cached as T;

  const translated = (Array.isArray(value)
    ? value.map((item) => translateTree(item, language))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translateTree(item, language)]))) as T;
  const nextCache = cachedByLanguage ?? new Map<AddedLanguage, unknown>();
  nextCache.set(language, translated);
  if (!cachedByLanguage) translatedTreeCache.set(value, nextCache);
  return translated;
}
