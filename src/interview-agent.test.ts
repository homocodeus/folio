import { expect, it } from 'vitest';
import { interviewPrompt, parseInterviewReply } from './interview-agent';
import { sampleCV } from './model';

it('keeps greetings out of CV fields and accepts explicit facts', () => {
  expect(parseInterviewReply('{"reply":"Hi! What is your name?","answer":null}').answer).toBeNull();
  expect(parseInterviewReply('```json\n{"reply":"Thanks, Burak.","answer":" Burak "}\n```').answer).toBe('Burak');
  expect(() => parseInterviewReply('{"reply":"Hello","answer":42}')).toThrow();
  expect(() => parseInterviewReply('{"reply":"","answer":"hi"}')).toThrow();
  expect(() => parseInterviewReply('No JSON')).toThrow();
});

it('sends the current question and recent conversation without CV photos', () => {
  const cv = { ...sampleCV(), photo: 'private-photo-data' };
  const prompt = interviewPrompt(0, [{ question: 'Name?', answer: 'hi', reply: 'What is your name?' }], 'my name is Burak', cv);
  expect(prompt).toContain('"currentResume":');
  expect(prompt).toContain(cv.experience[0].company);
  expect(prompt).toContain(cv.email);
  expect(prompt).not.toContain('private-photo-data');
  expect(prompt).not.toContain(cv.id);
  expect(interviewPrompt(0, [], 'Can you see my CV?', { ...cv, summary: 'Latest editor change' })).toContain('Latest editor change');
  expect(prompt).toContain('my name is Burak');
  expect(prompt).toContain('What is your name?');
  expect(prompt).toContain('"field":"name"');
  expect(prompt).toContain('Do not use tools');
});
