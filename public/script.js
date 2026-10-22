document.addEventListener("DOMContentLoaded", () => {
    const $ = (selector) => document.querySelector(selector);

    // =========================================
    // DOM ELEMENTS
    // =========================================

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
    let toastTimer;
    let imageIdCounter = 0;
    let selectedImages = [];

    // =========================================
    // FIX: SEPARATE STATE FOR BOTH MODES
    // =========================================

    const modeState = {
        curl: {
            selectedFields: new Set(),
            customFields: []
        },
        response: {
            selectedFields: new Set(),
            customFields: []
        }
    };

    // Keep compatibility with the rest of this script.
    let customFields = modeState.curl.customFields;

    // =========================================
    // FIELD OPTIONS
    // =========================================

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

    // =========================================
    // TOAST MESSAGE
    // =========================================

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

    // =========================================
    // OUTPUT HELPERS
    // =========================================

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

    // =========================================
    // FIELD SELECTION HELPERS
    // =========================================

    function getCurrentModeState() {
        return modeState[currentMode];
    }

    function saveCurrentFieldSelections() {
        const state = getCurrentModeState();

        if (!fieldsContainer) return;

        state.selectedFields = new Set(
            [
                ...fieldsContainer.querySelectorAll(
                    'input[type="checkbox"]:checked'
                )
            ].map((checkbox) => checkbox.value)
        );
    }

    function getSelectedFields() {
        saveCurrentFieldSelections();

        return [...getCurrentModeState().selectedFields];
    }

    function updateSelectAllState() {
        if (!fieldsContainer || !selectAllCheckbox) return;

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

    // =========================================
    // RENDER FIELDS
    // Preserves selection for the active mode.
    // =========================================

    function renderFields() {
        if (!fieldsContainer) return;

        const state = getCurrentModeState();

        // Preserve current selections before rebuilding the DOM.
        saveCurrentFieldSelections();

        fieldsContainer.replaceChildren();

        const fields =
            FIELD_OPTIONS[categorySelect.value] || FIELD_OPTIONS.Other;

        function createFieldCheckbox(field, isCustom = false) {
            const label = document.createElement("label");

            label.className = isCustom
                ? "field-option custom-field"
                : "field-option";

            const checkbox = document.createElement("input");

            checkbox.type = "checkbox";
            checkbox.value = field;
            checkbox.name = "required_fields";

            // Restore the selection from THIS mode only.
            checkbox.checked = state.selectedFields.has(field);

            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    state.selectedFields.add(field);
                } else {
                    state.selectedFields.delete(field);

                    // Unchecking a custom field removes it
                    // from this mode only.
                    if (isCustom) {
                        state.customFields =
                            state.customFields.filter(
                                (item) => item !== field
                            );

                        customFields = state.customFields;

                        renderFields();
                        return;
                    }
                }

                updateSelectAllState();
            });

            const text = document.createElement("span");
            text.textContent = field;

            label.append(checkbox, text);
            fieldsContainer.append(label);
        }

        fields.forEach((field) => {
            createFieldCheckbox(field, false);
        });

        state.customFields.forEach((field) => {
            createFieldCheckbox(field, true);
        });

        customFields = state.customFields;

        updateSelectAllState();
    }

    if (categorySelect) {
        categorySelect.addEventListener("change", () => {
            // Only re-render fields for the current mode.
            renderFields();
        });
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", () => {
            const state = getCurrentModeState();

            fieldsContainer
                .querySelectorAll('input[type="checkbox"]')
                .forEach((checkbox) => {
                    checkbox.checked = selectAllCheckbox.checked;

                    if (checkbox.checked) {
                        state.selectedFields.add(checkbox.value);
                    } else {
                        state.selectedFields.delete(checkbox.value);
                    }
                });

            updateSelectAllState();
        });
    }

    // =========================================
    // CUSTOM FIELDS
    // =========================================

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

        const state = getCurrentModeState();

        const standardFields =
            FIELD_OPTIONS[categorySelect.value] || FIELD_OPTIONS.Other;

        if (
            standardFields.includes(field) ||
            state.customFields.includes(field)
        ) {
            showToast("This field already exists.", "error");
            return;
        }

        // Add only to the active mode.
        state.customFields.push(field);

        // Newly added custom field is selected by default.
        state.selectedFields.add(field);

        customFields = state.customFields;
        customFieldInput.value = "";

        renderFields();

        showToast(`Custom field "${field}" added.`);
    }

    const addFieldButton = $("#add-field");

    if (addFieldButton) {
        addFieldButton.addEventListener("click", addCustomField);
    }

    if (customFieldInput) {
        customFieldInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                addCustomField();
            }
        });
    }

    // =========================================
    // MODE SETTINGS
    // =========================================

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

    // =========================================
    // CHARACTER COUNT
    // =========================================

    function updateCharacterCount() {
        if (!requestInput) return;

        setOutputText(
            "#char-count",
            `${requestInput.value.length.toLocaleString()} characters`
        );
    }

    // =========================================
    // JSON / HTML INPUT
    // =========================================

    function updateResponseInput() {
        if (!responseType || !requestInput) return;

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

    // =========================================
    // MULTIPLE REFERENCE IMAGES
    // =========================================

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

                if (alreadyAdded) return;

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

    // =========================================
    // SIDEBAR MODE SWITCHING
    // =========================================

    document
        .querySelectorAll(".nav-item[data-mode]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                // Save checkbox state of the mode being left.
                saveCurrentFieldSelections();

                currentMode = button.dataset.mode;

                // Switch custom fields to the new mode.
                customFields = modeState[currentMode].customFields;

                // Clear mode-specific input content.
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

                setOutputText("#breadcrumb-title", modeSettings.title);
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

                // Render only this mode's fields and restore its selections.
                renderFields();

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

    if (requestInput) {
        requestInput.addEventListener(
            "input",
            updateCharacterCount
        );
    }

    // =========================================
    // CLEAR INPUT
    // =========================================

    const clearInputButton = $("#clear-input");

    if (clearInputButton) {
        clearInputButton.addEventListener("click", () => {
            requestInput.value = "";

            updateCharacterCount();
            requestInput.focus();

            showToast("Input cleared.");
        });
    }

    // =========================================
    // COPY / DOWNLOAD
    // =========================================

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

    const copyCodeButton = $("#copy-code");
    const copyJsonButton = $("#copy-json");
    const downloadCodeButton = $("#download-code");
    const downloadJsonButton = $("#download-json");

    if (copyCodeButton) {
        copyCodeButton.addEventListener("click", () => {
            copyText(
                $("#code-output").innerText,
                "Python code"
            );
        });
    }

    if (copyJsonButton) {
        copyJsonButton.addEventListener("click", () => {
            copyText(
                $("#json-output").innerText,
                "JSON"
            );
        });
    }

    if (downloadCodeButton) {
        downloadCodeButton.addEventListener("click", () => {
            downloadText(
                $("#code-output").innerText,
                "nexra_parser.py",
                "text/x-python;charset=utf-8"
            );
        });
    }

    if (downloadJsonButton) {
        downloadJsonButton.addEventListener("click", () => {
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
    }

    // =========================================
    // GENERATE PARSER
    // =========================================

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

        // Additional Prompt.
        formData.append(
            "prompt",
            additionalPromptInput
                ? additionalPromptInput.value.trim()
                : ""
        );

        // Only the active mode's custom fields are sent.
        formData.append(
            "custom_fields",
            JSON.stringify(modeState[currentMode].customFields)
        );

        // Send the first image under the existing backend field name.
        // Send remaining images under "reference_images".
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

    const generateButton = $("#generate-btn");

    if (generateButton) {
        generateButton.addEventListener(
            "click",
            generateParser
        );
    }

    // =========================================
    // INITIALIZE
    // =========================================

    const resultsSection = $("#results-section");

    if (resultsSection) {
        resultsSection.hidden = true;
    }

    renderFields();
    updateCharacterCount();
    renderImageList();

    console.log("NEXRA frontend initialized.");
});