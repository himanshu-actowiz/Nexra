
import os
import base64
import json
import re
import shlex

import requests
from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    send_from_directory,
)

from field_config import FIELD_OPTIONS
from gemini_parser import generate_parser


# =========================================================
# FLASK APPLICATION
# =========================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

app = Flask(
    __name__,
    static_folder=None,
    template_folder=TEMPLATES_DIR,
)

app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024
app.config["JSON_SORT_KEYS"] = False

WEBSITE_TYPES = [
    "Ecommerce",
    "Airline",
    "Hotel",
    "Restaurant",
    "Grocery",
    "Bus",
    "Train",
    "Other",
]


# =========================================================
# STATIC FILES
# =========================================================

@app.get("/")
def home():
    return render_template("index.html")


@app.get("/script.js")
def serve_script():
    file_path = os.path.join(PUBLIC_DIR, "script.js")

    if not os.path.isfile(file_path):
        app.logger.error("Missing JavaScript file: %s", file_path)
        return "script.js not found in public folder", 404

    response = send_from_directory(
        PUBLIC_DIR,
        "script.js",
        mimetype="application/javascript",
        conditional=True,
    )
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/style.css")
def serve_styles():
    file_path = os.path.join(PUBLIC_DIR, "style.css")

    if not os.path.isfile(file_path):
        app.logger.error("Missing CSS file: %s", file_path)
        return "style.css not found in public folder", 404

    response = send_from_directory(
        PUBLIC_DIR,
        "style.css",
        mimetype="text/css",
        conditional=True,
    )
    response.headers["Cache-Control"] = "no-cache"
    return response


# =========================================================
# CATEGORY FIELDS
# =========================================================

@app.get("/api/fields")
def get_fields():
    return jsonify({
        "website_types": WEBSITE_TYPES,
        "fields": FIELD_OPTIONS,
    })


# =========================================================
# CURL PARSER
# =========================================================

def parse_curl(curl_text):
    """Parse common cURL options into requests-compatible data."""

    curl_text = curl_text.replace("\\\r\n", " ")
    curl_text = curl_text.replace("\\\n", " ")

    try:
        parts = shlex.split(curl_text, posix=True)
    except ValueError as exc:
        raise ValueError(f"Could not parse cURL command: {exc}") from exc

    url = None
    method = None
    headers = {}
    body_parts = []
    cookies = None

    i = 0

    while i < len(parts):
        part = parts[i]

        if part.lower() == "curl":
            i += 1
            continue

        if part in ("--url",):
            i += 1
            if i < len(parts):
                url = parts[i]

        elif part in ("-H", "--header"):
            i += 1

            if i < len(parts):
                header = parts[i]

                if ":" in header:
                    name, value = header.split(":", 1)
                    headers[name.strip()] = value.strip()

        elif part in ("-X", "--request"):
            i += 1

            if i < len(parts):
                method = parts[i].upper()

        elif part in (
            "-d",
            "--data",
            "--data-raw",
            "--data-binary",
            "--data-ascii",
            "--data-urlencode",
        ):
            i += 1

            if i < len(parts):
                body_parts.append(parts[i])

        elif part in ("-b", "--cookie"):
            i += 1

            if i < len(parts):
                cookies = parts[i]

        elif part in ("-u", "--user"):
            i += 1

            if i < len(parts):
                headers["Authorization"] = (
                    "Basic "
                    + base64.b64encode(
                        parts[i].encode("utf-8")
                    ).decode("ascii")
                )

        elif part.startswith("http://") or part.startswith("https://"):
            if not url:
                url = part

        i += 1

    if not url:
        raise ValueError(
            "URL could not be found in the cURL command."
        )

    if cookies:
        headers.setdefault("Cookie", cookies)

    body = "&".join(body_parts) if body_parts else None

    if method is None:
        method = "POST" if body is not None else "GET"

    return {
        "url": url,
        "method": method,
        "headers": headers,
        "data": body,
    }


def execute_curl_request(curl_text):
    request_data = parse_curl(curl_text)

    response = requests.request(
        method=request_data["method"],
        url=request_data["url"],
        headers=request_data["headers"],
        data=request_data["data"],
        timeout=45,
        allow_redirects=True,
    )

    response.raise_for_status()

    return response.text, {
        "url": response.url,
        "status_code": response.status_code,
        "method": request_data["method"],
    }


# =========================================================
# GENERATED CODE HELPERS
# =========================================================

def clean_generated_code(code):
    if not code:
        return ""

    code = str(code).strip()

    if code.startswith("```python"):
        code = code[len("```python"):].strip()

    elif code.startswith("```"):
        code = code[len("```"):].strip()

    if code.endswith("```"):
        code = code[:-3].strip()

    return code


def execute_generated_parser(parser_code, response_data):
    """
    Execute a generated parse_data(data) function.

    WARNING:
    exec() runs Python code. Use only trusted generated code.
    For production use, run generated parsers in an isolated sandbox.
    """

    parser_code = clean_generated_code(parser_code)

    if not parser_code:
        raise ValueError("The generated parser code is empty.")

    namespace = {}

    exec(parser_code, namespace)

    parse_data = namespace.get("parse_data")

    if not callable(parse_data):
        raise ValueError(
            "Generated code does not contain parse_data(data)."
        )

    result = parse_data(response_data)

    # Verify that the result can be serialized.
    json.dumps(result, ensure_ascii=False, default=str)

    return result


# =========================================================
# GENERATE PARSER API
# =========================================================

@app.post("/api/generate")
def generate():
    try:
        payload = request.get_json(silent=True)

        if not isinstance(payload, dict):
            return jsonify({
                "error": "Request must contain valid JSON."
            }), 400

        mode = str(
            payload.get("mode", "response")
        ).strip().lower()

        category = str(
            payload.get("category", "Other")
        ).strip()

        input_text = str(
            payload.get("input", "")
        ).strip()

        response_type = str(
            payload.get("response_type", "json")
        ).strip().lower()

        selected_fields = payload.get("fields", [])
        custom_fields = payload.get("custom_fields", [])

        if category not in WEBSITE_TYPES:
            return jsonify({
                "error": "Invalid website category."
            }), 400

        if mode not in ("curl", "response"):
            return jsonify({
                "error": "Invalid parser mode."
            }), 400

        if not input_text:
            return jsonify({
                "error": "Please provide cURL or response data."
            }), 400

        if not isinstance(selected_fields, list):
            return jsonify({
                "error": "Fields must be provided as a list."
            }), 400

        if not isinstance(custom_fields, list):
            return jsonify({
                "error": "Custom fields must be provided as a list."
            }), 400

        fields = []

        for item in selected_fields + custom_fields:
            field = str(item).strip()

            if field and field not in fields:
                fields.append(field)

        if not fields:
            return jsonify({
                "error": "Select at least one field to extract."
            }), 400

        request_info = None

        # -------------------------------------------------
        # GET RESPONSE FROM CURL OR USER INPUT
        # -------------------------------------------------

        if mode == "curl":
            response_data, request_info = execute_curl_request(
                input_text
            )

        else:
            response_data = input_text

            if response_type == "json":
                try:
                    json.loads(response_data)

                except json.JSONDecodeError as exc:
                    return jsonify({
                        "error": (
                            f"Invalid JSON: {exc.msg} "
                            f"(line {exc.lineno}, "
                            f"column {exc.colno})."
                        )
                    }), 400

            elif response_type != "html":
                return jsonify({
                    "error": "Response type must be JSON or HTML."
                }), 400

        # -------------------------------------------------
        # OPTIONAL REFERENCE IMAGE
        # -------------------------------------------------

        image_data = None
        image_mime_type = None

        image_data_url = payload.get("reference_image")

        if image_data_url:
            if (
                not isinstance(image_data_url, str)
                or "," not in image_data_url
            ):
                return jsonify({
                    "error": "Invalid reference image data."
                }), 400

            header, encoded = image_data_url.split(",", 1)

            match = re.fullmatch(
                r"data:(image/(?:png|jpeg|webp));base64",
                header,
            )

            if not match:
                return jsonify({
                    "error": (
                        "Reference image must be PNG, JPG or WebP."
                    )
                }), 400

            image_mime_type = match.group(1)

            try:
                image_data = base64.b64decode(
                    encoded,
                    validate=True,
                )

            except (ValueError, base64.binascii.Error):
                return jsonify({
                    "error": "Could not decode the reference image."
                }), 400

            if len(image_data) > 5 * 1024 * 1024:
                return jsonify({
                    "error": (
                        "Reference image must be 5 MB or smaller."
                    )
                }), 400

        # -------------------------------------------------
        # GEMINI PARSER GENERATION
        # -------------------------------------------------

        required_fields = "\n".join(fields)

        parser_code = generate_parser(
            response_data=response_data,
            site_type=category,
            required_fields=required_fields,
            reference_image=image_data,
            image_mime_type=image_mime_type,
        )

        parser_code = clean_generated_code(parser_code)

        if not parser_code:
            return jsonify({
                "error": (
                    "Gemini returned empty parser code. "
                    "Please try again."
                )
            }), 502

        # -------------------------------------------------
        # EXECUTE GENERATED PARSER
        # -------------------------------------------------

        try:
            extracted_data = execute_generated_parser(
                parser_code,
                response_data,
            )

            execution_error = None

        except Exception as exc:
            app.logger.exception(
                "Generated parser execution failed"
            )

            extracted_data = []
            execution_error = str(exc)

        if isinstance(extracted_data, list):
            record_count = len(extracted_data)
        else:
            record_count = 1 if extracted_data is not None else 0

        return jsonify({
            "success": True,
            "parser_code": parser_code,
            "extracted_data": extracted_data,
            "record_count": record_count,
            "execution_error": execution_error,
            "request_info": request_info,
        })

    except requests.RequestException as exc:
        app.logger.exception("cURL request failed")

        return jsonify({
            "error": f"Could not fetch the cURL URL: {str(exc)}"
        }), 502

    except ValueError as exc:
        return jsonify({
            "error": str(exc)
        }), 400

    except Exception as exc:
        app.logger.exception("Parser generation failed")

        return jsonify({
            "error": f"Parser generation failed: {str(exc)}"
        }), 500


# =========================================================
# ERROR HANDLERS
# =========================================================

@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({
        "error": (
            "Request too large. "
            "Reference images must be 5 MB or smaller."
        )
    }), 413


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return jsonify({
            "error": "API endpoint not found."
        }), 404

    return "Page not found", 404


# =========================================================
# LOCAL DEVELOPMENT
# =========================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False,
    )
