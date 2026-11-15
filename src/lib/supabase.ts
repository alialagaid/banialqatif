import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function sanitizeEnvValue(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
}

const rawSupabaseUrl = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
const rawSupabaseAnonKey = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

function validateSupabaseConfig(url: string, key: string): string | null {
  if (!url || !key) {
    return 'لم يتم العثور على VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في متغيرات البيئة.';
  }

  if (url.includes('your-project-id')) {
    return 'رابط VITE_SUPABASE_URL ما زال يحتوي على القيمة الافتراضية your-project-id.';
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return 'صيغة رابط VITE_SUPABASE_URL غير صالحة. يجب أن يبدأ بـ https:// مثل: https://your-project-ref.supabase.co';
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
    return 'رابط Supabase يجب أن يستخدم بروتوكول https://.';
  }

  if (parsedUrl.hostname === 'supabase.co' || parsedUrl.hostname === 'www.supabase.co') {
    return 'الرابط https://supabase.co هو الموقع الرئيسي وليس رابط مشروعك. انسخ رابط Project URL الخاص بمشروعك من لوحة Supabase مثل: https://xxxx.supabase.co';
  }

  if (key === 'your-supabase-anon-key' || key.includes('ضع_المفتاح')) {
    return 'مفتاح VITE_SUPABASE_ANON_KEY ما زال يحتوي على نص توضيحي وليس المفتاح الفعلي (Anon Key).';
  }

  if (!/^[\x21-\x7E]+$/.test(key)) {
    return 'مفتاح VITE_SUPABASE_ANON_KEY يحتوي على أحرف غير صالحة أو مسافات. تأكد من نسخ المفتاح الإنجليزي كاملاً بدون مسافات.';
  }

  return null;
}

export const supabaseConfigIssue = validateSupabaseConfig(rawSupabaseUrl, rawSupabaseAnonKey);
export const isSupabaseConfigured = supabaseConfigIssue === null;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawSupabaseUrl, rawSupabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * استخلاص رسالة الخطأ الحقيقية (error.message) من أخطاء Supabase أو JavaScript
 */
export function getSupabaseErrorMessage(err: unknown, fallback: string): string {
  const formatRawMessage = (rawMsg: string): string => {
    const trimmed = rawMsg.trim();
    const lower = trimmed.toLowerCase();
    if (
      lower === 'failed to fetch' ||
      lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('load failed') ||
      lower.includes("failed to execute 'fetch'")
    ) {
      return 'تعذر الاتصال بخادم Supabase (Failed to fetch). تحقق من صحة رابط المشروع (https://<project-id>.supabase.co) ومفتاح Anon Key، ومن أن مشروع Supabase نشط وغير متوقف مؤقتاً.';
    }
    return trimmed;
  };

  if (typeof err === 'string' && err.trim()) {
    return formatRawMessage(err);
  }
  if (err instanceof Error && err.message) {
    return formatRawMessage(err.message);
  }
  if (err && typeof err === 'object') {
    const obj = err as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error_description?: unknown;
    };
    const parts: string[] = [];
    if (typeof obj.message === 'string' && obj.message.trim()) {
      parts.push(formatRawMessage(obj.message));
    } else if (typeof obj.error_description === 'string' && obj.error_description.trim()) {
      parts.push(formatRawMessage(obj.error_description));
    }
    if (typeof obj.details === 'string' && obj.details.trim() && obj.details !== obj.message) {
      parts.push(obj.details.trim());
    }
    if (typeof obj.hint === 'string' && obj.hint.trim()) {
      parts.push(obj.hint.trim());
    }
    if (parts.length > 0) {
      const codePrefix = typeof obj.code === 'string' && obj.code ? `[${obj.code}] ` : '';
      return `${codePrefix}${parts.join(' — ')}`;
    }
    try {
      const serialized = JSON.stringify(err);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      // ignore
    }
  }
  return fallback;
}
