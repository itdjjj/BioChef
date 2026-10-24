
const DEFAULT_OPTIONS = {
  selector: "[data-calorie-selector]",
  optionSelector: "[data-calorie-option]",
  valueSelector: "[data-calorie-value]",
  outputSelector: "[data-calorie-output]",
  hiddenInputSelector: "[data-calorie-input]",
  storageKey: "biochef-calorie-selection",
  defaultValue: null
};

let currentConfig = { ...DEFAULT_OPTIONS };
let initialized = false;
let selectedValue = null;

function normalizeValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return String(Math.round(number));
}

function getOptionValue(option) {
  return normalizeValue(
    option.dataset.calorieValue ??
    option.value ??
    option.getAttribute("aria-valuenow")
  );
}

function getAvailableOptions(root) {
  return Array.from(root.querySelectorAll(currentConfig.optionSelector))
    .filter((option) => getOptionValue(option) !== null);
}

function getStoredValue() {
  if (!currentConfig.storageKey) {
    return null;
  }

  try {
    return normalizeValue(window.localStorage.getItem(currentConfig.storageKey));
  } catch (error) {
    console.warn("BioChef: calorie selection could not be read from storage.", error);
    return null;
  }
}

function saveValue(value) {
  if (!currentConfig.storageKey || value === null) {
    return;
  }

  try {
    window.localStorage.setItem(currentConfig.storageKey, value);
  } catch (error) {
    console.warn("BioChef: calorie selection could not be saved.", error);
  }
}

function findOptionByValue(root, value) {
  return getAvailableOptions(root).find(
    (option) => getOptionValue(option) === value
  ) ?? null;
}

function updateOutput(root, value) {
  const output = root.querySelector(currentConfig.outputSelector);

  if (output) {
    output.textContent = value
      ? `${new Intl.NumberFormat("pl-PL").format(Number(value))} kcal dziennie`
      : "Wybierz kaloryczność";
  }

  root.querySelectorAll(currentConfig.hiddenInputSelector).forEach((input) => {
    input.value = value ?? "";
  });

  root.querySelectorAll("[data-calorie-summary]").forEach((summary) => {
    summary.textContent = value
      ? `${new Intl.NumberFormat("pl-PL").format(Number(value))} kcal`
      : "Nie wybrano";
  });
}

function updateOptionStates(root, selectedOption) {
  const options = getAvailableOptions(root);

  options.forEach((option) => {
    const isSelected = option === selectedOption;

    if (option.matches('input[type="radio"]')) {
      option.checked = isSelected;
    } else {
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-pressed", String(isSelected));
      option.setAttribute("aria-checked", String(isSelected));
    }

    option.setAttribute("aria-current", isSelected ? "true" : "false");
  });

  if (selectedOption && !selectedOption.matches('input[type="radio"]')) {
    selectedOption.classList.add("is-selected");
  }
}

function emitChange(root, value, option, reason = "user") {
  const detail = {
    value: value ? Number(value) : null,
    label: option?.dataset.calorieLabel || option?.textContent?.trim() || "",
    reason
  };

  root.dispatchEvent(
    new CustomEvent("biochef:calorie-changed", {
      bubbles: true,
      detail
    })
  );

  document.dispatchEvent(
    new CustomEvent("biochef:calorie-changed", {
      detail
    })
  );
}

function selectValue(root, rawValue, options = {}) {
  const value = normalizeValue(rawValue);
  const option = value ? findOptionByValue(root, value) : null;

  if (!option) {
    return false;
  }

  const previousValue = selectedValue;
  selectedValue = value;

  updateOptionStates(root, option);
  updateOutput(root, value);
  saveValue(value);

  root.dataset.selectedCalorie = value;

  if (options.emit !== false && previousValue !== value) {
    emitChange(root, value, option, options.reason || "user");
  }

  return true;
}

function chooseInitialValue(root) {
  const options = getAvailableOptions(root);
  const validValues = new Set(options.map(getOptionValue));

  const markedOption = options.find((option) => {
    return (
      option.matches(":checked") ||
      option.getAttribute("aria-checked") === "true" ||
      option.getAttribute("aria-pressed") === "true" ||
      option.classList.contains("is-selected") ||
      option.dataset.selected === "true"
    );
  });

  const storedValue = getStoredValue();

  const candidates = [
    markedOption ? getOptionValue(markedOption) : null,
    root.dataset.defaultCalorie,
    currentConfig.defaultValue,
    storedValue
  ];

  for (const candidate of candidates) {
    const value = normalizeValue(candidate);

    if (value && validValues.has(value)) {
      return value;
    }
  }

  return null;
}

function handleOptionActivation(event) {
  const option = event.target.closest(currentConfig.optionSelector);

  if (!option) {
    return;
  }

  const root = option.closest(currentConfig.selector);

  if (!root || option.disabled || option.getAttribute("aria-disabled") === "true") {
    return;
  }

  const value = getOptionValue(option);

  if (!value) {
    return;
  }

  if (option.matches('input[type="radio"]')) {
    selectValue(root, value, { reason: "user" });
    return;
  }

  event.preventDefault();
  selectValue(root, value, { reason: "user" });
}

function handleKeyboardNavigation(event) {
  const option = event.target.closest(currentConfig.optionSelector);

  if (!option || option.matches('input[type="radio"]')) {
    return;
  }

  const root = option.closest(currentConfig.selector);

  if (!root) {
    return;
  }

  const options = getAvailableOptions(root).filter((item) => {
    return !item.disabled && item.getAttribute("aria-disabled") !== "true";
  });

  const currentIndex = options.indexOf(option);

  if (currentIndex < 0 || options.length === 0) {
    return;
  }

  let nextIndex = currentIndex;

  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = (currentIndex + 1) % options.length;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      nextIndex = (currentIndex - 1 + options.length) % options.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = options.length - 1;
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      selectValue(root, getOptionValue(option), { reason: "keyboard" });
      return;
    default:
      return;
  }

  event.preventDefault();
  options[nextIndex].focus();
  selectValue(root, getOptionValue(options[nextIndex]), { reason: "keyboard" });
}

function handleRadioChange(event) {
  const input = event.target;

  if (!input.matches(currentConfig.optionSelector) ||
      !input.matches('input[type="radio"]')) {
    return;
  }

  const root = input.closest(currentConfig.selector);

  if (root) {
    selectValue(root, getOptionValue(input), { reason: "user" });
  }
}

function initializeRoot(root) {
  if (root.dataset.calorieSelectorInitialized === "true") {
    return;
  }

  root.dataset.calorieSelectorInitialized = "true";

  const options = getAvailableOptions(root);

  options.forEach((option, index) => {
    if (!option.matches('input[type="radio"]')) {
      if (!option.hasAttribute("tabindex")) {
        option.tabIndex = option.classList.contains("is-selected") ? 0 : -1;
      }

      if (!option.hasAttribute("role")) {
        option.setAttribute("role", "radio");
      }
    }

    if (option.matches('input[type="radio"]') && !option.name) {
      option.name = root.dataset.calorieName || "biochef-calorie";
    }

    if (!option.id) {
      option.id = `biochef-calorie-option-${index + 1}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    }
  });

  const initialValue = chooseInitialValue(root);

  if (initialValue) {
    selectValue(root, initialValue, {
      emit: false,
      reason: "initial"
    });
  } else {
    updateOptionStates(root, null);
    updateOutput(root, null);
    delete root.dataset.selectedCalorie;
  }
}

/**
 * Initializes all calorie selectors on the page.
 *
 * Example:
 * <div data-calorie-selector>
 *   <button type="button" data-calorie-option data-calorie-value="1500">
 *     1500 kcal
 *   </button>
 * </div>
 */
export function initCalorieSelector(options = {}) {
  if (initialized) {
    return {
      getValue: () => selectedValue,
      setValue,
      refresh
    };
  }

  currentConfig = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  const roots = document.querySelectorAll(currentConfig.selector);

  roots.forEach(initializeRoot);

  document.addEventListener("click", handleOptionActivation);
  document.addEventListener("keydown", handleKeyboardNavigation);
  document.addEventListener("change", handleRadioChange);

  initialized = true;

  return {
    getValue: () => selectedValue,
    setValue,
    refresh
  };
}

function getPrimaryRoot() {
  return document.querySelector(currentConfig.selector);
}

export function setValue(value) {
  const root = getPrimaryRoot();

  if (!root) {
    return false;
  }

  return selectValue(root, value, { reason: "programmatic" });
}

export function refresh() {
  document.querySelectorAll(currentConfig.selector).forEach((root) => {
    initializeRoot(root);
  });
}

export function getSelectedCalorieValue() {
  return selectedValue ? Number(selectedValue) : null;
}
