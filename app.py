
import base64
import json
import re
import shlex
from io import BytesIO

import requests
from flask import Flask, jsonify, render_template, request
from field_config import FIELD_OPTIONS
from gemini_parser import generate_parser


app = Flask(
    __name__,
    static_folder="public",
    static_url_path="",
    template_folder="templates",
)

app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024

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


def parse_curl(curl_text):
    """Parse common cURL options into requests-compatible data."""
    curl_text = curl_text.replace("\\\r\n", " ")
    curl_text = curl_text.replace("\\\n", " ")
    parts = shlex.split(curl_text)

    url = None
    method = "GET"
    headers = {}
    body = None
    cookies = None

    i = 0
    while i < len(parts):
        part = parts[i]

        if part in ("curl",):
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
            "-d", "--data", "--data-raw", "--data-binary",
            "--data-ascii", "--data-urlencode",
        ):
            i += 1
            if i < len(parts):
                body = parts[i]
                if method == "GET":
                    method = "POST"

        elif part in ("-b", "--cookie"):
            i += 1
            if i < len(parts):
                cookies = parts[i]

        elif part.startswith("http://") or part.startswith("https://"):
            if not url:
                url = part

        i += 1

    if cookies:
        headers.setdefault("Cookie", cookies)

    if not url:
        raise ValueError("URL could not be found in the cURL command.")

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


def clean_generated_code(code):
    if not code:
        return ""

    code = code.strip()

    if code.startswith("```python"):
        code = code[len("```python"):].strip()
    elif code.startswith("```"):
        code = code[len("```"):].strip()

    if code.endswith("```"):
        code = code[:-3].strip()

    return code


def execute_generated_parser(parser_code, response_data):
    """
    Run the generated parse_data(data) function.

    Note: generated Python code is executable code, so only use this
    feature with trusted Gemini-generated output.
    """
    parser_code = clean_generated_code(parser_code)

    if not parser_code:
        raise ValueError("The generated parser code is empty.")

    namespace = {}
    exec(parser_code, namespace)

    parse_data = namespace.get("parse_data")
    if not callable(parse_data):
        raise ValueError("Generated code does not contain parse_data(data).")

    result = parse_data(response_data)

    # Ensure the output can be returned as JSON.
    json.dumps(result, ensure_ascii=False, default=str)
    return result


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/fields")
def get_fields():
    return jsonify({
        "website_types": WEBSITE_TYPES,
        "fields": FIELD_OPTIONS,
    })


@app.post("/api/generate")
def generate():
    try:
        payload = request.get_json(silent=True) or {}

        mode = str(payload.get("mode", "response")).strip().lower()
        category = str(payload.get("category", "Other")).strip()
        input_text = str(payload.get("input", "")).strip()
        response_type = str(payload.get("response_type", "json")).lower()

        selected_fields = payload.get("fields", [])
        custom_fields = payload.get("custom_fields", [])

        if category not in WEBSITE_TYPES:
            return jsonify({"error": "Invalid website category."}), 400

        if mode not in ("curl", "response"):
            return jsonify({"error": "Invalid parser mode."}), 400

        if not input_text:
            return jsonify({"error": "Please provide cURL or response data."}), 400

        if not isinstance(selected_fields, list):
            return jsonify({"error": "Fields must be provided as a list."}), 400

        if not isinstance(custom_fields, list):
            return jsonify({"error": "Custom fields must be provided as a list."}), 400

        fields = []
        for item in selected_fields + custom_fields:
            field = str(item).strip()
            if field and field not in fields:
                fields.append(field)

        if not fields:
            return jsonify({"error": "Select at least one field to extract."}), 400

        request_info = None

        if mode == "curl":
            response_data, request_info = execute_curl_request(input_text)
        else:
            response_data = input_text

            if response_type == "json":
                try:
                    json.loads(response_data)
                except json.JSONDecodeError as exc:
                    return jsonify({
                        "error": f"Input is not valid JSON: {exc.msg} (line {exc.lineno})."
                    }), 400
            elif response_type != "html":
                return jsonify({"error": "Response type must be JSON or HTML."}), 400

        image_data = None
        image_mime_type = None
        image_data_url = payload.get("reference_image")

        if image_data_url:
            if not isinstance(image_data_url, str) or "," not in image_data_url:
                return jsonify({"error": "Invalid reference image data."}), 400

            header, encoded = image_data_url.split(",", 1)
            match = re.match(r"data:(image/(?:png|jpeg|webp));base64$", header)

            if not match:
                return jsonify({"error": "Reference image must be PNG, JPG or WebP."}), 400

            image_mime_type = match.group(1)

            try:
                image_data = base64.b64decode(encoded, validate=True)
            except Exception:
                return jsonify({"error": "Could not decode the reference image."}), 400

            if len(image_data) > 5 * 1024 * 1024:
                return jsonify({"error": "Reference image must be 5 MB or smaller."}), 400

        required_fields = "\n".join(fields)

        parser_code = generate_parser(
            response_data=response_data,
            site_type=category,
            required_fields=required_fields,
            reference_image=image_data,
            image_mime_type=image_mime_type,
        )

        parser_code = clean_generated_code(parser_code)

        try:
            extracted_data = execute_generated_parser(parser_code, response_data)
            execution_error = None
        except Exception as exc:
            extracted_data = []
            execution_error = str(exc)

        result = {
            "success": True,
            "parser_code": parser_code,
            "extracted_data": extracted_data,
            "record_count": len(extracted_data) if isinstance(extracted_data, list) else 1,
            "execution_error": execution_error,
            "request_info": request_info,
        }

        return jsonify(result)

    except requests.RequestException as exc:
        return jsonify({
            "error": f"Could not fetch the cURL URL: {str(exc)}"
        }), 502

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except Exception as exc:
        app.logger.exception("Parser generation failed")
        return jsonify({
            "error": f"Parser generation failed: {str(exc)}"
        }), 500


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({"error": "Request too large. Reference images must be 5 MB or smaller."}), 413


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port= int(__import__("os").environ.get("PORT", "5000")),
        debug=False,
    )
