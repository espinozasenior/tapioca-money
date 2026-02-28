# Lessons Learned

## YO SDK `.raw` fields are in token units, not USD

- `getUserPerformance().unrealized.raw` and `.realized.raw` return values in the token's smallest unit (e.g. USDC = 6 decimals)
- Must divide by `10 ** config.underlying.decimals` before treating as USD — same as `pos.assets`
- Pattern: always check if SDK "raw" fields need decimal normalization before displaying as USD
