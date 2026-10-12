import { expect, it } from 'vitest';
import { applySavedTemplate, createSavedTemplate, defaultDesign, sampleCV, validateCV, validateDesign, validateSavedTemplate } from './model';

it('applies independent design snapshots without replacing personal content', () => {
  const cv = sampleCV();
  const preset = createSavedTemplate(cv);
  preset.design.font = 'serif';
  const result = applySavedTemplate(cv, preset);
  expect(result.name).toBe(cv.name);
  expect(result.experience).toEqual(cv.experience);
  expect(result.design?.font).toBe('serif');
  preset.design.sections[0].visible = false;
  expect(result.design?.sections[0].visible).toBe(true);
  expect(validateSavedTemplate(JSON.parse(JSON.stringify(preset)))).toEqual(preset);
  expect(preset).not.toHaveProperty('photo');
  expect(validateCV(cv)).toEqual(cv);
});

it('rejects invalid design versions, sizes and duplicate sections', () => {
  expect(() => validateDesign({ ...defaultDesign(), version: 2 })).toThrow();
  expect(() => validateDesign({ ...defaultDesign(), bodySize: 99 })).toThrow();
  expect(() => validateDesign({ ...defaultDesign(), margin: NaN })).toThrow();
  expect(() => validateDesign({ ...defaultDesign(), sections: Array(5).fill(defaultDesign().sections[0]) })).toThrow();
  expect(() => validateCV({ ...sampleCV(), design: {} })).toThrow();
});
