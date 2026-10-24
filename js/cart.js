
const CART_STORAGE_KEY = "biochef-cart-v1";
const CART_UPDATED_EVENT = "biochef:cart-updated";

const DEFAULTS = {
  currency: "PLN",
  locale: "pl-PL",
  selectors: {
    cartRoot: "[data-cart]",
    cartItems: "[data-cart-items]",
    cartEmpty: "[data-cart-empty]",
    cartSummary: "[data-cart-summary]",
    cartSubtotal: "[data-cart-subtotal]",
    cartTotal: "[data-cart-total]",
    cartCount: "[data-cart-count], .cart-badge",
    cartClear: "[data-cart-clear]",
    addButton: "[data-add-to-cart]",
    quantityControl: "[data-cart-quantity]",
    quantityValue: "[data-quantity-value]",
    quantityDecrease: "[data-quantity-decrease]",
    quantityIncrease: "[data-quantity-increase]",
    removeButton: "[data-cart-remove]",
    liveRegion: "[data-cart-live-region]",
    checkoutButton: "[data-cart-checkout]"
  },
  maxQuantity: 99
};

const memoryCart = new Map();

let activeCart = new Map();
let activeConfig = { ...DEFAULTS };
let initialized = false;
let storageAvailable = true;
let currencyFormatter;
let numberFormatter;

function formatMoney(value) {
  if (!currencyFormatter) {
    currencyFormatter = new Intl.NumberFormat(activeConfig.locale, {
      style: "currency",
      currency: activeConfig.currency
    });
  }

  return currencyFormatter.format(Number(value) || 0);
}

function formatQuantity(value) {
  if (!numberFormatter) {
    numberFormatter = new Intl.NumberFormat(activeConfig.locale);
  }

  return numberFormatter.format(Number(value) || 0);
}

function toPositiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function toInteger(value, fallback = 1) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object") {
    return null;
  }

  const id = String(rawItem.id ?? "").trim();
  const name = String(rawItem.name ?? "").trim();
  const price = toPositiveNumber(rawItem.price, -1);
  const quantity = toInteger(rawItem.quantity, 1);

  if (!id || !name || price < 0 || quantity < 1) {
    return null;
  }

  return {
    id,
    name,
    price,
    quantity: Math.min(quantity, activeConfig.maxQuantity),
    image: typeof rawItem.image === "string" ? rawItem.image : "",
    description:
      typeof rawItem.description === "string" ? rawItem.description : ""
  };
}

function loadCart() {
  if (!storageAvailable) {
    return new Map(memoryCart);
  }

  try {
    const saved = window.localStorage.getItem(CART_STORAGE_KEY);

    if (!saved) {
      return new Map();
    }

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return new Map();
    }

    const cart = new Map();

    for (const rawItem of parsed) {
      const item = normalizeItem(rawItem);

      if (item) {
        cart.set(item.id, item);
      }
    }

    return cart;
  } catch (error) {
    storageAvailable = false;
    console.warn("BioChef: local cart storage is unavailable.", error);
    return new Map(memoryCart);
  }
}

function persistCart() {
  const items = Array.from(activeCart.values()).map((item) => ({ ...item }));

  memoryCart.clear();

  for (const item of items) {
    memoryCart.set(item.id, item);
  }

  if (!storageAvailable) {
    return;
  }

  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    storageAvailable = false;
    console.warn("BioChef: could not persist the cart.", error);
  }
}

function getCartCount() {
  let count = 0;

  for (const item of activeCart.values()) {
    count += item.quantity;
  }

  return count;
}

function getCartSubtotal() {
  let subtotal = 0;

  for (const item of activeCart.values()) {
    subtotal += item.price * item.quantity;
  }

  return Math.round((subtotal + Number.EPSILON) * 100) / 100;
}

function getCartItems() {
  return Array.from(activeCart.values()).map((item) => ({ ...item }));
}

function dispatchCartUpdated(reason = "updated") {
  const detail = {
    reason,
    items: getCartItems(),
    count: getCartCount(),
    subtotal: getCartSubtotal(),
    currency: activeConfig.currency
  };

  document.dispatchEvent(
    new CustomEvent(CART_UPDATED_EVENT, { detail })
  );
}

function announce(message) {
  const region = document.querySelector(activeConfig.selectors.liveRegion);

  if (region) {
    region.textContent = "";
    window.requestAnimationFrame(() => {
      region.textContent = message;
    });
  }
}

function updateCountDisplay() {
  const count = getCartCount();

  document.querySelectorAll(activeConfig.selectors.cartCount).forEach((element) => {
    element.textContent = formatQuantity(count);
    element.setAttribute("aria-label", `Liczba produktów w koszyku: ${count}`);
    element.hidden = count === 0;
  });
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function createQuantityControl(item) {
  const wrapper = createElement("div", "quantity-control");
  wrapper.dataset.cartQuantity = item.id;
  wrapper.setAttribute("aria-label", `Ilość produktu: ${item.name}`);

  const decrease = createElement("button", "quantity-control__button", "−");
  decrease.type = "button";
  decrease.dataset.quantityDecrease = item.id;
  decrease.setAttribute("aria-label", `Zmniejsz ilość: ${item.name}`);
  decrease.disabled = item.quantity <= 1;

  const value = createElement(
    "span",
    "quantity-control__value",
    formatQuantity(item.quantity)
  );
  value.dataset.quantityValue = "";
  value.setAttribute("aria-live", "polite");

  const increase = createElement("button", "quantity-control__button", "+");
  increase.type = "button";
  increase.dataset.quantityIncrease = item.id;
  increase.setAttribute("aria-label", `Zwiększ ilość: ${item.name}`);
  increase.disabled = item.quantity >= activeConfig.maxQuantity;

  wrapper.append(decrease, value, increase);
  return wrapper;
}

function createCartItem(item) {
  const article = createElement("article", "cart-item");
  article.dataset.cartItem = item.id;

  if (item.image) {
    const image = document.createElement("img");
    image.className = "cart-item__image";
    image.src = item.image;
    image.alt = "";
    image.loading = "lazy";
    image.width = 80;
    image.height = 80;
    article.append(image);
  }

  const content = createElement("div", "cart-item__content");
  const heading = createElement("h3", "cart-item__name", item.name);
  content.append(heading);

  if (item.description) {
    content.append(createElement("p", "cart-item__description", item.description));
  }

  content.append(
    createElement("p", "cart-item__unit-price", `${formatMoney(item.price)} / szt.`)
  );

  const controls = createElement("div", "cart-item__controls");
  controls.append(createQuantityControl(item));

  const remove = createElement("button", "cart-item__remove", "Usuń");
  remove.type = "button";
  remove.dataset.cartRemove = item.id;
  remove.setAttribute("aria-label", `Usuń produkt: ${item.name}`);

  controls.append(remove);
  content.append(controls);

  const lineTotal = createElement(
    "p",
    "cart-item__total",
    formatMoney(item.price * item.quantity)
  );
  lineTotal.setAttribute("aria-label", `Wartość produktu: ${item.name}`);

  article.append(content, lineTotal);
  return article;
}

function renderCart() {
  const itemsContainer = document.querySelector(activeConfig.selectors.cartItems);
  const emptyState = document.querySelector(activeConfig.selectors.cartEmpty);
  const summary = document.querySelector(activeConfig.selectors.cartSummary);
  const subtotalElement = document.querySelector(activeConfig.selectors.cartSubtotal);
  const totalElement = document.querySelector(activeConfig.selectors.cartTotal);
  const checkoutButton = document.querySelector(activeConfig.selectors.checkoutButton);

  if (itemsContainer) {
    itemsContainer.replaceChildren();

    for (const item of activeCart.values()) {
      itemsContainer.append(createCartItem(item));
    }
  }

  const isEmpty = activeCart.size === 0;

  if (emptyState) {
    emptyState.hidden = !isEmpty;
  }

  if (itemsContainer) {
    itemsContainer.hidden = isEmpty;
  }

  if (summary) {
    summary.hidden = isEmpty;
  }

  if (subtotalElement) {
    subtotalElement.textContent = formatMoney(getCartSubtotal());
  }

  if (totalElement) {
    totalElement.textContent = formatMoney(getCartSubtotal());
  }

  if (checkoutButton) {
    checkoutButton.disabled = isEmpty;
    checkoutButton.setAttribute("aria-disabled", String(isEmpty));
  }

  updateCountDisplay();
}

function commitCartChange(reason, message) {
  persistCart();
  renderCart();
  dispatchCartUpdated(reason);

  if (message) {
    announce(message);
  }
}

function addItem(rawItem) {
  const item = normalizeItem({
    ...rawItem,
    quantity: toInteger(rawItem?.quantity, 1)
  });

  if (!item) {
    console.warn("BioChef: invalid product data; item was not added.");
    announce("Nie udało się dodać produktu do koszyka.");
    return false;
  }

  const existing = activeCart.get(item.id);

  if (existing) {
    existing.quantity = Math.min(
      existing.quantity + item.quantity,
      activeConfig.maxQuantity
    );

    if (item.image) existing.image = item.image;
    if (item.description) existing.description = item.description;
  } else {
    activeCart.set(item.id, item);
  }

  const current = activeCart.get(item.id);

  commitCartChange(
    "item-added",
    `Dodano do koszyka: ${current.name}. Liczba sztuk: ${current.quantity}.`
  );

  return true;
}

function setItemQuantity(id, quantity) {
  const item = activeCart.get(String(id));

  if (!item) {
    return false;
  }

  const nextQuantity = toInteger(quantity, item.quantity);

  if (nextQuantity <= 0) {
    return removeItem(item.id);
  }

  item.quantity = Math.min(nextQuantity, activeConfig.maxQuantity);

  commitCartChange(
    "quantity-changed",
    `Zmieniono ilość produktu ${item.name}: ${item.quantity}.`
  );

  return true;
}

function removeItem(id) {
  const item = activeCart.get(String(id));

  if (!item) {
    return false;
  }

  activeCart.delete(item.id);

  commitCartChange("item-removed", `Usunięto z koszyka: ${item.name}.`);
  return true;
}

function clearCart() {
  if (activeCart.size === 0) {
    return;
  }

  activeCart.clear();
  commitCartChange("cart-cleared", "Koszyk został opróżniony.");
}

function readProductFromButton(button) {
  const card = button.closest("[data-product-card], .menu-card, .plan-card");
  const source = card || button;

  const id =
    button.dataset.productId ||
    source.dataset.productId ||
    source.id;

  const name =
    button.dataset.productName ||
    source.dataset.productName ||
    source.querySelector("[data-product-name], .menu-card__title, .plan-card__title, h3")
      ?.textContent
      ?.trim();

  const price = button.dataset.productPrice ?? source.dataset.productPrice;
  const image =
    button.dataset.productImage ||
    source.dataset.productImage ||
    source.querySelector("img")?.currentSrc ||
    source.querySelector("img")?.src ||
    "";

  const description =
    button.dataset.productDescription ||
    source.dataset.productDescription ||
    source.querySelector("[data-product-description]")?.textContent?.trim() ||
    "";

  const quantity = button.dataset.quantity || "1";

  return {
    id,
    name,
    price,
    image,
    description,
    quantity
  };
}

function handleCartClick(event) {
  const addButton = event.target.closest(activeConfig.selectors.addButton);

  if (addButton) {
    event.preventDefault();

    if (addButton.disabled || addButton.getAttribute("aria-disabled") === "true") {
      return;
    }

    const product = readProductFromButton(addButton);

    if (addItem(product)) {
      const originalText = addButton.dataset.addedText || "Dodano";

      if (addButton.dataset.originalText === undefined) {
        addButton.dataset.originalText = addButton.textContent.trim();
      }

      addButton.textContent = originalText;
      addButton.setAttribute("aria-pressed", "true");

      window.setTimeout(() => {
        if (!addButton.isConnected) return;

        addButton.textContent = addButton.dataset.originalText;
        addButton.removeAttribute("aria-pressed");
      }, 1400);
    }

    return;
  }

  const decreaseButton = event.target.closest(activeConfig.selectors.quantityDecrease);

  if (decreaseButton) {
    event.preventDefault();

    const item = activeCart.get(decreaseButton.dataset.quantityDecrease);

    if (item) {
      setItemQuantity(item.id, item.quantity - 1);
    }

    return;
  }

  const increaseButton = event.target.closest(activeConfig.selectors.quantityIncrease);

  if (increaseButton) {
    event.preventDefault();

    const item = activeCart.get(increaseButton.dataset.quantityIncrease);

    if (item) {
      setItemQuantity(item.id, item.quantity + 1);
    }

    return;
  }

  const removeButton = event.target.closest(activeConfig.selectors.removeButton);

  if (removeButton) {
    event.preventDefault();
    removeItem(removeButton.dataset.cartRemove);
    return;
  }

  const clearButton = event.target.closest(activeConfig.selectors.cartClear);

  if (clearButton) {
    event.preventDefault();
    clearCart();
  }
}

function handleQuantityChange(event) {
  const control = event.target.closest("[data-cart-quantity-input]");

  if (!control) {
    return;
  }

  const id = control.dataset.cartQuantityInput;
  const quantity = toInteger(control.value, 1);

  setItemQuantity(id, quantity);
}

function handleStorageChange(event) {
  if (event.key !== CART_STORAGE_KEY) {
    return;
  }

  activeCart = loadCart();
  renderCart();
  dispatchCartUpdated("storage-synced");
}

function handleCheckoutClick(event) {
  const checkoutButton = event.target.closest(activeConfig.selectors.checkoutButton);

  if (!checkoutButton || activeCart.size === 0) {
    return;
  }

  document.dispatchEvent(
    new CustomEvent("biochef:checkout-requested", {
      detail: {
        items: getCartItems(),
        count: getCartCount(),
        subtotal: getCartSubtotal(),
        currency: activeConfig.currency
      }
    })
  );
}

/**
 * Initializes cart behavior once.
 *
 * Supported product button example:
 * <button
 *   type="button"
 *   data-add-to-cart
 *   data-product-id="salad-green"
 *   data-product-name="Zielona sałatka"
 *   data-product-price="24.90"
 * >
 *   Dodaj do koszyka
 * </button>
 */
export function initCart(options = {}) {
  if (initialized) {
    return {
      addItem,
      setItemQuantity,
      removeItem,
      clearCart,
      getItems: getCartItems,
      getCount: getCartCount,
      getSubtotal: getCartSubtotal
    };
  }

  activeConfig = {
    ...DEFAULTS,
    ...options,
    selectors: {
      ...DEFAULTS.selectors,
      ...(options.selectors || {})
    }
  };

  currencyFormatter = null;
  numberFormatter = null;
  activeCart = loadCart();

  document.addEventListener("click", handleCartClick);
  document.addEventListener("click", handleCheckoutClick);
  document.addEventListener("change", handleQuantityChange);
  window.addEventListener("storage", handleStorageChange);

  renderCart();
  initialized = true;
  dispatchCartUpdated("initialized");

  return {
    addItem,
    setItemQuantity,
    removeItem,
    clearCart,
    getItems: getCartItems,
    getCount: getCartCount,
    getSubtotal: getCartSubtotal
  };
}

export {
  addItem,
  setItemQuantity,
  removeItem,
  clearCart,
  getCartItems,
  getCartCount,
  getCartSubtotal
};
