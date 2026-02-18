"use client";

import { useAgentActivity } from "@/hooks/useAgentActivity";
import { useState } from "react";

interface AgentActivityLogProps {
  address?: string;
}

export function AgentActivityLog({ address }: AgentActivityLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, error } = useAgentActivity(address);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-600">
        Failed to load activity: {error.message}
      </div>
    );
  }

  if (!data || data.activities.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="text-lg">No agent activity yet</p>
        <p className="mt-2 text-sm">Enable auto-optimize to let the agent manage your yield</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Agent Activity</h3>
        <span className="text-sm text-gray-500">{data.total} total actions</span>
      </div>

      <div className="space-y-3">
        {data.activities.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            isExpanded={expandedId === activity.id}
            onToggle={() => setExpandedId(expandedId === activity.id ? null : activity.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface ActivityCardProps {
  activity: any;
  isExpanded: boolean;
  onToggle: () => void;
}

function ActivityCard({ activity, isExpanded, onToggle }: ActivityCardProps) {
  const statusColors: Record<string, string> = {
    success: "bg-green-100 text-green-800 border-green-200",
    failed: "bg-red-100 text-red-800 border-red-200",
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  };
  const statusColor =
    statusColors[activity.status as string] || "bg-gray-100 text-gray-800 border-gray-200";

  const metadata = activity.metadata || {};
  const apyImprovement = metadata.apyImprovement || 0;
  const fromApy = metadata.fromApy || 0;
  const toApy = metadata.toApy || 0;

  return (
    <div
      className={`cursor-pointer rounded-lg border p-4 transition-all ${
        isExpanded ? "shadow-md" : "hover:shadow-sm"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className={`rounded px-2 py-1 text-xs font-medium ${statusColor} border`}>
              {activity.status}
            </span>
            <span className="text-sm font-medium">
              {activity.actionType === "rebalance" ? "🔄 Rebalance" : activity.actionType}
            </span>
            {activity.fromProtocol && activity.toProtocol && (
              <span className="text-sm text-gray-600">
                {activity.fromProtocol} → {activity.toProtocol}
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
            <span>{new Date(activity.createdAt).toLocaleString()}</span>
            {activity.amountUsdc && (
              <span className="font-medium">
                ${parseFloat(activity.amountUsdc).toFixed(2)} USDC
              </span>
            )}
            {apyImprovement > 0 && (
              <span className="font-medium text-green-600">
                +{(apyImprovement * 100).toFixed(2)}% APY
              </span>
            )}
          </div>
        </div>

        <div className="text-gray-400">{isExpanded ? "▲" : "▼"}</div>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-2 border-t pt-4 text-sm">
          {activity.txHash &&
            activity.txHash !==
              "0x0000000000000000000000000000000000000000000000000000000000000000" && (
              <div className="flex justify-between">
                <span className="text-gray-600">Transaction:</span>
                <a
                  href={`https://basescan.org/tx/${activity.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {activity.txHash.slice(0, 10)}...{activity.txHash.slice(-8)}
                </a>
              </div>
            )}

          {fromApy > 0 && toApy > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-600">Previous APY:</span>
                <span className="font-medium">{(fromApy * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">New APY:</span>
                <span className="font-medium text-green-600">{(toApy * 100).toFixed(2)}%</span>
              </div>
            </>
          )}

          {metadata.estimatedYearlyGain && (
            <div className="flex justify-between">
              <span className="text-gray-600">Est. Yearly Gain:</span>
              <span className="font-medium text-green-600">
                ${metadata.estimatedYearlyGain.toFixed(2)}
              </span>
            </div>
          )}

          {metadata.gasUsed && (
            <div className="flex justify-between">
              <span className="text-gray-600">Gas Used:</span>
              <span className="font-mono text-xs">{metadata.gasUsed}</span>
            </div>
          )}

          {activity.errorMessage && (
            <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
              <span className="font-semibold">Error:</span> {activity.errorMessage}
            </div>
          )}

          {metadata.reason && (
            <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-700">
              {metadata.reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
