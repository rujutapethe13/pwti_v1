/**
 * Canonical job type alias map. Applied in ONE shared function used by the chart,
 * legend, drill-down rows, and any export so numbers always agree.
 * 
 * Maps known misspellings/variants to canonical display labels.
 * Normalization (trim, collapse spaces, case-insensitive) is applied before lookup.
 */

export const JOB_TYPE_ALIASES: Record<string, string> = {
  // Apparel
  "apperals": "Apparel",
  "apparels": "Apparel",
  "apparel": "Apparel",
  
  // Towel
  "towell": "Towel",
  "towel": "Towel",
  
  // Jewellery
  "jwellery": "Jewellery",
  "jewellery": "Jewellery",
  "jewelry": "Jewelry",
  
  // Quilt/Blanket
  "quailt/blanket": "Quilt/Blanket",
  "quilt/blanket": "Quilt/Blanket",
  "quilt blanket": "Quilt/Blanket",
  
  // Globe Resize
  "globle resize": "Globe Resize",
  "globe resize": "Globe Resize",
  
  // Duffel bag
  "duffle bag": "Duffel bag",
  "duffel bag": "Duffel bag",
  "dufflebag": "Duffel bag",
  "duffelbag": "Duffel bag",
  
  // Bags/backpacks - keep distinct meanings separate unless explicitly aliased
  "genie backpack": "Backpack",
  "backpack": "Backpack",
  "laptop bag selling bag": "Laptop Bag",
  
  // Other common variants
  "trolley bag": "Trolley Bag",
  "trolley": "Trolley",
  
  "light": "Light",
  "product": "Product",
  "resize": "Resize",
  "bottle": "Bottle",
  "bag": "Bag",
  "flatlay": "Flatlay",
  "gifting": "Gifting",
  "footwear": "Footwear",
  "lipstick": "Lipstick",
  "curtain": "Curtain",
  "chair": "Chair",
  "socks": "Socks",
};

/**
 * Normalize job type for grouping - trim, collapse spaces, case-insensitive
 */
export function normalizeJobTypeForGrouping(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  
  // Check for placeholders that should become unclassified
  const lowerTrimmed = trimmed.toLowerCase();
  if (
    lowerTrimmed === "type here..." ||
    lowerTrimmed === "type here" ||
    lowerTrimmed === "n/a" ||
    lowerTrimmed === "na" ||
    lowerTrimmed === "-" ||
    lowerTrimmed === "null" ||
    lowerTrimmed === "undefined"
  ) {
    return "";
  }
  
  // Collapse repeated spaces
  const collapsed = trimmed.replace(/\s+/g, " ");
  const key = collapsed.toLowerCase();
  
  // Apply alias map
  if (JOB_TYPE_ALIASES[key]) {
    return JOB_TYPE_ALIASES[key];
  }
  
  // For keys not in alias map, return the collapsed version
  return collapsed;
}

/**
 * Check if a job type is unclassified (empty/null/whitespace/placeholder)
 */
export function isUnclassifiedJobType(raw: string): boolean {
  if (typeof raw !== "string") return true;
  const normalized = normalizeJobTypeForGrouping(raw);
  return normalized.trim().length === 0;
}
