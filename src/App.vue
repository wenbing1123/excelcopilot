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
});

onBeforeUnmount(() => {
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
