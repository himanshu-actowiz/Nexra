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
    // ==========================================
    // SAVE AND RESTORE WORKSPACE STATE
    // ==========================================

    const WORKSPACE_STORAGE_KEY = "nexraWorkspaceState";
    const IMAGE_STORAGE_KEY = "nexraReferenceImages";

    function saveWorkspaceState() {
        try {
            const modes = {};

            for (const mode of ["curl", "response"]) {
                const state = modeState[mode];

                modes[mode] = {
                    input: state.input || "",
                    category: state.category || "Ecommerce",
                    additionalPrompt: state.additionalPrompt || "",
                    responseType: state.responseType || "json",
                    selectedFields: [...state.selectedFields],
                    customFields: [...state.customFields],
                    results: state.results || null
                };
            }

            sessionStorage.setItem(
                WORKSPACE_STORAGE_KEY,
                JSON.stringify({
                    currentMode,
                    customFieldInput: customFieldInput?.value || "",
                    modes
                })
            );
        } catch (error) {
            console.warn("Could not save workspace state:", error);
        }
    }

    function restoreWorkspaceState() {
        try {
            const saved = sessionStorage.getItem(WORKSPACE_STORAGE_KEY);

            if (!saved) return;

            const parsed = JSON.parse(saved);

            if (parsed.currentMode === "curl" ||
                parsed.currentMode === "response") {
                currentMode = parsed.currentMode;
            }

            for (const mode of ["curl", "response"]) {
                const savedMode = parsed.modes?.[mode];

                if (!savedMode) continue;

                modeState[mode].input = savedMode.input || "";
                modeState[mode].category = savedMode.category || "Ecommerce";
                modeState[mode].additionalPrompt =
                    savedMode.additionalPrompt || "";

                modeState[mode].responseType =
                    savedMode.responseType === "html" ? "html" : "json";

                modeState[mode].selectedFields = new Set(
                    Array.isArray(savedMode.selectedFields)
                        ? savedMode.selectedFields
                        : []
                );

                modeState[mode].customFields =
                    Array.isArray(savedMode.customFields)
                        ? savedMode.customFields
                        : [];

                modeState[mode].results = savedMode.results || null;
            }

            if (customFieldInput &&
                typeof parsed.customFieldInput === "string") {
                customFieldInput.value = parsed.customFieldInput;
            }
        } catch (error) {
            console.warn("Could not restore workspace state:", error);
        }
    }

    // Clear workspace data on page refresh.
    const navigationEntry = performance.getEntriesByType("navigation")[0];

    if (navigationEntry?.type === "reload") {
        sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
        sessionStorage.removeItem(IMAGE_STORAGE_KEY);
    }

    restoreWorkspaceState();

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
                saveWorkspaceState();
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
            saveWorkspaceState();
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
            saveWorkspaceState();
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
        saveWorkspaceState();

        showToast(`Custom field "${field}" added.`);
    }

    $("#add-field")?.addEventListener("click", addCustomField);

    if (customFieldInput) {
        customFieldInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                addCustomField();
                saveWorkspaceState();
            }
        });

        customFieldInput.addEventListener("input", () => {
            saveWorkspaceState();
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
            if (currentMode === "curl") {
                requestInput.placeholder =
                    "Paste your complete cURL command here...";
            } else if (isHtml) {
                requestInput.placeholder =
                    '<div class="product">\n  <h2>Example Product</h2>\n</div>';
            } else {
                requestInput.placeholder =
                    '{\n  "products": [\n    { "name": "Example Product", "price": 29.99 }\n  ]\n}';
            }
        }

        updateCharacterCount();
    }

    if (responseType) {
        responseType.addEventListener("change", () => {
            getCurrentState().responseType = responseType.value;
            updateResponseType();
            saveWorkspaceState();
        });
    }

    if (requestInput) {
        requestInput.addEventListener("input", () => {
            getCurrentState().input = requestInput.value;
            updateCharacterCount();
            saveWorkspaceState();
        });
    }

    if (additionalPromptInput) {
        additionalPromptInput.addEventListener("input", () => {
            getCurrentState().additionalPrompt =
                additionalPromptInput.value;
            saveWorkspaceState();
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
            syncCurrentModeFromUI();

            getCurrentState().images = selectedImages.slice();

            saveWorkspaceState();
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

        // Hide old output before starting a new request
        const resultsSection = $("#results-section");
        const codeOutput = $("#code-output");
        const jsonOutput = $("#json-output");
        const jsonStatus = $("#json-status");

        function hideResults() {
            if (resultsSection) {
                resultsSection.hidden = true;
                resultsSection.style.display = "none";
            }

            // Hide each output panel as well
            [codeOutput, jsonOutput].forEach((element) => {
                const panel = element?.closest(".panel");

                if (panel) {
                    panel.hidden = true;
                    panel.style.display = "none";
                }

                if (element) {
                    element.textContent = "";
                }
            });

            if (jsonStatus) {
                jsonStatus.textContent = "";
            }
        }

        function showResults() {
            if (resultsSection) {
                resultsSection.hidden = false;
                resultsSection.style.display = "";
            }

            [codeOutput, jsonOutput].forEach((element) => {
                const panel = element?.closest(".panel");

                if (panel) {
                    panel.hidden = false;
                    panel.style.display = "";
                }
            });
        }

        function handleError(message) {
            hideResults();
            state.results = null;
            saveWorkspaceState();
            showToast(message, "error");
        }

        if (!input) {
            handleError("Please enter input first.");
            requestInput?.focus();
            return;
        }

        if (selectedFields.length === 0) {
            handleError("Please select at least one field.");
            return;
        }

        const formData = new FormData();

        formData.append("input", input);
        formData.append("mode", currentMode);
        formData.append("category", categorySelect?.value || "Ecommerce");
        formData.append("required_fields", JSON.stringify(selectedFields));
        formData.append("custom_fields", JSON.stringify(state.customFields));
        formData.append("response_type", responseType?.value || "json");
        formData.append("prompt", additionalPromptInput?.value.trim() || "");

        selectedImages.forEach((item, index) => {
            formData.append(
                index === 0 ? "reference_image" : "reference_images",
                item.file
            );
        });

        const originalButtonText = generateButton?.innerHTML;

        try {
            hideResults();

            if (generateButton) {
                generateButton.disabled = true;
                generateButton.textContent = "Generating...";
            }

            const response = await fetch("/api/generate", {
                method: "POST",
                body: formData
            });

            const responseText = await response.text();

            let result;

            try {
                result = JSON.parse(responseText);
            } catch {
                if (responseText.trim().startsWith("<")) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(responseText, "text/html");

                    const title = doc.querySelector("title")?.textContent?.trim();
                    const bodyText = doc.body?.innerText?.trim();

                    const errorMessage =
                        doc.querySelector("pre")?.innerText?.trim() ||
                        doc.querySelector(".error")?.textContent?.trim() ||
                        bodyText ||
                        title ||
                        `HTTP ${response.status}: Server error`;

                    throw new Error(
                        errorMessage.slice(0, 1000)
                    );
                }

                throw new Error(
                    `Invalid server response (HTTP ${response.status}). The server did not return valid JSON.`
                );
            }

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

            const orderedData = Array.isArray(data)
                ? data.map((item) => orderObjectKeys(item, selectedFields))
                : data && typeof data === "object"
                    ? orderObjectKeys(data, selectedFields)
                    : data;

            const jsonText = typeof orderedData === "string"
                ? orderedData
                : JSON.stringify(orderedData, null, 4);

            const recordCount = Array.isArray(data) ? data.length : 0;
            const status = `${recordCount} record(s) extracted`;

            if (codeOutput) codeOutput.textContent = code;
            if (jsonOutput) jsonOutput.textContent = jsonText;
            if (jsonStatus) jsonStatus.textContent = status;

            state.results = {
                code,
                json: jsonText,
                status
            };

            saveWorkspaceState();
            showResults();

            showToast("Parser generated successfully.");

        } catch (error) {
            console.error("Parser generation failed:", error);

            handleError(
                error.message || "Something went wrong. Please try again."
            );

        } finally {
            if (generateButton) {
                generateButton.disabled = false;

                if (originalButtonText) {
                    generateButton.innerHTML = originalButtonText;
                }
            }
        }
    }

    function orderObjectKeys(obj, fields) {
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
            return obj;
        }

        const ordered = {};

        // Add selected fields first, in their selected order
        fields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(obj, field)) {
                ordered[field] = obj[field];
            }
        });

        // Keep remaining fields after selected fields
        Object.keys(obj).forEach((key) => {
            if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
                ordered[key] = obj[key];
            }
        });

        return ordered;
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