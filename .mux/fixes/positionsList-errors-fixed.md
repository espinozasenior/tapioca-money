# PositionsList Component - Errors Fixed

## Summary of Fixes

### 1. **Duplicate Function Name: `formatApy`**

**Issue**: Component defined its own `formatApy()` function, but this could conflict with imported utilities and is semantically confusing.

**Fix**:

- Renamed local function from `formatApy` → `formatApyLocal`
- Removed unused import alias `formatApy as formatApyUtil`
- Updated all calls to use `formatApyLocal()` instead

**Lines affected**: 49, 209, 220

### 2. **Invalid Tailwind Class: `text-primary`**

**Issue**: Used `text-primary` class which doesn't exist in Tailwind CSS by default and isn't defined in the project's theme.

**Fix**:

- Changed `className="text-primary text-lg font-bold"`
- To: `className="text-lg font-bold text-blue-600"`

**Line affected**: 209

## Files Modified

- `components/earn-yield/PositionsList.tsx`

## Testing

Component now:

- ✅ No duplicate function names
- ✅ Uses valid Tailwind classes
- ✅ Properly formatted APY display with blue color
- ✅ Maintains existing functionality for position display, earnings, and exit handling
