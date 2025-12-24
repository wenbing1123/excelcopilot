<template>
  <aside class="copilot" aria-label="AI 驾驶舱">
    <!-- Top toolbar -->
    <header class="topbar">
      <div class="topbar__left">
        <div class="app-title">驾驶舱</div>
      </div>

      <div class="topbar__right">
        <!-- 设置 -->
        <el-tooltip content="设置" placement="bottom">
          <el-button size="small" circle text type="info" @click="openSettings" aria-label="设置">
            <span style="font-size:14px; line-height:1">⚙</span>
          </el-button>
        </el-tooltip>

        <!-- 清空 -->
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

        <!-- 历史对话 -->
        <el-tooltip content="历史对话" placement="bottom">
          <el-button size="small" circle text type="primary" @click="openHistory" aria-label="历史对话">
            <span style="font-size:14px; line-height:1">🕘</span>
          </el-button>
        </el-tooltip>

        <!-- 新建会话 -->
        <el-tooltip content="新建会话" placement="bottom">
          <el-button size="small" circle text type="success" @click="newConversation" aria-label="新建会话">
            <span style="font-size:14px; line-height:1">＋</span>
          </el-button>
        </el-tooltip>
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
            <el-alert
              type="info"
              show-icon
              :closable="false"
              title="通用设置：可配置系统提示词（system prompt），用于约束模型的回答风格/能力。"
              style="margin-bottom: 12px"
            />

            <div style="display:flex; gap:10px; align-items:center; margin-bottom: 10px">
              <el-select
                v-model="activeSystemPromptId"
                placeholder="选择系统提示词"
                filterable
                style="width: 260px"
                :loading="promptLoading"
                @change="async () => { await setActiveSystemPrompt(activeSystemPromptId); loadPromptFromSelection(); }"
              >
                <el-option v-for="p in systemPrompts" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>

              <el-button @click="newPrompt">新增</el-button>
              <el-button type="primary" :disabled="!editingPrompt.name || !editingPrompt.content" @click="savePromptDb">保存</el-button>
              <el-button type="danger" plain :disabled="!editingPrompt.id" @click="removePromptDb">删除</el-button>
            </div>

            <el-form label-position="top">
              <el-form-item label="名称">
                <el-input v-model="editingPrompt.name" placeholder="例如：表格 AI 助手" />
              </el-form-item>

              <el-form-item label="系统提示词内容">
                <el-input
                  v-model="editingPrompt.content"
                  type="textarea"
                  :rows="8"
                  resize="vertical"
                  placeholder="例如：你是一个 Excel/表格助手..."
                />
              </el-form-item>

              <el-form-item label="调试">
                <el-switch v-model="showPromptDebug" active-text="在控制台打印本次请求的完整提示词" />
              </el-form-item>

              <el-text type="info" size="small">选中的系统提示词会在每次对话请求时作为第一条 system message 发送给模型。</el-text>
            </el-form>
          </template>

          <template v-else-if="settingsSection === 'models'">
            <el-alert
              type="info"
              show-icon
              :closable="false"
              title="模型配置已存入本地 SQLite（通过本地服务提供 API）。这里可新增/编辑/删除配置。"
              style="margin-bottom: 12px"
            />

            <div style="display:flex; gap:10px; align-items:center; margin-bottom: 10px">
              <el-select
                v-model="activeConfigId"
                placeholder="选择配置"
                filterable
                style="width: 260px"
                :loading="configsLoading"
              >
                <el-option v-for="c in llmConfigs" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>

              <el-button @click="newConfig">新增</el-button>
              <el-button type="primary" :disabled="!editingConfig.name" @click="saveConfigDb">保存</el-button>
              <el-button type="danger" plain :disabled="!activeConfigId" @click="removeSelectedConfig">删除</el-button>
            </div>

            <el-form label-position="top">
              <el-form-item label="名称（例如 GPT5.2）">
                <el-input v-model="editingConfig.name" placeholder="GPT5.2" />
              </el-form-item>

              <el-form-item label="Provider">
                <el-select v-model="editingConfig.provider" style="width: 240px">
                  <el-option v-for="p in models" :key="p" :label="p" :value="p" />
                </el-select>
              </el-form-item>

              <el-form-item label="Model Name">
                <el-input v-model="editingConfig.modelName" :placeholder="providerDefaults[editingConfig.provider].model" />
              </el-form-item>

              <el-form-item label="Base URL（可空，使用默认）">
                <el-input v-model="editingConfig.baseUrl" :placeholder="providerDefaults[editingConfig.provider].baseUrl" />
              </el-form-item>

              <el-form-item label="API Key">
                <el-input v-model="editingConfig.apiKey" type="password" show-password placeholder="sk-..." />
              </el-form-item>

              <el-text type="info" size="small">
                默认：{{ providerDefaults[editingConfig.provider].baseUrl }} / model={{ providerDefaults[editingConfig.provider].model }}
              </el-text>
            </el-form>
          </template>

          <template v-else-if="settingsSection === 'tools'">
            <el-alert
              type="info"
              show-icon
              :closable="false"
              title="工具配置：选择本次对话中可用的工具"
              style="margin-bottom: 12px"
            />

            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 10px">
              <el-switch v-model="toolsEnableAll" active-text="全部启用" inactive-text="自定义" />
              <el-button size="small" @click="selectAllTools" :disabled="toolsEnableAll">全选</el-button>
              <el-button size="small" @click="clearAllTools" :disabled="toolsEnableAll">全不选</el-button>
            </div>

            <el-checkbox-group v-model="selectedToolNames" :disabled="toolsEnableAll">
              <div style="display:flex; flex-direction:column; gap:8px">
                <el-checkbox v-for="t in sheetToolDefinitions" :key="t.name" :label="t.name">
                  <div style="display:flex; flex-direction:column">
                    <div style="font-weight:600">{{ t.label }}</div>
                    <div style="color: var(--el-text-color-secondary); font-size:12px">{{ t.desc }}</div>
                  </div>
                </el-checkbox>
              </div>
            </el-checkbox-group>
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
             <div class="context__current">
               <el-text type="info" size="small">当前选择：</el-text>
               <el-tag size="small" effect="plain" type="info">Sheet：{{ targetSheetName || '(未知)' }}</el-tag>
               <el-tag size="small" effect="plain" type="info">Cell：{{ anchorCell || 'A1' }}</el-tag>
               <el-button size="small" plain @click="refreshAnchorFromSelection">同步选区</el-button>
               <el-tooltip content="锁定后：即使模型想写入/创建其他工作表，也会强制写在当前活动工作表" placement="top">
                 <el-switch
                   v-model="lockToActiveSheet"
                   size="small"
                   active-text="锁定当前Sheet"
                   inactive-text="允许切换"
                 />
               </el-tooltip>
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

            <!-- 配置名（取代原“模型”provider） -->
            <div style="display:flex; align-items:center; gap:6px">
              <el-select
                v-model="activeConfigId"
                size="small"
                class="model"
                placeholder="配置"
                filterable
                :loading="configsLoading"
              >
                <el-option v-for="c in llmConfigs" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>

              <el-tooltip content="工具" placement="top">
                <el-button size="small" circle plain @click="toolDialogOpen = true" aria-label="工具">
                  <el-icon><Tools /></el-icon>
                </el-button>
              </el-tooltip>
            </div>

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
          <el-text type="info" size="small">正在请求 {{ activeConfigLabel }} …</el-text>
        </div>
      </div>
    </footer>

    <!-- Tools dialog (per-conversation tool enable/disable) -->
    <el-dialog v-model="toolDialogOpen" title="工具" width="640px" :close-on-click-modal="false">
      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="默认：当前对话启用全部工具。你可以在这里禁用某些工具（例如不允许创建工作表）。"
        style="margin-bottom: 12px"
      />

      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 10px">
        <el-switch v-model="toolsEnableAll" active-text="全部启用" inactive-text="自定义" />
        <el-button size="small" @click="selectAllTools" :disabled="toolsEnableAll">全选</el-button>
        <el-button size="small" @click="clearAllTools" :disabled="toolsEnableAll">全不选</el-button>
      </div>

      <el-checkbox-group v-model="selectedToolNames" :disabled="toolsEnableAll">
        <div style="display:flex; flex-direction:column; gap:8px">
          <el-checkbox v-for="t in sheetToolDefinitions" :key="t.name" :label="t.name">
            <div style="display:flex; flex-direction:column">
              <div style="font-weight:600">{{ t.label }}</div>
              <div style="color: var(--el-text-color-secondary); font-size:12px">{{ t.desc }}</div>
            </div>
          </el-checkbox>
        </div>
      </el-checkbox-group>

      <template #footer>
        <div style="display:flex; justify-content:flex-end; gap:8px">
          <el-button @click="toolDialogOpen = false">关闭</el-button>
          <el-button type="primary" @click="confirmToolsDialog">确定</el-button>
        </div>
      </template>
    </el-dialog>
  </aside>
</template>

<script setup>
import { ref, computed, nextTick, watch, reactive, onMounted } from 'vue';
import { Delete, Tools } from '@element-plus/icons-vue';
import { getProviderDefaults, chatCompletion, chatCompletionStream, PROVIDERS } from '../services/llmClient.js';
import { listLlmConfigs, createLlmConfig, updateLlmConfig, deleteLlmConfig } from '../services/llmConfigApi.js';
import { listConversations as apiListConversations, getConversationMessages } from '../services/conversationApi.js';
import {
  listSystemPrompts,
  createSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
  getActiveSystemPrompt,
  setActiveSystemPrompt,
} from '../services/systemPromptApi.js';
import { getSheetTools } from '../services/sheetTools.js';
import { loadToolSettings, saveToolSettings } from '../services/toolSettings.js';

// NOTE: This file previously accumulated duplicated state blocks.
// We keep ONE set of state & functions below.

// ---------- Topbar dialogs/events ----------
const settingsOpen = ref(false);
const settingsSection = ref('general');
const emit = defineEmits(['open-history']);

function openSettings() {
  settingsOpen.value = true;
  settingsSection.value = 'general';
}

function openHistory() {
  emit('open-history');
}

// ---------- SheetNext instance ----------
const props = defineProps({
  sheet: { type: Object, default: null },
  cockpitId: { type: String, default: '' },
});
const hasSheet = computed(() => !!props.sheet);

// ---------- Basic chat state ----------
const draft = ref('');
const messages = ref([]);
const scrollbarRef = ref(null);
const bottomRef = ref(null);

// ---------- Modes ----------
const modes = ['提问', '编辑', '智能体', '计划'];
const mode = ref(modes[0]);
const requesting = ref(false);
const showPromptDebug = ref(false);

// ---------- Context (anchor) ----------
const targetSheetName = ref('');
const anchorCell = ref('A1');
const lockToActiveSheet = ref(true);
const pickedHint = computed(() => {
  return hasSheet.value
    ? `目标：${targetSheetName.value || '(活动表)'}!${anchorCell.value || 'A1'}`
    : 'SheetNext 未就绪';
});

function refreshAnchorFromSelection() {
  // MVP: best-effort; if sheetnext exposes activeSheet/activeCell use it, else keep defaults.
  try {
    const s = props.sheet?.activeSheet;
    if (s?.name) targetSheetName.value = s.name;
    const cell = s?.activeCell;
    if (cell && typeof cell === 'object') {
      // cell like {r,c}
      // we don't have a reliable num->A1 here; keep A1.
    }
  } catch {
    // ignore
  }
}

// ---------- Provider/model configs ----------
const providerDefaults = {
  [PROVIDERS.GPT]: getProviderDefaults(PROVIDERS.GPT),
  [PROVIDERS.DEEPSEEK]: getProviderDefaults(PROVIDERS.DEEPSEEK),
  [PROVIDERS.DOUBAO]: getProviderDefaults(PROVIDERS.DOUBAO),
};
const models = [PROVIDERS.GPT, PROVIDERS.DEEPSEEK, PROVIDERS.DOUBAO];

const llmConfigs = ref([]);
const activeConfigId = ref(null);
const configsLoading = ref(false);
const editingConfig = reactive({ id: null, name: '', provider: PROVIDERS.GPT, baseUrl: '', apiKey: '', modelName: '' });

const activeConfigLabel = computed(() => {
  const c = llmConfigs.value.find((x) => x.id === activeConfigId.value);
  return c?.name || '未选择配置';
});

async function refreshConfigs() {
  configsLoading.value = true;
  try {
    const rows = await listLlmConfigs();
    llmConfigs.value = Array.isArray(rows) ? rows : [];
    if (activeConfigId.value == null && llmConfigs.value.length) activeConfigId.value = llmConfigs.value[0].id;
    loadEditingFromSelected();
  } finally {
    configsLoading.value = false;
  }
}

function loadEditingFromSelected() {
  const row = llmConfigs.value.find((r) => r.id === activeConfigId.value);
  if (!row) return;
  editingConfig.id = row.id;
  editingConfig.name = row.name || '';
  editingConfig.provider = row.provider || PROVIDERS.GPT;
  editingConfig.baseUrl = row.baseUrl || '';
  editingConfig.apiKey = row.apiKey || '';
  editingConfig.modelName = row.modelName || '';
}

watch(() => activeConfigId.value, loadEditingFromSelected);

function newConfig() {
  editingConfig.id = null;
  editingConfig.name = '';
  editingConfig.provider = PROVIDERS.GPT;
  editingConfig.baseUrl = '';
  editingConfig.apiKey = '';
  editingConfig.modelName = '';
}

async function saveConfigDb() {
  const payload = {
    name: editingConfig.name,
    provider: editingConfig.provider,
    baseUrl: editingConfig.baseUrl,
    apiKey: editingConfig.apiKey,
    modelName: editingConfig.modelName,
  };
  const saved = editingConfig.id
    ? await updateLlmConfig(editingConfig.id, payload)
    : await createLlmConfig(payload);
  await refreshConfigs();
  if (saved?.id != null) activeConfigId.value = saved.id;
}

async function removeSelectedConfig() {
  if (!activeConfigId.value) return;
  await deleteLlmConfig(activeConfigId.value);
  activeConfigId.value = null;
  await refreshConfigs();
}

function saveConfig() {
  return saveConfigDb();
}
function resetConfig() {
  return newConfig();
}

// ---------- System prompts ----------
const systemPrompts = ref([]);
const activeSystemPromptId = ref(null);
const promptLoading = ref(false);
const editingPrompt = reactive({ id: null, name: '', content: '' });

async function refreshSystemPrompts() {
  promptLoading.value = true;
  try {
    const rows = await listSystemPrompts();
    systemPrompts.value = Array.isArray(rows) ? rows : [];
    const active = await getActiveSystemPrompt().catch(() => null);
    activeSystemPromptId.value = active?.activeSystemPromptId ?? systemPrompts.value?.[0]?.id ?? null;
    loadPromptFromSelection();
  } finally {
    promptLoading.value = false;
  }
}

function loadPromptFromSelection() {
  const p = systemPrompts.value.find((x) => x.id === activeSystemPromptId.value);
  if (!p) {
    editingPrompt.id = null;
    editingPrompt.name = '';
    editingPrompt.content = '';
    return;
  }
  editingPrompt.id = p.id;
  editingPrompt.name = p.name;
  editingPrompt.content = p.content;
}

function newPrompt() {
  editingPrompt.id = null;
  editingPrompt.name = '';
  editingPrompt.content = '';
}

async function savePromptDb() {
  const payload = { name: editingPrompt.name, content: editingPrompt.content };
  const saved = editingPrompt.id
    ? await updateSystemPrompt(editingPrompt.id, payload)
    : await createSystemPrompt(payload);
  await refreshSystemPrompts();
  if (saved?.id != null) activeSystemPromptId.value = saved.id;
}

async function removePromptDb() {
  if (!editingPrompt.id) return;
  await deleteSystemPrompt(editingPrompt.id);
  await refreshSystemPrompts();
}

// ---------- Tool config (global) ----------
const toolDialogOpen = ref(false);
const toolsEnableAll = ref(true);
const selectedToolNames = ref([]);

const TOOL_I18N = {
  sheet_add_sheet: { label: '新建工作表', desc: '在当前工作簿中新增一个工作表（sheet tab）。' },
  sheet_set_range_values: { label: '写入单元格/区域', desc: '向指定范围写入二维数组（可用于批量生成表格）。' },
  sheet_get_range_values: { label: '读取单元格/区域', desc: '读取指定范围的值（二维数组）。' },
  sheet_format_range: { label: '设置格式', desc: '对指定范围应用基础格式（粗体/背景色/对齐/数字格式）。' },
};

const sheetToolDefinitions = computed(() => {
  const tools = getSheetTools();
  return (tools || [])
    .map((t) => {
      const name = t?.function?.name;
      if (!name) return null;
      const meta = TOOL_I18N[name] || { label: name, desc: t?.function?.description || '' };
      return { name, label: meta.label, desc: meta.desc };
    })
    .filter(Boolean);
});

const _loadedToolSettings = loadToolSettings();
toolsEnableAll.value = _loadedToolSettings.enableAll;

watch(
  () => sheetToolDefinitions.value,
  (defs) => {
    if (!defs?.length) return;
    if (!toolsEnableAll.value && _loadedToolSettings.enabledToolNames?.length) {
      selectedToolNames.value = [..._loadedToolSettings.enabledToolNames];
    }
    if (!selectedToolNames.value.length) selectedToolNames.value = defs.map((d) => d.name);
  },
  { immediate: true },
);
watch(
  () => toolsEnableAll.value,
  () => saveToolSettings({ enableAll: toolsEnableAll.value, enabledToolNames: selectedToolNames.value }),
);
watch(
  () => selectedToolNames.value,
  () => {
    if (!toolsEnableAll.value) saveToolSettings({ enableAll: false, enabledToolNames: selectedToolNames.value });
  },
  { deep: true },
);

function selectAllTools() {
  selectedToolNames.value = sheetToolDefinitions.value.map((d) => d.name);
}
function clearAllTools() {
  selectedToolNames.value = [];
}
function confirmToolsDialog() {
  saveToolSettings({ enableAll: toolsEnableAll.value, enabledToolNames: selectedToolNames.value });
  toolDialogOpen.value = false;
}

// ---------- Conversation history methods exposed to App.vue ----------
const activeConversationId = ref(null);

function mapDbMessageToUi(m) {
  return {
    id: String(m.id ?? crypto.randomUUID?.() ?? Date.now()),
    role: m.role,
    createdAt: m.createdAt ? Date.parse(m.createdAt) || Date.now() : Date.now(),
    content: m.content,
  };
}

async function listConversations() {
  return apiListConversations();
}

async function loadConversationById(id) {
  const data = await getConversationMessages(id);
  activeConversationId.value = id;
  const dbMsgs = Array.isArray(data?.messages) ? data.messages : [];
  messages.value = dbMsgs.map(mapDbMessageToUi);
  await nextTick();
  bottomRef.value?.scrollIntoView?.({ block: 'end' });
}

defineExpose({ listConversations, loadConversationById });

// ---------- UI helpers ----------
function tagType(role) {
  if (role === 'user') return 'primary';
  if (role === 'assistant') return 'success';
  return 'info';
}
function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

function clear() {
  messages.value = [];
  draft.value = '';
}

async function newConversation() {
  activeConversationId.value = null;
  clear();
}

// ---------- Sheet tool executor (local, MVP) ----------
function getActiveSheet() {
  const s = props.sheet?.activeSheet;
  return s || null;
}

function getSheetByName(name) {
  const wb = props.sheet;
  if (!wb) return null;
  const sheets = wb.sheets || wb?.workbook?.sheets;
  if (Array.isArray(sheets)) return sheets.find((s) => s?.name === name) || null;
  if (typeof wb.getSheetByName === 'function') return wb.getSheetByName(name);
  return null;
}

async function runSheetToolCall(call) {
  const fn = call?.function;
  const name = fn?.name;
  const args = typeof fn?.arguments === 'string' ? JSON.parse(fn.arguments || '{}') : (fn?.arguments || {});
  const sheet = args.sheet ? getSheetByName(args.sheet) : getActiveSheet();
  if (!sheet) throw new Error('SheetNext 未就绪或没有活动工作表');

  if (name === 'sheet_add_sheet') {
    const newName = String(args.name || '').trim();
    if (!newName) throw new Error('name required');
    if (typeof props.sheet?.addSheet === 'function') {
      props.sheet.addSheet(newName);
      return { ok: true, name: newName };
    }
    throw new Error('当前 SheetNext 实例不支持 addSheet');
  }

  if (name === 'sheet_set_range_values') {
    const values = args.values;
    const startCell = args.startCell || args.range;
    if (!Array.isArray(values) || !startCell) throw new Error('values + (startCell|range) required');
    if (typeof sheet.insertTable === 'function') {
      sheet.insertTable(values, startCell, { border: true });
      return { ok: true };
    }
    // fallback: set cell-by-cell
    if (typeof sheet.rangeStrToNum === 'function' && typeof sheet.getCell === 'function') {
      const rangeNum = sheet.rangeStrToNum(String(startCell));
      const r0 = rangeNum?.s?.r ?? 0;
      const c0 = rangeNum?.s?.c ?? 0;
      for (let r = 0; r < values.length; r++) {
        for (let c = 0; c < (values[r] || []).length; c++) {
          const cell = sheet.getCell(r0 + r, c0 + c);
          if (cell) cell.v = values[r][c];
        }
      }
      return { ok: true };
    }
    throw new Error('当前 Sheet 对象不支持写入');
  }

  if (name === 'sheet_get_range_values') {
    const range = String(args.range || '');
    if (!range) throw new Error('range required');
    if (typeof sheet.eachArea === 'function' && typeof sheet.getCell === 'function') {
      const rn = sheet.rangeStrToNum(range);
      const out = [];
      for (let r = rn.s.r; r <= rn.e.r; r++) {
        const row = [];
        for (let c = rn.s.c; c <= rn.e.c; c++) {
          const cell = sheet.getCell(r, c);
          row.push(cell?.v ?? cell?.showVal ?? '');
        }
        out.push(row);
      }
      return { values: out };
    }
    return { values: [] };
  }

  if (name === 'sheet_format_range') {
    // MVP: formatting not implemented in this minimal restore
    return { ok: true, note: 'format not implemented in MVP' };
  }

  throw new Error(`unknown tool: ${name}`);
}

function pushSystem(content) {
  messages.value.push({
    id: crypto.randomUUID?.() ?? String(Date.now()),
    role: 'system',
    createdAt: Date.now(),
    content,
  });
}

function toolDisplayName(toolName) {
  return TOOL_I18N?.[toolName]?.label || toolName || '(unknown)';
}

async function waitSheetRendered() {
  // SheetNext updates can be async; wait at least nextTick + 2 frames so DOM paints.
  await nextTick();
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => requestAnimationFrame(() => r()));
}

function getEnabledToolsForMode() {
  if (mode.value !== '编辑') return [];
  const all = getSheetTools();
  return toolsEnableAll.value
    ? all
    : all.filter((t) => selectedToolNames.value.includes(t?.function?.name));
}

async function send() {
  const content = draft.value.trim();
  if (!content) return;

  messages.value.push({ id: crypto.randomUUID?.() ?? String(Date.now()), role: 'user', createdAt: Date.now(), content });
  draft.value = '';

  const assistantId = crypto.randomUUID?.() ?? String(Date.now() + 1);
  messages.value.push({ id: assistantId, role: 'assistant', createdAt: Date.now(), content: '思考中…' });

  const selected = llmConfigs.value.find((c) => c.id === activeConfigId.value);
  if (!selected) {
    messages.value.push({ id: crypto.randomUUID?.() ?? String(Date.now() + 2), role: 'system', createdAt: Date.now(), content: '请先在设置->模型设置里创建/选择模型配置。' });
    return;
  }

  const provider = selected.provider;
  const providerCfg = { apiKey: selected.apiKey, baseUrl: selected.baseUrl, modelName: selected.modelName };

  const sysText = String(systemPrompts.value.find((p) => p.id === activeSystemPromptId.value)?.content || '').trim();
  const historyMsgs = messages.value
    .filter((m) => m.id !== assistantId)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  // Mode contract:
  // - 提问: never send tools
  // - 编辑: allow tool calling and execute tool_calls
  if (mode.value !== '提问' && mode.value !== '编辑') {
    const idx = messages.value.findIndex((m) => m.id === assistantId);
    if (idx >= 0) messages.value[idx] = { ...messages.value[idx], role: 'system', content: '该模式待开发：请先使用「提问」或「编辑」。' };
    return;
  }

  const tools = getEnabledToolsForMode();
  const baseMessages = sysText ? [{ role: 'system', content: sysText }, ...historyMsgs] : historyMsgs;

  try {
    requesting.value = true;

    // Always try stream first for better UX.
    const idx0 = messages.value.findIndex((m) => m.id === assistantId);
    if (idx0 >= 0) messages.value[idx0] = { ...messages.value[idx0], content: '' };

    // 提问：纯流式，不带 tools
    if (mode.value === '提问') {
      let full = '';
      await chatCompletionStream({
        provider,
        config: providerCfg,
        messages: baseMessages,
        signal: undefined,
        onDelta: (d) => {
          full += d;
          const idx = messages.value.findIndex((m) => m.id === assistantId);
          if (idx >= 0) messages.value[idx] = { ...messages.value[idx], content: full };
        },
      });
      return;
    }

    // tool loop (max 5)
    let loopMessages = [...baseMessages];
    let finalText = '';
    let didRunTools = false;

    pushSystem('编辑模式：正在分析是否需要调用工具…');

    for (let i = 0; i < 5; i++) {
      const resp = await chatCompletion({
        provider,
        config: providerCfg,
        messages: loopMessages,
        tools: mode.value === '编辑' ? tools : undefined,
        toolChoice: mode.value === '编辑' ? 'auto' : undefined,
      });

      finalText = resp.content || finalText;
      if (!resp.toolCalls || resp.toolCalls.length === 0 || mode.value === '提问') {
        // No tool calls: stream the final answer for better UX (best-effort).
        let full = '';
        await chatCompletionStream({
          provider,
          config: providerCfg,
          messages: loopMessages,
          tools: undefined,
          toolChoice: undefined,
          onDelta: (d) => {
            full += d;
            const idx = messages.value.findIndex((m) => m.id === assistantId);
            if (idx >= 0) messages.value[idx] = { ...messages.value[idx], content: full };
          },
        }).catch(() => {
          // fallback to non-stream text
          const idx = messages.value.findIndex((m) => m.id === assistantId);
          if (idx >= 0) messages.value[idx] = { ...messages.value[idx], content: finalText || '' };
        });
        return;
      }

      // Append assistant tool call message + tool results.
      loopMessages.push({ role: 'assistant', content: resp.content || '', tool_calls: resp.toolCalls });

      didRunTools = true;
      pushSystem(`检测到工具调用：${resp.toolCalls.length} 个，开始执行…`);

      for (const tc of resp.toolCalls) {
        const toolName = tc?.function?.name || '(unknown)';
        pushSystem(`→ 执行工具：${toolDisplayName(toolName)}`);
        const result = await runSheetToolCall(tc);
        pushSystem(`✓ 工具完成：${toolDisplayName(toolName)}`);
        loopMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }

      // After tool writes, wait for SheetNext to paint before continuing.
      await waitSheetRendered();
    }

    if (didRunTools) {
      pushSystem('表格更新中…（等待渲染完成）');
      await waitSheetRendered();
      pushSystem('表格已更新并渲染完成。');
    }

    const idx = messages.value.findIndex((m) => m.id === assistantId);
    if (idx >= 0) messages.value[idx] = { ...messages.value[idx], content: finalText || '' };
   } catch (e) {
     const idx = messages.value.findIndex((m) => m.id === assistantId);
     if (idx >= 0) messages.value[idx] = { ...messages.value[idx], role: 'system', content: `请求失败：${e?.message ?? String(e)}` };
   } finally {
     requesting.value = false;
     await nextTick();
     bottomRef.value?.scrollIntoView?.({ block: 'end' });
   }
 }

onMounted(() => {
  refreshConfigs();
  refreshSystemPrompts();
  refreshAnchorFromSelection();
});
</script>

<style scoped>
/* 恢复为更接近 Element Plus 的简洁布局，避免覆盖过多组件默认样式 */
.copilot {
  height: 100%;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.topbar,
.chat,
.composer {
  min-width: 0;
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

.topbar__right {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.chat {
  flex: 1;
  min-height: 0;
  padding: 8px 10px;
  box-sizing: border-box;
  background: #ffffff;
  overflow: hidden;
}

.chat__scroll {
  height: 100%;
}

.chat__scroll :deep(.el-scrollbar__wrap) {
  height: 100%;
}

.chat__scroll :deep(.el-scrollbar__view) {
  min-height: 100%;
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
  margin-top: auto;
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

.mode {
  width: 120px;
}

.model {
  width: 180px;
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
