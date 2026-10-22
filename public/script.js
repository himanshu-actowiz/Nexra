document.addEventListener("DOMContentLoaded", () => {
    const $ = (selector) => document.querySelector(selector);

    const requestInput = $("#request-input");
    const categorySelect = $("#category");
    const fieldsContainer = $("#fields-container");
    const selectAllCheckbox = $("#select-all");
    const customFieldInput = $("#custom-field");
    const referenceImageInput = $("#reference-image");
    const toast = $("#toast");

    let currentMode = "curl";
    let customFields = [];
    let toastTimer;
    let imagePreviewUrl = null;

    const FIELD_OPTIONS = {
        Ecommerce: [
            "product_name", "product_id", "sku", "brand", "category",
            "description", "price", "original_price", "sale_price",
            "currency", "availability", "image_url", "product_url",
            "rating", "review_count"
        ],
        Airline: [
            "airline", "flight_number", "operating_carrier",
            "departure_airport", "arrival_airport", "departure_time",
            "arrival_time", "travel_date", "cabin", "booking_class",
            "fare_basis_code", "base_fare", "taxes", "gross_fare",
            "currency", "availability"
        ],
        Hotel: [
            "hotel_name", "hotel_id", "address", "city", "country",
            "latitude", "longitude", "room_type", "price", "currency",
            "rating", "amenities", "image_url", "hotel_url"
        ],
        Restaurant: [
            "restaurant_name", "restaurant_id", "address", "phone",
            "item_id", "item_name", "category", "description",
            "item_price", "currency", "availability", "rating",
            "delivery_fee", "minimum_order"
        ],
        Grocery: [
            "product_name", "product_id", "brand", "category", "price",
            "original_price", "sale_price", "currency", "unit_price",
            "package_size", "measurement_unit", "availability", "sku",
            "upc", "image_url", "product_url"
        ],
        Bus: [
            "operator", "bus_number", "origin", "destination",
            "departure_time", "arrival_time", "travel_date", "bus_type",
            "price", "currency", "seat_availability"
        ],
        Train: [
            "train_name", "train_number", "origin", "destination",
            "departure_time", "arrival_time", "travel_date", "class",
            "price", "currency", "availability"
        ],
        Other: [
            "name", "id", "title", "description",
            "price", "currency", "status", "url"
        ]
    };

    // ---------- TOAST MESSAGE ----------

    function showToast(message, type = "success") {
        if (!toast) return;

        toast.textContent = message;
        toast.classList.toggle("error", type === "error");
        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3200);
    }

    // ---------- FIELD SELECTION ----------

    function getSelectedFields() {
        const selected = [
            ...fieldsContainer.querySelectorAll(
                'input[type="checkbox"]:checked'
            )
        ].map((box) => box.value);

        return [...new Set([...selected, ...customFields])];
    }

    function updateSelectAllState() {
        const boxes = [
            ...fieldsContainer.querySelectorAll(
                'input[type="checkbox"]'
            )
        ];

        const count = boxes.filter((box) => box.checked).length;

        selectAllCheckbox.checked =
            boxes.length > 0 && count === boxes.length;

        selectAllCheckbox.indeterminate =
            count > 0 && count < boxes.length;
    }

    function renderFields() {
        fieldsContainer.replaceChildren();

        const fields =
            FIELD_OPTIONS[categorySelect.value] || FIELD_OPTIONS.Other;

        fields.forEach((field) => {
            const label = document.createElement("label");
            label.className = "field-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = field;
            checkbox.name = "required_fields";
            checkbox.checked = false;

            checkbox.addEventListener(
                "change",
                updateSelectAllState
            );

            const text = document.createElement("span");
            text.textContent = field;

            label.append(checkbox, text);
            fieldsContainer.append(label);
        });

        customFields.forEach((field) => {
            const label = document.createElement("label");
            label.className = "field-option custom-field";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = field;
            checkbox.name = "required_fields";
            checkbox.checked = true;

            checkbox.addEventListener("change", () => {
                if (!checkbox.checked) {
                    customFields = customFields.filter(
                        (item) => item !== field
                    );

                    label.remove();
                }

                updateSelectAllState();
            });

            const text = document.createElement("span");
            text.textContent = field;

            label.append(checkbox, text);
            fieldsContainer.append(label);
        });

        updateSelectAllState();
    }

    categorySelect.addEventListener("change", renderFields);

    selectAllCheckbox.addEventListener("change", () => {
        fieldsContainer
            .querySelectorAll('input[type="checkbox"]')
            .forEach((box) => {
                box.checked = selectAllCheckbox.checked;
            });

        updateSelectAllState();
    });

    // ---------- CUSTOM FIELDS ----------

    function addCustomField() {
        const field = customFieldInput.value.trim();

        if (!field) {
            showToast(
                "Please enter a custom field name.",
                "error"
            );

            customFieldInput.focus();
            return;
        }

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
            showToast(
                "Use letters, numbers and underscores. Start with a letter or underscore.",
                "error"
            );

            return;
        }

        const exists = [
            ...fieldsContainer.querySelectorAll(
                'input[type="checkbox"]'
            )
        ].some((box) => box.value === field);

        if (exists) {
            showToast("This field already exists.", "error");
            return;
        }

        customFields.push(field);
        customFieldInput.value = "";

        renderFields();
        showToast(`Custom field "${field}" added.`);
    }

    $("#add-field").addEventListener("click", addCustomField);

    customFieldInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addCustomField();
        }
    });

    // ---------- MODE SETTINGS ----------

    const settings = {
        curl: {
            title: "CURL to Parser",
            description:
                "Convert a cURL request into a reusable Python parser.",
            inputTitle: "cURL Input",
            inputDescription: "Paste your cURL request below",
            hint: "Paste your cURL command to get started",
            placeholder:
                "curl 'https://example.com/api/products' -H 'accept: application/json'\n" +
                "-H 'user-agent: Mozilla/5.0'\n\n" +
                "Paste your complete cURL command here..."
        },

        response: {
            title: "Response to Parser",
            description:
                "Generate a Python parser directly from JSON or HTML input.",
            hint: "Paste your response data to get started"
        }
    };

    const responseTypeRow = $("#response-type-row");
    const responseType = $("#response-type");

    // ---------- CHARACTER COUNT ----------

    function updateCharacterCount() {
        $("#char-count").textContent =
            `${requestInput.value.length.toLocaleString()} characters`;
    }

    // ---------- JSON / HTML INPUT ----------

    function updateResponseInput() {
        const type = responseType.value;
        const isJson = type === "json";

        $("#input-title").textContent = isJson
            ? "JSON Response"
            : "HTML Response";

        $("#input-description").textContent = isJson
            ? "Paste your JSON response below"
            : "Paste your HTML response below";

        $("#input-hint").textContent = isJson
            ? "Paste the JSON response you want to parse"
            : "Paste the HTML response you want to parse";

        requestInput.placeholder = isJson
            ? '{\n  "products": [\n    { "name": "Example Product", "price": 29.99 }\n  ]\n}'
            : '<div class="product">\n  <h2>Example Product</h2>\n  <span class="price">29.99</span>\n</div>';

        updateCharacterCount();
    }

    // ---------- SIDEBAR MODE SWITCHING ----------

    document
        .querySelectorAll(".nav-item[data-mode]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                currentMode = button.dataset.mode;
                // Clear input when switching between modes
                requestInput.value = "";

                // Clear reference image when switching modes
                referenceImageInput.value = "";

                if (imagePreviewUrl) {
                    URL.revokeObjectURL(imagePreviewUrl);
                    imagePreviewUrl = null;
                }

                $("#preview-img").removeAttribute("src");
                $("#image-preview").hidden = true;
                $("#upload-area").hidden = false;
                $("#upload-title").textContent = "Upload a screenshot";

                // Reset character count
                updateCharacterCount();

                // Reset generated output
                $("#results-section").hidden = true;
                $("#code-output").textContent =
                    "# Your generated Python parser will appear here.\n\n" +
                    "def parse_data(data):\n" +
                    "    # Your extraction logic will be generated here.\n" +
                    "    results = []\n" +
                    "    return results";

                $("#json-output").textContent =
                    '[\n  {\n    "message": "Your extracted data will appear here"\n  }\n]';

                document
                    .querySelectorAll(".nav-item[data-mode]")
                    .forEach((item) => {
                        item.classList.toggle(
                            "active",
                            item === button
                        );
                    });

                const modeSettings = settings[currentMode];

                $("#page-title").textContent = modeSettings.title;
                $("#breadcrumb-title").textContent =
                    modeSettings.title;

                $("#page-description").textContent =
                    modeSettings.description;

                $("#heading-icon").textContent =
                    currentMode === "curl" ? ">_" : "{ }";

                $("#input-symbol").textContent =
                    currentMode === "curl" ? ">_" : "{ }";

                responseTypeRow.hidden =
                    currentMode !== "response";

                if (currentMode === "curl") {
                    $("#input-title").textContent =
                        modeSettings.inputTitle;

                    $("#input-description").textContent =
                        modeSettings.inputDescription;

                    $("#input-hint").textContent =
                        modeSettings.hint;

                    requestInput.placeholder =
                        modeSettings.placeholder;
                } else {
                    updateResponseInput();
                }

                updateCharacterCount();

                showToast(`${modeSettings.title} selected.`);
            });
        });

    responseType.addEventListener(
        "change",
        updateResponseInput
    );

    requestInput.addEventListener(
        "input",
        updateCharacterCount
    );

    // ---------- CLEAR INPUT ----------

    $("#clear-input").addEventListener("click", () => {
        requestInput.value = "";

        updateCharacterCount();
        requestInput.focus();

        showToast("Input cleared.");
    });

    // ---------- REFERENCE IMAGE ----------

    referenceImageInput.addEventListener("change", () => {
        const file = referenceImageInput.files[0];

        if (!file) return;

        if (
            !["image/png", "image/jpeg", "image/webp"].includes(
                file.type
            )
        ) {
            referenceImageInput.value = "";

            showToast(
                "Please select a PNG, JPG or WebP image.",
                "error"
            );

            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            referenceImageInput.value = "";

            showToast(
                "Image size must be 5 MB or less.",
                "error"
            );

            return;
        }

        if (imagePreviewUrl) {
            URL.revokeObjectURL(imagePreviewUrl);
        }

        imagePreviewUrl = URL.createObjectURL(file);

        $("#preview-img").src = imagePreviewUrl;
        $("#image-preview").hidden = false;
        $("#upload-area").hidden = true;
        $("#upload-title").textContent = file.name;

        showToast("Reference image selected.");
    });

    $("#remove-image").addEventListener("click", () => {
        referenceImageInput.value = "";

        if (imagePreviewUrl) {
            URL.revokeObjectURL(imagePreviewUrl);
        }

        imagePreviewUrl = null;

        $("#preview-img").removeAttribute("src");
        $("#image-preview").hidden = true;
        $("#upload-area").hidden = false;
        $("#upload-title").textContent = "Upload a screenshot";

        showToast("Reference image removed.");
    });

    // ---------- COPY / DOWNLOAD ----------

    async function copyText(text, label) {
        if (!text.trim()) {
            showToast(
                `No ${label} available to copy.`,
                "error"
            );

            return;
        }

        try {
            await navigator.clipboard.writeText(text);

            showToast(`${label} copied to clipboard.`);
        } catch (error) {
            console.error("Clipboard error:", error);

            showToast(
                "Clipboard failed. Check browser clipboard permissions.",
                "error"
            );
        }
    }

    function downloadText(text, filename, mime) {
        if (!text.trim()) {
            showToast(
                "There is no content to download.",
                "error"
            );

            return;
        }

        const url = URL.createObjectURL(
            new Blob([text], { type: mime })
        );

        const link = document.createElement("a");

        link.href = url;
        link.download = filename;

        document.body.append(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast(`${filename} downloaded.`);
    }

    $("#copy-code").addEventListener("click", () => {
        copyText(
            $("#code-output").innerText,
            "Python code"
        );
    });

    $("#copy-json").addEventListener("click", () => {
        copyText(
            $("#json-output").innerText,
            "JSON"
        );
    });

    $("#download-code").addEventListener("click", () => {
        downloadText(
            $("#code-output").innerText,
            "nexra_parser.py",
            "text/x-python;charset=utf-8"
        );
    });

    $("#download-json").addEventListener("click", () => {
        try {
            const json = JSON.stringify(
                JSON.parse($("#json-output").innerText),
                null,
                2
            );

            downloadText(
                json,
                "nexra_output.json",
                "application/json;charset=utf-8"
            );
        } catch (error) {
            showToast(
                "The displayed output is not valid JSON yet.",
                "error"
            );
        }
    });

    // ---------- GENERATE PARSER: BACKEND CONNECTION ----------

    $("#generate-btn").addEventListener("click", async () => {
        const input = requestInput.value.trim();
        const selectedFields = getSelectedFields();
        const generateButton = $("#generate-btn");

        if (!input) {
            showToast(
                currentMode === "curl"
                    ? "Please paste a cURL request first."
                    : "Please paste a response first.",
                "error"
            );

            requestInput.focus();
            return;
        }

        if (selectedFields.length === 0) {
            showToast(
                "Please select at least one field.",
                "error"
            );

            return;
        }

        const originalButtonHTML = generateButton.innerHTML;
        const formData = new FormData();

        formData.append("input", input);
        formData.append("mode", currentMode);
        formData.append("category", categorySelect.value);

        formData.append(
            "required_fields",
            JSON.stringify(selectedFields)
        );

        formData.append(
            "response_type",
            responseType.value
        );

        const imageFile = referenceImageInput.files[0];

        if (imageFile) {
            formData.append("reference_image", imageFile);
        }

        try {
            generateButton.disabled = true;
            generateButton.textContent = "Generating...";

            showToast("Generating parser. Please wait...");

            const response = await fetch("/api/generate", {
                method: "POST",
                body: formData
            });

            const contentType =
                response.headers.get("content-type") || "";

            let result;

            if (contentType.includes("application/json")) {
                result = await response.json();
            } else {
                const responseText = await response.text();

                throw new Error(
                    responseText ||
                    `Server returned HTTP ${response.status}`
                );
            }

            if (!response.ok || result.success === false) {
                throw new Error(
                    result.error ||
                    result.message ||
                    `Request failed with status ${response.status}`
                );
            }

            const pythonCode =
                result.python_code ??
                result.parser_code ??
                result.code ??
                result.generated_code ??
                "";

            const jsonOutput =
                result.json_output ??
                result.output_json ??
                result.extracted_data ??
                result.data ??
                result.parsed_data ??
                {};

            if (
                typeof pythonCode !== "string" ||
                !pythonCode.trim()
            ) {
                console.error(
                    "Unexpected backend response:",
                    result
                );

                throw new Error(
                    "Backend responded, but no Python code was returned. Check the /api/generate response format."
                );
            }

            $("#results-section").hidden = false;

            $("#code-output").textContent = pythonCode;

            $("#json-output").textContent =
                typeof jsonOutput === "string"
                    ? jsonOutput
                    : JSON.stringify(jsonOutput, null, 2);

            showToast("Parser generated successfully!");

        } catch (error) {
            console.error(
                "Parser generation error:",
                error
            );

            showToast(
                error.message ||
                "Unable to connect to the backend.",
                "error"
            );

        } finally {
            generateButton.disabled = false;
            generateButton.innerHTML = originalButtonHTML;
        }
    });

    // ---------- INITIALIZE ----------

    $("#results-section").hidden = true;
    renderFields();
    updateCharacterCount();

    console.log("Nexra frontend initialized.");
});