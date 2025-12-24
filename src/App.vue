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
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, shallowRef, ref, computed, watch } from 'vue';
import SheetNext from 'sheetnext';
import 'sheetnext/dist/sheetnext.css';
import AiCopilot from './components/AiCopilot.vue';
import { deleteConversation, clearConversations } from './services/conversationApi.js';

const copilotRef = ref(null);

const sn = shallowRef(null);

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


watch(historyOpen, (open) => {
  if (open) refreshConversationRows();
});

onMounted(() => {
  const el = document.querySelector('#SNContainer');
  if (!el) return;
  sn.value = new SheetNext(el);

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
});

onBeforeUnmount(() => {
  stopRemoveObserver();
  if (typeof removeAiChatClickBlocker === 'function') removeAiChatClickBlocker();
  if (typeof restoreShowAiChat === 'function') restoreShowAiChat();
  const inst = sn.value;
  if (inst && typeof inst.destroy === 'function') inst.destroy();
  else if (inst && typeof inst.dispose === 'function') inst.dispose();
  sn.value = null;
});
</script>

<style scoped>
.layout {
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
</style>
