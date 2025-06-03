import { getTransactions } from "@/server-actions/getTransactions";
import { erc20Abi, encodeFunctionData, Address } from "viem";
import { EVMSmartWallet } from "@crossmint/client-sdk-react-ui";
import { useEffect } from "react";
import { useBalance } from "./useBalance";
import { useActivityFeed } from "./useActivityFeed";

const getProccesedTransactions = (transactionId: string) => {
  const processedTransactions = localStorage.getItem("processedTransactions");
  if (processedTransactions) {
    return JSON.parse(processedTransactions)[transactionId] || false;
  }
  return false;
};

const setProccesedTransactions = (transactionId: string) => {
  const processedTransactions = localStorage.getItem("processedTransactions");
  if (processedTransactions) {
    JSON.parse(processedTransactions)[transactionId] = true;
  } else {
    localStorage.setItem("processedTransactions", JSON.stringify({ [transactionId]: true }));
  }
};

export function useProcessWithdrawal(userId?: string, wallet?: EVMSmartWallet) {
  const { refetch: refetchBalance } = useBalance();
  const { refetch: refetchActivityFeed } = useActivityFeed(wallet?.address!);
  useEffect(() => {
    (async () => {
      if (userId && wallet) {
        const transactions = await getTransactions(userId);
        const transaction = transactions[0];
        if (
          transaction?.status === "TRANSACTION_STATUS_STARTED" &&
          !getProccesedTransactions(transaction?.transaction_id)
        ) {
          const usdcToken = process.env.NEXT_PUBLIC_USDC_TOKEN_MINT as Address;
          const data = encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [
              transaction.to_address as Address,
              BigInt(Math.round(Number(transaction.sell_amount.value as string) * 10 ** 6)),
            ],
          });
          setProccesedTransactions(transaction.transaction_id);
          const txn = await (wallet as EVMSmartWallet).sendTransaction({
            to: usdcToken,
            value: BigInt(0),
            data,
          });
          refetchBalance();
          refetchActivityFeed();
        }
      }
    })();
  }, [userId, wallet]);
}
