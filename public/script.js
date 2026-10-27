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
    const referenceImageInput =
        $("#reference-image") || $("#reference-image-input");
    const imageList = $("#image-list");
    const addImageButton = $("#add-image-btn");
    const generateButton = $("#generate-btn");
    const toast = $("#toast");

    let currentMode = "curl";
    let toastTimer;
    let imageCounter = 0;

    // ==========================================
    // INDEPENDENT STATE FOR EACH MODE
    // ==========================================

    const modeState = {
        curl: {
            selectedFields: new Set(),
            customFields: [],
            input: "",
            category: categorySelect?.value || "Ecommerce",
            additionalPrompt: "",
            responseType: responseType?.value || "json",
            images: [],
            results: null
        },

        response: {
            selectedFields: new Set(),
            customFields: [],
            input: "",
            category: categorySelect?.value || "Ecommerce",
            additionalPrompt: "",
            responseType: responseType?.value || "json",
            images: [],
            results: null
        }
    };

    let selectedImages = [];

    function getCurrentState() {
        return modeState[currentMode];
    }

    function syncCurrentModeFromUI() {
        const state = getCurrentState();

        state.input = requestInput?.value || "";
        state.category = categorySelect?.value || "Ecommerce";
        state.additionalPrompt = additionalPromptInput?.value || "";
        state.responseType = responseType?.value || "json";
        state.images = selectedImages.slice();

        saveCurrentFieldSelections();
    }

    function restoreCurrentModeToUI() {
        const state = getCurrentState();

        if (requestInput) {
            requestInput.value = state.input || "";
        }

        if (categorySelect) {
            categorySelect.value = state.category || "Ecommerce";
        }

        if (additionalPromptInput) {
            additionalPromptInput.value = state.additionalPrompt || "";
        }

        if (responseType) {
            responseType.value = state.responseType || "json";
        }

        selectedImages = state.images.slice();

        renderFields();
        renderImages();
        updateCharacterCount();
        updateModeUI();
        updateResponseType();
        restoreModeResults(state);
    }

    function restoreModeResults(state) {
        const resultsSection = $("#results-section");
        const codeOutput = $("#code-output");
        const jsonOutput = $("#json-output");
        const jsonStatus = $("#json-status");

        if (!state.results) {
            if (resultsSection) resultsSection.hidden = true;
            if (codeOutput) codeOutput.textContent = "";
            if (jsonOutput) jsonOutput.textContent = "";
            if (jsonStatus) jsonStatus.textContent = "";
            return;
        }

        if (codeOutput) {
            codeOutput.textContent = state.results.code || "";
        }

        if (jsonOutput) {
            jsonOutput.textContent = state.results.json || "";
        }

        if (jsonStatus) {
            jsonStatus.textContent = state.results.status || "";
        }

        if (resultsSection) {
            resultsSection.hidden = false;
        }
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

        getCurrentState().selectedFields = new Set(
            Array.from(
                fieldsContainer.querySelectorAll(
                    'input[type="checkbox"]:checked'
                )
            ).map((checkbox) => checkbox.value)
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

        standardFields.forEach((field) => createField(field));

        state.customFields.forEach((field) => {
            createField(field, true);
        });

        updateSelectAllState();
    }

    // ==========================================
    // SELECT ALL
    // ==========================================

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", () => {
            const state = getCurrentState();

            const checkboxes = [
                ...fieldsContainer.querySelectorAll('input[type="checkbox"]')
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
            getCurrentState().category = categorySelect.value;

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

        state.customFields.push(field);
        state.selectedFields.add(field);

        customFieldInput.value = "";

        renderFields();

        showToast(`Custom field "${field}" added.`);
    }

    $("#add-field")?.addEventListener("click", addCustomField);

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
            const nextMode = normalizeMode(button.dataset.mode);

            if (nextMode === currentMode) return;

            // Save all form data for the current mode.
            syncCurrentModeFromUI();

            // Switch to the other mode.
            currentMode = nextMode;

            // Restore only the new mode's form data.
            restoreCurrentModeToUI();

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
        responseType.addEventListener("change", () => {
            getCurrentState().responseType = responseType.value;
            updateResponseType();
        });
    }

    if (requestInput) {
        requestInput.addEventListener("input", () => {
            getCurrentState().input = requestInput.value;
            updateCharacterCount();
        });
    }

    if (additionalPromptInput) {
        additionalPromptInput.addEventListener("input", () => {
            getCurrentState().additionalPrompt =
                additionalPromptInput.value;
        });
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

    // ==========================================
    // CLEAR INPUT
    // ==========================================

    $("#clear-input")?.addEventListener("click", () => {
        if (requestInput) {
            requestInput.value = "";
        }

        getCurrentState().input = "";

        updateCharacterCount();
        requestInput?.focus();

        showToast("Input cleared.");
    });

    // ==========================================
    // REFERENCE IMAGES
    // ==========================================

    const showImagesButton = $("#show-images-btn");;
    const imageCountElement = $("#image-count");

    const IMAGE_STORAGE_KEY = "nexraReferenceImages";
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
    const ALLOWED_IMAGE_TYPES = [
        "image/png",
        "image/jpeg",
        "image/webp"
    ];

    function formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);

            reader.onerror = () => {
                reject(reader.error || new Error("Could not read image."));
            };

            reader.readAsDataURL(file);
        });
    }

    function getStoredImages() {
        try {
            const stored = sessionStorage.getItem(IMAGE_STORAGE_KEY);
            const parsed = stored ? JSON.parse(stored) : [];

            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error("Unable to read saved reference images:", error);
            return [];
        }
    }

    function saveImagesToStorage() {
        // Gallery storage is separate from the two modes' image state.
        // This stores the currently visible mode's images.
        const storedImages = selectedImages
            .filter((item) => item.dataUrl)
            .map((item) => ({
                id: item.id,
                name: item.file.name,
                size: item.file.size,
                type: item.file.type,
                lastModified: item.file.lastModified,
                dataUrl: item.dataUrl
            }));

        try {
            sessionStorage.setItem(
                IMAGE_STORAGE_KEY,
                JSON.stringify(storedImages)
            );
        } catch (error) {
            console.error("Unable to save reference images:", error);

            showToast(
                "Could not save images in this browser session. Try fewer or smaller images.",
                "error"
            );
        }

        if (imageCountElement) {
            imageCountElement.textContent =
                `${selectedImages.length} image${selectedImages.length === 1 ? "" : "s"}`;
        }
    }

    function renderImages() {
        if (!imageList) {
            if (imageCountElement) {
                imageCountElement.textContent =
                    `${selectedImages.length} image${selectedImages.length === 1 ? "" : "s"}`;
            }
            return;
        }

        imageList.replaceChildren();

        selectedImages.forEach((item) => {
            const card = document.createElement("div");
            card.className = "image-card";

            const img = document.createElement("img");
            img.src = item.previewUrl || item.dataUrl;
            img.alt = item.file.name;
            img.loading = "lazy";

            const filename = document.createElement("span");
            filename.className = "image-card-name";
            filename.textContent = item.file.name;
            filename.title = item.file.name;

            const size = document.createElement("span");
            size.className = "image-card-size";
            size.textContent = formatFileSize(item.file.size);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "remove-selected-image";
            remove.textContent = "Remove";
            remove.setAttribute(
                "aria-label",
                `Remove ${item.file.name}`
            );

            remove.addEventListener("click", () => {
                if (item.previewUrl) {
                    URL.revokeObjectURL(item.previewUrl);
                }

                selectedImages = selectedImages.filter(
                    (image) => image.id !== item.id
                );

                getCurrentState().images = selectedImages.slice();

                saveImagesToStorage();
                renderImages();

                showToast("Reference image removed.");
            });

            card.append(img, filename, size, remove);
            imageList.appendChild(card);
        });

        if (imageCountElement) {
            imageCountElement.textContent =
                `${selectedImages.length} image${selectedImages.length === 1 ? "" : "s"}`;
        }
    }

    if (addImageButton && referenceImageInput) {
        addImageButton.addEventListener("click", () => {
            referenceImageInput.click();
        });
    }

    if (showImagesButton) {
        showImagesButton.addEventListener("click", () => {
            getCurrentState().images = selectedImages.slice();
            saveImagesToStorage();

            window.location.href = "/images";
        });
    }

    if (referenceImageInput) {
        referenceImageInput.addEventListener("change", async () => {
            const files = Array.from(referenceImageInput.files || []);
            let added = 0;

            for (const file of files) {
                if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
                    showToast(
                        `${file.name}: PNG, JPG or WebP only.`,
                        "error"
                    );
                    continue;
                }

                if (file.size > MAX_IMAGE_SIZE) {
                    showToast(
                        `${file.name}: maximum image size is 5 MB.`,
                        "error"
                    );
                    continue;
                }

                const duplicate = selectedImages.some((image) =>
                    image.file.name === file.name &&
                    image.file.size === file.size &&
                    image.file.lastModified === file.lastModified
                );

                if (duplicate) continue;

                try {
                    const dataUrl = await readFileAsDataURL(file);

                    selectedImages.push({
                        id: ++imageCounter,
                        file,
                        dataUrl,
                        previewUrl: URL.createObjectURL(file)
                    });

                    added++;
                } catch (error) {
                    console.error(
                        "Could not load image:",
                        file.name,
                        error
                    );

                    showToast(`Could not load ${file.name}.`, "error");
                }
            }

            referenceImageInput.value = "";

            getCurrentState().images = selectedImages.slice();

            saveImagesToStorage();
            renderImages();

            if (added > 0) {
                showToast(`${added} reference image(s) added.`);
            }
        });
    }

    async function restoreImagesFromStorage() {
        const storedImages = getStoredImages();

        selectedImages = [];

        for (const item of storedImages) {
            if (!item.dataUrl || !item.name) continue;

            try {
                const response = await fetch(item.dataUrl);
                const blob = await response.blob();

                const file = new File([blob], item.name, {
                    type: item.type || blob.type || "image/jpeg",
                    lastModified: item.lastModified || Date.now()
                });

                selectedImages.push({
                    id: item.id ?? ++imageCounter,
                    file,
                    dataUrl: item.dataUrl,
                    previewUrl: URL.createObjectURL(file)
                });

                imageCounter = Math.max(
                    imageCounter,
                    Number(item.id) || 0
                );
            } catch (error) {
                console.error(
                    "Could not restore reference image:",
                    item.name,
                    error
                );
            }
        }

        renderImages();
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

            showToast(
                "Unable to copy. Check browser permissions.",
                "error"
            );
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
        syncCurrentModeFromUI();

        const state = getCurrentState();
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
        formData.append(
            "category",
            categorySelect?.value || "Ecommerce"
        );

        formData.append(
            "required_fields",
            JSON.stringify(selectedFields)
        );

        formData.append(
            "custom_fields",
            JSON.stringify(state.customFields)
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
                throw new Error(
                    "The backend returned no Python parser code."
                );
            }

            const jsonText = typeof data === "string"
                ? data
                : JSON.stringify(data, null, 2);

            const recordCount = Array.isArray(data) ? data.length : 0;
            const status = `${recordCount} record(s) extracted`;

            if ($("#code-output")) {
                $("#code-output").textContent = code;
            }

            if ($("#json-output")) {
                $("#json-output").textContent = jsonText;
            }

            if ($("#json-status")) {
                $("#json-status").textContent = status;
            }

            if ($("#results-section")) {
                $("#results-section").hidden = false;
            }

            // Save results only for the active mode.
            state.results = {
                code,
                json: jsonText,
                status
            };

            showToast("Parser generated successfully.");

        } catch (error) {
            console.error("Parser generation failed:", error);

            const message = error.message || "Unexpected error.";
            const errorCode = `# Parser generation failed\n# ${message}`;
            const errorJson = JSON.stringify(
                { error: message },
                null,
                2
            );

            if ($("#code-output")) {
                $("#code-output").textContent = errorCode;
            }

            if ($("#json-output")) {
                $("#json-output").textContent = errorJson;
            }

            if ($("#json-status")) {
                $("#json-status").textContent = "Generation failed";
            }

            if ($("#results-section")) {
                $("#results-section").hidden = false;
            }

            state.results = {
                code: errorCode,
                json: errorJson,
                status: "Generation failed"
            };

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

    restoreCurrentModeToUI();

    // Restore gallery images if available in this browser session.
    restoreImagesFromStorage().then(() => {
        // Keep restored images associated with the currently active mode.
        getCurrentState().images = selectedImages.slice();
    });

    console.log(
        "NEXRA initialized with independent CURL and Response mode states."
    );
});