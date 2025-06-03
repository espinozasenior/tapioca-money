<div align="center">
<img width="200" alt="Image" src="https://github.com/user-attachments/assets/8b617791-cd37-4a5a-8695-a7c9018b7c70" />
<br>
<br>
<h1>Fintech EVM Wallets Quickstart</h1>

<div align="center">
<a href="https://fintech-evm-wallets-quickstart-git-main-crossmint.vercel.app/">Live Demo</a> | <a href="https://docs.crossmint.com/introduction/platform/wallets">Docs</a> | <a href="https://github.com/crossmint">See all quickstarts</a>
</div>

<br>
<br>
<img src="https://github.com/user-attachments/assets/73db7690-0af1-4dbd-9522-d8338c91db00" alt="Image" width="full">
</div>

## Introduction

Create your own Fintech app in minutes using **Crossmint Wallets** and **Onramp payments**.

**Key features**

- Create a wallet
- Check wallet balance
- Buy USDC with a credit card (via Onramp)
- Transfer USDC to another wallet or email
- View wallet activity

## Deploy

Easily deploy the template to Vercel with the button below. You will need to set the required environment variables in the Vercel dashboard.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCrossmint%2Ffintech-evm-wallets-quickstart&env=NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY)

## Setup

1. Clone the repository and navigate to the project folder:

```bash
git clone https://github.com/crossmint/fintech-evm-wallets-quickstart.git && cd fintech-evm-wallets-quickstart
```

2. Install all dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Set up the environment variables:

```bash
cp .env.template .env
```

4. Retrieve your **development client** and **server API keys** from [Crossmint Console](https://staging.crossmint.com/console) and add them to the `.env` file:

```env
NEXT_PUBLIC_CROSSMINT_API_KEY=your_client_side_API_key
NEXT_PUBLIC_CROSSMINT_SERVER_API_KEY=your_server_side_API_key
```

5. Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

## Using in production

This starter app is designed for rapid prototyping and testing in a staging environment.

👉 [**Contact our sales team**](https://www.crossmint.com/contact/sales) to discuss your use case and get access to production-ready APIs and support.

## Email customization

Email OTP is a login method that allows users to sign in to your app using their email address. They receive a one-time code via email that they can use to log in.

You can customize the email template to align with your brand's identity. We **strongly recommend** doing so, as it increases user trust and security.

To modify the email template:

1. In the Crossmint Console, click on Settings, and navigate to the **Branding** tab.
2. Here, you can customize:
   - The **logo** displayed in the email with your logo.
   - The **display name** textbox to include your brand's name.

## Enabling Withdrawal

For enabling withdrawal first you need to move to production, as the offramp doesn't allow testnets. For doing so, please contact our [sales team](https://www.crossmint.com/contact/sales). After that you'll need to:

1. [Create a Coinbase developer account](https://www.coinbase.com/en-es/developer-platform)
2. Create a Server API Key
3. Add the `NEXT_PUBLIC_COINBASE_APP_ID`, `COINBASE_API_KEY_ID`, and `API_KEY_SECRET` to the `.env` file.
4. In the [Onramp configuration](https://portal.cdp.coinbase.com/products/onramp) add your domain to the domain allowlist
