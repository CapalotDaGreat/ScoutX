#!/usr/bin/env node
/**
 * Generates locale JSON files from English source.
 * Run: node scripts/generate-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const langs = ['de', 'fr', 'it', 'es', 'pt', 'nl'];
const namespaces = fs.readdirSync(path.join(root, 'en')).filter((f) => f.endsWith('.json'));

const translations = {
  de: {
    'Loading': 'Laden',
    'Back': 'Zurück',
    'Cancel': 'Abbrechen',
    'Save': 'Speichern',
    'Delete': 'Löschen',
    'Settings': 'Einstellungen',
    'Sign out': 'Abmelden',
    'Portfolio': 'Portfolio',
    'Career': 'Karriere',
    'Statistics': 'Statistiken',
    'Discover Players': 'Spieler entdecken',
    'Welcome to PitchProof': 'Willkommen bei PitchProof',
    'Language': 'Sprache',
    'Push notifications': 'Push-Benachrichtigungen',
    'Account': 'Konto',
    'Legal': 'Rechtliches',
    'Try again': 'Erneut versuchen',
    "You're offline": 'Du bist offline',
    'Something went wrong': 'Etwas ist schiefgelaufen',
    'English': 'Englisch',
    'German': 'Deutsch',
    'French': 'Französisch',
    'Italian': 'Italienisch',
    'Spanish': 'Spanisch',
    'Portuguese': 'Portugiesisch',
    'Dutch': 'Niederländisch',
  },
  fr: {
    'Loading': 'Chargement',
    'Back': 'Retour',
    'Cancel': 'Annuler',
    'Save': 'Enregistrer',
    'Delete': 'Supprimer',
    'Settings': 'Paramètres',
    'Sign out': 'Se déconnecter',
    'Portfolio': 'Portfolio',
    'Career': 'Carrière',
    'Statistics': 'Statistiques',
    'Discover Players': 'Découvrir des joueurs',
    'Welcome to PitchProof': 'Bienvenue sur PitchProof',
    'Language': 'Langue',
    'Push notifications': 'Notifications push',
    'Account': 'Compte',
    'Legal': 'Mentions légales',
    'Try again': 'Réessayer',
    "You're offline": 'Vous êtes hors ligne',
    'Something went wrong': 'Une erreur est survenue',
  },
  it: {
    'Loading': 'Caricamento',
    'Back': 'Indietro',
    'Cancel': 'Annulla',
    'Save': 'Salva',
    'Delete': 'Elimina',
    'Settings': 'Impostazioni',
    'Sign out': 'Esci',
    'Portfolio': 'Portfolio',
    'Career': 'Carriera',
    'Statistics': 'Statistiche',
    'Discover Players': 'Scopri giocatori',
    'Welcome to PitchProof': 'Benvenuto su PitchProof',
    'Language': 'Lingua',
    'Push notifications': 'Notifiche push',
    'Account': 'Account',
    'Legal': 'Legale',
    'Try again': 'Riprova',
    "You're offline": 'Sei offline',
    'Something went wrong': 'Qualcosa è andato storto',
  },
  es: {
    'Loading': 'Cargando',
    'Back': 'Atrás',
    'Cancel': 'Cancelar',
    'Save': 'Guardar',
    'Delete': 'Eliminar',
    'Settings': 'Ajustes',
    'Sign out': 'Cerrar sesión',
    'Portfolio': 'Portfolio',
    'Career': 'Carrera',
    'Statistics': 'Estadísticas',
    'Discover Players': 'Descubrir jugadores',
    'Welcome to PitchProof': 'Bienvenido a PitchProof',
    'Language': 'Idioma',
    'Push notifications': 'Notificaciones push',
    'Account': 'Cuenta',
    'Legal': 'Legal',
    'Try again': 'Reintentar',
    "You're offline": 'Estás sin conexión',
    'Something went wrong': 'Algo salió mal',
  },
  pt: {
    'Loading': 'A carregar',
    'Back': 'Voltar',
    'Cancel': 'Cancelar',
    'Save': 'Guardar',
    'Delete': 'Eliminar',
    'Settings': 'Definições',
    'Sign out': 'Terminar sessão',
    'Portfolio': 'Portfolio',
    'Career': 'Carreira',
    'Statistics': 'Estatísticas',
    'Discover Players': 'Descobrir jogadores',
    'Welcome to PitchProof': 'Bem-vindo ao PitchProof',
    'Language': 'Idioma',
    'Push notifications': 'Notificações push',
    'Account': 'Conta',
    'Legal': 'Legal',
    'Try again': 'Tentar novamente',
    "You're offline": 'Está offline',
    'Something went wrong': 'Algo correu mal',
  },
  nl: {
    'Loading': 'Laden',
    'Back': 'Terug',
    'Cancel': 'Annuleren',
    'Save': 'Opslaan',
    'Delete': 'Verwijderen',
    'Settings': 'Instellingen',
    'Sign out': 'Uitloggen',
    'Portfolio': 'Portfolio',
    'Career': 'Carrière',
    'Statistics': 'Statistieken',
    'Discover Players': 'Spelers ontdekken',
    'Welcome to PitchProof': 'Welkom bij PitchProof',
    'Language': 'Taal',
    'Push notifications': 'Pushmeldingen',
    'Account': 'Account',
    'Legal': 'Juridisch',
    'Try again': 'Opnieuw proberen',
    "You're offline": 'Je bent offline',
    'Something went wrong': 'Er is iets misgegaan',
  },
};

function translateValue(value, langMap) {
  if (typeof value === 'string') {
    return langMap[value] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => translateValue(item, langMap));
  }
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = translateValue(nested, langMap);
    }
    return next;
  }
  return value;
}

for (const lang of langs) {
  const langDir = path.join(root, lang);
  fs.mkdirSync(langDir, { recursive: true });
  const langMap = translations[lang];

  for (const ns of namespaces) {
    const enPath = path.join(root, 'en', ns);
    const enContent = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const translated = translateValue(enContent, langMap);
    fs.writeFileSync(path.join(langDir, ns), `${JSON.stringify(translated, null, 2)}\n`);
  }
}

console.log(`Generated ${langs.length} languages x ${namespaces.length} namespaces`);
