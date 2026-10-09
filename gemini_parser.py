import os
import re
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
    if not response_data or not response_data.strip():
        raise ValueError(
            "Response data is required."
        )
    # --------------------------------------------------------
    # Validate Required Fields
    # --------------------------------------------------------
    if not required_fields or not required_fields.strip():
        raise ValueError(
            "Required fields are required."
        )
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
    dynamic, reliable, production-quality HTML and JSON parsers.

    Your task is to analyze the supplied website response and
    optional reference screenshot, then generate ONE complete,
    executable Python function named parse_data(data).

    The parser must extract every requested field accurately,
    handle multiple records dynamically, and avoid brittle selectors.

    ============================================================
    INPUT INFORMATION
    ============================================================

    Website Type:
    {site_type}

    Required Fields:
    {required_fields}

    Website Response:
    {response_data}

    A reference screenshot may also be attached to this request.
    If attached, inspect the actual image carefully.

    ============================================================
    1. REFERENCE IMAGE ANALYSIS
    ============================================================

    If a screenshot is attached:

    1. Visually inspect the entire screenshot.
    2. Identify all requested fields visible in the screenshot.
    3. Understand the relationship between labels and values.
    4. Identify the relevant record or page section.
    5. Use the screenshot to understand what the user expects
    the parser to extract.
    6. Compare the visible fields with the supplied HTML, JSON,
    embedded JSON, or other response data.
    7. Identify the actual HTML elements, attributes, links,
    text nodes, JSON keys, and nested structures that contain
    the corresponding values.
    8. Prefer the actual underlying data over visible presentation
    text when both contain the same information.
    9. Never hardcode values taken from the screenshot.
    10. If a requested value is visible in the screenshot but
        unavailable in the supplied response, return None for
        that field.
    11. Do not assume that an image alone proves a value exists
        in the response.
    12. Do not invent selectors or data based on appearance alone.

    The screenshot is a reference for identifying fields.
    The supplied response is the source for extracted values.

    ============================================================
    2. INSPECT THE ACTUAL RESPONSE
    ============================================================

    Before generating the parser, reason carefully about the
    actual structure of the supplied response.

    The response may contain:

    - HTML
    - JSON
    - JSON embedded in HTML script tags
    - Structured state objects
    - Multiple records
    - Nested objects and arrays
    - Links and attributes containing useful data
    - Repeated HTML components
    - Empty values or missing fields

    Determine the correct parsing strategy from the actual data.

    For HTML:
    - Inspect the real DOM structure.
    - Identify the correct record container.
    - Inspect class names, IDs, attributes, labels and links.
    - Use lxml.html or another suitable parser.
    - Prefer stable selectors based on actual response content.
    - Use relative XPath expressions inside the identified record
    whenever appropriate.
    - Do not invent HTML elements or attributes.

    For JSON:
    - Parse the actual JSON structure.
    - Follow the real keys and nested objects.
    - Iterate dynamically over relevant arrays.
    - Do not invent keys or assume a structure that is absent.

    For JSON embedded in HTML:
    - Identify the actual script or data container.
    - Extract and parse the embedded JSON correctly.
    - Use the real structure present in the response.

    ============================================================
    3. STRICT DYNAMIC PARSING REQUIREMENTS
    ============================================================

    The generated parser MUST be dynamic.

    1. Do not hardcode extracted names, prices, phone numbers,
    locations, product IDs, URLs or other example values.

    2. Do not write a parser specifically for one record's values.

    3. Do not assume the requested record is always the first
    matching HTML element or JSON array item.

    4. Identify repeated record containers and iterate over them.

    5. Extract each requested field from its corresponding record.

    6. Do not combine values belonging to different records.

    7. Do not use fixed XPath result indexing such as:
        elements[0]
        name_elements[0]
        phone_elements[0]

    Instead, use safe iteration, validated candidate selection,
    or next(iter(candidates), None) where appropriate.

    8. Do not use a fixed array index to select a record unless
    the actual response structure explicitly requires that index.

    9. Do not use positional selectors such as div[1] or
    //div[3] when a stable class, ID, attribute or relationship
    is available.

    10. Do not rely on CSS class names that are not present in
        the supplied response.

    11. Do not assume every record contains every requested field.

    12. A missing field in one record must not prevent extraction
        of other fields or other records.

    13. Do not return an empty string merely because the first
        candidate is empty. Inspect other valid candidates within
        the same record when appropriate.

    14. Do not silently substitute an unrelated value for a
        missing field.

    15. Repeated executions with different response data of the
        same structure must extract the corresponding new values.

    ============================================================
    4. PHONE NUMBER AND CONTACT FIELD EXTRACTION
    ============================================================

    Phone numbers and contact information require special care.

    When a phone number is requested:

    1. Search the actual relevant record for:
    - Anchor elements with href attributes beginning with tel:
    - Phone-related classes and IDs
    - Elements containing phone labels
    - Text nodes containing phone numbers
    - Relevant structured JSON properties
    - Other actual phone-related attributes in the response

    2. If the screenshot shows a phone number, use its visible
    label and location to identify the corresponding element
    in the response.

    3. Prefer a matching tel: link when it belongs to the correct
    record and contains the actual number.

    4. If the link text and tel: attribute differ, inspect both
    and select the representation appropriate to the requested
    field. Do not assume they are always identical.

    5. If one candidate is empty, inspect other relevant candidates
    in the same record.

    6. Do not select the first phone-related element from the
    entire page if it belongs to a different person or record.

    7. Do not extract header contact information, unrelated office
    numbers, footer numbers or navigation text as the record's
    phone number.

    8. Do not discard a valid number because it contains spaces,
    parentheses, hyphens, a country code or other formatting.

    9. Preserve the actual phone number unless normalization
    is explicitly requested.

    10. If no valid phone number exists in the supplied response,
        return None. Never invent or copy the number from the
        screenshot into the output.

    Apply equivalent record-aware logic to other requested fields,
    including names, roles, addresses, locations, prices, ratings,
    IDs, URLs and availability.

    ============================================================
    5. SELECTOR VALIDATION AND FALLBACKS
    ============================================================

    For each requested field:

    1. Identify the most reliable selector or data path using
    evidence from the supplied response.

    2. Consider more than one valid extraction strategy when
    the response supports it.

    3. If a candidate selector produces no useful value, inspect
    other relevant structures within the same record.

    4. Prefer semantic evidence such as:
    - Stable attributes
    - Relevant class names
    - Labels
    - Link destinations
    - Relationships between elements
    - Actual JSON keys
    - Record-specific containers

    5. Avoid broad selectors that accidentally capture unrelated
    text elsewhere on the page.

    6. Avoid taking an arbitrary element's text as a fallback.

    7. Do not fabricate a fallback value.

    8. Use None when no supported value can be found.

    9. Keep fallback logic inside parse_data(data).

    10. Preserve the relationship between every record and its
        requested field values.

    ============================================================
    6. OUTPUT FUNCTION REQUIREMENTS
    ============================================================

    Generate exactly ONE top-level function:

    def parse_data(data):
        ...
        return result

    The function must:

    - Accept the complete supplied response through data.
    - Parse the supplied response without making HTTP requests.
    - Work with a string containing HTML, JSON or text.
    - Handle an already parsed dictionary or list when appropriate.
    - Include every required import inside the function.
    - Keep all parsing logic inside this function.
    - Return a list of dictionaries consistently.
    - Return a list containing one dictionary for a single record.
    - Include every requested field name exactly as supplied.
    - Return None for genuinely unavailable requested fields.
    - Preserve valid extracted values and suitable data types.
    - Strip unnecessary whitespace from text values.
    - Handle missing elements, empty text, missing keys and nulls.
    - Avoid crashing when an optional element is absent.
    - Extract multiple records when they are present.
    - Return an empty list if no relevant records are found.
    - Avoid unnecessary fields that the user did not request.
    - Never hardcode values from the supplied example.
    - Never make network requests or read external files.
    - Never use Selenium, Playwright or browser automation.
    - Never create additional top-level functions.
    - Never return XPath expressions separately.
    - Never return JSON paths separately.

    ============================================================
    7. FINAL SELF-CHECK BEFORE RETURNING CODE
    ============================================================

    Before producing the final answer, internally verify:

    1. Every requested field is accounted for.
    2. The screenshot was considered if one was attached.
    3. Each selector or data path is supported by the response.
    4. Phone numbers and other contact details are searched
    through relevant record-specific candidates.
    5. The parser does not blindly select the first result.
    6. Multiple records are handled dynamically.
    7. Missing fields return None rather than causing errors.
    8. No screenshot values are hardcoded.
    9. No example record values are hardcoded.
    10. The code is syntactically valid Python.
    11. The code can run against the supplied response.
    12. Each record's values come from the same record.
    13. No requested field is silently omitted.
    14. All imports are inside parse_data(data).

    Do not claim that a field was successfully verified unless
    the supplied response actually supports the extraction.

    ============================================================
    FINAL OUTPUT FORMAT
    ============================================================

    Return ONLY the complete Python code.

    Do not include markdown code fences.
    Do not include explanations, comments outside the function,
    test results, or separate selector descriptions.

    Expected structure:

    def parse_data(data):
        ...
        return result
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
