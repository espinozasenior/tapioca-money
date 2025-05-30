import React from "react";
import { DepositButton } from "./common/DepositButton";
import Image from "next/image";
import { useActivityFeed, ActivityEvent } from "../hooks/useActivityFeed";
import { Container } from "./common/Container";

interface ActivityFeedProps {
  onDepositClick: () => void;
  walletAddress: string;
}

export function ActivityFeed({ onDepositClick, walletAddress }: ActivityFeedProps) {
  const { data: events = [], isLoading, error } = useActivityFeed(walletAddress);

  return (
    <Container className="flex min-h-[350px] w-full max-w-5xl flex-grow flex-col">
      <div className="mb-2 text-base text-slate-500">Last activity</div>
      <div
        className={`flex w-full flex-1 flex-col items-center ${isLoading ? "justify-center" : "justify-start"}`}
      >
        {!isLoading && events.length === 0 && (
          <>
            <div className="mb-2 text-center text-base font-semibold text-slate-900">
              Your activity feed
            </div>
            <div className="mb-7 max-w-xl text-center text-slate-500">
              When you add, send and receive money it shows up here.
              <br />
              Get started with making a deposit to your account
            </div>
            <div>
              <DepositButton onClick={onDepositClick} />
            </div>
          </>
        )}
        <div
          className={`flex w-full items-center ${isLoading ? "justify-center" : "justify-start"}`}
        >
          {isLoading && (
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          )}
          {error && <div className="text-center text-red-500">{error.message}</div>}
          {!isLoading && !error && events.length > 0 && (
            <ul className="w-full">
              {events.slice(0, 10).map((event) => {
                const isOutgoing = event.from_address.toLowerCase() === walletAddress.toLowerCase();
                const counterparty = isOutgoing ? event.to_address : event.from_address;
                return (
                  <li key={event.transaction_hash} className="flex items-center gap-4 py-4">
                    <div className="flex h-[50px] w-[50px]  items-center justify-center rounded-full bg-slate-50">
                      {isOutgoing ? (
                        <Image src="/arrow-up-right-icon.svg" alt="Sent" width={24} height={24} />
                      ) : (
                        <Image src="/plus-icon-black.svg" alt="Received" width={24} height={24} />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-medium text-slate-900">
                        {counterparty.slice(0, 6)}...{counterparty.slice(-4)}
                      </div>
                      <div className="text-sm text-slate-500">
                        {new Date(event.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div
                        className={`text-base font-semibold ${isOutgoing ? "text-slate-700" : "text-emerald-500"}`}
                      >
                        {isOutgoing ? "-" : "+"} {Number(event.amount).toFixed(2)}
                      </div>
                      <div className="text-right text-sm text-slate-500">{event.token_symbol}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Container>
  );
}
