import os
import base64
import json
import shlex
import requests
from flask import Flask, jsonify, render_template, request, send_from_directory
from field_config import FIELD_OPTIONS
from gemini_parser import generate_parser
from werkzeug.exceptions import RequestEntityTooLarge


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

app = Flask(
    __name__,
    static_folder=None,
    template_folder=TEMPLATES_DIR,
)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
app.config["JSON_SORT_KEYS"] = False

WEBSITE_TYPES = [
    "Ecommerce", "Airline", "Hotel", "Restaurant",
    "Grocery", "Bus", "Train", "Other",
]



@app.get("/")
def home():
    return render_template("index.html")


@app.get("/script.js")
def serve_script():
    path = os.path.join(PUBLIC_DIR, "script.js")
    if not os.path.isfile(path):
        return "script.js not found in public folder", 404
    if os.path.getsize(path) == 0:
        return "script.js is empty in public folder", 500

    response = send_from_directory(
        PUBLIC_DIR, "script.js",
        mimetype="application/javascript",
        conditional=False,
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/style.css")
def serve_styles():
    path = os.path.join(PUBLIC_DIR, "style.css")
    if not os.path.isfile(path):
        return "style.css not found in public folder", 404
    if os.path.getsize(path) == 0:
        return "style.css is empty in public folder", 500

    response = send_from_directory(
        PUBLIC_DIR, "style.css",
        mimetype="text/css",
        conditional=False,
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/fields")
def get_fields():
    return jsonify({
        "website_types": WEBSITE_TYPES,
        "fields": FIELD_OPTIONS,
    })


@app.errorhandler(RequestEntityTooLarge)
def handle_large_request(error):
    return jsonify({
        "success": False,
        "error": (
            "Request size exceeds the 25 MB limit. "
            "Reduce the response size or upload fewer/smaller images."
        )
    }), 413

def parse_curl(curl_text):
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

        if part == "--url":
            i += 1
            if i < len(parts):
                url = parts[i]

        elif part in ("-H", "--header"):
            i += 1
            if i < len(parts) and ":" in parts[i]:
                name, value = parts[i].split(":", 1)
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
                body_parts.append(parts[i])

        elif part in ("-b", "--cookie"):
            i += 1
            if i < len(parts):
                cookies = parts[i]

        elif part in ("-u", "--user"):
            i += 1
            if i < len(parts):
                token = base64.b64encode(
                    parts[i].encode("utf-8")
                ).decode("ascii")
                headers["Authorization"] = f"Basic {token}"

        elif part.startswith(("http://", "https://")):
            if not url:
                url = part

        i += 1

    if not url:
        raise ValueError("URL could not be found in the cURL command.")

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
    data = parse_curl(curl_text)
    response = requests.request(
        method=data["method"],
        url=data["url"],
        headers=data["headers"],
        data=data["data"],
        timeout=45,
        allow_redirects=True,
    )
    response.raise_for_status()

    return response.text, {
        "url": response.url,
        "status_code": response.status_code,
        "method": data["method"],
    }


def clean_generated_code(code):
    if not code:
        return ""

    code = str(code).strip()
    if code.startswith("```python"):
        code = code[len("```python"):].strip()
    elif code.startswith("```"):
        code = code[3:].strip()

    if code.endswith("```"):
        code = code[:-3].strip()

    return code


def execute_generated_parser(parser_code, response_data):
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
    json.dumps(result, ensure_ascii=False, default=str)
    return result


@app.post("/api/generate")
def generate():
    try:
        if request.is_json:
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict):
                return jsonify({
                    "error": "Request must contain valid JSON."
                }), 400
        else:
            payload = request.form.to_dict()

        mode = str(payload.get("mode", "curl")).strip().lower()
        category = str(payload.get("category", "Other")).strip()
        input_text = str(payload.get("input", "")).strip()
        response_type = str(
            payload.get("response_type", "json")
        ).strip().lower()

        selected_fields = payload.get(
            "required_fields", payload.get("fields", [])
        )
        custom_fields = payload.get("custom_fields", [])

        if isinstance(selected_fields, str):
            selected_fields = json.loads(selected_fields or "[]")
        if isinstance(custom_fields, str):
            custom_fields = json.loads(custom_fields or "[]")

        if category not in WEBSITE_TYPES:
            return jsonify({"error": "Invalid website category."}), 400
        if mode not in ("curl", "response"):
            return jsonify({"error": "Invalid parser mode."}), 400
        if not input_text:
            return jsonify({
                "error": "Please provide cURL or response data."
            }), 400
        if not isinstance(selected_fields, list):
            return jsonify({"error": "Fields must be a list."}), 400
        if not isinstance(custom_fields, list):
            return jsonify({
                "error": "Custom fields must be a list."
            }), 400

        fields = list(dict.fromkeys(
            str(item).strip()
            for item in selected_fields + custom_fields
            if str(item).strip()
        ))
        if not fields:
            return jsonify({
                "error": "Select at least one field to extract."
            }), 400

        request_info = None

        if mode == "curl":
            response_data, request_info = execute_curl_request(input_text)
        else:
            response_data = input_text
            if response_type == "json":
                try:
                    response_data = json.loads(input_text)
                except json.JSONDecodeError as exc:
                    return jsonify({
                        "error": f"Invalid JSON response: {exc}"
                    }), 400

        image_file = request.files.get("reference_image")
        reference_image = None
        image_mime_type = None

        if image_file and image_file.filename:
            image_mime_type = image_file.mimetype or "image/png"
            allowed_types = {
                "image/png", "image/jpeg", "image/webp"
            }
            if image_mime_type not in allowed_types:
                return jsonify({
                    "error": "Use a PNG, JPG or WebP reference image."
                }), 400

            reference_image = base64.b64encode(
                image_file.read()
            ).decode("ascii")

        generated = generate_parser(
            response_data=response_data,
            site_type=category,
            required_fields=fields,
            reference_image=reference_image,
            image_mime_type=image_mime_type,
        )

        parser_code = clean_generated_code(
            generated if isinstance(generated, str)
            else generated.get("parser_code", "")
        )

        if not parser_code:
            return jsonify({
                "error": "The AI did not return parser code."
            }), 502

        try:
            extracted_data = execute_generated_parser(
                parser_code, response_data
            )
            execution_error = None
        except Exception as exc:
            extracted_data = {}
            execution_error = str(exc)

        if isinstance(extracted_data, list):
            record_count = len(extracted_data)
        elif extracted_data:
            record_count = 1
        else:
            record_count = 0

        return jsonify({
            "success": True,
            "parser_code": parser_code,
            "python_code": parser_code,
            "extracted_data": extracted_data,
            "json_output": extracted_data,
            "record_count": record_count,
            "execution_error": execution_error,
            "request_info": request_info,
        })

    except requests.RequestException as exc:
        app.logger.exception("cURL request failed")
        return jsonify({
            "error": f"Failed to fetch the cURL URL: {exc}"
        }), 502

    except json.JSONDecodeError as exc:
        return jsonify({
            "error": f"Invalid JSON in request: {exc}"
        }), 400

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except Exception as exc:
        app.logger.exception("Parser generation failed")
        return jsonify({
            "error": f"Parser generation failed: {exc}"
        }), 500


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({
        "error": "Request is too large. Maximum size is 6 MB."
    }), 413


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False,
    )