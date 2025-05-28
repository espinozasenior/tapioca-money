import { CrossmintEmbeddedCheckout, useCrossmintCheckout } from "@crossmint/client-sdk-react-ui";
import { useEffect } from "react";
import { AmountBreakdown } from "./AmountBreakdown";

const USDC_LOCATOR = `base-sepolia:${process.env.NEXT_PUBLIC_USDC_TOKEN_MINT}:${process.env.NEXT_PUBLIC_USDC_TOKEN_MINT}`;

const CHECKOUT_APPEARANCE = {
  rules: {
    Label: {
      font: {
        family: "Inter",
        size: "14px",
        weight: "500",
      },
      colors: {
        text: "#374151",
      },
    },
    Input: {
      borderRadius: "8px",
      font: {
        family: "Inter",
        size: "16px",
        weight: "400",
      },
      colors: {
        text: "#000000",
        background: "#FFFFFF",
        border: "#E0E0E0",
        boxShadow: "none",
        placeholder: "#999999",
      },
      hover: {
        colors: {
          border: "#0074D9",
        },
      },
      focus: {
        colors: {
          border: "#0074D9",
          boxShadow: "none",
        },
      },
    },
    PrimaryButton: {
      colors: {
        background: "#0D42E4",
      },
      hover: {
        colors: {
          background: "#0A2FA2",
        },
      },
      disabled: {
        colors: {
          background: "#F1F5F9",
        },
      },
    },
    DestinationInput: {
      display: "hidden",
    },
    ReceiptEmailInput: {
      display: "hidden",
    },
  },
} as const;

type CheckoutProps = {
  amount: string;
  walletAddress: string;
  onPaymentCompleted: () => void;
  receiptEmail: string;
  onProcessingPayment: () => void;
  isAmountValid: boolean;
  step: "options" | "processing" | "completed";
}

export function Checkout({
  amount,
  walletAddress,
  onPaymentCompleted,
  receiptEmail,
  onProcessingPayment,
  isAmountValid,
  step,
}: CheckoutProps) {
  const { order } = useCrossmintCheckout();
  const isUserInputPhase =
    order?.phase == null ||
    order.phase === "quote" ||
    order.phase === "payment";

  console.log("Order Phase: ", order?.phase);

  useEffect(() => {
    if (order?.phase === "completed") {
      onPaymentCompleted();
    }
    if (order?.phase === "delivery") {
      onProcessingPayment();
    }
  }, [order]);

  return (
    <div className="space-y-4 w-full">
      {step !== "completed" &&
        <AmountBreakdown
          quote={order?.lineItems[0].quote}
          inputAmount={amount ? Number.parseFloat(amount) : 0}
          isAmountValid={isAmountValid}
        />
      }
      {amount && isAmountValid &&
        <CrossmintEmbeddedCheckout
          recipient={{
            walletAddress,
          }}
          lineItems={{
            tokenLocator: USDC_LOCATOR,
            executionParameters: {
              mode: "exact-in",
              amount: amount || "0.00",
              maxSlippageBps: "500",
            },
          }}
          payment={{
            crypto: { enabled: false },
            fiat: {
              enabled: true,
              allowedMethods: {
                card: true,
                applePay: false,
                googlePay: false,
              },
            },
            receiptEmail: "angel@paella.dev",
          }}
          appearance={CHECKOUT_APPEARANCE}
        />
      }
    </div>
  );
}