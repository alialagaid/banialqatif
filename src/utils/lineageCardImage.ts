import type { FamilyPerson } from '../types/database';
import { createPeopleMap, fetchAncestorsPathFromSupabase, type AncestorPathNode } from './kinship';

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawScallopedMedallion(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  teeth: number
) {
  const total = teeth * 2;
  ctx.beginPath();
  for (let i = 0; i < total; i++) {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function wrapArabicLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface LineageCardResult {
  fileName: string;
  chainText: string;
  blob: Blob;
}

export async function generateLineageCardBlob(
  person: FamilyPerson,
  people: FamilyPerson[],
  displayNickname?: string | null
): Promise<LineageCardResult> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // متابعة التوليد بالخطوط المتاحة
    }
  }

  const peopleMap = createPeopleMap(people);
  const { path } = await fetchAncestorsPathFromSupabase(person.id, peopleMap);

  const ancestors: AncestorPathNode[] =
    path.length > 0
      ? path
      : [
          {
            id: person.id,
            full_name: person.full_name,
            nickname: displayNickname ?? person.nickname ?? null,
            generation: person.generation ?? 1,
            branch_name: person.branch_name ?? null,
          },
        ];

  const chainNames = ancestors.map((a) => a.full_name || 'غير مسمى');
  const fullChainText = chainNames.length <= 1 ? chainNames[0] : chainNames.join(' بن ');

  const width = 1080;
  const visibleChain = ancestors.slice(0, 14);
  const stepHeight = 68;
  const chainSectionHeight = Math.max(220, visibleChain.length * stepHeight + 70);
  const height = Math.max(1350, 740 + chainSectionHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر تهيئة محرك الرسم لتوليد بطاقة النسب.');
  }

  ctx.direction = 'rtl';

  // 1. الخلفية الملكية باللون الأزرق الملكي الداكن
  const bgGrad = ctx.createRadialGradient(width / 2, height * 0.42, 80, width / 2, height / 2, width * 0.95);
  bgGrad.addColorStop(0, '#1B3B82');
  bgGrad.addColorStop(0.5, '#0F2350');
  bgGrad.addColorStop(1, '#07112B');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // زخرفة هندسية ذهبية خفيفة في الخلفية
  ctx.save();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.065)';
  ctx.lineWidth = 1.2;
  for (let gx = 60; gx < width - 40; gx += 120) {
    for (let gy = 60; gy < height - 40; gy += 120) {
      ctx.beginPath();
      ctx.arc(gx, gy, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx, gy - 54);
      ctx.lineTo(gx + 54, gy);
      ctx.lineTo(gx, gy + 54);
      ctx.lineTo(gx - 54, gy);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  // 2. الإطار الملكي الذهبي المزدوج
  const goldGrad = ctx.createLinearGradient(0, 0, width, height);
  goldGrad.addColorStop(0, '#FBE89C');
  goldGrad.addColorStop(0.45, '#D4AF37');
  goldGrad.addColorStop(1, '#B5891B');

  drawRoundedRectPath(ctx, 32, 32, width - 64, height - 64, 28);
  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 6;
  ctx.stroke();

  drawRoundedRectPath(ctx, 48, 48, width - 96, height - 96, 20);
  ctx.strokeStyle = 'rgba(246, 223, 133, 0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawRoundedRectPath(ctx, 60, 60, width - 120, height - 120, 14);
  ctx.save();
  ctx.setLineDash([12, 8]);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  // ميداليات الزوايا الأربع
  const corners = [
    [60, 60],
    [width - 60, 60],
    [60, height - 60],
    [width - 60, height - 60],
  ];
  for (const [cx, cy] of corners) {
    drawScallopedMedallion(ctx, cx, cy, 22, 15, 10);
    ctx.fillStyle = goldGrad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#0F2350';
    ctx.fill();
  }

  // 3. الشعار والوسم التراثي في الأعلى
  drawRoundedRectPath(ctx, width / 2 - 260, 92, 520, 74, 37);
  ctx.fillStyle = 'rgba(15, 35, 80, 0.92)';
  ctx.fill();
  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F6DF85';
  ctx.font = '700 28px "Amiri", "IBM Plex Sans Arabic", serif';
  ctx.fillText('آل مال الله · شجرة عائلة بني قطيف', width / 2, 130);

  ctx.fillStyle = 'rgba(250, 243, 223, 0.8)';
  ctx.font = '600 20px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText('وثيقة نسب إلكترونية موثقة', width / 2, 198);

  // خط فاصل ذهبي مع ماسة وسطى
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(180, 228);
  ctx.lineTo(width / 2 - 24, 228);
  ctx.moveTo(width / 2 + 24, 228);
  ctx.lineTo(width - 180, 228);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width / 2, 218);
  ctx.lineTo(width / 2 + 12, 228);
  ctx.lineTo(width / 2, 238);
  ctx.lineTo(width / 2 - 12, 228);
  ctx.closePath();
  ctx.fillStyle = '#F6DF85';
  ctx.fill();

  // 4. بطاقة الاسم البارز للفرد
  drawRoundedRectPath(ctx, 108, 256, width - 216, 194, 22);
  const nameCardGrad = ctx.createLinearGradient(108, 256, width - 108, 450);
  nameCardGrad.addColorStop(0, 'rgba(22, 50, 110, 0.92)');
  nameCardGrad.addColorStop(1, 'rgba(11, 27, 68, 0.96)');
  ctx.fillStyle = nameCardGrad;
  ctx.fill();
  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const effectiveNickname = displayNickname || person.nickname;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 52px "Amiri", "IBM Plex Sans Arabic", serif';
  const nameLines = wrapArabicLines(ctx, person.full_name || 'غير مسمى', width - 290).slice(0, 2);
  if (nameLines.length === 1) {
    ctx.fillText(nameLines[0], width / 2, effectiveNickname ? 324 : 338);
  } else {
    ctx.font = '700 44px "Amiri", "IBM Plex Sans Arabic", serif';
    ctx.fillText(nameLines[0], width / 2, 306);
    ctx.fillText(nameLines[1], width / 2, 358);
  }

  const tribeOrBranch = person.tribe_title || person.branch_name;
  const metaParts = [
    effectiveNickname ? effectiveNickname : null,
    person.generation ? `الجيل ${person.generation}` : null,
    tribeOrBranch ? tribeOrBranch : null,
  ].filter(Boolean);

  ctx.fillStyle = '#F6DF85';
  ctx.font = '600 24px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText(metaParts.join('  ·  ') || 'سجل عائلة بني قطيف', width / 2, 412);

  // 5. عنوان عمود النسب
  ctx.fillStyle = '#F6DF85';
  ctx.font = '700 28px "Amiri", "IBM Plex Sans Arabic", serif';
  ctx.fillText('سلسلة الآباء المتصلة حتى الجد المؤسس', width / 2, 496);

  // 6. رسم خط عمود النسب المتصل صعوداً نحو الجد المؤسس
  const chainStartY = 556;
  const lineCenterX = width / 2;
  const lastStepY = chainStartY + (visibleChain.length - 1) * stepHeight;

  if (visibleChain.length > 1) {
    const trunkGrad = ctx.createLinearGradient(lineCenterX, chainStartY, lineCenterX, lastStepY);
    trunkGrad.addColorStop(0, '#FFF0A8');
    trunkGrad.addColorStop(0.5, '#D4AF37');
    trunkGrad.addColorStop(1, '#F6DF85');
    ctx.strokeStyle = trunkGrad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(lineCenterX, chainStartY);
    ctx.lineTo(lineCenterX, lastStepY);
    ctx.stroke();
  }

  visibleChain.forEach((step, idx) => {
    const y = chainStartY + idx * stepHeight;
    const isSelf = idx === 0;
    const isFounder = idx === visibleChain.length - 1;

    // صندوق الصف
    drawRoundedRectPath(ctx, 138, y - 24, width - 276, 48, 24);
    if (isSelf || isFounder) {
      ctx.fillStyle = isFounder ? 'rgba(212, 175, 55, 0.22)' : 'rgba(246, 223, 133, 0.14)';
      ctx.fill();
      ctx.strokeStyle = isFounder ? '#F6DF85' : 'rgba(212, 175, 55, 0.75)';
      ctx.lineWidth = isFounder ? 2 : 1.4;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(11, 25, 62, 0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // عقدة ذهبية صغيرة
    ctx.beginPath();
    ctx.arc(width - 170, y, isFounder || isSelf ? 9 : 6.5, 0, Math.PI * 2);
    ctx.fillStyle = isFounder ? '#FFF0A8' : '#D4AF37';
    ctx.fill();
    ctx.strokeStyle = '#091636';
    ctx.lineWidth = 2;
    ctx.stroke();

    // الاسم
    ctx.textAlign = 'right';
    ctx.fillStyle = isFounder ? '#FBE89C' : '#FFFFFF';
    ctx.font =
      isSelf || isFounder
        ? '700 23px "IBM Plex Sans Arabic", sans-serif'
        : '500 21px "IBM Plex Sans Arabic", sans-serif';
    const labelText = isFounder && visibleChain.length > 1 ? `${step.full_name} (الجد المؤسس)` : step.full_name;
    ctx.fillText(labelText, width - 196, y + 1);

    // رقم الجيل على اليسار
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(246, 223, 133, 0.85)';
    ctx.font = '600 18px "IBM Plex Mono", "IBM Plex Sans Arabic", monospace';
    ctx.fillText(step.generation ? `الجيل ${step.generation}` : `#${idx + 1}`, 168, y + 1);
  });

  // 7. النص الكامل لسلسلة النسب في الأسفل
  const footerBoxY = lastStepY + 62;
  drawRoundedRectPath(ctx, 108, footerBoxY, width - 216, 136, 18);
  ctx.fillStyle = 'rgba(8, 20, 50, 0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#D4AF37';
  ctx.font = '600 18px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText('سلسلة النسب المتصلة', width / 2, footerBoxY + 32);

  ctx.fillStyle = '#FAF3DF';
  ctx.font = '600 22px "Amiri", "IBM Plex Sans Arabic", serif';
  const summaryLines = wrapArabicLines(ctx, fullChainText, width - 270).slice(0, 2);
  if (summaryLines.length === 1) {
    ctx.fillText(summaryLines[0], width / 2, footerBoxY + 80);
  } else if (summaryLines.length >= 2) {
    ctx.fillText(summaryLines[0], width / 2, footerBoxY + 68);
    ctx.fillText(summaryLines[1], width / 2, footerBoxY + 104);
  }

  // التذييل الختامي
  ctx.fillStyle = 'rgba(246, 223, 133, 0.82)';
  ctx.font = '500 18px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText('شجرة عائلة بني قطيف · الأرشيف النسبي الرقمي', width / 2, height - 88);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('تعذر تحويل بطاقة النسب إلى صورة PNG.'));
      },
      'image/png',
      1
    );
  });

  const safeSlug = (person.full_name || 'عضو')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]/g, '');

  return {
    fileName: `بطاقة-نسب-${safeSlug || 'بني-قطيف'}.png`,
    chainText: fullChainText,
    blob,
  };
}

export async function downloadLineageShareCard(
  person: FamilyPerson,
  people: FamilyPerson[],
  displayNickname?: string | null
): Promise<LineageCardResult> {
  const result = await generateLineageCardBlob(person, people, displayNickname);
  const url = URL.createObjectURL(result.blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  return result;
}
