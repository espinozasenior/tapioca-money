/**
 * Compute the deterministic Kernel V3.3 counterfactual address for a given signer.
 *
 * This replaces the need for SmartWalletsProvider to provide user.smartWallet.address.
 * The address is computed from: keccak256(signer + factory + salt) — same every time
 * for the same signer. No deployment happens — createKernelAccount just computes it.
 */

import { baseClient } from "@/lib/shared/rpc-client";

const ENTRYPOINT_V07 = {
  address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`,
  version: "0.7" as const,
};

/**
 * Compute the deterministic Kernel V3.3 address for an ERC-4337 account.
 *
 * @param signerAddress - The embedded wallet address that will be the sudo signer
 * @returns The deterministic counterfactual Kernel address (not deployed yet)
 */
export async function computeKernelAddress(signerAddress: `0x${string}`): Promise<`0x${string}`> {
  const { createKernelAccount } = await import("@zerodev/sdk");
  const { KERNEL_V3_3 } = await import("@zerodev/sdk/constants");
  const { signerToEcdsaValidator } = await import("@zerodev/ecdsa-validator");
  const { toAccount } = await import("viem/accounts");

  const publicClient = baseClient;

  // Create a minimal signer — only address needed for counterfactual computation
  const minimalSigner = toAccount({
    address: signerAddress,
    signMessage: async () => {
      throw new Error("Not needed for address computation");
    },
    signTransaction: async () => {
      throw new Error("Not needed for address computation");
    },
    signTypedData: async () => {
      throw new Error("Not needed for address computation");
    },
  });

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: minimalSigner,
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
  });

  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint: ENTRYPOINT_V07,
    kernelVersion: KERNEL_V3_3,
  });

  return kernelAccount.address as `0x${string}`;
}
