import React from "react";

interface DetailsProps {
  values: { label: string; value: string }[];
}

export function Details({ values }: DetailsProps) {
  return (
    <div className="mt-2.5 text-base p-4 w-full gap-[18px] flex flex-col font-semibold bg-[#F8FAFC] rounded-2xl">
      {values.map((value) => (
        <div key={value.label} className="flex justify-between text-[#64748B]">
          <div className="text-[#64748B]">{value.label}</div>
          <div className="text-[#334155]">{value.value}</div>
        </div>
      ))}
    </div>
  );
} 