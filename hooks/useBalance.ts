import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@crossmint/client-sdk-react-ui";

type TokenBalance = {
    token: string;
    decimals: number;
    balances: {
        [key: string]: string;
    };
};

async function fetchBalances(wallet: any) {
    if (!wallet) return [];
    const response = await wallet.getBalances(["usdc" as any]);
    return Array.isArray(response) ? response : [];
}

export function useBalance() {
    const { wallet, type } = useWallet();
    const { data: balances = [], isLoading, error } = useQuery({
        queryKey: ["balances", wallet?.address],
        queryFn: () => fetchBalances(wallet),
    });

    const formatBalance = (balance: string) => {
        return (Number(balance) / 10 ** 6).toFixed(2);
    };

    const usdcBalance = balances?.find((t) => t.token === "usdc")?.balances.total || "0";
    return {
        balances,
        usdcBalance,
        formatBalance,
        error: error ? (error instanceof Error ? error.message : String(error)) : null,
        isLoading
    };
} 