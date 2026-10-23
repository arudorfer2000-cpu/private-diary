"""Country -> region group. The group is always derived, never stored (FR-B10)."""

EU = {"AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
      "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"}
UK = {"GB"}
UK_NATIONS = {"England", "Scotland", "Wales", "Northern Ireland"}

NAMES = {"GB": "United Kingdom", "IE": "Ireland", "AT": "Austria", "ES": "Spain", "PT": "Portugal",
         "FR": "France", "IT": "Italy", "NL": "Netherlands", "BE": "Belgium", "SE": "Sweden",
         "DE": "Germany"}

def group_of(country):
    if country in UK: return "UK"
    if country in EU: return "EU"
    return "other"

def region_group(countries):
    """UK, EU, both (programme with partners in both) or other."""
    groups = {group_of(c) for c in countries}
    if {"UK", "EU"} <= groups: return "both"
    for g in ("UK", "EU"):
        if g in groups: return g
    return "other"

def matches_filter(countries, wanted):
    """wanted: 'UK', 'EU' or 'both' (= no restriction). UK shows UK and joint programmes."""
    if wanted in (None, "", "all", "both"): return True
    g = region_group(countries)
    return g == wanted or g == "both"

def is_eu_citizen(citizenships):
    from_names = {v: k for k, v in NAMES.items()}
    return any(from_names.get(c, c) in EU for c in citizenships)
