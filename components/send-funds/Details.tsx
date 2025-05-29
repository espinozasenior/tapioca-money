import React from "react";

interface DetailsProps {
  values: { label: string; value: string }[];
}

export function Details({ values }: DetailsProps) {
  return (
    <div className="mt-2.5 flex w-full flex-col gap-[18px] rounded-2xl bg-[#F8FAFC] p-4 text-base font-semibold">
      {values.map((value) => (
        <div key={value.label} className="flex justify-between text-[#64748B]">
          <div className="text-[#64748B]">{value.label}</div>
          <div className="text-[#334155]">{value.value}</div>
        </div>
      ))}
    </div>
  );
}
