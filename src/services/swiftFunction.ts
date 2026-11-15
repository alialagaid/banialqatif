import { supabase } from '../lib/supabase';
import type { FamilyPerson } from '../types/database';

export interface SmartSearchResult {
  answer: string;
  matchedIds: string[];
  raw?: unknown;
}

/**
 * يستدعي دالة Edge Function في Supabase باسم "swift-function"
 * مع إرسال action: "search" وسؤال المستخدم وبيانات العائلة.
 */
export async function invokeSwiftSearch(
  question: string,
  familyData: FamilyPerson[],
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<SmartSearchResult> {
  if (!supabase) {
    throw new Error('لم يتم تهيئة اتصال Supabase بعد. يرجى ضبط متغيرات البيئة.');
  }

  const compactFamily = familyData.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    father_id: p.father_id,
    mother_id: p.mother_id ?? null,
    spouse_id: p.spouse_id ?? null,
    gender: p.gender ?? null,
    generation: p.generation ?? null,
    birth_year: p.birth_year ?? null,
    death_year: p.death_year ?? null,
    is_alive: p.is_alive ?? null,
    branch_name: p.branch_name ?? null,
    location: p.location ?? null,
    biography: p.biography ?? null,
  }));

  const { data, error } = await supabase.functions.invoke('swift-function', {
    body: {
      action: 'search',
      question: question.trim(),
      query: question.trim(),
      message: question.trim(),
      family_data: compactFamily,
      familyData: compactFamily,
      history: conversationHistory.slice(-6),
    },
  });

  if (error) {
    throw new Error(error.message || 'تعذر الاتصال بخدمة البحث الذكي swift-function.');
  }

  let answer = '';
  let matchedIds: string[] = [];

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      answer = extractAnswerText(parsed) || data;
      matchedIds = extractMatchedIds(parsed, familyData);
    } catch {
      answer = data;
    }
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    answer = extractAnswerText(obj);
    matchedIds = extractMatchedIds(obj, familyData);
  }

  if (!answer) {
    answer = 'تم استلام رد من المساعد الذكي دون نص تفصيلي.';
  }

  return { answer, matchedIds, raw: data };
}

function extractAnswerText(obj: Record<string, unknown>): string {
  const candidates = [
    obj.answer,
    obj.reply,
    obj.response,
    obj.message,
    obj.text,
    obj.content,
    obj.result,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
  }
  if (obj.data && typeof obj.data === 'object') {
    return extractAnswerText(obj.data as Record<string, unknown>);
  }
  return '';
}

function extractMatchedIds(obj: Record<string, unknown>, familyData: FamilyPerson[]): string[] {
  const ids = new Set<string>();
  const rawList = obj.matched_ids ?? obj.matchedIds ?? obj.matches ?? obj.related_ids ?? obj.people_ids;

  if (Array.isArray(rawList)) {
    for (const item of rawList) {
      if (typeof item === 'string') {
        ids.add(item);
      } else if (item && typeof item === 'object' && 'id' in item && typeof item.id === 'string') {
        ids.add(item.id);
      }
    }
  }

  const text = extractAnswerText(obj);
  if (text && ids.size === 0) {
    for (const person of familyData) {
      if (person.full_name && person.full_name.length > 3 && text.includes(person.full_name)) {
        ids.add(person.id);
      }
      if (ids.size >= 5) break;
    }
  }

  return Array.from(ids);
}
