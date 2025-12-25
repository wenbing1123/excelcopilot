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

            <!-- Search and filter -->
            <div style="margin-bottom: 10px">
              <el-input
                v-model="toolSearch"
                placeholder="搜索工具"
                clearable
                suffix-icon="el-icon-search"
                style="max-width: 300px"
              />
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 10px">
              <el-switch v-model="toolsEnableAll" active-text="全部启用" inactive-text="自定义" />
              <el-button size="small" @click="selectAllTools" :disabled="toolsEnableAll">全选</el-button>
              <el-button size="small" @click="clearAllTools" :disabled="toolsEnableAll">全不选</el-button>
            </div>

            <!-- Grouped and filtered tools list -->
            <div class="tool-list">
              <div v-for="group in groupedToolDefinitions" :key="group.category" style="margin-bottom: 12px">
                <div style="font-weight: 600; margin-bottom: 4px">{{ group.label }}</div>
                <el-checkbox-group v-model="selectedToolNames" :disabled="toolsEnableAll">
                  <div style="display:flex; flex-direction:column; gap:8px">
                    <el-checkbox v-for="t in group.items" :key="t.name" :label="t.name">
                      <div style="display:flex; flex-direction:column">
                        <div style="font-weight:600">{{ t.label }}</div>
                        <div style="color: var(--el-text-color-secondary); font-size:12px">{{ t.desc }}</div>
                      </div>
                    </el-checkbox>
                  </div>
                </el-checkbox-group>
              </div>
            </div>
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

      <!-- Search and filter -->
      <div style="margin-bottom: 10px">
        <el-input
          v-model="toolSearch"
          placeholder="搜索工具"
          clearable
          suffix-icon="el-icon-search"
          style="max-width: 300px"
        />
      </div>

      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 10px">
        <el-switch v-model="toolsEnableAll" active-text="全部启用" inactive-text="自定义" />
        <el-button size="small" @click="selectAllTools" :disabled="toolsEnableAll">全选</el-button>
        <el-button size="small" @click="clearAllTools" :disabled="toolsEnableAll">全不选</el-button>
      </div>

      <!-- Grouped and filtered tools list -->
      <div class="tool-list">
        <div v-for="group in groupedToolDefinitions" :key="group.category" style="margin-bottom: 12px">
          <div style="font-weight: 600; margin-bottom: 4px">{{ group.label }}</div>
          <el-checkbox-group v-model="selectedToolNames" :disabled="toolsEnableAll">
            <div style="display:flex; flex-direction:column; gap:8px">
              <el-checkbox v-for="t in group.items" :key="t.name" :label="t.name">
                <div style="display:flex; flex-direction:column">
                  <div style="font-weight:600">{{ t.label }}</div>
                  <div style="color: var(--el-text-color-secondary); font-size:12px">{{ t.desc }}</div>
                </div>
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </div>
      </div>

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
import { executeSheetToolCall } from '../services/sheetExecutor.js';
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

// ---------- Scroll helpers ----------
async function scrollToBottom() {
  await nextTick();
  // 优先使用 el-scrollbar 的 API
  try {
    const sb = scrollbarRef.value;
    if (sb?.setScrollTop) {
      const wrap = sb?.wrapRef;
      const top = wrap?.scrollHeight ?? 999999;
      sb.setScrollTop(top);
      return;
    }
  } catch {
    // ignore
  }
  // fallback
  bottomRef.value?.scrollIntoView?.({ block: 'end' });
}

// ---------- Context (anchor) ----------
const targetSheetName = ref('');
const anchorCell = ref('A1');
const lockToActiveSheet = ref(true);
const includeSheetContext = ref(true);

const pickedHint = computed(() => {
  return hasSheet.value
    ? `目标：${targetSheetName.value || '(活动表)'}!${anchorCell.value || 'A1'}`
    : 'SheetNext 未就绪';
});

async function refreshAnchorFromSelection() {
  // Use tools so we can reliably read activeCell and convert to A1.
  try {
    // 1) 当前活动表 info（含 activeCell）
    const sheetInfo = await executeSheetToolCall(props.sheet, {
      function: { name: 'sheet_get_info', arguments: '{}' },
    });
    const activeName = sheetInfo?.info?.name;
    if (activeName) targetSheetName.value = activeName;

    // 2) activeCell -> A1
    const cellNum = sheetInfo?.info?.activeCell;
    if (cellNum && typeof cellNum === 'object' && Number.isFinite(cellNum.r) && Number.isFinite(cellNum.c)) {
      const a1Res = await executeSheetToolCall(props.sheet, {
        function: { name: 'utils_cell_num_to_str', arguments: JSON.stringify({ cellNum }) },
      });
      const a1 = a1Res?.result;
      if (typeof a1 === 'string' && a1.trim()) anchorCell.value = a1.trim();
    }
  } catch {
    // fallback: keep existing anchor
    if (!anchorCell.value) anchorCell.value = 'A1';
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
const toolSearch = ref('');

const TOOL_CATEGORY_I18N = {
  workbook: '工作簿',
  'workbook/sheet': '工作簿/Sheet',
  sheet: '工作表',
  'sheet/range': '区域',
  'sheet/rows-cols': '行列',
  'sheet/merge': '合并',
  'sheet/sort': '排序',
  'sheet/insert': '插入',
  'sheet/drawing': '图形',
  cell: '单元格',
  'cell/read': '单元格/读取',
  'cell/value': '单元格/值',
  'cell/style': '单元格/样式',
  'cell/feature': '单元格/功能',
  row: '行',
  'row/read': '行/读取',
  'row/style': '行/样式',
  drawing: '图形',
  'drawing/read': '图形/读取',
  'drawing/write': '图形/更新',
  'drawing/layer': '图形/图层',
  layout: '布局',
  'layout/read': '布局/读取',
  'layout/write': '布局/设置',
  utils: '工具方法',
  'utils/convert': '工具方法/坐标转换',
  'utils/ui': '工具方法/UI',
  history: '历史记录',
};

const TOOL_I18N = {
  sheet_add_sheet: { label: '新建工作表', desc: '在当前工作簿中新增一个工作表（sheet tab）。' },
  sheet_set_range_values: { label: '写入单元格/区域', desc: '向指定范围写入二维数组（可用于批量生成表格）。' },
  sheet_get_range_values: { label: '读取单元格/区域', desc: '读取指定范围的值（二维数组）。' },
  sheet_format_range: { label: '设置格式', desc: '对指定范围应用基础格式（粗体/背景色/对齐/数字格式）。' },

  // Workbook-level tools
  workbook_get_info: { label: '工作簿信息', desc: '获取工作簿基础信息快照（名称/namespace/锁定状态/活动表/工作表列表）。' },
  workbook_add_sheet: { label: '工作簿：新增工作表', desc: '新增工作表（名称可选，未填则自动生成 Sheet1/Sheet2...）。' },
  workbook_del_sheet: { label: '工作簿：删除工作表', desc: '按名称删除工作表（至少保留一个可见工作表）。' },
  workbook_get_sheet_by_name: { label: '工作簿：按名称取表', desc: '按名称获取工作表信息（返回可序列化快照）。' },
  workbook_get_visible_sheet_by_index: { label: '工作簿：按可见索引取表', desc: '按可见索引（0-based，不计隐藏表）获取工作表信息快照。' },
  workbook_rerender: { label: '工作簿：手动刷新渲染', desc: '手动触发画布重新渲染（批量修改后使用）。' },
  workbook_get_data: { label: '工作簿：获取数据', desc: '获取完整工作簿 JSON 数据（用于备份/持久化/跨系统传输）。' },
  workbook_set_data: { label: '工作簿：加载数据', desc: '用 JSON 数据替换当前工作簿内容（setData）。' },
  workbook_import_from_url: { label: '工作簿：从 URL 导入', desc: '从在线地址导入 .xlsx 文件（importFromUrl）。' },
  workbook_export: { label: '工作簿：导出文件', desc: '导出为 XLSX/CSV/JSON（浏览器环境通常会触发下载）。' },

  // Sheet-level tools
  sheet_get_info: { label: '工作表信息', desc: '获取工作表（Sheet）核心属性快照（行列数/冻结/合并/选区等）。' },
  sheet_show_all_hid_rows: { label: '显示隐藏行', desc: '显示当前工作表所有隐藏的行。' },
  sheet_show_all_hid_cols: { label: '显示隐藏列', desc: '显示当前工作表所有隐藏的列。' },
  sheet_add_rows: { label: '插入行', desc: '在指定位置插入行（startR 0-based）。' },
  sheet_add_cols: { label: '插入列', desc: '在指定位置插入列（startC 0-based）。' },
  sheet_del_rows: { label: '删除行', desc: '从指定位置开始删除行（startR 0-based）。' },
  sheet_del_cols: { label: '删除列', desc: '从指定位置开始删除列（startC 0-based）。' },
  sheet_merge_cells: { label: '合并单元格', desc: '合并指定区域（例如 A1:C3）。' },
  sheet_unmerge_cells: { label: '取消合并', desc: '取消指定单元格所在的合并区域（例如 A1）。' },
  sheet_range_sort: { label: '区域排序', desc: '对指定区域进行排序（支持按列/行/自定义顺序）。' },
  sheet_insert_table: { label: '批量插入表格', desc: '使用 insertTable 在指定位置批量生成表格/模板（支持样式/合并）。' },
  sheet_add_drawing: { label: '添加图形对象', desc: '添加图形对象（图表/图片等）。' },
  sheet_get_drawings_by_cell: { label: '获取单元格图形对象', desc: '获取指定单元格位置的图形对象列表。' },
  sheet_remove_drawing: { label: '删除图形对象', desc: '按 id 删除图形对象。' },

  // Cell-level tools
  cell_get: { label: '读取单元格信息', desc: '读取单个单元格的值/类型/公式/合并信息/样式/验证等快照。' },
  cell_set_edit_val: { label: '设置单元格值/公式', desc: '写入 cell.editVal（可直接写公式，如 "=SUM(A1:A3)"）。' },
  cell_set_font: { label: '设置字体', desc: '设置 cell.font 字体样式（名称/字号/粗体/颜色/下划线等）。' },
  cell_set_alignment: { label: '设置对齐', desc: '设置 cell.alignment 对齐方式（水平/垂直/自动换行/缩进等）。' },
  cell_set_border: { label: '设置边框', desc: '设置 cell.border 边框样式（上下左右/对角线），{} 清空。' },
  cell_set_fill: { label: '设置填充', desc: '设置 cell.fill 填充（纯色/渐变），{} 清空。' },
  cell_set_num_fmt: { label: '设置数字格式', desc: '设置 cell.numFmt 数字/日期/货币格式，null 清空。' },
  cell_set_hyperlink: { label: '设置超链接', desc: '设置 cell.hyperlink（外链 target 或内链 location），{} 移除。' },
  cell_set_data_validation: { label: '设置数据验证', desc: '设置 cell.dataValidation（下拉列表/范围/自定义等），{} 移除。' },

  // Row-level tools
  row_get: { label: '读取行信息', desc: '读取行的高度/隐藏状态/索引及行级样式（numFmt/font/alignment/border/fill）。' },
  row_set_height: { label: '设置行高', desc: '设置 row.height（像素）。' },
  row_set_hidden: { label: '隐藏/显示行', desc: '设置 row.hidden（true 隐藏 / false 显示）。' },
  row_set_num_fmt: { label: '设置行数字格式', desc: '设置 row.numFmt 数字格式，null 清空。' },
  row_set_font: { label: '设置行字体', desc: '设置 row.font 字体样式（行级）。' },
  row_set_alignment: { label: '设置行对齐', desc: '设置 row.alignment 对齐方式（行级）。' },
  row_set_border: { label: '设置行边框', desc: '设置 row.border 边框样式（行级），{} 清空。' },
  row_set_fill: { label: '设置行填充', desc: '设置 row.fill 填充样式（行级），{} 清空。' },
  row_get_cell: { label: '按行获取单元格', desc: '通过 row.getCell(col) 获取该行某列单元格的快照。' },

  // Drawing-level tools
  drawing_get: { label: '读取图形对象', desc: '按 id 读取 Drawing（图表/图片/形状等）的快照信息。' },
  drawing_update: { label: '更新图形对象', desc: '按 id 更新 Drawing 属性（位置/大小/锚点/样式/文本/图表 option 等）。' },
  drawing_upd_index: { label: '调整图形图层顺序', desc: '调用 drawing.updIndex(direction) 调整层级：up/down/top/bottom。' },

  // Layout-level tools
  layout_get: { label: '读取布局状态', desc: '读取 SN.Layout 的菜单栏/工具栏/公式栏/Sheet标签栏/AI聊天等显示状态与 menuConfig。' },
  layout_set: { label: '设置布局显示', desc: '设置 SN.Layout 的 showMenuBar/showToolbar/showFormulaBar/showSheetTabBar/showAIChat/showAIChatWindow。只修改传入字段。' },

  // Utils
  utils_num_to_char: { label: '数字转列标', desc: 'SN.Utils.numToChar(num)：0->A, 25->Z, 26->AA。' },
  utils_char_to_num: { label: '列标转数字', desc: 'SN.Utils.charToNum(char)：A->0, Z->25, AA->26。' },
  utils_range_num_to_str: { label: '范围对象转字符串', desc: 'SN.Utils.rangeNumToStr({s:{r,c},e:{r,c}})：例如 A1:C3。' },
  utils_cell_str_to_num: { label: '单元格字符串转数字对象', desc: 'SN.Utils.cellStrToNum("A1") -> {r:0,c:0}。' },
  utils_cell_num_to_str: { label: '单元格数字对象转字符串', desc: 'SN.Utils.cellNumToStr({r:0,c:0}) -> "A1"。' },
  utils_msg: { label: '消息提示', desc: 'SN.Utils.msg("...")：显示 3 秒后自动消失的提示。' },
  utils_modal: { label: '模态弹窗', desc: 'SN.Utils.modal(options)：显示弹窗，确定 resolve、取消 reject（工具会 await 并返回 confirmed/canceled）。' },

  // History
  history_undo: { label: '撤销', desc: 'SN.UndoRedo.undo()：撤销上一步操作。' },
  history_redo: { label: '重做', desc: 'SN.UndoRedo.redo()：重做上一步操作。' },
};

const sheetToolDefinitions = computed(() => {
  const tools = getSheetTools();
  return (tools || [])
    .map((t) => {
      const name = t?.function?.name;
      if (!name) return null;
      const meta = TOOL_I18N[name] || { label: name, desc: t?.function?.description || '' };
      const category = t?.xCategory || t?.category || 'other';
      return { name, label: meta.label, desc: meta.desc, category };
    })
    .filter(Boolean);
});

const filteredToolDefinitions = computed(() => {
  const q = String(toolSearch.value || '').trim().toLowerCase();
  const defs = sheetToolDefinitions.value || [];
  if (!q) return defs;
  return defs.filter((d) => {
    return (
      String(d.name).toLowerCase().includes(q) ||
      String(d.label).toLowerCase().includes(q) ||
      String(d.desc).toLowerCase().includes(q) ||
      String(d.category || '').toLowerCase().includes(q)
    );
  });
});

const groupedToolDefinitions = computed(() => {
  const defs = filteredToolDefinitions.value || [];
  const groups = new Map();
  for (const d of defs) {
    const cat = d.category || 'other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(d);
  }
  const out = Array.from(groups.entries()).map(([category, items]) => ({
    category,
    label: TOOL_CATEGORY_I18N[category] || category,
    items: items.sort((a, b) => String(a.label).localeCompare(String(b.label))),
  }));
  out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  return out;
});

function selectAllTools() {
  selectedToolNames.value = filteredToolDefinitions.value.map((d) => d.name);
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

// ---------- Sheet tool executor (use unified executor) ----------
async function runSheetToolCall(call) {
  // Delegate to the shared executor so ALL tools defined in sheetTools.js are supported.
  const toolName = call?.function?.name || call?.name;

  // If locked, force all sheet-scoped ops to run on current active sheet + anchor cell.
  if (lockToActiveSheet.value) {
    // Do not allow creating new sheets in locked mode.
    if (toolName === 'sheet_add_sheet' || toolName === 'workbook_add_sheet') {
      return { ok: false, error: 'Locked to current sheet: creating new sheets is disabled in this conversation.', tool: toolName };
    }

    // Inject/override args
    const rawArgs = call?.function?.arguments ?? call?.arguments ?? {};
    const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {});
    if (targetSheetName.value) args.sheet = targetSheetName.value;

    // For range writes, prefer startCell = current anchor.
    if (toolName === 'sheet_set_range_values' && !args.range) {
      args.startCell = args.startCell || anchorCell.value || 'A1';
    }
    if (toolName === 'sheet_insert_table') {
      args.startCell = args.startCell || anchorCell.value || 'A1';
    }

    // For drawings, set startCell to anchor if missing.
    if (toolName === 'sheet_add_drawing') {
      args.config = args.config || {};
      if (!args.config.startCell) args.config.startCell = anchorCell.value || 'A1';
    }

    // For sheet_get_info, do not force a named sheet; we want current active selection.
    if (toolName === 'sheet_get_info') {
      delete args.sheet;
    }

    const patched = {
      ...call,
      function: call.function
        ? {
            ...call.function,
            arguments: JSON.stringify(args),
          }
        : undefined,
      arguments: call.function ? undefined : args,
    };

    return await executeSheetToolCall(props.sheet, patched);
  }

  const result = await executeSheetToolCall(props.sheet, call);
  return result;
}

async function pushSystem(content) {
  messages.value.push({
    id: crypto.randomUUID?.() ?? String(Date.now()),
    role: 'system',
    createdAt: Date.now(),
    content,
  });
  await scrollToBottom();
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

  // 每次发送前，同步一次当前选区作为锚点（避免默认 A1）
  await refreshAnchorFromSelection();

  messages.value.push({ id: crypto.randomUUID?.() ?? String(Date.now()), role: 'user', createdAt: Date.now(), content });
  draft.value = '';
  await scrollToBottom();

  const assistantId = crypto.randomUUID?.() ?? String(Date.now() + 1);
  messages.value.push({ id: assistantId, role: 'assistant', createdAt: Date.now(), content: '思考中…' });
  await scrollToBottom();

  const selected = llmConfigs.value.find((c) => c.id === activeConfigId.value);
  if (!selected) {
    messages.value.push({
      id: crypto.randomUUID?.() ?? String(Date.now() + 2),
      role: 'system',
      createdAt: Date.now(),
      content: '请先在设置->模型设置里创建/选择模型配置。',
    });
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

    // tool loop (max 5)
    let loopMessages = [...baseMessages];
    let finalText = '';
    let didRunTools = false;

    // 在编辑模式下：先注入当前 sheet 的上下文（默认限制 50x26，避免 prompt 过大）
    if (mode.value === '编辑' && includeSheetContext.value) {
      try {
        const ctx = await executeSheetToolCall(props.sheet, {
          function: {
            name: 'sheet_export_sheet_context',
            arguments: JSON.stringify({
              sheet: targetSheetName.value || undefined,
              maxRows: 50,
              maxCols: 26,
              withStyles: true,
            }),
          },
        });
        loopMessages.push({
          role: 'system',
          content: '当前工作表上下文（用于后续编辑决策，注意有尺寸限制）：\n' + JSON.stringify(ctx, null, 2),
        });
      } catch {
        // ignore context failures
      }
    }

    await pushSystem('编辑模式：正在分析是否需要调用工具…');

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
            scrollToBottom();
          },
        }).catch(() => {
          // fallback to non-stream text
          const idx = messages.value.findIndex((m) => m.id === assistantId);
          if (idx >= 0) messages.value[idx] = { ...messages.value[idx], content: finalText || '' };
          scrollToBottom();
        });
        return;
      }

      // Append assistant tool call message + tool results.
      loopMessages.push({ role: 'assistant', content: resp.content || '', tool_calls: resp.toolCalls });

      didRunTools = true;
      await pushSystem(`检测到工具调用：${resp.toolCalls.length} 个，开始执行…`);

      for (const tc of resp.toolCalls) {
        const toolName = tc?.function?.name || '(unknown)';
        await pushSystem(`→ 执行工具：${toolDisplayName(toolName)}`);
        const result = await runSheetToolCall(tc);
        await pushSystem(`✓ 工具完成：${toolDisplayName(toolName)}`);
        loopMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }

      await waitSheetRendered();
      await scrollToBottom();
    }

    if (didRunTools) {
      await pushSystem('表格更新中…（等待渲染完成）');
      await waitSheetRendered();
      await pushSystem('表格已更新并渲染完成。');
    }

    const idx = messages.value.findIndex((m) => m.id === assistantId);
    if (idx >= 0) messages.value[idx] = { ...messages.value[idx], content: finalText || '' };
    await scrollToBottom();
  } finally {
    requesting.value = false;
    await scrollToBottom();
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

.tool-list {
  max-height: 400px;
  overflow-y: auto;
}
</style>
