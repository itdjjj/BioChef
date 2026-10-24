
const MENU_TABS_DEFAULTS = {
  rootSelector: "[data-menu-tabs]",
  tabSelector: '[role="tab"], [data-menu-tab]',
  panelSelector: '[role="tabpanel"], [data-menu-panel]',
  activeClass: "is-active",
  hiddenClass: "is-hidden"
};

let menuTabsConfig = { ...MENU_TABS_DEFAULTS };
let menuTabsInitialized = false;

function getTabId(tab, index) {
  if (!tab.id) {
    tab.id = `biochef-menu-tab-${index + 1}`;
  }

  return tab.id;
}

function getPanelId(panel, index) {
  if (!panel.id) {
    panel.id = `biochef-menu-panel-${index + 1}`;
  }

  return panel.id;
}

function getTabPanelId(tab) {
  return tab.getAttribute("aria-controls") ||
    tab.dataset.menuTarget ||
    "";
}

function getTabs(root) {
  return Array.from(root.querySelectorAll(menuTabsConfig.tabSelector))
    .filter((tab) => tab.closest(menuTabsConfig.rootSelector) === root);
}

function getPanels(root) {
  return Array.from(root.querySelectorAll(menuTabsConfig.panelSelector))
    .filter((panel) => panel.closest(menuTabsConfig.rootSelector) === root);
}

function findPanelForTab(tab, panels) {
  const panelId = getTabPanelId(tab);

  if (panelId) {
    return panels.find((panel) => panel.id === panelId) || null;
  }

  const target = tab.dataset.menuTarget;

  if (target) {
    const normalizedId = target.startsWith("#") ? target.slice(1) : target;
    return panels.find((panel) => panel.id === normalizedId) || null;
  }

  return null;
}

function setTabState(tab, isSelected, index) {
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-selected", String(isSelected));
  tab.setAttribute("tabindex", isSelected ? "0" : "-1");
  tab.classList.toggle(menuTabsConfig.activeClass, isSelected);

  if (!tab.id) {
    getTabId(tab, index);
  }
}

function setPanelState(panel, isActive, tab) {
  panel.setAttribute("role", "tabpanel");
  panel.hidden = !isActive;
  panel.classList.toggle(menuTabsConfig.activeClass, isActive);
  panel.classList.toggle(menuTabsConfig.hiddenClass, !isActive);

  if (tab) {
    panel.setAttribute("aria-labelledby", tab.id);
  }

  if (!panel.hasAttribute("tabindex")) {
    panel.tabIndex = 0;
  }
}

function activateTab(root, selectedTab, options = {}) {
  const tabs = getTabs(root);
  const panels = getPanels(root);

  if (!tabs.includes(selectedTab)) {
    return false;
  }

  const selectedPanel = findPanelForTab(selectedTab, panels);

  if (!selectedPanel) {
    console.warn(
      "BioChef menu tabs: no matching panel found for tab:",
      selectedTab
    );
    return false;
  }

  tabs.forEach((tab, index) => {
    setTabState(tab, tab === selectedTab, index);
  });

  panels.forEach((panel) => {
    setPanelState(panel, panel === selectedPanel, selectedTab);
  });

  root.dataset.activeMenuTab = selectedTab.id;

  if (options.focus) {
    selectedTab.focus();
  }

  if (options.emit !== false) {
    const detail = {
      tabId: selectedTab.id,
      panelId: selectedPanel.id,
      category: selectedTab.dataset.menuCategory || selectedTab.textContent.trim()
    };

    root.dispatchEvent(
      new CustomEvent("biochef:menu-tab-changed", {
        bubbles: true,
        detail
      })
    );
  }

  return true;
}

function initializeMenuTabs(root) {
  if (root.dataset.menuTabsInitialized === "true") {
    return;
  }

  const tabs = getTabs(root);
  const panels = getPanels(root);

  if (!tabs.length || !panels.length) {
    console.warn(
      "BioChef menu tabs: root requires at least one tab and one panel.",
      root
    );
    return;
  }

  const panelIds = new Set();

  panels.forEach((panel, index) => {
    getPanelId(panel, index);

    if (panelIds.has(panel.id)) {
      console.warn("BioChef menu tabs: duplicate panel ID:", panel.id);
    }

    panelIds.add(panel.id);
  });

  tabs.forEach((tab, index) => {
    getTabId(tab, index);

    if (!tab.hasAttribute("type") && tab.tagName === "BUTTON") {
      tab.type = "button";
    }

    tab.setAttribute("role", "tab");

    const panel = findPanelForTab(tab, panels);

    if (panel) {
      tab.setAttribute("aria-controls", panel.id);
    }
  });

  const initialTab =
    tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ||
    tabs.find((tab) => tab.classList.contains(menuTabsConfig.activeClass)) ||
    tabs.find((tab) => findPanelForTab(tab, panels) &&
      !findPanelForTab(tab, panels).hidden) ||
    tabs[0];

  tabs.forEach((tab, index) => {
    const panel = findPanelForTab(tab, panels);

    setTabState(tab, tab === initialTab, index);

    if (panel) {
      setPanelState(panel, tab === initialTab, tab);
    }
  });

  root.dataset.menuTabsInitialized = "true";

  if (initialTab) {
    root.dataset.activeMenuTab = initialTab.id;
  }
}

function handleTabClick(event) {
  const tab = event.target.closest(menuTabsConfig.tabSelector);

  if (!tab) {
    return;
  }

  const root = tab.closest(menuTabsConfig.rootSelector);

  if (!root) {
    return;
  }

  event.preventDefault();
  activateTab(root, tab, { focus: false });
}

function handleTabKeydown(event) {
  const tab = event.target.closest(menuTabsConfig.tabSelector);

  if (!tab) {
    return;
  }

  const root = tab.closest(menuTabsConfig.rootSelector);

  if (!root) {
    return;
  }

  const tabs = getTabs(root).filter((item) => {
    return !item.disabled && item.getAttribute("aria-disabled") !== "true";
  });

  const index = tabs.indexOf(tab);

  if (index === -1 || tabs.length === 0) {
    return;
  }

  let nextIndex = index;

  switch (event.key) {
    case "ArrowRight":
      nextIndex = (index + 1) % tabs.length;
      break;
    case "ArrowLeft":
      nextIndex = (index - 1 + tabs.length) % tabs.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = tabs.length - 1;
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      activateTab(root, tab, { focus: true });
      return;
    default:
      return;
  }

  event.preventDefault();
  activateTab(root, tabs[nextIndex], { focus: true });
}

export function initMenuTabs(options = {}) {
  if (menuTabsInitialized) {
    return {
      refresh: () => {
        document.querySelectorAll(menuTabsConfig.rootSelector)
          .forEach(initializeMenuTabs);
      },
      activate: (root, tab) => activateTab(root, tab)
    };
  }

  menuTabsConfig = {
    ...MENU_TABS_DEFAULTS,
    ...options
  };

  document.querySelectorAll(menuTabsConfig.rootSelector)
    .forEach(initializeMenuTabs);

  document.addEventListener("click", handleTabClick);
  document.addEventListener("keydown", handleTabKeydown);

  menuTabsInitialized = true;

  return {
    refresh: () => {
      document.querySelectorAll(menuTabsConfig.rootSelector)
        .forEach(initializeMenuTabs);
    },
    activate: (root, tab) => activateTab(root, tab)
  };
}
