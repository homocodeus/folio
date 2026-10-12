import { CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { CV, SectionId, initials } from './model';
import { resumeLabels, resumeSectionTitle } from './resume-language';

export default function Preview({ cv, miniature = false }: { cv: CV; miniature?: boolean }) {
  const article = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const design = cv.design;
  useLayoutEffect(() => {
    if (!article.current || !design) return;
    const observer = new ResizeObserver(entries => setScale(entries[0].borderBoxSize[0].inlineSize / (design.paper === 'LETTER' ? 612 : 595.28)));
    observer.observe(article.current);
    return () => observer.disconnect();
  }, [design?.paper, !!design]);
  function sectionProps(id: string) {
    const position = design?.sections.findIndex(section => section.id === id) ?? -1;
    return { style: { order: position }, hidden: design?.sections[position]?.visible === false, 'data-section': id };
  }
  function sectionTitle(id: SectionId, _fallback: string) { return resumeSectionTitle(cv, id); }
  return <article lang={cv.language ?? 'en'} ref={article} data-photo={design?.showPhoto} data-contact={design?.showContact} data-shape={design?.photoShape} className={`resume ${cv.template} ${miniature ? 'miniature' : ''} ${design ? 'customized' : ''}`} style={{ '--accent': cv.accent, '--accent-soft': `${cv.accent}12`, ...(design ? { '--design-body': `${design.bodySize * scale}px`, '--design-name': `${design.nameSize * scale}px`, '--design-margin': `${design.margin * scale}px`, '--design-gap': `${design.sectionGap * scale}px`, '--design-leading': design.lineHeight, '--design-color': design.bodyColor, fontFamily: design.font === 'serif' ? '"Noto Serif", serif' : '"Noto Sans", sans-serif', minHeight: `${(design.paper === 'LETTER' ? 792 : 841.89) * scale}px` } : {}) } as CSSProperties} aria-label={`${cv.title} preview`}>
    <header className="resume-header">{cv.template === 'monogram' && !cv.photo && <span className="resume-monogram" aria-hidden="true">{initials(cv.name)}</span>}<div>{cv.template === 'studio' && <span className="resume-kicker">{resumeLabels(cv).title.toLocaleUpperCase(cv.language ?? 'en')}</span>}<h1>{cv.name || resumeLabels(cv).placeholder}</h1><p>{cv.headline || resumeLabels(cv).headline}</p></div>{cv.photo && <img src={cv.photo} alt="CV portrait"/>}</header>
    <div className="resume-contact">{[cv.email, cv.phone, cv.location, cv.website].filter(Boolean).join('  ·  ') || resumeLabels(cv).contact}</div>
    <div className="resume-content">
      {cv.summary && <section {...sectionProps('profile')}><h2>{sectionTitle('profile', 'Profile')}</h2><p>{cv.summary}</p></section>}
      {!!cv.experience.length && <section {...sectionProps('experience')}><h2>{sectionTitle('experience', 'Experience')}</h2>{cv.experience.map(item => <div className="resume-entry" key={item.id}><h3>{item.role}</h3><div className="resume-meta">{item.company}<span>{item.period}</span></div><ul>{item.details.split('\n').filter(Boolean).map((line, index) => <li key={index}>{line}</li>)}</ul></div>)}</section>}
      {!!cv.education.length && <section {...sectionProps('education')}><h2>{sectionTitle('education', 'Education')}</h2>{cv.education.map(item => <div className="resume-entry" key={item.id}><h3>{item.degree}</h3><div className="resume-meta">{item.school}<span>{item.period}</span></div></div>)}</section>}
      {!!cv.skills.length && <section {...sectionProps('skills')}><h2>{sectionTitle('skills', 'Expertise')}</h2><div className="resume-skills">{cv.skills.map((skill, index) => <span key={index}>{skill}</span>)}</div></section>}
      {cv.languages && <section {...sectionProps('languages')}><h2>{sectionTitle('languages', 'Languages')}</h2><p className="multiline">{cv.languages}</p></section>}
      {!cv.summary && !cv.experience.length && !miniature && <div className="resume-empty">{resumeLabels(cv).emptyTitle}<br/>{resumeLabels(cv).emptyHint}</div>}
    </div>
  </article>;
}
