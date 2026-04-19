import * as webllm from "../../webllm-components";

type VisualizeAIInitParams = {
  getCode: () => string;
  getMode: () => string;
};

const messages: any[] = [
  {
    content: "You are a Python tutor. Respond ONLY with Socratic-style hints: short, guiding QUESTIONS (no solutions, no code, no imperative fixes). At most 100 words.",
    role: "system",
  },
];

const availableModels = webllm.prebuiltAppConfig.model_list.map((m) => m.model_id);
const CHAT_MAX_OUTPUT_TOKENS = 512;
const CHAT_STOP_SEQUENCES = ["<|endoftext|>", "<|im_end|>"];

const engine = new webllm.MLCEngine();
let selectedModel = "sft_model_1.5B-q4f16_1-MLC (Hugging Face)";
let isEngineReady = false;

function getEl<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function hasFrontendError(): boolean {
  const errorOutput = getEl<HTMLElement>("frontendErrorOutput");
  return !!errorOutput && (errorOutput.textContent || "").trim() !== "";
}

function setPanelVisibility(getMode: () => string) {
  const panel = getEl<HTMLElement>("visualize-ai-panel");
  const askButton = getEl<HTMLButtonElement>("viz-ask-ai");
  if (!panel || !askButton) {
    return;
  }

  const inAiDisplay = getMode() === "ai_display";
  panel.style.display = inAiDisplay ? "block" : "none";
  askButton.style.display = inAiDisplay && hasFrontendError() ? "inline-block" : "none";

  if (!inAiDisplay) {
    const msg = getEl<HTMLElement>("viz-message-out");
    const stats = getEl<HTMLElement>("viz-chat-stats");
    if (msg) {
      msg.classList.add("hidden");
      msg.textContent = "";
    }
    if (stats) {
      stats.classList.add("hidden");
      stats.textContent = "";
    }
  }
}

async function initializeWebLLMEngine() {
  const status = getEl<HTMLElement>("viz-download-status");
  const modelSelect = getEl<HTMLSelectElement>("viz-model-selection");
  if (!status || !modelSelect) {
    return;
  }

  status.classList.remove("hidden");
  status.textContent = "Loading local model ...";
  selectedModel = modelSelect.value;
  await engine.reload(selectedModel, {
    temperature: 0.75,
    top_p: 1,
  } as any);
  isEngineReady = true;
  status.textContent = "Model ready.";
}

function buildQuestion(code: string, frontendError: string): string {
  const cleanedError = (frontendError || "").replace("(UNSUPPORTED FEATURES)", "").trim();
  return "## Code ```python  " + code + "  ```  ## Error  ```text  " + cleanedError +
    "  ```  ## Task  Ask guiding questions that help me discover the mistake.";
}

async function sendAskAI(question: string) {
  const output = getEl<HTMLElement>("viz-message-out");
  const stats = getEl<HTMLElement>("viz-chat-stats");
  if (!output || !stats) {
    return;
  }

  if (!isEngineReady) {
    output.classList.remove("hidden");
    output.textContent = "Please pull a local model first.";
    return;
  }

  messages.length = 1;
  messages.push({ content: question, role: "user" });
  
  console.log("[VisualizeAI] Messages before sending:", JSON.parse(JSON.stringify(messages)));
  
  output.classList.remove("hidden");
  output.textContent = "AI is thinking...";
  stats.classList.add("hidden");
  stats.textContent = "";

  try {
    let usage: any = undefined;
    let curMessage = "";
    const completion: any = await engine.chat.completions.create({
      stream: true,
      messages,
      temperature: 0.75,
      top_p: 1,
      max_tokens: CHAT_MAX_OUTPUT_TOKENS,
      stop: CHAT_STOP_SEQUENCES,
      stream_options: { include_usage: true },
    } as any);
    for await (const chunk of completion) {
      const curDelta = chunk.choices[0]?.delta.content;
      if (curDelta) {
        curMessage += curDelta;
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
      output.textContent = "AI Response:\n" + curMessage;
    }

    const finalMessage = await engine.getMessage();

    console.log("[VisualizeAI] Raw model response:", finalMessage);
    
    output.textContent = "AI Response:\n" + finalMessage;
    if (usage && usage.prompt_tokens && usage.extra) {
      stats.classList.remove("hidden");
      stats.textContent =
        `prompt_tokens: ${usage.prompt_tokens}, completion_tokens: ${usage.completion_tokens}, ` +
        `prefill: ${usage.extra.prefill_tokens_per_s.toFixed(4)} tokens/sec, ` +
        `decoding: ${usage.extra.decode_tokens_per_s.toFixed(4)} tokens/sec`;
    }
  } catch (err) {
    output.textContent = "Error: " + String(err);
  }
}

export function initVisualizeAI(params: VisualizeAIInitParams) {
  const modelSelection = getEl<HTMLSelectElement>("viz-model-selection");
  const downloadBtn = getEl<HTMLButtonElement>("viz-download");
  const askAIButton = getEl<HTMLButtonElement>("viz-ask-ai");
  const frontendErrorOutput = getEl<HTMLElement>("frontendErrorOutput");

  if (!modelSelection || !downloadBtn || !askAIButton || !frontendErrorOutput) {
    return;
  }

  modelSelection.innerHTML = "";
  availableModels.forEach((modelId) => {
    const option = document.createElement("option");
    option.value = modelId;
    option.textContent = modelId;
    modelSelection.appendChild(option);
  });
  modelSelection.value = selectedModel;

  askAIButton.disabled = true;
  downloadBtn.addEventListener("click", () => {
    initializeWebLLMEngine().then(() => {
      askAIButton.disabled = false;
    });
  });

  askAIButton.addEventListener("click", () => {
    const code = params.getCode();
    const errorText = (frontendErrorOutput.textContent || "").trim();
    const question = buildQuestion(code, errorText);
    sendAskAI(question);
  });

  const observer = new MutationObserver(() => {
    setPanelVisibility(params.getMode);
  });
  observer.observe(frontendErrorOutput, { childList: true, characterData: true, subtree: true });

  window.addEventListener("hashchange", () => {
    setPanelVisibility(params.getMode);
  });

  setPanelVisibility(params.getMode);
}
