import os
import re
import json
import threading
from google import genai
from google.genai import types
# ============================================================
# GEMINI KEY POOL STATE
# ============================================================
_key_lock = threading.Lock()
_current_key_index = 0
# ============================================================
# GET GEMINI API KEYS
# ============================================================
def get_gemini_keys():
    keys = []
    # --------------------------------------------------------
    # Find all numbered Gemini API keys dynamically
    # Example:
    #
    # GEMINI_API_KEY_1
    # GEMINI_API_KEY_2
    # GEMINI_API_KEY_10
    # GEMINI_API_KEY_25
    # --------------------------------------------------------
    numbered_keys = []
    for env_name, env_value in os.environ.items():
        match = re.fullmatch(
            r"GEMINI_API_KEY_(\d+)",
            env_name
        )
        if not match:
            continue
        if not env_value:
            continue
        if not env_value.strip():
            continue
        key_number = int(
            match.group(1)
        )
        numbered_keys.append(
            (
                key_number,
                env_value.strip()
            )
        )
    # --------------------------------------------------------
    # Sort by numeric key number
    #
    # 1, 2, 3, 10, 11
    #
    # Instead of:
    #
    # 1, 10, 11, 2, 3
    # --------------------------------------------------------
    numbered_keys.sort(
        key=lambda item: item[0]
    )
    # --------------------------------------------------------
    # Add numbered keys
    # --------------------------------------------------------
    for _, key in numbered_keys:
        keys.append(
            key
        )
    # --------------------------------------------------------
    # Backward Compatibility
    #
    # If no numbered keys exist, use:
    #
    # GEMINI_API_KEY
    # --------------------------------------------------------
    if not keys:
        api_key = os.getenv(
            "GEMINI_API_KEY"
        )
        if api_key and api_key.strip():
            keys.append(
                api_key.strip()
            )
    # --------------------------------------------------------
    # Validate Key Pool
    # --------------------------------------------------------
    if not keys:
        raise ValueError(
            "No Gemini API keys are configured."
        )
    return keys
# ============================================================
# GET STARTING KEY INDEX
# ============================================================
def get_start_index(total_keys):
    global _current_key_index
    with _key_lock:
        index = _current_key_index
        _current_key_index = (
            _current_key_index + 1
        ) % total_keys
    return index
# ============================================================
# Generate Parser
# ============================================================
def generate_parser(
    response_data,
    site_type,
    required_fields,
    reference_image=None,
    image_mime_type=None,
):
    # --------------------------------------------------------
    # Validate Response Data
    # --------------------------------------------------------
    if response_data is None:
        raise ValueError("Response data is required.")

    if isinstance(response_data, (dict, list)):
        response_data = json.dumps(
            response_data,
            ensure_ascii=False,
            indent=2
        )
    elif isinstance(response_data, str):
        response_data = response_data.strip()
    else:
        response_data = str(response_data).strip()

    if not response_data:
        raise ValueError("Response data is empty.")
    # --------------------------------------------------------
    # Validate Required Fields
    # --------------------------------------------------------
    if not required_fields:
        raise ValueError("Please select at least one required field.")

    if isinstance(required_fields, list):
        required_fields = ", ".join(
            str(field).strip()
            for field in required_fields
            if str(field).strip()
        )
    elif isinstance(required_fields, str):
        required_fields = required_fields.strip()
    else:
        raise ValueError(
            "required_fields must be a list or string."
        )

    if not required_fields:
        raise ValueError("Required fields cannot be empty.")
    # --------------------------------------------------------
    # Get Gemini API Key Pool
    # --------------------------------------------------------
    keys = get_gemini_keys()
    # --------------------------------------------------------
    # Select Starting Key
    #
    # Different requests will normally start with
    # different configured keys.
    # --------------------------------------------------------
    start_index = get_start_index(
        len(keys)
    )
    # --------------------------------------------------------
    # Gemini Prompt
    # --------------------------------------------------------
   
    
    prompt = f"""
    You are a senior Python web scraping engineer specializing in
    accurate, robust, dynamic, production-quality HTML and JSON parsing.

    Your task is to analyze the supplied website response and optional
    reference screenshots, then generate ONE complete, executable Python
    function named parse_data(data).

    The parser must extract all requested fields, process all relevant
    records, inspect nested data thoroughly, normalize values only when
    supported by the source, and avoid fabricating missing information.

    ============================================================
    INPUT INFORMATION
    ============================================================

    Website Type:
    {site_type}

    Required Fields:
    {required_fields}

    Website Response:
    {response_data}

    Optional reference screenshots may be attached.
    Inspect all attached screenshots when available.

    ============================================================
    1. SOURCE OF TRUTH AND EXTRACTION STRATEGY
    ============================================================

    The supplied response is the primary source of extracted data.
    Screenshots are visual references for identifying fields and
    understanding the expected output.

    The response may contain:
    - HTML documents and fragments
    - JSON strings
    - Already parsed dictionaries and lists
    - JSON embedded in HTML script tags
    - Application state and hydration data
    - Nested product, restaurant, flight, hotel or other records
    - Arrays of variants, images, ingredients and nutrition attributes
    - HTML links, image attributes, metadata and structured data

    Before writing the parser:

    1. Inspect the actual response structure.
    2. Identify the real record containers and relevant nested objects.
    3. Locate every source field that can satisfy a requested field.
    4. Determine whether the data is stored directly, nested, embedded
    in HTML, or distributed across multiple related structures.
    5. Use evidence from the supplied response rather than guessing.
    6. Preserve the association between a record and its nested data.
    7. Do not assume the first matching object contains all the data.
    8. Do not make HTTP requests or access external files.

    If a field is unavailable in the supplied response, return None
    for that requested field unless its documented normalization rule
    can derive it reliably from other source-backed values.

    Never invent source values.

    ============================================================
    2. HTML, JSON AND EMBEDDED JSON
    ============================================================

    For HTML:
    - Inspect the actual HTML structure.
    - Identify repeated record containers.
    - Use lxml.html or another suitable parser.
    - Use stable, source-supported XPath or CSS selectors.
    - Prefer relative selectors inside each record container.
    - Inspect href, src, data-src, srcset, alt, title and other
    relevant attributes when supported by the source.
    - Inspect structured metadata and JSON-LD when present.
    - Avoid selecting unrelated navigation, header or footer content.

    For JSON:
    - Parse JSON using json.loads when input is a JSON string.
    - Support already parsed dictionaries and lists.
    - Follow actual nested keys and relationships.
    - Iterate over every relevant array.
    - Inspect sibling objects when they contain requested fields
    belonging to the same product or record.
    - Do not assume keys exist unless confirmed by the response.

    For JSON embedded in HTML:
    - Locate the actual script or data container.
    - Extract and parse embedded JSON safely.
    - Handle escaped JSON and relevant structured state where feasible.
    - Inspect the resulting objects for all requested fields.
    - Do not treat arbitrary JavaScript as valid JSON.

    If a parsing strategy fails, use another strategy supported by
    the actual input. Do not silently return fabricated values.

    ============================================================
    3. DYNAMIC MULTI-RECORD EXTRACTION
    ============================================================

    The parser must work across different response values with the
    same general structure.

    1. Extract every relevant record available in the input.
    2. Do not stop after the first record.
    3. Do not hardcode product names, prices, IDs, URLs or examples.
    4. Do not use elements[0] or equivalent fixed-index selection
    as the general record extraction strategy.
    5. Do not assume every record contains every requested field.
    6. A missing field must not prevent extraction of other fields.
    7. Avoid mixing values from different products or records.
    8. Deduplicate records only when a reliable unique identifier
    or source-backed equivalence rule is available.
    9. Preserve source ordering where possible.
    10. Use safe fallbacks only when they are relevant to the same
        record and supported by actual source evidence.

    The result must always be a list of dictionaries.
    For one record, return a list containing one dictionary.
    For no relevant records, return an empty list.

    Include the requested keys consistently in every output record.
    Use None for missing values rather than silently omitting keys.

    ============================================================
    4. REQUIRED FIELDS AND OUTPUT COMPLETENESS
    ============================================================

    Treat Required Fields as the requested output schema.

    For every requested field:

    1. Search all relevant parts of the record.
    2. Map source fields to requested output fields using their
    actual meaning, not just similar names.
    3. Inspect nested objects and arrays before declaring a field
    unavailable.
    4. Do not omit a field simply because it is deeply nested.
    5. Preserve complete lists and complete text values.
    6. Do not truncate descriptions, ingredients or other details.
    7. Do not substitute an unrelated field for a missing value.
    8. Use consistent spelling for output keys.
    9. Preserve appropriate types: strings, numbers, booleans,
    lists, dictionaries or None.
    10. Do not add unrelated fields unless requested or required
        by an explicitly requested nested structure.

    If a requested field is a collection, return the complete
    collection rather than just its first item.

    If the source contains a nested object whose attributes are
    individually requested, extract the individual attributes.
    Do not collapse them into one unstructured text string.

    ============================================================
    5. REFERENCE SCREENSHOT ANALYSIS
    ============================================================

    If screenshots are attached:

    1. Inspect the entire screenshot.
    2. Identify visible labels, values, product images, breadcrumbs,
    prices, nutrition panels and other requested information.
    3. Understand which visible values belong to which record.
    4. Use screenshots to identify the corresponding source structures.
    5. Prefer actual response data over visible presentation text.
    6. Never hardcode values taken from screenshots.
    7. Never assume a value exists in the response because it appears
    in a screenshot.
    8. If the screenshot and response differ, preserve the actual
    response value and do not invent a reconciliation.

    The screenshot identifies what to look for.
    The supplied response determines what can be extracted.

    ============================================================
    6. IMAGE EXTRACTION — ALL AVAILABLE IMAGES
    ============================================================

    Image extraction is a high-priority requirement whenever image
    fields are requested.

    Inspect all relevant image sources in the supplied response,
    including:
    - Main or primary product images
    - Alternate product images
    - Image galleries and media arrays
    - Thumbnail and full-size image variants
    - Image objects nested under product details
    - Variant-specific images
    - HTML img elements and their relevant attributes
    - src, data-src, srcset and supported image metadata
    - Embedded JSON containing image IDs or image URLs

    Rules:

    1. Extract ALL distinct images associated with the correct record.
    2. Never stop after extracting the first image.
    3. Do not confuse a product ID with an image ID.
    4. Inspect every relevant image object and nested image array.
    5. Prefer the source's actual full-size URL when available.
    6. Resolve relative image URLs only when the base URL is known.
    7. Remove duplicate image URLs while preserving source order.
    8. Do not combine images from unrelated records or variants.
    9. Do not invent additional images.
    10. If no images are available, return an empty list.

    When image URLs are requested, use a consistent list field such as
    image_urls. If the required schema explicitly specifies image_url,
    preserve that key but return a list when all images are requested.

    If a retailer-specific image URL template is explicitly provided
    or can be reliably identified from the supplied website type,
    use it only when the source supplies a valid image ID and the
    template is appropriate for that retailer.

    For Jewel-Osco / Albertsons, when applicable, the image URL pattern
    is:

    https://images.albertsons-media.com/is/image/ABS/IMAGE_ID

    Replace IMAGE_ID with the actual source-backed image identifier.
    Do not use an unrelated ID just to create a URL.

    If both an image ID and a complete image URL exist, prefer the
    complete source URL unless the requested normalization explicitly
    requires the retailer's canonical URL pattern.

    ============================================================
    7. PRODUCT URL AND LINK NORMALIZATION
    ============================================================

    When product_url is requested:

    1. First inspect the actual product's canonical URL and link fields.
    2. Prefer a valid product-specific URL found in the source.
    3. If only a product ID is available, construct a URL only when
    the correct retailer-specific template is known.
    4. Confirm that the ID belongs to the product, not an image,
    variant, category or unrelated object.
    5. Do not return null if a valid URL can be reliably constructed.
    6. Do not fabricate a URL from an unverified identifier.
    7. Do not apply one retailer's URL template to another retailer.

    For Jewel-Osco products, when the website type is Jewel-Osco and
    the verified product ID is available, the URL pattern is:

    https://www.jewelosco.com/shop/pd/p/PRODUCT_ID

    Replace PRODUCT_ID with the actual verified product ID.

    If a complete canonical product URL exists in the source, prefer
    that URL when it refers to the same product.

    Do not mistake image IDs, UPCs, SKUs or other identifiers for
    product IDs unless the source establishes their relationship.

    Normalize relative links only when the correct base domain is known.
    Do not append an identifier to an unrelated URL.

    ============================================================
    8. BREADCRUMB AND CATEGORY HIERARCHY
    ============================================================

    When breadcrumb, category or category hierarchy fields are requested:

    1. Extract every relevant hierarchy segment from the source.
    2. Preserve the source's original order from parent to child.
    3. Include all available levels rather than only the top-level
    category or final category.
    4. Use " > " as the separator when breadcrumb is requested as text.
    5. Remove duplicate adjacent segments caused by repeated markup.
    6. Do not invent missing intermediate categories.
    7. Keep category and breadcrumb separate when both are requested.

    Example format:

    Parent Category > Subcategory > Leaf Category

    If the source exposes department, aisle and shelf separately,
    combine them in the correct source hierarchy when requested.
    Do not include unrelated navigation categories.

    ============================================================
    9. PRICE, CURRENCY AND UNIT PRICE
    ============================================================

    When price fields are requested:

    - Extract regular, original, sale, promotional, loyalty, digital
    and unit prices separately whenever present.
    - Keep price values numeric when the source supports numeric values.
    - Keep currency in a separate field.
    - Do not include currency symbols inside numeric price values.
    - Do not remove decimal precision.
    - Do not confuse unit price with selling price.
    - Preserve the price's associated package size or unit when relevant.
    - Do not calculate a missing price unless a reliable calculation
    is explicitly requested and the necessary inputs are available.
    - Return None for a requested price type that is unavailable.

    Examples of output types:

    price: 2.99
    sale_price: None
    currency: "USD"
    unit_price: 0.50

    These are type examples only, not extracted values.

    If the source contains a currency code, prefer the code.
    If only a currency symbol is available, preserve it or normalize
    it only when the currency can be determined reliably.

    Do not assume every dollar symbol means USD.

    ============================================================
    10. NUTRITION FACTS — COMPLETE KEY-VALUE EXTRACTION
    ============================================================

    When nutrition, nutritional information or nutrition facts are
    requested, inspect the entire source for nutrition data.

    Look for:
    - Nutrition panels and tables
    - Nested nutrition objects
    - Arrays of nutrition attributes
    - Serving-size metadata
    - Daily-value percentages
    - Embedded JSON and structured state
    - HTML labels and their corresponding values
    - Separate attributes distributed across related objects

    Extract ALL available nutrition attributes, not only the first
    few or the most common ones.

    Potential attributes include, but are not limited to:
    - Serving size
    - Calories
    - Total fat
    - Saturated fat
    - Trans fat
    - Cholesterol
    - Sodium
    - Total carbohydrates
    - Dietary fiber
    - Total sugars
    - Added sugars
    - Protein
    - Vitamin D
    - Calcium
    - Iron
    - Potassium
    - Any additional nutrition attributes actually present

    Rules:

    1. Do not assume the list above is exhaustive.
    2. Inspect every nutrition entry and preserve its actual meaning.
    3. Store attributes as structured key-value data when requested.
    4. Preserve numeric values and their original units.
    5. Preserve daily-value percentages when available.
    6. Keep serving size associated with the correct nutrition panel.
    7. Preserve different panels or serving sizes separately when needed.
    8. Do not combine all nutrition facts into a single text string.
    9. Do not fabricate values for attributes missing from the source.
    10. Do not confuse ingredient quantities with nutrition values.

    A suitable nested structure, when compatible with Required Fields,
    is a nutrition dictionary containing all source-backed attributes.
    Each attribute may contain value, unit and daily_value fields when
    those properties exist in the source.

    Do not force every nutrition attribute into an identical structure
    if the source clearly represents some attributes differently.
    Preserve meaningful source information.

    ============================================================
    11. INGREDIENTS, ALLERGENS AND PRODUCT DETAILS
    ============================================================

    When requested, extract complete source-backed values for:
    - Ingredients
    - Allergens and warnings
    - Directions and usage instructions
    - Product description
    - Manufacturer and distributor details
    - Package size and measurement unit
    - Storage instructions
    - Product-specific details
    - Other available requested attributes

    Inspect nested product-detail objects and relevant HTML sections.
    Do not rely only on a short visible description if the full details
    are present elsewhere in the response.

    Preserve the complete ingredients statement and all meaningful
    text. Do not summarize or truncate it.

    Keep nutrition facts separate from ingredients when structured
    nutrition data is available.

    If more_info is requested, use it for relevant additional details
    that do not already have dedicated requested fields. Avoid
    unnecessary duplication.

    ============================================================
    12. FIELD-SPECIFIC EXTRACTION AND NORMALIZATION
    ============================================================

    Apply the following general rules to all website types.

    Identifiers:
    - Preserve product IDs, record IDs, SKUs, UPCs and other identifiers.
    - Do not interchange identifiers without source evidence.
    - Preserve leading zeros where meaningful.

    Ratings:
    - Use correctly spelled keys such as rating and review_count.
    - Extract the actual rating and review count from the correct record.
    - Do not confuse rating counts with rating values.

    Availability:
    - Extract source-backed availability or stock status.
    - Preserve the difference between unavailable, sold out, unknown
    and missing data when the source supports those distinctions.

    Links:
    - Prefer canonical record-specific URLs.
    - Normalize URLs only when the source provides enough evidence.
    - Do not generate unrelated links.

    Dates and times:
    - Preserve the source's timezone and format when relevant.
    - Do not infer a missing date or time.

    Text:
    - Strip unnecessary leading and trailing whitespace.
    - Preserve meaningful punctuation, units and multilingual text.
    - Do not remove meaningful characters from identifiers or names.

    Apply only the normalization rules relevant to the supplied
    website and requested fields.

    ============================================================
    13. PHONE AND CONTACT EXTRACTION
    ============================================================

    When phone or contact fields are requested:

    1. Inspect record-specific tel: links, relevant labels, text nodes,
    structured JSON properties and actual contact attributes.
    2. Check multiple valid candidates within the same record.
    3. Do not use unrelated header, footer or office contact numbers.
    4. Preserve the number's original formatting unless normalization
    is requested.
    5. Return None if no valid number is available.

    Apply equivalent record-aware logic to names, addresses, locations,
    prices, ratings, IDs, URLs and other requested fields.

    ============================================================
    14. SELECTOR VALIDATION AND FALLBACKS
    ============================================================

    For each requested field:

    1. Prefer selectors and data paths supported by the response.
    2. Consider other relevant candidates when the first is missing
    or empty.
    3. Keep fallback logic associated with the same record.
    4. Avoid arbitrary page-wide text matches.
    5. Avoid invented selectors and unsupported JSON keys.
    6. Do not silently substitute unrelated values.
    7. Return None when no reliable value can be extracted.
    8. Handle malformed optional data without losing valid records.

    Do not use broad fallback selectors that accidentally mix data
    from different products or unrelated page sections.

    ============================================================
    15. PYTHON FUNCTION REQUIREMENTS
    ============================================================

    Generate exactly ONE top-level function:

    def parse_data(data):
        ...

    The function must:

    - Accept the supplied response through data.
    - Support strings, dictionaries and lists where appropriate.
    - Parse HTML, JSON or embedded JSON according to the actual input.
    - Include every required import inside the function.
    - Keep all parsing logic inside the function.
    - Return a list of dictionaries consistently.
    - Include every requested output key in each record.
    - Return None for genuinely unavailable requested values.
    - Return an empty list when no relevant records are found.
    - Handle missing keys, empty values and nulls safely.
    - Extract multiple records dynamically.
    - Preserve nested lists and dictionaries where requested.
    - Avoid unnecessary output fields.
    - Avoid hardcoded sample values.
    - Avoid network requests, external file access and browser automation.
    - Never create additional top-level functions.
    - Never return selectors or JSON paths instead of parsed results.
    - Produce syntactically valid, executable Python code.

    Nested helper functions and imports may be defined inside parse_data
    when useful. Do not define additional top-level functions.

    Use standard libraries where possible and suitable installed
    parsing libraries such as lxml when HTML parsing requires them.

    Do not silently swallow unexpected exceptions. Handle expected
    missing or malformed optional data safely while allowing genuine
    parsing problems to be diagnosed.

    ============================================================
    16. FINAL SELF-CHECK
    ============================================================

    Before returning the parser, verify:

    1. Every requested field is accounted for.
    2. All relevant records are processed.
    3. Nested objects and arrays were inspected.
    4. All available images are collected when requested.
    5. Product URLs use verified IDs and appropriate templates.
    6. Breadcrumbs preserve the complete available hierarchy.
    7. Prices and currency are normalized correctly.
    8. All available nutrition attributes are extracted.
    9. Ingredients and product details are complete.
    10. Record-specific data is not mixed with another record.
    11. Missing data is not fabricated.
    12. The parser handles missing optional fields.
    13. Output keys are spelled correctly.
    14. The result is a list of dictionaries.
    15. The Python code is syntactically valid.
    16. The parser does not make network requests.
    17. The code follows the requested output schema.

    Do not claim that data was extracted or validated if the supplied
    response does not support that claim.

    ============================================================
    FINAL OUTPUT FORMAT
    ============================================================

    Return ONLY the complete Python code for parse_data(data).

    Do not include Markdown code fences.
    Do not include explanations outside the function.
    Do not return separate selectors, JSON paths or test results.

    The function must return the parsed records as a list of dictionaries.
    """

    # --------------------------------------------------------
    # Try Gemini Keys
    # --------------------------------------------------------
    last_error = None
    for attempt in range(len(keys)):
        key_index = (
            start_index + attempt
        ) % len(keys)
        api_key = keys[key_index]
        try:
            # ------------------------------------------------
            # Create Gemini Client
            # ------------------------------------------------
            client = genai.Client(
                api_key=api_key
            )
            # ------------------------------------------------
            # Generate Parser
            # ------------------------------------------------
            # Build multimodal input when a reference image is provided.
            if reference_image:
                mime_type = image_mime_type or "image/png"
                contents = [
                    prompt,
                    types.Part.from_bytes(
                        data=reference_image,
                        mime_type=mime_type,
                    ),
                ]
            else:
                contents = prompt

            response = client.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=contents
            )
            # ------------------------------------------------
            # Validate Gemini Response
            # ------------------------------------------------
            if not response:
                raise ValueError(
                    "Gemini returned an empty response."
                )
            if not response.text:
                raise ValueError(
                    "Gemini returned an empty response."
                )
            # ------------------------------------------------
            # Success
            # ------------------------------------------------
            return response.text.strip()
        except Exception as e:
            # Store error and try next configured key
            last_error = e
            continue
    # --------------------------------------------------------
    # All Keys Failed
    # --------------------------------------------------------
    raise RuntimeError(
        "All configured Gemini API keys failed. "
        f"Last error: {last_error}"
    )
