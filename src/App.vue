<template>
  <div class="layout" :class="{ 'is-collapsed': isCopilotCollapsed }" :style="layoutStyle">
    <main class="sheet">
      <div id="SNContainer" class="sn-container"></div>
    </main>

    <!-- gap + draggable handle -->
    <div
      class="resizer"
      role="separator"
      aria-orientation="vertical"
      :title="isCopilotCollapsed ? '驾驶舱已隐藏' : '拖拽调整驾驶舱宽度'"
      :class="{ 'resizer--disabled': isCopilotCollapsed }"
      @mousedown.prevent="onResizeStart"
    />

    <!-- cockpit area (panel + persistent sidebar) -->
    <section class="dock" aria-label="cockpit-dock">
      <!-- main panel (collapsible) -->
      <div v-show="!isCopilotCollapsed" class="dock__panel">
        <AiCopilot
          ref="copilotRef"
          class="copilot"
          :sheet="sn"
          :cockpit-id="activeCockpitId"
          @open-history="historyOpen = true"
        />
      </div>

      <!-- persistent sidebar (always visible) -->
      <aside class="dock__rail" aria-label="cockpit-rail">
        <button
          class="rail-btn"
          type="button"
          :title="isCopilotCollapsed ? '展开驾驶舱' : '隐藏驾驶舱'"
          @click="toggleCopilot"
        >
          🤖
        </button>
        <!-- 保存按钮移到 SheetNext 工具栏（见 injectWorkbookSaveButtonToSheetNextToolbar） -->
      </aside>
    </section>

    <el-dialog v-model="historyOpen" title="历史对话" width="820px">
      <div style="display:flex; gap:8px; justify-content:space-between; margin-bottom:10px">
        <div style="display:flex; gap:8px">
          <el-button type="danger" plain @click="onClearAllConversations">清空全部</el-button>
        </div>
      </div>

      <el-table :data="conversationRows" size="small" style="width: 100%" @row-click="onPickConversation">
        <el-table-column prop="id" label="会话 ID" width="100" />
        <el-table-column prop="title" label="标题" />
        <el-table-column prop="updatedAt" label="更新时间" width="210" />
        <el-table-column prop="createdAt" label="创建时间" width="210" />
        <el-table-column label="操作" width="90" align="center">
          <template #default="scope">
            <el-button size="small" type="danger" text @click.stop="onDeleteConversation(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center">
          <el-text type="info" size="small">点击表格行可加载该会话到右侧消息框</el-text>
          <el-button @click="historyOpen = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <div v-if="saveStatusText" class="save-status">{{ saveStatusText }}</div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, shallowRef, ref, computed, watch } from 'vue';
import SheetNext from 'sheetnext';
import 'sheetnext/dist/sheetnext.css';
import AiCopilot from './components/AiCopilot.vue';
import { deleteConversation, clearConversations } from './services/conversationApi.js';
import { getWorkbookLatest, saveWorkbookSnapshot } from './services/workbookStorageApi.js';

const copilotRef = ref(null);

const sn = shallowRef(null);

// Observers / disposers
let sheetTabCloseObserver = null;
let removeSaveBtnObserver = null;

// --- keep SheetNext layout intact; only disable built-in AI chat toggle ---
function markBuiltInSheetNextAiEntry(root = document) {
  try {
    const spans = Array.from(root.querySelectorAll('span'));
    for (const sp of spans) {
      const onclick = sp.getAttribute('onclick') || '';
      // target: <span onclick="SN_1.Layout.showAIChat=!SN_1.Layout.showAIChat" class="sn-cur">🤖</span>
      if (onclick.includes('Layout.showAIChat')) {
        sp.setAttribute('data-sn-ai-entry', '1');
      }
    }
  } catch {
    // ignore
  }
}

let snAiEntryObserver = null;
let restoreShowAiChat = null;
let removeAiChatClickBlocker = null;

function installAiChatClickBlocker(containerEl) {
  if (!containerEl || removeAiChatClickBlocker) return;
  const handler = (e) => {
    // Capture phase blocker: prevents inline onclick from firing.
    const target = e.target;
    if (!(target instanceof Element)) return;
    const el = target.closest?.('span[onclick*="Layout.showAIChat"], span[data-sn-ai-entry="1"]');
    if (!el) return;
    // IMPORTANT: don't stop propagation; SheetNext may rely on bubbling clicks
    // to update toolbar/fx layout. stopImmediatePropagation is enough to prevent
    // inline onclick from firing on the target element.
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  containerEl.addEventListener('click', handler, true);
  removeAiChatClickBlocker = () => {
    containerEl.removeEventListener('click', handler, true);
    removeAiChatClickBlocker = null;
  };
}

function disableSheetNextBuiltInAiChatToggle() {
  // SheetNext puts itself on window as SN_1 / SN_2 ...; we saw the built-in onclick uses SN_1.Layout.showAIChat
  // Goal: even if other UI actions (e.g. fx focus/click) toggle showAIChat, keep it disabled.
  try {
    const w = window;
    // Try all SN_* instances, not only SN_1..3
    const candidates = Object.keys(w)
      .filter((k) => /^SN_\d+$/.test(k))
      .map((k) => w[k])
      .filter(Boolean);
    // Fallback to a couple explicit names just in case
    if (candidates.length === 0) candidates.push(w?.SN_1, w?.SN_2, w?.SN_3);

    for (const snAny of candidates) {
      const layout = snAny?.Layout;
      if (!layout) continue;

      // best-effort: keep original in case component unmounts
      const originalDescriptor = Object.getOwnPropertyDescriptor(layout, 'showAIChat');
      const originalValue = layout.showAIChat;

      // Force it to always be false and non-writable (when possible)
      try {
        Object.defineProperty(layout, 'showAIChat', {
          configurable: true,
          enumerable: true,
          get() {
            return false;
          },
          set() {
            // ignore attempts to toggle
          },
        });
      } catch {
        // fallback if defineProperty fails: at least set false
        layout.showAIChat = false;
      }

      // Some builds may have a method that toggles this flag; neutralize it if present.
      if (typeof layout.showAIChatToggle === 'function') {
        layout.showAIChatToggle = () => {};
      }

      // store restore only once (best effort)
      if (!restoreShowAiChat) {
        restoreShowAiChat = () => {
          try {
            if (originalDescriptor) Object.defineProperty(layout, 'showAIChat', originalDescriptor);
            else layout.showAIChat = originalValue;
          } catch {
            // ignore restore failures
          }
          restoreShowAiChat = null;
        };
      }
    }
  } catch {
    // ignore
  }
}

function startRemoveObserver(containerEl) {
  if (!containerEl || snAiEntryObserver) return;
  snAiEntryObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes || []) {
        if (!(node instanceof HTMLElement)) continue;
        markBuiltInSheetNextAiEntry(node);
      }
    }
  });
  snAiEntryObserver.observe(containerEl, { childList: true, subtree: true });
}

function stopRemoveObserver() {
  if (snAiEntryObserver) {
    snAiEntryObserver.disconnect();
    snAiEntryObserver = null;
  }
}

const MIN = 320;
const MAX = 720;
const RAIL_W = 36; // persistent sidebar width

const copilotWidth = ref(loadWidth());
const isCopilotCollapsed = ref(loadCollapsed());

const cockpits = ref(loadCockpits());
const activeCockpitId = computed(() => cockpits.value[cockpits.value.length - 1] || 'default');

const layoutStyle = computed(() => {
  const panelW = isCopilotCollapsed.value ? 0 : copilotWidth.value;
  return {
    '--rail-width': `${RAIL_W}px`,
    '--panel-width': `${panelW}px`,
  };
});

function clamp(n) {
  return Math.max(MIN, Math.min(MAX, n));
}

function loadWidth() {
  const raw = localStorage.getItem('copilot.width');
  const n = raw ? Number(raw) : 420;
  return Number.isFinite(n) ? clamp(n) : 420;
}

function saveWidth() {
  localStorage.setItem('copilot.width', String(copilotWidth.value));
}

function loadCollapsed() {
  return localStorage.getItem('copilot.collapsed') === '1';
}

function saveCollapsed() {
  localStorage.setItem('copilot.collapsed', isCopilotCollapsed.value ? '1' : '0');
}

function loadCockpits() {
  try {
    const raw = localStorage.getItem('cockpits.ids');
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch {}
  return ['cockpit-1'];
}

function saveCockpits() {
  localStorage.setItem('cockpits.ids', JSON.stringify(cockpits.value));
}

function toggleCopilot() {
  isCopilotCollapsed.value = !isCopilotCollapsed.value;
  saveCollapsed();
}

function createCockpit() {
  const id = `cockpit-${Date.now()}`;
  cockpits.value = [...cockpits.value, id];
  saveCockpits();
  isCopilotCollapsed.value = false;
  saveCollapsed();
}

let dragging = false;

function onResizeStart(e) {
  if (isCopilotCollapsed.value) return;

  dragging = true;
  const startX = e.clientX;
  const startW = copilotWidth.value;

  const onMove = (ev) => {
    if (!dragging) return;
    const dx = startX - ev.clientX;
    copilotWidth.value = clamp(startW + dx);
  };

  const onUp = () => {
    dragging = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    saveWidth();
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

const historyOpen = ref(false);
const conversationRows = ref([]);

async function refreshConversationRows() {
  try {
    const rows = await copilotRef.value?.listConversations?.();
    conversationRows.value = Array.isArray(rows) ? rows : [];
  } catch (e) {
    conversationRows.value = [];
  }
}

async function onPickConversation(row) {
  if (!row?.id) return;
  // 关键：确保 copilotRef 已就绪
  await copilotRef.value?.loadConversationById?.(row.id);
  historyOpen.value = false;
}

async function onDeleteConversation(row) {
  if (!row?.id) return;
  await deleteConversation(row.id);
  await refreshConversationRows();
}

async function onClearAllConversations() {
  await clearConversations();
  await refreshConversationRows();
}

// NOTE: The file accidentally contained duplicated blocks (workbook persistence + sheet tab close helpers)
// due to iterative edits. Keep only ONE implementation of:
// - safeGetSheetNameFromTabEl
// - installSheetCloseButtons
// - uninstallSheetCloseButtons
// - WORKBOOK_KEY + persistence state (workbookVersion, lastSavedHash, timers)
// - stableHashJson / scheduleWorkbookSave / persistWorkbookNow / restoreWorkbookOnce
// Remove the duplicated copies below.

// (The following duplicated sections have been removed.)

function safeGetSheetNameFromTabEl(tabEl) {
  if (!tabEl) return null;
  // Try common patterns: data-name / title / text
  const dataName = tabEl.getAttribute?.('data-name') || tabEl.getAttribute?.('data-sheet') || tabEl.getAttribute?.('data-sheet-name');
  if (dataName) return String(dataName).trim();

  const title = tabEl.getAttribute?.('title');
  if (title) return String(title).trim();

  const text = tabEl.textContent;
  if (text) {
    // tab text may include close icon; keep only first token-like name
    return String(text).replace(/\s+/g, ' ').trim();
  }
  return null;
}

function installSheetTabCloseButtons(snInstance, containerEl, { onClosed } = {}) {
  if (!snInstance || !containerEl) return;

  const utils = snInstance?.Utils || snInstance?.utils;

  const injectOnce = () => {
    // Heuristics for SheetNext tab strip root
    const roots = [
      containerEl.querySelector('.sn-sheet-tab'),
      containerEl.querySelector('.sn-sheet-tabs'),
      containerEl.querySelector('.sn-sheetbar'),
      containerEl.querySelector('.sn-sheet'),
      containerEl.querySelector('[class*="sheet"][class*="tab"]'),
    ].filter(Boolean);

    const root = roots[0];
    if (!root) return;

    // candidate tab items
    const tabs = Array.from(
      root.querySelectorAll('[data-sheet-name], [data-name], .sn-sheet-item, .sn-sheet-tab-item, li, .sn-tab, .sn-sheet-name')
    );

    for (const t of tabs) {
      if (!(t instanceof HTMLElement)) continue;
      // avoid injecting into container lists; only leaf-ish nodes
      if (t.querySelector?.('.snx-close-btn')) continue;

      // Create close button
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'snx-close-btn';
      btn.textContent = '×';
      btn.title = '关闭工作表';

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const name = safeGetSheetNameFromTabEl(t);
        if (!name) return;

        // Confirm
        if (utils?.modal) {
          try {
            await utils.modal({
              title: '关闭工作表',
              content: `确定要关闭工作表 “${name}” 吗？`,
              confirmText: '关闭',
              cancelText: '取消',
            });
          } catch {
            return;
          }
        }

        try {
          // simplest: call instance.delSheet
          if (typeof snInstance?.delSheet === 'function') {
            snInstance.delSheet(name);
            snInstance?.render?.();
            snInstance?.refresh?.();
            if (typeof snInstance?.r === 'function') snInstance.r();
          }
          onClosed?.(name);
        } catch {
          // ignore
        }
      });

      t.appendChild(btn);
      t.classList.add('snx-tab-with-close');
    }
  };

  injectOnce();

  sheetTabCloseObserver = new MutationObserver(() => injectOnce());
  sheetTabCloseObserver.observe(containerEl, { childList: true, subtree: true });
}

function uninstallSheetTabCloseButtons() {
  if (sheetTabCloseObserver) {
    sheetTabCloseObserver.disconnect();
    sheetTabCloseObserver = null;
  }
  // best-effort remove injected buttons
  try {
    document.querySelectorAll('#SNContainer .snx-close-btn').forEach((b) => b.remove());
  } catch {
    // ignore
  }
}

// ======================
// Workbook persistence (server-side)
// Workaround: sheetnext@0.1.9 may return {} for getData(),
// so we persist a "sheetnext-lite" snapshot by reading cell values.
// ======================
const WORKBOOK_KEY = 'default';
let workbookSaveTimer = null;
let workbookVersion = 0;
let lastSavedHash = '';
let workbookPollTimer = null;
let saveInFlight = false;
let saveQueued = false;

function stableHashJson(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return '';
  }
}

function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function isLiteSnapshot(data) {
  return isPlainObject(data) && data.__format === 'sheetnext-lite' && Array.isArray(data.sheets);
}

function workbookSnapshotFromSheets(wb) {
  try {
    const sheets = Array.isArray(wb?.sheets) ? wb.sheets : Array.isArray(wb?.workbook?.sheets) ? wb.workbook.sheets : [];
    const activeSheetName = wb?.activeSheet?.name || sheets?.[0]?.name || 'Sheet1';

    const out = {
      __format: 'sheetnext-lite',
      workbookName: typeof wb?.workbookName === 'string' ? wb.workbookName : 'SheetNext',
      activeSheetName,
      sheets: [],
      ts: Date.now(),
    };

    for (const s of sheets) {
      if (!s) continue;
      const name = String(s?.name || 'Sheet');

      // Bound the snapshot to keep payload reasonable.
      const maxR = 200;
      const maxC = 50;

      const table = [];
      for (let r = 0; r < maxR; r++) {
        const row = [];
        let rowHasAny = false;
        for (let c = 0; c < maxC; c++) {
          let v = '';
          try {
            const cell = typeof s.getCell === 'function' ? s.getCell(r, c) : s?.rows?.[r]?.cells?.[c];
            v = cell?.editVal ?? cell?.showVal ?? '';
          } catch {
            v = '';
          }
          if (v == null) v = '';
          if (v !== '') rowHasAny = true;
          row.push(v);
        }
        table.push(row);
        // small optimization: stop if we have a long tail of empty rows
        if (!rowHasAny && r > 30) {
          const tailEmpty = table.slice(-10).every((rr) => rr.every((x) => x === '' || x == null));
          if (tailEmpty) break;
        }
      }

      // Trim empty trailing rows
      while (table.length && table[table.length - 1].every((x) => x === '' || x == null)) table.pop();

      // Trim empty trailing columns (based on all rows)
      let maxUsedC = 0;
      for (const rr of table) {
        for (let c = rr.length - 1; c >= 0; c--) {
          if (rr[c] !== '' && rr[c] != null) {
            maxUsedC = Math.max(maxUsedC, c + 1);
            break;
          }
        }
      }
      for (const rr of table) rr.length = Math.max(0, maxUsedC);

      out.sheets.push({
        name,
        hidden: !!s.hidden,
        defaultRowHeight: typeof s.defaultRowHeight === 'number' ? s.defaultRowHeight : null,
        defaultColWidth: typeof s.defaultColWidth === 'number' ? s.defaultColWidth : null,
        table,
      });
    }

    return out;
  } catch {
    return { __format: 'sheetnext-lite', workbookName: 'SheetNext', activeSheetName: 'Sheet1', sheets: [], ts: Date.now() };
  }
}

function getWorkbookDataBestEffort(wb) {
  // Prefer native getData if it returns non-empty object
  try {
    if (typeof wb?.getData === 'function') {
      const d = wb.getData();
      if (isPlainObject(d) && Object.keys(d).length) return d;
    }
  } catch {}

  // Some builds wrap the workbook
  try {
    const alt = wb?.workbook || wb?.Workbook || wb?.core || wb?.app;
    if (alt && typeof alt.getData === 'function') {
      const d = alt.getData();
      if (isPlainObject(d) && Object.keys(d).length) return d;
    }
  } catch {}

  // Fallback to our lite snapshot
  return workbookSnapshotFromSheets(wb);
}

function scheduleWorkbookSave() {
  if (!sn.value) return;
  if (workbookSaveTimer) clearTimeout(workbookSaveTimer);
  workbookSaveTimer = setTimeout(() => {
    workbookSaveTimer = null;
    persistWorkbookNow().catch(() => {});
  }, 800);
}

async function persistWorkbookNow(force = false) {
  if (saveInFlight) {
    saveQueued = saveQueued || force;
    return;
  }
  saveInFlight = true;
  try {
    const wb = sn.value;
    if (!wb) return;

    const data = getWorkbookDataBestEffort(wb);
    if (!isPlainObject(data)) return;

    const hash = stableHashJson(data);
    if (!hash) return;
    if (!force && hash === lastSavedHash) return;

    try {
      const resp = await saveWorkbookSnapshot({ workbookKey: WORKBOOK_KEY, data, version: workbookVersion });
      workbookVersion = Number(resp?.version) || workbookVersion;
      lastSavedHash = hash;
    } catch (e) {
      if (e?.status === 409 && e?.data?.error === 'version conflict') {
        const serverVer = Number(e?.data?.currentVersion);
        if (Number.isFinite(serverVer)) workbookVersion = serverVer;
        const resp2 = await saveWorkbookSnapshot({ workbookKey: WORKBOOK_KEY, data, version: workbookVersion });
        workbookVersion = Number(resp2?.version) || workbookVersion;
        lastSavedHash = hash;
      } else {
        throw e;
      }
    }
  } finally {
    saveInFlight = false;
    const queuedForce = saveQueued;
    saveQueued = false;
    if (queuedForce) setTimeout(() => persistWorkbookNow(true).catch(() => {}), 0);
  }
}

async function applyLiteSnapshot(wb, snap) {
  if (!wb || !isLiteSnapshot(snap)) return;

  const ensureSheet = (name) => {
    try {
      if (typeof wb.getSheetByName === 'function') {
        const s = wb.getSheetByName(name);
        if (s) return s;
      }
      if (typeof wb.addSheet === 'function') return wb.addSheet(name);
    } catch {}
    return null;
  };

  for (const s0 of snap.sheets) {
    const name = String(s0?.name || 'Sheet');
    const sheet = ensureSheet(name);
    if (!sheet) continue;

    try {
      if (typeof s0.defaultRowHeight === 'number') sheet.defaultRowHeight = s0.defaultRowHeight;
      if (typeof s0.defaultColWidth === 'number') sheet.defaultColWidth = s0.defaultColWidth;
      sheet.hidden = !!s0.hidden;
    } catch {}

    const table = Array.isArray(s0.table) ? s0.table : [];
    if (!table.length) continue;

    if (typeof sheet.insertTable === 'function') {
      try {
        sheet.insertTable(table, 'A1');
        continue;
      } catch {
        // fallback below
      }
    }

    // Fallback: cell loop
    for (let r = 0; r < table.length; r++) {
      const row = table[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        try {
          const cell = sheet.getCell(r, c);
          cell.editVal = row[c];
        } catch {}
      }
    }
  }

  // Activate sheet
  try {
    if (snap.activeSheetName && typeof wb.setActiveSheet === 'function') wb.setActiveSheet(snap.activeSheetName);
  } catch {}

  try {
    if (typeof wb.r === 'function') wb.r();
    else {
      wb?.render?.();
      wb?.refresh?.();
    }
  } catch {}
}

async function restoreWorkbookOnce() {
  const wb = sn.value;
  if (!wb) return;

  try {
    const latest = await getWorkbookLatest();
    if (!latest || !latest.data) return;

    workbookVersion = Number(latest.version) || 0;

    // Lite snapshot: restore by rebuilding cells
    if (isLiteSnapshot(latest.data)) {
      await applyLiteSnapshot(wb, latest.data);
      lastSavedHash = stableHashJson(getWorkbookDataBestEffort(wb));
      return;
    }

    // Prefer native setData when available
    const target = typeof wb.setData === 'function' ? wb : wb.workbook || wb.Workbook || wb?.core || wb?.app;
    if (target && typeof target.setData === 'function') {
      const res = target.setData(latest.data);
      if (res === false) {
        try {
          wb?.Utils?.msg?.('恢复失败：JSON格式不正确或版本不匹配');
        } catch {}
        return;
      }
      lastSavedHash = stableHashJson(getWorkbookDataBestEffort(wb));
    }
  } catch (e) {
    console.warn('[workbook restore] failed:', e);
  }
}

function injectWorkbookSaveButtonToSheetNextToolbar(containerEl) {
  if (!containerEl) return () => {};

  const injectOnce = () => {
    const toolbars = [
      containerEl.querySelector('.sn-toolbar'),
      containerEl.querySelector('.sn-tool'),
      containerEl.querySelector('[class*="toolbar"]'),
    ].filter(Boolean);

    const root = toolbars[0];
    if (!root) return;

    if (root.querySelector('.snx-save-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'snx-save-btn';
    btn.title = '保存';
    btn.textContent = '💾';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveStatusText.value = '正在保存…';
      persistWorkbookNow(true)
        .then(() => {
          saveStatusText.value = '已保存';
          setTimeout(() => (saveStatusText.value = ''), 1500);
        })
        .catch((err) => {
          console.warn('[manual save] failed:', err);
          saveStatusText.value = '保存失败';
          setTimeout(() => (saveStatusText.value = ''), 2000);
        });
    });

    // Put it at the left
    root.prepend(btn);
  };

  injectOnce();
  const obs = new MutationObserver(() => injectOnce());
  obs.observe(containerEl, { childList: true, subtree: true });
  return () => obs.disconnect();
}

watch(historyOpen, (open) => {
  if (open) refreshConversationRows();
});

onMounted(() => {
  const el = document.querySelector('#SNContainer');
  if (!el) return;
  sn.value = new SheetNext(el);
  window.sn = sn.value;

  // Wait for SheetNext internal init before calling getData/setData.
  (async () => {
    await waitTwoFrames();

    // Restore workbook content from server snapshot (best-effort) before user edits.
    await restoreWorkbookOnce();

    // Start auto-saving after restore attempt.
    if (workbookPollTimer) clearInterval(workbookPollTimer);
    workbookPollTimer = setInterval(() => {
      try {
        const wb = sn.value;
        const data = getWorkbookDataBestEffort(wb);
        const hash = stableHashJson(data);
        if (hash && hash !== lastSavedHash) scheduleWorkbookSave();
      } catch {
        // ignore
      }
    }, 1500);

    // After initial render settles, do one immediate save so a refresh won't lose the new workbook.
    try {
      await persistWorkbookNow(true);
    } catch {
      // ignore
    }
  })();

  // 将保存按钮放到 SheetNext 工具栏
  try {
    const cleanup = injectWorkbookSaveButtonToSheetNextToolbar(el);
    if (typeof cleanup === 'function') removeSaveBtnObserver = cleanup;
  } catch {
    // ignore
  }

  // Dev helper: expose instance for console debugging / tool verification
  try {
    window.__sn = sn.value;
  } catch {
    // ignore
  }

  // Disable built-in AI chat behavior at the source
  disableSheetNextBuiltInAiChatToggle();

  // Block click on the built-in entry if it exists, without changing layout
  installAiChatClickBlocker(el);

  // mark once immediately + keep marking if SheetNext re-inserts
  markBuiltInSheetNextAiEntry(el);
  startRemoveObserver(el);

  // One more mark pass next frame in case SheetNext injects toolbar items asynchronously.
  requestAnimationFrame(() => {
    markBuiltInSheetNextAiEntry(el);
  });

  // --- Default sheet look & feel ---
  try {
    const s = sn.value?.activeSheet;
    if (s) {
      // Clear any accidental default merges
      try {
        if (Array.isArray(s.merges) && s.merges.length) s.merges = [];
        // best-effort: unmerge the top-left cell in case a big merge exists
        if (typeof s.unMergeCells === 'function') {
          try { s.unMergeCells('A1'); } catch {}
        }
      } catch {
        // ignore
      }

      // Default metrics
      s.defaultRowHeight = 19.5;
      s.defaultColWidth = 110;

      // Mild default header styling (best-effort; doesn't assume too much)
      // Make first row look like a header if it exists.
      if (typeof s.getRow === 'function') {
        try {
          const r0 = s.getRow(0);
          if (r0) {
            r0.height = 26;
            r0.font = { ...(r0.font || {}), bold: true };
            r0.fill = { ...(r0.fill || {}), fgColor: '#F5F7FA' };
            r0.alignment = { ...(r0.alignment || {}), horizontal: 'center', vertical: 'middle' };
          }
        } catch {
          // ignore
        }
      }
    }

    // Rerender once after applying defaults
    if (typeof sn.value?.r === 'function') sn.value.r();
    else {
      sn.value?.render?.();
      sn.value?.refresh?.();
    }
  } catch {
    // ignore
  }

  // After initial render settles, do one immediate save so a refresh won't lose the new workbook.
  // (Also fixes "first save not happening" for users who open and immediately refresh.)
  (async () => {
    try {
      await waitTwoFrames();
      await persistWorkbookNow();
    } catch {
      // ignore
    }
  })();

  // Install close buttons on bottom sheet tabs (DOM injection, best-effort).
  try {
    installSheetTabCloseButtons(sn.value, el, {
      onClosed: () => {
        // keep AI cockpit anchor in sync if visible
        try {
          copilotRef.value?.refreshAnchorFromSelection?.();
        } catch {}
      },
    });
  } catch {
    // ignore
  }
});

onBeforeUnmount(() => {
  if (typeof removeSaveBtnObserver === 'function') removeSaveBtnObserver();
  removeSaveBtnObserver = null;
  if (workbookSaveTimer) clearTimeout(workbookSaveTimer);
  if (workbookPollTimer) {
    clearInterval(workbookPollTimer);
    workbookPollTimer = null;
  }
  persistWorkbookNow().catch(() => {});
  stopRemoveObserver();
  if (typeof removeAiChatClickBlocker === 'function') removeAiChatClickBlocker();
  if (typeof restoreShowAiChat === 'function') restoreShowAiChat();
  const inst = sn.value;
  if (inst && typeof inst.destroy === 'function') inst.destroy();
  else if (inst && typeof inst.dispose === 'function') inst.dispose();
  sn.value = null;

  uninstallSheetTabCloseButtons();
});

// Save UI
const saveStatusText = ref('');

async function onManualSave() {
  saveStatusText.value = '正在保存…';
  try {
    await persistWorkbookNow(true);
    saveStatusText.value = '已保存';
  } catch (e) {
    const keys = e?.data?.hint?.keys;
    if (Array.isArray(keys) && keys.length) {
      console.warn('[workbook save] invalid workbook data keys:', keys);
      saveStatusText.value = `保存失败：invalid workbook data（keys: ${keys.join(', ')}）`;
    } else {
      console.warn('[workbook save] failed:', e);
      saveStatusText.value = `保存失败：${String(e?.message || e)}`;
    }
  }
  setTimeout(() => {
    if (saveStatusText.value) saveStatusText.value = '';
  }, 2500);
}

async function waitTwoFrames() {
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => requestAnimationFrame(() => r()));
}
</script>

<style scoped>
.layout {
  /* ensure CSS vars exist for tooling/build analyzers */
  --rail-width: 36px;
  --panel-width: 420px;

  width: 100vw;
  height: 100vh;
  display: grid;
  /* 第三列专门给驾驶舱（panel + rail），保证 rail 永远在最右 */
  grid-template-columns: 1fr 12px calc(var(--panel-width, 420px) + var(--rail-width, 36px));
  overflow: hidden;
}

.sheet {
  padding: 0 7px 7px;
  box-sizing: border-box;
  overflow: hidden;
}

.sn-container {
  width: 100%;
  height: 100%;
}

.resizer {
  cursor: col-resize;
  background: rgba(0, 0, 0, 0.02);
  position: relative;
}

.resizer::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.06);
}

.resizer:hover {
  background: rgba(64, 158, 255, 0.06);
}

.resizer:hover::before {
  background: rgba(64, 158, 255, 0.65);
}

.resizer--disabled {
  cursor: default;
  background: rgba(0, 0, 0, 0.01);
}

.resizer--disabled::before,
.resizer--disabled:hover::before {
  background: rgba(0, 0, 0, 0.03);
}

.dock {
  width: calc(var(--panel-width, 420px) + var(--rail-width, 36px));
  height: 100%;
  display: flex;
  overflow: hidden;
  justify-self: end;
  align-items: stretch;
}

.dock__panel {
  height: 100%;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex: 1;
  width: var(--panel-width, 420px);
}

.dock__rail {
  flex: 0 0 var(--rail-width, 36px);
  height: 100%;
  border-left: 1px solid rgba(0, 0, 0, 0.06);
  background: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 4px;
  gap: 8px;
  box-sizing: border-box;
  width: var(--rail-width, 36px);
  justify-content: flex-start;
  position: relative;
}

.rail-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  font-size: 14px;
  line-height: 1;
  border-radius: 7px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #ffffff;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.72);
}

.rail-btn:hover {
  border-color: rgba(64, 158, 255, 0.75);
  color: rgba(64, 158, 255, 0.95);
}

.copilot {
  height: 100%;
  width: 100%;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.snx-close-btn {
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  margin-left: 4px;
  padding: 0;
  border: none;
  background: none;
  color: rgba(0, 0, 0, 0.54);
  font-size: 16px;
  line-height: 1;
}

.snx-close-btn:hover {
  color: rgba(64, 158, 255, 0.85);
}

.snx-tab-with-close {
  position: relative;
  padding-right: 20px;
}

.snx-tab-with-close .snx-close-btn {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
}

.save-status {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.08);
  padding: 4px 8px;
  border-radius: 8px;
  white-space: nowrap;
}

:global(.snx-save-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 6px;
  font-size: 14px;
  line-height: 1;
  user-select: none;
}

:global(.snx-save-btn:hover) {
  filter: brightness(1.05);
}
</style>
