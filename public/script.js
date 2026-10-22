document.addEventListener("DOMContentLoaded", () => {
    const $ = (selector) => document.querySelector(selector);

    // ---------- DOM ELEMENTS ----------

    const requestInput = $("#request-input");
    const categorySelect = $("#category");
    const fieldsContainer = $("#fields-container");
    const selectAllCheckbox = $("#select-all");
    const customFieldInput = $("#custom-field");
    const referenceImageInput = $("#reference-image");
    const imageList = $("#image-list");
    const addImageButton = $("#add-image-btn");
    const additionalPromptInput = $("#parser-prompt");
    const toast = $("#toast");

    let currentMode = "curl";
    let customFields = [];
    let toastTimer;
    let imageIdCounter = 0;

    // Store all selected reference images.
    let selectedImages = [];

    // ---------- FIELD OPTIONS ----------

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

    // ---------- OUTPUT HELPERS ----------

    function setOutputText(selector, value) {
        const element = $(selector);

        if (element) {
            element.textContent = value ?? "";
        }
    }

    function renderExtractedOutput(data) {
        const output = $("#json-output");

        if (!output) return;

        if (data === undefined || data === null) {
            output.textContent = JSON.stringify([], null, 2);
            return;
        }

        if (typeof data === "string") {
            try {
                output.textContent = JSON.stringify(
                    JSON.parse(data),
                    null,
                    2
                );
            } catch {
                output.textContent = data;
            }

            return;
        }

        output.textContent = JSON.stringify(data, null, 2);
    }

    function setGenerating(isGenerating) {
        const button = $("#generate-btn");

        if (!button) return;

        if (isGenerating) {
            button.dataset.originalHtml = button.innerHTML;
            button.disabled = true;
            button.textContent = "Generating...";
        } else {
            button.disabled = false;

            if (button.dataset.originalHtml) {
                button.innerHTML = button.dataset.originalHtml;
                delete button.dataset.originalHtml;
            }
        }
    }

    // ---------- FIELD SELECTION ----------

    function getSelectedFields() {
        const selected = [
            ...fieldsContainer.querySelectorAll(
                'input[type="checkbox"]:checked'
            )
        ].map((checkbox) => checkbox.value);

        return [...new Set([...selected, ...customFields])];
    }

    function updateSelectAllState() {
        const boxes = [
            ...fieldsContainer.querySelectorAll(
                'input[type="checkbox"]'
            )
        ];

        const checkedCount = boxes.filter(
            (checkbox) => checkbox.checked
        ).length;

        selectAllCheckbox.checked =
            boxes.length > 0 && checkedCount === boxes.length;

        selectAllCheckbox.indeterminate =
            checkedCount > 0 && checkedCount < boxes.length;
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

                    renderFields();
                    return;
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
            .forEach((checkbox) => {
                checkbox.checked = selectAllCheckbox.checked;
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
        ].some((checkbox) => checkbox.value === field);

        if (exists || customFields.includes(field)) {
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
            inputTitle: "JSON Response",
            inputDescription: "Paste your JSON response below",
            hint: "Paste your response data to get started"
        }
    };

    const responseTypeRow = $("#response-type-row");
    const responseType = $("#response-type");

    // ---------- CHARACTER COUNT ----------

    function updateCharacterCount() {
        setOutputText(
            "#char-count",
            `${requestInput.value.length.toLocaleString()} characters`
        );
    }

    // ---------- JSON / HTML INPUT ----------

    function updateResponseInput() {
        const type = responseType.value;
        const isJson = type === "json";

        setOutputText(
            "#input-title",
            isJson ? "JSON Response" : "HTML Response"
        );

        setOutputText(
            "#input-description",
            isJson
                ? "Paste your JSON response below"
                : "Paste your HTML response below"
        );

        setOutputText(
            "#input-hint",
            isJson
                ? "Paste the JSON response you want to parse"
                : "Paste the HTML response you want to parse"
        );

        requestInput.placeholder = isJson
            ? '{\n  "products": [\n    { "name": "Example Product", "price": 29.99 }\n  ]\n}'
            : '<div class="product">\n  <h2>Example Product</h2>\n  <span class="price">29.99</span>\n</div>';

        updateCharacterCount();
    }

    // ---------- MULTIPLE REFERENCE IMAGES ----------

    function clearSelectedImages() {
        selectedImages.forEach((item) => {
            URL.revokeObjectURL(item.previewUrl);
        });

        selectedImages = [];

        if (imageList) {
            imageList.replaceChildren();
        }

        if (referenceImageInput) {
            referenceImageInput.value = "";
        }
    }

    function renderImageList() {
        if (!imageList) return;

        imageList.replaceChildren();

        selectedImages.forEach((item) => {
            const card = document.createElement("div");
            card.className = "image-card";

            const image = document.createElement("img");
            image.src = item.previewUrl;
            image.alt = item.file.name;

            const filename = document.createElement("span");
            filename.className = "image-card-name";
            filename.textContent = item.file.name;
            filename.title = item.file.name;

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "remove-selected-image";
            removeButton.textContent = "Remove";

            removeButton.addEventListener("click", () => {
                const removedImage = selectedImages.find(
                    (selected) => selected.id === item.id
                );

                if (removedImage) {
                    URL.revokeObjectURL(removedImage.previewUrl);
                }

                selectedImages = selectedImages.filter(
                    (selected) => selected.id !== item.id
                );

                renderImageList();

                showToast("Reference image removed.");
            });

            card.append(image, filename, removeButton);
            imageList.append(card);
        });
    }

    if (addImageButton && referenceImageInput) {
        addImageButton.addEventListener("click", () => {
            referenceImageInput.click();
        });
    }

    if (referenceImageInput) {
        referenceImageInput.addEventListener("change", () => {
            const files = Array.from(referenceImageInput.files || []);

            if (!files.length) return;

            let addedCount = 0;

            files.forEach((file) => {
                if (
                    ![
                        "image/png",
                        "image/jpeg",
                        "image/webp"
                    ].includes(file.type)
                ) {
                    showToast(
                        `${file.name}: unsupported image format.`,
                        "error"
                    );

                    return;
                }

                if (file.size > 5 * 1024 * 1024) {
                    showToast(
                        `${file.name}: maximum image size is 5 MB.`,
                        "error"
                    );

                    return;
                }

                const alreadyAdded = selectedImages.some(
                    (item) =>
                        item.file.name === file.name &&
                        item.file.size === file.size &&
                        item.file.lastModified === file.lastModified
                );

                if (alreadyAdded) {
                    return;
                }

                selectedImages.push({
                    id: ++imageIdCounter,
                    file,
                    previewUrl: URL.createObjectURL(file)
                });

                addedCount++;
            });

            // Allow selecting the same file again after removing it.
            referenceImageInput.value = "";

            renderImageList();

            if (addedCount > 0) {
                showToast(
                    `${addedCount} image(s) added successfully.`
                );
            }
        });
    }

    // ---------- SIDEBAR MODE SWITCHING ----------

    document
        .querySelectorAll(".nav-item[data-mode]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                currentMode = button.dataset.mode;

                requestInput.value = "";

                clearSelectedImages();

                if (additionalPromptInput) {
                    additionalPromptInput.value = "";
                }

                document
                    .querySelectorAll(".nav-item[data-mode]")
                    .forEach((item) => {
                        item.classList.toggle(
                            "active",
                            item === button
                        );
                    });

                const modeSettings = settings[currentMode];

                setOutputText("#page-title", modeSettings.title);
                setOutputText(
                    "#page-description",
                    modeSettings.description
                );

                setOutputText(
                    "#heading-icon",
                    currentMode === "curl" ? ">_" : "{ }"
                );

                setOutputText(
                    "#input-symbol",
                    currentMode === "curl" ? ">_" : "{ }"
                );

                if (responseTypeRow) {
                    responseTypeRow.hidden =
                        currentMode !== "response";
                }

                if (currentMode === "curl") {
                    setOutputText(
                        "#input-title",
                        modeSettings.inputTitle
                    );

                    setOutputText(
                        "#input-description",
                        modeSettings.inputDescription
                    );

                    setOutputText(
                        "#input-hint",
                        modeSettings.hint
                    );

                    requestInput.placeholder =
                        modeSettings.placeholder;
                } else {
                    updateResponseInput();
                }

                updateCharacterCount();

                showToast(`${modeSettings.title} selected.`);
            });
        });

    if (responseType) {
        responseType.addEventListener(
            "change",
            updateResponseInput
        );
    }

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
                "Clipboard failed. Check browser permissions.",
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

    // ---------- GENERATE PARSER ----------

    async function generateParser() {
        const input = requestInput.value.trim();
        const selectedFields = getSelectedFields();

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
            responseType ? responseType.value : "json"
        );

        // Send Additional Prompt.
        formData.append(
            "prompt",
            additionalPromptInput
                ? additionalPromptInput.value.trim()
                : ""
        );

        // Send custom fields separately if the backend uses them.
        formData.append(
            "custom_fields",
            JSON.stringify(customFields)
        );

        // Send the first image under the existing backend field name.
        // Send additional images under "reference_images".
        selectedImages.forEach((item, index) => {
            if (index === 0) {
                formData.append(
                    "reference_image",
                    item.file
                );
            } else {
                formData.append(
                    "reference_images",
                    item.file
                );
            }
        });

        try {
            setGenerating(true);

            showToast("Generating parser. Please wait...");

            const response = await fetch("/api/generate", {
                method: "POST",
                body: formData
            });

            let result;

            try {
                result = await response.json();
            } catch {
                throw new Error(
                    `Server returned an unreadable response (HTTP ${response.status}).`
                );
            }

            if (!response.ok || result.success === false) {
                throw new Error(
                    result.error ||
                    result.message ||
                    `Request failed with HTTP ${response.status}.`
                );
            }

            const pythonCode =
                result.parser_code ??
                result.python_code ??
                result.generated_code ??
                result.code ??
                "";

            const extractedData =
                result.extracted_data ??
                result.json_output ??
                result.output_json ??
                result.parsed_data ??
                result.data ??
                [];

            if (
                typeof pythonCode !== "string" ||
                !pythonCode.trim()
            ) {
                console.error(
                    "Unexpected backend response:",
                    result
                );

                throw new Error(
                    "No parser code was returned by the backend."
                );
            }

            // Display generated code and extracted data.
            setOutputText("#code-output", pythonCode);
            renderExtractedOutput(extractedData);

            const requestInfo = result.request_info;

            const requestLabel = requestInfo
                ? ` · HTTP ${requestInfo.status_code}`
                : "";

            setOutputText(
                "#code-status",
                "Parser generated successfully" + requestLabel
            );

            if (result.execution_error) {
                setOutputText(
                    "#json-status",
                    "Parser generated, but execution failed"
                );

                showToast(
                    `Parser generated, but execution failed: ${result.execution_error}`,
                    "error"
                );
            } else {
                const count = Number.isFinite(result.record_count)
                    ? result.record_count
                    : Array.isArray(extractedData)
                        ? extractedData.length
                        : 0;

                setOutputText(
                    "#json-status",
                    `${count} record(s) extracted`
                );

                showToast("Parser generated successfully.");
            }

            const resultsSection = $("#results-section");

            if (resultsSection) {
                resultsSection.hidden = false;
            }

        } catch (error) {
            const message =
                error && error.message
                    ? error.message
                    : "Unexpected error while generating parser.";

            setOutputText(
                "#code-output",
                `# Parser generation failed\n# ${message}`
            );

            setOutputText(
                "#json-output",
                JSON.stringify({ error: message }, null, 2)
            );

            setOutputText(
                "#code-status",
                "Generation failed"
            );

            setOutputText(
                "#json-status",
                "No output available"
            );

            showToast(message, "error");

            console.error(
                "NEXRA parser generation error:",
                error
            );

        } finally {
            setGenerating(false);
        }
    }

    $("#generate-btn").addEventListener(
        "click",
        generateParser
    );

    // ---------- INITIALIZE ----------

    const resultsSection = $("#results-section");

    if (resultsSection) {
        resultsSection.hidden = true;
    }

    renderFields();
    updateCharacterCount();
    renderImageList();

    console.log("NEXRA frontend initialized.");
});