import type { FamilyPerson } from '../types/database';

const FAMILY_TREE_CACHE_KEY = 'banni_qatif_family_tree_cache_v1';

interface TreeCachePayload {
  updatedAt: number;
  people: FamilyPerson[];
}

/**
 * تجريد سجل الفرد إلى حقول العرض الخفيفة فقط قبل حفظه في الذاكرة المؤقتة
 * لضمان صغر حجم التخزين وسرعة الاسترجاع.
 */
export function toLightweightFamilyPerson(person: FamilyPerson): FamilyPerson {
  return {
    id: person.id,
    full_name: person.full_name,
    nickname: person.nickname ?? null,
    tribe_title: person.tribe_title ?? person.branch_name ?? null,
    father_id: person.father_id ?? null,
    generation: person.generation ?? null,
    is_alive: person.is_alive ?? true,
    birth_date: person.birth_date ?? (person.birth_year != null ? String(person.birth_year) : null),
    death_date: person.death_date ?? (person.death_year != null ? String(person.death_year) : null),
    birth_year: person.birth_year ?? null,
    death_year: person.death_year ?? null,
    photo_url: person.photo_url ?? null,
    branch_name: person.branch_name ?? person.tribe_title ?? null,
    gender: person.gender ?? null,
    created_by: person.created_by ?? null,
  };
}

export function loadCachedFamilyPeople(): FamilyPerson[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(FAMILY_TREE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<TreeCachePayload>;
    if (!parsed || !Array.isArray(parsed.people)) return [];
    return parsed.people.filter(
      (item): item is FamilyPerson =>
        Boolean(item && typeof item.id === 'string' && typeof item.full_name === 'string')
    );
  } catch {
    return [];
  }
}

export function saveCachedFamilyPeople(people: FamilyPerson[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload: TreeCachePayload = {
      updatedAt: Date.now(),
      people: people.map(toLightweightFamilyPerson),
    };
    window.localStorage.setItem(FAMILY_TREE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // تجاهل أخطاء امتلاء سعة التخزين المؤقت دون تعطيل التطبيق
  }
}

export function clearCachedFamilyPeople(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(FAMILY_TREE_CACHE_KEY);
  } catch {
    // تجاهل
  }
}
