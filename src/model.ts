export type Template = 'editorial' | 'modern' | 'classic' | 'executive' | 'studio' | 'nordic' | 'timeline' | 'monogram';
import { resumeLanguages, ResumeLanguage } from './resume-language';
export interface Experience { id: string; role: string; company: string; period: string; details: string }
export interface Education { id: string; degree: string; school: string; period: string }
export type SectionId = 'profile' | 'experience' | 'education' | 'skills' | 'languages';
export interface DesignSection { id: SectionId; title: string; visible: boolean }
export interface TemplateDesign {
  version: 1; font: 'sans' | 'serif'; bodySize: number; nameSize: number; margin: number;
  sectionGap: number; lineHeight: number; bodyColor: string; paper: 'A4' | 'LETTER';
  showPhoto: boolean; showContact: boolean; photoShape: 'template' | 'square' | 'circle';
  sections: DesignSection[];
}
export interface SavedTemplate {
  id: string; name: string; template: Template; accent: string; design: TemplateDesign; updatedAt: string;
}
export interface InterviewTurn { question: string; answer: string; reply?: string; assistant?: string; createdAt?: string }
export interface InterviewState { step: number; draft: string; history: InterviewTurn[] }
export interface CV {
  id: string; title: string; updatedAt: string; template: Template; accent: string;
  name: string; headline: string; email: string; phone: string; location: string; website: string;
  summary: string; skills: string[]; languages: string; experience: Experience[]; education: Education[]; photo: string;
  design?: TemplateDesign;
  interview?: InterviewState;
  language?: ResumeLanguage;
}
export interface Provider { baseUrl: string; textModel: string; imageModel: string; speechModel: string }
export interface Connection { id: string; name: string; protocol: 'mcp' | 'acp'; command: string; args: string[]; providerId?: string; serverUrl?: string; modelId?: string }
export interface Settings { provider: Provider; connections: Connection[] }
export const defaultSettings: Settings = { provider: { baseUrl: '', textModel: '', imageModel: '', speechModel: '' }, connections: [] };
export const templates: { id: Template; name: string; label: string; accent: string; category: string }[] = [
  { id: 'editorial', name: 'Editorial', label: 'A little personality. All professional.', accent: '#285b49', category: 'Refined' },
  { id: 'modern', name: 'Modern', label: 'Confident color. A clear hierarchy.', accent: '#234d70', category: 'Contemporary' },
  { id: 'classic', name: 'Classic', label: 'Timeless, clean, and understated.', accent: '#333333', category: 'Traditional' },
  { id: 'executive', name: 'Executive', label: 'A bold edge for your next leadership move.', accent: '#263b59', category: 'Leadership' },
  { id: 'studio', name: 'Studio', label: 'Expressive type. A soft splash of color.', accent: '#804c76', category: 'Creative' },
  { id: 'nordic', name: 'Nordic', label: 'Quiet confidence, with room to breathe.', accent: '#526b68', category: 'Minimal' },
  { id: 'timeline', name: 'Timeline', label: 'Connect the moments that shaped your career.', accent: '#aa593c', category: 'Career story' },
  { id: 'monogram', name: 'Monogram', label: 'A signature introduction, unmistakably you.', accent: '#6454a1', category: 'Personal brand' },
];
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? [parts[0], ...(parts.length > 1 ? [parts[parts.length - 1]] : [])].map(part => Array.from(part)[0]).join('').toLocaleUpperCase() : 'CV';
}
export function defaultDesign(template: Template = 'editorial'): TemplateDesign {
  return {
    version: 1, font: 'sans', bodySize: 9, nameSize: template === 'studio' ? 32 : template === 'nordic' ? 24 : template === 'classic' ? 27 : 29,
    margin: 42, sectionGap: template === 'nordic' ? 24 : 16, lineHeight: 1.5, bodyColor: '#465246', paper: 'A4',
    showPhoto: true, showContact: true, photoShape: 'template',
    sections: [{ id: 'profile', title: 'Profile', visible: true }, { id: 'experience', title: 'Experience', visible: true }, { id: 'education', title: 'Education', visible: true }, { id: 'skills', title: 'Expertise', visible: true }, { id: 'languages', title: 'Languages', visible: true }],
  };
}
export function validateDesign(value: unknown): TemplateDesign {
  if (!value || typeof value !== 'object') throw new Error('Invalid template design.');
  const design = value as TemplateDesign;
  if (design.version !== 1 || !['sans', 'serif'].includes(design.font) || !['A4', 'LETTER'].includes(design.paper) || !['template', 'square', 'circle'].includes(design.photoShape)) throw new Error('Unsupported template design.');
  for (const [key, minimum, maximum] of [['bodySize', 8, 13], ['nameSize', 22, 38], ['margin', 28, 60], ['sectionGap', 10, 28], ['lineHeight', 1.3, 1.9]] as const) {
    if (typeof design[key] !== 'number' || !Number.isFinite(design[key]) || design[key] < minimum || design[key] > maximum) throw new Error(`Invalid template ${key}.`);
  }
  if (typeof design.showPhoto !== 'boolean' || typeof design.showContact !== 'boolean' || !/^#[0-9a-f]{6}$/i.test(design.bodyColor)) throw new Error('Invalid template appearance.');
  const ids = defaultDesign().sections.map(section => section.id);
  if (!Array.isArray(design.sections) || design.sections.length !== ids.length || new Set(design.sections.map(section => section?.id)).size !== ids.length || !design.sections.every(section => section && ids.includes(section.id) && typeof section.title === 'string' && section.title.trim().length > 0 && section.title.length <= 40 && typeof section.visible === 'boolean')) throw new Error('Invalid template sections.');
  return design;
}
export function validateSavedTemplate(value: unknown): SavedTemplate {
  if (!value || typeof value !== 'object') throw new Error('This file does not contain a template.');
  const preset = value as SavedTemplate;
  if (typeof preset.id !== 'string' || !preset.id || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 80 || typeof preset.updatedAt !== 'string' || !Number.isFinite(Date.parse(preset.updatedAt)) || !templates.some(template => template.id === preset.template) || !/^#[0-9a-f]{6}$/i.test(preset.accent)) throw new Error('Invalid saved template.');
  validateDesign(preset.design);
  return { id: preset.id, name: preset.name, template: preset.template, accent: preset.accent, design: structuredClone(preset.design), updatedAt: preset.updatedAt };
}
export function createSavedTemplate(cv: CV, name = 'My custom template'): SavedTemplate {
  return { id: crypto.randomUUID(), name, template: cv.template, accent: cv.accent, design: structuredClone(cv.design ?? defaultDesign(cv.template)), updatedAt: new Date().toISOString() };
}
export function applySavedTemplate(cv: CV, preset: SavedTemplate): CV {
  const valid = validateSavedTemplate(preset);
  return { ...cv, template: valid.template, accent: valid.accent, design: structuredClone(valid.design) };
}
export function newCV(): CV {
  return { id: crypto.randomUUID(), title: 'Untitled CV', updatedAt: new Date().toISOString(), template: 'editorial', accent: '#285b49', name: '', headline: '', email: '', phone: '', location: '', website: '', summary: '', skills: [], languages: '', experience: [], education: [], photo: '' };
}
export function sampleCV(): CV {
  return { ...newCV(), title: 'Product designer', name: 'Alex Morgan', headline: 'Senior Product Designer', email: 'alex@example.com', phone: '+49 151 2345 6789', location: 'Berlin, Germany', website: 'alexmorgan.design', summary: 'Thoughtful design, meaningful outcomes. Product designer with 6 years of experience turning complex problems into simple, inclusive digital experiences. I bring teams together around the needs of the people we design for.', skills: ['Product strategy', 'UX research', 'Interaction design', 'Figma', 'Design systems', 'Prototyping'], languages: 'English · Native\nGerman · Professional', experience: [ { id: crypto.randomUUID(), role: 'Senior Product Designer', company: 'Studio North', period: '2022 — Present', details: 'Led the end-to-end design of a platform used by 40,000 customers.\nBuilt a shared design system across three product teams.\nImproved onboarding completion by 28% through research and testing.' }, { id: crypto.randomUUID(), role: 'Product Designer', company: 'Forma Digital', period: '2019 — 2022', details: 'Designed thoughtful web and mobile experiences for early-stage companies.\nPartnered with engineering to bring accessible interfaces to life.' } ], education: [{ id: crypto.randomUUID(), degree: 'BA, Communication Design', school: 'Berlin University of the Arts', period: '2015 — 2019' }] };
}
export function completeness(cv: CV): number {
  const checks = [cv.name, cv.headline, cv.email, cv.summary, cv.experience.length, cv.education.length, cv.skills.length];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}
export function validateCV(value: unknown): CV {
  if (!value || typeof value !== 'object') throw new Error('This file does not contain a CV.');
  const cv = value as CV;
  for (const key of ['id', 'title', 'updatedAt', 'accent', 'name', 'headline', 'email', 'phone', 'location', 'website', 'summary', 'languages', 'photo'] as const) {
    if (typeof cv[key] !== 'string') throw new Error(`Invalid CV field: ${key}`);
  }
  if (!templates.some(template => template.id === cv.template) || !/^#[0-9a-f]{6}$/i.test(cv.accent)) throw new Error('Invalid CV design.');
  if (cv.photo && !/^data:image\/(png|jpeg|webp);base64,/.test(cv.photo)) throw new Error('Invalid portrait format.');
  if (!Array.isArray(cv.skills) || !cv.skills.every(skill => typeof skill === 'string')) throw new Error('Invalid skills.');
  if (!Array.isArray(cv.experience) || !cv.experience.every(item => item && ['id', 'role', 'company', 'period', 'details'].every(key => typeof item[key as keyof Experience] === 'string'))) throw new Error('Invalid experience.');
  if (!Array.isArray(cv.education) || !cv.education.every(item => item && ['id', 'degree', 'school', 'period'].every(key => typeof item[key as keyof Education] === 'string'))) throw new Error('Invalid education.');
  if (cv.design !== undefined) validateDesign(cv.design);
  if (cv.language !== undefined && !resumeLanguages.some(language => language.id === cv.language)) throw new Error('Unsupported resume language.');
  if (cv.interview !== undefined) {
    const state = cv.interview;
    if (!state || !Number.isInteger(state.step) || state.step < 0 || state.step > interviewQuestions.length || typeof state.draft !== 'string' || !Array.isArray(state.history) || !state.history.every(turn => turn && typeof turn.question === 'string' && typeof turn.answer === 'string' && ['reply', 'assistant', 'createdAt'].every(key => turn[key as keyof InterviewTurn] === undefined || typeof turn[key as keyof InterviewTurn] === 'string'))) throw new Error('Invalid interview history.');
  }
  return cv;
}
export const interviewQuestions = [
  { key: 'name', question: 'Let’s start with you. What is your full name?' },
  { key: 'headline', question: 'What role are you pursuing? For example, senior product designer.' },
  { key: 'email', question: 'What email address should employers use to reach you?' },
  { key: 'location', question: 'Where are you based?' },
  { key: 'summary', question: 'Tell me about your background, strengths, and what you want to do next.' },
  { key: 'experience', question: 'Tell me about your work experience: roles, companies, dates, and achievements.' },
  { key: 'education', question: 'What did you study? Include the school, qualification, and dates.' },
  { key: 'skills', question: 'What are your strongest skills? Separate them with commas.' },
] as const;
export function applyAnswer(cv: CV, index: number, answer: string): CV {
  const text = answer.trim();
  if (!text) return cv;
  const key = interviewQuestions[index]?.key;
  if (!key) return cv;
  if (key === 'skills') return { ...cv, skills: text.split(/[,;\n]/).map(skill => skill.trim()).filter(Boolean) };
  if (key === 'experience') return { ...cv, experience: [...cv.experience, { id: crypto.randomUUID(), role: 'Experience — review details', company: '', period: '', details: text }] };
  if (key === 'education') return { ...cv, education: [...cv.education, { id: crypto.randomUUID(), degree: text, school: '', period: '' }] };
  return { ...cv, [key]: text };
}

export type ProfileDraft = Pick<CV, 'summary' | 'experience' | 'education' | 'skills'>;
export function parseProfileDraft(text: string): ProfileDraft {
  const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
  if (!value || typeof value !== 'object' || !Array.isArray(value.experience) || !Array.isArray(value.education)) throw new Error('The AI returned an invalid draft. Your CV has not changed.');
  const draft = {
    summary: value.summary,
    skills: value.skills,
    experience: value.experience.map((entry: unknown) => ({ ...(entry as Record<string, unknown>), id: crypto.randomUUID() })),
    education: value.education.map((entry: unknown) => ({ ...(entry as Record<string, unknown>), id: crypto.randomUUID() })),
  };
  validateCV({ ...newCV(), ...draft });
  return draft;
}
