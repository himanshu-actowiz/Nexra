from google import genai


# ============================================================
# Generate Parser
# ============================================================

def generate_parser(
    response_data,
    site_type,
    required_fields,
    api_key
):

    # --------------------------------------------------------
    # Validate API Key
    # --------------------------------------------------------

    if not api_key or not api_key.strip():

        raise ValueError(
            "Gemini API key is required."
        )

    # --------------------------------------------------------
    # Create Gemini Client
    # --------------------------------------------------------

    client = genai.Client(
        api_key=api_key.strip()
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

Expected output:

def parse_data(data):
    ...
    return result
"""

    # --------------------------------------------------------
    # Generate Parser
    # --------------------------------------------------------

    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=prompt
    )

    # --------------------------------------------------------
    # Validate Gemini Response
    # --------------------------------------------------------

    if not response or not response.text:

        raise ValueError(
            "Gemini returned an empty response."
        )

    return response.text.strip()