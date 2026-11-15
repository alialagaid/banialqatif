import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  GitBranch,
  Loader2,
  MessageSquare,
  Search,
  Send,
  User,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { invokeSwiftSearch } from '../services/swiftFunction';
import type {
  ChatMessage,
  FamilyPerson,
  FamilySearchResult,
  Profile,
} from '../types/database';
import { getPersonTribeTitle } from '../utils/familyPersonDb';
import {
  buildLineageChain,
  createPeopleMap,
  normalizeArabicSearchText,
  stripPatronymicConnectors,
} from '../utils/kinship';

interface SmartSearchBarProps {
  people: FamilyPerson[];
  profiles?: Profile[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearchMatchedIdsChange?: (ids: string[]) => void;
  onSelectSearchResult: (personId: string) => void;
  onSelectPerson: (personId: string) => void;
}

const SUGGESTED_QUESTIONS = [
  'من هم أبناء الجد المؤسس في شجرة بني قطيف؟',
  'اذكر أسماء أفراد الجيل الثالث مع فروعهم.',
  'ابحث عن الأشخاص المتوفين وأعمارهم التقريبية.',
];

export const SmartSearchBar: React.FC<SmartSearchBarProps> = ({
  people = [],
  profiles = [],
  searchQuery,
  onSearchQueryChange,
  onSearchMatchedIdsChange,
  onSelectSearchResult,
  onSelectPerson,
}) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // حالة البحث السريع عبر الدالة البرمجية search_family_members
  const [rpcResults, setRpcResults] = useState<FamilySearchResult[]>([]);
  const [isSearchingRpc, setIsSearchingRpc] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [rpcFallbackUsed, setRpcFallbackUsed] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const rpcRequestSeqRef = useRef(0);

  const peopleMap = useMemo(() => createPeopleMap(people), [people]);

  const profileByPersonId = useMemo(() => {
    const map = new Map<string, Profile>();
    if (!Array.isArray(profiles)) return map;
    for (const prof of profiles) {
      if (prof?.person_id) {
        map.set(prof.person_id, prof);
      }
    }
    return map;
  }, [profiles]);

  // بحث احتياطي محلي بالاسم الثنائي والثلاثي والرباعي والكنية عند تعذر استدعاء RPC
  const buildLocalFallbackResults = useCallback(
    (rawQuery: string): FamilySearchResult[] => {
      const normalizedQuery = normalizeArabicSearchText(rawQuery);
      const strippedQuery = stripPatronymicConnectors(normalizedQuery);
      if (normalizedQuery.length < 2) return [];

      const queryTokens = strippedQuery.split(' ').filter(Boolean);
      const matches: FamilySearchResult[] = [];

      for (const p of people) {
        const linked = profileByPersonId.get(p.id);
        const nickname = p.nickname || linked?.nickname || null;
        const tribeTitle = getPersonTribeTitle(p) || null;
        const { chainText } = buildLineageChain(p.id, peopleMap);
        const lineageText = chainText || p.full_name;

        const normFull = normalizeArabicSearchText(p.full_name);
        const normNick = normalizeArabicSearchText(nickname);
        const normLineage = normalizeArabicSearchText(lineageText);
        const strippedLineage = stripPatronymicConnectors(normLineage);
        const normTribe = normalizeArabicSearchText(tribeTitle);

        const directMatch =
          normFull.includes(normalizedQuery) ||
          normNick.includes(normalizedQuery) ||
          normLineage.includes(normalizedQuery) ||
          strippedLineage.includes(strippedQuery) ||
          normTribe.includes(normalizedQuery);

        const tokenMatch =
          queryTokens.length >= 2 &&
          queryTokens.every(
            (token) =>
              strippedLineage.includes(token) ||
              normFull.includes(token) ||
              normNick.includes(token) ||
              normTribe.includes(token)
          );

        if (directMatch || tokenMatch) {
          matches.push({
            id: p.id,
            full_name: p.full_name,
            lineage_name: lineageText,
            nickname,
            tribe_title: tribeTitle,
            generation: p.generation ?? null,
            branch_name: p.branch_name ?? tribeTitle,
            is_alive: p.is_alive ?? null,
            photo_url: p.photo_url || p.avatar_url || linked?.avatar_url || null,
            father_id: p.father_id ?? null,
          });
        }
      }

      return matches.slice(0, 20);
    },
    [people, peopleMap, profileByPersonId]
  );

  // استدعاء supabase.rpc('search_family_members', { search_query: query }) عند كتابة حرفين أو أكثر
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      rpcRequestSeqRef.current += 1;
      setRpcResults([]);
      setIsSearchingRpc(false);
      setRpcFallbackUsed(false);
      setHighlightedIndex(-1);
      onSearchMatchedIdsChange?.([]);
      return;
    }

    let cancelled = false;
    const seq = ++rpcRequestSeqRef.current;
    setIsSearchingRpc(true);
    setIsDropdownOpen(true);

    const timer = window.setTimeout(async () => {
      try {
        if (!supabase) {
          throw new Error('Supabase client unavailable');
        }

        const { data, error } = await supabase.rpc('search_family_members', {
          search_query: trimmed,
        });

        if (cancelled || seq !== rpcRequestSeqRef.current) return;

        if (error) {
          throw error;
        }

        const rows = Array.isArray(data) ? (data as FamilySearchResult[]) : [];
        const normalizedRows: FamilySearchResult[] = rows
          .filter((row): row is FamilySearchResult => Boolean(row && typeof row.id === 'string'))
          .map((row) => {
            const localPerson = peopleMap.get(row.id);
            const linkedProfile = profileByPersonId.get(row.id);
            const localLineage = localPerson
              ? buildLineageChain(row.id, peopleMap).chainText
              : '';
            const resolvedName = row.full_name || localPerson?.full_name || 'غير مسمى';
            const resolvedTribe =
              row.tribe_title ??
              localPerson?.tribe_title ??
              row.branch_name ??
              localPerson?.branch_name ??
              null;
            return {
              id: row.id,
              full_name: resolvedName,
              lineage_name:
                (row.lineage_name && row.lineage_name.trim()) ||
                localLineage ||
                resolvedName,
              nickname:
                row.nickname ??
                localPerson?.nickname ??
                linkedProfile?.nickname ??
                null,
              tribe_title: resolvedTribe,
              generation: row.generation ?? localPerson?.generation ?? null,
              branch_name: row.branch_name ?? resolvedTribe,
              is_alive: row.is_alive ?? localPerson?.is_alive ?? null,
              photo_url:
                row.photo_url ??
                localPerson?.photo_url ??
                localPerson?.avatar_url ??
                linkedProfile?.avatar_url ??
                null,
              father_id: row.father_id ?? localPerson?.father_id ?? null,
            };
          });

        setRpcResults(normalizedRows);
        setRpcFallbackUsed(false);
        setHighlightedIndex(normalizedRows.length > 0 ? 0 : -1);
        onSearchMatchedIdsChange?.(normalizedRows.map((item) => item.id));
      } catch {
        if (cancelled || seq !== rpcRequestSeqRef.current) return;
        const fallback = buildLocalFallbackResults(trimmed);
        setRpcResults(fallback);
        setRpcFallbackUsed(true);
        setHighlightedIndex(fallback.length > 0 ? 0 : -1);
        onSearchMatchedIdsChange?.(fallback.map((item) => item.id));
      } finally {
        if (!cancelled && seq === rpcRequestSeqRef.current) {
          setIsSearchingRpc(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    searchQuery,
    peopleMap,
    profileByPersonId,
    buildLocalFallbackResults,
    onSearchMatchedIdsChange,
  ]);

  // إغلاق القائمة المنسدلة عند النقر خارج شريط البحث
  useEffect(() => {
    function handleOutsidePointerDown(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsidePointerDown);
    return () => document.removeEventListener('mousedown', handleOutsidePointerDown);
  }, []);

  function handleSelectResult(result: FamilySearchResult) {
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    setIsChatOpen(false);
    onSelectSearchResult(result.id);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return;

    if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      return;
    }

    if (!isDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsDropdownOpen(true);
      return;
    }

    if (rpcResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % rpcResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev <= 0 ? rpcResults.length - 1 : prev - 1
      );
    } else if (e.key === 'Enter' && isDropdownOpen && highlightedIndex >= 0) {
      const chosen = rpcResults[highlightedIndex];
      if (chosen) {
        e.preventDefault();
        handleSelectResult(chosen);
      }
    }
  }

  async function handleAskAssistant(customPrompt?: string) {
    const prompt = (customPrompt ?? searchQuery).trim();
    if (!prompt || isLoading) return;

    setIsDropdownOpen(false);
    setIsChatOpen(true);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!customPrompt) {
      onSearchQueryChange('');
    }

    setIsLoading(true);
    try {
      const result = await invokeSwiftSearch(
        prompt,
        people,
        nextHistory.map((m) => ({ role: m.role, content: m.content }))
      );
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        matchedIds: result.matchedIds,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorText =
        err instanceof Error ? err.message : 'حدث خطأ أثناء الاتصال بالمساعد الذكي.';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: errorText,
          timestamp: new Date().toISOString(),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void handleAskAssistant();
  }

  const trimmedQuery = searchQuery.trim();
  const showDropdown = isDropdownOpen && trimmedQuery.length >= 2 && !isChatOpen;

  return (
    <section
      aria-label="البحث الذكي ومساعد شجرة العائلة"
      className="relative z-20 border-b border-[#E5E0D5] bg-white"
    >
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
        <form
          onSubmit={handleFormSubmit}
          className="flex flex-col gap-3 md:flex-row md:items-center"
        >
          <div ref={searchContainerRef} className="relative flex-1">
            <Search
              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                onSearchQueryChange(e.target.value);
                if (e.target.value.trim().length >= 2) {
                  setIsDropdownOpen(true);
                } else {
                  setIsDropdownOpen(false);
                }
              }}
              onFocus={() => {
                if (trimmedQuery.length >= 2) {
                  setIsDropdownOpen(true);
                }
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="ابحث بالاسم الثنائي أو الثلاثي أو الرباعي أو الكنية (مثال: أحمد علي محمد / أبو خالد)..."
              aria-expanded={showDropdown}
              aria-autocomplete="list"
              aria-controls="family-search-results-dropdown"
              className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] py-2.5 pr-10 pl-16 text-sm text-[#1C1917] placeholder:text-[#78716C] focus:border-[#14532D] focus:bg-white focus:outline-none"
            />

            <div className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {isSearchingRpc && (
                <Loader2
                  className="h-4 w-4 animate-spin text-[#14532D]"
                  aria-label="جاري البحث"
                />
              )}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchQueryChange('');
                    setRpcResults([]);
                    setIsDropdownOpen(false);
                    onSearchMatchedIdsChange?.([]);
                  }}
                  aria-label="مسح البحث"
                  className="rounded p-0.5 text-[#78716C] hover:bg-[#EBE6DF] hover:text-[#1C1917] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* القائمة المنسدلة لنتائج البحث بالنسب الرباعي والكنية ورقم الجيل */}
            {showDropdown && (
              <div
                id="family-search-results-dropdown"
                role="listbox"
                aria-label="نتائج البحث في شجرة العائلة"
                className="absolute right-0 left-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-[#D6CEBE] bg-white shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-[#F2EFE9] bg-[#FAF8F4] px-3.5 py-2 text-[11px] text-[#57534E]">
                  <span className="font-medium text-[#1C1917]">
                    {isSearchingRpc
                      ? 'جاري البحث بالاسم والنسب والكنية...'
                      : rpcResults.length > 0
                        ? `نتائج البحث المطابقة (${rpcResults.length})`
                        : 'نتائج البحث في الشجرة'}
                  </span>
                  <span className="text-[10px] text-[#78716C]">
                    {rpcFallbackUsed
                      ? 'بحث محلي بالنسب'
                      : 'اختر الفرد للتركيز عليه في الشجرة'}
                  </span>
                </div>

                {isSearchingRpc && rpcResults.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-[#57534E]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#14532D]" />
                    <span>جاري استرجاع الأنساب المطابقة...</span>
                  </div>
                ) : rpcResults.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-[#78716C]">
                    لا توجد أسماء مطابقة لـ «{trimmedQuery}» في سجل الشجرة.
                  </div>
                ) : (
                  <ul className="max-h-80 divide-y divide-[#F2EFE9] overflow-y-auto">
                    {rpcResults.map((item, idx) => {
                      const isActive = idx === highlightedIndex;
                      const genNumber = item.generation;
                      const lineageText =
                        item.lineage_name && item.lineage_name.trim()
                          ? item.lineage_name
                          : item.full_name;

                      return (
                        <li key={item.id} role="option" aria-selected={isActive}>
                          <button
                            type="button"
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            onClick={() => handleSelectResult(item)}
                            className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-right transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-[#14532D]/8'
                                : 'bg-white hover:bg-[#FAF8F4]'
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E5E0D5] bg-[#FAF8F4]">
                                {item.photo_url ? (
                                  <img
                                    src={item.photo_url}
                                    alt={item.full_name}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <User className="h-4 w-4 text-[#78716C]" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-bold text-[#1C1917]">
                                    {item.full_name}
                                  </span>

                                  {item.nickname && (
                                    <span className="rounded border border-[#FDE68A] bg-[#FFFBEB] px-1.5 py-0.5 text-[11px] font-semibold text-[#92400E]">
                                      {item.nickname}
                                    </span>
                                  )}

                                  {genNumber !== null && genNumber !== undefined && (
                                    <span className="rounded border border-[#D6CEBE] bg-[#FAF8F4] px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-[#14532D]">
                                      الجيل {genNumber}
                                    </span>
                                  )}
                                </div>

                                {(item.tribe_title || item.branch_name) && (
                                  <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-[#92400E]">
                                    <GitBranch className="h-3 w-3 shrink-0" />
                                    <span>{item.tribe_title || item.branch_name}</span>
                                  </p>
                                )}

                                <p
                                  className="mt-0.5 truncate text-xs text-[#57534E]"
                                  title={lineageText}
                                >
                                  {lineageText}
                                </p>
                              </div>
                            </div>

                            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#14532D]">
                              <span className="hidden sm:inline">تحديد في الشجرة</span>
                              <ChevronLeft className="h-4 w-4" />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="submit"
              disabled={isLoading || !searchQuery.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14532D] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#166534] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span>اسأل المساعد الذكي</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                setIsChatOpen((prev) => !prev);
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isChatOpen
                  ? 'border-[#14532D] bg-[#14532D]/5 text-[#14532D]'
                  : 'border-[#D6CEBE] bg-white text-[#1C1917] hover:bg-[#F2EFE9]'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span>محادثة الأنساب ({messages.length})</span>
            </button>
          </div>
        </form>

        {/* نافذة مساعد الدردشة الذكي المربوط بدالة swift-function */}
        {isChatOpen && (
          <div className="mt-4 rounded-xl border border-[#E5E0D5] bg-[#FAF8F4] p-4">
            <div className="flex items-center justify-between border-b border-[#E5E0D5] pb-3">
              <div>
                <h2 className="text-base font-semibold text-[#1C1917]">
                  مساعد البحث الذكي — شجرة بني قطيف
                </h2>
                <p className="text-xs text-[#57534E]">
                  استعلام فوري عن صلات القرابة والفروع والسير الذاتية عبر دالة swift-function
                </p>
              </div>
              <div className="flex items-center gap-3">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    className="text-xs text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                  >
                    مسح المحادثة
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsChatOpen(false)}
                  aria-label="إغلاق نافذة المساعد"
                  className="rounded-md p-1 text-[#57534E] hover:bg-[#EBE6DF] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {messages.length === 0 ? (
              <div className="py-5">
                <p className="mb-3 text-xs font-medium text-[#57534E]">
                  أسئلة مقترحة للبدء (يتم إرسال بيانات العائلة الحالية مع الاستعلام):
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void handleAskAssistant(q)}
                      className="rounded-lg border border-[#D6CEBE] bg-white px-3 py-2 text-xs text-[#1C1917] hover:border-[#14532D] hover:text-[#14532D] transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pl-1">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg border p-3.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'border-[#D6CEBE] bg-white text-[#1C1917]'
                        : msg.isError
                          ? 'border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]'
                          : 'border-[#E5E0D5] bg-[#F2EFE9]/70 text-[#1C1917]'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs text-[#78716C]">
                      <span className="font-semibold text-[#1C1917]">
                        {msg.role === 'user' ? 'سؤالك' : 'مساعد العائلة الذكي'}
                      </span>
                      <span className="tabular-nums">
                        {new Date(msg.timestamp).toLocaleTimeString('ar-SA', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {msg.matchedIds && msg.matchedIds.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-[#E5E0D5] pt-2 text-xs">
                        <span className="text-[#57534E]">أفراد مرتبطون:</span>
                        {msg.matchedIds.map((id) => {
                          const p = peopleMap.get(id);
                          if (!p) return null;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => onSelectPerson(id)}
                              className="font-medium text-[#14532D] hover:underline cursor-pointer"
                            >
                              {p.full_name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex items-center gap-2 rounded-lg border border-[#E5E0D5] bg-white p-3 text-xs text-[#57534E]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#14532D]" />
                    <span>جاري تحليل بيانات العائلة عبر swift-function...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
