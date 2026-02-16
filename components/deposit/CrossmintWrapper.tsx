import React from "react";
import {
  CrossmintCheckoutProvider,
  CrossmintProvider,
} from "@crossmint/client-sdk-react-ui";
import { Checkout } from "./Checkout";

const CLIENT_API_KEY_CONSOLE_FUND = process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY;

interface CrossmintWrapperProps {
  amount: string;
  isAmountValid: boolean;
  walletAddress: string;
  onPaymentCompleted: () => void;
  receiptEmail: string;
  onProcessingPayment: () => void;
  step: "options" | "processing" | "completed";
  goBack: () => void;
}

export default function CrossmintWrapper(props: CrossmintWrapperProps) {
  return (
    <CrossmintProvider apiKey={CLIENT_API_KEY_CONSOLE_FUND as string}>
      <CrossmintCheckoutProvider>
        <Checkout {...props} />
      </CrossmintCheckoutProvider>
    </CrossmintProvider>
  );
}
