import React from 'react';
import type { ChangeRequest, FamilyPerson } from '../types/database';
import { formatDateArabic, getStatusLabelArabic } from '../utils/kinship';

interface MyRequestsViewProps {
  requests: ChangeRequest[];
  people: FamilyPerson[];
  onNewRequest: () => void;
}

export const MyRequestsView: React.FC<MyRequestsViewProps> = ({
  requests,
  people,
  onNewRequest,
}) => {
  const peopleMap = new Map(people.map((p) => [p.id, p]));

  return (
    <section className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="rounded-xl border border-[#E5E0D5] bg-white p-6 md:p-8">
        <div className="flex flex-col gap-4 border-b border-[#E5E0D5] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heritage text-2xl font-bold text-[#1C1917]">
              سجل طلبات التعديل الخاصة بي
            </h2>
            <p className="mt-1 text-sm text-[#57534E]">
              متابعة حالة طلبات تعديل أو إضافة البيانات المرسلة إلى إدارة الشجرة.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewRequest}
            className="rounded-lg bg-[#14532D] px-4 py-2 text-xs font-medium text-white hover:bg-[#166534] whitespace-nowrap shrink-0 cursor-pointer"
          >
            تقديم طلب إضافة فرد جديد
          </button>
        </div>

        {requests.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[#57534E]">لم تقم بإرسال أي طلبات تعديل بيانات حتى الآن.</p>
          </div>
        ) : (
          <div className="mt-5 divide-y divide-[#F2EFE9]">
            {requests.map((req) => {
              const targetId = req.target_person_id || req.person_id;
              const target = targetId ? peopleMap.get(targetId) : null;
              const proposedName =
                typeof req.proposed_data?.full_name === 'string'
                  ? req.proposed_data.full_name
                  : '';

              const statusColor =
                req.status === 'approved'
                  ? 'text-[#166534]'
                  : req.status === 'rejected' || req.status === 'blocked'
                    ? 'text-[#B91C1C]'
                    : 'text-[#92400E]';

              const isDelete = req.request_type === 'delete';
              const isAdd =
                req.request_type === 'add' || req.request_type === 'create' || (!isDelete && !targetId);

              return (
                <div key={req.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#1C1917]">
                      {isDelete ? (
                        <span className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-bold text-[#B91C1C]">
                          طلب حذف
                        </span>
                      ) : isAdd ? (
                        <span className="rounded border border-[#86EFAC] bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-bold text-[#166534]">
                          طلب إضافة
                        </span>
                      ) : (
                        <span className="rounded border border-[#93C5FD] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#1D4ED8]">
                          طلب تعديل
                        </span>
                      )}
                      <span>
                        {isDelete
                          ? `حذف: ${target?.full_name || proposedName || 'عضو'}`
                          : isAdd
                            ? `إضافة فرد: ${proposedName}`
                            : `تعديل بيانات: ${target?.full_name || proposedName || 'عضو'}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs tabular-nums">
                      <span className={`font-semibold ${statusColor}`}>
                        {getStatusLabelArabic(req.status)}
                      </span>
                      <span className="text-[#78716C]">·</span>
                      <span className="font-mono text-[#78716C]">
                        {formatDateArabic(req.created_at)}
                      </span>
                    </div>
                  </div>

                  {!isDelete && req.proposed_data && (
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] px-3 py-2 text-xs text-[#57534E]">
                      {Boolean(req.proposed_data.tribe_title || req.proposed_data.branch_name) && (
                        <span>
                          اللقب / القبيلة:{' '}
                          <strong className="text-[#1C1917]">
                            {String(req.proposed_data.tribe_title || req.proposed_data.branch_name)}
                          </strong>
                        </span>
                      )}
                      {Boolean(req.proposed_data.birth_date || req.proposed_data.birth_year) && (
                        <span>
                          الميلاد:{' '}
                          <strong className="font-mono text-[#1C1917]">
                            {String(req.proposed_data.birth_date || req.proposed_data.birth_year)}
                          </strong>
                        </span>
                      )}
                      <span>
                        الحالة:{' '}
                        <strong
                          className={
                            req.proposed_data.is_alive === false
                              ? 'text-[#991B1B]'
                              : 'text-[#166534]'
                          }
                        >
                          {req.proposed_data.is_alive === false
                            ? `متوفى${
                                req.proposed_data.death_date || req.proposed_data.death_year
                                  ? ` (${String(
                                      req.proposed_data.death_date || req.proposed_data.death_year
                                    )})`
                                  : ''
                              }`
                            : 'على قيد الحياة'}
                        </strong>
                      </span>
                    </div>
                  )}

                  {req.reason && (
                    <p className="mt-1.5 text-xs text-[#57534E]">السبب: {req.reason}</p>
                  )}

                  {req.security_notes && (
                    <p className="mt-1 text-xs text-[#78716C]">
                      الفحص الأمني: {req.security_notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
