import type { CV, SectionId } from './model';

export const resumeLanguages = [
  { id: 'en', name: 'English', profile: 'Profile', experience: 'Experience', education: 'Education', skills: 'Expertise', languages: 'Languages', title: 'Curriculum vitae', placeholder: 'Your name', headline: "Your professional headline", contact: "Your contact details", emptyTitle: "Your next chapter starts here.", emptyHint: "Add your details to see your CV take shape." },
  { id: 'de', name: 'Deutsch', profile: 'Profil', experience: 'Berufserfahrung', education: 'Ausbildung', skills: 'Kenntnisse', languages: 'Sprachen', title: 'Lebenslauf', placeholder: 'Ihr Name', headline: "Ihre berufliche Position", contact: "Ihre Kontaktdaten", emptyTitle: "Ihr nächstes Kapitel beginnt hier.", emptyHint: "Ergänzen Sie Ihre Angaben, um Ihren Lebenslauf zu gestalten." },
  { id: 'tr', name: 'Türkçe', profile: 'Profil', experience: 'İş Deneyimi', education: 'Eğitim', skills: 'Yetkinlikler', languages: 'Diller', title: 'Özgeçmiş', placeholder: 'Adınız', headline: "Mesleki unvanınız", contact: "İletişim bilgileriniz", emptyTitle: "Yeni bölümünüz burada başlıyor.", emptyHint: "Özgeçmişinizi oluşturmak için bilgilerinizi ekleyin." },
  { id: 'fr', name: 'Français', profile: 'Profil', experience: 'Expérience professionnelle', education: 'Formation', skills: 'Compétences', languages: 'Langues', title: 'Curriculum vitae', placeholder: 'Votre nom', headline: "Votre titre professionnel", contact: "Vos coordonnées", emptyTitle: "Votre prochain chapitre commence ici.", emptyHint: "Ajoutez vos informations pour donner forme à votre CV." },
  { id: 'es', name: 'Español', profile: 'Perfil', experience: 'Experiencia laboral', education: 'Formación', skills: 'Competencias', languages: 'Idiomas', title: 'Currículum', placeholder: 'Tu nombre', headline: "Tu título profesional", contact: "Tus datos de contacto", emptyTitle: "Tu próximo capítulo empieza aquí.", emptyHint: "Añade tus datos para dar forma a tu currículum." },
  { id: 'it', name: 'Italiano', profile: 'Profilo', experience: 'Esperienza professionale', education: 'Formazione', skills: 'Competenze', languages: 'Lingue', title: 'Curriculum vitae', placeholder: 'Il tuo nome', headline: "Il tuo titolo professionale", contact: "I tuoi recapiti", emptyTitle: "Il tuo prossimo capitolo inizia qui.", emptyHint: "Aggiungi i tuoi dati per dare forma al tuo curriculum." },
  { id: 'pt', name: 'Português', profile: 'Perfil', experience: 'Experiência profissional', education: 'Formação', skills: 'Competências', languages: 'Idiomas', title: 'Currículo', placeholder: 'O seu nome', headline: "O seu título profissional", contact: "Os seus contactos", emptyTitle: "O seu próximo capítulo começa aqui.", emptyHint: "Adicione os seus dados para dar forma ao seu currículo." },
  { id: 'nl', name: 'Nederlands', profile: 'Profiel', experience: 'Werkervaring', education: 'Opleiding', skills: 'Vaardigheden', languages: 'Talen', title: 'Curriculum vitae', placeholder: 'Uw naam', headline: "Uw professionele titel", contact: "Uw contactgegevens", emptyTitle: "Uw volgende hoofdstuk begint hier.", emptyHint: "Voeg uw gegevens toe om uw cv vorm te geven." },
  { id: 'pl', name: 'Polski', profile: 'Profil', experience: 'Doświadczenie zawodowe', education: 'Wykształcenie', skills: 'Umiejętności', languages: 'Języki', title: 'Życiorys', placeholder: 'Imię i nazwisko', headline: "Twój tytuł zawodowy", contact: "Twoje dane kontaktowe", emptyTitle: "Twój kolejny rozdział zaczyna się tutaj.", emptyHint: "Dodaj swoje dane, aby stworzyć CV." },
] as const;
export type ResumeLanguage = typeof resumeLanguages[number]['id'];
export function resumeLabels(cv: Pick<CV, 'language'>) { return resumeLanguages.find(item => item.id === cv.language) ?? resumeLanguages[0]; }
export function resumeSectionTitle(cv: CV, id: SectionId): string {
  const custom = cv.design?.sections.find(section => section.id === id)?.title;
  return custom && custom !== resumeLanguages[0][id] ? custom : resumeLabels(cv)[id];
}
export function writingLanguage(cv: CV): string {
  return `Write conversational replies and generated CV text in ${resumeLabels(cv).name} (${cv.language ?? 'en'}). Preserve proper names, contact details, dates, and factual meaning. Do not translate JSON keys.`;
}
