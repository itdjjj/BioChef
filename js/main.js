
/**
 * BioChef — application entry point
 * File: js/main.js
 *
 * Stylesheets belong in index.html:
 *   css/main.css
 *   css/components.css
 *
 * JavaScript modules:
 *   js/modules/mobile-navigation.js
 *   js/modules/menu.js
 *   js/modules/calorie-selector.js
 *   js/modules/cart.js
 *   js/modules/faq.js
 *   js/modules/modal.js
 *   js/modules/checkout.js
 *   js/modules/lead-form.js
 */

const MODULES = [
  {
    name: "mobile-navigation",
    path: "./modules/mobile-navigation.js",
    exportName: "initMobileNavigation",
  },
  {
    name: "menu",
    path: "./modules/menu.js",
    exportName: "initMenu",
  },
  {
    name: "calorie-selector",
    path: "./modules/calorie-selector.js",
    exportName: "initCalorieSelector",
  },
  {
    name: "cart",
    path: "./modules/cart.js",
    exportName: "initCart",
  },
  {
    name: "faq",
    path: "./modules/faq.js",
    exportName: "initFaq",
  },
  {
    name: "modal",
    path: "./modules/modal.js",
    exportName: "initModal",
  },
  {
    name: "checkout",
    path: "./modules/checkout.js",
    exportName: "initCheckout",
  },
  {
    name: "lead-form",
    path: "./modules/lead-form.js",
    exportName: "initLeadForm",
  },
];

const APP_VERSION = "1.0.0";

/**
 * Log errors without interrupting other component initialization.
 */
function logModuleError(moduleName, error) {
  console.error(
    `[BioChef] Failed to initialize "${moduleName}".`,
    error,
  );
}

/**
 * Import and initialize one feature module.
 *
 * Each module must export an initializer function, for example:
 * export function initCart() { ... }
 */
async function initializeModule(moduleDefinition, context) {
  const { name, path, exportName } = moduleDefinition;

  try {
    const module = await import(path);
    const initializer = module[exportName];

    if (typeof initializer !== "function") {
      throw new TypeError(
        `Module "${path}" must export ${exportName}().`,
      );
    }

    await initializer(context);

    return {
      name,
      success: true,
    };
  } catch (error) {
    logModuleError(name, error);

    return {
      name,
      success: false,
      error,
    };
  }
}

/**
 * Initialize site-wide behavior that does not need a separate module.
 */
function initGlobalBehaviors() {
  initCurrentYear();
  initAnchorNavigation();
  initExternalLinks();
  initBackToTop();
}

/**
 * Update year placeholders.
 *
 * Supported markup:
 * <span data-current-year></span>
 */
function initCurrentYear() {
  const currentYear = String(new Date().getFullYear());

  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = currentYear;
  });
}

/**
 * Smoothly scroll to same-page anchors.
 *
 * Native anchor navigation remains available when JavaScript is disabled.
 */
function initAnchorNavigation() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');

    if (!link || link.hasAttribute("data-no-smooth-scroll")) {
      return;
    }

    const href = link.getAttribute("href");

    if (!href || href === "#") {
      return;
    }

    let target;

    try {
      target = document.querySelector(href);
    } catch {
      return;
    }

    if (!target) {
      return;
    }

    event.preventDefault();

    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });

    /*
     * Update the URL without causing a second native jump.
     */
    if (window.location.hash !== href) {
      window.history.replaceState(null, "", href);
    }

    /*
     * Make the destination discoverable to keyboard and screen-reader users.
     */
    if (!target.hasAttribute("tabindex") && !target.matches(
      "a, button, input, select, textarea",
    )) {
      target.setAttribute("tabindex", "-1");
    }

    if (typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  });
}

/**
 * Make links that open new tabs safer.
 */
function initExternalLinks() {
  document.querySelectorAll('a[target="_blank"]').forEach((link) => {
    const relTokens = new Set(
      (link.getAttribute("rel") || "")
        .split(/\s+/)
        .filter(Boolean),
    );

    relTokens.add("noopener");
    relTokens.add("noreferrer");

    link.setAttribute("rel", [...relTokens].join(" "));
  });
}

/**
 * Optional back-to-top control.
 *
 * Supported markup:
 * <button type="button" data-back-to-top>Back to top</button>
 */
function initBackToTop() {
  const buttons = document.querySelectorAll("[data-back-to-top]");

  if (!buttons.length) {
    return;
  }

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: reducedMotion.matches ? "auto" : "smooth",
      });
    });
  });
}

/**
 * Publish a lightweight custom event for analytics integrations.
 *
 * This function does not send data to a server.
 */
function dispatchAppReady(results) {
  document.dispatchEvent(
    new CustomEvent("biochef:ready", {
      detail: {
        version: APP_VERSION,
        modules: results.map(({ name, success }) => ({
          name,
          success,
        })),
      },
    }),
  );
}

/**
 * Start the application.
 */
async function startBioChef() {
  if (document.documentElement.dataset.biochefInitialized === "true") {
    return;
  }

  document.documentElement.dataset.biochefInitialized = "true";

  initGlobalBehaviors();

  const context = Object.freeze({
    document,
    window,
    version: APP_VERSION,
  });

  /*
   * Modules are imported independently. A failure in one module does not
   * prevent other features from initializing.
   */
  const results = await Promise.all(
    MODULES.map((moduleDefinition) =>
      initializeModule(moduleDefinition, context),
    ),
  );

  const failedModules = results.filter((result) => !result.success);

  if (failedModules.length > 0) {
    console.warn(
      `[BioChef] ${failedModules.length} of ${results.length} feature module(s) failed to initialize.`,
    );
  }

  dispatchAppReady(results);
}

/**
 * Support both script execution timings:
 * - DOM already parsed
 * - script loaded before DOMContentLoaded
 */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startBioChef, {
    once: true,
  });
} else {
  void startBioChef();
}
