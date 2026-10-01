import os
import re
import threading

from google import genai


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
    required_fields
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
You are an expert Python web scraping engineer.

Your job is to analyze the website response and generate a
complete Python parsing function.

Website Type:
{site_type}

Required Fields:
{required_fields}

Website Response:
{response_data}


IMPORTANT REQUIREMENTS:

1. Analyze the actual response carefully.

2. The response can be either:
   - HTML
   - JSON
   - JSON embedded inside HTML
   - Other structured response data

3. Determine the correct parsing method automatically.

4. If the response is HTML:
   - Use lxml / XPath or another reliable HTML parsing approach.
   - Select the correct elements from the actual response.
   - Use selectors based ONLY on elements actually present
     in the supplied response.

5. If the response is JSON:
   - Parse the actual JSON structure.
   - Use the real keys and nested structure present in the response.
   - Do not invent keys.

6. If JSON data is embedded inside HTML:
   - Extract and parse the embedded JSON correctly.
   - Use the actual script/data structure present in the response.

7. Generate ONE complete function only.

8. The function MUST have exactly this structure:

def parse_data(data):
    ...

9. The function must return the extracted data.

10. Extract ALL requested fields:
{required_fields}

11. Handle missing fields safely.
    Return None when a requested field does not exist.

12. Do not make any HTTP request inside the function.

13. Do not use requests inside the function.

14. Do not use Selenium.

15. Do not use Playwright.

16. Do not create multiple functions.

17. Do not create separate XPath/JSON-path variables
    outside parse_data().

18. All parsing logic must be inside parse_data(data).

19. The function should accept the website response through
    the `data` argument.

20. The function should be directly usable in a Python scraper.

21. Clean unnecessary whitespace from extracted values.

22. Preserve the correct data type where appropriate.

23. If multiple products/items/records exist, return a list
    containing all records.

24. If the response contains only one item, still return a
    list containing that item.

25. Do not explain the code.

26. Do not return XPath separately.

27. Do not return JSON paths separately.

28. Do not include markdown code fences.

29. Return ONLY the complete Python function.

30. Do not hallucinate selectors, keys, fields, URLs,
    attributes, or values that are not supported by the
    supplied response.

31. The generated parser must work against the complete
    response supplied through `data`.

32. Keep all imports required by the parser inside
    parse_data(data), so the returned code is self-contained.

33. If the response is HTML and lxml is appropriate,
    parse the HTML using lxml inside parse_data().

34. If the response is JSON, safely parse the JSON using
    Python's json module inside parse_data().

35. If data is already a Python dictionary/list, handle it
    directly when appropriate.

36. If the response format is ambiguous, inspect the actual
    response structure before deciding the parsing method.

37. Return a consistent list of dictionaries.

38. Each dictionary should contain the requested field names
    exactly as provided.

39. Do not add unnecessary fields that were not requested.

40. Do not modify, rename, or reinterpret the requested field
    names.

41. Do not truncate the response during analysis.

42. Make the parser robust against missing HTML elements,
    missing JSON keys, empty values, and unexpected null values.

43. Do not assume that the first matching element is the
    correct record if multiple records are present.

44. When multiple records are present, preserve the relationship
    between fields belonging to the same record.

45. For prices, ratings, quantities, availability, IDs,
    URLs, and other structured values, extract the actual value
    from the response without inventing or modifying it.

46. If a requested field is not present anywhere in the
    supplied response, return None for that field.

47. Do not generate sample, dummy, or hardcoded values.

48. Do not hardcode values from the example response into
    the parser.

49. The parser must dynamically parse the supplied `data`.

50. The final output must be executable Python code.

Expected output:

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

            response = client.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=prompt
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