# Design System: Tapioca Finance — "Playful Pearl"
**Project ID:** 13494819943803311752
**Source:** Analyzed from Stitch-generated page

---

## 1. Visual Theme & Atmosphere

**Vibe:** Playful, warm, organic — like a boba tea shop meets modern fintech. The entire design language is built around a **bubble tea metaphor**: tapioca pearls as decorative motifs, "brewing" and "sipping" as action language to make money, and a creamy-warm palette that feels inviting rather than technical. Nothing screams "crypto" or "DeFi." It feels like ordering your favorite drink — except the drink is yield.

**Atmosphere Keywords:** Playful, bubbly, warm, friendly, organic, approachable, creamy, cozy, whimsical, trustworthy, fresh, minimal

**Brand Metaphor:** Bubble tea / boba
- Depositing = "Place Order"
- AI agent working = "Shake & Brew"
- Earning yield = "Sipping" / "Enjoy"
- APY = "Sweetness Level"
- Yield sources = "Yield Pools" / "Menu"
- Protocols = "Flavors"
- Audits = "Lab Tests"
- Docs = "Recipe Book"

---

## 2. Color Palette & Roles

### Core Palette (from Tailwind config)

| Token Name | Hex | CSS Variable | Role |
|:-----------|:----|:-------------|:-----|
| **Milktea** | `#F5F5DC` | `bg-milktea` | Page background, canvas. Warm beige/cream — like the color of milk tea. |
| **Pearl** | `#1A1A1A` | `text-pearl` | Primary text, dark UI elements, primary buttons, logo background, decorative pearl motifs. Near-black. |
| **Matcha** | `#98FB98` | `text-matcha` | Primary accent. Bright, fresh green — used for CTAs, highlights, badges, APY indicators, hover states. |
| **Creamy** | `#FFFDF5` | `border-creamy` | Subtle warm white. Card borders, soft surfaces. Barely visible against Milktea but adds depth. |

### Extended Usage Patterns

| Context | Color Application |
|:--------|:-----------------|
| Primary CTA button | `bg-pearl text-matcha` (dark bg, green text) |
| Secondary CTA button | `bg-white text-pearl border-4 border-pearl` |
| Accent badge/pill | `bg-matcha text-pearl border-2 border-pearl` |
| Highlighted text span | `text-matcha bg-pearl px-4 py-1 rounded-2xl` (green-on-dark inline highlight) |
| Muted body text | `text-pearl/80` (80% opacity) |
| Caption/subtitle | `text-pearl/60` (60% opacity) |
| Very muted text | `text-pearl/30` (30% opacity, footer copyright) |
| Inverted section (CTA) | `bg-pearl text-milktea` (dark background, cream text) |
| Inverted accent | `text-matcha` on dark background |
| Glassmorphic card | `bg-white/60 backdrop-blur-sm border-4 border-creamy` |
| Hover background | `bg-creamy` or `bg-matcha` |
| Selection color | `selection:bg-matcha selection:text-pearl` |

### Color Ratios
- **Milktea (background):** ~60% of screen area
- **Pearl (dark elements):** ~25% (text, buttons, decorative pearls, inverted section)
- **Matcha (accent):** ~10% (CTAs, badges, highlights, hover states)
- **White/Creamy:** ~5% (cards, secondary buttons, subtle borders)

---

## 3. Typography Rules

### Font Family
- **Primary:** `Quicksand` (Google Fonts) — rounded, friendly geometric sans-serif
- **Fallback:** `sans-serif`
- **Weights loaded:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Rendering:** `antialiased` (via Tailwind)

### Type Scale (from HTML analysis)

| Element | Size | Weight | Tracking | Additional |
|:--------|:-----|:-------|:---------|:-----------|
| **Hero H1** | `text-5xl` → `md:text-8xl` (48px → 96px) | `font-extrabold` (800) | Default | `leading-none` |
| **APY Number** | `text-8xl` → `md:text-9xl` (96px → 128px) | `font-black` (900) | Default | `leading-none` |
| **Section H2** | `text-5xl` (48px) | `font-black` (900) | Default | — |
| **CTA H2** | `text-5xl` → `md:text-6xl` (48px → 60px) | `font-black` (900) | Default | `leading-tight` |
| **Card H4** | `text-2xl` (24px) | `font-extrabold` (800) | Default | — |
| **Hero subtitle** | `text-xl` → `md:text-2xl` (20px → 24px) | `font-medium` (500) | Default | `leading-relaxed` |
| **Body text** | `text-xl` (20px) | `font-medium` (500) | Default | `leading-relaxed` |
| **Nav links** | `text-sm` (14px) | `font-bold` (700) | Default | Uppercase implied |
| **Badge/pill** | `text-sm` (14px) or `text-lg` (18px) | `font-bold` (700) | Default | — |
| **Section caption** | `text-lg` (18px) | `font-bold` (700) | `tracking-[0.2em]` | `uppercase` |
| **Footer links** | `text-sm` (14px) | `font-bold` (700) | `tracking-widest` | `uppercase` |
| **Footer copyright** | `text-xs` (12px) | `font-black` (900) | `tracking-[0.4em]` | `uppercase`, `text-pearl/30` |
| **APR badge** | `text-4xl` (36px) | — | Default | `align-top`, inside green-on-dark pill |
| **CTA button text** | `text-xl` (20px) or `text-2xl` (24px) | `font-extrabold`/`font-black` | Default | — |

### Typography Patterns
- **Heavy everywhere:** This design leans hard into bold/black weights. Almost nothing is regular weight.
- **Rounded font matches rounded UI:** Quicksand's circular letterforms echo the bubble/pearl motifs.
- **Uppercase for captions:** Labels and footer links use `uppercase` + wide `tracking` for a premium feel.

---

## 4. Component Stylings

### 4.1 Buttons

**Primary CTA (Dark):**
```
bg-pearl text-matcha px-14 py-6 rounded-full font-extrabold text-xl
hover:scale-105 transition-all shadow-xl
```
- Black background, matcha green text
- Pill-shaped (`rounded-full`)
- Very generous padding (56px horizontal, 24px vertical)
- Scale-up hover effect (105%)
- Drop shadow for elevation

**Secondary CTA (Outlined):**
```
bg-white text-pearl border-4 border-pearl px-14 py-6 rounded-full
font-extrabold text-xl hover:bg-creamy transition-all
```
- White background, dark text, thick dark border (4px)
- Same pill shape and padding as primary
- Hover fills with Creamy warm-white

**Nav CTA (Compact):**
```
bg-pearl text-matcha px-8 py-3 rounded-full font-bold text-sm
hover:scale-105 transition-all shadow-lg
```
- Smaller version of primary CTA for navigation

**Accent Badge/Pill:**
```
bg-matcha text-pearl px-8 py-3 rounded-full text-lg font-bold border-2 border-pearl
```
- Green background, dark text, dark border
- Used for "30+ Yield Pools" type indicators

**Inline Highlight Span:**
```
text-matcha bg-pearl px-4 py-1 rounded-2xl
```
- Green text on dark background, softly rounded
- Used inside headings for emphasis ("Sweet Rewards.")

### 4.2 Cards

**Bubbly Card (APY/Feature card):**
```css
.bubbly-card {
    background: rgba(255, 255, 255, 0.60);  /* bg-white/60 */
    backdrop-filter: blur(4px);              /* backdrop-blur-sm */
    border: 4px solid #FFFDF5;              /* border-4 border-creamy */
    border-radius: 40px;                     /* custom radius */
}
```
- Glassmorphic: semi-transparent white with backdrop blur
- Very round corners (40px)
- Thick creamy border for warmth
- Internal padding: `p-12 md:p-20`

**CTA Section Card (Inverted):**
```
bg-pearl text-milktea rounded-[60px] p-12 md:p-24
```
- Full dark background, cream text
- Extremely rounded (60px border-radius)
- Contains matcha glow orb (`bg-matcha opacity-10 rounded-full blur-3xl`)
- Feature sub-cards inside: `bg-white/10 rounded-[40px] border border-white/10`

**How It Works Icon Container:**
```
w-24 h-24 bg-milktea rounded-[40%] border-4 border-pearl
group-hover:bg-matcha transition-colors
```
- Squircle shape (`rounded-[40%]`) — between circle and square
- Milktea background with thick dark border
- Turns matcha green on hover (group hover pattern)

### 4.3 Navigation

```
sticky top-0 z-50 bg-milktea/90 backdrop-blur-md border-b-2 border-pearl/5
```
- **Sticky** at top
- Semi-transparent milktea with backdrop blur (frosted glass)
- Very subtle bottom border (5% opacity)
- Height: `h-20` (80px)
- Max width: `max-w-7xl` (1280px), centered

**Logo:**
- Black circle (`w-10 h-10 bg-pearl rounded-full`)
- Matcha green inner dot (`w-6 h-6 bg-matcha rounded-full opacity-80 blur-[1px]`)
- "Tapioca" wordmark: `text-2xl font-bold tracking-tight text-pearl`

### 4.4 Pearl Motifs (Decorative Bubbles)

```css
.pearl-motif {
    position: absolute;
    border-radius: 9999px;        /* rounded-full — perfect circle */
    background-color: #1A1A1A;    /* bg-pearl */
    box-shadow: inset -4px -4px 8px rgba(255, 255, 255, 0.1);  /* subtle inner highlight */
}
```
- Various sizes: `w-4` to `w-20` (16px to 80px)
- Various opacities: `opacity-5` to `opacity-70`
- Scattered across the page at fixed positions
- Act as the **tapioca pearl** visual motif — the brand DNA
- Some are purely decorative background, others sit on cards for visual interest

### 4.5 Bar Chart (Yield Visualization)

```
flex items-end justify-center gap-4
```
- Vertical bars using `rounded-full` (pill-shaped bars)
- Fixed width: `w-8` (32px) each
- Variable heights: 40% to 100%
- Colors alternate between `bg-pearl/10`, `bg-matcha/40`, `bg-matcha/60`, `bg-pearl`
- Tallest bar contains an animated bouncing matcha dot: `animate-bounce`
- Organic, playful feel — not a precise data chart

### 4.6 Footer

```
py-20 border-t-4 border-pearl/5
```
- Generous padding (80px vertical)
- Very subtle top border (5% opacity)
- Logo + wordmark left, nav links center, social icon right
- Links: `text-sm font-bold uppercase tracking-widest text-pearl/60`
- Copyright: `text-xs font-black tracking-[0.4em] uppercase text-pearl/30`
- Social icon: `w-12 h-12 rounded-full bg-pearl text-matcha hover:scale-110`

---

## 5. Layout Principles

### Spacing & Container

| Property | Value | Notes |
|:---------|:------|:------|
| Max content width | `max-w-7xl` (1280px) | Global container |
| APY card max width | `max-w-[800px]` | Centered, narrower for focus |
| Hero text max width | `max-w-[680px]` | For readability |
| Section vertical padding | `py-24` to `py-32` (96px – 128px) | Very generous |
| Horizontal padding | `px-8` (32px) | Consistent throughout |
| Card internal padding | `p-12 md:p-20` or `p-12 md:p-24` | Spacious interior |
| Button gaps | `gap-6` (24px) | Between CTA buttons |
| Grid gaps | `gap-12` (48px) | Between How It Works cards |
| Nav height | `h-20` (80px) | Sticky navigation |

### Grid System
- **How It Works:** `grid md:grid-cols-3 gap-12` — 3 equal columns on desktop, stacked on mobile
- **CTA Feature Cards:** `grid grid-cols-2 gap-6` — 2 columns with offset (`mt-8` on second card)
- **Hero:** Single column, centered (`text-center flex flex-col items-center`)
- **Footer:** Flexbox, `justify-between`, wraps on mobile

### Responsive Breakpoints
- Mobile-first design
- `md:` breakpoint for multi-column layouts and larger type sizes
- `sm:` breakpoint for horizontal button layout (`flex-col sm:flex-row`)

---

## 6. Iconography

### Icon System
- **Library:** Google Material Symbols Outlined
- **Style:** Outlined, variable weight/fill
- **Default size:** `text-4xl` (36px) for feature icons, `text-5xl` (48px) for CTA section
- **Color:** Inherits from parent; `text-matcha` in inverted sections

### Icons Used

| Icon Name | Context | Meaning |
|:----------|:--------|:--------|
| `bubble_chart` | APY badge | Yield pools / bubbles |
| `local_mall` | Step 1 | "Place Order" — shopping/deposit |
| `blender` | Step 2 | "Shake & Brew" — AI mixing |
| `celebration` | Step 3 | "Enjoy!" — rewards |
| `verified` | CTA feature card | Safe & Vetted |
| `water_drop` | CTA feature card | Pure Liquidity |

### Icon Container Style
- Squircle shape: `rounded-[40%]`
- Background: `bg-milktea`
- Border: `border-4 border-pearl`
- Hover: `group-hover:bg-matcha transition-colors`

---

## 7. Motion & Micro-interactions

| Element | Effect | Implementation |
|:--------|:-------|:---------------|
| CTA Buttons | Scale up on hover | `hover:scale-105 transition-all` |
| Social icon | Scale up on hover | `hover:scale-110 transition-all` |
| Nav links | Color change on hover | `hover:text-matcha transition-colors` |
| How It Works icons | Background color on hover | `group-hover:bg-matcha transition-colors` |
| Yield chart dot | Bouncing animation | `animate-bounce` (Tailwind built-in) |
| Secondary button | Background fill on hover | `hover:bg-creamy transition-all` |
| Selection highlight | Custom selection color | `selection:bg-matcha selection:text-pearl` |

### Animation Philosophy
- **Subtle and playful** — scale effects feel "bouncy" and bubbly
- **No complex animations** — the design relies on static visual playfulness, not motion
- **Hover-only interactions** — nothing animates without user intent (except the bouncing dot)

---

## 8. Brand Voice & Copy Patterns

### Tone
- Casual, warm, playful — never corporate or technical
- Food/drink metaphors everywhere
- Short, punchy sentences
- Exclamation-friendly but not aggressive

### Copy Patterns

| UI Element | Conventional Fintech | Tapioca Version |
|:-----------|:--------------------|:----------------|
| Primary CTA | "Get Started" | "Brew My Yield" / "Start Sipping" |
| Secondary CTA | "Learn More" | "Check the Menu" |
| APY label | "Annual Percentage Rate" | "Current Sweetness Level" |
| How it works | "Step 1: Deposit" | "1. Place Order" |
| Agent description | "AI optimizes your portfolio" | "Our bots mix and match the best opportunities 24/7 for peak freshness" |
| Bottom CTA | "Sign Up Now" | "Get Started Now" / "Ready for a Fresh Brew?" |
| Tagline | "DeFi Yield Optimizer" | "Freshly Brewed Yield" |
| Copyright | "All rights reserved" | "Brewed With Love" |
| Docs link | "Documentation" | "Recipe Book" |
| Audits link | "Security Audits" | "Lab Tests" |
| Protocols link | "Supported Protocols" | "Flavor Guide" |

---

## 9. Decorative & Signature Elements

### Pearl Motifs (Background Bubbles)
- Dark circles (`bg-pearl rounded-full`) scattered at various positions
- Sizes range from 16px to 80px diameter
- Opacities range from 5% to 70%
- Inner shadow: `inset -4px -4px 8px rgba(255,255,255,0.1)` gives 3D pearl effect
- Some are fixed-position background layer, others sit on card surfaces
- **This is the core brand motif** — tapioca pearls floating in the drink

### Matcha Glow
- In the inverted CTA section: `w-80 h-80 bg-matcha opacity-10 rounded-full blur-3xl`
- Creates a soft, ethereal green glow behind content
- Positioned off-screen partially (`-right-20 -bottom-20`) for organic feel

### Bar Chart as Boba
- The yield visualization uses pill-shaped bars that resemble boba straws or pearl layers
- Not meant to be precise data — it's decorative and atmospheric
- The bouncing dot on the tallest bar suggests "your yield is at the top"

---

## 10. Key Design Principles

1. **Everything is round.** Buttons are pills. Cards are 40-60px radius. Icons are squircles. Pearls are circles. Even the bar chart uses rounded bars. The entire UI echoes the shape of tapioca pearls.

2. **Warmth over precision.** The milktea background, the Quicksand font, the food metaphors — every choice prioritizes warmth and approachability over technical accuracy.

3. **Three-color discipline.** Milktea + Pearl + Matcha. That's it. White appears as card backgrounds and Creamy as borders, but the core visual identity is just three colors. This constraint creates instant recognition.

4. **Heavy type, light UI.** Typography is extremely bold (extrabold/black weights dominate), but the UI surface is light and airy. The contrast makes headlines feel confident without the interface feeling heavy.

5. **Metaphor-first copywriting.** Every label, button, and description uses the bubble tea metaphor. This isn't decoration — it's the brand strategy. Users don't "deposit into a yield optimizer," they "place an order" and "start sipping."

6. **Generous breathing room.** Sections have 96-128px vertical padding. Cards have 48-96px internal padding. Nothing is cramped. The whitespace itself communicates calm and confidence.
