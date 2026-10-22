document.addEventListener("DOMContentLoaded", () => {
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];

    // ==========================================
    // DOM ELEMENTS
    // ==========================================

    const requestInput = $("#request-input");
    const categorySelect = $("#category");
    const fieldsContainer = $("#fields-container");
    const selectAllCheckbox = $("#select-all");
    const customFieldInput = $("#custom-field");
    const additionalPromptInput = $("#parser-prompt");
    const responseType = $("#response-type");
    const referenceImageInput = $("#reference-image");
    const imageList = $("#image-list");
    const addImageButton = $("#add-image-btn");
    const generateButton = $("#generate-btn");
    const toast = $("#toast");

    let currentMode = "curl";
    let customFields = [];
    let selectedImages = [];
    let imageCounter = 0;
    let toastTimer;

    // ==========================================
    // INDEPENDENT STATE FOR EACH MODE
    // ==========================================

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

    function getMode() {
        return modeState[currentMode] ? currentMode : "curl";
    }

    function getCurrentState() {
        return modeState[getMode()];
    }

    function syncCustomFields() {
        customFields = getCurrentState().customFields;
    }

    // ==========================================
    // FIELD OPTIONS
    // ==========================================

    const FIELD_OPTIONS = {
        Ecommerce: [
            "product_name",
            "product_id",
            "sku",
            "brand",
            "category",
            "description",
            "price",
            "original_price",
            "sale_price",
            "currency",
            "availability",
            "image_url",
            "product_url",
            "rating",
            "review_count"
        ],
        Airline: [
            "airline",
            "flight_number",
            "operating_carrier",
            "departure_airport",
            "arrival_airport",
            "departure_time",
            "arrival_time",
            "travel_date",
            "cabin",
            "booking_class",
            "fare_basis_code",
            "base_fare",
            "taxes",
            "gross_fare",
            "currency",
            "availability"
        ],
        Hotel: [
            "hotel_name",
            "hotel_id",
            "address",
            "city",
            "country",
            "latitude",
            "longitude",
            "room_type",
            "price",
            "currency",
            "rating",
            "amenities",
            "image_url",
            "hotel_url"
        ],
        Restaurant: [
            "restaurant_name",
            "restaurant_id",
            "address",
            "phone",
            "item_id",
            "item_name",
            "category",
            "description",
            "item_price",
            "currency",
            "availability",
            "rating",
            "delivery_fee",
            "minimum_order"
        ],
        Grocery: [
            "product_name",
            "product_id",
            "brand",
            "category",
            "price",
            "original_price",
            "sale_price",
            "currency",
            "unit_price",
            "package_size",
            "measurement_unit",
            "availability",
            "sku",
            "upc",
            "image_url",
            "product_url"
        ],
        Bus: [
            "operator",
            "bus_number",
            "origin",
            "destination",
            "departure_time",
            "arrival_time",
            "travel_date",
            "bus_type",
            "price",
            "currency",
            "seat_availability"
        ],
        Train: [
            "train_name",
            "train_number",
            "origin",
            "destination",
            "departure_time",
            "arrival_time",
            "travel_date",
            "class",
            "price",
            "currency",
            "availability"
        ],
        Other: [
            "name",
            "id",
            "title",
            "description",
            "price",
            "currency",
            "status",
            "url"
        ]
    };

    // ==========================================
    // TOAST
    // ==========================================

    function showToast(message, type = "success") {
        if (!toast) {
            console.log(message);
            return;
        }

        toast.textContent = message;
        toast.classList.toggle("error", type === "error");
        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }

    // ==========================================
    // FIELD SELECTION STATE
    // ==========================================

    function saveCurrentFieldSelections() {
        if (!fieldsContainer) return;

        const state = getCurrentState();

        state.selectedFields = new Set(
            $$(`#fields-container input[type="checkbox"]:checked`)
                .map((checkbox) => checkbox.value)
        );
    }

    function updateSelectAllState() {
        if (!fieldsContainer || !selectAllCheckbox) return;

        const checkboxes = [
            ...fieldsContainer.querySelectorAll('input[type="checkbox"]')
        ];

        const checkedCount = checkboxes.filter(
            (checkbox) => checkbox.checked
        ).length;

        selectAllCheckbox.checked =
            checkboxes.length > 0 &&
            checkedCount === checkboxes.length;

        selectAllCheckbox.indeterminate =
            checkedCount > 0 &&
            checkedCount < checkboxes.length;
    }

    function getSelectedFields() {
        saveCurrentFieldSelections();

        return [...getCurrentState().selectedFields];
    }

    // ==========================================
    // RENDER FIELDS
    // ==========================================

    function renderFields() {
        if (!fieldsContainer) return;

        const state = getCurrentState();

        const category = categorySelect?.value || "Ecommerce";

        const standardFields =
            FIELD_OPTIONS[category] || FIELD_OPTIONS.Other;

        fieldsContainer.replaceChildren();

        function createField(field, isCustom = false) {
            const label = document.createElement("label");
            label.className = isCustom
                ? "field-option custom-field"
                : "field-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = field;
            checkbox.name = "required_fields";

            // IMPORTANT:
            // Restore only the current mode's selections.
            checkbox.checked = state.selectedFields.has(field);

            const span = document.createElement("span");
            span.textContent = field;

            if (isCustom) {
                span.style.color = "#d946ef";
            }

            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    state.selectedFields.add(field);
                } else {
                    state.selectedFields.delete(field);
                }

                updateSelectAllState();
            });

            label.append(checkbox, span);
            fieldsContainer.appendChild(label);
        }

        standardFields.forEach((field) => {
            createField(field, false);
        });

        // Only render custom fields belonging to this mode.
        state.customFields.forEach((field) => {
            createField(field, true);
        });

        syncCustomFields();
        updateSelectAllState();
    }

    // ==========================================
    // SELECT ALL
    // ==========================================

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", () => {
            const state = getCurrentState();

            const checkboxes = [
                ...fieldsContainer.querySelectorAll(
                    'input[type="checkbox"]'
                )
            ];

            checkboxes.forEach((checkbox) => {
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

    // ==========================================
    // CATEGORY CHANGE
    // ==========================================

    if (categorySelect) {
        categorySelect.addEventListener("change", () => {
            // Save before re-rendering.
            saveCurrentFieldSelections();
            renderFields();
        });
    }

    // ==========================================
    // ADD CUSTOM FIELD
    // ==========================================

    function addCustomField() {
        const field = customFieldInput?.value.trim();

        if (!field) {
            showToast("Please enter a custom field name.", "error");
            customFieldInput?.focus();
            return;
        }

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
            showToast(
                "Use letters, numbers and underscores. Start with a letter or underscore.",
                "error"
            );
            return;
        }

        // Save the currently visible checkboxes before changing the DOM.
        saveCurrentFieldSelections();

        const state = getCurrentState();

        const category = categorySelect?.value || "Ecommerce";

        const standardFields =
            FIELD_OPTIONS[category] || FIELD_OPTIONS.Other;

        if (
            standardFields.includes(field) ||
            state.customFields.includes(field)
        ) {
            showToast("This field already exists.", "error");
            return;
        }

        // Add to current mode only.
        state.customFields.push(field);

        // Automatically select the newly added field.
        state.selectedFields.add(field);

        syncCustomFields();

        customFieldInput.value = "";

        // Re-render will restore the new field as checked.
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

    // ==========================================
    // MODE SWITCHING
    // ==========================================

    function normalizeMode(value) {
        const mode = String(value || "").toLowerCase();

        return mode.includes("response") ? "response" : "curl";
    }

    function updateModeUI() {
        const isCurl = currentMode === "curl";

        const title = isCurl
            ? "CURL to Parser"
            : "Response to Parser";

        const description = isCurl
            ? "Convert a cURL request into a reusable Python parser."
            : "Generate a Python parser directly from JSON or HTML input.";

        const inputTitle = $("#input-title");
        const inputDescription = $("#input-description");
        const inputHint = $("#input-hint");
        const breadcrumb = $("#breadcrumb-title");
        const pageTitle = $("#page-title");
        const pageDescription = $("#page-description");
        const responseTypeRow = $("#response-type-row");

        if (breadcrumb) breadcrumb.textContent = title;
        if (pageTitle) pageTitle.textContent = title;
        if (pageDescription) pageDescription.textContent = description;

        if (inputTitle) {
            inputTitle.textContent = isCurl
                ? "cURL Input"
                : responseType?.value === "html"
                    ? "HTML Response"
                    : "JSON Response";
        }

        if (inputDescription) {
            inputDescription.textContent = isCurl
                ? "Paste your cURL request below"
                : "Paste your JSON or HTML response below";
        }

        if (inputHint) {
            inputHint.textContent = isCurl
                ? "Paste your cURL command to get started"
                : "Paste the response data you want to parse";
        }

        if (responseTypeRow) {
            responseTypeRow.hidden = isCurl;
        }

        $$(".nav-item[data-mode]").forEach((button) => {
            button.classList.toggle(
                "active",
                normalizeMode(button.dataset.mode) === currentMode
            );
        });
    }

    $$(".nav-item[data-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            // Save old mode before changing modes.
            saveCurrentFieldSelections();

            currentMode = normalizeMode(button.dataset.mode);

            // Set the correct custom fields for the new mode.
            syncCustomFields();

            // Render the new mode's independent state.
            renderFields();
            updateModeUI();

            showToast(
                currentMode === "curl"
                    ? "CURL to Parser selected."
                    : "Response to Parser selected."
            );
        });
    });

    // ==========================================
    // RESPONSE INPUT TYPE
    // ==========================================

    function updateResponseType() {
        if (currentMode !== "response") return;

        const isHtml = responseType?.value === "html";

        const inputTitle = $("#input-title");
        const inputDescription = $("#input-description");
        const inputHint = $("#input-hint");

        if (inputTitle) {
            inputTitle.textContent = isHtml
                ? "HTML Response"
                : "JSON Response";
        }

        if (inputDescription) {
            inputDescription.textContent = isHtml
                ? "Paste your HTML response below"
                : "Paste your JSON response below";
        }

        if (inputHint) {
            inputHint.textContent = isHtml
                ? "Paste the HTML you want to parse"
                : "Paste the JSON you want to parse";
        }

        if (requestInput) {
            requestInput.placeholder = isHtml
                ? '<div class="product">\n  <h2>Example Product</h2>\n</div>'
                : '{\n  "products": [\n    { "name": "Example Product", "price": 29.99 }\n  ]\n}';
        }

        updateCharacterCount();
    }

    if (responseType) {
        responseType.addEventListener("change", updateResponseType);
    }

    // ==========================================
    // CHARACTER COUNT
    // ==========================================

    function updateCharacterCount() {
        if (!requestInput) return;

        const counter = $("#char-count");

        if (counter) {
            counter.textContent =
                `${requestInput.value.length.toLocaleString()} characters`;
        }
    }

    if (requestInput) {
        requestInput.addEventListener("input", updateCharacterCount);
    }

    // ==========================================
    // CLEAR INPUT
    // ==========================================

    const clearButton = $("#clear-input");

    if (clearButton) {
        clearButton.addEventListener("click", () => {
            if (requestInput) requestInput.value = "";

            updateCharacterCount();
            requestInput?.focus();

            showToast("Input cleared.");
        });
    }

    // ==========================================
    // REFERENCE IMAGES
    // ==========================================

    function renderImages() {
        if (!imageList) return;

        imageList.replaceChildren();

        selectedImages.forEach((item) => {
            const card = document.createElement("div");
            card.className = "image-card";

            const img = document.createElement("img");
            img.src = item.previewUrl;
            img.alt = item.file.name;

            const filename = document.createElement("span");
            filename.className = "image-card-name";
            filename.textContent = item.file.name;
            filename.title = item.file.name;

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "remove-selected-image";
            remove.textContent = "Remove";

            remove.addEventListener("click", () => {
                URL.revokeObjectURL(item.previewUrl);

                selectedImages = selectedImages.filter(
                    (image) => image.id !== item.id
                );

                renderImages();
                showToast("Reference image removed.");
            });

            card.append(img, filename, remove);
            imageList.appendChild(card);
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
            let added = 0;

            files.forEach((file) => {
                if (
                    !["image/png", "image/jpeg", "image/webp"]
                        .includes(file.type)
                ) {
                    showToast(
                        `${file.name}: PNG, JPG or WebP only.`,
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

                const duplicate = selectedImages.some(
                    (image) =>
                        image.file.name === file.name &&
                        image.file.size === file.size &&
                        image.file.lastModified === file.lastModified
                );

                if (duplicate) return;

                selectedImages.push({
                    id: ++imageCounter,
                    file,
                    previewUrl: URL.createObjectURL(file)
                });

                added++;
            });

            // Allow choosing the same file again later.
            referenceImageInput.value = "";

            renderImages();

            if (added > 0) {
                showToast(`${added} reference image(s) added.`);
            }
        });
    }

    // ==========================================
    // COPY / DOWNLOAD HELPERS
    // ==========================================

    async function copyText(text, label) {
        if (!text || !text.trim()) {
            showToast(`No ${label} available.`, "error");
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            showToast(`${label} copied.`);
        } catch (error) {
            console.error(error);
            showToast("Unable to copy. Check browser permissions.", "error");
        }
    }

    function downloadText(text, filename, mimeType) {
        if (!text || !text.trim()) {
            showToast("No content available to download.", "error");
            return;
        }

        const blob = new Blob([text], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");

        anchor.href = url;
        anchor.download = filename;

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast(`${filename} downloaded.`);
    }

    $("#copy-code")?.addEventListener("click", () => {
        copyText($("#code-output")?.innerText || "", "Python code");
    });

    $("#copy-json")?.addEventListener("click", () => {
        copyText($("#json-output")?.innerText || "", "JSON output");
    });

    $("#download-code")?.addEventListener("click", () => {
        downloadText(
            $("#code-output")?.innerText || "",
            "nexra_parser.py",
            "text/x-python;charset=utf-8"
        );
    });

    $("#download-json")?.addEventListener("click", () => {
        const raw = $("#json-output")?.innerText || "";

        try {
            downloadText(
                JSON.stringify(JSON.parse(raw), null, 2),
                "nexra_output.json",
                "application/json;charset=utf-8"
            );
        } catch {
            showToast("The output is not valid JSON.", "error");
        }
    });

    // ==========================================
    // GENERATE PARSER
    // ==========================================

    async function generateParser() {
        const input = requestInput?.value.trim() || "";
        const selectedFields = getSelectedFields();

        if (!input) {
            showToast("Please enter input first.", "error");
            requestInput?.focus();
            return;
        }

        if (selectedFields.length === 0) {
            showToast("Please select at least one field.", "error");
            return;
        }

        const formData = new FormData();

        formData.append("input", input);
        formData.append("mode", currentMode);
        formData.append("category", categorySelect?.value || "Ecommerce");

        formData.append(
            "required_fields",
            JSON.stringify(selectedFields)
        );

        formData.append(
            "custom_fields",
            JSON.stringify(getCurrentState().customFields)
        );

        formData.append(
            "response_type",
            responseType?.value || "json"
        );

        formData.append(
            "prompt",
            additionalPromptInput?.value.trim() || ""
        );

        selectedImages.forEach((item, index) => {
            formData.append(
                index === 0 ? "reference_image" : "reference_images",
                item.file
            );
        });

        const originalButtonText = generateButton?.innerHTML;

        try {
            if (generateButton) {
                generateButton.disabled = true;
                generateButton.textContent = "Generating...";
            }

            const response = await fetch("/api/generate", {
                method: "POST",
                body: formData
            });

            const result = await response.json();

            if (!response.ok || result.success === false) {
                throw new Error(
                    result.error ||
                    result.message ||
                    `HTTP error ${response.status}`
                );
            }

            const code =
                result.parser_code ||
                result.python_code ||
                result.generated_code ||
                result.code ||
                "";

            const data =
                result.extracted_data ??
                result.json_output ??
                result.output_json ??
                result.parsed_data ??
                result.data ??
                [];

            if (!code) {
                throw new Error("The backend returned no Python parser code.");
            }

            const codeOutput = $("#code-output");
            const jsonOutput = $("#json-output");

            if (codeOutput) codeOutput.textContent = code;

            if (jsonOutput) {
                jsonOutput.textContent =
                    typeof data === "string"
                        ? data
                        : JSON.stringify(data, null, 2);
            }

            const resultsSection = $("#results-section");

            if (resultsSection) {
                resultsSection.hidden = false;
            }

            const recordCount = Array.isArray(data) ? data.length : 0;

            const jsonStatus = $("#json-status");

            if (jsonStatus) {
                jsonStatus.textContent = `${recordCount} record(s) extracted`;
            }

            showToast("Parser generated successfully.");

        } catch (error) {
            console.error("Parser generation failed:", error);

            const message = error.message || "Unexpected error.";

            const codeOutput = $("#code-output");
            const jsonOutput = $("#json-output");

            if (codeOutput) {
                codeOutput.textContent =
                    `# Parser generation failed\n# ${message}`;
            }

            if (jsonOutput) {
                jsonOutput.textContent = JSON.stringify(
                    { error: message },
                    null,
                    2
                );
            }

            showToast(message, "error");

        } finally {
            if (generateButton) {
                generateButton.disabled = false;

                if (originalButtonText) {
                    generateButton.innerHTML = originalButtonText;
                }
            }
        }
    }

    if (generateButton) {
        generateButton.addEventListener("click", generateParser);
    }

    // ==========================================
    // INITIALIZE
    // ==========================================

    syncCustomFields();
    renderFields();
    updateModeUI();
    updateCharacterCount();
    renderImages();

    console.log("NEXRA initialized. Mode-specific fields enabled.");
}); 