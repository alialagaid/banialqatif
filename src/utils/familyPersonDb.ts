import { supabase } from '../lib/supabase';
import type { FamilyPerson } from '../types/database';
import { normalizeArabicDigits } from './kinship';

export const FAMILY_TREE_SELECT_COLUMNS = [
  'id',
  'full_name',
  'nickname',
  'tribe_title',
  'branch_name',
  'father_id',
  'generation',
  'is_alive',
  'birth_date',
  'death_date',
  'birth_year',
  'death_year',
  'photo_url',
  'gender',
  'created_by',
];

export function getPersonTribeTitle(person?: Partial<FamilyPerson> | null): string {
  if (!person) return '';
  return String(person.tribe_title || person.branch_name || '').trim();
}

export function getPersonBirthDisplay(person?: Partial<FamilyPerson> | null): string {
  if (!person) return '';
  const val = person.birth_date ?? person.birth_year;
  return val !== null && val !== undefined ? String(val).trim() : '';
}

export function getPersonDeathDisplay(person?: Partial<FamilyPerson> | null): string {
  if (!person) return '';
  const val = person.death_date ?? person.death_year;
  return val !== null && val !== undefined ? String(val).trim() : '';
}

function extractMissingColumnName(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): string | null {
  const combined = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  const isColumnError =
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    combined.toLowerCase().includes('does not exist') ||
    combined.toLowerCase().includes('could not find');

  if (!isColumnError) return null;

  const pgMatch = combined.match(/column\s+(?:[a-zA-Z0-9_]+\.)?"?([a-zA-Z0-9_]+)"?\s+does not exist/i);
  if (pgMatch?.[1]) return pgMatch[1];

  const pgrstMatch = combined.match(/['"]([a-zA-Z0-9_]+)['"]\s+column/i);
  if (pgrstMatch?.[1]) return pgrstMatch[1];

  for (const col of FAMILY_TREE_SELECT_COLUMNS) {
    if (combined.includes(col)) return col;
  }
  return null;
}

export async function fetchFamilyPeopleForTree(): Promise<{
  data: FamilyPerson[] | null;
  error: { message: string } | null;
}> {
  if (!supabase) {
    return { data: null, error: { message: 'اتصال Supabase غير مهيأ.' } };
  }

  let columns = [...FAMILY_TREE_SELECT_COLUMNS];

  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await supabase
      .from('family_people')
      .select(columns.join(', '))
      .order('generation', { ascending: true });

    if (!res.error) {
      return { data: (res.data as unknown as FamilyPerson[]) || [], error: null };
    }

    const missingCol = extractMissingColumnName(res.error);
    if (missingCol && columns.includes(missingCol) && missingCol !== 'id' && missingCol !== 'full_name') {
      columns = columns.filter((c) => c !== missingCol);
      continue;
    }

    return { data: null, error: { message: res.error.message } };
  }

  return { data: [], error: null };
}

export interface PersistFamilyPersonInput {
  full_name: string;
  tribe_title?: string | null;
  branch_name?: string | null;
  father_id?: string | null;
  gender?: string | null;
  generation?: number | null;
  birth_date?: string | null;
  death_date?: string | null;
  birth_year?: string | number | null;
  death_year?: string | number | null;
  is_alive?: boolean;
  location?: string | null;
  phone?: string | null;
  biography?: string | null;
  nickname?: string | null;
}

function toYearFallbackDate(rawValue: string | null | undefined): string | null {
  if (!rawValue) return null;
  const normalized = normalizeArabicDigits(String(rawValue)).trim();
  if (/^\d{4}$/.test(normalized)) {
    return `${normalized}-01-01`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  return null;
}

export async function persistFamilyPersonToDb(
  action: 'insert' | 'update',
  input: PersistFamilyPersonInput,
  options: { targetId?: string; createdBy?: string | null } = {}
): Promise<{
  data: FamilyPerson | null;
  error: { message?: string; details?: string; hint?: string; code?: string } | null;
}> {
  if (!supabase) {
    return { data: null, error: { message: 'اتصال Supabase غير مهيأ.' } };
  }

  const cleanTribe = (input.tribe_title ?? input.branch_name ?? null)?.trim() || null;
  const rawBirth =
    input.birth_date !== undefined && input.birth_date !== null
      ? normalizeArabicDigits(String(input.birth_date)).trim() || null
      : input.birth_year !== undefined && input.birth_year !== null
        ? normalizeArabicDigits(String(input.birth_year)).trim() || null
        : null;
  const alive = input.is_alive !== false;
  const rawDeath = !alive
    ? input.death_date !== undefined && input.death_date !== null
      ? normalizeArabicDigits(String(input.death_date)).trim() || null
      : input.death_year !== undefined && input.death_year !== null
        ? normalizeArabicDigits(String(input.death_year)).trim() || null
        : null
    : null;

  const payload: Record<string, unknown> = {
    full_name: normalizeArabicDigits(input.full_name || '').trim(),
    tribe_title: cleanTribe,
    father_id: input.father_id || null,
    gender: input.gender || 'male',
    generation:
      typeof input.generation === 'number' && input.generation >= 1
        ? input.generation
        : Number(normalizeArabicDigits(String(input.generation ?? '1')).replace(/[^\d]/g, '')) || 1,
    birth_date: rawBirth,
    is_alive: alive,
    death_date: rawDeath,
    location: input.location?.trim() || null,
    phone: input.phone ? normalizeArabicDigits(String(input.phone)).trim() || null : null,
    biography: input.biography?.trim() || null,
  };

  if (input.nickname) {
    payload.nickname = input.nickname.trim();
  }
  if (action === 'insert' && options.createdBy) {
    payload.created_by = options.createdBy;
  }

  const blockedCols = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt++) {
    const res =
      action === 'insert'
        ? await supabase
            .from('family_people')
            .insert(payload)
            .select('*')
            .maybeSingle<FamilyPerson>()
        : await supabase
            .from('family_people')
            .update(payload)
            .eq('id', options.targetId!)
            .select('*')
            .maybeSingle<FamilyPerson>();

    if (!res.error) {
      return { data: res.data ?? null, error: null };
    }

    const err = res.error;

    // معالجة أعمدة التواريخ في حال كان نوع العمود DATE في PostgreSQL
    if (err.code === '22007') {
      let adjustedDate = false;
      if ('birth_date' in payload && typeof payload.birth_date === 'string') {
        const coerced = toYearFallbackDate(payload.birth_date);
        if (coerced && coerced !== payload.birth_date) {
          payload.birth_date = coerced;
          adjustedDate = true;
        } else if (!coerced) {
          const origBirth = payload.birth_date;
          delete payload.birth_date;
          blockedCols.add('birth_date');
          if (!blockedCols.has('birth_year')) payload.birth_year = origBirth;
          adjustedDate = true;
        }
      }
      if ('death_date' in payload && typeof payload.death_date === 'string') {
        const coerced = toYearFallbackDate(payload.death_date);
        if (coerced && coerced !== payload.death_date) {
          payload.death_date = coerced;
          adjustedDate = true;
        } else if (!coerced) {
          const origDeath = payload.death_date;
          delete payload.death_date;
          blockedCols.add('death_date');
          if (!blockedCols.has('death_year')) payload.death_year = origDeath;
          adjustedDate = true;
        }
      }
      if (adjustedDate) continue;
    }

    const missingCol = extractMissingColumnName(err);
    if (missingCol && missingCol in payload) {
      blockedCols.add(missingCol);
      const val = payload[missingCol];
      delete payload[missingCol];

      if (missingCol === 'tribe_title' && !blockedCols.has('branch_name')) {
        payload.branch_name = val;
      } else if (missingCol === 'birth_date' && !blockedCols.has('birth_year')) {
        payload.birth_year = val;
      } else if (missingCol === 'death_date' && !blockedCols.has('death_year')) {
        payload.death_year = val;
      }
      continue;
    }

    return { data: null, error: err };
  }

  return { data: null, error: { message: 'تعذر حفظ بيانات الفرد في جدول family_people.' } };
}
