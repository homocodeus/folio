import { describe, expect, it } from 'vitest';
import { applyAnswer, completeness, newCV, parseProfileDraft, sampleCV, validateCV } from './model';

describe('CV documents', () => {
  it('creates independent blank documents and validates a complete example', () => {
    const first = newCV(); const second = newCV();
    expect(first.id).not.toBe(second.id);
    expect(completeness(first)).toBe(0);
    expect(completeness(sampleCV())).toBe(100);
    expect(validateCV(sampleCV()).name).toBe('Alex Morgan');
  });
  it('rejects malformed backups, executable image URLs, and unsupported templates', () => {
    expect(() => validateCV(null)).toThrow();
    expect(() => validateCV({ ...newCV(), experience: [{}] })).toThrow('experience');
    expect(() => validateCV({ ...newCV(), skills: 'SQL' })).toThrow('skills');
    expect(() => validateCV({ ...newCV(), photo: 'javascript:alert(1)' })).toThrow('portrait');
    expect(() => validateCV({ ...newCV(), template: 'unknown' })).toThrow('design');
    expect(() => validateCV({ ...newCV(), accent: 'url(https://example.com)' })).toThrow('design');
  });
  it('preserves existing entries and stores interview answers without inventing facts', () => {
    const cv = sampleCV();
    const result = applyAnswer(cv, 5, '  Built an internal dashboard at Acme.  ');
    expect(result.experience).toHaveLength(3);
    expect(result.experience[2].company).toBe('');
    expect(result.experience[2].details).toBe('Built an internal dashboard at Acme.');
    expect(cv.experience).toHaveLength(2);
    expect(applyAnswer(cv, 0, '  ')).toBe(cv);
    expect(applyAnswer(cv, 50, 'Test')).toBe(cv);
  });
  it('normalizes skills and keeps unrelated fields intact', () => {
    const cv = newCV();
    const result = applyAnswer(cv, 7, ' Rust, TypeScript; SQL\n Design, ');
    expect(result.skills).toEqual(['Rust', 'TypeScript', 'SQL', 'Design']);
    expect(result.id).toBe(cv.id);
    expect(applyAnswer(cv, 0, ' Alex Morgan ').name).toBe('Alex Morgan');
  });
  it('validates AI drafts and ignores identity and design changes from the model', () => {
    const source = { ...sampleCV(), id: 'untrusted', name: 'Changed by model', photo: 'https://example.com/photo.jpg' };
    const draft = parseProfileDraft(`\`\`\`json\n${JSON.stringify(source)}\n\`\`\``);
    expect(Object.keys(draft).sort()).toEqual(['education', 'experience', 'skills', 'summary']);
    expect(draft.experience[0].id).not.toBe(source.experience[0].id);
    expect(() => parseProfileDraft('{"summary":42,"experience":[],"education":[],"skills":[]}')).toThrow();
    expect(() => parseProfileDraft('Not JSON')).toThrow();
  });
});
