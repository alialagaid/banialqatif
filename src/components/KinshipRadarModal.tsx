import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Compass,
  GitBranch,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { FamilyPerson, Profile } from '../types/database';
import {
  analyzeKinshipPaths,
  createPeopleMap,
  fetchAncestorsPathFromSupabase,
  normalizeArabicSearchText,
  type KinshipRadarAnalysis,
  type KinshipRadarHighlight,
} from '../utils/kinship';

interface KinshipRadarModalProps {
  isOpen: boolean;
  people: FamilyPerson[];
  profile: Profile | null;
  initialPersonAId?: string | null;
  initialPersonBId?: string | null;
  onClose: () => void;
  onHighlightTreePath: (highlight: KinshipRadarHighlight) => void;
}

export const KinshipRadarModal: React.FC<KinshipRadarModalProps> = ({
  isOpen,
  people = [],
  profile,
  initialPersonAId,
  initialPersonBId,
  onClose,
  onHighlightTreePath,
}) => {
  const safePeople = useMemo(
    () =>
      Array.isArray(people)
        ? people.filter((p): p is FamilyPerson => Boolean(p && p.id))
        : [],
    [people]
  );

  const peopleMap = useMemo(() => createPeopleMap(safePeople), [safePeople]);

  const sortedPeople = useMemo(
    () =>
      [...safePeople].sort((a, b) =>
        (a.full_name || '').localeCompare(b.full_name || '', 'ar')
      ),
    [safePeople]
  );

  const defaultAId = useMemo(() => {
    if (initialPersonAId && peopleMap.has(initialPersonAId)) return initialPersonAId;
    if (profile?.person_id && peopleMap.has(profile.person_id)) return profile.person_id;
    return sortedPeople[0]?.id ?? '';
  }, [initialPersonAId, profile?.person_id, peopleMap, sortedPeople]);

  const defaultBId = useMemo(() => {
    if (initialPersonBId && peopleMap.has(initialPersonBId)) return initialPersonBId;
    const alt = sortedPeople.find((p) => p.id !== defaultAId);
    return alt?.id ?? sortedPeople[0]?.id ?? '';
  }, [initialPersonBId, peopleMap, sortedPeople, defaultAId]);

  const [personAId, setPersonAId] = useState<string>(defaultAId);
  const [personBId, setPersonBId] = useState<string>(defaultBId);
  const [filterA, setFilterA] = useState('');
  const [filterB, setFilterB] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<KinshipRadarAnalysis | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPersonAId((prev) => (prev && peopleMap.has(prev) ? prev : defaultAId));
    setPersonBId((prev) => (prev && peopleMap.has(prev) ? prev : defaultBId));
  }, [isOpen, defaultAId, defaultBId, peopleMap]);

  const filteredListA = useMemo(() => {
    const q = normalizeArabicSearchText(filterA);
    if (!q) return sortedPeople;
    return sortedPeople.filter(
      (p) =>
        normalizeArabicSearchText(p.full_name).includes(q) ||
        normalizeArabicSearchText(p.nickname).includes(q) ||
        normalizeArabicSearchText(p.branch_name).includes(q)
    );
  }, [sortedPeople, filterA]);

  const filteredListB = useMemo(() => {
    const q = normalizeArabicSearchText(filterB);
    if (!q) return sortedPeople;
    return sortedPeople.filter(
      (p) =>
        normalizeArabicSearchText(p.full_name).includes(q) ||
        normalizeArabicSearchText(p.nickname).includes(q) ||
        normalizeArabicSearchText(p.branch_name).includes(q)
    );
  }, [sortedPeople, filterB]);

  useEffect(() => {
    if (!isOpen || !personAId || !personBId || safePeople.length === 0) {
      setAnalysis(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function runRadarQuery() {
      try {
        const [resA, resB] = await Promise.all([
          fetchAncestorsPathFromSupabase(personAId, peopleMap),
          fetchAncestorsPathFromSupabase(personBId, peopleMap),
        ]);

        if (cancelled) return;
        const result = analyzeKinshipPaths(
          personAId,
          personBId,
          resA.path,
          resB.path,
          peopleMap,
          resA.usedRpc || resB.usedRpc
        );
        setAnalysis(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void runRadarQuery();

    return () => {
      cancelled = true;
    };
  }, [isOpen, personAId, personBId, safePeople.length, peopleMap]);

  if (!isOpen) return null;

  function handleSwap() {
    setPersonAId(personBId);
    setPersonBId(personAId);
  }

  function handleIlluminateTree() {
    if (!analysis || !personAId || !personBId) return;
    const personA = peopleMap.get(personAId);
    const personB = peopleMap.get(personBId);
    onHighlightTreePath({
      personAId,
      personBId,
      personAName: personA?.full_name || analysis.pathA[0]?.full_name || 'الفرد الأول',
      personBName: personB?.full_name || analysis.pathB[0]?.full_name || 'الفرد الثاني',
      commonAncestorId: analysis.commonAncestor?.id ?? null,
      commonAncestorName: analysis.commonAncestor?.full_name ?? null,
      title: analysis.title,
      stepsFromA: analysis.stepsFromA,
      stepsFromB: analysis.stepsFromB,
      totalGenerations: analysis.totalGenerations,
      pathIds: analysis.bridgeIds,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="رادار صلة القرابة التفاعلي"
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#D4AF37]/60 bg-white shadow-xl">
        {/* رأس الرادار بتصميم ملكي */}
        <div className="flex items-start justify-between gap-4 border-b border-[#D4AF37]/35 bg-[#0F2350] px-6 py-5 text-[#FAF3DF]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/60 bg-[#16326E] text-[#F6DF85]">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heritage text-xl font-bold text-[#FFFFFF]">
                رادار صلة القرابة التفاعلي · كيف يقرب لي؟
              </h2>
              <p className="mt-0.5 text-xs text-[#FAF3DF]/80">
                اختر اسمك واسم أي فرد آخر لاكتشاف الجد الجامع المشترك، عدد الأجيال الفاصلة، وإضاءة المسار الذهبي على الشجرة.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق رادار القرابة"
            className="rounded-lg p-1.5 text-[#FAF3DF]/80 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {safePeople.length < 2 ? (
            <div className="py-10 text-center text-sm text-[#57534E]">
              يلزم وجود فردين على الأقل في الشجرة لتشغيل رادار صلة القرابة.
            </div>
          ) : (
            <>
              {/* اختيار الشخصين مع تصفية سريعة */}
              <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-11">
                <div className="space-y-2 md:col-span-5">
                  <label className="block text-xs font-semibold text-[#1C1917]">
                    الشخص الأول (أنت / المختار)
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#78716C]"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={filterA}
                      onChange={(e) => setFilterA(e.target.value)}
                      placeholder="تصفية قائمة الأسماء..."
                      className="w-full rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] py-1.5 pr-8 pl-3 text-xs text-[#1C1917] placeholder:text-[#78716C] focus:border-[#0F2350] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <select
                    value={personAId}
                    onChange={(e) => setPersonAId(e.target.value)}
                    aria-label="اختيار الشخص الأول"
                    className="w-full rounded-lg border border-[#D6CEBE] bg-white px-3 py-2.5 text-sm font-medium text-[#1C1917] focus:border-[#0F2350] focus:outline-none"
                  >
                    {filteredListA.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                        {p.nickname ? ` (${p.nickname})` : ''}
                        {p.generation ? ` · ج${p.generation}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-center md:col-span-1">
                  <button
                    type="button"
                    onClick={handleSwap}
                    aria-label="تبديل الشخصين"
                    title="تبديل الشخصين"
                    className="rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] p-2.5 text-[#57534E] hover:bg-[#F2EFE9] hover:text-[#1C1917] cursor-pointer"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2 md:col-span-5">
                  <label className="block text-xs font-semibold text-[#1C1917]">
                    الشخص الثاني (القريب المستعلم عنه)
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#78716C]"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={filterB}
                      onChange={(e) => setFilterB(e.target.value)}
                      placeholder="تصفية قائمة الأسماء..."
                      className="w-full rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] py-1.5 pr-8 pl-3 text-xs text-[#1C1917] placeholder:text-[#78716C] focus:border-[#0F2350] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <select
                    value={personBId}
                    onChange={(e) => setPersonBId(e.target.value)}
                    aria-label="اختيار الشخص الثاني"
                    className="w-full rounded-lg border border-[#D6CEBE] bg-white px-3 py-2.5 text-sm font-medium text-[#1C1917] focus:border-[#0F2350] focus:outline-none"
                  >
                    {filteredListB.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                        {p.nickname ? ` (${p.nickname})` : ''}
                        {p.generation ? ` · ج${p.generation}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* نتيجة التحليل عبر get_ancestors_path */}
              {loading ? (
                <div className="mt-6 flex items-center justify-center gap-2.5 rounded-xl border border-[#E5E0D5] bg-[#FAF8F4] py-10 text-xs text-[#57534E]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#0F2350]" />
                  <span>جاري تتبع مسارات الآباء وحساب الجد الجامع المشترك...</span>
                </div>
              ) : (
                analysis && (
                  <div className="mt-6 rounded-xl border border-[#D4AF37]/50 bg-[#FAF8F4] p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E5E0D5] pb-4">
                      <div>
                        <p className="text-xs font-medium text-[#92400E]">نتيجة رادار القرابة</p>
                        <h3 className="font-heritage mt-1 text-2xl font-bold text-[#0F2350]">
                          {analysis.title}
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                          {analysis.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleIlluminateTree}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D4AF37] bg-[#0F2350] px-5 py-2.5 text-xs font-semibold text-[#F6DF85] shadow-xs hover:bg-[#16326E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="h-4 w-4 text-[#F6DF85]" />
                        <span>إضاءة المسار الذهبي على الشجرة</span>
                      </button>
                    </div>

                    {/* مؤشرات الجد الجامع وعدد الأجيال الفاصلة */}
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-[#E5E0D5] bg-white p-3.5">
                        <p className="text-[11px] text-[#78716C]">الجد الجامع المشترك</p>
                        <p className="mt-1 text-sm font-bold text-[#14532D]">
                          {analysis.commonAncestor?.full_name || 'غير متصل بجد مشترك مباشر'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#E5E0D5] bg-white p-3.5">
                        <p className="text-[11px] text-[#78716C]">عدد الأجيال الفاصلة</p>
                        <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[#0F2350]">
                          {analysis.commonAncestor ? `${analysis.totalGenerations} أجيال` : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#E5E0D5] bg-white p-3.5">
                        <p className="text-[11px] text-[#78716C]">تفصيل الصعود للجد المشترك</p>
                        <p className="mt-1 font-mono text-xs font-semibold tabular-nums text-[#92400E]">
                          {analysis.commonAncestor
                            ? `${analysis.stepsFromA} ↑ من الأول · ${analysis.stepsFromB} ↑ من الثاني`
                            : 'مساران منفصلان'}
                        </p>
                      </div>
                    </div>

                    {/* مسار الصعود نحو الجد الجامع */}
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-[#E5E0D5] bg-white p-3.5">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#1C1917]">
                          <GitBranch className="h-3.5 w-3.5 text-[#14532D]" />
                          <span>مسار الشخص الأول نحو الجد</span>
                        </div>
                        <p className="text-xs leading-loose text-[#57534E]">
                          {(analysis.stepsFromA >= 0
                            ? analysis.pathA.slice(0, analysis.stepsFromA + 1)
                            : analysis.pathA
                          )
                            .map((n) => n.full_name)
                            .join(' ← ') || '—'}
                        </p>
                      </div>

                      <div className="rounded-lg border border-[#E5E0D5] bg-white p-3.5">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#1C1917]">
                          <GitBranch className="h-3.5 w-3.5 text-[#92400E]" />
                          <span>مسار الشخص الثاني نحو الجد</span>
                        </div>
                        <p className="text-xs leading-loose text-[#57534E]">
                          {(analysis.stepsFromB >= 0
                            ? analysis.pathB.slice(0, analysis.stepsFromB + 1)
                            : analysis.pathB
                          )
                            .map((n) => n.full_name)
                            .join(' ← ') || '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
