export const countryNames: Record<string, string> = {
    "GH": "Ghana",
    "NG": "Nigeria",
    "KE": "Kenya",
    "UG": "Uganda",
    "RW": "Rwanda",
    "TZ": "Tanzania",
    "ZA": "South Africa",
    "EG": "Egypt",
    "ET": "Ethiopia",
    "MA": "Morocco",
    "CI": "Ivory Coast",
    "SN": "Senegal",
    "CM": "Cameroon",
    "GHANA": "Ghana",
    "NIGERIA": "Nigeria",
    "US": "United States",
    "GB": "United Kingdom",
    "UK": "United Kingdom",
    "CA": "Canada",
    "DE": "Germany",
    "FR": "France",
    "CN": "China",
    "IN": "India",
    "AE": "United Arab Emirates",
};

export const getCountryName = (code: string): string => {
    if (!code) return "Global";
    const upper = code.trim().toUpperCase();
    return countryNames[upper] || upper;
};

export const mapCountryBreakdown = (breakdown: any[]) => {
    const result: Record<string, number> = {};
    breakdown.forEach(item => {
        const name = getCountryName(item.country);
        result[name] = (result[name] || 0) + Number(item.count);
    });
    return result;
};

export const mapCountryRevenue = (breakdown: any[]) => {
    const result: Record<string, number> = {};
    breakdown.forEach(item => {
        const name = getCountryName(item.country);
        result[name] = (result[name] || 0) + Number(item.revenue || item.total || 0);
    });
    return result;
};
