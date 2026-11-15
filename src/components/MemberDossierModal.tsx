import React, { useEffect, useMemo, useState } from 'react';
import { Compass, Edit3, Loader2, Plus, Share2, Trash2, UserCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { FamilyPerson, Profile, UserRole } from '../types/database';
import {
  getPersonBirthDisplay,
  getPersonDeathDisplay,
  getPersonTribeTitle,
} from '../utils/familyPersonDb';
import {
  buildLineageChain,
  canEditOrDeletePerson,
  createPeopleMap,
  isPrivilegedRole,
} from '../utils/kinship';
import { downloadLineageShareCard } from '../utils/lineageCardImage';

interface MemberDossierModalProps {
  person: FamilyPerson | null;
  people: FamilyPerson[];
  profiles: Profile[];
  currentUserId: string;
  userRole: UserRole;
  onClose: () => void;
  onSelectPerson: (personId: string) => void;
  onDirectEdit: (person: FamilyPerson) => void;
  onDirectAddChild: (parent: FamilyPerson) => void;
  onRequestAddChild?: (parent: FamilyPerson) => void;
  onDeletePerson: (person: FamilyPerson) => void;
  onOpenRadarWithPerson?: (person: FamilyPerson) => void;
  onNotify?: (message: string, isError?: boolean) => void;
}

export const MemberDossierModal: React.FC<MemberDossierModalProps> = ({
  person,
  people,
  profiles,
  currentUserId,
  userRole,
  onClose,
  onSelectPerson,
  onDirectEdit,
  onDirectAddChild,
  onRequestAddChild,
  onDeletePerson,
  onOpenRadarWithPerson,
  onNotify,
}) => {
  const [detailedPerson, setDetailedPerson] = useState<FamilyPerson | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [generatingCard, setGeneratingCard] = useState(false);

  useEffect(() => {
    if (!person || !supabase) {
      setDetailedPerson(null);
      setLoadingDetails(false);
      return;
    }

    let cancelled = false;
    const targetPersonId = person.id;

    async function fetchPersonDetails() {
      if (!supabase) return;
      setLoadingDetails(true);
      try {
        const { data } = await supabase
          .from('family_people')
          .select('*')
          .eq('id', targetPersonId)
          .maybeSingle<FamilyPerson>();

        if (!cancelled && data) {
          setDetailedPerson(data);
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    }

    void fetchPersonDetails();

    return () => {
      cancelled = true;
    };
  }, [person?.id]);

  const resolvedPerson = useMemo(() => {
    if (!person) return null;
    if (detailedPerson && detailedPerson.id === person.id) {
      return { ...person, ...detailedPerson };
    }
    return person;
  }, [person, detailedPerson]);

  const peopleMap = useMemo(() => createPeopleMap(people), [people]);

  const lineage = useMemo(
    () =>
      resolvedPerson
        ? buildLineageChain(resolvedPerson.id, peopleMap)
        : { chainText: '', ancestors: [] },
    [resolvedPerson, peopleMap]
  );

  const children = useMemo(
    () =>
      resolvedPerson
        ? people.filter(
            (p) => p.father_id === resolvedPerson.id || p.mother_id === resolvedPerson.id
          )
        : [],
    [resolvedPerson, people]
  );

  const siblings = useMemo(() => {
    if (!resolvedPerson?.father_id) return [];
    return people.filter(
      (p) => p.father_id === resolvedPerson.father_id && p.id !== resolvedPerson.id
    );
  }, [resolvedPerson, people]);

  if (!resolvedPerson) return null;

  const father = resolvedPerson.father_id ? peopleMap.get(resolvedPerson.father_id) : null;
  const mother = resolvedPerson.mother_id ? peopleMap.get(resolvedPerson.mother_id) : null;
  const spouse = resolvedPerson.spouse_id ? peopleMap.get(resolvedPerson.spouse_id) : null;
  const linkedProfile = profiles.find((prof) => prof.person_id === resolvedPerson.id) ?? null;
  const isManager = isPrivilegedRole(userRole);
  const canModify = canEditOrDeletePerson(resolvedPerson, currentUserId, userRole);
  const displayNickname = resolvedPerson.nickname || linkedProfile?.nickname;
  const displayTribeTitle = getPersonTribeTitle(resolvedPerson);
  const displayBirthDate = getPersonBirthDisplay(resolvedPerson);
  const displayDeathDate = getPersonDeathDisplay(resolvedPerson);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/35"
      role="dialog"
      aria-modal="true"
      aria-label={`ملف ${resolvedPerson.full_name}`}
    >
      <div className="h-full w-full max-w-lg overflow-y-auto border-r border-[#D6CEBE] bg-white p-6 md:p-8">
        {/* رأس الملف */}
        <div className="flex items-start justify-between border-b border-[#E5E0D5] pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-[#57534E]">
                {resolvedPerson.generation ? `الجيل ${resolvedPerson.generation}` : 'بطاقة نسب'}
                {displayTribeTitle ? ` · ${displayTribeTitle}` : ''}
                {` · ${resolvedPerson.is_alive === false ? 'متوفى' : 'على قيد الحياة'}`}
              </p>
            </div>
            <h2 className="font-heritage mt-1.5 text-2xl font-bold text-[#1C1917]">
              {resolvedPerson.full_name}
            </h2>
            {(displayTribeTitle || displayNickname) && (
              <p className="mt-1 text-xs font-medium text-[#92400E]">
                {displayTribeTitle || displayNickname}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق البطاقة"
            className="rounded-lg p-1.5 text-[#57534E] hover:bg-[#F2EFE9] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* سلسلة النسب */}
        <div className="mt-5 rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] p-4">
          <p className="text-xs font-medium text-[#92400E]">سلسلة النسب المتصلة</p>
          <p className="mt-1 text-sm leading-relaxed font-medium text-[#1C1917]">
            {lineage.chainText}
          </p>
        </div>

        {/* أزرار الإجراءات */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={generatingCard}
            onClick={async () => {
              setGeneratingCard(true);
              try {
                await downloadLineageShareCard(resolvedPerson, people, displayNickname);
                onNotify?.(
                  `تم توليد وتنزيل بطاقة نسب "${resolvedPerson.full_name}" باللونين الأزرق الملكي والذهبي — جاهزة للمشاركة عبر واتساب.`
                );
              } catch (err) {
                onNotify?.(
                  err instanceof Error ? err.message : 'تعذر توليد صورة بطاقة النسب.',
                  true
                );
              } finally {
                setGeneratingCard(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37] bg-[#0F2350] px-4 py-2 text-xs font-semibold text-[#F6DF85] hover:bg-[#16326E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {generatingCard ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Share2 className="h-3.5 w-3.5" />
            )}
            <span>مشاركة بطاقة نسبي</span>
          </button>

          {onOpenRadarWithPerson && (
            <button
              type="button"
              onClick={() => onOpenRadarWithPerson(resolvedPerson)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2 text-xs font-medium text-[#0F2350] hover:bg-[#F2EFE9] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Compass className="h-3.5 w-3.5 text-[#92400E]" />
              <span>كيف يقرب لي؟</span>
            </button>
          )}

          {canModify && (
            <button
              type="button"
              onClick={() => onDirectEdit(resolvedPerson)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-medium text-white hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>{isManager ? 'تعديل بيانات الفرد' : 'طلب تعديل البيانات'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              isManager
                ? onDirectAddChild(resolvedPerson)
                : (onRequestAddChild ?? onDirectAddChild)(resolvedPerson)
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6CEBE] bg-white px-3.5 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F2EFE9] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isManager ? 'إضافة ابن / ابنة' : 'طلب إضافة فرد'}</span>
          </button>

          {canModify && (
            <button
              type="button"
              onClick={() => onDeletePerson(resolvedPerson)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#FCA5A5] bg-white px-3.5 py-2 text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isManager ? 'حذف الفرد' : 'طلب حذف الفرد'}</span>
            </button>
          )}
        </div>

        {loadingDetails && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[#78716C]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#14532D]" />
            <span>جاري تحميل السيرة والتفاصيل الكاملة...</span>
          </div>
        )}

        {/* البيانات التفصيلية */}
        <dl className="mt-6 divide-y divide-[#F2EFE9] border-t border-[#E5E0D5] text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="shrink-0 text-[#57534E]">الاسم الكامل</dt>
            <dd className="font-semibold text-[#1C1917] text-left">{resolvedPerson.full_name}</dd>
          </div>

          <div className="flex justify-between gap-4 py-3">
            <dt className="shrink-0 text-[#57534E]">اللقب / القبيلة أو الفخذ</dt>
            <dd className="font-medium text-[#92400E]">
              {displayTribeTitle || displayNickname || '—'}
            </dd>
          </div>

          <div className="flex justify-between gap-4 py-3">
            <dt className="shrink-0 text-[#57534E]">الجيل</dt>
            <dd className="font-mono tabular-nums text-[#1C1917]">
              {resolvedPerson.generation ? `الجيل ${resolvedPerson.generation}` : '—'}
            </dd>
          </div>

          <div className="flex justify-between gap-4 py-3">
            <dt className="shrink-0 text-[#57534E]">حالة الحياة</dt>
            <dd>
              {resolvedPerson.is_alive === false ? (
                <span className="inline-flex items-center rounded border border-[#E7E5E4] bg-[#F5F5F4] px-2 py-0.5 text-xs font-medium text-[#57534E]">
                  متوفى
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded border border-[#86EFAC] bg-[#DCFCE7] px-2 py-0.5 text-xs font-semibold text-[#166534]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                  <span>على قيد الحياة</span>
                </span>
              )}
            </dd>
          </div>

          <div className="flex justify-between py-3">
            <dt className="text-[#57534E]">الأب</dt>
            <dd className="font-medium text-[#1C1917]">
              {father ? (
                <button
                  type="button"
                  onClick={() => onSelectPerson(father.id)}
                  className="text-[#14532D] hover:underline cursor-pointer"
                >
                  {father.full_name}
                </button>
              ) : (
                'الجد المؤسس / غير محدد'
              )}
            </dd>
          </div>

          {mother && (
            <div className="flex justify-between py-3">
              <dt className="text-[#57534E]">الأم</dt>
              <dd className="font-medium text-[#1C1917]">
                <button
                  type="button"
                  onClick={() => onSelectPerson(mother.id)}
                  className="text-[#14532D] hover:underline cursor-pointer"
                >
                  {mother.full_name}
                </button>
              </dd>
            </div>
          )}

          {spouse && (
            <div className="flex justify-between py-3">
              <dt className="text-[#57534E]">الزوج / الزوجة</dt>
              <dd className="font-medium text-[#1C1917]">
                <button
                  type="button"
                  onClick={() => onSelectPerson(spouse.id)}
                  className="text-[#14532D] hover:underline cursor-pointer"
                >
                  {spouse.full_name}
                </button>
              </dd>
            </div>
          )}

          <div className="flex justify-between py-3">
            <dt className="text-[#57534E]">تاريخ أو سنة الميلاد</dt>
            <dd className="font-mono tabular-nums text-[#1C1917]">
              {displayBirthDate || '—'}
            </dd>
          </div>

          {resolvedPerson.is_alive === false && (
            <div className="flex justify-between py-3">
              <dt className="text-[#57534E]">تاريخ أو سنة الوفاة</dt>
              <dd className="font-mono tabular-nums text-[#991B1B] font-medium">
                {displayDeathDate || '—'}
              </dd>
            </div>
          )}

          <div className="flex justify-between py-3">
            <dt className="text-[#57534E]">مكان الإقامة</dt>
            <dd className="text-[#1C1917]">{resolvedPerson.location || '—'}</dd>
          </div>

          <div className="flex justify-between py-3">
            <dt className="text-[#57534E]">رقم الموبايل</dt>
            <dd className="font-mono tabular-nums text-[#1C1917]">
              <span dir="ltr">{linkedProfile?.phone || resolvedPerson.phone || '—'}</span>
            </dd>
          </div>
        </dl>

        {resolvedPerson.biography && (
          <div className="mt-5 border-t border-[#E5E0D5] pt-4">
            <h3 className="text-xs font-semibold text-[#57534E]">النبذة والسيرة</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#1C1917] whitespace-pre-wrap">
              {resolvedPerson.biography}
            </p>
          </div>
        )}

        {/* الأبناء */}
        <div className="mt-6 border-t border-[#E5E0D5] pt-5">
          <h3 className="text-xs font-semibold text-[#57534E]">
            الأبناء والبنات ({children.length})
          </h3>
          {children.length === 0 ? (
            <p className="mt-2 text-xs text-[#78716C]">لا يوجد أبناء مسجلون حالياً.</p>
          ) : (
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onSelectPerson(child.id)}
                  className="flex items-center justify-between rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] px-3 py-2 text-right text-xs font-medium text-[#1C1917] hover:border-[#14532D] cursor-pointer"
                >
                  <span className="truncate">{child.full_name}</span>
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-[#14532D]" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* الإخوة */}
        {siblings.length > 0 && (
          <div className="mt-6 border-t border-[#E5E0D5] pt-5">
            <h3 className="text-xs font-semibold text-[#57534E]">
              الإخوة والأخوات ({siblings.length})
            </h3>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {siblings.map((sib) => (
                <button
                  key={sib.id}
                  type="button"
                  onClick={() => onSelectPerson(sib.id)}
                  className="font-medium text-[#14532D] hover:underline cursor-pointer"
                >
                  {sib.full_name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
