<template>
  <div class="layout" :class="{ 'is-collapsed': isCopilotCollapsed }" :style="layoutStyle">
    <main class="sheet">
      <div id="SNContainer" class="sn-container"></div>
    </main>

    <!-- draggable resizer (only when expanded) -->
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
      <div v-if="!isCopilotCollapsed" class="dock__panel">
        <AiCopilot
          ref="copilotRef"
          class="copilot"
          :sheet="sn"
          :cockpit-id="activeCockpitId"
          @toggle-collapse="toggleCopilot"
          @create-cockpit="createCockpit"
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

        <button class="rail-btn" type="button" title="设置" @click="openSettingsFromRail">⚙</button>

        <button class="rail-btn" type="button" title="新建驾驶舱" @click="createCockpit">+</button>

        <button class="rail-btn" type="button" title="历史对话" @click="historyOpen = true">🕘</button>
      </aside>
    </section>

    <el-dialog v-model="historyOpen" title="历史对话" width="720px">
      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="（占位）这里后续接入每个驾驶舱的会话列表与消息预览。当前先展示已创建的驾驶舱实例。"
        style="margin-bottom: 12px"
      />

      <el-table :data="cockpitRows" size="small" style="width: 100%">
        <el-table-column prop="id" label="驾驶舱 ID" />
        <el-table-column prop="createdAt" label="创建时间" width="210" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, shallowRef, ref, computed } from 'vue';
import SheetNext from 'sheetnext';
import 'sheetnext/dist/sheetnext.css';
import AiCopilot from './components/AiCopilot.vue';

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

const cockpitRows = computed(() =>
  cockpits.value
    .slice()
    .reverse()
    .map((id) => ({
      id,
      createdAt: formatIdTime(id),
    })),
);

function formatIdTime(id) {
  const m = String(id).match(/cockpit-(\d+)/);
  if (!m) return '';
  const ts = Number(m[1]);
  if (!Number.isFinite(ts)) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

const copilotRef = ref(null);

async function openSettingsFromRail() {
  if (isCopilotCollapsed.value) {
    isCopilotCollapsed.value = false;
    saveCollapsed();
    // 等待驾驶舱组件挂载
    await Promise.resolve();
  }
  copilotRef.value?.openSettings?.();
}

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
  grid-template-columns: 1fr 6px calc(var(--panel-width, 420px) + var(--rail-width, 36px));
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
  background: transparent;
  position: relative;
}

.resizer::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(0, 0, 0, 0.06);
}

.resizer:hover::before {
  background: rgba(64, 158, 255, 0.65);
}

.resizer--disabled {
  cursor: default;
}

.resizer--disabled::before,
.resizer--disabled:hover::before {
  background: rgba(0, 0, 0, 0.03);
}

.dock {
  width: calc(var(--panel-width, 420px) + var(--rail-width, 36px));
  height: 100%;
  display: grid;
  grid-template-columns: var(--panel-width, 420px) var(--rail-width, 36px);
  overflow: hidden;
  justify-self: end;
}

.dock__panel {
  height: 100%;
  min-width: 0;
}

.dock__rail {
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
  min-width: 280px;
}
</style>
