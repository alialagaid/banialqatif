import { supabase } from '../lib/supabase';
import type { FamilyPerson, RequestStatus, SecuritySeverity, UserRole } from '../types/database';

export interface TreeNodeData {
  person: FamilyPerson;
  children: TreeNodeData[];
  depth: number;
}

/**
 * بناء خريطة الأشخاص والبحث السريع بالمعرف
 */
export function createPeopleMap(people: FamilyPerson[] = []): Map<string, FamilyPerson> {
  const map = new Map<string, FamilyPerson>();
  if (!Array.isArray(people)) return map;
  for (const p of people) {
    if (p && typeof p.id === 'string' && p.id) {
      map.set(p.id, p);
    }
  }
  return map;
}

/**
 * بناء الهيكل الشجري انطلاقاً من الأجداد المؤسسين (الأشخاص بدون father_id موجود في القائمة)
 */
export function buildFamilyForest(people: FamilyPerson[] = []): TreeNodeData[] {
  const safePeople = Array.isArray(people)
    ? people.filter((p): p is FamilyPerson => Boolean(p && typeof p.id === 'string' && p.id))
    : [];
  const map = createPeopleMap(safePeople);
  const childrenMap = new Map<string, FamilyPerson[]>();

  for (const person of safePeople) {
    if (person.father_id && map.has(person.father_id) && person.father_id !== person.id) {
      const list = childrenMap.get(person.father_id) ?? [];
      list.push(person);
      childrenMap.set(person.father_id, list);
    }
  }

  // ترتيب الأبناء حسب سنة الميلاد ثم الاسم
  for (const [, list] of childrenMap) {
    list.sort((a, b) => {
      const yearA = Number(a.birth_year) || 9999;
      const yearB = Number(b.birth_year) || 9999;
      if (yearA !== yearB) return yearA - yearB;
      return (a.full_name || '').localeCompare(b.full_name || '', 'ar');
    });
  }

  const roots = safePeople.filter(
    (p) => !p.father_id || !map.has(p.father_id) || p.father_id === p.id
  );
  roots.sort((a, b) => {
    const genA = a.generation ?? 1;
    const genB = b.generation ?? 1;
    if (genA !== genB) return genA - genB;
    return (a.full_name || '').localeCompare(b.full_name || '', 'ar');
  });

  const visited = new Set<string>();

  function buildNode(person: FamilyPerson, depth: number): TreeNodeData {
    visited.add(person.id);
    const rawChildren = childrenMap.get(person.id) ?? [];
    const children = rawChildren
      .filter((child) => !visited.has(child.id))
      .map((child) => buildNode(child, depth + 1));
    return { person, children, depth };
  }

  return roots
    .filter((root) => !visited.has(root.id))
    .map((root) => buildNode(root, 0));
}

/**
 * استخراج سلسلة النسب المتصلة لشخص معين (فلان بن فلان بن فلان)
 */
export function buildLineageChain(
  personId: string,
  peopleMap: Map<string, FamilyPerson>
): { chainText: string; ancestors: FamilyPerson[] } {
  const ancestors: FamilyPerson[] = [];
  if (!personId || !peopleMap) return { chainText: '', ancestors };

  const visited = new Set<string>();
  let current = peopleMap.get(personId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    ancestors.push(current);
    if (!current.father_id) break;
    current = peopleMap.get(current.father_id);
  }

  const names = ancestors.map((a) => a.full_name || 'غير مسمى');
  const chainText = names.length <= 1 ? names[0] || '' : names.join(' بن ');

  return { chainText, ancestors };
}

/**
 * حساب صلة القرابة الدقيقة بين شخصين في الشجرة باللغة العربية
 */
export function computeKinshipRelation(
  personAId: string,
  personBId: string,
  peopleMap: Map<string, FamilyPerson>
): {
  title: string;
  description: string;
  commonAncestor: FamilyPerson | null;
  stepsFromA: number;
  stepsFromB: number;
} {
  const personA = peopleMap.get(personAId);
  const personB = peopleMap.get(personBId);

  if (!personA || !personB) {
    return {
      title: 'غير محدد',
      description: 'يرجى اختيار فردين صالحين من شجرة العائلة.',
      commonAncestor: null,
      stepsFromA: 0,
      stepsFromB: 0,
    };
  }

  if (personA.id === personB.id) {
    return {
      title: 'نفس الشخص',
      description: `${personA.full_name} هو الفرد نفسه.`,
      commonAncestor: personA,
      stepsFromA: 0,
      stepsFromB: 0,
    };
  }

  if (personA.spouse_id === personB.id || personB.spouse_id === personA.id) {
    const label = personA.gender === 'female' ? 'زوجها' : 'زوجته';
    return {
      title: 'علاقة زوجية',
      description: `${personB.full_name} هو ${label} حسب السجل.`,
      commonAncestor: null,
      stepsFromA: 0,
      stepsFromB: 0,
    };
  }

  const { ancestors: ancA } = buildLineageChain(personA.id, peopleMap);
  const { ancestors: ancB } = buildLineageChain(personB.id, peopleMap);

  const indexMapB = new Map<string, number>();
  ancB.forEach((anc, idx) => indexMapB.set(anc.id, idx));

  let commonAncestor: FamilyPerson | null = null;
  let stepsFromA = -1;
  let stepsFromB = -1;

  for (let i = 0; i < ancA.length; i++) {
    const matchIdx = indexMapB.get(ancA[i].id);
    if (matchIdx !== undefined) {
      commonAncestor = ancA[i];
      stepsFromA = i;
      stepsFromB = matchIdx;
      break;
    }
  }

  if (!commonAncestor) {
    return {
      title: 'صلة نسب فرعية / غير متصلة مباشرة',
      description: `لم يُعثر على جد مشترك مباشر عبر عمود الأب بين ${personA.full_name} و${personB.full_name} في السجل الحالي.`,
      commonAncestor: null,
      stepsFromA: -1,
      stepsFromB: -1,
    };
  }

  const isBFemale = personB.gender === 'female';
  let title = 'قرابة عائلية';

  if (stepsFromA === 1 && stepsFromB === 0) {
    title = isBFemale ? 'الأم' : 'الأب';
  } else if (stepsFromA === 0 && stepsFromB === 1) {
    title = isBFemale ? 'الابنة' : 'الابن';
  } else if (stepsFromA === 2 && stepsFromB === 0) {
    title = isBFemale ? 'الجدة' : 'الجد';
  } else if (stepsFromA === 0 && stepsFromB === 2) {
    title = isBFemale ? 'الحفيدة' : 'الحفيد';
  } else if (stepsFromA > 2 && stepsFromB === 0) {
    title = `الجد الأعلى (الدرجة ${stepsFromA})`;
  } else if (stepsFromA === 0 && stepsFromB > 2) {
    title = `من الذرية (الجيل +${stepsFromB})`;
  } else if (stepsFromA === 1 && stepsFromB === 1) {
    title = isBFemale ? 'الأخت' : 'الأخ';
  } else if (stepsFromA === 2 && stepsFromB === 1) {
    title = isBFemale ? 'العمة' : 'العم';
  } else if (stepsFromA === 1 && stepsFromB === 2) {
    title = isBFemale ? 'ابنة الأخ / الأخت' : 'ابن الأخ / الأخت';
  } else if (stepsFromA === 2 && stepsFromB === 2) {
    title = isBFemale ? 'ابنة العم' : 'ابن العم';
  } else if (stepsFromA === 3 && stepsFromB === 1) {
    title = isBFemale ? 'عمة الأب' : 'عم الأب';
  } else if (stepsFromA === stepsFromB) {
    title = `ابن عم من الدرجة ${stepsFromA - 1}`;
  } else {
    title = `قرابة من الجد المشترك (${stepsFromA} ↑ · ${stepsFromB} ↓)`;
  }

  return {
    title,
    description: `${personB.full_name} بالنسبة لـ ${personA.full_name}: ${title} — الجد المشترك هو ${commonAncestor.full_name}.`,
    commonAncestor,
    stepsFromA,
    stepsFromB,
  };
}

export interface AncestorPathNode {
  id: string;
  full_name: string;
  nickname?: string | null;
  generation?: number | null;
  father_id?: string | null;
  gender?: string | null;
  branch_name?: string | null;
}

export interface KinshipRadarAnalysis {
  title: string;
  description: string;
  commonAncestor: AncestorPathNode | null;
  stepsFromA: number;
  stepsFromB: number;
  totalGenerations: number;
  pathA: AncestorPathNode[];
  pathB: AncestorPathNode[];
  bridgeIds: string[];
  usedRpc: boolean;
}

export interface KinshipRadarHighlight {
  personAId: string;
  personBId: string;
  personAName: string;
  personBName: string;
  commonAncestorId: string | null;
  commonAncestorName: string | null;
  title: string;
  stepsFromA: number;
  stepsFromB: number;
  totalGenerations: number;
  pathIds: string[];
}

function normalizeAncestorRows(
  rawRows: unknown,
  personId: string,
  peopleMap: Map<string, FamilyPerson>
): AncestorPathNode[] {
  const localPerson = peopleMap.get(personId);
  if (!Array.isArray(rawRows) || rawRows.length === 0) return [];

  const parsed: AncestorPathNode[] = [];
  for (const item of rawRows) {
    if (typeof item === 'string') {
      const p = peopleMap.get(item);
      parsed.push({
        id: item,
        full_name: p?.full_name || 'غير مسمى',
        nickname: p?.nickname ?? null,
        generation: p?.generation ?? null,
        father_id: p?.father_id ?? null,
        gender: p?.gender ?? null,
        branch_name: p?.branch_name ?? null,
      });
      continue;
    }

    if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>;
      const id = String(
        row.id ?? row.person_id ?? row.ancestor_id ?? ''
      ).trim();
      if (!id) continue;
      const p = peopleMap.get(id);
      const rawGen = row.generation ?? p?.generation;
      const numGen =
        typeof rawGen === 'number'
          ? rawGen
          : typeof rawGen === 'string' && rawGen.trim() !== ''
            ? Number(rawGen)
            : null;
      parsed.push({
        id,
        full_name: String(
          row.full_name ?? row.name ?? row.ancestor_name ?? p?.full_name ?? 'غير مسمى'
        ),
        nickname: (row.nickname as string | null) ?? p?.nickname ?? null,
        generation: Number.isFinite(numGen) ? numGen : p?.generation ?? null,
        father_id: (row.father_id as string | null) ?? p?.father_id ?? null,
        gender: (row.gender as string | null) ?? p?.gender ?? null,
        branch_name: (row.branch_name as string | null) ?? p?.branch_name ?? null,
      });
    }
  }

  if (parsed.length === 0) return [];

  // توحيد الترتيب ليكون من الفرد نفسه صعوداً إلى الجد المؤسس
  const lastIsTarget = parsed[parsed.length - 1]?.id === personId && parsed[0]?.id !== personId;
  const firstGen = parsed[0]?.generation ?? null;
  const lastGen = parsed[parsed.length - 1]?.generation ?? null;
  const ascendingGenerations =
    firstGen !== null && lastGen !== null && firstGen < lastGen && parsed[0]?.id !== personId;

  const ordered = lastIsTarget || ascendingGenerations ? [...parsed].reverse() : parsed;

  // ضمان وجود الفرد نفسه في بداية المسار إذا أعادت الدالة الآباء فقط
  if (ordered[0]?.id !== personId && localPerson) {
    ordered.unshift({
      id: localPerson.id,
      full_name: localPerson.full_name,
      nickname: localPerson.nickname ?? null,
      generation: localPerson.generation ?? null,
      father_id: localPerson.father_id ?? null,
      gender: localPerson.gender ?? null,
      branch_name: localPerson.branch_name ?? null,
    });
  }

  // إزالة التكرار مع الحفاظ على الترتيب
  const seen = new Set<string>();
  return ordered.filter((node) => {
    if (!node.id || seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

/**
 * استدعاء دالة get_ancestors_path من Supabase مع بديل محلي عند تعذر الاستعلام
 */
export async function fetchAncestorsPathFromSupabase(
  personId: string,
  peopleMap: Map<string, FamilyPerson>
): Promise<{ path: AncestorPathNode[]; usedRpc: boolean }> {
  const buildLocal = (): AncestorPathNode[] => {
    const { ancestors } = buildLineageChain(personId, peopleMap);
    return ancestors.map((a) => ({
      id: a.id,
      full_name: a.full_name,
      nickname: a.nickname ?? null,
      generation: a.generation ?? null,
      father_id: a.father_id ?? null,
      gender: a.gender ?? null,
      branch_name: a.branch_name ?? null,
    }));
  };

  if (!personId) return { path: [], usedRpc: false };

  if (supabase) {
    const paramCandidates: Record<string, string>[] = [
      { person_id: personId },
      { target_person_id: personId },
      { p_person_id: personId },
    ];

    for (const params of paramCandidates) {
      try {
        const { data, error } = await supabase.rpc('get_ancestors_path', params);
        if (!error && Array.isArray(data) && data.length > 0) {
          const normalized = normalizeAncestorRows(data, personId, peopleMap);
          if (normalized.length > 0) {
            return { path: normalized, usedRpc: true };
          }
        }
        // إذا لم يكن الخطأ متعلقاً باسم المعامل فلا داعي لتجربة أسماء أخرى
        if (error && !`${error.message || ''} ${error.code || ''}`.match(/PGRST202|42883|function/i)) {
          break;
        }
      } catch {
        break;
      }
    }
  }

  return { path: buildLocal(), usedRpc: false };
}

/**
 * تحليل مساري النسب لتحديد الجد الجامع المشترك وعدد الأجيال الفاصلة والمسار الذهبي
 */
export function analyzeKinshipPaths(
  personAId: string,
  personBId: string,
  pathA: AncestorPathNode[],
  pathB: AncestorPathNode[],
  peopleMap: Map<string, FamilyPerson>,
  usedRpc: boolean
): KinshipRadarAnalysis {
  const personA = pathA[0] ?? peopleMap.get(personAId);
  const personB = pathB[0] ?? peopleMap.get(personBId);

  if (!personA || !personB) {
    return {
      title: 'غير محدد',
      description: 'يرجى اختيار شخصين صالحين من شجرة العائلة.',
      commonAncestor: null,
      stepsFromA: 0,
      stepsFromB: 0,
      totalGenerations: 0,
      pathA,
      pathB,
      bridgeIds: [],
      usedRpc,
    };
  }

  if (personA.id === personB.id) {
    return {
      title: 'نفس الشخص',
      description: `${personA.full_name} هو الفرد نفسه في السجل.`,
      commonAncestor: personA,
      stepsFromA: 0,
      stepsFromB: 0,
      totalGenerations: 0,
      pathA,
      pathB,
      bridgeIds: [personA.id],
      usedRpc,
    };
  }

  const indexMapB = new Map<string, number>();
  pathB.forEach((node, idx) => indexMapB.set(node.id, idx));

  let commonAncestor: AncestorPathNode | null = null;
  let stepsFromA = -1;
  let stepsFromB = -1;

  for (let i = 0; i < pathA.length; i++) {
    const matchIdx = indexMapB.get(pathA[i].id);
    if (matchIdx !== undefined) {
      commonAncestor = pathA[i];
      stepsFromA = i;
      stepsFromB = matchIdx;
      break;
    }
  }

  if (!commonAncestor) {
    const fallback = computeKinshipRelation(personAId, personBId, peopleMap);
    return {
      title: fallback.title,
      description: fallback.description,
      commonAncestor: null,
      stepsFromA: -1,
      stepsFromB: -1,
      totalGenerations: 0,
      pathA,
      pathB,
      bridgeIds: [personAId, personBId],
      usedRpc,
    };
  }

  const isBFemale = personB.gender === 'female';
  let title = 'قرابة عائلية';

  if (stepsFromA === 1 && stepsFromB === 0) {
    title = isBFemale ? 'الأم' : 'الأب';
  } else if (stepsFromA === 0 && stepsFromB === 1) {
    title = isBFemale ? 'الابنة' : 'الابن';
  } else if (stepsFromA === 2 && stepsFromB === 0) {
    title = isBFemale ? 'الجدة' : 'الجد';
  } else if (stepsFromA === 0 && stepsFromB === 2) {
    title = isBFemale ? 'الحفيدة' : 'الحفيد';
  } else if (stepsFromA > 2 && stepsFromB === 0) {
    title = `الجد الأعلى (الدرجة ${stepsFromA})`;
  } else if (stepsFromA === 0 && stepsFromB > 2) {
    title = `من الذرية (الجيل +${stepsFromB})`;
  } else if (stepsFromA === 1 && stepsFromB === 1) {
    title = isBFemale ? 'الأخت' : 'الأخ';
  } else if (stepsFromA === 2 && stepsFromB === 1) {
    title = isBFemale ? 'العمة' : 'العم';
  } else if (stepsFromA === 1 && stepsFromB === 2) {
    title = isBFemale ? 'ابنة الأخ / الأخت' : 'ابن الأخ / الأخت';
  } else if (stepsFromA === 2 && stepsFromB === 2) {
    title = isBFemale ? 'ابنة العم' : 'ابن العم';
  } else if (stepsFromA === 3 && stepsFromB === 1) {
    title = isBFemale ? 'عمة الأب' : 'عم الأب';
  } else if (stepsFromA === stepsFromB) {
    title = `ابن عم من الدرجة ${stepsFromA - 1}`;
  } else {
    title = `قرابة من الجد المشترك (${stepsFromA} ↑ · ${stepsFromB} ↓)`;
  }

  const bridgeSet = new Set<string>();
  for (const node of pathA.slice(0, stepsFromA + 1)) bridgeSet.add(node.id);
  for (const node of pathB.slice(0, stepsFromB + 1)) bridgeSet.add(node.id);

  const totalGenerations = stepsFromA + stepsFromB;

  return {
    title,
    description: `${personB.full_name} بالنسبة لـ ${personA.full_name}: ${title} — يجتمعان عند الجد الجامع ${commonAncestor.full_name}.`,
    commonAncestor,
    stepsFromA,
    stepsFromB,
    totalGenerations,
    pathA,
    pathB,
    bridgeIds: Array.from(bridgeSet),
    usedRpc,
  };
}

export function isPrivilegedRole(role?: UserRole | string | null): boolean {
  return role === 'developer' || role === 'owner' || role === 'admin';
}

export function isTopAuthorityRole(role?: UserRole | string | null): boolean {
  return role === 'owner' || role === 'developer';
}

export function normalizeUserRole(role?: UserRole | string | null): UserRole {
  if (
    role === 'owner' ||
    role === 'developer' ||
    role === 'admin' ||
    role === 'subscriber' ||
    role === 'suspended'
  ) {
    return role;
  }
  return 'subscriber';
}

export function canEditOrDeletePerson(
  _person: Pick<FamilyPerson, 'created_by'>,
  currentUserId?: string | null,
  userRole?: UserRole | string | null
): boolean {
  if (isPrivilegedRole(userRole)) return true;
  if (!currentUserId) return false;
  return userRole !== 'suspended';
}

export function getRoleLabelArabic(role?: UserRole | string | null): string {
  switch (role) {
    case 'developer':
      return 'مطور';
    case 'owner':
      return 'مالك';
    case 'admin':
      return 'مشرف';
    case 'suspended':
      return 'حساب موقوف';
    case 'subscriber':
    case 'member':
    default:
      return 'مشترك';
  }
}

export function getRoleBadgeClasses(role?: UserRole | string | null): string {
  switch (role) {
    case 'owner':
      return 'border-[#D4AF37] bg-[#FEF3C7] text-[#92400E]';
    case 'developer':
      return 'border-[#93C5FD] bg-[#EFF6FF] text-[#1E3A8A]';
    case 'admin':
      return 'border-[#86EFAC] bg-[#DCFCE7] text-[#166534]';
    case 'suspended':
      return 'border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]';
    case 'subscriber':
    case 'member':
    default:
      return 'border-[#D6CEBE] bg-[#FAF8F4] text-[#57534E]';
  }
}

export function getStatusLabelArabic(status?: RequestStatus | string | null): string {
  switch (status) {
    case 'approved':
      return 'مقبول';
    case 'rejected':
      return 'مرفوض';
    case 'blocked':
      return 'محظور أمنياً';
    case 'pending':
    default:
      return 'قيد المراجعة';
  }
}

export function getSeverityLabelArabic(severity?: SecuritySeverity | string | null): string {
  switch (severity) {
    case 'critical':
      return 'حرج';
    case 'high':
      return 'عالي';
    case 'medium':
      return 'متوسط';
    case 'low':
    default:
      return 'منخفض';
  }
}

export function formatDateArabic(dateString?: string | null): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * تحويل الأرقام العربية والهندية (٠-٩ و ۰-۹) إلى أرقام إنجليزية (0-9)
 */
export function normalizeArabicDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * تطبيع النص العربي للبحث بالاسم الثنائي والثلاثي والرباعي والكنية
 */
export function normalizeArabicSearchText(value: string | null | undefined): string {
  if (!value) return '';
  return normalizeArabicDigits(value)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripPatronymicConnectors(value: string): string {
  return value
    .replace(/(^|\s)(بن|ابن|بنت)(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

