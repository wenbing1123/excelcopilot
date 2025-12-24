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

            <!-- 配置名（取代原“模型”provider） -->
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
  </aside>
</template>

<script setup>
import { ref, computed, nextTick, watch, reactive, onMounted } from 'vue';
import { Document, Folder, Delete } from '@element-plus/icons-vue';
import { getProviderDefaults, chatCompletion, chatCompletionStream, PROVIDERS } from '../services/llmClient.js';
import { listLlmConfigs, createLlmConfig, updateLlmConfig, deleteLlmConfig } from '../services/llmConfigApi.js';
import {
  getRecentConversation,
  listConversations as apiListConversations,
  getConversationMessages,
  createConversation,
  saveConversation,
} from '../services/conversationApi.js';
import {
  listSystemPrompts,
  createSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
  getActiveSystemPrompt,
  setActiveSystemPrompt,
} from '../services/systemPromptApi.js';
import { buildDebugPrompt } from '../services/debugPrompt.js';

// SheetNext 实例（由 App.vue 传入）
const props = defineProps({
  sheet: { type: Object, default: null },
  cockpitId: { type: String, default: '' },
});

const hasSheet = computed(() => !!props.sheet);

// 基础聊天状态（之前缺失导致 messages is not defined 白屏）
const draft = ref('');
const messages = ref([]);

const scrollbarRef = ref(null);
const bottomRef = ref(null);

// Context scope (placeholder: sheet/workbook)
const contextScope = ref('sheet');

const serverStatus = ref('');

const pickedHint = computed(() => {
  return serverStatus.value || '配置服务：未连接';
});

// 模式顺序：提问、编辑、智能体、计划
const modes = ['提问', '编辑', '智能体', '计划'];
const mode = ref(modes[0]);

// 调试：打印本次请求的完整提示词（仅开发使用）
const showPromptDebug = ref(false);

const settingsOpen = ref(false);
const settingsSection = ref('general');

const providerDefaults = {
  [PROVIDERS.GPT]: getProviderDefaults(PROVIDERS.GPT),
  [PROVIDERS.DEEPSEEK]: getProviderDefaults(PROVIDERS.DEEPSEEK),
  [PROVIDERS.DOUBAO]: getProviderDefaults(PROVIDERS.DOUBAO),
};

// providers list for model config UI
const models = [PROVIDERS.GPT, PROVIDERS.DEEPSEEK, PROVIDERS.DOUBAO];

function openSettings() {
  settingsOpen.value = true;
  // 默认进入通用设置，方便看到系统提示词/调试开关
  settingsSection.value = 'general';
}

const emit = defineEmits(['open-history']);

defineExpose({
  openSettings,
  // 下面这些给 App 的“历史对话弹窗”用
  listConversations,
  loadConversationById,
  newConversation,
  saveCurrentConversation,
});


// 滚动到底部：放在 messages 定义之后
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
  // 兼容旧 footer 的“保存”按钮：保存到 SQLite
  return saveConfigDb();
}

function resetConfig() {
  // 重置为新建
  return newConfig();
}

const requesting = ref(false);
let abortController = null;

const activeConfigLabel = computed(() => {
  const c = llmConfigs.value.find((x) => x.id === activeConfigId.value);
  return c?.name || '未选择配置';
});

// 让发送时展示更友好（显示 provider + modelName）
const activeModelHint = computed(() => {
  const c = llmConfigs.value.find((x) => x.id === activeConfigId.value);
  if (!c) return '';
  const p = c.provider;
  const defaults = providerDefaults[p] || { model: '' };
  const mn = c.modelName || defaults.model;
  return `${p}${mn ? ' / ' + mn : ''}`;
});

onMounted(() => {
  refreshConfigs();
  loadRecentConversation();
  // 加载系统提示词（用于注入 system message）
  refreshSystemPrompts();
});

async function send() {
  const content = draft.value.trim();
  if (!content) return;

  const scopeLabel = contextScope.value === 'workbook' ? '整个Excel' : '当前Sheet';

  const userId = crypto.randomUUID?.() ?? String(Date.now());
  const userMsg = {
    id: userId,
    role: 'user',
    createdAt: Date.now(),
    content,
    meta: {
      mode: mode.value,
      configName: activeConfigLabel.value,
      modelHint: activeModelHint.value,
      contextScope: contextScope.value,
      contextLabel: scopeLabel,
    },
  };
  messages.value.push(userMsg);

  // 如果当前还没有会话记录（新建会话后的第一次发言），先创建会话并用首条 user 生成标题
  if (!activeConversationId.value) {
    const title = deriveTitleFromMessages(messages.value);
    if (title) {
      const created = await createConversation(title);
      activeConversationId.value = created?.id ?? null;
    }
  }

  // 先把 user 消息保存进库（这样“最近会话”至少有内容）
  try {
    await saveCurrentConversation();
  } catch {
    // ignore
  }

  if (mode.value === '编辑') {
    handleEditCommand(content);
    draft.value = '';
    return;
  }

  draft.value = '';

  const selected = llmConfigs.value.find((c) => c.id === activeConfigId.value);
  if (!selected) {
    messages.value.push({
      id: crypto.randomUUID?.() ?? String(Date.now() + 2),
      role: 'system',
      createdAt: Date.now(),
      content: '未选择任何模型配置：请先在 设置 -> 模型设置 中创建/选择配置。',
    });
    return;
  }

  const assistantId = crypto.randomUUID?.() ?? String(Date.now() + 1);
  messages.value.push({
    id: assistantId,
    role: 'assistant',
    createdAt: Date.now(),
    content: '正在思考…',
  });

  try {
    requesting.value = true;
    abortController?.abort?.();
    abortController = new AbortController();

    const provider = selected.provider;

    const providerCfg = {
      apiKey: selected.apiKey,
      baseUrl: selected.baseUrl,
      modelName: selected.modelName,
    };

    const inputMessages = messages.value
      .filter((m) => m.id !== assistantId) // 排除占位
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));

    // 注入系统提示词（system prompt）作为第一条 system message
    const fallbackPromptId = activeSystemPromptId.value ?? systemPrompts.value[0]?.id ?? null;
    const sysPrompt = systemPrompts.value.find((p) => p.id === fallbackPromptId);
    const sysText = String(sysPrompt?.content || '').trim();
    const finalMessages = sysText
      ? [{ role: 'system', content: sysText }, ...inputMessages]
      : inputMessages;

    // Debug: 在控制台输出本次实际发送的完整 messages
    const defaults = providerDefaults[provider] || { baseUrl: '', model: '' };
    const debugPayload = buildDebugPrompt({
      provider,
      baseUrl: providerCfg.baseUrl || defaults.baseUrl,
      modelName: providerCfg.modelName || defaults.model,
      messages: finalMessages,
    });
    if (showPromptDebug.value) {
      console.log('[LLM DEBUG] request payload:', debugPayload);
    } else {
      console.log('[LLM DEBUG] system prompt:', sysText ? `ON (${sysText.slice(0, 40)}${sysText.length > 40 ? '…' : ''})` : 'OFF');
    }

    const idx = messages.value.findIndex((m) => m.id === assistantId);
    if (idx >= 0) {
      messages.value[idx] = {
        ...messages.value[idx],
        createdAt: Date.now(),
        content: '',
      };
    }

    // 流式：每次增量都追加到同一条 assistant 消息
    const appendDelta = async (delta) => {
      if (!delta) return;
      const i = messages.value.findIndex((m) => m.id === assistantId);
      if (i < 0) return;
      messages.value[i] = {
        ...messages.value[i],
        content: (messages.value[i].content || '') + delta,
      };
      await nextTick();
      bottomRef.value?.scrollIntoView({ block: 'end' });
    };

    try {
      await chatCompletionStream({
        provider,
        config: providerCfg,
        messages: finalMessages,
        signal: abortController.signal,
        onDelta: (d) => {
          // 做“逐字”效果：把 token 再拆成字符按微任务写入
          const chars = String(d || '').split('');
          for (const ch of chars) {
            // 不 await，避免阻塞解析；用 microtask 排队
            Promise.resolve().then(() => appendDelta(ch));
          }
        },
      });

      // 流式结束后保存（assistant 回复入库）
      try {
        await saveCurrentConversation();
      } catch {
        // ignore
      }
    } catch (streamErr) {
      // 回退：非流式一次性
      const resp = await chatCompletion({
        provider,
        config: providerCfg,
        messages: finalMessages,
        signal: abortController.signal,
      });
      const i = messages.value.findIndex((m) => m.id === assistantId);
      if (i >= 0) {
        messages.value[i] = {
          ...messages.value[i],
          createdAt: Date.now(),
          content: resp.content,
        };
      }

      // 非流式完成后保存
      try {
        await saveCurrentConversation();
      } catch {
        // ignore
      }
    }
  } catch (e) {
    const idx = messages.value.findIndex((m) => m.id === assistantId);
    const errText = `请求失败：${e?.message ?? String(e)}`;
    if (idx >= 0) {
      messages.value[idx] = {
        ...messages.value[idx],
        role: 'system',
        createdAt: Date.now(),
        content: errText,
      };
    } else {
      messages.value.push({
        id: crypto.randomUUID?.() ?? String(Date.now() + 2),
        role: 'system',
        createdAt: Date.now(),
        content: errText,
      });
    }
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

const llmConfigs = ref([]);
const activeConfigId = ref(null);
const editingConfig = reactive({ id: null, name: '', provider: PROVIDERS.GPT, baseUrl: '', apiKey: '', modelName: '' });
const configsLoading = ref(false);

async function refreshConfigs() {
  configsLoading.value = true;
  try {
    const rows = await listLlmConfigs();
    llmConfigs.value = Array.isArray(rows) ? rows : [];
    serverStatus.value = '配置服务：已连接';

    // 如果当前没有选中，则自动选中第一条
    if (activeConfigId.value == null && llmConfigs.value.length > 0) {
      activeConfigId.value = llmConfigs.value[0].id;
    }

    // 同步编辑表单
    loadEditingFromSelected();
  } catch (e) {
    serverStatus.value = '配置服务：未启动';
    llmConfigs.value = [];
    activeConfigId.value = null;
    // 只提示一次，避免刷屏
    const already = messages.value.some((m) => m.role === 'system' && String(m.content || '').includes('模型配置服务不可用'));
    if (!already) {
      messages.value.push({
        id: crypto.randomUUID?.() ?? String(Date.now()),
        role: 'system',
        createdAt: Date.now(),
        content: `模型配置服务不可用：${e?.message ?? String(e)}`,
      });
    }
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
  if (saved?.id != null) {
    activeConfigId.value = saved.id;
  }
  await refreshConfigs();

  // 保存后关闭弹窗
  settingsOpen.value = false;

  messages.value.push({
    id: crypto.randomUUID?.() ?? String(Date.now()),
    role: 'system',
    createdAt: Date.now(),
    content: '模型配置已保存。',
  });
}

async function removeSelectedConfig() {
  if (!activeConfigId.value) return;

  await deleteLlmConfig(activeConfigId.value);
  activeConfigId.value = null;
  await refreshConfigs();
  if (!activeConfigId.value) newConfig();
}

const activeConversationId = ref(null);

function mapDbMessageToUi(m) {
  return {
    id: String(m.id ?? crypto.randomUUID?.() ?? Date.now()),
    role: m.role,
    createdAt: m.createdAt ? Date.parse(m.createdAt) || Date.now() : Date.now(),
    content: m.content,
  };
}

function normalizeTitle(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '(无标题)';
  // 截断，避免太长
  return s.length > 30 ? s.slice(0, 30) + '…' : s;
}

function deriveTitleFromMessages(msgs) {
  const firstUser = (msgs || []).find((m) => m?.role === 'user' && String(m?.content || '').trim());
  if (!firstUser) return '';

  const text = String(firstUser.content || '').trim();
  return normalizeTitle(text);
}

async function loadRecentConversation() {
  try {
    const rec = await getRecentConversation();
    if (!rec || !rec.id) {
      // 没有历史会话就保持空白，不创建占位会话
      activeConversationId.value = null;
      messages.value = [];
      return;
    }

    activeConversationId.value = rec.id;
    const data = await getConversationMessages(rec.id);
    const dbMsgs = Array.isArray(data?.messages) ? data.messages : [];
    messages.value = dbMsgs.map(mapDbMessageToUi);
    await nextTick();
    bottomRef.value?.scrollIntoView({ block: 'end' });
  } catch (e) {
    // 不阻断 UI
    messages.value.push({
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: 'system',
      createdAt: Date.now(),
      content: `加载最近会话失败：${e?.message ?? String(e)}`,
    });
  }
}

async function loadConversationById(id) {
  const data = await getConversationMessages(id);
  activeConversationId.value = id;
  const dbMsgs = Array.isArray(data?.messages) ? data.messages : [];
  messages.value = dbMsgs.map(mapDbMessageToUi);
  await nextTick();
  bottomRef.value?.scrollIntoView({ block: 'end' });
}

async function saveCurrentConversation() {
  // 没有任何 user 消 Messages 时，不保存/不创建会话（避免历史里出现无意义记录）
  let title = deriveTitleFromMessages(messages.value);
  if (!title) {
    // 如果已经有会话 id（比如从历史加载来的），允许保存为空内容的更新（比如只剩 assistant/system）
    if (!activeConversationId.value) return;
    title = '(无标题)';
  }

  if (!activeConversationId.value) {
    const created = await createConversation(title);
    activeConversationId.value = created?.id ?? null;
  }

  const payload = {
    title,
    messages: messages.value.map((m) => ({ role: m.role, content: m.content })),
  };

  await saveConversation(activeConversationId.value, payload);
}

async function newConversation() {
  // 点击必须“立刻清空 UI”，即便保存失败也不能卡住
  try {
    await saveCurrentConversation();
  } catch (e) {
    messages.value.push({
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: 'system',
      createdAt: Date.now(),
      content: `保存当前会话失败：${e?.message ?? String(e)}`,
    });
  } finally {
    activeConversationId.value = null;
    messages.value = [];
    draft.value = '';
    await nextTick();
    bottomRef.value?.scrollIntoView({ block: 'end' });
  }
}

async function listConversations() {
  return apiListConversations();
}

const systemPrompts = ref([]);
const activeSystemPromptId = ref(null);
const promptLoading = ref(false);
const editingPrompt = reactive({ id: null, name: '', content: '' });

async function refreshSystemPrompts() {
  promptLoading.value = true;
  try {
    const rows = await listSystemPrompts();
    systemPrompts.value = Array.isArray(rows) ? rows : [];
    const active = await getActiveSystemPrompt();
    activeSystemPromptId.value = active?.activeSystemPromptId ?? null;

    // 如果后端还没有设置选中项，但本地已有 prompts，则默认选中第一条并持久化
    if (activeSystemPromptId.value == null && systemPrompts.value.length > 0) {
      activeSystemPromptId.value = systemPrompts.value[0].id;
      try {
        await setActiveSystemPrompt(activeSystemPromptId.value);
      } catch {
        // ignore
      }
    }

    // 同步编辑区
    const row = systemPrompts.value.find((p) => p.id === activeSystemPromptId.value) || systemPrompts.value[0];
    if (row) {
      editingPrompt.id = row.id;
      editingPrompt.name = row.name;
      editingPrompt.content = row.content;
    } else {
      editingPrompt.id = null;
      editingPrompt.name = '';
      editingPrompt.content = '';
    }
  } catch (e) {
    messages.value.push({
      id: crypto.randomUUID?.() ?? String(Date.now()),
      role: 'system',
      createdAt: Date.now(),
      content: `加载系统提示词失败：${e?.message ?? String(e)}`,
    });
  } finally {
    promptLoading.value = false;
  }
}

function newPrompt() {
  editingPrompt.id = null;
  editingPrompt.name = '';
  editingPrompt.content = '';
}

async function savePromptDb() {
  const payload = {
    name: editingPrompt.name,
    content: editingPrompt.content,
  };

  const saved = editingPrompt.id
    ? await updateSystemPrompt(editingPrompt.id, payload)
    : await createSystemPrompt(payload);

  await refreshSystemPrompts();
  if (saved?.id != null) {
    activeSystemPromptId.value = saved.id;
    // 关键：把选中项持久化到 app_settings，避免刷新/重开后丢失
    try {
      await setActiveSystemPrompt(saved.id);
    } catch {
      // ignore
    }
  }
  await refreshSystemPrompts();

  messages.value.push({
    id: crypto.randomUUID?.() ?? String(Date.now()),
    role: 'system',
    createdAt: Date.now(),
    content: '系统提示词已保存。',
  });
}

async function removePromptDb() {
  if (!editingPrompt.id) return;

  await deleteSystemPrompt(editingPrompt.id);
  editingPrompt.id = null;
  await refreshSystemPrompts();
  if (!activeSystemPromptId.value) newPrompt();
}

// 选择系统提示词后，加载其内容到编辑区
async function loadPromptFromSelection() {
  const row = systemPrompts.value.find((p) => p.id === activeSystemPromptId.value);
  if (row) {
    editingPrompt.id = row.id;
    editingPrompt.name = row.name;
    editingPrompt.content = row.content;
    // 关键：切换选择时持久化
    try {
      await setActiveSystemPrompt(row.id);
    } catch {
      // ignore
    }
  } else {
    editingPrompt.id = null;
    editingPrompt.name = '';
    editingPrompt.content = '';
    try {
      await setActiveSystemPrompt(null);
    } catch {
      // ignore
    }
  }
}

// 初始化加载
refreshSystemPrompts();

async function openHistory() {
  // 打开历史前先保存当前会话，避免“最近会话”消息为空
  try {
    await saveCurrentConversation();
  } catch {
    // ignore
  }
  emit('open-history');
}
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
