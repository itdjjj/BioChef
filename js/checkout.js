
const CHECKOUT_DEFAULTS = {
  formSelector: "[data-checkout-form]",
  cartItemsSelector: "[data-checkout-items]",
  subtotalSelector: "[data-checkout-subtotal]",
  deliverySelector: "[data-checkout-delivery]",
  totalSelector: "[data-checkout-total]",
  submitSelector: "[data-checkout-submit]",
  statusSelector: "[data-checkout-status]",
  deliveryMethodSelector: 'input[name="delivery_method"]',
  endpoint: "/api/checkout",
  currency: "PLN",
  locale: "pl-PL",
  freeDeliveryThreshold: null,
  deliveryFees: {
    home: 0,
    pickup: 0
  }
};

let checkoutConfig = { ...CHECKOUT_DEFAULTS };
let checkoutInitialized = false;
let checkoutSubmitting = false;

function formatCheckoutMoney(value) {
  return new Intl.NumberFormat(checkoutConfig.locale, {
    style: "currency",
    currency: checkoutConfig.currency
  }).format(Number(value) || 0);
}

function getCartSnapshot() {
  if (typeof window.BioChefCart?.getItems === "function") {
    return window.BioChefCart.getItems();
  }

  try {
    const saved = window.localStorage.getItem("biochef-cart-v1");
    const items = saved ? JSON.parse(saved) : [];

    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .filter((item) => {
        return (
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          Number.isFinite(Number(item.price)) &&
          Number(item.price) >= 0 &&
          Number.isInteger(Number(item.quantity)) &&
          Number(item.quantity) > 0
        );
      })
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        quantity: Number(item.quantity)
      }));
  } catch {
    return [];
  }
}

function calculateSubtotal(items) {
  return items.reduce((sum, item) => {
    return sum + Number(item.price) * Number(item.quantity);
  }, 0);
}

function getSelectedDeliveryMethod(form) {
  const selected = form.querySelector(
    `${checkoutConfig.deliveryMethodSelector}:checked`
  );

  return selected?.value || "home";
}

function getDeliveryFee(method, subtotal) {
  if (
    Number.isFinite(checkoutConfig.freeDeliveryThreshold) &&
    checkoutConfig.freeDeliveryThreshold >= 0 &&
    subtotal >= checkoutConfig.freeDeliveryThreshold
  ) {
    return 0;
  }

  const configuredFee = checkoutConfig.deliveryFees[method];

  return Number.isFinite(Number(configuredFee))
    ? Math.max(0, Number(configuredFee))
    : 0;
}

function updateCheckoutSummary(form) {
  const items = getCartSnapshot();
  const subtotal = calculateSubtotal(items);
  const method = getSelectedDeliveryMethod(form);
  const deliveryFee = getDeliveryFee(method, subtotal);
  const total = subtotal + deliveryFee;

  const subtotalElement = document.querySelector(
    checkoutConfig.subtotalSelector
  );
  const deliveryElement = document.querySelector(
    checkoutConfig.deliverySelector
  );
  const totalElement = document.querySelector(
    checkoutConfig.totalSelector
  );

  if (subtotalElement) {
    subtotalElement.textContent = formatCheckoutMoney(subtotal);
  }

  if (deliveryElement) {
    deliveryElement.textContent = formatCheckoutMoney(deliveryFee);
  }

  if (totalElement) {
    totalElement.textContent = formatCheckoutMoney(total);
  }

  return { items, subtotal, deliveryFee, total, method };
}

function getStatusElement(form) {
  return form.querySelector(checkoutConfig.statusSelector) ||
    document.querySelector(checkoutConfig.statusSelector);
}

function setStatus(form, message, type = "info") {
  const status = getStatusElement(form);

  if (!status) {
    return;
  }

  status.textContent = message;
  status.dataset.status = type;
  status.hidden = message.length === 0;
}

function setSubmittingState(form, isSubmitting) {
  checkoutSubmitting = isSubmitting;

  const submitButton = form.querySelector(checkoutConfig.submitSelector);

  if (!submitButton) {
    return;
  }

  submitButton.disabled = isSubmitting;
  submitButton.setAttribute("aria-busy", String(isSubmitting));

  if (isSubmitting) {
    if (!submitButton.dataset.originalText) {
      submitButton.dataset.originalText = submitButton.textContent.trim();
    }

    submitButton.textContent = "Przetwarzanie zamówienia…";
  } else if (submitButton.dataset.originalText) {
    submitButton.textContent = submitButton.dataset.originalText;
  }
}

function clearFieldErrors(form) {
  form.querySelectorAll("[data-field-error]").forEach((error) => {
    error.textContent = "";
    error.hidden = true;
  });

  form.querySelectorAll("[aria-invalid='true']").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
}

function showFieldError(form, field, message) {
  field.setAttribute("aria-invalid", "true");

  const errorId = field.getAttribute("aria-describedby");
  let errorElement = errorId ? document.getElementById(errorId) : null;

  if (!errorElement || !errorElement.matches("[data-field-error]")) {
    errorElement = field
      .closest(".form-field")
      ?.querySelector("[data-field-error]");
  }

  if (errorElement) {
    errorElement.textContent = message;
    errorElement.hidden = false;
  }
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

function validateCheckoutForm(form) {
  clearFieldErrors(form);

  const errors = [];
  const fields = Array.from(form.querySelectorAll(
    "input, select, textarea"
  )).filter((field) => {
    return !field.disabled &&
      field.type !== "hidden" &&
      !field.matches("[data-no-checkout-validation]");
  });

  for (const field of fields) {
    const value = typeof field.value === "string"
      ? field.value.trim()
      : "";

    let message = "";

    if (field.required) {
      if (field.type === "checkbox" && !field.checked) {
        message = "To pole jest wymagane.";
      } else if (field.type === "radio") {
        const group = form.querySelectorAll(
          `input[type="radio"][name="${CSS.escape(field.name)}"]`
        );

        if (group.length && !Array.from(group).some((radio) => radio.checked)) {
          message = "Wybierz jedną z dostępnych opcji.";
        }
      } else if (field.type !== "checkbox" && !value) {
        message = "Uzupełnij to pole.";
      }
    }

    if (!message && value && field.type === "email" && !validateEmail(value)) {
      message = "Wpisz poprawny adres e-mail.";
    }

    if (!message && value && field.type === "tel" && !validatePhone(value)) {
      message = "Wpisz poprawny numer telefonu.";
    }

    if (!message && field.type === "checkbox" &&
        field.dataset.mustBeChecked === "true" && !field.checked) {
      message = "Zaznacz to pole, aby kontynuować.";
    }

    if (message) {
      showFieldError(form, field, message);
      errors.push({ field, message });
    }
  }

  if (errors.length) {
    errors[0].field.focus();
    setStatus(form, "Sprawdź zaznaczone pola i popraw błędy.", "error");
    return false;
  }

  return true;
}

function serializeForm(form, summary) {
  const formData = new FormData(form);
  const customer = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      customer[key] = value.trim();
    }
  }

  return {
    customer,
    deliveryMethod: summary.method,
    items: summary.items.map((item) => ({
      id: item.id,
      quantity: item.quantity
    }))
  };
}

function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || "";
}

async function submitCheckout(form) {
  if (checkoutSubmitting) {
    return;
  }

  if (!validateCheckoutForm(form)) {
    return;
  }

  const summary = updateCheckoutSummary(form);

  if (summary.items.length === 0) {
    setStatus(
      form,
      "Twój koszyk jest pusty. Dodaj produkty przed złożeniem zamówienia.",
      "error"
    );
    return;
  }

  if (!checkoutConfig.endpoint) {
    setStatus(
      form,
      "Składanie zamówień nie jest obecnie skonfigurowane.",
      "error"
    );
    return;
  }

  setSubmittingState(form, true);
  setStatus(form, "Wysyłamy Twoje zamówienie…", "info");

  try {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    const csrfToken = getCsrfToken();

    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }

    const response = await fetch(checkoutConfig.endpoint, {
      method: "POST",
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(serializeForm(form, summary))
    });

    let result = {};

    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      const message = typeof result.message === "string"
        ? result.message
        : "Nie udało się złożyć zamówienia. Sprawdź dane i spróbuj ponownie.";

      setStatus(form, message, "error");
      return;
    }

    if (result.success !== true || typeof result.orderId !== "string") {
      setStatus(
        form,
        "Serwer nie potwierdził zamówienia. Skontaktuj się z obsługą klienta, jeśli problem się powtarza.",
        "error"
      );
      return;
    }

    form.dispatchEvent(
      new CustomEvent("biochef:checkout-success", {
        bubbles: true,
        detail: {
          orderId: result.orderId,
          status: result.status || "received"
        }
      })
    );

    setStatus(
      form,
      `Dziękujemy! Zamówienie ${result.orderId} zostało przyjęte.`,
      "success"
    );

    form.reset();
    updateCheckoutSummary(form);

    if (typeof window.BioChefCart?.clearCart === "function") {
      window.BioChefCart.clearCart();
    }

    if (result.redirectUrl && isSafeRedirect(result.redirectUrl)) {
      window.location.assign(result.redirectUrl);
    }
  } catch (error) {
    console.error("BioChef checkout request failed.", error);

    setStatus(
      form,
      "Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.",
      "error"
    );
  } finally {
    setSubmittingState(form, false);
  }
}

function isSafeRedirect(value) {
  try {
    const url = new URL(value, window.location.origin);

    return url.origin === window.location.origin &&
      url.protocol === window.location.protocol;
  } catch {
    return false;
  }
}

function handleCheckoutSubmit(event) {
  const form = event.target.closest(checkoutConfig.formSelector);

  if (!form) {
    return;
  }

  event.preventDefault();
  submitCheckout(form);
}

function handleCheckoutChange(event) {
  const form = event.target.closest(checkoutConfig.formSelector);

  if (!form) {
    return;
  }

  if (event.target.matches(checkoutConfig.deliveryMethodSelector)) {
    updateCheckoutSummary(form);
  }
}

function handleCartUpdated() {
  document.querySelectorAll(checkoutConfig.formSelector).forEach((form) => {
    updateCheckoutSummary(form);
  });
}

function initializeCheckoutForm(form) {
  updateCheckoutSummary(form);
}

/**
 * Initializes checkout forms.
 *
 * The server endpoint must validate products, prices, delivery fees,
 * customer input, consent and inventory independently.
 */
export function initCheckout(options = {}) {
  if (checkoutInitialized) {
    return {
      refresh: handleCartUpdated
    };
  }

  checkoutConfig = {
    ...CHECKOUT_DEFAULTS,
    ...options,
    deliveryFees: {
      ...CHECKOUT_DEFAULTS.deliveryFees,
      ...(options.deliveryFees || {})
    }
  };

  document.querySelectorAll(checkoutConfig.formSelector).forEach(
    initializeCheckoutForm
  );

  document.addEventListener("submit", handleCheckoutSubmit);
  document.addEventListener("change", handleCheckoutChange);
  document.addEventListener("biochef:cart-updated", handleCartUpdated);

  checkoutInitialized = true;

  return {
    refresh: handleCartUpdated
  };
}
