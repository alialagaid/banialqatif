import React from 'react';
import type { Profile } from '../types/database';
import { getRoleBadgeClasses, getRoleLabelArabic, isPrivilegedRole } from '../utils/kinship';

export type ActiveTab = 'tree' | 'kinship' | 'my-requests' | 'account' | 'admin';

interface HeaderProps {
  profile: Profile | null;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onSignOut: () => void;
  pendingCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  activeTab,
  onSelectTab,
  onSignOut,
  pendingCount = 0,
}) => {
  const isManager = isPrivilegedRole(profile?.role);

  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E0D5] bg-[#FAF8F4]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
        {/* Zone 1: Brand Crest & Wordmark (single line) */}
        <button
          type="button"
          onClick={() => onSelectTab('tree')}
          className="inline-flex items-center gap-2.5 font-heritage text-xl sm:text-2xl font-bold tracking-tight text-[#14532D] whitespace-nowrap shrink-0 cursor-pointer hover:opacity-85 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#14532D]"
        >
          <img
            src="/assets/aistudio/image_6f64ce03_5e9cd2c7.jpg"
            alt="شعار آل مال الله - شجرة عشيرة بني القطيف"
            className="h-9 w-9 rounded-lg border border-[#D6CEBE] object-cover shadow-xs shrink-0"
          />
          <span>شجرة عائلة بني قطيف</span>
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        {profile && (
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#57534E]">
            <button
              type="button"
              onClick={() => onSelectTab('tree')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'tree'
                  ? 'border-[#14532D] text-[#1C1917] font-semibold'
                  : 'border-transparent hover:text-[#1C1917]'
              }`}
            >
              شجرة العائلة
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('kinship')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'kinship'
                  ? 'border-[#14532D] text-[#1C1917] font-semibold'
                  : 'border-transparent hover:text-[#1C1917]'
              }`}
            >
              حاسبة القرابة
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('my-requests')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'my-requests'
                  ? 'border-[#14532D] text-[#1C1917] font-semibold'
                  : 'border-transparent hover:text-[#1C1917]'
              }`}
            >
              طلباتي
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('account')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'account'
                  ? 'border-[#14532D] text-[#1C1917] font-semibold'
                  : 'border-transparent hover:text-[#1C1917]'
              }`}
            >
              حسابي
            </button>
            {isManager && (
              <button
                type="button"
                onClick={() => onSelectTab('admin')}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'admin'
                    ? 'border-[#14532D] text-[#1C1917] font-semibold'
                    : 'border-transparent hover:text-[#1C1917]'
                }`}
              >
                لوحة الإدارة والتحكم
                {pendingCount > 0 ? ` (${pendingCount})` : ''}
              </button>
            )}
          </nav>
        )}

        {/* Zone 3: User Name, Role Badge & Sign Out */}
        <div className="flex items-center gap-3 shrink-0">
          {profile && (
            <>
              <div className="hidden sm:flex items-center gap-2 whitespace-nowrap shrink-0">
                <span className="text-xs font-semibold text-[#1C1917]">
                  {profile.full_name}
                </span>
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${getRoleBadgeClasses(profile.role)}`}
                >
                  {getRoleLabelArabic(profile.role)}
                </span>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="px-4 py-2 text-xs font-medium text-[#1C1917] border border-[#D6CEBE] bg-white rounded-lg hover:bg-[#F2EFE9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                تسجيل الخروج
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile secondary navigation row */}
      {profile && (
        <div className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-[#E5E0D5] px-4 py-2 text-xs font-medium text-[#57534E]">
          <button
            type="button"
            onClick={() => onSelectTab('tree')}
            className={`whitespace-nowrap shrink-0 px-2 py-1 ${
              activeTab === 'tree' ? 'text-[#14532D] font-semibold' : ''
            }`}
          >
            شجرة العائلة
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('kinship')}
            className={`whitespace-nowrap shrink-0 px-2 py-1 ${
              activeTab === 'kinship' ? 'text-[#14532D] font-semibold' : ''
            }`}
          >
            حاسبة القرابة
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('my-requests')}
            className={`whitespace-nowrap shrink-0 px-2 py-1 ${
              activeTab === 'my-requests' ? 'text-[#14532D] font-semibold' : ''
            }`}
          >
            طلباتي
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('account')}
            className={`whitespace-nowrap shrink-0 px-2 py-1 ${
              activeTab === 'account' ? 'text-[#14532D] font-semibold' : ''
            }`}
          >
            حسابي
          </button>
          {isManager && (
            <button
              type="button"
              onClick={() => onSelectTab('admin')}
              className={`whitespace-nowrap shrink-0 px-2 py-1 ${
                activeTab === 'admin' ? 'text-[#14532D] font-semibold' : ''
              }`}
            >
              لوحة الإدارة والتحكم
              {pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          )}
          <span
            className={`mr-auto inline-flex sm:hidden items-center rounded border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${getRoleBadgeClasses(profile.role)}`}
          >
            {profile.full_name} · {getRoleLabelArabic(profile.role)}
          </span>
        </div>
      )}
    </header>
  );
};
