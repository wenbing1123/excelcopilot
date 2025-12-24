<template>
  <aside class="copilot" aria-label="AI 驾驶舱">
    <!-- Top toolbar -->
    <header class="topbar">
      <div class="topbar__left">
        <div class="app-title">驾驶舱</div>
      </div>

      <div class="topbar__right">
        <!-- Clear icon -->
        <el-tooltip content="清空" placement="bottom">
          <el-button
            size="small"
            circle
            text
            type="danger"
            :disabled="messages.length === 0"
            @click="clear"
            aria-label="清空"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </el-tooltip>

        <!-- 移除：顶部设置按钮（改由右侧侧边栏打开） -->
      </div>
    </header>

    <!-- Settings dialog (left menu + right config) -->
    <el-dialog v-model="settingsOpen" title="设置" width="860px" :close-on-click-modal="false">
      <div class="settings">
        <aside class="settings__menu">
          <el-menu :default-active="settingsSection" @select="(k) => (settingsSection = k)" class="settings__menuInner">
            <el-menu-item index="general">通用设置</el-menu-item>
            <el-menu-item index="models">模型设置</el-menu-item>
            <el-menu-item index="tools">工具配置</el-menu-item>
            <el-menu-item index="memory">记忆设置</el-menu-item>
            <el-menu-item index="others">其它设置</el-menu-item>
          </el-menu>
        </aside>

        <section class="settings__main">
          <template v-if="settingsSection === 'general'">
            <el-alert type="info" show-icon :closable="false" title="通用设置（占位）后续可放默认模式/默认模型/快捷键等" />
          </template>

          <template v-else-if="settingsSection === 'models'">
            <el-alert
              type="info"
              show-icon
              :closable="false"
              title="为每个 LLM 配置 api-key 和 base-url；base-url 留空将使用官方默认。"
              style="margin-bottom: 12px"
            />

            <div style="display:flex; gap:12px; align-items:center; margin-bottom: 8px">
              <el-text type="info">选择模型：</el-text>
              <el-segmented v-model="activeProvider" :options="providerOptions" />
            </div>

            <el-form label-position="top" size="default">
              <el-form-item label="API Key">
                <el-input v-model="llmConfig.providers[activeProvider].apiKey" type="password" show-password placeholder="sk-..." />
              </el-form-item>
              <el-form-item label="Base URL（可空，使用默认）">
                <el-input v-model="llmConfig.providers[activeProvider].baseUrl" :placeholder="providerDefaults[activeProvider].baseUrl" />
              </el-form-item>
              <el-text type="info" size="small">默认：{{ providerDefaults[activeProvider].baseUrl }} / model={{ providerDefaults[activeProvider].model }}</el-text>
            </el-form>
          </template>

          <template v-else-if="settingsSection === 'tools'">
            <el-alert type="info" show-icon :closable="false" title="工具配置（占位）后续可放 sheet 工具、文件检索工具等" />
          </template>

          <template v-else-if="settingsSection === 'memory'">
            <el-alert type="info" show-icon :closable="false" title="记忆设置（占位）后续可放长期记忆/会话总结等" />
          </template>

          <template v-else-if="settingsSection === 'others'">
            <el-alert type="info" show-icon :closable="false" title="其它设置（占位）" />
          </template>
        </section>
      </div>

      <template #footer>
        <div style="display:flex; gap:8px; justify-content:flex-end; width:100%">
          <el-button @click="resetConfig">重置</el-button>
          <el-button type="primary" @click="saveConfig">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Middle chat -->
    <section class="chat" aria-label="chat-history">
      <el-scrollbar ref="scrollbarRef" class="chat__scroll">
        <div v-if="messages.length === 0" class="empty">
          <el-empty description="开始对话吧" :image-size="72" />
        </div>

        <div v-else class="chat__list">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="row"
            :class="{
              'row--user': msg.role === 'user',
              'row--assistant': msg.role === 'assistant',
              'row--system': msg.role === 'system',
            }"
          >
            <div class="bubble">
              <div class="bubble__meta">
                <el-tag :type="tagType(msg.role)" size="small" effect="plain">{{ msg.role }}</el-tag>
                <span class="time">{{ formatTime(msg.createdAt) }}</span>
              </div>
              <div class="bubble__content">{{ msg.content }}</div>
            </div>
          </div>
          <div ref="bottomRef" style="height: 1px" />
        </div>
      </el-scrollbar>
    </section>

    <!-- Bottom composer -->
    <footer class="composer" aria-label="composer">
      <div class="composer__box">
        <!-- context summary (above input) -->
        <div class="context context--inline">
          <div class="context__left">
            <el-tooltip content="当前 Sheet" placement="top" :disabled="contextScope !== 'sheet'">
              <el-button
                size="small"
                :type="contextScope === 'sheet' ? 'primary' : 'default'"
                plain
                circle
                @click="contextScope = 'sheet'"
                aria-label="上下文：当前 Sheet"
              >
                <el-icon><Document /></el-icon>
              </el-button>
            </el-tooltip>

            <el-tooltip content="整个 Excel" placement="top" :disabled="contextScope !== 'workbook'">
              <el-button
                size="small"
                :type="contextScope === 'workbook' ? 'primary' : 'default'"
                plain
                circle
                @click="contextScope = 'workbook'"
                aria-label="上下文：整个 Excel"
              >
                <el-icon><Folder /></el-icon>
              </el-button>
            </el-tooltip>

            <div class="context__current">
              <el-text type="info" size="small">当前选择：</el-text>
              <el-tag size="small" effect="plain" type="info">（占位）暂无 selection API</el-tag>
            </div>
          </div>

          <div class="context__right">
            <el-text type="info" size="small">{{ pickedHint }}</el-text>
          </div>
        </div>

        <el-input
          v-model="draft"
          type="textarea"
          :rows="3"
          resize="none"
          placeholder="输入内容（Enter 发送，Shift+Enter 换行）"
          @keydown.enter.exact.prevent="send()"
          @keydown.enter.shift.stop
        />

        <!-- controls under input -->
        <div class="composer__controls">
          <div class="left">
            <!-- 模式最左 -->
            <el-select v-model="mode" size="small" class="mode" placeholder="模式">
              <el-option v-for="m in modes" :key="m" :label="m" :value="m" />
            </el-select>

            <!-- 模型紧跟其后 -->
            <el-select v-model="model" size="small" class="model" placeholder="模型">
              <el-option v-for="m in models" :key="m" :label="m" :value="m" />
            </el-select>

            <el-text v-if="mode === '编辑'" type="warning" size="small" class="edit-hint">
              help / set A1 1 / read A1
            </el-text>
          </div>

          <!-- 发送最右 -->
          <div class="right">
            <el-button type="primary" @click="send" :disabled="!draft.trim()">发送</el-button>
          </div>
        </div>

        <div v-if="requesting" style="margin-top: 6px">
          <el-text type="info" size="small">正在请求 {{ model }} …</el-text>
        </div>
      </div>
    </footer>
  </aside>
</template>

<script setup>
import { ref, computed, nextTick, watch, reactive } from 'vue';
import { Document, Folder, Setting, Delete, Fold } from '@element-plus/icons-vue';
import {
  loadLlmConfig,
  saveLlmConfig as persistLlmConfig,
  getDefaultConfig,
  getProviderDefaults,
  chatCompletion,
  PROVIDERS,
} from '../services/llmClient.js';

const emit = defineEmits(['toggle-collapse']);

// SheetNext 实例（由 App.vue 传入）
const props = defineProps({
  sheet: { type: Object, default: null },
  cockpitId: { type: String, default: '' },
});

const hasSheet = computed(() => !!props.sheet);


function toggleCollapse() {
  emit('toggle-collapse');
}


// 模式顺序：提问、编辑、智能体、计划
const modes = ['提问', '编辑', '智能体', '计划'];
const models = [PROVIDERS.GPT, PROVIDERS.DEEPSEEK, PROVIDERS.DOUBAO];

const mode = ref(modes[0]);
const model = ref(models[0]);

// Context scope (placeholder: sheet/workbook)
const contextScope = ref('sheet');

const draft = ref('');
const messages = ref([]);

const scrollbarRef = ref(null);
const bottomRef = ref(null);

const settingsOpen = ref(false);
const settingsSection = ref('general');

const providerOptions = [
  { label: 'GPT', value: PROVIDERS.GPT },
  { label: 'DeepSeek', value: PROVIDERS.DEEPSEEK },
  { label: '豆包', value: PROVIDERS.DOUBAO },
];

const activeProvider = ref(PROVIDERS.GPT);

const providerDefaults = {
  [PROVIDERS.GPT]: getProviderDefaults(PROVIDERS.GPT),
  [PROVIDERS.DEEPSEEK]: getProviderDefaults(PROVIDERS.DEEPSEEK),
  [PROVIDERS.DOUBAO]: getProviderDefaults(PROVIDERS.DOUBAO),
};

const llmConfig = reactive(loadLlmConfig());

function openSettings() {
  settingsOpen.value = true;
}

defineExpose({
  openSettings,
});

// function openSettings() {
//   settingsOpen.value = true;
// }

const pickedHint = computed(() => '附件：未启用');

watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    bottomRef.value?.scrollIntoView({ block: 'end' });
  },
);

function tagType(role) {
  if (role === 'user') return 'primary';
  if (role === 'assistant') return 'success';
  if (role === 'system') return 'info';
  return 'info';
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

function saveConfig() {
  persistLlmConfig({ providers: { ...llmConfig.providers } });
  settingsOpen.value = false;
  messages.value.push({
    id: crypto.randomUUID?.() ?? String(Date.now()),
    role: 'system',
    createdAt: Date.now(),
    content: '模型配置已保存。',
  });
}

function resetConfig() {
  const d = getDefaultConfig();
  // 保持 reactive 对象引用稳定
  llmConfig.providers[PROVIDERS.GPT] = { ...d.providers[PROVIDERS.GPT] };
  llmConfig.providers[PROVIDERS.DEEPSEEK] = { ...d.providers[PROVIDERS.DEEPSEEK] };
  llmConfig.providers[PROVIDERS.DOUBAO] = { ...d.providers[PROVIDERS.DOUBAO] };
}

const requesting = ref(false);
let abortController = null;

async function send() {
  const content = draft.value.trim();
  if (!content) return;

  const scopeLabel = contextScope.value === 'workbook' ? '整个Excel' : '当前Sheet';

  // push user first
  messages.value.push({
    id: crypto.randomUUID?.() ?? String(Date.now()),
    role: 'user',
    createdAt: Date.now(),
    content: `[${mode.value} / ${model.value} / ${scopeLabel}] ${content}`,
  });

  if (mode.value === '编辑') {
    handleEditCommand(content);
    draft.value = '';
    return;
  }

  draft.value = '';

  // real chat (MVP)
  try {
    requesting.value = true;
    abortController?.abort?.();
    abortController = new AbortController();

    const provider = model.value;
    const providerCfg = llmConfig.providers?.[provider] || {};

    const inputMessages = messages.value
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));

    const resp = await chatCompletion({
      provider,
      config: providerCfg,
      messages: inputMessages,
      signal: abortController.signal,
    });

    messages.value.push({
      id: crypto.randomUUID?.() ?? String(Date.now() + 1),
      role: 'assistant',
      createdAt: Date.now(),
      content: resp.content,
    });
  } catch (e) {
    messages.value.push({
      id: crypto.randomUUID?.() ?? String(Date.now() + 2),
      role: 'system',
      createdAt: Date.now(),
      content: `请求失败：${e?.message ?? String(e)}`,
    });
  } finally {
    requesting.value = false;
  }
}

function pushAssistant(text) {
  messages.value.push({
    id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
    role: 'assistant',
    createdAt: Date.now(),
    content: text,
  });
}

function clear() {
  messages.value = [];
  draft.value = '';
}

function handleEditCommand(input) {
  if (!hasSheet.value) {
    pushAssistant('SheetNext 尚未初始化完成，稍等片刻再试。');
    return;
  }

  const trimmed = input.trim();
  if (trimmed === 'help' || trimmed === '帮助') {
    pushAssistant(
      [
        '编辑模式指令（MVP）:',
        '- help',
        '- set A1 123',
        '- set A1 "hello"',
        '- read A1',
      ].join('\n'),
    );
    return;
  }

  const mSet = trimmed.match(/^set\s+([A-Za-z]+\d+)\s+(.+)$/);
  if (mSet) {
    const addr = mSet[1].toUpperCase();
    const raw = mSet[2].trim();
    const value = parseValue(raw);

    try {
      const ok = trySetCell(props.sheet, addr, value);
      pushAssistant(ok ? `已尝试写入 ${addr} = ${JSON.stringify(value)}` : `未找到可用的写入接口，无法写入 ${addr}`);
    } catch (e) {
      pushAssistant(`写入失败：${e?.message ?? String(e)}`);
    }
    return;
  }

  const mRead = trimmed.match(/^read\s+([A-Za-z]+\d+)$/);
  if (mRead) {
    const addr = mRead[1].toUpperCase();
    try {
      const res = tryReadCell(props.sheet, addr);
      pushAssistant(res.found ? `${addr} = ${JSON.stringify(res.value)}` : `未找到可用的读取接口，无法读取 ${addr}`);
    } catch (e) {
      pushAssistant(`读取失败：${e?.message ?? String(e)}`);
    }
    return;
  }

  pushAssistant('未识别的编辑指令。输入 help 查看可用指令。');
}

function parseValue(raw) {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const n = Number(raw);
  if (!Number.isNaN(n) && raw !== '') return n;
  return raw;
}

function trySetCell(sheet, addr, value) {
  const candidates = [
    sheet?.setCellValue,
    sheet?.setValue,
    sheet?.setCell,
    sheet?.set,
    sheet?.api?.setCellValue,
    sheet?.api?.setValue,
    sheet?.api?.setCell,
  ];

  for (const fn of candidates) {
    if (typeof fn === 'function') {
      fn.call(sheet?.api ?? sheet, addr, value);
      return true;
    }
  }

  const dispatch = sheet?.dispatch || sheet?.command || sheet?.api?.dispatch;
  if (typeof dispatch === 'function') {
    dispatch.call(sheet, { type: 'setCell', addr, value });
    return true;
  }

  return false;
}

function tryReadCell(sheet, addr) {
  const candidates = [
    sheet?.getCellValue,
    sheet?.getValue,
    sheet?.getCell,
    sheet?.get,
    sheet?.api?.getCellValue,
    sheet?.api?.getValue,
    sheet?.api?.getCell,
  ];

  for (const fn of candidates) {
    if (typeof fn === 'function') {
      return { found: true, value: fn.call(sheet?.api ?? sheet, addr) };
    }
  }

  return { found: false, value: undefined };
}
</script>

<style scoped>
.copilot {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-left: 1px solid var(--el-border-color);
}

.topbar {
  height: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  box-sizing: border-box;
  background: #ffffff;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.app-title {
  font-weight: 650;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.chat {
  flex: 1;
  min-height: 0;
  padding: 8px 10px;
  box-sizing: border-box;
  background: #ffffff;
}

.chat__scroll {
  height: 100%;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid var(--el-border-color-lighter);
}

.chat__list {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
}

.row--user {
  justify-content: flex-end;
}

.row--assistant,
.row--system {
  justify-content: flex-start;
}

.bubble {
  max-width: 92%;
  border-radius: 10px;
  padding: 10px;
  border: 1px solid var(--el-border-color-lighter);
  background: #ffffff;
}

.row--user .bubble {
  background: #f5faff;
  border-color: rgba(64, 158, 255, 0.25);
}

.row--assistant .bubble {
  background: #f6fff3;
  border-color: rgba(103, 194, 58, 0.25);
}

.row--system .bubble {
  background: #fafafa;
  border-color: var(--el-border-color-lighter);
}

.bubble__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.bubble__content {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-primary);
}

.composer {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 10px;
  box-sizing: border-box;
  background: #ffffff;
}


.composer__box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.context {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 10px;
  background: #ffffff;
}

.context--inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.context__left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.context__current {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.context__right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.composer__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.composer__controls .left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.edit-hint {
  white-space: nowrap;
}

.mode {
  width: 120px;
}

.model {
  width: 120px;
}

.settings {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 12px;
  min-height: 360px;
}

.settings__menu {
  border-right: 1px solid var(--el-border-color-lighter);
}

.settings__menuInner {
  border-right: 0;
}

.settings__main {
  padding-right: 4px;
}
</style>
