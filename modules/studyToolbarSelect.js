/**
 * studyToolbarSelect.js — danh sách tùy biến cho thanh tiện ích ôn tập.
 *
 * <select> gốc vẫn là nguồn giá trị duy nhất: mọi lựa chọn được ghi ngược vào
 * select rồi bắn sự kiện change, nên handler cũ (switchTab, lọc độ khó, đổi môn)
 * chạy nguyên ven mà không cần đổi API.
 */

const SEARCH_THRESHOLD = 8;
const MENU_GAP = 6;
const VIEWPORT_PADDING = 10;
const entries = new WeakMap();
let openEntry = null;
let globalsInstalled = false;

export function initStudyToolbarSelects(scope = document) {
  scope.querySelectorAll('.study-toolbar-select').forEach(enhance);
}

export function refreshStudyToolbarSelects() {
  document.querySelectorAll('.study-toolbar-select').forEach((select) => {
    const entry = entries.get(select);
    if (entry) entry.refresh();
    else enhance(select);
  });
}

function enhance(select) {
  if (entries.has(select)) return entries.get(select);
  const control = select.closest('.study-toolbar-control');
  if (!control) return null;
  const entry = createEntry(select, control);
  entries.set(select, entry);
  entry.refresh();
  return entry;
}

function readGroups(select) {
  const groups = [];
  const push = (label) => {
    let last = groups[groups.length - 1];
    if (!last || last.label !== label) {
      last = { label, options: [] };
      groups.push(last);
    }
    return last;
  };

  Array.from(select.children).forEach((node) => {
    if (node.tagName === 'OPTGROUP') {
      const group = push(node.label || '');
      Array.from(node.children).forEach((option) => {
        if (option.tagName === 'OPTION') group.options.push(readOption(option));
      });
    } else if (node.tagName === 'OPTION') {
      push('').options.push(readOption(node));
    }
  });

  return groups.filter((group) => group.options.length > 0);
}

function readOption(option) {
  return { value: option.value, text: option.textContent.trim(), disabled: option.disabled };
}

function splitSubjectLabel(text) {
  const match = /^([A-Z]{2}\d{3,6})\s*[·\-–]\s*(.+)$/.exec(text);
  return match ? { code: match[1], name: match[2] } : null;
}

function foldText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function createEntry(select, control) {
  const labelText = select.getAttribute('aria-label') || 'Chọn giá trị';
  control.classList.add('is-custom');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'st-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', labelText);
  const valueText = document.createElement('span');
  valueText.className = 'st-select-value';
  const caret = document.createElement('i');
  caret.className = 'fa-solid fa-chevron-down st-select-caret';
  caret.setAttribute('aria-hidden', 'true');
  trigger.append(valueText, caret);
  control.appendChild(trigger);

  const menu = document.createElement('div');
  menu.className = 'st-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', labelText);
  menu.hidden = true;
  document.body.appendChild(menu);

  let items = [];
  let groupsMeta = [];
  let searchInput = null;
  let countEl = null;
  let emptyEl = null;
  let builtSignature = '';

  const entry = { control, menu, refresh, open, close, position };

  function buildMenu(groups) {
    menu.textContent = '';
    items = [];
    groupsMeta = [];
    searchInput = null;
    countEl = null;

    const total = groups.reduce((sum, group) => sum + group.options.length, 0);
    const searchable = total >= SEARCH_THRESHOLD;

    if (searchable) {
      const bar = document.createElement('div');
      bar.className = 'st-select-searchbar';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-magnifying-glass';
      icon.setAttribute('aria-hidden', 'true');
      searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.className = 'st-select-search';
      const isSubjectList = groups.some((group) => group.options.some((option) => splitSubjectLabel(option.text)));
      searchInput.placeholder = isSubjectList ? 'Tìm môn học theo tên hoặc mã…' : 'Tìm…';
      searchInput.autocomplete = 'off';
      searchInput.addEventListener('input', () => applyFilter(searchInput.value));
      bar.append(icon, searchInput);
      menu.appendChild(bar);
    }

    const list = document.createElement('div');
    list.className = 'st-select-list custom-scroll';
    list.addEventListener('click', (event) => {
      const el = event.target.closest('.st-select-option');
      const item = items.find((candidate) => candidate.el === el);
      if (!item || item.el.disabled) return;
      selectValue(item.value);
    });

    groups.forEach((group) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'st-select-group';
      if (group.label) {
        const header = document.createElement('div');
        header.className = 'st-select-group-label';
        header.textContent = group.label;
        wrapper.appendChild(header);
      }
      const groupItems = [];
      group.options.forEach((option) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'st-select-option';
        el.setAttribute('role', 'option');
        el.tabIndex = -1;
        const subject = splitSubjectLabel(option.text);
        const code = document.createElement('span');
        code.className = 'st-select-code';
        const name = document.createElement('span');
        name.className = 'st-select-name';
        name.textContent = subject ? subject.name : option.text;
        if (subject) {
          code.textContent = subject.code;
          el.append(code);
        } else {
          code.remove();
        }
        el.append(name);
        const check = document.createElement('i');
        check.className = 'fa-solid fa-check st-select-check';
        check.setAttribute('aria-hidden', 'true');
        el.appendChild(check);
        if (option.disabled) {
          el.disabled = true;
          el.classList.add('is-disabled');
        }
        const item = { el, value: option.value, text: option.text, nameEl: name, group: wrapper };
        wrapper.appendChild(el);
        items.push(item);
        groupItems.push(item);
      });
      groupsMeta.push({ el: wrapper, items: groupItems });
      list.appendChild(wrapper);
    });

    emptyEl = document.createElement('div');
    emptyEl.className = 'st-select-empty';
    emptyEl.textContent = 'Không có lựa chọn nào khớp.';
    emptyEl.hidden = true;
    list.appendChild(emptyEl);
    menu.appendChild(list);

    const footer = document.createElement('div');
    footer.className = 'st-select-footer';
    countEl = document.createElement('span');
    footer.appendChild(countEl);
    menu.appendChild(footer);

    applyFilter('');
  }

  function applyFilter(query) {
    const needle = foldText(query).trim();
    let visible = 0;
    items.forEach((item) => {
      const hit = !needle || foldText(item.text).includes(needle) || foldText(item.value).includes(needle);
      item.el.hidden = !hit;
      if (hit) visible += 1;
      paintHighlight(item, query);
    });
    groupsMeta.forEach((group) => {
      group.el.hidden = !group.items.some((item) => !item.el.hidden);
    });
    if (emptyEl) emptyEl.hidden = visible !== 0;
    if (countEl) countEl.textContent = `${visible}/${items.length} lựa chọn`;
  }

  function paintHighlight(item, query) {
    const raw = item.text.replace(/^[A-Z]{2}\d{3,6}\s*[·\-–]\s*/, '');
    const needle = String(query || '').trim();
    const index = needle ? item.nameEl.textContent.toLowerCase().indexOf(needle.toLowerCase()) : -1;
    if (needle && index >= 0) {
      const before = raw.slice(index, index + needle.length);
      item.nameEl.textContent = '';
      item.nameEl.append(
        raw.slice(0, index),
        Object.assign(document.createElement('mark'), { textContent: before }),
        raw.slice(index + needle.length)
      );
    } else {
      item.nameEl.textContent = raw;
    }
  }

  function markSelected() {
    items.forEach((item) => {
      const selected = item.value === select.value;
      item.el.setAttribute('aria-selected', selected ? 'true' : 'false');
      item.el.classList.toggle('is-selected', selected);
    });
  }

  function refresh() {
    const accent = getComputedStyle(control).getPropertyValue('--study-accent').trim();
    menu.style.setProperty('--study-accent', accent || 'var(--primary)');

    const groups = readGroups(select);
    const signature = groups
      .map((group) => `${group.label}|${group.options.map((option) => `${option.value}:${option.text}`).join(',')}`)
      .join('#');
    if (signature !== builtSignature) {
      buildMenu(groups);
      builtSignature = signature;
    }

    const selected = select.options[select.selectedIndex];
    valueText.textContent = selected ? selected.textContent.trim() : '';
    trigger.disabled = select.disabled;
    control.classList.toggle('is-disabled', select.disabled);
    markSelected();
    if (openEntry === entry) position();
  }

  function position() {
    const rect = control.getBoundingClientRect();
    if (!rect.height) {
      close();
      return;
    }
    const minWidth = searchInput ? 300 : 190;
    const width = Math.min(Math.max(rect.width, minWidth), window.innerWidth - VIEWPORT_PADDING * 2);
    const availableBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_PADDING;
    const availableAbove = rect.top - MENU_GAP - VIEWPORT_PADDING;
    const maxHeight = Math.max(160, Math.min(420, Math.max(availableBelow, availableAbove)));
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${maxHeight}px`;
    const openUp = availableBelow < Math.min(menu.scrollHeight, maxHeight) && availableAbove > availableBelow;
    menu.classList.toggle('is-up', openUp);
    menu.style.top = openUp ? '' : `${rect.bottom + MENU_GAP}px`;
    menu.style.bottom = openUp ? `${window.innerHeight - rect.top + MENU_GAP}px` : '';
    menu.style.left = `${Math.min(Math.max(VIEWPORT_PADDING, rect.left), window.innerWidth - width - VIEWPORT_PADDING)}px`;
  }

  function open() {
    if (trigger.disabled || !items.length) return;
    if (openEntry && openEntry !== entry) openEntry.close();
    installGlobals();
    menu.hidden = false;
    openEntry = entry;
    control.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    refresh();
    position();
    requestAnimationFrame(() => menu.classList.add('is-open'));
    if (searchInput) {
      searchInput.value = '';
      applyFilter('');
      searchInput.focus();
    }
    const selected = items.find((item) => item.value === select.value && !item.el.hidden);
    if (selected) selected.el.scrollIntoView({ block: 'nearest' });
  }

  function close({ focusTrigger = false } = {}) {
    menu.classList.remove('is-open');
    control.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    if (openEntry === entry) openEntry = null;
    window.setTimeout(() => {
      if (openEntry !== entry) menu.hidden = true;
    }, 170);
    if (focusTrigger) trigger.focus();
  }

  function selectValue(value) {
    const changed = select.value !== value;
    select.value = value;
    refresh();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    close({ focusTrigger: true });
  }

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    if (openEntry === entry) close({ focusTrigger: true });
    else open();
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  });

  menu.addEventListener('keydown', (event) => {
    const visible = items.filter((item) => !item.el.hidden && !item.el.disabled);
    if (!visible.length) return;
    const active = document.activeElement;
    const index = visible.findIndex((item) => item.el === active);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const forward = event.key === 'ArrowDown';
      const target = index < 0 ? (forward ? 0 : visible.length - 1) : (forward ? Math.min(index + 1, visible.length - 1) : Math.max(index - 1, 0));
      visible[target].el.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      visible[event.key === 'Home' ? 0 : visible.length - 1].el.focus();
    } else if (event.key === 'Enter' && active === searchInput) {
      event.preventDefault();
      selectValue(visible[0].value);
    } else if (event.key === 'Tab') {
      close();
    }
  });

  select.addEventListener('change', refresh);
  const observer = new MutationObserver(refresh);
  observer.observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'value', 'selected', 'aria-label']
  });

  return entry;
}

function installGlobals() {
  if (globalsInstalled) return;
  globalsInstalled = true;

  document.addEventListener('pointerdown', (event) => {
    if (!openEntry) return;
    if (openEntry.menu.contains(event.target) || openEntry.control.contains(event.target)) return;
    openEntry.close();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (openEntry && event.key === 'Escape') {
      event.preventDefault();
      openEntry.close({ focusTrigger: true });
    }
  }, true);

  window.addEventListener('resize', () => openEntry?.position());
  window.addEventListener('scroll', () => openEntry?.position(), true);
}
