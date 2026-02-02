"use client";

import { useAgentActivity, useAgentGains } from "@/hooks/useAgentActivity";
import { useState } from "react";

interface AgentStatsProps {
  address?: string;
}

export function AgentStats({ address }: AgentStatsProps) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('all');
  const { data: activityData, isLoading: activityLoading } = useAgentActivity(address);
  const { data: gainsData, isLoading: gainsLoading } = useAgentGains(address, period);

  if (activityLoading || gainsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const stats = activityData?.stats || {
    totalRebalances: 0,
    successfulRebalances: 0,
    failedRebalances: 0,
    totalSaved: 0,
  };

  const successRate = stats.totalRebalances > 0
    ? (stats.successfulRebalances / stats.totalRebalances) * 100
    : 0;

  const gains = gainsData || {
    totalGain: 0,
    averageApyImprovement: 0,
    rebalanceCount: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Performance Metrics</h3>

        {/* Period Selector */}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as any)}
          className="px-3 py-1 border rounded-lg text-sm"
        >
          <option value="day">Last 24 Hours</option>
          <option value="week">Last Week</option>
          <option value="month">Last Month</option>
          <option value="year">Last Year</option>
          <option value="all">All Time</option>
        </select>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Rebalances"
          value={stats.totalRebalances}
          icon="🔄"
        />
        <StatCard
          title="Success Rate"
          value={`${successRate.toFixed(1)}%`}
          icon="✅"
          valueColor={successRate >= 95 ? "text-green-600" : successRate >= 80 ? "text-yellow-600" : "text-red-600"}
        />
        <StatCard
          title="Avg APY Gain"
          value={`+${(gains.averageApyImprovement * 100).toFixed(2)}%`}
          icon="📈"
          valueColor="text-green-600"
        />
        <StatCard
          title="Est. Yearly Gain"
          value={`$${gains.totalGain.toFixed(2)}`}
          icon="💰"
          valueColor="text-green-600"
        />
      </div>

      {/* Detailed Stats */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm text-gray-700">Detailed Statistics</h4>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Successful:</span>
            <span className="font-medium text-green-600">{stats.successfulRebalances}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Failed:</span>
            <span className="font-medium text-red-600">{stats.failedRebalances}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Value Moved:</span>
            <span className="font-medium">${stats.totalSaved.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Rebalances ({period}):</span>
            <span className="font-medium">{gains.rebalanceCount}</span>
          </div>
        </div>
      </div>

      {/* Performance Breakdown */}
      {gainsData?.breakdown && gainsData.breakdown.length > 0 && (
        <div className="border rounded-lg p-4">
          <h4 className="font-medium text-sm text-gray-700 mb-3">Recent Rebalances</h4>
          <div className="space-y-2">
            {gainsData.breakdown.slice(0, 5).map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-sm py-2 border-b last:border-0">
                <div className="flex-1">
                  <span className="font-medium">{item.fromProtocol}</span>
                  <span className="text-gray-400 mx-2">→</span>
                  <span className="font-medium">{item.toProtocol}</span>
                </div>
                <div className="text-right">
                  <div className="text-green-600 font-medium">
                    +{(item.apyImprovement * 100).toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    ${item.amount.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visual Indicator */}
      <div className="border rounded-lg p-4 bg-gradient-to-r from-green-50 to-blue-50">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Agent Status</div>
            <div className="text-lg font-semibold text-green-600 mt-1">
              ● Active & Monitoring
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Next Check</div>
            <div className="text-sm font-medium mt-1">Within 5 minutes</div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  valueColor?: string;
}

function StatCard({ title, value, icon, valueColor = "text-gray-900" }: StatCardProps) {
  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}
