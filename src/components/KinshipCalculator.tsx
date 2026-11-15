import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, Sparkles } from 'lucide-react';
import type { FamilyPerson } from '../types/database';
import {
  analyzeKinshipPaths,
  createPeopleMap,
  fetchAncestorsPathFromSupabase,
  type KinshipRadarAnalysis,
  type KinshipRadarHighlight,
} from '../utils/kinship';

interface KinshipCalculatorProps {
  people: FamilyPerson[];
  defaultPersonAId?: string | null;
  onSelectPerson: (id: string) => void;
  onHighlightTreePath?: (highlight: KinshipRadarHighlight) => void;
}

export const KinshipCalculator: React.FC<KinshipCalculatorProps> = ({
  people = [],
  defaultPersonAId,
  onSelectPerson,
  onHighlightTreePath,
}) => {
  const safePeople = useMemo(
    () => (Array.isArray(people) ? people.filter((p): p is FamilyPerson => Boolean(p && p.id)) : []),
    [people]
  );
  const peopleMap = useMemo(() => createPeopleMap(safePeople), [safePeople]);

  const [personAId, setPersonAId] = useState<string>(
    (defaultPersonAId && peopleMap.has(defaultPersonAId) ? defaultPersonAId : safePeople[0]?.id) ?? ''
  );
  const [personBId, setPersonBId] = useState<string>(safePeople[1]?.id ?? safePeople[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KinshipRadarAnalysis | null>(null);

  const sortedPeople = useMemo(
    () =>
      [...safePeople].sort((a, b) =>
        (a?.full_name || '').localeCompare(b?.full_name || '', 'ar')
      ),
    [safePeople]
  );

  useEffect(() => {
    if (!personAId || !personBId || safePeople.length === 0) {
      setResult(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function computeViaRpc() {
      try {
        const [resA, resB] = await Promise.all([
          fetchAncestorsPathFromSupabase(personAId, peopleMap),
          fetchAncestorsPathFromSupabase(personBId, peopleMap),
        ]);
        if (cancelled) return;
        setResult(
          analyzeKinshipPaths(
            personAId,
            personBId,
            resA.path,
            resB.path,
            peopleMap,
            resA.usedRpc || resB.usedRpc
          )
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void computeViaRpc();
    return () => {
      cancelled = true;
    };
  }, [personAId, personBId, peopleMap, safePeople.length]);

  function swapPeople() {
    setPersonAId(personBId);
    setPersonBId(personAId);
  }

  function handleHighlightOnTree() {
    if (!result || !onHighlightTreePath) return;
    const personA = peopleMap.get(personAId);
    const personB = peopleMap.get(personBId);
    onHighlightTreePath({
      personAId,
      personBId,
      personAName: personA?.full_name || result.pathA[0]?.full_name || 'الفرد الأول',
      personBName: personB?.full_name || result.pathB[0]?.full_name || 'الفرد الثاني',
      commonAncestorId: result.commonAncestor?.id ?? null,
      commonAncestorName: result.commonAncestor?.full_name ?? null,
      title: result.title,
      stepsFromA: result.stepsFromA,
      stepsFromB: result.stepsFromB,
      totalGenerations: result.totalGenerations,
      pathIds: result.bridgeIds,
    });
  }

  return (
    <section className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="rounded-xl border border-[#E5E0D5] bg-white p-6 md:p-8">
        <div className="border-b border-[#E5E0D5] pb-5">
          <h2 className="font-heritage text-2xl font-bold text-[#1C1917]">
            رادار وحاسبة صلة القرابة في شجرة بني قطيف
          </h2>
          <p className="mt-1 text-sm text-[#57534E]">
            اختر فردين من سجل العائلة لاستدعاء مسار الآباء، استخراج الجد الجامع المشترك، وإضاءة المسار الذهبي على الشجرة.
          </p>
        </div>

        {people.length < 2 ? (
          <p className="py-8 text-center text-sm text-[#57534E]">
            يلزم وجود فردين على الأقل في جدول family_people لحساب صلة القرابة.
          </p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 items-end gap-4 md:grid-cols-11">
              <div className="md:col-span-5">
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  الفرد الأول
                </label>
                <select
                  value={personAId}
                  onChange={(e) => setPersonAId(e.target.value)}
                  className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:outline-none"
                >
                  {sortedPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} {p.branch_name ? `(${p.branch_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center md:col-span-1">
                <button
                  type="button"
                  onClick={swapPeople}
                  aria-label="تبديل الفردين"
                  className="rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] p-2.5 text-[#57534E] hover:bg-[#F2EFE9] hover:text-[#1C1917] cursor-pointer"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
              </div>

              <div className="md:col-span-5">
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  الفرد الثاني
                </label>
                <select
                  value={personBId}
                  onChange={(e) => setPersonBId(e.target.value)}
                  className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:outline-none"
                >
                  {sortedPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} {p.branch_name ? `(${p.branch_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-[#E5E0D5] bg-[#FAF8F4] py-10 text-xs text-[#57534E]">
                <Loader2 className="h-4 w-4 animate-spin text-[#14532D]" />
                <span>جاري استدعاء مسار الآباء وحساب الجد المشترك...</span>
              </div>
            ) : (
              result && (
                <div className="mt-8 rounded-xl border border-[#E5E0D5] bg-[#FAF8F4] p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-medium text-[#92400E]">النتيجة التحليلية</p>
                      <h3 className="font-heritage mt-1 text-2xl font-bold text-[#14532D]">
                        {result.title}
                      </h3>
                      <p className="mt-2 text-sm text-[#1C1917]">{result.description}</p>
                    </div>
                    {onHighlightTreePath && (
                      <button
                        type="button"
                        onClick={handleHighlightOnTree}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#D4AF37] bg-[#0F2350] px-4 py-2.5 text-xs font-semibold text-[#F6DF85] hover:bg-[#16326E] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>إضاءة المسار الذهبي على الشجرة</span>
                      </button>
                    )}
                  </div>

                  {result.commonAncestor && (
                    <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[#E5E0D5] pt-3 text-xs text-[#57534E]">
                      <div>
                        الجد الجامع المشترك:{' '}
                        <button
                          type="button"
                          onClick={() => onSelectPerson(result.commonAncestor!.id)}
                          className="font-semibold text-[#14532D] hover:underline cursor-pointer"
                        >
                          {result.commonAncestor.full_name}
                        </button>
                      </div>
                      <span aria-hidden="true">·</span>
                      <div className="font-mono tabular-nums text-[#0F2350] font-semibold">
                        عدد الأجيال الفاصلة: {result.totalGenerations} ({result.stepsFromA} ↑ · {result.stepsFromB} ↑)
                      </div>
                    </div>
                  )}

                  <div className="mt-6 grid grid-cols-1 gap-6 border-t border-[#E5E0D5] pt-5 md:grid-cols-2">
                    <div>
                      <h4 className="text-xs font-semibold text-[#57534E]">عمود نسب الفرد الأول</h4>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#1C1917]">
                        {result.pathA.map((n) => n.full_name).join(' بن ') || '—'}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[#57534E]">عمود نسب الفرد الثاني</h4>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#1C1917]">
                        {result.pathB.map((n) => n.full_name).join(' بن ') || '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>
    </section>
  );
};

