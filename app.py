import streamlit as st
import requests
import shlex
import pandas as pd
from pathlib import Path
from field_config import FIELD_OPTIONS
from gemini_parser import generate_parser


# ============================================================
# PAGE CONFIGURATION
# ============================================================

st.set_page_config(
    page_title="Nexra",
    page_icon="🕷️",
    layout="wide",
    initial_sidebar_state="expanded"
)


# ============================================================
# LOAD EXTERNAL CSS
# ============================================================

def load_css():

    css_path = Path(__file__).parent / "style.css"

    if not css_path.exists():

        st.warning(
            "style.css was not found. "
            "The application will continue without custom styling."
        )

        return

    with open(
        css_path,
        "r",
        encoding="utf-8"
    ) as file:

        css = file.read()

    st.markdown(
        f"<style>{css}</style>",
        unsafe_allow_html=True
    )


load_css()


# ============================================================
# CONSTANTS
# ============================================================

WEBSITE_TYPES = [
    "Ecommerce",
    "Airline",
    "Hotel",
    "Restaurant",
    "Grocery",
    "Bus",
    "Train",
    "Other"
]


# ============================================================
# PARSE CURL
# ============================================================

def parse_curl(curl):

    # Handle multiline cURL
    curl = curl.replace("\\\n", " ")

    # Split cURL safely
    parts = shlex.split(curl)

    url = None
    method = "GET"
    headers = {}
    data = None

    i = 0

    while i < len(parts):

        part = parts[i]

        # ----------------------------------------------------
        # URL
        # ----------------------------------------------------

        if part in [
            "--url",
            "-url"
        ]:

            i += 1

            if i < len(parts):

                url = parts[i]

        elif (
            part.startswith("http://")
            or part.startswith("https://")
        ):

            if url is None:

                url = part

        # ----------------------------------------------------
        # HEADERS
        # ----------------------------------------------------

        elif part in [
            "-H",
            "--header"
        ]:

            i += 1

            if i < len(parts):

                header = parts[i]

                if ":" in header:

                    key, value = header.split(
                        ":",
                        1
                    )

                    headers[
                        key.strip()
                    ] = value.strip()

        # ----------------------------------------------------
        # HTTP METHOD
        # ----------------------------------------------------

        elif part in [
            "-X",
            "--request"
        ]:

            i += 1

            if i < len(parts):

                method = parts[i].upper()

        # ----------------------------------------------------
        # REQUEST BODY
        # ----------------------------------------------------

        elif part in [
            "-d",
            "--data",
            "--data-raw",
            "--data-binary"
        ]:

            i += 1

            if i < len(parts):

                data = parts[i]

                # If body exists and method wasn't specified,
                # cURL normally uses POST.
                if method == "GET":

                    method = "POST"

        i += 1

    return {
        "url": url,
        "method": method,
        "headers": headers,
        "data": data
    }


# ============================================================
# EXECUTE REQUEST
# ============================================================

def execute_request(request_data):

    url = request_data["url"]
    method = request_data["method"]
    headers = request_data["headers"]
    data = request_data["data"]

    if not url:

        raise ValueError(
            "URL not found in cURL."
        )

    response = requests.request(
        method=method,
        url=url,
        headers=headers,
        data=data,
        timeout=30
    )

    return response


# ============================================================
# CLEAN GEMINI GENERATED CODE
# ============================================================

def clean_generated_code(parser_code):

    if not parser_code:

        return ""

    clean_code = parser_code.strip()

    # Remove Python code fence
    if clean_code.startswith("```python"):

        clean_code = clean_code[
            len("```python"):
        ].strip()

    # Remove generic code fence
    elif clean_code.startswith("```"):

        clean_code = clean_code[
            len("```"):
        ].strip()

    # Remove ending code fence
    if clean_code.endswith("```"):

        clean_code = clean_code[
            :-3
        ].strip()

    return clean_code


# ============================================================
# EXECUTE GENERATED PARSER
# ============================================================

def execute_generated_parser(
    parser_code,
    response_data
):

    clean_code = clean_generated_code(
        parser_code
    )

    if not clean_code:

        raise ValueError(
            "Gemini returned empty parser code."
        )

    namespace = {}

    # Execute generated code
    exec(
        clean_code,
        namespace
    )

    # Get parse_data function
    parse_data = namespace.get(
        "parse_data"
    )

    if not parse_data:

        raise ValueError(
            "parse_data() function was not found "
            "in generated code."
        )

    # Execute parser
    extracted_data = parse_data(
        response_data
    )

    return extracted_data


# ============================================================
# WEBSITE TYPE SECTION
# ============================================================

def website_type_section(key):

    return st.selectbox(
        "Website Type",
        WEBSITE_TYPES,
        key=key
    )


# ============================================================
# REQUIRED FIELDS SECTION
# ============================================================

def required_fields_section(
    key,
    site_type
):

    # ========================================================
    # OTHER
    # ========================================================

    if site_type == "Other":

        return st.text_area(
            "Fields to Extract",
            height=180,
            placeholder="""Enter fields, one per line...

Example:
title
price
image_url
custom_field""",
            key=f"{key}_other_fields"
        )

    # ========================================================
    # PREDEFINED CATEGORY
    # ========================================================

    available_fields = FIELD_OPTIONS.get(
        site_type,
        []
    )

    selected_fields = st.multiselect(
        "Select Fields",
        options=available_fields,
        key=f"{key}_selected_fields",
        placeholder="Select fields to extract..."
    )

    # ========================================================
    # CUSTOM FIELDS
    # ========================================================

    custom_fields = st.text_area(
        "Other Fields",
        height=100,
        placeholder="""Add custom fields, one per line...

Example:
store_id
membership_price
discount_percentage""",
        key=f"{key}_custom_fields"
    )

    # ========================================================
    # COMBINE FIELDS
    # ========================================================

    final_fields = []

    for field in selected_fields:

        if field not in final_fields:

            final_fields.append(field)

    for field in custom_fields.splitlines():

        field = field.strip()

        if field and field not in final_fields:

            final_fields.append(field)

    return "\n".join(
        final_fields
    )

# ============================================================
# GENERATE + EXECUTE PARSER
# ============================================================

def generate_and_execute(
    response_data,
    site_type,
    fields
):

    # --------------------------------------------------------
    # RESPONSE VALIDATION
    # --------------------------------------------------------

    if not response_data:

        st.warning(
            "Please provide response data."
        )

        return

    if not response_data.strip():

        st.warning(
            "Please provide response data."
        )

        return

    # --------------------------------------------------------
    # REQUIRED FIELDS VALIDATION
    # --------------------------------------------------------

    if not fields.strip():

        st.warning(
            "Please enter at least one required field."
        )

        return

    # --------------------------------------------------------
    # GEMINI PARSER GENERATION
    # --------------------------------------------------------

    with st.spinner(
        "Gemini is analyzing the response "
        "and generating parse_data()..."
    ):

        try:

            parser_code = generate_parser(
                response_data,
                site_type,
                fields
            )

        except Exception as e:

            st.error(
                f"Gemini parser generation failed: {e}"
            )

            return

    # --------------------------------------------------------
    # CLEAN GENERATED CODE
    # --------------------------------------------------------

    parser_code = clean_generated_code(
        parser_code
    )

    if not parser_code:

        st.error(
            "Gemini returned empty parser code."
        )

        return

    st.success(
        "parse_data() generated successfully."
    )

    # --------------------------------------------------------
    # CODE + EXTRACTED VALUES
    # --------------------------------------------------------

    col1, col2 = st.columns(
        2,
        gap="large"
    )

    # ========================================================
    # LEFT PANEL - GENERATED CODE
    # ========================================================

    with col1:

        st.markdown(
            '<div class="output-title">'
            '🐍 Generated Parser Code'
            '</div>',
            unsafe_allow_html=True
        )

        st.code(
            parser_code,
            language="python"
        )

    # ========================================================
    # RIGHT PANEL - EXTRACTED VALUES
    # ========================================================

    with col2:

        st.markdown(
            '<div class="output-title">'
            '📊 Extracted Values'
            '</div>',
            unsafe_allow_html=True
        )

        with st.spinner(
            "Running generated parser..."
        ):

            try:

                extracted_data = execute_generated_parser(
                    parser_code,
                    response_data
                )

                if extracted_data:

                    if isinstance(
                        extracted_data,
                        list
                    ):

                        st.success(
                            f"Extracted "
                            f"{len(extracted_data)} record(s)."
                        )

                    else:

                        st.success(
                            "Data extracted successfully."
                        )

                    st.json(
                        extracted_data
                    )

                else:

                    st.warning(
                        "Parser executed successfully, "
                        "but returned no data."
                    )

            except Exception as e:

                st.error(
                    "Could not execute generated parser."
                )

                st.code(
                    str(e),
                    language="text"
                )


# ============================================================
# PAGE HEADER
# ============================================================

st.markdown(
    '<div class="main-title">'
    '🕷️ Nexra'
    '</div>',
    unsafe_allow_html=True
)

st.markdown(
    '<div class="main-description">'
    'Generate a complete Python parse_data() function '
    'from a cURL request or directly from a website response.'
    '</div>',
    unsafe_allow_html=True
)


# ============================================================
# TOP NAVIGATION
# ============================================================

curl_tab, response_tab = st.tabs(
    [
        "🔗  CURL TO PARSE",
        "📦  RESPONSE TO PARSE"
    ]
)


# ################################################################
# CURL TO PARSE
# ################################################################

with curl_tab:

    st.markdown(
        """
        <div class="section-header">
            <div class="section-icon">🔗</div>
            <div class="section-title">CURL to Parse</div>
        </div>

        <div class="section-description">
            Provide a complete cURL request. The request will be
            executed, analyzed, and converted into a Python parser.
        </div>
        """,
        unsafe_allow_html=True
    )

    # ============================================================
    # CURL INPUT
    # ============================================================

    st.subheader(
        "1. cURL Request"
    )

    curl = st.text_area(
        "Paste cURL",
        height=280,
        placeholder="""Paste your complete cURL here...

Example:

curl --url 'https://example.com/product' \\
-H 'accept: text/html' \\
-H 'user-agent: Mozilla/5.0'""",
        key="curl_input"
    )

    # ============================================================
    # WEBSITE TYPE
    # ============================================================

    st.subheader(
        "2. Website Type"
    )

    curl_site_type = website_type_section(
        "curl_website_type"
    )

    # ============================================================
    # REQUIRED FIELDS
    # ============================================================

    st.subheader(
        "3. Fields to Extract"
    )

    curl_fields = required_fields_section(
        "curl_required_fields",
        curl_site_type
    )

    # ============================================================
    # GENERATE PARSER
    # ============================================================

    if st.button(
        "🚀  Generate Parser from cURL",
        type="primary",
        use_container_width=True,
        key="curl_generate"
    ):

        # --------------------------------------------------------
        # CURL VALIDATION
        # --------------------------------------------------------

        if not curl.strip():

            st.warning(
                "Please paste a cURL request."
            )

            st.stop()

        if not curl_fields.strip():

            st.warning(
                "Please enter at least one required field."
            )

            st.stop()

        # --------------------------------------------------------
        # PARSE CURL
        # --------------------------------------------------------

        with st.spinner(
            "Parsing cURL..."
        ):

            try:

                request_data = parse_curl(
                    curl
                )

            except Exception as e:

                st.error(
                    f"Failed to parse cURL: {e}"
                )

                st.stop()

        # --------------------------------------------------------
        # URL VALIDATION
        # --------------------------------------------------------

        if not request_data["url"]:

            st.error(
                "URL could not be found in the cURL."
            )

            st.stop()

        # --------------------------------------------------------
        # PARSED REQUEST
        # --------------------------------------------------------

        st.divider()

        st.subheader(
            "🔎 Parsed Request"
        )

        col1, col2 = st.columns(2)

        with col1:

            st.caption(
                "HTTP Method"
            )

            st.code(
                request_data["method"]
            )

        with col2:

            st.caption(
                "Request URL"
            )

            st.code(
                request_data["url"]
            )

        # --------------------------------------------------------
        # HEADERS
        # --------------------------------------------------------

        with st.expander(
            "📋 Request Headers"
        ):

            if request_data["headers"]:

                st.json(
                    request_data["headers"]
                )

            else:

                st.info(
                    "No request headers found."
                )

        # --------------------------------------------------------
        # REQUEST BODY
        # --------------------------------------------------------

        if request_data["data"]:

            with st.expander(
                "📦 Request Body"
            ):

                st.code(
                    request_data["data"],
                    language="json"
                )

        # --------------------------------------------------------
        # EXECUTE REQUEST
        # --------------------------------------------------------

        st.divider()

        st.subheader(
            "🌐 Website Response"
        )

        with st.spinner(
            "Sending request..."
        ):

            try:

                response = execute_request(
                    request_data
                )

            except requests.RequestException as e:

                st.error(
                    f"Request failed: {e}"
                )

                st.stop()

            except Exception as e:

                st.error(
                    f"Unexpected error: {e}"
                )

                st.stop()

        # --------------------------------------------------------
        # RESPONSE STATUS
        # --------------------------------------------------------

        if response.ok:

            st.success(
                f"Response received successfully — "
                f"Status Code: {response.status_code}"
            )

        else:

            st.warning(
                f"Response received — "
                f"Status Code: {response.status_code}"
            )

        # --------------------------------------------------------
        # RESPONSE INFORMATION
        # --------------------------------------------------------

        response_size = len(
            response.text
        )

        content_type = response.headers.get(
            "Content-Type",
            "Unknown"
        )

        info_col1, info_col2 = st.columns(2)

        with info_col1:

            st.metric(
                "Response Size",
                f"{response_size:,} chars"
            )

        with info_col2:

            st.metric(
                "Status Code",
                response.status_code
            )

        st.caption(
            f"Content-Type: {content_type}"
        )

        # --------------------------------------------------------
        # RESPONSE PREVIEW
        # --------------------------------------------------------

        with st.expander(
            "📄 View Response Preview"
        ):

            st.code(
                response.text[:10000],
                language="html"
            )

            if response_size > 10000:

                st.caption(
                    "Preview shows the first 10,000 characters. "
                    "The complete response is used for parsing."
                )

        # --------------------------------------------------------
        # AI PARSER
        # --------------------------------------------------------

        st.divider()

        st.subheader(
            "🤖 AI Generated Parser"
        )

        generate_and_execute(
            response.text,
            curl_site_type,
            curl_fields
        )


# ################################################################
# RESPONSE TO PARSE
# ################################################################

with response_tab:

    st.markdown(
        """
        <div class="section-header">
            <div class="section-icon">📦</div>
            <div class="section-title">Response to Parse</div>
        </div>

        <div class="section-description">
            Provide HTML, JSON, text, or Excel response data.
            No HTTP request will be made in this mode.
        </div>
        """,
        unsafe_allow_html=True
    )

    # ============================================================
    # RESPONSE TYPE
    # ============================================================

    st.subheader(
        "1. Response Type"
    )

    response_type = st.selectbox(
        "Select Response Type",
        [
            "HTML",
            "JSON",
            "Text",
            "Excel"
        ],
        key="response_type"
    )

    response_data = None

    # ============================================================
    # HTML / JSON / TEXT
    # ============================================================

    if response_type in [
        "HTML",
        "JSON",
        "Text"
    ]:

        response_data = st.text_area(
            "Complete Response",
            height=450,
            placeholder=(
                "Paste the complete HTML / JSON / text response here..."
            ),
            key="direct_response"
        )

        if response_data:

            st.caption(
                f"{len(response_data):,} characters provided"
            )

    # ============================================================
    # EXCEL
    # ============================================================

    elif response_type == "Excel":

        uploaded_file = st.file_uploader(
            "Upload Excel File",
            type=[
                "xlsx",
                "xls"
            ],
            key="excel_upload"
        )

        if uploaded_file:

            try:

                df = pd.read_excel(
                    uploaded_file
                )

                st.success(
                    f"Excel loaded successfully — "
                    f"{len(df):,} rows × "
                    f"{len(df.columns):,} columns"
                )

                with st.expander(
                    "👀 Preview Excel Data",
                    expanded=True
                ):

                    st.dataframe(
                        df,
                        use_container_width=True
                    )

                # Convert Excel rows to JSON
                response_data = df.to_json(
                    orient="records",
                    force_ascii=False
                )

            except Exception as e:

                st.error(
                    f"Excel reading failed: {e}"
                )

    # ============================================================
    # WEBSITE TYPE
    # ============================================================

    st.subheader(
        "2. Website Type"
    )

    response_site_type = website_type_section(
        "response_website_type"
    )

    # ============================================================
    # REQUIRED FIELDS
    # ============================================================

    st.subheader(
        "3. Fields to Extract"
    )

    response_fields = required_fields_section(
        "response_required_fields",
        response_site_type
    )

    # ============================================================
    # GENERATE PARSER
    # ============================================================

    if st.button(
        "🚀  Generate Parser from Response",
        type="primary",
        use_container_width=True,
        key="response_generate"
    ):

        # --------------------------------------------------------
        # RESPONSE VALIDATION
        # --------------------------------------------------------

        if not response_data:

            st.warning(
                "Please provide response data."
            )

            st.stop()

        if not response_data.strip():

            st.warning(
                "Please provide response data."
            )

            st.stop()

        if not response_fields.strip():

            st.warning(
                "Please enter at least one required field."
            )

            st.stop()

        # --------------------------------------------------------
        # RESPONSE INFORMATION
        # --------------------------------------------------------

        st.divider()

        st.subheader(
            "📄 Response Information"
        )

        response_size = len(
            response_data
        )

        st.metric(
            "Response Size",
            f"{response_size:,} characters"
        )

        # --------------------------------------------------------
        # RESPONSE PREVIEW
        # --------------------------------------------------------

        with st.expander(
            "👀 View Response Preview"
        ):

            if response_type == "JSON":

                preview_language = "json"

            elif response_type == "Text":

                preview_language = "text"

            else:

                preview_language = "html"

            st.code(
                response_data[:10000],
                language=preview_language
            )

            if response_size > 10000:

                st.caption(
                    "Preview shows the first 10,000 characters. "
                    "The complete response is used for parsing."
                )

        # --------------------------------------------------------
        # AI PARSER
        # --------------------------------------------------------

        st.divider()

        st.subheader(
            "🤖 AI Generated Parser"
        )

        generate_and_execute(
            response_data,
            response_site_type,
            response_fields
        )