import PDFDocument from 'pdfkit';
import { create } from 'fontkit';
import regular from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import bold from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url';
import extendedRegular from '@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url';
import extendedBold from '@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff?url';
import serifRegular from '@fontsource/noto-serif/files/noto-serif-latin-400-normal.woff?url';
import serifBold from '@fontsource/noto-serif/files/noto-serif-latin-700-normal.woff?url';
import serifExtended from '@fontsource/noto-serif/files/noto-serif-latin-ext-400-normal.woff?url';
import serifExtendedBold from '@fontsource/noto-serif/files/noto-serif-latin-ext-700-normal.woff?url';
import { CV, defaultDesign, initials } from './model';
import { resumeLabels, resumeSectionTitle } from './resume-language';

async function loadFont(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('A bundled PDF font could not be loaded.');
  return new Uint8Array(await response.arrayBuffer());
}

async function portraitJPEG(photo: string): Promise<string> {
  if (!photo) return '';
  const portrait = new Image();
  portrait.src = photo;
  await portrait.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 700;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const ratio = Math.max(canvas.width / portrait.width, canvas.height / portrait.height);
  context.drawImage(portrait, (canvas.width - portrait.width * ratio) / 2, (canvas.height - portrait.height * ratio) / 2, portrait.width * ratio, portrait.height * ratio);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function renderPDF(cv: CV): Promise<Blob> {
  const design = cv.design;
  const serif = design?.font === 'serif';
  const margin = design?.margin ?? 42;
  const bodySize = design?.bodySize ?? 9;
  const [regularBytes, boldBytes, extendedBytes, extendedBoldBytes, photo] = await Promise.all([
    loadFont(serif ? serifRegular : regular), loadFont(serif ? serifBold : bold), loadFont(serif ? serifExtended : extendedRegular), loadFont(serif ? serifExtendedBold : extendedBold), portraitJPEG(design?.showPhoto === false ? '' : cv.photo),
  ]);
  const latin = create(regularBytes);
  const extended = create(extendedBytes);
  const bodyX = margin + (cv.template === 'timeline' ? 18 : 0);
  const doc = new PDFDocument({ size: design?.paper ?? 'A4', margins: { top: margin, bottom: margin + 6, left: bodyX, right: margin }, font: '', bufferPages: true, info: { Title: cv.title, Author: cv.name, Creator: 'Folio' } });
  doc.registerFont('Noto', regularBytes);
  doc.registerFont('NotoBold', boldBytes);
  doc.registerFont('NotoExtended', extendedBytes);
  doc.registerFont('NotoExtendedBold', extendedBoldBytes);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let streamError: Error | null = null;
  doc.on('data', (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk)));
  doc.on('error', (error: Error) => { streamError = error; });
  const width = doc.page.width - margin * 2;
  const bodyWidth = doc.page.width - bodyX - margin;
  const modern = cv.template === 'modern';
  const classic = cv.template === 'classic';
  const executive = cv.template === 'executive';
  const studio = cv.template === 'studio';
  const nordic = cv.template === 'nordic';
  const timeline = cv.template === 'timeline';
  const monogram = cv.template === 'monogram';

  function pageDecoration(continuation: boolean) {
    doc.save();
    if (executive) doc.rect(0, 0, 9, doc.page.height).fill(cv.accent);
    if (timeline && continuation) doc.moveTo(margin + 4, margin).lineTo(margin + 4, doc.page.height - margin - 6).lineWidth(0.6).strokeColor(cv.accent).stroke();
    doc.restore();
  }
  pageDecoration(false);
  doc.on('pageAdded', () => pageDecoration(true));

  function write(text: string, { size = bodySize, weight = false, color = design?.bodyColor ?? '#465246', x = bodyX, y = doc.y, textWidth = bodyWidth, spacing = 0, align = 'left' }: { size?: number; weight?: boolean; color?: string; x?: number; y?: number; textWidth?: number; spacing?: number; align?: 'left' | 'center' | 'right' } = {}) {
    if (!text) return;
    const runs: { font: string; text: string }[] = [];
    for (const character of text) {
      const code = character.codePointAt(0)!;
      const family = latin.hasGlyphForCodePoint(code) || character === '\n' || character === '\r' || character === '\t' ? 'Noto' : extended.hasGlyphForCodePoint(code) ? 'NotoExtended' : null;
      if (!family) throw new Error(`The PDF font does not support “${character}”. Please use Latin characters for this export.`);
      const font = `${family}${weight ? 'Bold' : ''}`;
      const last = runs.at(-1);
      if (last?.font === font) last.text += character;
      else runs.push({ font, text: character });
    }
    doc.fontSize(size).fillColor(color);
    runs.forEach((run, index) => {
      doc.font(run.font);
      const options = { width: textWidth, continued: index < runs.length - 1, lineGap: design ? Math.max(0, size * design.lineHeight - doc.currentLineHeight(true)) : size * 0.35, characterSpacing: spacing, align };
      if (index === 0) doc.text(run.text, x, y, options);
      else doc.text(run.text, options);
    });
  }

  function ensureSpace(height: number) {
    if (doc.y + height > doc.page.height - margin - 6) doc.addPage();
  }

  function heading(title: string) {
    ensureSpace(72);
    doc.y += design?.sectionGap ?? (nordic ? 24 : 16);
    if (studio) {
      doc.save().fillOpacity(0.07).roundedRect(bodyX, doc.y - 5, bodyWidth, 24, 4).fill(cv.accent).restore();
    }
    if (timeline) doc.save().circle(margin + 4, doc.y + 6, 3.5).fill(cv.accent).restore();
    if (monogram) doc.save().rect(bodyX, doc.y, 3, 13).fill(cv.accent).restore();
    const inset = studio || monogram ? 11 : 0;
    write(title, { size: nordic ? 8 : 9, weight: !nordic, color: cv.accent, spacing: nordic ? 2.8 : 1.7, x: bodyX + inset, textWidth: bodyWidth - inset });
    if (executive) doc.save().moveTo(bodyX, doc.y + 2).lineTo(bodyX + bodyWidth, doc.y + 2).lineWidth(0.5).strokeColor('#dfe4ea').stroke().restore();
    doc.y += 6;
  }

  function drawPhoto(x: number, y: number, width: number, height: number, circular = false) {
    doc.save();
    if (design?.photoShape === 'circle' || (design?.photoShape !== 'square' && circular)) doc.circle(x + width / 2, y + width / 2, width / 2).clip();
    else doc.rect(x, y, width, design?.photoShape === 'square' ? width : height).clip();
    doc.image(photo, x, y, { cover: [width, design?.photoShape === 'square' || design?.photoShape === 'circle' || circular ? width : height] }).restore();
  }
  const headerPadding = modern || studio ? 20 : 0;
  const headerWidth = width - headerPadding * 2 - (monogram ? 92 : photo && !nordic ? 90 : 0);
  const nameSize = design?.nameSize ?? (studio ? 32 : nordic ? 24 : classic ? 27 : 29);
  const nameWeight = modern || classic || executive || studio || timeline;
  const nameText = nordic ? (cv.name || resumeLabels(cv).placeholder).toLocaleUpperCase(cv.language ?? 'en') : cv.name || resumeLabels(cv).placeholder;
  const nameY = margin + 3 + headerPadding + (studio ? 25 : nordic && photo ? 88 : timeline ? 18 : 0);
  const headerX = margin + headerPadding + (monogram ? 92 : 0);
  doc.font(nameWeight ? 'NotoBold' : 'Noto').fontSize(nameSize);
  const nameHeight = doc.heightOfString(nameText, { width: headerWidth, lineGap: nameSize * 0.35, characterSpacing: nordic ? 2.8 : 0 });
  doc.font('Noto').fontSize(11);
  const subtitleHeight = cv.headline ? doc.heightOfString(cv.headline, { width: headerWidth, lineGap: 3.85 }) : 0;
  const panelHeight = Math.max(120, nameY - margin + nameHeight + subtitleHeight + 30);
  if (modern) doc.rect(margin, margin, width, panelHeight).fill(cv.accent);
  if (studio) {
    doc.save().fillOpacity(0.07).roundedRect(margin, margin, width, panelHeight, 18).fill(cv.accent).restore();
    write(resumeLabels(cv).title.toLocaleUpperCase(cv.language ?? 'en'), { size: 7, color: cv.accent, spacing: 2, x: headerX, y: margin + 18, textWidth: headerWidth });
  }
  if (timeline) doc.rect(margin, margin, width, 4).fill(cv.accent);
  if (monogram) {
    if (photo) drawPhoto(margin, margin + 4, 68, 68, true);
    else {
      doc.circle(margin + 34, margin + 38, 34).fill(cv.accent);
      write(initials(cv.name), { size: 22, weight: true, color: '#ffffff', x: margin, y: margin + 21, textWidth: 68, align: 'center' });
    }
  }
  if (nordic && photo) drawPhoto(doc.page.width / 2 - 35, margin, 70, 70, true);
  write(nameText, { size: nameSize, weight: nameWeight, color: modern ? '#ffffff' : executive ? '#263342' : cv.accent, x: headerX, y: nameY, textWidth: headerWidth, align: nordic ? 'center' : 'left', spacing: nordic ? 2.8 : 0 });
  doc.y += 5;
  write(cv.headline, { size: 11, color: modern ? '#ffffff' : '#647461', x: headerX, textWidth: headerWidth, align: nordic ? 'center' : 'left' });
  const headerEnd = Math.max(doc.y + 18, modern || studio ? margin + panelHeight : photo && !monogram && !nordic ? margin + 86 : margin + 70);
  if (photo && !monogram && !nordic) drawPhoto(margin + width - headerPadding - 70, margin + 5 + headerPadding + (studio ? 12 : timeline ? 18 : 0), 70, 82);
  if (!modern && !studio && !timeline && !monogram) doc.moveTo(margin, headerEnd).lineTo(margin + width, headerEnd).lineWidth(executive ? 3 : classic ? 2 : 0.7).strokeColor(nordic ? '#dfe5e1' : cv.accent).stroke();
  doc.y = headerEnd + 13;
  if (design?.showContact !== false) write([cv.email, cv.phone, cv.location, cv.website].filter(Boolean).join('  ·  '), { size: 8, color: '#74806d', x: margin, textWidth: width, align: nordic ? 'center' : 'left' });
  if (monogram || nordic) {
    doc.y += 10;
    doc.moveTo(margin, doc.y).lineTo(margin + width, doc.y).lineWidth(0.7).strokeColor(nordic ? '#dfe5e1' : cv.accent).stroke();
  }
  if (timeline) doc.save().moveTo(margin + 4, doc.y + 18).lineTo(margin + 4, doc.page.height - margin - 6).lineWidth(0.6).strokeColor(cv.accent).stroke().restore();

  for (const section of (design ?? defaultDesign(cv.template)).sections) {
    if (!section.visible) continue;
    const title = resumeSectionTitle(cv, section.id).toLocaleUpperCase(cv.language ?? 'en');
    if (section.id === 'profile' && cv.summary) { heading(title); write(cv.summary); }
    if (section.id === 'experience' && cv.experience.length) {
      heading(title);
      for (const entry of cv.experience) {
        ensureSpace(62);
        write(entry.role, { size: bodySize + 2, weight: true });
        write([entry.company, entry.period].filter(Boolean).join('  |  '), { size: bodySize - 1 });
        doc.y += 5;
        for (const detail of entry.details.split('\n').filter(Boolean)) { ensureSpace(24); write(`•  ${detail}`); doc.y += 2; }
        doc.y += 9;
      }
    }
    if (section.id === 'education' && cv.education.length) {
      heading(title);
      for (const entry of cv.education) {
        ensureSpace(46);
        write(entry.degree, { size: bodySize + 1, weight: true });
        write([entry.school, entry.period].filter(Boolean).join('  |  '), { size: bodySize - 1 });
        doc.y += 9;
      }
    }
    if (section.id === 'skills' && cv.skills.some(skill => skill.trim())) { heading(title); write(cv.skills.filter(skill => skill.trim()).join('  ·  ')); }
    if (section.id === 'languages' && cv.languages) { heading(title); write(cv.languages); }
  }
  const pages = doc.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index += 1) {
    doc.switchToPage(index);
    doc.page.margins.bottom = 0;
    doc.font('Noto').fontSize(8).fillColor('#8c9683').text(`${index + 1} / ${pages.count}`, margin, doc.page.height - 28, { width, align: 'right', lineBreak: false });
    doc.page.margins.bottom = margin + 6;
  }
  return new Promise<Blob>((resolve, reject) => {
    doc.on('end', () => streamError ? reject(streamError) : resolve(new Blob(chunks, { type: 'application/pdf' })));
    doc.on('error', reject);
    doc.end();
  });
}
