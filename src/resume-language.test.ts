import { expect, it } from 'vitest';
import { defaultDesign, newCV, validateCV } from './model';
import { interviewPrompt } from './interview-agent';
import { resumeLanguages, resumeSectionTitle } from './resume-language';

it('localizes built-in headings while preserving custom studio headings', () => {
  const cv = { ...newCV(), language: 'de' as const, design: defaultDesign() };
  expect(resumeSectionTitle(cv, 'experience')).toBe('Berufserfahrung');
  cv.design.sections[1].title = 'Selected projects';
  expect(resumeSectionTitle(cv, 'experience')).toBe('Selected projects');
  expect(resumeSectionTitle(newCV(), 'experience')).toBe('Experience');
});
it('accepts all supported languages and rejects invalid imported preferences', () => {
  for (const language of resumeLanguages) expect(validateCV({ ...newCV(), language: language.id }).language).toBe(language.id);
  expect(() => validateCV({ ...newCV(), language: 'invalid' })).toThrow('Unsupported resume language');
});
it('requests the resume language in AI conversations without changing existing facts', () => {
  const cv = { ...newCV(), language: 'tr' as const, name: 'Burak', summary: 'Original text' };
  expect(interviewPrompt(0, [], 'Merhaba', cv)).toContain('Türkçe (tr)');
  expect(cv.summary).toBe('Original text');
});
