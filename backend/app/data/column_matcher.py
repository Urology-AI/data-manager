"""
Column matching utilities for mapping CSV/Excel columns to patient fields
"""
import re
from typing import List, Dict, Tuple

# Field mapping patterns - simple matching
# Common fields that should always be matched if present
FIELD_PATTERNS = {
    "date_of_service": [r"date.*service", r"dos", r"service.*date", r"visit.*date", r"^date of service$"],
    "location": [r"location", r"loc", r"site", r"facility", r"^location$"],
    "mrn": [r"^mrn$", r"^m\.r\.n\.?$", r"medical.*record", r"patient.*id", r"patient.*number"],
    "first_name": [r"^fn$", r"^first name$", r"^firstname$", r"first.*name", r"fname", r"given.*name"],
    "last_name": [r"^ln$", r"^last name$", r"^lastname$", r"last.*name", r"lname", r"surname", r"family.*name"],
    "reason_for_visit": [r"reason.*visit", r"chief.*complaint", r"presenting.*problem", r"^reason for visit$"],
    "points": [r"^points$", r"points", r"score", r"total.*points"],
    "percent": [r"^percent$", r"percent", r"percentage", r"%", r"pct"],
    "category": [r"^category$", r"category", r"cat", r"risk.*category"],
    "pca_confirmed": [r"pca.*confirmed", r"prostate.*cancer", r"cancer.*confirmed", r"^pca confirmed"],
    "gleason_grade": [r"^gg$", r"^gleason$", r"gleason", r"gg", r"gleason.*grade", r"grade"],
    "age_group": [r"age.*group", r"age.*range", r"^age group$"],
    "family_history": [r"^fh$", r"family.*history", r"fh", r"fhx", r"family.*hx", r"^fh of prostate$"],
    "race": [r"^race$", r"race", r"ethnicity", r"racial"],
    "genetic_mutation": [r"genetic", r"mutation", r"gene", r"brca", r"^genetic risk$", r"^genetic$"],
}


def normalize_column_name(col_name: str) -> str:
    """Normalize column name for matching"""
    if not col_name:
        return ""
    normalized = re.sub(r'[_\-\s]+', ' ', str(col_name).lower().strip())
    return normalized


def calculate_match_score(column_name: str, patterns: List[str]) -> float:
    """Calculate how well a column name matches patterns (0.0 to 1.0)"""
    normalized = normalize_column_name(column_name)
    if not normalized:
        return 0.0
    
    best_score = 0.0
    for pattern in patterns:
        try:
            # Check for exact match first (full pattern match)
            if re.match(f"^{pattern}$", normalized, re.IGNORECASE):
                score = 1.0
            # Check if pattern matches the entire normalized string (exact column name match)
            elif normalized == pattern.replace(r'.*', '').replace('^', '').replace('$', '').strip():
                score = 0.95
            # Check for partial match
            elif re.search(pattern, normalized, re.IGNORECASE):
                match = re.search(pattern, normalized, re.IGNORECASE)
                if match:
                    matched_length = len(match.group())
                    total_length = len(normalized)
                    score = min(matched_length / max(total_length, 1), 0.9)
                else:
                    score = 0.0
            else:
                score = 0.0
            
            best_score = max(best_score, score)
        except re.error:
            continue
    
    # Also check for direct string match (case-insensitive, ignoring spaces/underscores)
    normalized_clean = re.sub(r'[_\-\s]+', '', normalized)
    for pattern in patterns:
        pattern_clean = re.sub(r'[.*^$]+', '', pattern).replace(' ', '').lower()
        if normalized_clean == pattern_clean:
            best_score = max(best_score, 1.0)
    
    return best_score


def suggest_column_mappings(csv_columns: List[str], existing_mapping: Dict[str, str] = None, data_type: str = "generic") -> Dict[str, Tuple[str, float]]:
    """Suggest column mappings - MUST match MRN, FN, LN if CSV has them"""
    if existing_mapping is None:
        existing_mapping = {}
    
    patterns_to_use = FIELD_PATTERNS
    suggestions = {}
    used_columns = set(existing_mapping.values())
    
    # STEP 1: Match critical fields FIRST (MRN, FN, LN) - these MUST match
    # Use flexible matching that handles variations like "MRN (string)", "First Name (FN)", etc.
    critical_fields = {
        "mrn": ["MRN", "M.R.N.", "mrn", "medical.*record", "patient.*id", "patient.*number"],
        "first_name": ["FN", "F.N.", "fn", "First Name", "FirstName", "first.*name", "fname", "given.*name"],
        "last_name": ["LN", "L.N.", "ln", "Last Name", "LastName", "last.*name", "lname", "surname", "family.*name"]
    }
    
    for field_name, possible_patterns in critical_fields.items():
        if field_name in existing_mapping or field_name in suggestions:
            continue
        
        best_match = None
        best_score = 0.0
        
        for col in csv_columns:
            if col in used_columns:
                continue
            
            # Clean column name - remove parentheses and extra text like "(string)", "(FN)", etc.
            col_clean = re.sub(r'\([^)]*\)', '', col).strip()
            col_upper = col_clean.upper().strip()
            col_normalized = re.sub(r'[_\-\s\.]+', '', col_clean.lower())
            
            # Try exact matches first
            for pattern in possible_patterns:
                pattern_clean = re.sub(r'[.*^$]+', '', pattern).strip()
                pattern_normalized = re.sub(r'[_\-\s\.]+', '', pattern_clean.lower())
                
                # Exact match (case-insensitive, ignoring spaces/underscores/dots)
                if col_normalized == pattern_normalized or col_upper == pattern_clean.upper():
                    best_match = col
                    best_score = 1.0
                    break
                
                # Check if pattern matches (using regex)
                try:
                    if re.search(pattern, col_clean, re.IGNORECASE):
                        score = 0.95
                        if score > best_score:
                            best_score = score
                            best_match = col
                except re.error:
                    pass
            
            # Also check if field name itself matches (e.g., "mrn" column matches "mrn" field)
            field_normalized = re.sub(r'[_\-\s\.]+', '', field_name.lower())
            if col_normalized == field_normalized:
                if 1.0 > best_score:
                    best_score = 1.0
                    best_match = col
        
        if best_match and best_score > 0.5:  # Lower threshold for critical fields
            suggestions[field_name] = (best_match, best_score)
            used_columns.add(best_match)
    
    # STEP 2: Match other fields by normalized name (including critical fields that weren't matched yet)
    for field_name, patterns in patterns_to_use.items():
        if field_name in existing_mapping or field_name in suggestions:
            continue
        
        field_normalized = re.sub(r'[_\-\s\.]+', '', field_name.lower())
        for col in csv_columns:
            if col in used_columns:
                continue
            
            # Clean column name - remove parentheses and extra text
            col_clean = re.sub(r'\([^)]*\)', '', col).strip()
            col_normalized = re.sub(r'[_\-\s\.]+', '', col_clean.lower())
            
            if field_normalized == col_normalized:
                suggestions[field_name] = (col, 1.0)
                used_columns.add(col)
                break
    
    # STEP 3: Pattern matching for remaining fields (including critical fields that still weren't matched)
    for field_name, patterns in patterns_to_use.items():
        if field_name in existing_mapping or field_name in suggestions:
            continue
        
        best_match = None
        best_score = 0.0
        
        for col in csv_columns:
            if col in used_columns:
                continue
            
            # Clean column name before matching
            col_clean = re.sub(r'\([^)]*\)', '', col).strip()
            score = calculate_match_score(col_clean, patterns)
            if score > best_score:
                best_score = score
                best_match = col
        
        # Lower threshold for critical fields - be more aggressive
        threshold = 0.3
        if field_name in ['mrn', 'first_name', 'last_name', 'date_of_service', 'location']:
            threshold = 0.1  # Very low threshold - match almost anything close
        
        if best_match and best_score > threshold:
            suggestions[field_name] = (best_match, best_score)
            used_columns.add(best_match)
    
    return suggestions


def auto_map_columns(csv_columns: List[str], existing_mapping: Dict[str, str] = None, min_confidence: float = 0.7, data_type: str = "generic") -> Dict[str, str]:
    """Auto-map ALL matches - match CSV columns to DB fields automatically"""
    if existing_mapping is None:
        existing_mapping = {}
    
    auto_mapped = {}
    suggestions = suggest_column_mappings(csv_columns, existing_mapping, data_type=data_type)
    
    # Auto-map ALL suggestions - if there's a match, use it
    for field_name, (csv_col, score) in suggestions.items():
        if score > 0:  # Any match at all
            auto_mapped[field_name] = csv_col
    
    return auto_mapped
