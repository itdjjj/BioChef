
/**
 * BioChef — FAQ accordion
 * File: js/faq.js
 *
 * Imported by:
 *   js/main.js
 *
 * Styles:
 *   css/main.css
 *   css/components.css
 *
 * Supported markup:
 *   .faq-list
 *   .faq-item
 *   .faq-question
 *   .faq-answer
 *
 * Optional:
 *   data-faq-single="true" on .faq-list
 *   data-faq-initialized on .faq-list is managed internally
 */

const FAQ_SELECTORS = {
  list: ".faq-list",
  item: ".faq-item",
  question: ".faq-question",
  answer: ".faq-answer",
};

const FAQ_DEFAULTS = {
  singleOpen: true,
  closeOnEscape: true,
};

/**
 * Read a boolean configuration value from a data attribute.
 */
function readBooleanAttribute(element, name, fallback) {
  if (!element.hasAttribute(name)) {
    return fallback;
  }

  const value = element.getAttribute(name);

  return value !== "false" && value !== "0";
}

/**
 * Find the FAQ question and answer belonging to an item.
 */
function getFaqParts(item) {
  const question = item.querySelector(FAQ_SELECTORS.question);
  const answer = item.querySelector(FAQ_SELECTORS.answer);

  if (!question || !answer) {
    return null;
  }

  return { question, answer };
}

/**
 * Ensure question and answer have stable IDs and ARIA relationships.
 */
function configureFaqItem(item, index, list) {
  const parts = getFaqParts(item);

  if (!parts) {
    console.warn(
      "[BioChef FAQ] Each FAQ item needs a question and an answer.",
      item,
    );

    return null;
  }

  const { question, answer } = parts;
  const listId = list.id || "biochef-faq";
  const itemId = item.id || `${listId}-item-${index + 1}`;

  list.id = listId;
  item.id = itemId;

  if (!question.id) {
    question.id = `${itemId}-question`;
  }

  if (!answer.id) {
    answer.id = `${itemId}-answer`;
  }

  question.setAttribute("aria-controls", answer.id);
  question.setAttribute("aria-expanded", "false");

  /*
   * Use the question button as the accessible label for its answer panel.
   */
  answer.setAttribute("role", "region");
  answer.setAttribute("aria-labelledby", question.id);

  /*
   * Native buttons are expected. If a project uses another element,
   * it must implement button keyboard behavior in its HTML.
   */
  if (question.tagName !== "BUTTON") {
    console.warn(
      "[BioChef FAQ] Use <button type=\"button\" class=\"faq-question\"> for each FAQ question.",
      question,
    );
  }

  return { item, question, answer };
}

/**
 * Synchronize visibility, ARIA state, and CSS state.
 */
function setFaqItemOpen(parts, open) {
  const { item, question, answer } = parts;

  question.setAttribute("aria-expanded", String(open));
  answer.hidden = !open;

  item.classList.toggle("is-open", open);

  /*
   * Preserve the current markup's semantics while ensuring that hidden
   * answers cannot receive focus.
   */
  if (open) {
    answer.removeAttribute("inert");
  } else {
    answer.setAttribute("inert", "");
  }
}

/**
 * Initialize one FAQ list.
 */
function initializeFaqList(list, options = {}) {
  if (list.dataset.faqInitialized === "true") {
    return;
  }

  list.dataset.faqInitialized = "true";

  const singleOpen = readBooleanAttribute(
    list,
    "data-faq-single",
    options.singleOpen ?? FAQ_DEFAULTS.singleOpen,
  );

  const closeOnEscape = options.closeOnEscape ?? FAQ_DEFAULTS.closeOnEscape;

  const items = [...list.querySelectorAll(FAQ_SELECTORS.item)]
    .map((item, index) => configureFaqItem(item, index, list))
    .filter(Boolean);

  if (!items.length) {
    return;
  }

  /*
   * Start closed by default, unless the markup explicitly marks an item
   * as open with aria-expanded="true" or class="is-open".
   */
  let initiallyOpen = items.filter(({ item, question }) => (
    question.getAttribute("aria-expanded") === "true"
    || item.classList.contains("is-open")
  ));

  if (singleOpen && initiallyOpen.length > 1) {
    initiallyOpen = initiallyOpen.slice(0, 1);
  }

  items.forEach((parts) => {
    const shouldOpen = initiallyOpen.includes(parts);

    setFaqItemOpen(parts, shouldOpen);
  });

  function closeOtherItems(currentParts) {
    if (!singleOpen) {
      return;
    }

    items.forEach((parts) => {
      if (parts !== currentParts) {
        setFaqItemOpen(parts, false);
      }
    });
  }

  function toggleItem(parts) {
    const isOpen = parts.question.getAttribute("aria-expanded") === "true";

    if (isOpen) {
      setFaqItemOpen(parts, false);
      return;
    }

    closeOtherItems(parts);
    setFaqItemOpen(parts, true);
  }

  list.addEventListener("click", (event) => {
    const question = event.target.closest(FAQ_SELECTORS.question);

    if (!question || !list.contains(question)) {
      return;
    }

    const item = question.closest(FAQ_SELECTORS.item);

    if (!item || !list.contains(item)) {
      return;
    }

    const parts = items.find((entry) => entry.item === item);

    if (!parts || parts.question !== question) {
      return;
    }

    toggleItem(parts);
  });

  if (closeOnEscape) {
    list.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      const activeQuestion = event.target.closest(FAQ_SELECTORS.question);

      if (!activeQuestion) {
        return;
      }

      const activeParts = items.find(
        (parts) => parts.question === activeQuestion,
      );

      if (
        activeParts
        && activeParts.question.getAttribute("aria-expanded") === "true"
      ) {
        setFaqItemOpen(activeParts, false);
        activeParts.question.focus();
      }
    });
  }
}

/**
 * Public initializer used by js/main.js.
 */
export function initFaq(context = {}) {
  const root = context.document || document;
  const lists = root.querySelectorAll(FAQ_SELECTORS.list);

  lists.forEach((list) => {
    initializeFaqList(list);
  });
}

/**
 * Optional public API for opening or closing a specific FAQ item.
 */
export function setFaqItemState(item, open) {
  if (!(item instanceof Element)) {
    return false;
  }

  const parts = getFaqParts(item);

  if (!parts) {
    return false;
  }

  setFaqItemOpen(parts, Boolean(open));

  return true;
}
