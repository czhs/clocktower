import { proto3, Timestamp, Struct, Duration, Any } from '@bufbuild/protobuf';
export { Timestamp, protoInt64 } from '@bufbuild/protobuf';

const ChatRole = /* @__PURE__ */ proto3.makeEnum(
  "livekit.agent.ChatRole",
  [
    { no: 0, name: "DEVELOPER" },
    { no: 1, name: "SYSTEM" },
    { no: 2, name: "USER" },
    { no: 3, name: "ASSISTANT" }
  ]
);
const AgentState = /* @__PURE__ */ proto3.makeEnum(
  "livekit.agent.AgentState",
  [
    { no: 0, name: "AS_INITIALIZING" },
    { no: 1, name: "AS_IDLE" },
    { no: 2, name: "AS_LISTENING" },
    { no: 3, name: "AS_THINKING" },
    { no: 4, name: "AS_SPEAKING" }
  ]
);
const UserState = /* @__PURE__ */ proto3.makeEnum(
  "livekit.agent.UserState",
  [
    { no: 0, name: "US_SPEAKING" },
    { no: 1, name: "US_LISTENING" },
    { no: 2, name: "US_AWAY" }
  ]
);
const ToolCallStatus = /* @__PURE__ */ proto3.makeEnum(
  "livekit.agent.ToolCallStatus",
  [
    { no: 0, name: "TC_RUNNING" },
    { no: 1, name: "TC_DONE" },
    { no: 2, name: "TC_ERROR" },
    { no: 3, name: "TC_CANCELLED" }
  ]
);
const ToolReplyStatus = /* @__PURE__ */ proto3.makeEnum(
  "livekit.agent.ToolReplyStatus",
  [
    { no: 0, name: "TR_SCHEDULED" },
    { no: 1, name: "TR_COMPLETED" },
    { no: 2, name: "TR_INTERRUPTED" },
    { no: 3, name: "TR_SKIPPED" }
  ]
);
const AmdCategory = /* @__PURE__ */ proto3.makeEnum(
  "livekit.agent.AmdCategory",
  [
    { no: 0, name: "AMD_UNKNOWN" },
    { no: 1, name: "AMD_HUMAN" },
    { no: 2, name: "AMD_MACHINE_IVR" },
    { no: 3, name: "AMD_MACHINE_VM" },
    { no: 4, name: "AMD_MACHINE_UNAVAILABLE" },
    { no: 5, name: "AMD_UNCERTAIN" }
  ]
);
const MetricsReport = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.MetricsReport",
  () => [
    { no: 1, name: "started_speaking_at", kind: "message", T: Timestamp },
    { no: 2, name: "stopped_speaking_at", kind: "message", T: Timestamp },
    { no: 3, name: "transcription_delay", kind: "scalar", T: 1, opt: true },
    { no: 4, name: "end_of_turn_delay", kind: "scalar", T: 1, opt: true },
    { no: 5, name: "on_user_turn_completed_delay", kind: "scalar", T: 1, opt: true },
    { no: 6, name: "llm_node_ttft", kind: "scalar", T: 1, opt: true },
    { no: 7, name: "tts_node_ttfb", kind: "scalar", T: 1, opt: true },
    { no: 8, name: "e2e_latency", kind: "scalar", T: 1, opt: true },
    { no: 9, name: "llm_node_tps", kind: "scalar", T: 1, opt: true },
    { no: 10, name: "llm_node_ttfs", kind: "scalar", T: 1, opt: true }
  ]
);
const TimedString = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.TimedString",
  () => [
    {
      no: 1,
      name: "text",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "start_time", kind: "scalar", T: 1, opt: true },
    { no: 3, name: "end_time", kind: "scalar", T: 1, opt: true },
    { no: 4, name: "confidence", kind: "scalar", T: 1, opt: true },
    { no: 5, name: "start_time_offset", kind: "scalar", T: 1, opt: true },
    { no: 6, name: "speaker_id", kind: "scalar", T: 9, opt: true }
  ]
);
const ChatMessage$1 = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.ChatMessage",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "role", kind: "enum", T: proto3.getEnumType(ChatRole) },
    { no: 3, name: "content", kind: "message", T: ChatMessage_ChatContent, repeated: true },
    {
      no: 4,
      name: "interrupted",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 5, name: "transcript_confidence", kind: "scalar", T: 1, opt: true },
    { no: 6, name: "extra", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 7, name: "metrics", kind: "message", T: MetricsReport },
    { no: 8, name: "created_at", kind: "message", T: Timestamp }
  ]
);
const ChatMessage_ChatContent = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.ChatMessage.ChatContent",
  () => [
    { no: 1, name: "text", kind: "scalar", T: 9, oneof: "payload" }
  ],
  { localName: "ChatMessage_ChatContent" }
);
const FunctionCall = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.FunctionCall",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "arguments",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "created_at", kind: "message", T: Timestamp }
  ]
);
const FunctionCallOutput = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.FunctionCallOutput",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "output",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "is_error",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 6, name: "created_at", kind: "message", T: Timestamp }
  ]
);
const AgentHandoff = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentHandoff",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "old_agent_id", kind: "scalar", T: 9, opt: true },
    {
      no: 3,
      name: "new_agent_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "created_at", kind: "message", T: Timestamp }
  ]
);
const AgentConfigUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentConfigUpdate",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "instructions", kind: "scalar", T: 9, opt: true },
    { no: 3, name: "tools_added", kind: "scalar", T: 9, repeated: true },
    { no: 4, name: "tools_removed", kind: "scalar", T: 9, repeated: true },
    { no: 5, name: "created_at", kind: "message", T: Timestamp }
  ]
);
const ChatContext = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.ChatContext",
  () => [
    { no: 1, name: "items", kind: "message", T: ChatContext_ChatItem, repeated: true }
  ]
);
const ChatContext_ChatItem = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.ChatContext.ChatItem",
  () => [
    { no: 1, name: "message", kind: "message", T: ChatMessage$1, oneof: "item" },
    { no: 2, name: "function_call", kind: "message", T: FunctionCall, oneof: "item" },
    { no: 3, name: "function_call_output", kind: "message", T: FunctionCallOutput, oneof: "item" },
    { no: 4, name: "agent_handoff", kind: "message", T: AgentHandoff, oneof: "item" },
    { no: 5, name: "agent_config_update", kind: "message", T: AgentConfigUpdate, oneof: "item" }
  ],
  { localName: "ChatContext_ChatItem" }
);
const LLMModelUsage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.LLMModelUsage",
  () => [
    {
      no: 1,
      name: "provider",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "model",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "input_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 4,
      name: "input_cached_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 5,
      name: "input_audio_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 6,
      name: "input_cached_audio_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 7,
      name: "input_text_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 8,
      name: "input_cached_text_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 9,
      name: "input_image_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 10,
      name: "input_cached_image_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 11,
      name: "output_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 12,
      name: "output_audio_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 13,
      name: "output_text_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 14,
      name: "session_duration",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    }
  ]
);
const TTSModelUsage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.TTSModelUsage",
  () => [
    {
      no: 1,
      name: "provider",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "model",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "input_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 4,
      name: "output_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 5,
      name: "characters_count",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 6,
      name: "audio_duration",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    }
  ]
);
const STTModelUsage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.STTModelUsage",
  () => [
    {
      no: 1,
      name: "provider",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "model",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "input_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 4,
      name: "output_tokens",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 5,
      name: "audio_duration",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    }
  ]
);
const InterruptionModelUsage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InterruptionModelUsage",
  () => [
    {
      no: 1,
      name: "provider",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "model",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "total_requests",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    }
  ]
);
const EotModelUsage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.EotModelUsage",
  () => [
    {
      no: 1,
      name: "provider",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "model",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "total_requests",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    }
  ]
);
const ModelUsage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.ModelUsage",
  () => [
    { no: 1, name: "llm", kind: "message", T: LLMModelUsage, oneof: "usage" },
    { no: 2, name: "tts", kind: "message", T: TTSModelUsage, oneof: "usage" },
    { no: 3, name: "stt", kind: "message", T: STTModelUsage, oneof: "usage" },
    { no: 4, name: "interruption", kind: "message", T: InterruptionModelUsage, oneof: "usage" },
    { no: 5, name: "eot", kind: "message", T: EotModelUsage, oneof: "usage" }
  ]
);
const AgentSessionUsage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionUsage",
  () => [
    { no: 1, name: "model_usage", kind: "message", T: ModelUsage, repeated: true }
  ]
);
const DebugMessage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.DebugMessage",
  () => [
    { no: 1, name: "payload", kind: "message", T: Struct }
  ]
);
const AgentSessionEvent = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent",
  () => [
    { no: 1, name: "created_at", kind: "message", T: Timestamp },
    { no: 10, name: "agent_state_changed", kind: "message", T: AgentSessionEvent_AgentStateChanged, oneof: "event" },
    { no: 11, name: "user_state_changed", kind: "message", T: AgentSessionEvent_UserStateChanged, oneof: "event" },
    { no: 12, name: "conversation_item_added", kind: "message", T: AgentSessionEvent_ConversationItemAdded, oneof: "event" },
    { no: 13, name: "user_input_transcribed", kind: "message", T: AgentSessionEvent_UserInputTranscribed, oneof: "event" },
    { no: 14, name: "function_tools_executed", kind: "message", T: AgentSessionEvent_FunctionToolsExecuted, oneof: "event" },
    { no: 15, name: "error", kind: "message", T: AgentSessionEvent_Error, oneof: "event" },
    { no: 16, name: "overlapping_speech", kind: "message", T: AgentSessionEvent_OverlappingSpeech, oneof: "event" },
    { no: 17, name: "session_usage_updated", kind: "message", T: AgentSessionEvent_SessionUsageUpdated, oneof: "event" },
    { no: 18, name: "amd_prediction", kind: "message", T: AgentSessionEvent_AmdPrediction, oneof: "event" },
    { no: 19, name: "eot_prediction", kind: "message", T: AgentSessionEvent_EotPrediction, oneof: "event" },
    { no: 20, name: "function_tools_started", kind: "message", T: AgentSessionEvent_FunctionToolsStarted, oneof: "event" },
    { no: 21, name: "debug_message", kind: "message", T: DebugMessage, oneof: "event" },
    { no: 22, name: "tool_execution_updated", kind: "message", T: AgentSessionEvent_ToolExecutionUpdated, oneof: "event" },
    { no: 23, name: "agent_false_interruption", kind: "message", T: AgentSessionEvent_AgentFalseInterruption, oneof: "event" }
  ]
);
const AgentSessionEvent_AgentStateChanged = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.AgentStateChanged",
  () => [
    { no: 1, name: "old_state", kind: "enum", T: proto3.getEnumType(AgentState) },
    { no: 2, name: "new_state", kind: "enum", T: proto3.getEnumType(AgentState) }
  ],
  { localName: "AgentSessionEvent_AgentStateChanged" }
);
const AgentSessionEvent_UserStateChanged = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.UserStateChanged",
  () => [
    { no: 1, name: "old_state", kind: "enum", T: proto3.getEnumType(UserState) },
    { no: 2, name: "new_state", kind: "enum", T: proto3.getEnumType(UserState) }
  ],
  { localName: "AgentSessionEvent_UserStateChanged" }
);
const AgentSessionEvent_ConversationItemAdded = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.ConversationItemAdded",
  () => [
    { no: 1, name: "item", kind: "message", T: ChatContext_ChatItem }
  ],
  { localName: "AgentSessionEvent_ConversationItemAdded" }
);
const AgentSessionEvent_UserInputTranscribed = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.UserInputTranscribed",
  () => [
    {
      no: 1,
      name: "transcript",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "is_final",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 3, name: "language", kind: "scalar", T: 9, opt: true }
  ],
  { localName: "AgentSessionEvent_UserInputTranscribed" }
);
const AgentSessionEvent_FunctionToolsStarted = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.FunctionToolsStarted",
  () => [
    { no: 1, name: "function_calls", kind: "message", T: FunctionCall, repeated: true }
  ],
  { localName: "AgentSessionEvent_FunctionToolsStarted" }
);
const AgentSessionEvent_FunctionToolsExecuted = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.FunctionToolsExecuted",
  () => [
    { no: 1, name: "function_calls", kind: "message", T: FunctionCall, repeated: true },
    { no: 2, name: "function_call_outputs", kind: "message", T: FunctionCallOutput, repeated: true }
  ],
  { localName: "AgentSessionEvent_FunctionToolsExecuted" }
);
const AgentSessionEvent_Error = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.Error",
  () => [
    {
      no: 1,
      name: "message",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "AgentSessionEvent_Error" }
);
const AgentSessionEvent_OverlappingSpeech = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.OverlappingSpeech",
  () => [
    {
      no: 1,
      name: "is_interruption",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 2, name: "overlap_started_at", kind: "message", T: Timestamp, opt: true },
    {
      no: 3,
      name: "detection_delay",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    { no: 4, name: "detected_at", kind: "message", T: Timestamp }
  ],
  { localName: "AgentSessionEvent_OverlappingSpeech" }
);
const AgentSessionEvent_AmdPrediction = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.AmdPrediction",
  () => [
    { no: 1, name: "speech_duration", kind: "message", T: Duration },
    { no: 2, name: "category", kind: "enum", T: proto3.getEnumType(AmdCategory) },
    {
      no: 3,
      name: "reason",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "transcript",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "delay", kind: "message", T: Duration }
  ],
  { localName: "AgentSessionEvent_AmdPrediction" }
);
const AgentSessionEvent_EotPrediction = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.EotPrediction",
  () => [
    {
      no: 1,
      name: "probability",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    {
      no: 2,
      name: "threshold",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    { no: 3, name: "inference_duration", kind: "message", T: Duration },
    { no: 4, name: "delay", kind: "message", T: Duration }
  ],
  { localName: "AgentSessionEvent_EotPrediction" }
);
const AgentSessionEvent_SessionUsageUpdated = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.SessionUsageUpdated",
  () => [
    { no: 1, name: "usage", kind: "message", T: AgentSessionUsage }
  ],
  { localName: "AgentSessionEvent_SessionUsageUpdated" }
);
const AgentSessionEvent_ToolExecutionUpdated = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.ToolExecutionUpdated",
  () => [
    { no: 1, name: "started", kind: "message", T: AgentSessionEvent_ToolExecutionUpdated_Started, oneof: "update" },
    { no: 2, name: "call_updated", kind: "message", T: AgentSessionEvent_ToolExecutionUpdated_CallUpdated, oneof: "update" },
    { no: 3, name: "reply_updated", kind: "message", T: AgentSessionEvent_ToolExecutionUpdated_ReplyUpdated, oneof: "update" },
    { no: 4, name: "ended", kind: "message", T: AgentSessionEvent_ToolExecutionUpdated_Ended, oneof: "update" }
  ],
  { localName: "AgentSessionEvent_ToolExecutionUpdated" }
);
const AgentSessionEvent_ToolExecutionUpdated_Started = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.ToolExecutionUpdated.Started",
  () => [
    { no: 1, name: "function_call", kind: "message", T: FunctionCall }
  ],
  { localName: "AgentSessionEvent_ToolExecutionUpdated_Started" }
);
const AgentSessionEvent_ToolExecutionUpdated_CallUpdated = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.ToolExecutionUpdated.CallUpdated",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "message",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "AgentSessionEvent_ToolExecutionUpdated_CallUpdated" }
);
const AgentSessionEvent_ToolExecutionUpdated_Ended = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.ToolExecutionUpdated.Ended",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "message", kind: "scalar", T: 9, opt: true },
    { no: 4, name: "status", kind: "enum", T: proto3.getEnumType(ToolCallStatus) }
  ],
  { localName: "AgentSessionEvent_ToolExecutionUpdated_Ended" }
);
const AgentSessionEvent_ToolExecutionUpdated_ReplyUpdated = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.ToolExecutionUpdated.ReplyUpdated",
  () => [
    { no: 1, name: "update_ids", kind: "scalar", T: 9, repeated: true },
    { no: 2, name: "status", kind: "enum", T: proto3.getEnumType(ToolReplyStatus) },
    {
      no: 3,
      name: "speech_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "AgentSessionEvent_ToolExecutionUpdated_ReplyUpdated" }
);
const AgentSessionEvent_AgentFalseInterruption = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionEvent.AgentFalseInterruption",
  () => [
    {
      no: 1,
      name: "resumed",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ],
  { localName: "AgentSessionEvent_AgentFalseInterruption" }
);
const SessionRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "ping", kind: "message", T: SessionRequest_Ping, oneof: "request" },
    { no: 4, name: "get_chat_history", kind: "message", T: SessionRequest_GetChatHistory, oneof: "request" },
    { no: 5, name: "run_input", kind: "message", T: SessionRequest_RunInput, oneof: "request" },
    { no: 6, name: "get_agent_info", kind: "message", T: SessionRequest_GetAgentInfo, oneof: "request" },
    { no: 7, name: "get_session_state", kind: "message", T: SessionRequest_GetSessionState, oneof: "request" },
    { no: 8, name: "get_rtc_stats", kind: "message", T: SessionRequest_GetRTCStats, oneof: "request" },
    { no: 9, name: "get_session_usage", kind: "message", T: SessionRequest_GetSessionUsage, oneof: "request" },
    { no: 10, name: "get_framework_info", kind: "message", T: SessionRequest_GetFrameworkInfo, oneof: "request" },
    { no: 11, name: "update_io", kind: "message", T: SessionRequest_UpdateIO, oneof: "request" },
    { no: 12, name: "finalize_simulation", kind: "message", T: SessionRequest_FinalizeSimulation, oneof: "request" }
  ]
);
const SessionRequest_Ping = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.Ping",
  [],
  { localName: "SessionRequest_Ping" }
);
const SessionRequest_GetChatHistory = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.GetChatHistory",
  [],
  { localName: "SessionRequest_GetChatHistory" }
);
const SessionRequest_RunInput = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.RunInput",
  () => [
    {
      no: 1,
      name: "text",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "SessionRequest_RunInput" }
);
const SessionRequest_GetAgentInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.GetAgentInfo",
  [],
  { localName: "SessionRequest_GetAgentInfo" }
);
const SessionRequest_GetSessionState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.GetSessionState",
  [],
  { localName: "SessionRequest_GetSessionState" }
);
const SessionRequest_GetRTCStats = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.GetRTCStats",
  [],
  { localName: "SessionRequest_GetRTCStats" }
);
const SessionRequest_GetSessionUsage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.GetSessionUsage",
  [],
  { localName: "SessionRequest_GetSessionUsage" }
);
const SessionRequest_GetFrameworkInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.GetFrameworkInfo",
  [],
  { localName: "SessionRequest_GetFrameworkInfo" }
);
const SessionRequest_UpdateIO = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.UpdateIO",
  () => [
    { no: 1, name: "input", kind: "message", T: SessionRequest_UpdateIO_Input, opt: true },
    { no: 2, name: "output", kind: "message", T: SessionRequest_UpdateIO_Output, opt: true }
  ],
  { localName: "SessionRequest_UpdateIO" }
);
const SessionRequest_UpdateIO_Input = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.UpdateIO.Input",
  () => [
    { no: 1, name: "audio_enabled", kind: "scalar", T: 8, opt: true },
    { no: 2, name: "video_enabled", kind: "scalar", T: 8, opt: true }
  ],
  { localName: "SessionRequest_UpdateIO_Input" }
);
const SessionRequest_UpdateIO_Output = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.UpdateIO.Output",
  () => [
    { no: 1, name: "audio_enabled", kind: "scalar", T: 8, opt: true },
    { no: 2, name: "video_enabled", kind: "scalar", T: 8, opt: true },
    { no: 3, name: "transcription_enabled", kind: "scalar", T: 8, opt: true }
  ],
  { localName: "SessionRequest_UpdateIO_Output" }
);
const SessionRequest_FinalizeSimulation = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionRequest.FinalizeSimulation",
  () => [
    {
      no: 1,
      name: "provisional_success",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 2,
      name: "provisional_reason",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "SessionRequest_FinalizeSimulation" }
);
const SessionResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "error", kind: "scalar", T: 9, opt: true },
    { no: 3, name: "pong", kind: "message", T: SessionResponse_Pong, oneof: "response" },
    { no: 5, name: "get_chat_history", kind: "message", T: SessionResponse_GetChatHistoryResponse, oneof: "response" },
    { no: 6, name: "run_input", kind: "message", T: SessionResponse_RunInputResponse, oneof: "response" },
    { no: 7, name: "get_agent_info", kind: "message", T: SessionResponse_GetAgentInfoResponse, oneof: "response" },
    { no: 8, name: "get_session_state", kind: "message", T: SessionResponse_GetSessionStateResponse, oneof: "response" },
    { no: 9, name: "get_rtc_stats", kind: "message", T: SessionResponse_GetRTCStatsResponse, oneof: "response" },
    { no: 10, name: "get_session_usage", kind: "message", T: SessionResponse_GetSessionUsageResponse, oneof: "response" },
    { no: 11, name: "get_framework_info", kind: "message", T: SessionResponse_GetFrameworkInfoResponse, oneof: "response" },
    { no: 12, name: "update_io", kind: "message", T: SessionResponse_UpdateIOResponse, oneof: "response" },
    { no: 13, name: "finalize_simulation", kind: "message", T: SessionResponse_FinalizeSimulationResponse, oneof: "response" }
  ]
);
const SessionResponse_Pong = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.Pong",
  [],
  { localName: "SessionResponse_Pong" }
);
const SessionResponse_GetChatHistoryResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.GetChatHistoryResponse",
  () => [
    { no: 1, name: "items", kind: "message", T: ChatContext_ChatItem, repeated: true }
  ],
  { localName: "SessionResponse_GetChatHistoryResponse" }
);
const SessionResponse_GetAgentInfoResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.GetAgentInfoResponse",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "instructions", kind: "scalar", T: 9, opt: true },
    { no: 3, name: "tools", kind: "scalar", T: 9, repeated: true },
    { no: 4, name: "chat_ctx", kind: "message", T: ChatContext_ChatItem, repeated: true }
  ],
  { localName: "SessionResponse_GetAgentInfoResponse" }
);
const SessionResponse_RunInputResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.RunInputResponse",
  () => [
    { no: 1, name: "items", kind: "message", T: ChatContext_ChatItem, repeated: true }
  ],
  { localName: "SessionResponse_RunInputResponse" }
);
const SessionResponse_GetSessionStateResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.GetSessionStateResponse",
  () => [
    { no: 1, name: "agent_state", kind: "enum", T: proto3.getEnumType(AgentState) },
    { no: 2, name: "user_state", kind: "enum", T: proto3.getEnumType(UserState) },
    {
      no: 3,
      name: "agent_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "options", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 5, name: "created_at", kind: "message", T: Timestamp }
  ],
  { localName: "SessionResponse_GetSessionStateResponse" }
);
const SessionResponse_GetRTCStatsResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.GetRTCStatsResponse",
  () => [
    { no: 1, name: "publisher_stats", kind: "message", T: Struct, repeated: true },
    { no: 2, name: "subscriber_stats", kind: "message", T: Struct, repeated: true }
  ],
  { localName: "SessionResponse_GetRTCStatsResponse" }
);
const SessionResponse_GetSessionUsageResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.GetSessionUsageResponse",
  () => [
    { no: 1, name: "usage", kind: "message", T: AgentSessionUsage },
    { no: 2, name: "created_at", kind: "message", T: Timestamp }
  ],
  { localName: "SessionResponse_GetSessionUsageResponse" }
);
const SessionResponse_GetFrameworkInfoResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.GetFrameworkInfoResponse",
  () => [
    {
      no: 1,
      name: "sdk",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "sdk_version",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "SessionResponse_GetFrameworkInfoResponse" }
);
const SessionResponse_UpdateIOResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.UpdateIOResponse",
  [],
  { localName: "SessionResponse_UpdateIOResponse" }
);
const SessionResponse_FinalizeSimulationResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.FinalizeSimulationResponse",
  () => [
    { no: 1, name: "user_verdict", kind: "message", T: SessionResponse_FinalizeSimulationResponse_SimulationVerdict }
  ],
  { localName: "SessionResponse_FinalizeSimulationResponse" }
);
const SessionResponse_FinalizeSimulationResponse_SimulationVerdict = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionResponse.FinalizeSimulationResponse.SimulationVerdict",
  () => [
    {
      no: 1,
      name: "success",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 2,
      name: "reason",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "SessionResponse_FinalizeSimulationResponse_SimulationVerdict" }
);
const AgentSessionMessage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionMessage",
  () => [
    { no: 1, name: "audio_input", kind: "message", T: AgentSessionMessage_ConsoleIO_AudioFrame, oneof: "message" },
    { no: 2, name: "audio_output", kind: "message", T: AgentSessionMessage_ConsoleIO_AudioFrame, oneof: "message" },
    { no: 3, name: "event", kind: "message", T: AgentSessionEvent, oneof: "message" },
    { no: 4, name: "request", kind: "message", T: SessionRequest, oneof: "message" },
    { no: 5, name: "response", kind: "message", T: SessionResponse, oneof: "message" },
    { no: 6, name: "audio_playback_flush", kind: "message", T: AgentSessionMessage_ConsoleIO_AudioPlaybackFlush, oneof: "message" },
    { no: 7, name: "audio_playback_clear", kind: "message", T: AgentSessionMessage_ConsoleIO_AudioPlaybackClear, oneof: "message" },
    { no: 8, name: "audio_playback_finished", kind: "message", T: AgentSessionMessage_ConsoleIO_AudioPlaybackFinished, oneof: "message" }
  ]
);
const AgentSessionMessage_ConsoleIO = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionMessage.ConsoleIO",
  [],
  { localName: "AgentSessionMessage_ConsoleIO" }
);
const AgentSessionMessage_ConsoleIO_AudioFrame = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionMessage.ConsoleIO.AudioFrame",
  () => [
    {
      no: 1,
      name: "data",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    },
    {
      no: 2,
      name: "sample_rate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "num_channels",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "samples_per_channel",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ],
  { localName: "AgentSessionMessage_ConsoleIO_AudioFrame" }
);
const AgentSessionMessage_ConsoleIO_AudioPlaybackFlush = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionMessage.ConsoleIO.AudioPlaybackFlush",
  [],
  { localName: "AgentSessionMessage_ConsoleIO_AudioPlaybackFlush" }
);
const AgentSessionMessage_ConsoleIO_AudioPlaybackClear = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionMessage.ConsoleIO.AudioPlaybackClear",
  [],
  { localName: "AgentSessionMessage_ConsoleIO_AudioPlaybackClear" }
);
const AgentSessionMessage_ConsoleIO_AudioPlaybackFinished = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionMessage.ConsoleIO.AudioPlaybackFinished",
  [],
  { localName: "AgentSessionMessage_ConsoleIO_AudioPlaybackFinished" }
);

const livekit_agent_session_pb = {
  __proto__: null,
  AgentConfigUpdate: AgentConfigUpdate,
  AgentHandoff: AgentHandoff,
  AgentSessionEvent: AgentSessionEvent,
  AgentSessionEvent_AgentFalseInterruption: AgentSessionEvent_AgentFalseInterruption,
  AgentSessionEvent_AgentStateChanged: AgentSessionEvent_AgentStateChanged,
  AgentSessionEvent_AmdPrediction: AgentSessionEvent_AmdPrediction,
  AgentSessionEvent_ConversationItemAdded: AgentSessionEvent_ConversationItemAdded,
  AgentSessionEvent_EotPrediction: AgentSessionEvent_EotPrediction,
  AgentSessionEvent_Error: AgentSessionEvent_Error,
  AgentSessionEvent_FunctionToolsExecuted: AgentSessionEvent_FunctionToolsExecuted,
  AgentSessionEvent_FunctionToolsStarted: AgentSessionEvent_FunctionToolsStarted,
  AgentSessionEvent_OverlappingSpeech: AgentSessionEvent_OverlappingSpeech,
  AgentSessionEvent_SessionUsageUpdated: AgentSessionEvent_SessionUsageUpdated,
  AgentSessionEvent_ToolExecutionUpdated: AgentSessionEvent_ToolExecutionUpdated,
  AgentSessionEvent_ToolExecutionUpdated_CallUpdated: AgentSessionEvent_ToolExecutionUpdated_CallUpdated,
  AgentSessionEvent_ToolExecutionUpdated_Ended: AgentSessionEvent_ToolExecutionUpdated_Ended,
  AgentSessionEvent_ToolExecutionUpdated_ReplyUpdated: AgentSessionEvent_ToolExecutionUpdated_ReplyUpdated,
  AgentSessionEvent_ToolExecutionUpdated_Started: AgentSessionEvent_ToolExecutionUpdated_Started,
  AgentSessionEvent_UserInputTranscribed: AgentSessionEvent_UserInputTranscribed,
  AgentSessionEvent_UserStateChanged: AgentSessionEvent_UserStateChanged,
  AgentSessionMessage: AgentSessionMessage,
  AgentSessionMessage_ConsoleIO: AgentSessionMessage_ConsoleIO,
  AgentSessionMessage_ConsoleIO_AudioFrame: AgentSessionMessage_ConsoleIO_AudioFrame,
  AgentSessionMessage_ConsoleIO_AudioPlaybackClear: AgentSessionMessage_ConsoleIO_AudioPlaybackClear,
  AgentSessionMessage_ConsoleIO_AudioPlaybackFinished: AgentSessionMessage_ConsoleIO_AudioPlaybackFinished,
  AgentSessionMessage_ConsoleIO_AudioPlaybackFlush: AgentSessionMessage_ConsoleIO_AudioPlaybackFlush,
  AgentSessionUsage: AgentSessionUsage,
  AgentState: AgentState,
  AmdCategory: AmdCategory,
  ChatContext: ChatContext,
  ChatContext_ChatItem: ChatContext_ChatItem,
  ChatMessage: ChatMessage$1,
  ChatMessage_ChatContent: ChatMessage_ChatContent,
  ChatRole: ChatRole,
  DebugMessage: DebugMessage,
  EotModelUsage: EotModelUsage,
  FunctionCall: FunctionCall,
  FunctionCallOutput: FunctionCallOutput,
  InterruptionModelUsage: InterruptionModelUsage,
  LLMModelUsage: LLMModelUsage,
  MetricsReport: MetricsReport,
  ModelUsage: ModelUsage,
  STTModelUsage: STTModelUsage,
  SessionRequest: SessionRequest,
  SessionRequest_FinalizeSimulation: SessionRequest_FinalizeSimulation,
  SessionRequest_GetAgentInfo: SessionRequest_GetAgentInfo,
  SessionRequest_GetChatHistory: SessionRequest_GetChatHistory,
  SessionRequest_GetFrameworkInfo: SessionRequest_GetFrameworkInfo,
  SessionRequest_GetRTCStats: SessionRequest_GetRTCStats,
  SessionRequest_GetSessionState: SessionRequest_GetSessionState,
  SessionRequest_GetSessionUsage: SessionRequest_GetSessionUsage,
  SessionRequest_Ping: SessionRequest_Ping,
  SessionRequest_RunInput: SessionRequest_RunInput,
  SessionRequest_UpdateIO: SessionRequest_UpdateIO,
  SessionRequest_UpdateIO_Input: SessionRequest_UpdateIO_Input,
  SessionRequest_UpdateIO_Output: SessionRequest_UpdateIO_Output,
  SessionResponse: SessionResponse,
  SessionResponse_FinalizeSimulationResponse: SessionResponse_FinalizeSimulationResponse,
  SessionResponse_FinalizeSimulationResponse_SimulationVerdict: SessionResponse_FinalizeSimulationResponse_SimulationVerdict,
  SessionResponse_GetAgentInfoResponse: SessionResponse_GetAgentInfoResponse,
  SessionResponse_GetChatHistoryResponse: SessionResponse_GetChatHistoryResponse,
  SessionResponse_GetFrameworkInfoResponse: SessionResponse_GetFrameworkInfoResponse,
  SessionResponse_GetRTCStatsResponse: SessionResponse_GetRTCStatsResponse,
  SessionResponse_GetSessionStateResponse: SessionResponse_GetSessionStateResponse,
  SessionResponse_GetSessionUsageResponse: SessionResponse_GetSessionUsageResponse,
  SessionResponse_Pong: SessionResponse_Pong,
  SessionResponse_RunInputResponse: SessionResponse_RunInputResponse,
  SessionResponse_UpdateIOResponse: SessionResponse_UpdateIOResponse,
  TTSModelUsage: TTSModelUsage,
  TimedString: TimedString,
  ToolCallStatus: ToolCallStatus,
  ToolReplyStatus: ToolReplyStatus,
  UserState: UserState
};

const AudioEncoding = /* @__PURE__ */ proto3.makeEnum(
  "livekit.agent.AudioEncoding",
  [
    { no: 0, name: "AUDIO_ENCODING_PCM_S16LE", localName: "PCM_S16LE" },
    { no: 1, name: "AUDIO_ENCODING_OPUS", localName: "OPUS" }
  ]
);
const SessionSettings = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionSettings",
  () => [
    {
      no: 1,
      name: "sample_rate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 2, name: "encoding", kind: "enum", T: proto3.getEnumType(AudioEncoding) },
    { no: 3, name: "eot_settings", kind: "message", T: EotSettings, oneof: "type_settings" },
    { no: 4, name: "interruption_settings", kind: "message", T: InterruptionSettings, oneof: "type_settings" }
  ]
);
const InferenceError = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InferenceError",
  () => [
    {
      no: 1,
      name: "message",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "code",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const EotSettings = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.EotSettings",
  () => [
    { no: 1, name: "detection_interval", kind: "message", T: Duration }
  ]
);
const InterruptionSettings = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InterruptionSettings",
  () => [
    {
      no: 1,
      name: "threshold",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    {
      no: 2,
      name: "min_frames",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 3, name: "max_audio_duration", kind: "message", T: Duration },
    { no: 4, name: "audio_prefix_duration", kind: "message", T: Duration },
    { no: 5, name: "detection_interval", kind: "message", T: Duration }
  ]
);
const SessionCreate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionCreate",
  () => [
    { no: 1, name: "settings", kind: "message", T: SessionSettings }
  ]
);
const InputAudio = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InputAudio",
  () => [
    {
      no: 1,
      name: "audio",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    },
    { no: 2, name: "created_at", kind: "message", T: Timestamp },
    {
      no: 3,
      name: "num_samples",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const EotInputChatContext = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.EotInputChatContext",
  () => [
    { no: 1, name: "messages", kind: "message", T: ChatMessage$1, repeated: true }
  ]
);
const SessionFlush = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionFlush",
  []
);
const SessionClose = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionClose",
  []
);
const InferenceStart = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InferenceStart",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const InferenceStop = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InferenceStop",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const BufferStart = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.BufferStart",
  []
);
const BufferStop = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.BufferStop",
  []
);
const ClientMessage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.ClientMessage",
  () => [
    { no: 1, name: "created_at", kind: "message", T: Timestamp },
    { no: 2, name: "session_create", kind: "message", T: SessionCreate, oneof: "message" },
    { no: 3, name: "input_audio", kind: "message", T: InputAudio, oneof: "message" },
    { no: 4, name: "session_flush", kind: "message", T: SessionFlush, oneof: "message" },
    { no: 5, name: "session_close", kind: "message", T: SessionClose, oneof: "message" },
    { no: 6, name: "inference_start", kind: "message", T: InferenceStart, oneof: "message" },
    { no: 7, name: "inference_stop", kind: "message", T: InferenceStop, oneof: "message" },
    { no: 8, name: "buffer_start", kind: "message", T: BufferStart, oneof: "message" },
    { no: 9, name: "buffer_stop", kind: "message", T: BufferStop, oneof: "message" },
    { no: 10, name: "eot_input_chat_context", kind: "message", T: EotInputChatContext, oneof: "message" }
  ]
);
const EotInferenceRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.EotInferenceRequest",
  () => [
    {
      no: 1,
      name: "audio",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    },
    {
      no: 2,
      name: "assistant_text",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "encoding", kind: "enum", T: proto3.getEnumType(AudioEncoding) },
    {
      no: 4,
      name: "sample_rate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const InterruptionInferenceRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InterruptionInferenceRequest",
  () => [
    {
      no: 1,
      name: "audio",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    },
    { no: 2, name: "encoding", kind: "enum", T: proto3.getEnumType(AudioEncoding) },
    {
      no: 3,
      name: "sample_rate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const InferenceRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InferenceRequest",
  () => [
    { no: 1, name: "eot_inference_request", kind: "message", T: EotInferenceRequest, oneof: "request" },
    { no: 2, name: "interruption_inference_request", kind: "message", T: InterruptionInferenceRequest, oneof: "request" }
  ]
);
const InferenceStats = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InferenceStats",
  () => [
    { no: 1, name: "earliest_client_created_at", kind: "message", T: Timestamp, opt: true },
    { no: 2, name: "latest_client_created_at", kind: "message", T: Timestamp, opt: true },
    { no: 3, name: "client_e2e_latency", kind: "message", T: Duration, opt: true },
    { no: 4, name: "server_e2e_latency", kind: "message", T: Duration },
    { no: 5, name: "preprocessing_duration", kind: "message", T: Duration },
    { no: 6, name: "inference_duration", kind: "message", T: Duration }
  ]
);
const EotInferenceResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.EotInferenceResponse",
  () => [
    {
      no: 1,
      name: "probability",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    { no: 2, name: "stats", kind: "message", T: InferenceStats }
  ]
);
const InterruptionInferenceResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InterruptionInferenceResponse",
  () => [
    {
      no: 1,
      name: "is_interruption",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 2, name: "probabilities", kind: "scalar", T: 2, repeated: true },
    { no: 3, name: "stats", kind: "message", T: InferenceStats }
  ]
);
const InferenceResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InferenceResponse",
  () => [
    { no: 1, name: "eot_inference_response", kind: "message", T: EotInferenceResponse, oneof: "response" },
    { no: 2, name: "interruption_inference_response", kind: "message", T: InterruptionInferenceResponse, oneof: "response" }
  ]
);
const SessionCreated = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionCreated",
  () => [
    { no: 1, name: "default_thresholds", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    } },
    {
      no: 2,
      name: "default_threshold",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    { no: 3, name: "default_backchannel_thresholds", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    } },
    {
      no: 4,
      name: "default_backchannel_threshold",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    }
  ]
);
const InferenceStarted = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InferenceStarted",
  []
);
const InferenceStopped = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InferenceStopped",
  []
);
const SessionClosed = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.SessionClosed",
  []
);
const EotPrediction = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.EotPrediction",
  () => [
    {
      no: 1,
      name: "probability",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    { no: 2, name: "inference_stats", kind: "message", T: InferenceStats },
    { no: 3, name: "backend", kind: "enum", T: proto3.getEnumType(EotPrediction_EotBackend) },
    {
      no: 4,
      name: "backchannel_probability",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    }
  ]
);
const EotPrediction_EotBackend = /* @__PURE__ */ proto3.makeEnum(
  "livekit.agent.EotPrediction.EotBackend",
  [
    { no: 0, name: "EOT_BACKEND_UNKNOWN", localName: "UNKNOWN" },
    { no: 1, name: "EOT_BACKEND_MULTIMODAL", localName: "MULTIMODAL" },
    { no: 2, name: "EOT_BACKEND_TEXT", localName: "TEXT" }
  ]
);
const InterruptionPrediction = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.InterruptionPrediction",
  () => [
    {
      no: 1,
      name: "is_interruption",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 2, name: "probabilities", kind: "scalar", T: 2, repeated: true },
    { no: 3, name: "inference_stats", kind: "message", T: InferenceStats }
  ]
);
const ServerMessage$1 = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.ServerMessage",
  () => [
    { no: 1, name: "server_created_at", kind: "message", T: Timestamp },
    { no: 2, name: "request_id", kind: "scalar", T: 9, opt: true },
    { no: 3, name: "client_created_at", kind: "message", T: Timestamp, opt: true },
    { no: 4, name: "session_created", kind: "message", T: SessionCreated, oneof: "message" },
    { no: 5, name: "inference_started", kind: "message", T: InferenceStarted, oneof: "message" },
    { no: 6, name: "inference_stopped", kind: "message", T: InferenceStopped, oneof: "message" },
    { no: 7, name: "session_closed", kind: "message", T: SessionClosed, oneof: "message" },
    { no: 8, name: "error", kind: "message", T: InferenceError, oneof: "message" },
    { no: 9, name: "eot_prediction", kind: "message", T: EotPrediction, oneof: "message" },
    { no: 10, name: "interruption_prediction", kind: "message", T: InterruptionPrediction, oneof: "message" }
  ]
);

const livekit_agent_inference_pb = {
  __proto__: null,
  AudioEncoding: AudioEncoding,
  BufferStart: BufferStart,
  BufferStop: BufferStop,
  ClientMessage: ClientMessage,
  EotInferenceRequest: EotInferenceRequest,
  EotInferenceResponse: EotInferenceResponse,
  EotInputChatContext: EotInputChatContext,
  EotPrediction: EotPrediction,
  EotPrediction_EotBackend: EotPrediction_EotBackend,
  EotSettings: EotSettings,
  InferenceError: InferenceError,
  InferenceRequest: InferenceRequest,
  InferenceResponse: InferenceResponse,
  InferenceStart: InferenceStart,
  InferenceStarted: InferenceStarted,
  InferenceStats: InferenceStats,
  InferenceStop: InferenceStop,
  InferenceStopped: InferenceStopped,
  InputAudio: InputAudio,
  InterruptionInferenceRequest: InterruptionInferenceRequest,
  InterruptionInferenceResponse: InterruptionInferenceResponse,
  InterruptionPrediction: InterruptionPrediction,
  InterruptionSettings: InterruptionSettings,
  ServerMessage: ServerMessage$1,
  SessionClose: SessionClose,
  SessionClosed: SessionClosed,
  SessionCreate: SessionCreate,
  SessionCreated: SessionCreated,
  SessionFlush: SessionFlush,
  SessionSettings: SessionSettings
};

const TextMessageErrorCode = /* @__PURE__ */ proto3.makeEnum(
  "livekit.agent.TextMessageErrorCode",
  [
    { no: 0, name: "INTERNAL_ERROR" },
    { no: 1, name: "SESSION_STATE_NOT_FOUND" },
    { no: 2, name: "TEXT_HANDLER_ERROR" },
    { no: 3, name: "PROCESS_CLOSED" }
  ]
);
const TextMessageRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.TextMessageRequest",
  () => [
    {
      no: 1,
      name: "text",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "message_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "session_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "agent_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 6, name: "session_state", kind: "message", T: AgentSessionState, opt: true }
  ]
);
const TextMessageResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.TextMessageResponse",
  () => [
    {
      no: 1,
      name: "message_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "session_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "message", kind: "message", T: ChatMessage$1, oneof: "event" },
    { no: 4, name: "function_call", kind: "message", T: FunctionCall, oneof: "event" },
    { no: 5, name: "function_call_output", kind: "message", T: FunctionCallOutput, oneof: "event" },
    { no: 6, name: "agent_handoff", kind: "message", T: AgentHandoff, oneof: "event" },
    { no: 7, name: "complete", kind: "message", T: TextMessageComplete, oneof: "event" }
  ]
);
const TextMessageComplete = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.TextMessageComplete",
  () => [
    { no: 1, name: "session_state", kind: "message", T: AgentSessionState, oneof: "result" },
    { no: 2, name: "error", kind: "message", T: TextMessageError, oneof: "result" }
  ]
);
const AgentSessionState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentSessionState",
  () => [
    {
      no: 1,
      name: "version",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    { no: 2, name: "snapshot", kind: "scalar", T: 12, oneof: "data" },
    { no: 3, name: "delta", kind: "scalar", T: 12, oneof: "data" }
  ]
);
const TextMessageError = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.TextMessageError",
  () => [
    {
      no: 1,
      name: "message",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "code", kind: "enum", T: proto3.getEnumType(TextMessageErrorCode) }
  ]
);

const livekit_agent_text_pb = {
  __proto__: null,
  AgentSessionState: AgentSessionState,
  TextMessageComplete: TextMessageComplete,
  TextMessageError: TextMessageError,
  TextMessageErrorCode: TextMessageErrorCode,
  TextMessageRequest: TextMessageRequest,
  TextMessageResponse: TextMessageResponse
};

const AgentDevMessage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.AgentDevMessage",
  () => [
    { no: 1, name: "get_running_jobs_request", kind: "message", T: GetRunningAgentJobsRequest, oneof: "message" },
    { no: 2, name: "get_running_jobs_response", kind: "message", T: GetRunningAgentJobsResponse, oneof: "message" },
    { no: 3, name: "server_info", kind: "message", T: ServerInfo$1, oneof: "message" }
  ]
);
const ServerInfo$1 = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.ServerInfo",
  () => [
    {
      no: 1,
      name: "agent_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const GetRunningAgentJobsRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.GetRunningAgentJobsRequest",
  []
);
const GetRunningAgentJobsResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.GetRunningAgentJobsResponse",
  () => [
    { no: 1, name: "jobs", kind: "message", T: RunningAgentJobInfo, repeated: true }
  ]
);
const RunningAgentJobInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.agent.RunningAgentJobInfo",
  () => [
    {
      no: 1,
      name: "job",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    },
    {
      no: 2,
      name: "accept_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "accept_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "accept_metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "token",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "worker_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "mock_job",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);

const livekit_agent_dev_pb = {
  __proto__: null,
  AgentDevMessage: AgentDevMessage,
  GetRunningAgentJobsRequest: GetRunningAgentJobsRequest,
  GetRunningAgentJobsResponse: GetRunningAgentJobsResponse,
  RunningAgentJobInfo: RunningAgentJobInfo,
  ServerInfo: ServerInfo$1
};

const MetricLabel = /* @__PURE__ */ proto3.makeEnum(
  "livekit.MetricLabel",
  [
    { no: 0, name: "AGENTS_LLM_TTFT" },
    { no: 1, name: "AGENTS_STT_TTFT" },
    { no: 2, name: "AGENTS_TTS_TTFB" },
    { no: 3, name: "CLIENT_VIDEO_SUBSCRIBER_FREEZE_COUNT" },
    { no: 4, name: "CLIENT_VIDEO_SUBSCRIBER_TOTAL_FREEZE_DURATION" },
    { no: 5, name: "CLIENT_VIDEO_SUBSCRIBER_PAUSE_COUNT" },
    { no: 6, name: "CLIENT_VIDEO_SUBSCRIBER_TOTAL_PAUSES_DURATION" },
    { no: 7, name: "CLIENT_AUDIO_SUBSCRIBER_CONCEALED_SAMPLES" },
    { no: 8, name: "CLIENT_AUDIO_SUBSCRIBER_SILENT_CONCEALED_SAMPLES" },
    { no: 9, name: "CLIENT_AUDIO_SUBSCRIBER_CONCEALMENT_EVENTS" },
    { no: 10, name: "CLIENT_AUDIO_SUBSCRIBER_INTERRUPTION_COUNT" },
    { no: 11, name: "CLIENT_AUDIO_SUBSCRIBER_TOTAL_INTERRUPTION_DURATION" },
    { no: 12, name: "CLIENT_SUBSCRIBER_JITTER_BUFFER_DELAY" },
    { no: 13, name: "CLIENT_SUBSCRIBER_JITTER_BUFFER_EMITTED_COUNT" },
    { no: 14, name: "CLIENT_VIDEO_PUBLISHER_QUALITY_LIMITATION_DURATION_BANDWIDTH" },
    { no: 15, name: "CLIENT_VIDEO_PUBLISHER_QUALITY_LIMITATION_DURATION_CPU" },
    { no: 16, name: "CLIENT_VIDEO_PUBLISHER_QUALITY_LIMITATION_DURATION_OTHER" },
    { no: 17, name: "PUBLISHER_RTT" },
    { no: 18, name: "SERVER_MESH_RTT" },
    { no: 19, name: "SUBSCRIBER_RTT" },
    { no: 4096, name: "METRIC_LABEL_PREDEFINED_MAX_VALUE" }
  ]
);
const MetricsBatch = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MetricsBatch",
  () => [
    {
      no: 1,
      name: "timestamp_ms",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 2, name: "normalized_timestamp", kind: "message", T: Timestamp },
    { no: 3, name: "str_data", kind: "scalar", T: 9, repeated: true },
    { no: 4, name: "time_series", kind: "message", T: TimeSeriesMetric, repeated: true },
    { no: 5, name: "events", kind: "message", T: EventMetric, repeated: true }
  ]
);
const TimeSeriesMetric = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TimeSeriesMetric",
  () => [
    {
      no: 1,
      name: "label",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 2,
      name: "participant_identity",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "track_sid",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 4, name: "samples", kind: "message", T: MetricSample, repeated: true },
    {
      no: 5,
      name: "rid",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const MetricSample = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MetricSample",
  () => [
    {
      no: 1,
      name: "timestamp_ms",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 2, name: "normalized_timestamp", kind: "message", T: Timestamp },
    {
      no: 3,
      name: "value",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    }
  ]
);
const EventMetric = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.EventMetric",
  () => [
    {
      no: 1,
      name: "label",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 2,
      name: "participant_identity",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "track_sid",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "start_timestamp_ms",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 5, name: "end_timestamp_ms", kind: "scalar", T: 3, opt: true },
    { no: 6, name: "normalized_start_timestamp", kind: "message", T: Timestamp },
    { no: 7, name: "normalized_end_timestamp", kind: "message", T: Timestamp, opt: true },
    {
      no: 8,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "rid",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const MetricsRecordingHeader = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MetricsRecordingHeader",
  () => [
    {
      no: 1,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "duration",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    { no: 4, name: "start_time", kind: "message", T: Timestamp },
    { no: 5, name: "room_tags", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 6,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 7, name: "room_start_time", kind: "message", T: Timestamp },
    {
      no: 8,
      name: "job_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "simulated",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 10,
      name: "redaction_enabled",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);

const AudioCodec = /* @__PURE__ */ proto3.makeEnum(
  "livekit.AudioCodec",
  [
    { no: 0, name: "DEFAULT_AC" },
    { no: 1, name: "OPUS" },
    { no: 2, name: "AAC" },
    { no: 3, name: "AC_MP3" }
  ]
);
const VideoCodec = /* @__PURE__ */ proto3.makeEnum(
  "livekit.VideoCodec",
  [
    { no: 0, name: "DEFAULT_VC" },
    { no: 1, name: "H264_BASELINE" },
    { no: 2, name: "H264_MAIN" },
    { no: 3, name: "H264_HIGH" },
    { no: 4, name: "VP8" }
  ]
);
const ImageCodec = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ImageCodec",
  [
    { no: 0, name: "IC_DEFAULT" },
    { no: 1, name: "IC_JPEG" }
  ]
);
const BackupCodecPolicy = /* @__PURE__ */ proto3.makeEnum(
  "livekit.BackupCodecPolicy",
  [
    { no: 0, name: "PREFER_REGRESSION" },
    { no: 1, name: "SIMULCAST" },
    { no: 2, name: "REGRESSION" }
  ]
);
const TrackType = /* @__PURE__ */ proto3.makeEnum(
  "livekit.TrackType",
  [
    { no: 0, name: "AUDIO" },
    { no: 1, name: "VIDEO" },
    { no: 2, name: "DATA" }
  ]
);
const TrackSource = /* @__PURE__ */ proto3.makeEnum(
  "livekit.TrackSource",
  [
    { no: 0, name: "UNKNOWN" },
    { no: 1, name: "CAMERA" },
    { no: 2, name: "MICROPHONE" },
    { no: 3, name: "SCREEN_SHARE" },
    { no: 4, name: "SCREEN_SHARE_AUDIO" }
  ]
);
const DataTrackExtensionID = /* @__PURE__ */ proto3.makeEnum(
  "livekit.DataTrackExtensionID",
  [
    { no: 0, name: "DTEI_INVALID" },
    { no: 1, name: "DTEI_PARTICIPANT_SID" }
  ]
);
const VideoQuality = /* @__PURE__ */ proto3.makeEnum(
  "livekit.VideoQuality",
  [
    { no: 0, name: "LOW" },
    { no: 1, name: "MEDIUM" },
    { no: 2, name: "HIGH" },
    { no: 3, name: "OFF" }
  ]
);
const ConnectionQuality = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ConnectionQuality",
  [
    { no: 0, name: "POOR" },
    { no: 1, name: "GOOD" },
    { no: 2, name: "EXCELLENT" },
    { no: 3, name: "LOST" }
  ]
);
const ClientConfigSetting = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ClientConfigSetting",
  [
    { no: 0, name: "UNSET" },
    { no: 1, name: "DISABLED" },
    { no: 2, name: "ENABLED" }
  ]
);
const DisconnectReason = /* @__PURE__ */ proto3.makeEnum(
  "livekit.DisconnectReason",
  [
    { no: 0, name: "UNKNOWN_REASON" },
    { no: 1, name: "CLIENT_INITIATED" },
    { no: 2, name: "DUPLICATE_IDENTITY" },
    { no: 3, name: "SERVER_SHUTDOWN" },
    { no: 4, name: "PARTICIPANT_REMOVED" },
    { no: 5, name: "ROOM_DELETED" },
    { no: 6, name: "STATE_MISMATCH" },
    { no: 7, name: "JOIN_FAILURE" },
    { no: 8, name: "MIGRATION" },
    { no: 9, name: "SIGNAL_CLOSE" },
    { no: 10, name: "ROOM_CLOSED" },
    { no: 11, name: "USER_UNAVAILABLE" },
    { no: 12, name: "USER_REJECTED" },
    { no: 13, name: "SIP_TRUNK_FAILURE" },
    { no: 14, name: "CONNECTION_TIMEOUT" },
    { no: 15, name: "MEDIA_FAILURE" },
    { no: 16, name: "AGENT_ERROR" }
  ]
);
const RoomEndReason = /* @__PURE__ */ proto3.makeEnum(
  "livekit.RoomEndReason",
  [
    { no: 0, name: "ROOM_END_UNKNOWN" },
    { no: 1, name: "ROOM_END_API_DELETE" },
    { no: 2, name: "ROOM_END_IDLE_TIMEOUT" },
    { no: 3, name: "ROOM_END_SERVER_SHUTDOWN" },
    { no: 4, name: "ROOM_END_SUPERSEDED" },
    { no: 5, name: "ROOM_END_OPEN_FAILED" }
  ]
);
const ReconnectReason = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ReconnectReason",
  [
    { no: 0, name: "RR_UNKNOWN" },
    { no: 1, name: "RR_SIGNAL_DISCONNECTED" },
    { no: 2, name: "RR_PUBLISHER_FAILED" },
    { no: 3, name: "RR_SUBSCRIBER_FAILED" },
    { no: 4, name: "RR_SWITCH_CANDIDATE" }
  ]
);
const SubscriptionError = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SubscriptionError",
  [
    { no: 0, name: "SE_UNKNOWN" },
    { no: 1, name: "SE_CODEC_UNSUPPORTED" },
    { no: 2, name: "SE_TRACK_NOTFOUND" }
  ]
);
const AudioTrackFeature = /* @__PURE__ */ proto3.makeEnum(
  "livekit.AudioTrackFeature",
  [
    { no: 0, name: "TF_STEREO" },
    { no: 1, name: "TF_NO_DTX" },
    { no: 2, name: "TF_AUTO_GAIN_CONTROL" },
    { no: 3, name: "TF_ECHO_CANCELLATION" },
    { no: 4, name: "TF_NOISE_SUPPRESSION" },
    { no: 5, name: "TF_ENHANCED_NOISE_CANCELLATION" },
    { no: 6, name: "TF_PRECONNECT_BUFFER" }
  ]
);
const PacketTrailerFeature = /* @__PURE__ */ proto3.makeEnum(
  "livekit.PacketTrailerFeature",
  [
    { no: 0, name: "PTF_USER_TIMESTAMP" },
    { no: 1, name: "PTF_FRAME_ID" },
    { no: 2, name: "PTF_USER_DATA" }
  ]
);
const Pagination = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Pagination",
  () => [
    {
      no: 1,
      name: "after_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "limit",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    }
  ]
);
const TokenPagination = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TokenPagination",
  () => [
    {
      no: 1,
      name: "token",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ListUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListUpdate",
  () => [
    { no: 1, name: "set", kind: "scalar", T: 9, repeated: true },
    { no: 2, name: "add", kind: "scalar", T: 9, repeated: true },
    { no: 3, name: "remove", kind: "scalar", T: 9, repeated: true },
    {
      no: 4,
      name: "clear",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const Room = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Room",
  () => [
    {
      no: 1,
      name: "sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "empty_timeout",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 14,
      name: "departure_timeout",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "max_participants",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 5,
      name: "creation_time",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 15,
      name: "creation_time_ms",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 6,
      name: "turn_password",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 7, name: "enabled_codecs", kind: "message", T: Codec, repeated: true },
    {
      no: 8,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "num_participants",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 11,
      name: "num_publishers",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 10,
      name: "active_recording",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 13, name: "version", kind: "message", T: TimedVersion }
  ]
);
const Codec = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Codec",
  () => [
    {
      no: 1,
      name: "mime",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "fmtp_line",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const PlayoutDelay = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.PlayoutDelay",
  () => [
    {
      no: 1,
      name: "enabled",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 2,
      name: "min",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "max",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const ParticipantPermission = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ParticipantPermission",
  () => [
    {
      no: 1,
      name: "can_subscribe",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 2,
      name: "can_publish",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 3,
      name: "can_publish_data",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 9, name: "can_publish_sources", kind: "enum", T: proto3.getEnumType(TrackSource), repeated: true },
    {
      no: 7,
      name: "hidden",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 8,
      name: "recorder",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 10,
      name: "can_update_metadata",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 11,
      name: "agent",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 12,
      name: "can_subscribe_metrics",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 13,
      name: "can_manage_agent_session",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const ParticipantInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ParticipantInfo",
  () => [
    {
      no: 1,
      name: "sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "state", kind: "enum", T: proto3.getEnumType(ParticipantInfo_State) },
    { no: 4, name: "tracks", kind: "message", T: TrackInfo, repeated: true },
    {
      no: 5,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "joined_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 17,
      name: "joined_at_ms",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 9,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 10,
      name: "version",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 11, name: "permission", kind: "message", T: ParticipantPermission },
    {
      no: 12,
      name: "region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 13,
      name: "is_publisher",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 14, name: "kind", kind: "enum", T: proto3.getEnumType(ParticipantInfo_Kind) },
    { no: 15, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 16, name: "disconnect_reason", kind: "enum", T: proto3.getEnumType(DisconnectReason) },
    { no: 18, name: "kind_details", kind: "enum", T: proto3.getEnumType(ParticipantInfo_KindDetail), repeated: true },
    { no: 19, name: "data_tracks", kind: "message", T: DataTrackInfo, repeated: true },
    {
      no: 20,
      name: "client_protocol",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    { no: 21, name: "capabilities", kind: "enum", T: proto3.getEnumType(ClientInfo_Capability), repeated: true }
  ]
);
const ParticipantInfo_State = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ParticipantInfo.State",
  [
    { no: 0, name: "JOINING" },
    { no: 1, name: "JOINED" },
    { no: 2, name: "ACTIVE" },
    { no: 3, name: "DISCONNECTED" }
  ]
);
const ParticipantInfo_Kind = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ParticipantInfo.Kind",
  [
    { no: 0, name: "STANDARD" },
    { no: 1, name: "INGRESS" },
    { no: 2, name: "EGRESS" },
    { no: 3, name: "SIP" },
    { no: 4, name: "AGENT" },
    { no: 7, name: "CONNECTOR" },
    { no: 8, name: "BRIDGE" }
  ]
);
const ParticipantInfo_KindDetail = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ParticipantInfo.KindDetail",
  [
    { no: 0, name: "CLOUD_AGENT" },
    { no: 1, name: "FORWARDED" },
    { no: 2, name: "CONNECTOR_WHATSAPP" },
    { no: 3, name: "CONNECTOR_TWILIO" },
    { no: 4, name: "BRIDGE_RTSP" },
    { no: 5, name: "SIMULATION" }
  ]
);
const Encryption = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Encryption",
  []
);
const Encryption_Type = /* @__PURE__ */ proto3.makeEnum(
  "livekit.Encryption.Type",
  [
    { no: 0, name: "NONE" },
    { no: 1, name: "GCM" },
    { no: 2, name: "CUSTOM" }
  ]
);
const SimulcastCodecInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulcastCodecInfo",
  () => [
    {
      no: 1,
      name: "mime_type",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "mid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "cid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "layers", kind: "message", T: VideoLayer, repeated: true },
    { no: 5, name: "video_layer_mode", kind: "enum", T: proto3.getEnumType(VideoLayer_Mode) },
    {
      no: 6,
      name: "sdp_cid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const TrackInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TrackInfo",
  () => [
    {
      no: 1,
      name: "sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "type", kind: "enum", T: proto3.getEnumType(TrackType) },
    {
      no: 3,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "muted",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 5,
      name: "width",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 6,
      name: "height",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 7,
      name: "simulcast",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 8,
      name: "disable_dtx",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 9, name: "source", kind: "enum", T: proto3.getEnumType(TrackSource) },
    { no: 10, name: "layers", kind: "message", T: VideoLayer, repeated: true },
    {
      no: 11,
      name: "mime_type",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 12,
      name: "mid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 13, name: "codecs", kind: "message", T: SimulcastCodecInfo, repeated: true },
    {
      no: 14,
      name: "stereo",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 15,
      name: "disable_red",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 16, name: "encryption", kind: "enum", T: proto3.getEnumType(Encryption_Type) },
    {
      no: 17,
      name: "stream",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 18, name: "version", kind: "message", T: TimedVersion },
    { no: 19, name: "audio_features", kind: "enum", T: proto3.getEnumType(AudioTrackFeature), repeated: true },
    { no: 20, name: "backup_codec_policy", kind: "enum", T: proto3.getEnumType(BackupCodecPolicy) },
    { no: 21, name: "packet_trailer_features", kind: "enum", T: proto3.getEnumType(PacketTrailerFeature), repeated: true }
  ]
);
const DataTrackInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataTrackInfo",
  () => [
    {
      no: 1,
      name: "pub_handle",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 2,
      name: "sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "encryption", kind: "enum", T: proto3.getEnumType(Encryption_Type) },
    { no: 5, name: "frame_encoding", kind: "message", T: DataTrackFrameEncoding, opt: true },
    { no: 6, name: "schema", kind: "message", T: DataTrackSchemaId, opt: true }
  ]
);
const DataTrackFrameEncoding = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataTrackFrameEncoding",
  () => [
    { no: 1, name: "well_known", kind: "enum", T: proto3.getEnumType(DataTrackFrameEncoding_WellKnownFrameEncoding), oneof: "value" },
    { no: 2, name: "custom", kind: "scalar", T: 9, oneof: "value" }
  ]
);
const DataTrackFrameEncoding_WellKnownFrameEncoding = /* @__PURE__ */ proto3.makeEnum(
  "livekit.DataTrackFrameEncoding.WellKnownFrameEncoding",
  [
    { no: 0, name: "WELL_KNOWN_FRAME_ENCODING_UNSPECIFIED", localName: "UNSPECIFIED" },
    { no: 1, name: "WELL_KNOWN_FRAME_ENCODING_ROS1", localName: "ROS1" },
    { no: 2, name: "WELL_KNOWN_FRAME_ENCODING_CDR", localName: "CDR" },
    { no: 3, name: "WELL_KNOWN_FRAME_ENCODING_PROTOBUF", localName: "PROTOBUF" },
    { no: 4, name: "WELL_KNOWN_FRAME_ENCODING_FLATBUFFER", localName: "FLATBUFFER" },
    { no: 5, name: "WELL_KNOWN_FRAME_ENCODING_CBOR", localName: "CBOR" },
    { no: 6, name: "WELL_KNOWN_FRAME_ENCODING_MSGPACK", localName: "MSGPACK" },
    { no: 7, name: "WELL_KNOWN_FRAME_ENCODING_JSON", localName: "JSON" }
  ]
);
const DataTrackSchemaEncoding = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataTrackSchemaEncoding",
  () => [
    { no: 1, name: "well_known", kind: "enum", T: proto3.getEnumType(DataTrackSchemaEncoding_WellKnownSchemaEncoding), oneof: "value" },
    { no: 2, name: "custom", kind: "scalar", T: 9, oneof: "value" }
  ]
);
const DataTrackSchemaEncoding_WellKnownSchemaEncoding = /* @__PURE__ */ proto3.makeEnum(
  "livekit.DataTrackSchemaEncoding.WellKnownSchemaEncoding",
  [
    { no: 0, name: "WELL_KNOWN_SCHEMA_ENCODING_UNSPECIFIED", localName: "UNSPECIFIED" },
    { no: 1, name: "WELL_KNOWN_SCHEMA_ENCODING_PROTOBUF", localName: "PROTOBUF" },
    { no: 2, name: "WELL_KNOWN_SCHEMA_ENCODING_FLATBUFFER", localName: "FLATBUFFER" },
    { no: 3, name: "WELL_KNOWN_SCHEMA_ENCODING_ROS1_MSG", localName: "ROS1_MSG" },
    { no: 4, name: "WELL_KNOWN_SCHEMA_ENCODING_ROS2_MSG", localName: "ROS2_MSG" },
    { no: 5, name: "WELL_KNOWN_SCHEMA_ENCODING_ROS2_IDL", localName: "ROS2_IDL" },
    { no: 6, name: "WELL_KNOWN_SCHEMA_ENCODING_OMG_IDL", localName: "OMG_IDL" },
    { no: 7, name: "WELL_KNOWN_SCHEMA_ENCODING_JSON_SCHEMA", localName: "JSON_SCHEMA" }
  ]
);
const DataTrackSchemaId = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataTrackSchemaId",
  () => [
    {
      no: 1,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "encoding", kind: "message", T: DataTrackSchemaEncoding }
  ]
);
const DataTrackExtensionParticipantSid = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataTrackExtensionParticipantSid",
  () => [
    { no: 1, name: "id", kind: "enum", T: proto3.getEnumType(DataTrackExtensionID) },
    {
      no: 2,
      name: "participant_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const DataTrackSubscriptionOptions = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataTrackSubscriptionOptions",
  () => [
    { no: 1, name: "target_fps", kind: "scalar", T: 13, opt: true }
  ]
);
const DataBlobKey = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataBlobKey",
  () => [
    { no: 1, name: "generic", kind: "scalar", T: 9, oneof: "key" },
    { no: 2, name: "schema_id", kind: "message", T: DataTrackSchemaId, oneof: "key" }
  ]
);
const DataBlob = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataBlob",
  () => [
    { no: 1, name: "key", kind: "message", T: DataBlobKey },
    {
      no: 2,
      name: "contents",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    }
  ]
);
const VideoLayer = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.VideoLayer",
  () => [
    { no: 1, name: "quality", kind: "enum", T: proto3.getEnumType(VideoQuality) },
    {
      no: 2,
      name: "width",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "height",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "bitrate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 5,
      name: "ssrc",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 6,
      name: "spatial_layer",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 7,
      name: "rid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "repair_ssrc",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const VideoLayer_Mode = /* @__PURE__ */ proto3.makeEnum(
  "livekit.VideoLayer.Mode",
  [
    { no: 0, name: "MODE_UNUSED" },
    { no: 1, name: "ONE_SPATIAL_LAYER_PER_STREAM" },
    { no: 2, name: "MULTIPLE_SPATIAL_LAYERS_PER_STREAM" },
    { no: 3, name: "ONE_SPATIAL_LAYER_PER_STREAM_INCOMPLETE_RTCP_SR" }
  ]
);
const DataPacket = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataPacket",
  () => [
    { no: 1, name: "kind", kind: "enum", T: proto3.getEnumType(DataPacket_Kind) },
    {
      no: 4,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "destination_identities", kind: "scalar", T: 9, repeated: true },
    { no: 2, name: "user", kind: "message", T: UserPacket, oneof: "value" },
    { no: 3, name: "speaker", kind: "message", T: ActiveSpeakerUpdate, oneof: "value" },
    { no: 6, name: "sip_dtmf", kind: "message", T: SipDTMF, oneof: "value" },
    { no: 7, name: "transcription", kind: "message", T: Transcription, oneof: "value" },
    { no: 8, name: "metrics", kind: "message", T: MetricsBatch, oneof: "value" },
    { no: 9, name: "chat_message", kind: "message", T: ChatMessage, oneof: "value" },
    { no: 10, name: "rpc_request", kind: "message", T: RpcRequest, oneof: "value" },
    { no: 11, name: "rpc_ack", kind: "message", T: RpcAck, oneof: "value" },
    { no: 12, name: "rpc_response", kind: "message", T: RpcResponse, oneof: "value" },
    { no: 13, name: "stream_header", kind: "message", T: DataStream_Header, oneof: "value" },
    { no: 14, name: "stream_chunk", kind: "message", T: DataStream_Chunk, oneof: "value" },
    { no: 15, name: "stream_trailer", kind: "message", T: DataStream_Trailer, oneof: "value" },
    { no: 18, name: "encrypted_packet", kind: "message", T: EncryptedPacket, oneof: "value" },
    {
      no: 16,
      name: "sequence",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 17,
      name: "participant_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const DataPacket_Kind = /* @__PURE__ */ proto3.makeEnum(
  "livekit.DataPacket.Kind",
  [
    { no: 0, name: "RELIABLE" },
    { no: 1, name: "LOSSY" }
  ]
);
const EncryptedPacket = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.EncryptedPacket",
  () => [
    { no: 1, name: "encryption_type", kind: "enum", T: proto3.getEnumType(Encryption_Type) },
    {
      no: 2,
      name: "iv",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    },
    {
      no: 3,
      name: "key_index",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "encrypted_value",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    }
  ]
);
const EncryptedPacketPayload = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.EncryptedPacketPayload",
  () => [
    { no: 1, name: "user", kind: "message", T: UserPacket, oneof: "value" },
    { no: 3, name: "chat_message", kind: "message", T: ChatMessage, oneof: "value" },
    { no: 4, name: "rpc_request", kind: "message", T: RpcRequest, oneof: "value" },
    { no: 5, name: "rpc_ack", kind: "message", T: RpcAck, oneof: "value" },
    { no: 6, name: "rpc_response", kind: "message", T: RpcResponse, oneof: "value" },
    { no: 7, name: "stream_header", kind: "message", T: DataStream_Header, oneof: "value" },
    { no: 8, name: "stream_chunk", kind: "message", T: DataStream_Chunk, oneof: "value" },
    { no: 9, name: "stream_trailer", kind: "message", T: DataStream_Trailer, oneof: "value" }
  ]
);
const ActiveSpeakerUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ActiveSpeakerUpdate",
  () => [
    { no: 1, name: "speakers", kind: "message", T: SpeakerInfo, repeated: true }
  ]
);
const SpeakerInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SpeakerInfo",
  () => [
    {
      no: 1,
      name: "sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "level",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    {
      no: 3,
      name: "active",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const UserPacket = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UserPacket",
  () => [
    {
      no: 1,
      name: "participant_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "payload",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    },
    { no: 3, name: "destination_sids", kind: "scalar", T: 9, repeated: true },
    { no: 6, name: "destination_identities", kind: "scalar", T: 9, repeated: true },
    { no: 4, name: "topic", kind: "scalar", T: 9, opt: true },
    { no: 8, name: "id", kind: "scalar", T: 9, opt: true },
    { no: 9, name: "start_time", kind: "scalar", T: 4, opt: true },
    { no: 10, name: "end_time", kind: "scalar", T: 4, opt: true },
    {
      no: 11,
      name: "nonce",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    }
  ]
);
const SipDTMF = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SipDTMF",
  () => [
    {
      no: 3,
      name: "code",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "digit",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const Transcription = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Transcription",
  () => [
    {
      no: 2,
      name: "transcribed_participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "track_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "segments", kind: "message", T: TranscriptionSegment, repeated: true }
  ]
);
const TranscriptionSegment = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TranscriptionSegment",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "text",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "start_time",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 4,
      name: "end_time",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 5,
      name: "final",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 6,
      name: "language",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ChatMessage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ChatMessage",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "timestamp",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 3, name: "edit_timestamp", kind: "scalar", T: 3, opt: true },
    {
      no: 4,
      name: "message",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "deleted",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 6,
      name: "generated",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const RpcRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RpcRequest",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "method",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "payload",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "response_timeout_ms",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 5,
      name: "version",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 6,
      name: "compressed_payload",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    }
  ]
);
const RpcAck = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RpcAck",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const RpcResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RpcResponse",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "payload", kind: "scalar", T: 9, oneof: "value" },
    { no: 3, name: "error", kind: "message", T: RpcError, oneof: "value" },
    { no: 4, name: "compressed_payload", kind: "scalar", T: 12, oneof: "value" }
  ]
);
const RpcError = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RpcError",
  () => [
    {
      no: 1,
      name: "code",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 2,
      name: "message",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "data",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ParticipantTracks = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ParticipantTracks",
  () => [
    {
      no: 1,
      name: "participant_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "track_sids", kind: "scalar", T: 9, repeated: true }
  ]
);
const ServerInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ServerInfo",
  () => [
    { no: 1, name: "edition", kind: "enum", T: proto3.getEnumType(ServerInfo_Edition) },
    {
      no: 2,
      name: "version",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "protocol",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 4,
      name: "region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "node_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "debug_info",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "agent_protocol",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    }
  ]
);
const ServerInfo_Edition = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ServerInfo.Edition",
  [
    { no: 0, name: "Standard" },
    { no: 1, name: "Cloud" }
  ]
);
const ClientInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ClientInfo",
  () => [
    { no: 1, name: "sdk", kind: "enum", T: proto3.getEnumType(ClientInfo_SDK) },
    {
      no: 2,
      name: "version",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "protocol",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 4,
      name: "os",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "os_version",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "device_model",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "browser",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "browser_version",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "address",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 10,
      name: "network",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 11,
      name: "other_sdks",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 12,
      name: "client_protocol",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    { no: 13, name: "capabilities", kind: "enum", T: proto3.getEnumType(ClientInfo_Capability), repeated: true }
  ]
);
const ClientInfo_SDK = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ClientInfo.SDK",
  [
    { no: 0, name: "UNKNOWN" },
    { no: 1, name: "JS" },
    { no: 2, name: "SWIFT" },
    { no: 3, name: "ANDROID" },
    { no: 4, name: "FLUTTER" },
    { no: 5, name: "GO" },
    { no: 6, name: "UNITY" },
    { no: 7, name: "REACT_NATIVE" },
    { no: 8, name: "RUST" },
    { no: 9, name: "PYTHON" },
    { no: 10, name: "CPP" },
    { no: 11, name: "UNITY_WEB" },
    { no: 12, name: "NODE" },
    { no: 13, name: "UNREAL" },
    { no: 14, name: "ESP32" }
  ]
);
const ClientInfo_Capability = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ClientInfo.Capability",
  [
    { no: 0, name: "CAP_UNUSED" },
    { no: 1, name: "CAP_PACKET_TRAILER" },
    { no: 2, name: "CAP_COMPRESSION_DEFLATE_RAW" }
  ]
);
const ClientConfiguration = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ClientConfiguration",
  () => [
    { no: 1, name: "video", kind: "message", T: VideoConfiguration },
    { no: 2, name: "screen", kind: "message", T: VideoConfiguration },
    { no: 3, name: "resume_connection", kind: "enum", T: proto3.getEnumType(ClientConfigSetting) },
    { no: 4, name: "disabled_codecs", kind: "message", T: DisabledCodecs },
    { no: 5, name: "force_relay", kind: "enum", T: proto3.getEnumType(ClientConfigSetting) }
  ]
);
const VideoConfiguration = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.VideoConfiguration",
  () => [
    { no: 1, name: "hardware_encoder", kind: "enum", T: proto3.getEnumType(ClientConfigSetting) }
  ]
);
const DisabledCodecs = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DisabledCodecs",
  () => [
    { no: 1, name: "codecs", kind: "message", T: Codec, repeated: true },
    { no: 2, name: "publish", kind: "message", T: Codec, repeated: true }
  ]
);
const RTPDrift = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RTPDrift",
  () => [
    { no: 1, name: "start_time", kind: "message", T: Timestamp },
    { no: 2, name: "end_time", kind: "message", T: Timestamp },
    {
      no: 3,
      name: "duration",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 4,
      name: "start_timestamp",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 5,
      name: "end_timestamp",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 6,
      name: "rtp_clock_ticks",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 7,
      name: "drift_samples",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 8,
      name: "drift_ms",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 9,
      name: "clock_rate",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    }
  ]
);
const RTPStats = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RTPStats",
  () => [
    { no: 1, name: "start_time", kind: "message", T: Timestamp },
    { no: 2, name: "end_time", kind: "message", T: Timestamp },
    {
      no: 3,
      name: "duration",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 4,
      name: "packets",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 5,
      name: "packet_rate",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 6,
      name: "bytes",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 39,
      name: "header_bytes",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 7,
      name: "bitrate",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 8,
      name: "packets_lost",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 9,
      name: "packet_loss_rate",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 10,
      name: "packet_loss_percentage",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    {
      no: 11,
      name: "packets_duplicate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 12,
      name: "packet_duplicate_rate",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 13,
      name: "bytes_duplicate",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 40,
      name: "header_bytes_duplicate",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 14,
      name: "bitrate_duplicate",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 15,
      name: "packets_padding",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 16,
      name: "packet_padding_rate",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 17,
      name: "bytes_padding",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 41,
      name: "header_bytes_padding",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 18,
      name: "bitrate_padding",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 19,
      name: "packets_out_of_order",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 20,
      name: "frames",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 21,
      name: "frame_rate",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 22,
      name: "jitter_current",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 23,
      name: "jitter_max",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    { no: 24, name: "gap_histogram", kind: "map", K: 5, V: {
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    } },
    {
      no: 25,
      name: "nacks",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 37,
      name: "nack_acks",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 26,
      name: "nack_misses",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 38,
      name: "nack_repeated",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 27,
      name: "plis",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 28, name: "last_pli", kind: "message", T: Timestamp },
    {
      no: 29,
      name: "firs",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 30, name: "last_fir", kind: "message", T: Timestamp },
    {
      no: 31,
      name: "rtt_current",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 32,
      name: "rtt_max",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 33,
      name: "key_frames",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 34, name: "last_key_frame", kind: "message", T: Timestamp },
    {
      no: 35,
      name: "layer_lock_plis",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 36, name: "last_layer_lock_pli", kind: "message", T: Timestamp },
    { no: 44, name: "packet_drift", kind: "message", T: RTPDrift },
    { no: 45, name: "ntp_report_drift", kind: "message", T: RTPDrift },
    { no: 46, name: "rebased_report_drift", kind: "message", T: RTPDrift },
    { no: 47, name: "received_report_drift", kind: "message", T: RTPDrift }
  ]
);
const RTCPSenderReportState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RTCPSenderReportState",
  () => [
    {
      no: 1,
      name: "rtp_timestamp",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 2,
      name: "rtp_timestamp_ext",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 3,
      name: "ntp_timestamp",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 4,
      name: "at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 5,
      name: "at_adjusted",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 6,
      name: "packets",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 7,
      name: "octets",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    }
  ]
);
const RTPForwarderState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RTPForwarderState",
  () => [
    {
      no: 1,
      name: "started",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 2,
      name: "reference_layer_spatial",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 3,
      name: "pre_start_time",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 4,
      name: "ext_first_timestamp",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 5,
      name: "dummy_start_timestamp_offset",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    { no: 6, name: "rtp_munger", kind: "message", T: RTPMungerState },
    { no: 7, name: "vp8_munger", kind: "message", T: VP8MungerState, oneof: "codec_munger" },
    { no: 8, name: "sender_report_state", kind: "message", T: RTCPSenderReportState, repeated: true }
  ]
);
const RTPMungerState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RTPMungerState",
  () => [
    {
      no: 1,
      name: "ext_last_sequence_number",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 2,
      name: "ext_second_last_sequence_number",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 3,
      name: "ext_last_timestamp",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 4,
      name: "ext_second_last_timestamp",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 5,
      name: "last_marker",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 6,
      name: "second_last_marker",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const VP8MungerState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.VP8MungerState",
  () => [
    {
      no: 1,
      name: "ext_last_picture_id",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 2,
      name: "picture_id_used",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 3,
      name: "last_tl0_pic_idx",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "tl0_pic_idx_used",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 5,
      name: "tid_used",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 6,
      name: "last_key_idx",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 7,
      name: "key_idx_used",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const TimedVersion = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TimedVersion",
  () => [
    {
      no: 1,
      name: "unix_micro",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 2,
      name: "ticks",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    }
  ]
);
const DataStream = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataStream",
  []
);
const DataStream_OperationType = /* @__PURE__ */ proto3.makeEnum(
  "livekit.DataStream.OperationType",
  [
    { no: 0, name: "CREATE" },
    { no: 1, name: "UPDATE" },
    { no: 2, name: "DELETE" },
    { no: 3, name: "REACTION" }
  ]
);
const DataStream_CompressionType = /* @__PURE__ */ proto3.makeEnum(
  "livekit.DataStream.CompressionType",
  [
    { no: 0, name: "NONE" },
    { no: 1, name: "DEFLATE_RAW" }
  ]
);
const DataStream_TextHeader = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataStream.TextHeader",
  () => [
    { no: 1, name: "operation_type", kind: "enum", T: proto3.getEnumType(DataStream_OperationType) },
    {
      no: 2,
      name: "version",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 3,
      name: "reply_to_stream_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "attached_stream_ids", kind: "scalar", T: 9, repeated: true },
    {
      no: 5,
      name: "generated",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ],
  { localName: "DataStream_TextHeader" }
);
const DataStream_ByteHeader = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataStream.ByteHeader",
  () => [
    {
      no: 1,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "DataStream_ByteHeader" }
);
const DataStream_Header = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataStream.Header",
  () => [
    {
      no: 1,
      name: "stream_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "timestamp",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 3,
      name: "topic",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "mime_type",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "total_length", kind: "scalar", T: 4, opt: true },
    { no: 7, name: "encryption_type", kind: "enum", T: proto3.getEnumType(Encryption_Type) },
    { no: 8, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 9, name: "text_header", kind: "message", T: DataStream_TextHeader, oneof: "content_header" },
    { no: 10, name: "byte_header", kind: "message", T: DataStream_ByteHeader, oneof: "content_header" },
    { no: 11, name: "inline_content", kind: "scalar", T: 12, opt: true },
    { no: 12, name: "compression", kind: "enum", T: proto3.getEnumType(DataStream_CompressionType) }
  ],
  { localName: "DataStream_Header" }
);
const DataStream_Chunk = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataStream.Chunk",
  () => [
    {
      no: 1,
      name: "stream_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "chunk_index",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 3,
      name: "content",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    },
    {
      no: 4,
      name: "version",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    { no: 5, name: "iv", kind: "scalar", T: 12, opt: true }
  ],
  { localName: "DataStream_Chunk" }
);
const DataStream_Trailer = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataStream.Trailer",
  () => [
    {
      no: 1,
      name: "stream_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "reason",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } }
  ],
  { localName: "DataStream_Trailer" }
);
const FilterParams = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.FilterParams",
  () => [
    { no: 1, name: "include_events", kind: "scalar", T: 9, repeated: true },
    { no: 2, name: "exclude_events", kind: "scalar", T: 9, repeated: true }
  ]
);
const WebhookConfig = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.WebhookConfig",
  () => [
    {
      no: 1,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "signing_key",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "filter_params", kind: "message", T: FilterParams }
  ]
);
const SubscribedAudioCodec = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SubscribedAudioCodec",
  () => [
    {
      no: 1,
      name: "codec",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "enabled",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);

const JobType = /* @__PURE__ */ proto3.makeEnum(
  "livekit.JobType",
  [
    { no: 0, name: "JT_ROOM" },
    { no: 1, name: "JT_PUBLISHER" },
    { no: 2, name: "JT_PARTICIPANT" }
  ]
);
const WorkerStatus = /* @__PURE__ */ proto3.makeEnum(
  "livekit.WorkerStatus",
  [
    { no: 0, name: "WS_AVAILABLE" },
    { no: 1, name: "WS_FULL" }
  ]
);
const JobStatus = /* @__PURE__ */ proto3.makeEnum(
  "livekit.JobStatus",
  [
    { no: 0, name: "JS_PENDING" },
    { no: 1, name: "JS_RUNNING" },
    { no: 2, name: "JS_SUCCESS" },
    { no: 3, name: "JS_FAILED" }
  ]
);
const Job = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Job",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "dispatch_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "type", kind: "enum", T: proto3.getEnumType(JobType) },
    { no: 3, name: "room", kind: "message", T: Room },
    { no: 4, name: "participant", kind: "message", T: ParticipantInfo, opt: true },
    {
      no: 5,
      name: "namespace",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "agent_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 8, name: "state", kind: "message", T: JobState },
    {
      no: 10,
      name: "enable_recording",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 11,
      name: "deployment",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 12, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 13,
      name: "enable_redaction",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const JobState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.JobState",
  () => [
    { no: 1, name: "status", kind: "enum", T: proto3.getEnumType(JobStatus) },
    {
      no: 2,
      name: "error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "started_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 4,
      name: "ended_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 5,
      name: "updated_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 6,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "worker_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "agent_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const WorkerMessage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.WorkerMessage",
  () => [
    { no: 1, name: "register", kind: "message", T: RegisterWorkerRequest, oneof: "message" },
    { no: 2, name: "availability", kind: "message", T: AvailabilityResponse, oneof: "message" },
    { no: 3, name: "update_worker", kind: "message", T: UpdateWorkerStatus, oneof: "message" },
    { no: 4, name: "update_job", kind: "message", T: UpdateJobStatus, oneof: "message" },
    { no: 5, name: "ping", kind: "message", T: WorkerPing, oneof: "message" },
    { no: 6, name: "simulate_job", kind: "message", T: SimulateJobRequest, oneof: "message" },
    { no: 7, name: "migrate_job", kind: "message", T: MigrateJobRequest, oneof: "message" }
  ]
);
const ServerMessage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ServerMessage",
  () => [
    { no: 1, name: "register", kind: "message", T: RegisterWorkerResponse, oneof: "message" },
    { no: 2, name: "availability", kind: "message", T: AvailabilityRequest, oneof: "message" },
    { no: 3, name: "assignment", kind: "message", T: JobAssignment, oneof: "message" },
    { no: 5, name: "termination", kind: "message", T: JobTermination, oneof: "message" },
    { no: 4, name: "pong", kind: "message", T: WorkerPong, oneof: "message" }
  ]
);
const SimulateJobRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulateJobRequest",
  () => [
    { no: 1, name: "type", kind: "enum", T: proto3.getEnumType(JobType) },
    { no: 2, name: "room", kind: "message", T: Room },
    { no: 3, name: "participant", kind: "message", T: ParticipantInfo }
  ]
);
const WorkerPing = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.WorkerPing",
  () => [
    {
      no: 1,
      name: "timestamp",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    }
  ]
);
const WorkerPong = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.WorkerPong",
  () => [
    {
      no: 1,
      name: "last_timestamp",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 2,
      name: "timestamp",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    }
  ]
);
const RegisterWorkerRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RegisterWorkerRequest",
  () => [
    { no: 1, name: "type", kind: "enum", T: proto3.getEnumType(JobType) },
    {
      no: 8,
      name: "agent_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "version",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "ping_interval",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 6, name: "namespace", kind: "scalar", T: 9, opt: true },
    { no: 7, name: "allowed_permissions", kind: "message", T: ParticipantPermission },
    {
      no: 9,
      name: "deployment",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const RegisterWorkerResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RegisterWorkerResponse",
  () => [
    {
      no: 1,
      name: "worker_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "server_info", kind: "message", T: ServerInfo }
  ]
);
const MigrateJobRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MigrateJobRequest",
  () => [
    { no: 2, name: "job_ids", kind: "scalar", T: 9, repeated: true }
  ]
);
const AvailabilityRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AvailabilityRequest",
  () => [
    { no: 1, name: "job", kind: "message", T: Job },
    {
      no: 2,
      name: "resuming",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const AvailabilityResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AvailabilityResponse",
  () => [
    {
      no: 1,
      name: "job_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "available",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 3,
      name: "supports_resume",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 8,
      name: "terminate",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 4,
      name: "participant_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "participant_metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 7, name: "participant_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } }
  ]
);
const UpdateJobStatus = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateJobStatus",
  () => [
    {
      no: 1,
      name: "job_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "status", kind: "enum", T: proto3.getEnumType(JobStatus) },
    {
      no: 3,
      name: "error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const UpdateWorkerStatus = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateWorkerStatus",
  () => [
    { no: 1, name: "status", kind: "enum", T: proto3.getEnumType(WorkerStatus), opt: true },
    {
      no: 3,
      name: "load",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    {
      no: 4,
      name: "job_count",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const JobAssignment = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.JobAssignment",
  () => [
    { no: 1, name: "job", kind: "message", T: Job },
    { no: 2, name: "url", kind: "scalar", T: 9, opt: true },
    {
      no: 3,
      name: "token",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const JobTermination = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.JobTermination",
  () => [
    {
      no: 1,
      name: "job_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);

const JobRestartPolicy = /* @__PURE__ */ proto3.makeEnum(
  "livekit.JobRestartPolicy",
  [
    { no: 0, name: "JRP_ON_FAILURE" },
    { no: 1, name: "JRP_NEVER" }
  ]
);
const CreateAgentDispatchRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.CreateAgentDispatchRequest",
  () => [
    {
      no: 1,
      name: "agent_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "restart_policy", kind: "enum", T: proto3.getEnumType(JobRestartPolicy) },
    {
      no: 5,
      name: "deployment",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 6, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } }
  ]
);
const RoomAgentDispatch = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RoomAgentDispatch",
  () => [
    {
      no: 1,
      name: "agent_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "restart_policy", kind: "enum", T: proto3.getEnumType(JobRestartPolicy) },
    {
      no: 4,
      name: "deployment",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } }
  ]
);
const DeleteAgentDispatchRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DeleteAgentDispatchRequest",
  () => [
    {
      no: 1,
      name: "dispatch_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ListAgentDispatchRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListAgentDispatchRequest",
  () => [
    {
      no: 1,
      name: "dispatch_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ListAgentDispatchResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListAgentDispatchResponse",
  () => [
    { no: 1, name: "agent_dispatches", kind: "message", T: AgentDispatch, repeated: true }
  ]
);
const AgentDispatch = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AgentDispatch",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "agent_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "state", kind: "message", T: AgentDispatchState },
    { no: 6, name: "restart_policy", kind: "enum", T: proto3.getEnumType(JobRestartPolicy) },
    {
      no: 7,
      name: "deployment",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 8, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } }
  ]
);
const AgentDispatchState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AgentDispatchState",
  () => [
    { no: 1, name: "jobs", kind: "message", T: Job, repeated: true },
    {
      no: 2,
      name: "created_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 3,
      name: "deleted_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    }
  ]
);

const PresignedPostRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.PresignedPostRequest",
  () => [
    {
      no: 1,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "values", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } }
  ]
);

const SimulationMode = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SimulationMode",
  [
    { no: 0, name: "SIMULATION_MODE_UNSPECIFIED", localName: "UNSPECIFIED" },
    { no: 1, name: "SIMULATION_MODE_TEXT", localName: "TEXT" },
    { no: 2, name: "SIMULATION_MODE_AUDIO", localName: "AUDIO" }
  ]
);
const SimulationRunSummary = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRunSummary",
  () => [
    {
      no: 1,
      name: "passed",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 2,
      name: "failed",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 3,
      name: "going_well",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "to_improve",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "issues", kind: "message", T: SimulationRunSummary_Issue, repeated: true },
    { no: 6, name: "chat_history", kind: "map", K: 9, V: { kind: "message", T: ChatContext } }
  ]
);
const SimulationRunSummary_Issue = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRunSummary.Issue",
  () => [
    {
      no: 1,
      name: "description",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "suggestion",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "label",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "SimulationRunSummary_Issue" }
);
const SimulationRun = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "status", kind: "enum", T: proto3.getEnumType(SimulationRun_Status) },
    {
      no: 4,
      name: "agent_description",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 6, name: "created_at", kind: "message", T: Timestamp },
    { no: 7, name: "jobs", kind: "message", T: SimulationRun_Job, repeated: true },
    {
      no: 9,
      name: "agent_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 10, name: "scenario_group", kind: "message", T: ScenarioGroup },
    { no: 11, name: "ended_at", kind: "message", T: Timestamp },
    {
      no: 12,
      name: "job_count",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 13,
      name: "passed_count",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 14,
      name: "failed_count",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 15,
      name: "num_simulations",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    { no: 16, name: "usage", kind: "message", T: SimulationRun_Usage },
    {
      no: 17,
      name: "concurrency",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    { no: 18, name: "mode", kind: "enum", T: proto3.getEnumType(SimulationMode) },
    { no: 19, name: "metrics", kind: "message", T: SimulationRun_RunMetrics },
    {
      no: 20,
      name: "summary_zstd",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    }
  ]
);
const SimulationRun_Status = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SimulationRun.Status",
  [
    { no: 0, name: "STATUS_PENDING_UPLOAD", localName: "PENDING_UPLOAD" },
    { no: 1, name: "STATUS_GENERATING", localName: "GENERATING" },
    { no: 2, name: "STATUS_RUNNING", localName: "RUNNING" },
    { no: 3, name: "STATUS_SUMMARIZING", localName: "SUMMARIZING" },
    { no: 4, name: "STATUS_COMPLETED", localName: "COMPLETED" },
    { no: 5, name: "STATUS_FAILED", localName: "FAILED" },
    { no: 6, name: "STATUS_CANCELLED", localName: "CANCELLED" }
  ]
);
const SimulationRun_Job = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Job",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "status", kind: "enum", T: proto3.getEnumType(SimulationRun_Job_Status) },
    {
      no: 3,
      name: "instructions",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "agent_expectations",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "label",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 7, name: "tags", kind: "scalar", T: 9, repeated: true },
    {
      no: 8,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 10, name: "started_at", kind: "message", T: Timestamp },
    { no: 11, name: "ended_at", kind: "message", T: Timestamp },
    {
      no: 12,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 13, name: "usage", kind: "message", T: SimulationRun_Job_Usage },
    { no: 14, name: "metrics", kind: "message", T: SimulationRun_JobMetrics }
  ],
  { localName: "SimulationRun_Job" }
);
const SimulationRun_Job_Status = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SimulationRun.Job.Status",
  [
    { no: 0, name: "STATUS_PENDING", localName: "PENDING" },
    { no: 1, name: "STATUS_RUNNING", localName: "RUNNING" },
    { no: 2, name: "STATUS_COMPLETED", localName: "COMPLETED" },
    { no: 3, name: "STATUS_FAILED", localName: "FAILED" },
    { no: 4, name: "STATUS_CANCELLED", localName: "CANCELLED" }
  ]
);
const SimulationRun_Job_Usage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Job.Usage",
  () => [
    {
      no: 1,
      name: "text_turns_count",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 2,
      name: "audio_turns_count",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    }
  ],
  { localName: "SimulationRun_Job_Usage" }
);
const SimulationRun_JobMetrics = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.JobMetrics",
  () => [
    { no: 1, name: "accuracy_score", kind: "scalar", T: 2, opt: true },
    { no: 2, name: "experience_score", kind: "scalar", T: 2, opt: true },
    { no: 3, name: "task_completion", kind: "scalar", T: 2, opt: true },
    { no: 4, name: "stt", kind: "message", T: SimulationRun_JobMetrics_STT },
    { no: 5, name: "llm", kind: "message", T: SimulationRun_JobMetrics_LLM },
    { no: 6, name: "tts", kind: "message", T: SimulationRun_JobMetrics_TTS },
    { no: 7, name: "conversation", kind: "message", T: SimulationRun_JobMetrics_Conversation },
    { no: 9, name: "turns", kind: "message", T: SimulationRun_JobMetrics_Turn, repeated: true },
    {
      no: 10,
      name: "judge_model",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 12,
      name: "has_remote_session",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 13, name: "t0", kind: "message", T: Timestamp },
    { no: 14, name: "conciseness", kind: "scalar", T: 2, opt: true },
    { no: 15, name: "unnecessary_tool_calls", kind: "scalar", T: 8, opt: true },
    { no: 16, name: "information_loss", kind: "scalar", T: 8, opt: true },
    { no: 17, name: "redundant_statements", kind: "scalar", T: 8, opt: true },
    { no: 18, name: "poor_question_quality", kind: "scalar", T: 8, opt: true },
    { no: 19, name: "conversation_progression", kind: "scalar", T: 2, opt: true }
  ],
  { localName: "SimulationRun_JobMetrics" }
);
const SimulationRun_JobMetrics_STT = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.JobMetrics.STT",
  () => [
    { no: 1, name: "wer", kind: "scalar", T: 2, opt: true },
    { no: 2, name: "words", kind: "scalar", T: 13, opt: true },
    { no: 3, name: "word_errors", kind: "scalar", T: 13, opt: true },
    { no: 4, name: "cer", kind: "scalar", T: 2, opt: true },
    { no: 9, name: "chars", kind: "scalar", T: 13, opt: true },
    { no: 10, name: "char_errors", kind: "scalar", T: 13, opt: true },
    { no: 8, name: "stt_delay_ms", kind: "scalar", T: 13, opt: true },
    { no: 11, name: "entity_recognition", kind: "scalar", T: 2, opt: true },
    { no: 12, name: "entities_uttered", kind: "scalar", T: 13, opt: true },
    { no: 13, name: "entities_recognized", kind: "scalar", T: 13, opt: true },
    { no: 14, name: "entity_recall", kind: "scalar", T: 2, opt: true },
    { no: 15, name: "entities_acquired_uttered", kind: "scalar", T: 13, opt: true },
    { no: 16, name: "entities_acquired_recognized", kind: "scalar", T: 13, opt: true }
  ],
  { localName: "SimulationRun_JobMetrics_STT" }
);
const SimulationRun_JobMetrics_LLM = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.JobMetrics.LLM",
  () => [
    { no: 1, name: "ttft_ms", kind: "scalar", T: 13, opt: true },
    { no: 2, name: "ttfs_ms", kind: "scalar", T: 13, opt: true },
    { no: 3, name: "tokens_per_second", kind: "scalar", T: 2, opt: true }
  ],
  { localName: "SimulationRun_JobMetrics_LLM" }
);
const SimulationRun_JobMetrics_TTS = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.JobMetrics.TTS",
  () => [
    { no: 2, name: "ttfb_ms", kind: "scalar", T: 13, opt: true },
    { no: 3, name: "wer", kind: "scalar", T: 2, opt: true },
    { no: 7, name: "words", kind: "scalar", T: 13, opt: true },
    { no: 8, name: "word_errors", kind: "scalar", T: 13, opt: true },
    { no: 9, name: "cer", kind: "scalar", T: 2, opt: true },
    { no: 10, name: "chars", kind: "scalar", T: 13, opt: true },
    { no: 11, name: "char_errors", kind: "scalar", T: 13, opt: true },
    { no: 14, name: "entity_recognition", kind: "scalar", T: 2, opt: true },
    { no: 15, name: "entities_uttered", kind: "scalar", T: 13, opt: true },
    { no: 16, name: "entities_recognized", kind: "scalar", T: 13, opt: true },
    { no: 17, name: "entity_recall", kind: "scalar", T: 2, opt: true },
    { no: 18, name: "entities_acquired_uttered", kind: "scalar", T: 13, opt: true },
    { no: 19, name: "entities_acquired_recognized", kind: "scalar", T: 13, opt: true }
  ],
  { localName: "SimulationRun_JobMetrics_TTS" }
);
const SimulationRun_JobMetrics_Conversation = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.JobMetrics.Conversation",
  () => [
    { no: 1, name: "turn_taking_score", kind: "scalar", T: 2, opt: true },
    { no: 2, name: "heard_e2e_latency_p50_ms", kind: "scalar", T: 5, opt: true },
    { no: 3, name: "heard_e2e_latency_p95_ms", kind: "scalar", T: 5, opt: true },
    { no: 4, name: "heard_e2e_latency_p99_ms", kind: "scalar", T: 5, opt: true },
    { no: 5, name: "time_to_yield_ms", kind: "scalar", T: 13, opt: true },
    { no: 6, name: "eot_misprediction_count", kind: "scalar", T: 13, opt: true },
    { no: 7, name: "overlap_ratio", kind: "scalar", T: 2, opt: true },
    { no: 8, name: "overlap_speech_ms", kind: "scalar", T: 13, opt: true },
    { no: 9, name: "total_speech_ms", kind: "scalar", T: 13, opt: true },
    { no: 11, name: "awkward_silence_count", kind: "scalar", T: 13, opt: true },
    { no: 12, name: "unanswered_turns", kind: "scalar", T: 13, opt: true },
    { no: 13, name: "false_interruption_count", kind: "scalar", T: 13, opt: true },
    { no: 15, name: "e2e_latency_ms", kind: "scalar", T: 13, opt: true }
  ],
  { localName: "SimulationRun_JobMetrics_Conversation" }
);
const SimulationRun_JobMetrics_Turn = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.JobMetrics.Turn",
  () => [
    {
      no: 1,
      name: "index",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 2, name: "role", kind: "enum", T: proto3.getEnumType(ChatRole) },
    { no: 3, name: "start_ms", kind: "scalar", T: 13, opt: true },
    { no: 4, name: "end_ms", kind: "scalar", T: 13, opt: true },
    { no: 5, name: "stt_delay_ms", kind: "scalar", T: 13, opt: true },
    { no: 6, name: "llm_ttft_ms", kind: "scalar", T: 13, opt: true },
    { no: 7, name: "llm_ttfs_ms", kind: "scalar", T: 13, opt: true },
    { no: 8, name: "llm_tps", kind: "scalar", T: 2, opt: true },
    { no: 9, name: "tts_ttfb_ms", kind: "scalar", T: 13, opt: true },
    { no: 10, name: "e2e_latency_ms", kind: "scalar", T: 13, opt: true },
    { no: 11, name: "heard_e2e_latency_ms", kind: "scalar", T: 5, opt: true },
    { no: 12, name: "time_to_yield_ms", kind: "scalar", T: 13, opt: true },
    { no: 13, name: "turn_taking_score", kind: "scalar", T: 2, opt: true },
    { no: 14, name: "conciseness", kind: "scalar", T: 2, opt: true },
    { no: 15, name: "eot_misprediction", kind: "scalar", T: 8, opt: true },
    { no: 16, name: "awkward_silence", kind: "scalar", T: 8, opt: true },
    { no: 17, name: "unanswered", kind: "scalar", T: 8, opt: true }
  ],
  { localName: "SimulationRun_JobMetrics_Turn" }
);
const SimulationRun_RunMetrics = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.RunMetrics",
  () => [
    { no: 1, name: "accuracy_score", kind: "scalar", T: 2, opt: true },
    { no: 2, name: "experience_score", kind: "scalar", T: 2, opt: true },
    { no: 3, name: "scenario_pass_rate", kind: "scalar", T: 2, opt: true },
    { no: 4, name: "stt", kind: "message", T: SimulationRun_JobMetrics_STT },
    { no: 5, name: "llm", kind: "message", T: SimulationRun_JobMetrics_LLM },
    { no: 6, name: "tts", kind: "message", T: SimulationRun_JobMetrics_TTS },
    { no: 7, name: "conversation", kind: "message", T: SimulationRun_JobMetrics_Conversation },
    { no: 8, name: "conciseness", kind: "scalar", T: 2, opt: true },
    { no: 9, name: "conversation_progression", kind: "scalar", T: 2, opt: true }
  ],
  { localName: "SimulationRun_RunMetrics" }
);
const SimulationRun_Create = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Create",
  [],
  { localName: "SimulationRun_Create" }
);
const SimulationRun_Create_Request = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Create.Request",
  () => [
    {
      no: 1,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "agent_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "num_simulations",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 6,
      name: "region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 7, name: "scenario_group", kind: "message", T: ScenarioGroup, opt: true },
    { no: 8, name: "concurrency", kind: "scalar", T: 5, opt: true },
    { no: 9, name: "mode", kind: "enum", T: proto3.getEnumType(SimulationMode) },
    {
      no: 10,
      name: "background_noise",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 11,
      name: "low_quality_microphone",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 12,
      name: "packet_loss",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ],
  { localName: "SimulationRun_Create_Request" }
);
const SimulationRun_Create_Response = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Create.Response",
  () => [
    {
      no: 1,
      name: "simulation_run_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "presigned_post_request", kind: "message", T: PresignedPostRequest }
  ],
  { localName: "SimulationRun_Create_Response" }
);
const SimulationRun_ConfirmSourceUpload = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.ConfirmSourceUpload",
  [],
  { localName: "SimulationRun_ConfirmSourceUpload" }
);
const SimulationRun_ConfirmSourceUpload_Request = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.ConfirmSourceUpload.Request",
  () => [
    {
      no: 1,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "simulation_run_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "code_entrypoint",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "SimulationRun_ConfirmSourceUpload_Request" }
);
const SimulationRun_ConfirmSourceUpload_Response = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.ConfirmSourceUpload.Response",
  [],
  { localName: "SimulationRun_ConfirmSourceUpload_Response" }
);
const SimulationRun_Get = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Get",
  [],
  { localName: "SimulationRun_Get" }
);
const SimulationRun_Get_Request = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Get.Request",
  () => [
    {
      no: 1,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "simulation_run_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "SimulationRun_Get_Request" }
);
const SimulationRun_Get_Response = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Get.Response",
  () => [
    { no: 1, name: "run", kind: "message", T: SimulationRun }
  ],
  { localName: "SimulationRun_Get_Response" }
);
const SimulationRun_List = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.List",
  [],
  { localName: "SimulationRun_List" }
);
const SimulationRun_List_Request = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.List.Request",
  () => [
    {
      no: 1,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "status", kind: "enum", T: proto3.getEnumType(SimulationRun_Status), opt: true },
    { no: 3, name: "page_token", kind: "message", T: TokenPagination, opt: true },
    { no: 4, name: "start_time", kind: "message", T: Timestamp, opt: true },
    { no: 5, name: "end_time", kind: "message", T: Timestamp, opt: true },
    { no: 6, name: "agent_name", kind: "scalar", T: 9, opt: true }
  ],
  { localName: "SimulationRun_List_Request" }
);
const SimulationRun_List_Response = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.List.Response",
  () => [
    { no: 1, name: "runs", kind: "message", T: SimulationRun, repeated: true },
    { no: 2, name: "next_page_token", kind: "message", T: TokenPagination }
  ],
  { localName: "SimulationRun_List_Response" }
);
const SimulationRun_Counts = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Counts",
  [],
  { localName: "SimulationRun_Counts" }
);
const SimulationRun_Counts_Request = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Counts.Request",
  () => [
    {
      no: 1,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "start_time", kind: "message", T: Timestamp },
    { no: 3, name: "end_time", kind: "message", T: Timestamp },
    { no: 4, name: "status", kind: "enum", T: proto3.getEnumType(SimulationRun_Status), opt: true },
    { no: 5, name: "agent_name", kind: "scalar", T: 9, opt: true }
  ],
  { localName: "SimulationRun_Counts_Request" }
);
const SimulationRun_Counts_Response = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Counts.Response",
  () => [
    { no: 1, name: "buckets", kind: "message", T: SimulationRun_Counts_Bucket, repeated: true },
    { no: 2, name: "interval", kind: "message", T: Duration }
  ],
  { localName: "SimulationRun_Counts_Response" }
);
const SimulationRun_Counts_Bucket = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Counts.Bucket",
  () => [
    { no: 1, name: "bucket_start", kind: "message", T: Timestamp },
    {
      no: 2,
      name: "count",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    }
  ],
  { localName: "SimulationRun_Counts_Bucket" }
);
const SimulationRun_Cancel = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Cancel",
  [],
  { localName: "SimulationRun_Cancel" }
);
const SimulationRun_Cancel_Request = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Cancel.Request",
  () => [
    {
      no: 1,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "simulation_run_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "SimulationRun_Cancel_Request" }
);
const SimulationRun_Cancel_Response = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Cancel.Response",
  [],
  { localName: "SimulationRun_Cancel_Response" }
);
const SimulationRun_Usage = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationRun.Usage",
  () => [
    {
      no: 1,
      name: "text_turns_count",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 2,
      name: "audio_turns_count",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    }
  ],
  { localName: "SimulationRun_Usage" }
);
const Scenario = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Scenario",
  () => [
    {
      no: 1,
      name: "label",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "instructions",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "agent_expectations",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "tags", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 5,
      name: "userdata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const Scenario_CreateFromSession = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Scenario.CreateFromSession",
  [],
  { localName: "Scenario_CreateFromSession" }
);
const Scenario_CreateFromSession_Request = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Scenario.CreateFromSession.Request",
  () => [
    {
      no: 1,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "Scenario_CreateFromSession_Request" }
);
const Scenario_CreateFromSession_Response = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Scenario.CreateFromSession.Response",
  () => [
    { no: 1, name: "scenario", kind: "message", T: Scenario }
  ],
  { localName: "Scenario_CreateFromSession_Response" }
);
const ScenarioGroup = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ScenarioGroup",
  () => [
    {
      no: 1,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "scenarios", kind: "message", T: Scenario, repeated: true }
  ]
);
const SimulationDispatch = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulationDispatch",
  () => [
    {
      no: 1,
      name: "simulation_run_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "job_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "scenario", kind: "message", T: Scenario },
    { no: 4, name: "mode", kind: "enum", T: proto3.getEnumType(SimulationMode) }
  ]
);

const AudioChannel = /* @__PURE__ */ proto3.makeEnum(
  "livekit.AudioChannel",
  [
    { no: 0, name: "AUDIO_CHANNEL_BOTH", localName: "BOTH" },
    { no: 1, name: "AUDIO_CHANNEL_LEFT", localName: "LEFT" },
    { no: 2, name: "AUDIO_CHANNEL_RIGHT", localName: "RIGHT" }
  ]
);
const EncodingOptionsPreset = /* @__PURE__ */ proto3.makeEnum(
  "livekit.EncodingOptionsPreset",
  [
    { no: 0, name: "H264_720P_30" },
    { no: 1, name: "H264_720P_60" },
    { no: 2, name: "H264_1080P_30" },
    { no: 3, name: "H264_1080P_60" },
    { no: 4, name: "PORTRAIT_H264_720P_30" },
    { no: 5, name: "PORTRAIT_H264_720P_60" },
    { no: 6, name: "PORTRAIT_H264_1080P_30" },
    { no: 7, name: "PORTRAIT_H264_1080P_60" },
    { no: 8, name: "PASSTHROUGH" }
  ]
);
const EncodedFileType = /* @__PURE__ */ proto3.makeEnum(
  "livekit.EncodedFileType",
  [
    { no: 0, name: "DEFAULT_FILETYPE" },
    { no: 1, name: "MP4" },
    { no: 2, name: "OGG" },
    { no: 3, name: "MP3" }
  ]
);
const StreamProtocol = /* @__PURE__ */ proto3.makeEnum(
  "livekit.StreamProtocol",
  [
    { no: 0, name: "DEFAULT_PROTOCOL" },
    { no: 1, name: "RTMP" },
    { no: 2, name: "SRT" },
    { no: 3, name: "WEBSOCKET" }
  ]
);
const SegmentedFileProtocol = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SegmentedFileProtocol",
  [
    { no: 0, name: "DEFAULT_SEGMENTED_FILE_PROTOCOL" },
    { no: 1, name: "HLS_PROTOCOL" }
  ]
);
const SegmentedFileSuffix = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SegmentedFileSuffix",
  [
    { no: 0, name: "INDEX" },
    { no: 1, name: "TIMESTAMP" }
  ]
);
const ImageFileSuffix = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ImageFileSuffix",
  [
    { no: 0, name: "IMAGE_SUFFIX_INDEX" },
    { no: 1, name: "IMAGE_SUFFIX_TIMESTAMP" },
    { no: 2, name: "IMAGE_SUFFIX_NONE_OVERWRITE" }
  ]
);
const EgressSourceType = /* @__PURE__ */ proto3.makeEnum(
  "livekit.EgressSourceType",
  [
    { no: 0, name: "EGRESS_SOURCE_TYPE_WEB", localName: "WEB" },
    { no: 1, name: "EGRESS_SOURCE_TYPE_SDK", localName: "SDK" }
  ]
);
const EgressStatus = /* @__PURE__ */ proto3.makeEnum(
  "livekit.EgressStatus",
  [
    { no: 0, name: "EGRESS_STARTING" },
    { no: 1, name: "EGRESS_ACTIVE" },
    { no: 2, name: "EGRESS_ENDING" },
    { no: 3, name: "EGRESS_COMPLETE" },
    { no: 4, name: "EGRESS_FAILED" },
    { no: 5, name: "EGRESS_ABORTED" },
    { no: 6, name: "EGRESS_LIMIT_REACHED" }
  ]
);
const AudioMixing = /* @__PURE__ */ proto3.makeEnum(
  "livekit.AudioMixing",
  [
    { no: 0, name: "DEFAULT_MIXING" },
    { no: 1, name: "DUAL_CHANNEL_AGENT" },
    { no: 2, name: "DUAL_CHANNEL_ALTERNATE" }
  ]
);
const StartEgressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.StartEgressRequest",
  () => [
    {
      no: 1,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "template", kind: "message", T: TemplateSource, oneof: "source" },
    { no: 3, name: "web", kind: "message", T: WebSource, oneof: "source" },
    { no: 4, name: "media", kind: "message", T: MediaSource, oneof: "source" },
    { no: 5, name: "preset", kind: "enum", T: proto3.getEnumType(EncodingOptionsPreset), oneof: "encoding" },
    { no: 6, name: "advanced", kind: "message", T: EncodingOptions, oneof: "encoding" },
    { no: 7, name: "outputs", kind: "message", T: Output, repeated: true },
    { no: 8, name: "storage", kind: "message", T: StorageConfig },
    { no: 9, name: "webhooks", kind: "message", T: WebhookConfig, repeated: true }
  ]
);
const TemplateSource = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TemplateSource",
  () => [
    {
      no: 1,
      name: "layout",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "audio_only",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 3,
      name: "video_only",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 4,
      name: "custom_base_url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const WebSource = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.WebSource",
  () => [
    {
      no: 1,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "audio_only",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 3,
      name: "video_only",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 4,
      name: "await_start_signal",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const MediaSource = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MediaSource",
  () => [
    { no: 1, name: "video_track_id", kind: "scalar", T: 9, oneof: "video" },
    { no: 2, name: "participant_video", kind: "message", T: ParticipantVideo, oneof: "video" },
    { no: 3, name: "audio", kind: "message", T: AudioConfig }
  ]
);
const ParticipantVideo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ParticipantVideo",
  () => [
    {
      no: 1,
      name: "identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "prefer_screen_share",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const AudioConfig = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AudioConfig",
  () => [
    {
      no: 1,
      name: "capture_all",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 2, name: "routes", kind: "message", T: AudioRoute, repeated: true }
  ]
);
const AudioRoute = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AudioRoute",
  () => [
    { no: 1, name: "track_id", kind: "scalar", T: 9, oneof: "match" },
    { no: 2, name: "participant_identity", kind: "scalar", T: 9, oneof: "match" },
    { no: 3, name: "participant_kind", kind: "enum", T: proto3.getEnumType(ParticipantInfo_Kind), oneof: "match" },
    { no: 4, name: "channel", kind: "enum", T: proto3.getEnumType(AudioChannel) }
  ]
);
const DataConfig = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataConfig",
  () => [
    {
      no: 1,
      name: "capture_all",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 2, name: "selectors", kind: "message", T: DataSelector, repeated: true }
  ]
);
const DataSelector = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataSelector",
  () => [
    { no: 1, name: "track_id", kind: "scalar", T: 9, oneof: "match" },
    { no: 2, name: "participant_identity", kind: "scalar", T: 9, oneof: "match" }
  ]
);
const EncodingOptions = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.EncodingOptions",
  () => [
    {
      no: 1,
      name: "width",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 2,
      name: "height",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 3,
      name: "depth",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 4,
      name: "framerate",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    { no: 5, name: "audio_codec", kind: "enum", T: proto3.getEnumType(AudioCodec) },
    {
      no: 6,
      name: "audio_bitrate",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 7,
      name: "audio_frequency",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    { no: 8, name: "video_codec", kind: "enum", T: proto3.getEnumType(VideoCodec) },
    {
      no: 9,
      name: "video_bitrate",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 10,
      name: "key_frame_interval",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    {
      no: 11,
      name: "audio_quality",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 12,
      name: "video_quality",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    }
  ]
);
const Output = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Output",
  () => [
    { no: 1, name: "file", kind: "message", T: FileOutput, oneof: "config" },
    { no: 2, name: "stream", kind: "message", T: StreamOutput, oneof: "config" },
    { no: 3, name: "segments", kind: "message", T: SegmentedFileOutput, oneof: "config" },
    { no: 4, name: "images", kind: "message", T: ImageOutput, oneof: "config" },
    { no: 6, name: "storage", kind: "message", T: StorageConfig }
  ]
);
const FileOutput = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.FileOutput",
  () => [
    { no: 1, name: "file_type", kind: "enum", T: proto3.getEnumType(EncodedFileType) },
    {
      no: 2,
      name: "filepath",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "disable_manifest",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const StreamOutput = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.StreamOutput",
  () => [
    { no: 1, name: "protocol", kind: "enum", T: proto3.getEnumType(StreamProtocol) },
    { no: 2, name: "urls", kind: "scalar", T: 9, repeated: true }
  ]
);
const SegmentedFileOutput = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SegmentedFileOutput",
  () => [
    { no: 1, name: "protocol", kind: "enum", T: proto3.getEnumType(SegmentedFileProtocol) },
    {
      no: 2,
      name: "filename_prefix",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "playlist_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 11,
      name: "live_playlist_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "segment_duration",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 10, name: "filename_suffix", kind: "enum", T: proto3.getEnumType(SegmentedFileSuffix) },
    {
      no: 8,
      name: "disable_manifest",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 5, name: "s3", kind: "message", T: S3Upload, oneof: "output" },
    { no: 6, name: "gcp", kind: "message", T: GCPUpload, oneof: "output" },
    { no: 7, name: "azure", kind: "message", T: AzureBlobUpload, oneof: "output" },
    { no: 9, name: "aliOSS", kind: "message", T: AliOSSUpload, oneof: "output" }
  ]
);
const ImageOutput = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ImageOutput",
  () => [
    {
      no: 1,
      name: "capture_interval",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 2,
      name: "width",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 3,
      name: "height",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 4,
      name: "filename_prefix",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "filename_suffix", kind: "enum", T: proto3.getEnumType(ImageFileSuffix) },
    { no: 6, name: "image_codec", kind: "enum", T: proto3.getEnumType(ImageCodec) },
    {
      no: 7,
      name: "disable_manifest",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 8, name: "s3", kind: "message", T: S3Upload, oneof: "output" },
    { no: 9, name: "gcp", kind: "message", T: GCPUpload, oneof: "output" },
    { no: 10, name: "azure", kind: "message", T: AzureBlobUpload, oneof: "output" },
    { no: 11, name: "aliOSS", kind: "message", T: AliOSSUpload, oneof: "output" }
  ]
);
const StorageConfig = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.StorageConfig",
  () => [
    { no: 1, name: "s3", kind: "message", T: S3Upload, oneof: "provider" },
    { no: 2, name: "gcp", kind: "message", T: GCPUpload, oneof: "provider" },
    { no: 3, name: "azure", kind: "message", T: AzureBlobUpload, oneof: "provider" },
    { no: 4, name: "aliOSS", kind: "message", T: AliOSSUpload, oneof: "provider" }
  ]
);
const S3Upload = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.S3Upload",
  () => [
    {
      no: 1,
      name: "access_key",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "secret",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 11,
      name: "session_token",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 12,
      name: "assume_role_arn",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 13,
      name: "assume_role_external_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "endpoint",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "bucket",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "force_path_style",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 7, name: "metadata", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 8,
      name: "tagging",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "content_disposition",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 10, name: "proxy", kind: "message", T: ProxyConfig }
  ]
);
const GCPUpload = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.GCPUpload",
  () => [
    {
      no: 1,
      name: "credentials",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "bucket",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "proxy", kind: "message", T: ProxyConfig }
  ]
);
const AzureBlobUpload = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AzureBlobUpload",
  () => [
    {
      no: 1,
      name: "account_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "account_key",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "container_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const AliOSSUpload = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AliOSSUpload",
  () => [
    {
      no: 1,
      name: "access_key",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "secret",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "endpoint",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "bucket",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ProxyConfig = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ProxyConfig",
  () => [
    {
      no: 1,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "username",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "password",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ListEgressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListEgressRequest",
  () => [
    {
      no: 1,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "egress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "active",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 4, name: "page_token", kind: "message", T: TokenPagination }
  ]
);
const ListEgressResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListEgressResponse",
  () => [
    { no: 1, name: "items", kind: "message", T: EgressInfo, repeated: true },
    { no: 2, name: "next_page_token", kind: "message", T: TokenPagination }
  ]
);
const StopEgressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.StopEgressRequest",
  () => [
    {
      no: 1,
      name: "egress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const EgressInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.EgressInfo",
  () => [
    {
      no: 1,
      name: "egress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 13,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 26, name: "source_type", kind: "enum", T: proto3.getEnumType(EgressSourceType) },
    { no: 3, name: "status", kind: "enum", T: proto3.getEnumType(EgressStatus) },
    {
      no: 10,
      name: "started_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 11,
      name: "ended_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 18,
      name: "updated_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 29, name: "egress", kind: "message", T: StartEgressRequest, oneof: "request" },
    { no: 30, name: "replay", kind: "message", T: ExportReplayRequest, oneof: "request" },
    { no: 4, name: "room_composite", kind: "message", T: RoomCompositeEgressRequest, oneof: "request" },
    { no: 14, name: "web", kind: "message", T: WebEgressRequest, oneof: "request" },
    { no: 19, name: "participant", kind: "message", T: ParticipantEgressRequest, oneof: "request" },
    { no: 5, name: "track_composite", kind: "message", T: TrackCompositeEgressRequest, oneof: "request" },
    { no: 6, name: "track", kind: "message", T: TrackEgressRequest, oneof: "request" },
    { no: 15, name: "stream_results", kind: "message", T: StreamInfo, repeated: true },
    { no: 16, name: "file_results", kind: "message", T: FileInfo, repeated: true },
    { no: 17, name: "segment_results", kind: "message", T: SegmentsInfo, repeated: true },
    { no: 20, name: "image_results", kind: "message", T: ImagesInfo, repeated: true },
    {
      no: 9,
      name: "error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 22,
      name: "error_code",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 21,
      name: "details",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 23,
      name: "manifest_location",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 25,
      name: "backup_storage_used",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 27,
      name: "retry_count",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    { no: 7, name: "stream", kind: "message", T: StreamInfoList, oneof: "result" },
    { no: 8, name: "file", kind: "message", T: FileInfo, oneof: "result" },
    { no: 12, name: "segments", kind: "message", T: SegmentsInfo, oneof: "result" }
  ]
);
const StreamInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.StreamInfo",
  () => [
    {
      no: 1,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "started_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 3,
      name: "ended_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 4,
      name: "duration",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 5, name: "status", kind: "enum", T: proto3.getEnumType(StreamInfo_Status) },
    {
      no: 6,
      name: "error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "last_retry_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 8,
      name: "retries",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const StreamInfo_Status = /* @__PURE__ */ proto3.makeEnum(
  "livekit.StreamInfo.Status",
  [
    { no: 0, name: "ACTIVE" },
    { no: 1, name: "FINISHED" },
    { no: 2, name: "FAILED" }
  ]
);
const FileInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.FileInfo",
  () => [
    {
      no: 1,
      name: "filename",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "started_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 3,
      name: "ended_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 6,
      name: "duration",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 4,
      name: "size",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 5,
      name: "location",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const SegmentsInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SegmentsInfo",
  () => [
    {
      no: 1,
      name: "playlist_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "live_playlist_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "duration",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 3,
      name: "size",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 4,
      name: "playlist_location",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "live_playlist_location",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "segment_count",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 6,
      name: "started_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 7,
      name: "ended_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    }
  ]
);
const ImagesInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ImagesInfo",
  () => [
    {
      no: 4,
      name: "filename_prefix",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 1,
      name: "image_count",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 2,
      name: "started_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 3,
      name: "ended_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    }
  ]
);
const AutoParticipantEgress = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AutoParticipantEgress",
  () => [
    { no: 1, name: "preset", kind: "enum", T: proto3.getEnumType(EncodingOptionsPreset), oneof: "options" },
    { no: 2, name: "advanced", kind: "message", T: EncodingOptions, oneof: "options" },
    { no: 3, name: "file_outputs", kind: "message", T: EncodedFileOutput, repeated: true },
    { no: 4, name: "segment_outputs", kind: "message", T: SegmentedFileOutput, repeated: true }
  ]
);
const AutoTrackEgress = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AutoTrackEgress",
  () => [
    {
      no: 1,
      name: "filepath",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "disable_manifest",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 2, name: "s3", kind: "message", T: S3Upload, oneof: "output" },
    { no: 3, name: "gcp", kind: "message", T: GCPUpload, oneof: "output" },
    { no: 4, name: "azure", kind: "message", T: AzureBlobUpload, oneof: "output" },
    { no: 6, name: "aliOSS", kind: "message", T: AliOSSUpload, oneof: "output" }
  ]
);
const ExportReplayRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ExportReplayRequest",
  () => [
    {
      no: 1,
      name: "replay_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "start_offset_ms",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 3,
      name: "end_offset_ms",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 4, name: "template", kind: "message", T: TemplateSource, oneof: "source" },
    { no: 5, name: "web", kind: "message", T: WebSource, oneof: "source" },
    { no: 6, name: "media", kind: "message", T: MediaSource, oneof: "source" },
    { no: 7, name: "preset", kind: "enum", T: proto3.getEnumType(EncodingOptionsPreset), oneof: "encoding" },
    { no: 8, name: "advanced", kind: "message", T: EncodingOptions, oneof: "encoding" },
    { no: 9, name: "outputs", kind: "message", T: Output, repeated: true },
    { no: 10, name: "storage", kind: "message", T: StorageConfig },
    { no: 11, name: "webhooks", kind: "message", T: WebhookConfig, repeated: true }
  ]
);
const RoomCompositeEgressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RoomCompositeEgressRequest",
  () => [
    {
      no: 1,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "layout",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "audio_only",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 15, name: "audio_mixing", kind: "enum", T: proto3.getEnumType(AudioMixing) },
    {
      no: 4,
      name: "video_only",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 5,
      name: "custom_base_url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 6, name: "file", kind: "message", T: EncodedFileOutput, oneof: "output" },
    { no: 7, name: "stream", kind: "message", T: StreamOutput, oneof: "output" },
    { no: 10, name: "segments", kind: "message", T: SegmentedFileOutput, oneof: "output" },
    { no: 8, name: "preset", kind: "enum", T: proto3.getEnumType(EncodingOptionsPreset), oneof: "options" },
    { no: 9, name: "advanced", kind: "message", T: EncodingOptions, oneof: "options" },
    { no: 11, name: "file_outputs", kind: "message", T: EncodedFileOutput, repeated: true },
    { no: 12, name: "stream_outputs", kind: "message", T: StreamOutput, repeated: true },
    { no: 13, name: "segment_outputs", kind: "message", T: SegmentedFileOutput, repeated: true },
    { no: 14, name: "image_outputs", kind: "message", T: ImageOutput, repeated: true },
    { no: 16, name: "webhooks", kind: "message", T: WebhookConfig, repeated: true }
  ]
);
const WebEgressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.WebEgressRequest",
  () => [
    {
      no: 1,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "audio_only",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 3,
      name: "video_only",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 12,
      name: "await_start_signal",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 4, name: "file", kind: "message", T: EncodedFileOutput, oneof: "output" },
    { no: 5, name: "stream", kind: "message", T: StreamOutput, oneof: "output" },
    { no: 6, name: "segments", kind: "message", T: SegmentedFileOutput, oneof: "output" },
    { no: 7, name: "preset", kind: "enum", T: proto3.getEnumType(EncodingOptionsPreset), oneof: "options" },
    { no: 8, name: "advanced", kind: "message", T: EncodingOptions, oneof: "options" },
    { no: 9, name: "file_outputs", kind: "message", T: EncodedFileOutput, repeated: true },
    { no: 10, name: "stream_outputs", kind: "message", T: StreamOutput, repeated: true },
    { no: 11, name: "segment_outputs", kind: "message", T: SegmentedFileOutput, repeated: true },
    { no: 13, name: "image_outputs", kind: "message", T: ImageOutput, repeated: true },
    { no: 14, name: "webhooks", kind: "message", T: WebhookConfig, repeated: true }
  ]
);
const ParticipantEgressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ParticipantEgressRequest",
  () => [
    {
      no: 1,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "screen_share",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 4, name: "preset", kind: "enum", T: proto3.getEnumType(EncodingOptionsPreset), oneof: "options" },
    { no: 5, name: "advanced", kind: "message", T: EncodingOptions, oneof: "options" },
    { no: 6, name: "file_outputs", kind: "message", T: EncodedFileOutput, repeated: true },
    { no: 7, name: "stream_outputs", kind: "message", T: StreamOutput, repeated: true },
    { no: 8, name: "segment_outputs", kind: "message", T: SegmentedFileOutput, repeated: true },
    { no: 9, name: "image_outputs", kind: "message", T: ImageOutput, repeated: true },
    { no: 10, name: "webhooks", kind: "message", T: WebhookConfig, repeated: true }
  ]
);
const TrackCompositeEgressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TrackCompositeEgressRequest",
  () => [
    {
      no: 1,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "audio_track_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "video_track_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "file", kind: "message", T: EncodedFileOutput, oneof: "output" },
    { no: 5, name: "stream", kind: "message", T: StreamOutput, oneof: "output" },
    { no: 8, name: "segments", kind: "message", T: SegmentedFileOutput, oneof: "output" },
    { no: 6, name: "preset", kind: "enum", T: proto3.getEnumType(EncodingOptionsPreset), oneof: "options" },
    { no: 7, name: "advanced", kind: "message", T: EncodingOptions, oneof: "options" },
    { no: 11, name: "file_outputs", kind: "message", T: EncodedFileOutput, repeated: true },
    { no: 12, name: "stream_outputs", kind: "message", T: StreamOutput, repeated: true },
    { no: 13, name: "segment_outputs", kind: "message", T: SegmentedFileOutput, repeated: true },
    { no: 14, name: "image_outputs", kind: "message", T: ImageOutput, repeated: true },
    { no: 15, name: "webhooks", kind: "message", T: WebhookConfig, repeated: true }
  ]
);
const TrackEgressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TrackEgressRequest",
  () => [
    {
      no: 1,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "track_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "file", kind: "message", T: DirectFileOutput, oneof: "output" },
    { no: 4, name: "websocket_url", kind: "scalar", T: 9, oneof: "output" },
    { no: 5, name: "webhooks", kind: "message", T: WebhookConfig, repeated: true }
  ]
);
const DirectFileOutput = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DirectFileOutput",
  () => [
    {
      no: 1,
      name: "filepath",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "disable_manifest",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 2, name: "s3", kind: "message", T: S3Upload, oneof: "output" },
    { no: 3, name: "gcp", kind: "message", T: GCPUpload, oneof: "output" },
    { no: 4, name: "azure", kind: "message", T: AzureBlobUpload, oneof: "output" },
    { no: 6, name: "aliOSS", kind: "message", T: AliOSSUpload, oneof: "output" }
  ]
);
const EncodedFileOutput = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.EncodedFileOutput",
  () => [
    { no: 1, name: "file_type", kind: "enum", T: proto3.getEnumType(EncodedFileType) },
    {
      no: 2,
      name: "filepath",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "disable_manifest",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 3, name: "s3", kind: "message", T: S3Upload, oneof: "output" },
    { no: 4, name: "gcp", kind: "message", T: GCPUpload, oneof: "output" },
    { no: 5, name: "azure", kind: "message", T: AzureBlobUpload, oneof: "output" },
    { no: 7, name: "aliOSS", kind: "message", T: AliOSSUpload, oneof: "output" }
  ]
);
const UpdateLayoutRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateLayoutRequest",
  () => [
    {
      no: 1,
      name: "egress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "layout",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const UpdateStreamRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateStreamRequest",
  () => [
    {
      no: 1,
      name: "egress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "add_output_urls", kind: "scalar", T: 9, repeated: true },
    { no: 3, name: "remove_output_urls", kind: "scalar", T: 9, repeated: true }
  ]
);
const StreamInfoList = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.StreamInfoList",
  () => [
    { no: 1, name: "info", kind: "message", T: StreamInfo, repeated: true }
  ]
);

const IngressInput = /* @__PURE__ */ proto3.makeEnum(
  "livekit.IngressInput",
  [
    { no: 0, name: "RTMP_INPUT" },
    { no: 1, name: "WHIP_INPUT" },
    { no: 2, name: "URL_INPUT" }
  ]
);
const IngressAudioEncodingPreset = /* @__PURE__ */ proto3.makeEnum(
  "livekit.IngressAudioEncodingPreset",
  [
    { no: 0, name: "OPUS_STEREO_96KBPS" },
    { no: 1, name: "OPUS_MONO_64KBS" }
  ]
);
const IngressVideoEncodingPreset = /* @__PURE__ */ proto3.makeEnum(
  "livekit.IngressVideoEncodingPreset",
  [
    { no: 0, name: "H264_720P_30FPS_3_LAYERS" },
    { no: 1, name: "H264_1080P_30FPS_3_LAYERS" },
    { no: 2, name: "H264_540P_25FPS_2_LAYERS" },
    { no: 3, name: "H264_720P_30FPS_1_LAYER" },
    { no: 4, name: "H264_1080P_30FPS_1_LAYER" },
    { no: 5, name: "H264_720P_30FPS_3_LAYERS_HIGH_MOTION" },
    { no: 6, name: "H264_1080P_30FPS_3_LAYERS_HIGH_MOTION" },
    { no: 7, name: "H264_540P_25FPS_2_LAYERS_HIGH_MOTION" },
    { no: 8, name: "H264_720P_30FPS_1_LAYER_HIGH_MOTION" },
    { no: 9, name: "H264_1080P_30FPS_1_LAYER_HIGH_MOTION" }
  ]
);
const CreateIngressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.CreateIngressRequest",
  () => [
    { no: 1, name: "input_type", kind: "enum", T: proto3.getEnumType(IngressInput) },
    {
      no: 9,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "participant_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 10,
      name: "participant_metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "bypass_transcoding",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 11, name: "enable_transcoding", kind: "scalar", T: 8, opt: true },
    { no: 6, name: "audio", kind: "message", T: IngressAudioOptions },
    { no: 7, name: "video", kind: "message", T: IngressVideoOptions },
    { no: 12, name: "enabled", kind: "scalar", T: 8, opt: true }
  ]
);
const IngressAudioOptions = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.IngressAudioOptions",
  () => [
    {
      no: 1,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "source", kind: "enum", T: proto3.getEnumType(TrackSource) },
    { no: 3, name: "preset", kind: "enum", T: proto3.getEnumType(IngressAudioEncodingPreset), oneof: "encoding_options" },
    { no: 4, name: "options", kind: "message", T: IngressAudioEncodingOptions, oneof: "encoding_options" }
  ]
);
const IngressVideoOptions = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.IngressVideoOptions",
  () => [
    {
      no: 1,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "source", kind: "enum", T: proto3.getEnumType(TrackSource) },
    { no: 3, name: "preset", kind: "enum", T: proto3.getEnumType(IngressVideoEncodingPreset), oneof: "encoding_options" },
    { no: 4, name: "options", kind: "message", T: IngressVideoEncodingOptions, oneof: "encoding_options" }
  ]
);
const IngressAudioEncodingOptions = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.IngressAudioEncodingOptions",
  () => [
    { no: 1, name: "audio_codec", kind: "enum", T: proto3.getEnumType(AudioCodec) },
    {
      no: 2,
      name: "bitrate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "disable_dtx",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 4,
      name: "channels",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const IngressVideoEncodingOptions = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.IngressVideoEncodingOptions",
  () => [
    { no: 1, name: "video_codec", kind: "enum", T: proto3.getEnumType(VideoCodec) },
    {
      no: 2,
      name: "frame_rate",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    },
    { no: 3, name: "layers", kind: "message", T: VideoLayer, repeated: true }
  ]
);
const IngressInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.IngressInfo",
  () => [
    {
      no: 1,
      name: "ingress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "stream_key",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "input_type", kind: "enum", T: proto3.getEnumType(IngressInput) },
    {
      no: 13,
      name: "bypass_transcoding",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 15, name: "enable_transcoding", kind: "scalar", T: 8, opt: true },
    { no: 6, name: "audio", kind: "message", T: IngressAudioOptions },
    { no: 7, name: "video", kind: "message", T: IngressVideoOptions },
    {
      no: 8,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 10,
      name: "participant_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 14,
      name: "participant_metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 11,
      name: "reusable",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 12, name: "state", kind: "message", T: IngressState },
    { no: 16, name: "enabled", kind: "scalar", T: 8, opt: true }
  ]
);
const IngressState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.IngressState",
  () => [
    { no: 1, name: "status", kind: "enum", T: proto3.getEnumType(IngressState_Status) },
    {
      no: 2,
      name: "error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "video", kind: "message", T: InputVideoState },
    { no: 4, name: "audio", kind: "message", T: InputAudioState },
    {
      no: 5,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "started_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 8,
      name: "ended_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 10,
      name: "updated_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 9,
      name: "resource_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 6, name: "tracks", kind: "message", T: TrackInfo, repeated: true }
  ]
);
const IngressState_Status = /* @__PURE__ */ proto3.makeEnum(
  "livekit.IngressState.Status",
  [
    { no: 0, name: "ENDPOINT_INACTIVE" },
    { no: 1, name: "ENDPOINT_BUFFERING" },
    { no: 2, name: "ENDPOINT_PUBLISHING" },
    { no: 3, name: "ENDPOINT_ERROR" },
    { no: 4, name: "ENDPOINT_COMPLETE" }
  ]
);
const InputVideoState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.InputVideoState",
  () => [
    {
      no: 1,
      name: "mime_type",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "average_bitrate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "width",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "height",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 5,
      name: "framerate",
      kind: "scalar",
      T: 1
      /* ScalarType.DOUBLE */
    }
  ]
);
const InputAudioState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.InputAudioState",
  () => [
    {
      no: 1,
      name: "mime_type",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "average_bitrate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "channels",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "sample_rate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const UpdateIngressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateIngressRequest",
  () => [
    {
      no: 1,
      name: "ingress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "participant_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "participant_metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 8, name: "bypass_transcoding", kind: "scalar", T: 8, opt: true },
    { no: 10, name: "enable_transcoding", kind: "scalar", T: 8, opt: true },
    { no: 6, name: "audio", kind: "message", T: IngressAudioOptions },
    { no: 7, name: "video", kind: "message", T: IngressVideoOptions },
    { no: 11, name: "enabled", kind: "scalar", T: 8, opt: true }
  ]
);
const ListIngressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListIngressRequest",
  () => [
    { no: 3, name: "page_token", kind: "message", T: TokenPagination },
    {
      no: 1,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "ingress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ListIngressResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListIngressResponse",
  () => [
    { no: 2, name: "next_page_token", kind: "message", T: TokenPagination },
    { no: 1, name: "items", kind: "message", T: IngressInfo, repeated: true }
  ]
);
const DeleteIngressRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DeleteIngressRequest",
  () => [
    {
      no: 1,
      name: "ingress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);

const CreateRoomRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.CreateRoomRequest",
  () => [
    {
      no: 1,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 12,
      name: "room_preset",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "empty_timeout",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 10,
      name: "departure_timeout",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "max_participants",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "node_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 15, name: "tags", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 6, name: "egress", kind: "message", T: RoomEgress },
    {
      no: 7,
      name: "min_playout_delay",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 8,
      name: "max_playout_delay",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 9,
      name: "sync_streams",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 13,
      name: "replay_enabled",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 14, name: "agents", kind: "message", T: RoomAgentDispatch, repeated: true }
  ]
);
const RoomEgress = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RoomEgress",
  () => [
    { no: 1, name: "room", kind: "message", T: RoomCompositeEgressRequest },
    { no: 3, name: "participant", kind: "message", T: AutoParticipantEgress },
    { no: 2, name: "tracks", kind: "message", T: AutoTrackEgress }
  ]
);
const RoomAgent = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RoomAgent",
  () => [
    { no: 1, name: "dispatches", kind: "message", T: RoomAgentDispatch, repeated: true }
  ]
);
const ListRoomsRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListRoomsRequest",
  () => [
    { no: 1, name: "names", kind: "scalar", T: 9, repeated: true }
  ]
);
const ListRoomsResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListRoomsResponse",
  () => [
    { no: 1, name: "rooms", kind: "message", T: Room, repeated: true }
  ]
);
const DeleteRoomRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DeleteRoomRequest",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const DeleteRoomResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DeleteRoomResponse",
  []
);
const ListParticipantsRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListParticipantsRequest",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ListParticipantsResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListParticipantsResponse",
  () => [
    { no: 1, name: "participants", kind: "message", T: ParticipantInfo, repeated: true }
  ]
);
const RoomParticipantIdentity = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RoomParticipantIdentity",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "revoke_token_ts",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    }
  ]
);
const RemoveParticipantResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RemoveParticipantResponse",
  []
);
const MuteRoomTrackRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MuteRoomTrackRequest",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "muted",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const MuteRoomTrackResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MuteRoomTrackResponse",
  () => [
    { no: 1, name: "track", kind: "message", T: TrackInfo }
  ]
);
const UpdateParticipantRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateParticipantRequest",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "permission", kind: "message", T: ParticipantPermission },
    {
      no: 5,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 6, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } }
  ]
);
const UpdateSubscriptionsRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateSubscriptionsRequest",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "track_sids", kind: "scalar", T: 9, repeated: true },
    {
      no: 4,
      name: "subscribe",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 5, name: "participant_tracks", kind: "message", T: ParticipantTracks, repeated: true }
  ]
);
const UpdateSubscriptionsResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateSubscriptionsResponse",
  []
);
const SendDataRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SendDataRequest",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "data",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    },
    { no: 3, name: "kind", kind: "enum", T: proto3.getEnumType(DataPacket_Kind) },
    { no: 4, name: "destination_sids", kind: "scalar", T: 9, repeated: true },
    { no: 6, name: "destination_identities", kind: "scalar", T: 9, repeated: true },
    { no: 5, name: "topic", kind: "scalar", T: 9, opt: true },
    {
      no: 7,
      name: "nonce",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    }
  ]
);
const SendDataResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SendDataResponse",
  []
);
const UpdateRoomMetadataRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateRoomMetadataRequest",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const RoomConfiguration = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RoomConfiguration",
  () => [
    {
      no: 1,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "empty_timeout",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "departure_timeout",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 4,
      name: "max_participants",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 11,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "egress", kind: "message", T: RoomEgress },
    {
      no: 7,
      name: "min_playout_delay",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 8,
      name: "max_playout_delay",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 9,
      name: "sync_streams",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 10, name: "agents", kind: "message", T: RoomAgentDispatch, repeated: true },
    { no: 12, name: "tags", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } }
  ]
);
const ForwardParticipantRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ForwardParticipantRequest",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "destination_room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ForwardParticipantResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ForwardParticipantResponse",
  []
);
const MoveParticipantRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MoveParticipantRequest",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "destination_room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const MoveParticipantResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MoveParticipantResponse",
  []
);
const PerformRpcRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.PerformRpcRequest",
  () => [
    {
      no: 1,
      name: "room",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "destination_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "method",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "payload",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "response_timeout_ms",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const PerformRpcResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.PerformRpcResponse",
  () => [
    {
      no: 1,
      name: "payload",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);

const SIPStatusCode = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SIPStatusCode",
  [
    { no: 0, name: "SIP_STATUS_UNKNOWN" },
    { no: 100, name: "SIP_STATUS_TRYING" },
    { no: 180, name: "SIP_STATUS_RINGING" },
    { no: 181, name: "SIP_STATUS_CALL_IS_FORWARDED" },
    { no: 182, name: "SIP_STATUS_QUEUED" },
    { no: 183, name: "SIP_STATUS_SESSION_PROGRESS" },
    { no: 199, name: "SIP_STATUS_EARLY_DIALOG_TERMINATED" },
    { no: 200, name: "SIP_STATUS_OK" },
    { no: 202, name: "SIP_STATUS_ACCEPTED" },
    { no: 204, name: "SIP_STATUS_NO_NOTIFICATION" },
    { no: 300, name: "SIP_STATUS_MULTIPLE_CHOICES" },
    { no: 301, name: "SIP_STATUS_MOVED_PERMANENTLY" },
    { no: 302, name: "SIP_STATUS_MOVED_TEMPORARILY" },
    { no: 305, name: "SIP_STATUS_USE_PROXY" },
    { no: 380, name: "SIP_STATUS_ALTERNATIVE_SERVICE" },
    { no: 400, name: "SIP_STATUS_BAD_REQUEST" },
    { no: 401, name: "SIP_STATUS_UNAUTHORIZED" },
    { no: 402, name: "SIP_STATUS_PAYMENT_REQUIRED" },
    { no: 403, name: "SIP_STATUS_FORBIDDEN" },
    { no: 404, name: "SIP_STATUS_NOTFOUND" },
    { no: 405, name: "SIP_STATUS_METHOD_NOT_ALLOWED" },
    { no: 406, name: "SIP_STATUS_NOT_ACCEPTABLE" },
    { no: 407, name: "SIP_STATUS_PROXY_AUTH_REQUIRED" },
    { no: 408, name: "SIP_STATUS_REQUEST_TIMEOUT" },
    { no: 409, name: "SIP_STATUS_CONFLICT" },
    { no: 410, name: "SIP_STATUS_GONE" },
    { no: 411, name: "SIP_STATUS_LENGTH_REQUIRED" },
    { no: 412, name: "SIP_STATUS_CONDITIONAL_REQUEST_FAILED" },
    { no: 413, name: "SIP_STATUS_REQUEST_ENTITY_TOO_LARGE" },
    { no: 414, name: "SIP_STATUS_REQUEST_URI_TOO_LONG" },
    { no: 415, name: "SIP_STATUS_UNSUPPORTED_MEDIA_TYPE" },
    { no: 416, name: "SIP_STATUS_REQUESTED_RANGE_NOT_SATISFIABLE" },
    { no: 417, name: "SIP_STATUS_UNKNOWN_RESOURCE_PRIORITY" },
    { no: 420, name: "SIP_STATUS_BAD_EXTENSION" },
    { no: 421, name: "SIP_STATUS_EXTENSION_REQUIRED" },
    { no: 422, name: "SIP_STATUS_SESSION_INTERVAL_TOO_SMALL" },
    { no: 423, name: "SIP_STATUS_INTERVAL_TOO_BRIEF" },
    { no: 424, name: "SIP_STATUS_BAD_LOCATION_INFORMATION" },
    { no: 425, name: "SIP_STATUS_BAD_ALERT_MESSAGE" },
    { no: 428, name: "SIP_STATUS_USE_IDENTITY_HEADER" },
    { no: 429, name: "SIP_STATUS_PROVIDE_REFERRER_IDENTITY" },
    { no: 430, name: "SIP_STATUS_FLOW_FAILED" },
    { no: 433, name: "SIP_STATUS_ANONYMITY_DISALLOWED" },
    { no: 436, name: "SIP_STATUS_BAD_IDENTITY_INFO" },
    { no: 437, name: "SIP_STATUS_UNSUPPORTED_CERTIFICATE" },
    { no: 438, name: "SIP_STATUS_INVALID_IDENTITY_HEADER" },
    { no: 439, name: "SIP_STATUS_FIRST_HOP_LACKS_OUTBOUND_SUPPORT" },
    { no: 440, name: "SIP_STATUS_MAX_BREADTH_EXCEEDED" },
    { no: 469, name: "SIP_STATUS_BAD_INFO_PACKAGE" },
    { no: 470, name: "SIP_STATUS_CONSENT_NEEDED" },
    { no: 480, name: "SIP_STATUS_TEMPORARILY_UNAVAILABLE" },
    { no: 481, name: "SIP_STATUS_CALL_TRANSACTION_DOES_NOT_EXISTS" },
    { no: 482, name: "SIP_STATUS_LOOP_DETECTED" },
    { no: 483, name: "SIP_STATUS_TOO_MANY_HOPS" },
    { no: 484, name: "SIP_STATUS_ADDRESS_INCOMPLETE" },
    { no: 485, name: "SIP_STATUS_AMBIGUOUS" },
    { no: 486, name: "SIP_STATUS_BUSY_HERE" },
    { no: 487, name: "SIP_STATUS_REQUEST_TERMINATED" },
    { no: 488, name: "SIP_STATUS_NOT_ACCEPTABLE_HERE" },
    { no: 489, name: "SIP_STATUS_BAD_EVENT" },
    { no: 491, name: "SIP_STATUS_REQUEST_PENDING" },
    { no: 493, name: "SIP_STATUS_UNDECIPHERABLE" },
    { no: 494, name: "SIP_STATUS_SECURITY_AGREEMENT_REQUIRED" },
    { no: 500, name: "SIP_STATUS_INTERNAL_SERVER_ERROR" },
    { no: 501, name: "SIP_STATUS_NOT_IMPLEMENTED" },
    { no: 502, name: "SIP_STATUS_BAD_GATEWAY" },
    { no: 503, name: "SIP_STATUS_SERVICE_UNAVAILABLE" },
    { no: 504, name: "SIP_STATUS_GATEWAY_TIMEOUT" },
    { no: 505, name: "SIP_STATUS_VERSION_NOT_SUPPORTED" },
    { no: 513, name: "SIP_STATUS_MESSAGE_TOO_LARGE" },
    { no: 600, name: "SIP_STATUS_GLOBAL_BUSY_EVERYWHERE" },
    { no: 603, name: "SIP_STATUS_GLOBAL_DECLINE" },
    { no: 604, name: "SIP_STATUS_GLOBAL_DOES_NOT_EXIST_ANYWHERE" },
    { no: 606, name: "SIP_STATUS_GLOBAL_NOT_ACCEPTABLE" },
    { no: 607, name: "SIP_STATUS_GLOBAL_UNWANTED" },
    { no: 608, name: "SIP_STATUS_GLOBAL_REJECTED" }
  ]
);
const SIPTransport = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SIPTransport",
  [
    { no: 0, name: "SIP_TRANSPORT_AUTO" },
    { no: 1, name: "SIP_TRANSPORT_UDP" },
    { no: 2, name: "SIP_TRANSPORT_TCP" },
    { no: 3, name: "SIP_TRANSPORT_TLS" }
  ]
);
const SIPHeaderOptions = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SIPHeaderOptions",
  [
    { no: 0, name: "SIP_NO_HEADERS" },
    { no: 1, name: "SIP_X_HEADERS" },
    { no: 2, name: "SIP_ALL_HEADERS" }
  ]
);
const SIPMediaEncryption = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SIPMediaEncryption",
  [
    { no: 0, name: "SIP_MEDIA_ENCRYPT_DISABLE" },
    { no: 1, name: "SIP_MEDIA_ENCRYPT_ALLOW" },
    { no: 2, name: "SIP_MEDIA_ENCRYPT_REQUIRE" }
  ]
);
const ProviderType = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ProviderType",
  [
    { no: 0, name: "PROVIDER_TYPE_UNKNOWN", localName: "UNKNOWN" },
    { no: 1, name: "PROVIDER_TYPE_INTERNAL", localName: "INTERNAL" },
    { no: 2, name: "PROVIDER_TYPE_EXTERNAL", localName: "EXTERNAL" }
  ]
);
const SIPCallStatus = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SIPCallStatus",
  [
    { no: 0, name: "SCS_CALL_INCOMING" },
    { no: 1, name: "SCS_PARTICIPANT_JOINED" },
    { no: 2, name: "SCS_ACTIVE" },
    { no: 3, name: "SCS_DISCONNECTED" },
    { no: 4, name: "SCS_ERROR" }
  ]
);
const SIPTransferStatus = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SIPTransferStatus",
  [
    { no: 0, name: "STS_TRANSFER_ONGOING" },
    { no: 1, name: "STS_TRANSFER_FAILED" },
    { no: 2, name: "STS_TRANSFER_SUCCESSFUL" }
  ]
);
const SIPTransferReason = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SIPTransferReason",
  [
    { no: 0, name: "STR_UNSPECIFIED" },
    { no: 1, name: "STR_COMPLETED" },
    { no: 2, name: "STR_CALL_ENDED" },
    { no: 3, name: "STR_REJECTED" },
    { no: 4, name: "STR_RINGING_TIMEOUT" },
    { no: 5, name: "STR_SUBSCRIPTION_TERMINATED" },
    { no: 6, name: "STR_CANCELED" }
  ]
);
const SIPFeature = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SIPFeature",
  [
    { no: 0, name: "NONE" },
    { no: 1, name: "KRISP_ENABLED" }
  ]
);
const SIPCallDirection = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SIPCallDirection",
  [
    { no: 0, name: "SCD_UNKNOWN" },
    { no: 1, name: "SCD_INBOUND" },
    { no: 2, name: "SCD_OUTBOUND" }
  ]
);
const SIPStatus = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPStatus",
  () => [
    { no: 1, name: "code", kind: "enum", T: proto3.getEnumType(SIPStatusCode) },
    {
      no: 2,
      name: "status",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const CreateSIPTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.CreateSIPTrunkRequest",
  () => [
    { no: 1, name: "inbound_addresses", kind: "scalar", T: 9, repeated: true },
    {
      no: 2,
      name: "outbound_address",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "outbound_number",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "inbound_numbers_regex", kind: "scalar", T: 9, repeated: true },
    { no: 9, name: "inbound_numbers", kind: "scalar", T: 9, repeated: true },
    {
      no: 5,
      name: "inbound_username",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "inbound_password",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "outbound_username",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "outbound_password",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 10,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 11,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const SIPCodec = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPCodec",
  () => [
    {
      no: 1,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "rate",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const SIPMediaConfig = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPMediaConfig",
  () => [
    {
      no: 1,
      name: "only_listed_codecs",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 2, name: "codecs", kind: "message", T: SIPCodec, repeated: true },
    { no: 3, name: "encryption", kind: "enum", T: proto3.getEnumType(SIPMediaEncryption), opt: true },
    { no: 4, name: "media_timeout", kind: "message", T: Duration, opt: true }
  ]
);
const ProviderInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ProviderInfo",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "type", kind: "enum", T: proto3.getEnumType(ProviderType) },
    {
      no: 4,
      name: "prevent_transfer",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const SIPTrunkInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPTrunkInfo",
  () => [
    {
      no: 1,
      name: "sip_trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 14, name: "kind", kind: "enum", T: proto3.getEnumType(SIPTrunkInfo_TrunkKind) },
    { no: 2, name: "inbound_addresses", kind: "scalar", T: 9, repeated: true },
    {
      no: 3,
      name: "outbound_address",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "outbound_number",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 13, name: "transport", kind: "enum", T: proto3.getEnumType(SIPTransport) },
    { no: 5, name: "inbound_numbers_regex", kind: "scalar", T: 9, repeated: true },
    { no: 10, name: "inbound_numbers", kind: "scalar", T: 9, repeated: true },
    {
      no: 6,
      name: "inbound_username",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "inbound_password",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "outbound_username",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "outbound_password",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 11,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 12,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const SIPTrunkInfo_TrunkKind = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SIPTrunkInfo.TrunkKind",
  [
    { no: 0, name: "TRUNK_LEGACY" },
    { no: 1, name: "TRUNK_INBOUND" },
    { no: 2, name: "TRUNK_OUTBOUND" }
  ]
);
const CreateSIPInboundTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.CreateSIPInboundTrunkRequest",
  () => [
    { no: 1, name: "trunk", kind: "message", T: SIPInboundTrunkInfo }
  ]
);
const UpdateSIPInboundTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateSIPInboundTrunkRequest",
  () => [
    {
      no: 1,
      name: "sip_trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "replace", kind: "message", T: SIPInboundTrunkInfo, oneof: "action" },
    { no: 3, name: "update", kind: "message", T: SIPInboundTrunkUpdate, oneof: "action" }
  ]
);
const SIPInboundTrunkInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPInboundTrunkInfo",
  () => [
    {
      no: 1,
      name: "sip_trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "numbers", kind: "scalar", T: 9, repeated: true },
    { no: 5, name: "allowed_addresses", kind: "scalar", T: 9, repeated: true },
    { no: 6, name: "allowed_numbers", kind: "scalar", T: 9, repeated: true },
    {
      no: 7,
      name: "auth_username",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "auth_password",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 19,
      name: "auth_realm",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 9, name: "headers", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 10, name: "headers_to_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 14, name: "attributes_to_headers", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 15, name: "include_headers", kind: "enum", T: proto3.getEnumType(SIPHeaderOptions) },
    { no: 11, name: "ringing_timeout", kind: "message", T: Duration },
    { no: 12, name: "max_call_duration", kind: "message", T: Duration },
    {
      no: 13,
      name: "krisp_enabled",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 16, name: "media_encryption", kind: "enum", T: proto3.getEnumType(SIPMediaEncryption) },
    { no: 20, name: "media", kind: "message", T: SIPMediaConfig },
    { no: 17, name: "created_at", kind: "message", T: Timestamp },
    { no: 18, name: "updated_at", kind: "message", T: Timestamp }
  ]
);
const SIPInboundTrunkUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPInboundTrunkUpdate",
  () => [
    { no: 1, name: "numbers", kind: "message", T: ListUpdate },
    { no: 2, name: "allowed_addresses", kind: "message", T: ListUpdate },
    { no: 3, name: "allowed_numbers", kind: "message", T: ListUpdate },
    { no: 4, name: "auth_username", kind: "scalar", T: 9, opt: true },
    { no: 5, name: "auth_password", kind: "scalar", T: 9, opt: true },
    { no: 9, name: "auth_realm", kind: "scalar", T: 9, opt: true },
    { no: 6, name: "name", kind: "scalar", T: 9, opt: true },
    { no: 7, name: "metadata", kind: "scalar", T: 9, opt: true },
    { no: 8, name: "media_encryption", kind: "enum", T: proto3.getEnumType(SIPMediaEncryption), opt: true },
    { no: 10, name: "media", kind: "message", T: SIPMediaConfig }
  ]
);
const CreateSIPOutboundTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.CreateSIPOutboundTrunkRequest",
  () => [
    { no: 1, name: "trunk", kind: "message", T: SIPOutboundTrunkInfo }
  ]
);
const UpdateSIPOutboundTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateSIPOutboundTrunkRequest",
  () => [
    {
      no: 1,
      name: "sip_trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "replace", kind: "message", T: SIPOutboundTrunkInfo, oneof: "action" },
    { no: 3, name: "update", kind: "message", T: SIPOutboundTrunkUpdate, oneof: "action" }
  ]
);
const SIPOutboundTrunkInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPOutboundTrunkInfo",
  () => [
    {
      no: 1,
      name: "sip_trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "address",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 14,
      name: "destination_country",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "transport", kind: "enum", T: proto3.getEnumType(SIPTransport) },
    { no: 6, name: "numbers", kind: "scalar", T: 9, repeated: true },
    {
      no: 7,
      name: "auth_username",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "auth_password",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 9, name: "headers", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 10, name: "headers_to_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 11, name: "attributes_to_headers", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 12, name: "include_headers", kind: "enum", T: proto3.getEnumType(SIPHeaderOptions) },
    { no: 13, name: "media_encryption", kind: "enum", T: proto3.getEnumType(SIPMediaEncryption) },
    { no: 18, name: "media", kind: "message", T: SIPMediaConfig },
    {
      no: 15,
      name: "from_host",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 16, name: "created_at", kind: "message", T: Timestamp },
    { no: 17, name: "updated_at", kind: "message", T: Timestamp }
  ]
);
const SIPOutboundTrunkUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPOutboundTrunkUpdate",
  () => [
    { no: 1, name: "address", kind: "scalar", T: 9, opt: true },
    { no: 2, name: "transport", kind: "enum", T: proto3.getEnumType(SIPTransport), opt: true },
    { no: 9, name: "destination_country", kind: "scalar", T: 9, opt: true },
    { no: 3, name: "numbers", kind: "message", T: ListUpdate },
    { no: 4, name: "auth_username", kind: "scalar", T: 9, opt: true },
    { no: 5, name: "auth_password", kind: "scalar", T: 9, opt: true },
    { no: 6, name: "name", kind: "scalar", T: 9, opt: true },
    { no: 7, name: "metadata", kind: "scalar", T: 9, opt: true },
    { no: 8, name: "media_encryption", kind: "enum", T: proto3.getEnumType(SIPMediaEncryption), opt: true },
    { no: 11, name: "media", kind: "message", T: SIPMediaConfig },
    { no: 10, name: "from_host", kind: "scalar", T: 9, opt: true }
  ]
);
const GetSIPInboundTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.GetSIPInboundTrunkRequest",
  () => [
    {
      no: 1,
      name: "sip_trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const GetSIPInboundTrunkResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.GetSIPInboundTrunkResponse",
  () => [
    { no: 1, name: "trunk", kind: "message", T: SIPInboundTrunkInfo }
  ]
);
const GetSIPOutboundTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.GetSIPOutboundTrunkRequest",
  () => [
    {
      no: 1,
      name: "sip_trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const GetSIPOutboundTrunkResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.GetSIPOutboundTrunkResponse",
  () => [
    { no: 1, name: "trunk", kind: "message", T: SIPOutboundTrunkInfo }
  ]
);
const ListSIPTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListSIPTrunkRequest",
  () => [
    { no: 1, name: "page", kind: "message", T: Pagination }
  ]
);
const ListSIPTrunkResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListSIPTrunkResponse",
  () => [
    { no: 1, name: "items", kind: "message", T: SIPTrunkInfo, repeated: true }
  ]
);
const ListSIPInboundTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListSIPInboundTrunkRequest",
  () => [
    { no: 3, name: "page", kind: "message", T: Pagination },
    { no: 1, name: "trunk_ids", kind: "scalar", T: 9, repeated: true },
    { no: 2, name: "numbers", kind: "scalar", T: 9, repeated: true }
  ]
);
const ListSIPInboundTrunkResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListSIPInboundTrunkResponse",
  () => [
    { no: 1, name: "items", kind: "message", T: SIPInboundTrunkInfo, repeated: true }
  ]
);
const ListSIPOutboundTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListSIPOutboundTrunkRequest",
  () => [
    { no: 3, name: "page", kind: "message", T: Pagination },
    { no: 1, name: "trunk_ids", kind: "scalar", T: 9, repeated: true },
    { no: 2, name: "numbers", kind: "scalar", T: 9, repeated: true }
  ]
);
const ListSIPOutboundTrunkResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListSIPOutboundTrunkResponse",
  () => [
    { no: 1, name: "items", kind: "message", T: SIPOutboundTrunkInfo, repeated: true }
  ]
);
const DeleteSIPTrunkRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DeleteSIPTrunkRequest",
  () => [
    {
      no: 1,
      name: "sip_trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const SIPDispatchRuleDirect = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPDispatchRuleDirect",
  () => [
    {
      no: 1,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "pin",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const SIPDispatchRuleIndividual = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPDispatchRuleIndividual",
  () => [
    {
      no: 1,
      name: "room_prefix",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "pin",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "no_randomness",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const SIPDispatchRuleCallee = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPDispatchRuleCallee",
  () => [
    {
      no: 1,
      name: "room_prefix",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "pin",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "randomize",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const SIPDispatchRule = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPDispatchRule",
  () => [
    { no: 1, name: "dispatch_rule_direct", kind: "message", T: SIPDispatchRuleDirect, oneof: "rule" },
    { no: 2, name: "dispatch_rule_individual", kind: "message", T: SIPDispatchRuleIndividual, oneof: "rule" },
    { no: 3, name: "dispatch_rule_callee", kind: "message", T: SIPDispatchRuleCallee, oneof: "rule" }
  ]
);
const CreateSIPDispatchRuleRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.CreateSIPDispatchRuleRequest",
  () => [
    { no: 10, name: "dispatch_rule", kind: "message", T: SIPDispatchRuleInfo },
    { no: 1, name: "rule", kind: "message", T: SIPDispatchRule },
    { no: 2, name: "trunk_ids", kind: "scalar", T: 9, repeated: true },
    {
      no: 3,
      name: "hide_phone_number",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 6, name: "inbound_numbers", kind: "scalar", T: 9, repeated: true },
    {
      no: 4,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 7, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 8,
      name: "room_preset",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 9, name: "room_config", kind: "message", T: RoomConfiguration }
  ]
);
const UpdateSIPDispatchRuleRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateSIPDispatchRuleRequest",
  () => [
    {
      no: 1,
      name: "sip_dispatch_rule_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "replace", kind: "message", T: SIPDispatchRuleInfo, oneof: "action" },
    { no: 3, name: "update", kind: "message", T: SIPDispatchRuleUpdate, oneof: "action" }
  ]
);
const SIPDispatchRuleInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPDispatchRuleInfo",
  () => [
    {
      no: 1,
      name: "sip_dispatch_rule_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "rule", kind: "message", T: SIPDispatchRule },
    { no: 3, name: "trunk_ids", kind: "scalar", T: 9, repeated: true },
    {
      no: 4,
      name: "hide_phone_number",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 7, name: "inbound_numbers", kind: "scalar", T: 9, repeated: true },
    { no: 13, name: "numbers", kind: "scalar", T: 9, repeated: true },
    {
      no: 5,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 8, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 9,
      name: "room_preset",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 10, name: "room_config", kind: "message", T: RoomConfiguration },
    { no: 16, name: "media", kind: "message", T: SIPMediaConfig },
    {
      no: 11,
      name: "krisp_enabled",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 12, name: "media_encryption", kind: "enum", T: proto3.getEnumType(SIPMediaEncryption) },
    { no: 14, name: "created_at", kind: "message", T: Timestamp },
    { no: 15, name: "updated_at", kind: "message", T: Timestamp }
  ]
);
const SIPDispatchRuleUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPDispatchRuleUpdate",
  () => [
    { no: 1, name: "trunk_ids", kind: "message", T: ListUpdate },
    { no: 2, name: "rule", kind: "message", T: SIPDispatchRule },
    { no: 3, name: "name", kind: "scalar", T: 9, opt: true },
    { no: 4, name: "metadata", kind: "scalar", T: 9, opt: true },
    { no: 5, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 6, name: "media_encryption", kind: "enum", T: proto3.getEnumType(SIPMediaEncryption), opt: true },
    { no: 7, name: "media", kind: "message", T: SIPMediaConfig }
  ]
);
const ListSIPDispatchRuleRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListSIPDispatchRuleRequest",
  () => [
    { no: 3, name: "page", kind: "message", T: Pagination },
    { no: 1, name: "dispatch_rule_ids", kind: "scalar", T: 9, repeated: true },
    { no: 2, name: "trunk_ids", kind: "scalar", T: 9, repeated: true }
  ]
);
const ListSIPDispatchRuleResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ListSIPDispatchRuleResponse",
  () => [
    { no: 1, name: "items", kind: "message", T: SIPDispatchRuleInfo, repeated: true }
  ]
);
const DeleteSIPDispatchRuleRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DeleteSIPDispatchRuleRequest",
  () => [
    {
      no: 1,
      name: "sip_dispatch_rule_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const SIPOutboundConfig = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPOutboundConfig",
  () => [
    {
      no: 1,
      name: "hostname",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "destination_country",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "transport", kind: "enum", T: proto3.getEnumType(SIPTransport) },
    {
      no: 3,
      name: "auth_username",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "auth_password",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "headers_to_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 6, name: "attributes_to_headers", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 8,
      name: "from_host",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const CreateSIPParticipantRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.CreateSIPParticipantRequest",
  () => [
    {
      no: 1,
      name: "sip_trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 20, name: "trunk", kind: "message", T: SIPOutboundConfig },
    { no: 24, name: "sip_request_uri", kind: "message", T: SIPRequestDest },
    { no: 25, name: "sip_to_header", kind: "message", T: SIPNamedDest },
    { no: 26, name: "sip_from_header", kind: "message", T: SIPNamedDest },
    {
      no: 2,
      name: "sip_call_to",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 27,
      name: "to_user_override",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 15,
      name: "sip_number",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "participant_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "participant_metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 9, name: "participant_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 5,
      name: "dtmf",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "play_ringtone",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 13,
      name: "play_dialtone",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 10,
      name: "hide_phone_number",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 16, name: "headers", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 17, name: "include_headers", kind: "enum", T: proto3.getEnumType(SIPHeaderOptions) },
    { no: 11, name: "ringing_timeout", kind: "message", T: Duration },
    { no: 12, name: "max_call_duration", kind: "message", T: Duration },
    {
      no: 14,
      name: "krisp_enabled",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 18, name: "media_encryption", kind: "enum", T: proto3.getEnumType(SIPMediaEncryption) },
    { no: 23, name: "media", kind: "message", T: SIPMediaConfig },
    {
      no: 19,
      name: "wait_until_answered",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 21, name: "display_name", kind: "scalar", T: 9, opt: true },
    { no: 22, name: "destination", kind: "message", T: Destination, opt: true }
  ]
);
const SIPParticipantInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPParticipantInfo",
  () => [
    {
      no: 1,
      name: "participant_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "sip_call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const TransferSIPParticipantRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TransferSIPParticipantRequest",
  () => [
    {
      no: 1,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "transfer_to",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "play_dialtone",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 5, name: "headers", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 6, name: "ringing_timeout", kind: "message", T: Duration }
  ]
);
const TransferSIPParticipantResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TransferSIPParticipantResponse",
  () => [
    {
      no: 1,
      name: "transfer_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "status", kind: "enum", T: proto3.getEnumType(SIPTransferStatus) },
    { no: 3, name: "reason", kind: "enum", T: proto3.getEnumType(SIPTransferReason) },
    { no: 4, name: "sip_status", kind: "message", T: SIPStatus }
  ]
);
const SIPCallInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPCallInfo",
  () => [
    {
      no: 1,
      name: "call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 16,
      name: "dispatch_rule_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 17,
      name: "region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 18, name: "participant_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 6, name: "from_uri", kind: "message", T: SIPUri },
    { no: 7, name: "to_uri", kind: "message", T: SIPUri },
    {
      no: 9,
      name: "created_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 10,
      name: "started_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 11,
      name: "ended_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 14, name: "enabled_features", kind: "enum", T: proto3.getEnumType(SIPFeature), repeated: true },
    { no: 15, name: "call_direction", kind: "enum", T: proto3.getEnumType(SIPCallDirection) },
    { no: 8, name: "call_status", kind: "enum", T: proto3.getEnumType(SIPCallStatus) },
    {
      no: 22,
      name: "created_at_ns",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 23,
      name: "started_at_ns",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 24,
      name: "ended_at_ns",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 12, name: "disconnect_reason", kind: "enum", T: proto3.getEnumType(DisconnectReason) },
    {
      no: 13,
      name: "error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 19, name: "call_status_code", kind: "message", T: SIPStatus },
    {
      no: 20,
      name: "audio_codec",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 21,
      name: "media_encryption",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 25,
      name: "pcap_file_link",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 26, name: "call_context", kind: "message", T: Any, repeated: true },
    { no: 27, name: "provider_info", kind: "message", T: ProviderInfo },
    {
      no: 28,
      name: "sip_call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const SIPTransferInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPTransferInfo",
  () => [
    {
      no: 1,
      name: "transfer_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "transfer_to",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "transfer_initiated_at_ns",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 5,
      name: "transfer_completed_at_ns",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 6, name: "transfer_status", kind: "enum", T: proto3.getEnumType(SIPTransferStatus) },
    {
      no: 7,
      name: "error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 8, name: "transfer_status_code", kind: "message", T: SIPStatus },
    { no: 9, name: "reason", kind: "enum", T: proto3.getEnumType(SIPTransferReason) }
  ]
);
const SIPUri = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPUri",
  () => [
    {
      no: 1,
      name: "user",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "host",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "ip",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "port",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 5, name: "transport", kind: "enum", T: proto3.getEnumType(SIPTransport) }
  ]
);
const SIPRequestDest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPRequestDest",
  () => [
    { no: 1, name: "raw", kind: "scalar", T: 9, oneof: "uri" },
    { no: 2, name: "values", kind: "message", T: SIPUri, oneof: "uri" }
  ]
);
const SIPNamedDest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SIPNamedDest",
  () => [
    {
      no: 3,
      name: "display_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 1, name: "raw", kind: "scalar", T: 9, oneof: "uri" },
    { no: 2, name: "values", kind: "message", T: SIPUri, oneof: "uri" }
  ]
);
const Destination = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Destination",
  () => [
    {
      no: 1,
      name: "city",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "country",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);

const StreamType = /* @__PURE__ */ proto3.makeEnum(
  "livekit.StreamType",
  [
    { no: 0, name: "UPSTREAM" },
    { no: 1, name: "DOWNSTREAM" }
  ]
);
const AnalyticsEventType = /* @__PURE__ */ proto3.makeEnum(
  "livekit.AnalyticsEventType",
  [
    { no: 0, name: "ROOM_CREATED" },
    { no: 1, name: "ROOM_ENDED" },
    { no: 2, name: "PARTICIPANT_JOINED" },
    { no: 3, name: "PARTICIPANT_LEFT" },
    { no: 45, name: "PARTICIPANT_CONNECTION_ABORTED" },
    { no: 4, name: "TRACK_PUBLISHED" },
    { no: 20, name: "TRACK_PUBLISH_REQUESTED" },
    { no: 5, name: "TRACK_UNPUBLISHED" },
    { no: 6, name: "TRACK_SUBSCRIBED" },
    { no: 21, name: "TRACK_SUBSCRIBE_REQUESTED" },
    { no: 25, name: "TRACK_SUBSCRIBE_FAILED" },
    { no: 7, name: "TRACK_UNSUBSCRIBED" },
    { no: 10, name: "TRACK_PUBLISHED_UPDATE" },
    { no: 23, name: "TRACK_MUTED" },
    { no: 24, name: "TRACK_UNMUTED" },
    { no: 26, name: "TRACK_PUBLISH_STATS" },
    { no: 27, name: "TRACK_SUBSCRIBE_STATS" },
    { no: 11, name: "PARTICIPANT_ACTIVE" },
    { no: 22, name: "PARTICIPANT_RESUMED" },
    { no: 12, name: "EGRESS_STARTED" },
    { no: 13, name: "EGRESS_ENDED" },
    { no: 28, name: "EGRESS_UPDATED" },
    { no: 14, name: "TRACK_MAX_SUBSCRIBED_VIDEO_QUALITY" },
    { no: 15, name: "RECONNECTED" },
    { no: 18, name: "INGRESS_CREATED" },
    { no: 19, name: "INGRESS_DELETED" },
    { no: 16, name: "INGRESS_STARTED" },
    { no: 17, name: "INGRESS_ENDED" },
    { no: 29, name: "INGRESS_UPDATED" },
    { no: 30, name: "SIP_INBOUND_TRUNK_CREATED" },
    { no: 31, name: "SIP_INBOUND_TRUNK_DELETED" },
    { no: 32, name: "SIP_OUTBOUND_TRUNK_CREATED" },
    { no: 33, name: "SIP_OUTBOUND_TRUNK_DELETED" },
    { no: 34, name: "SIP_DISPATCH_RULE_CREATED" },
    { no: 35, name: "SIP_DISPATCH_RULE_DELETED" },
    { no: 36, name: "SIP_PARTICIPANT_CREATED" },
    { no: 37, name: "SIP_CALL_INCOMING" },
    { no: 38, name: "SIP_CALL_STARTED" },
    { no: 39, name: "SIP_CALL_ENDED" },
    { no: 43, name: "SIP_TRANSFER_REQUESTED" },
    { no: 44, name: "SIP_TRANSFER_COMPLETE" },
    { no: 46, name: "SIP_CALL_UPDATE" },
    { no: 40, name: "REPORT" },
    { no: 41, name: "API_CALL" },
    { no: 42, name: "WEBHOOK" }
  ]
);
const AnalyticsVideoLayer = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AnalyticsVideoLayer",
  () => [
    {
      no: 1,
      name: "layer",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 2,
      name: "packets",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "bytes",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 4,
      name: "frames",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const AnalyticsStream = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AnalyticsStream",
  () => [
    {
      no: 1,
      name: "ssrc",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 2,
      name: "primary_packets",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "primary_bytes",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 4,
      name: "retransmit_packets",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 5,
      name: "retransmit_bytes",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 6,
      name: "padding_packets",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 7,
      name: "padding_bytes",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    {
      no: 8,
      name: "packets_lost",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 9,
      name: "frames",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 10,
      name: "rtt",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 11,
      name: "jitter",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 12,
      name: "nacks",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 13,
      name: "plis",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 14,
      name: "firs",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 15, name: "video_layers", kind: "message", T: AnalyticsVideoLayer, repeated: true },
    { no: 17, name: "start_time", kind: "message", T: Timestamp },
    { no: 18, name: "end_time", kind: "message", T: Timestamp },
    {
      no: 19,
      name: "packets_out_of_order",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const AnalyticsStat = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AnalyticsStat",
  () => [
    {
      no: 14,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 1,
      name: "analytics_key",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "kind", kind: "enum", T: proto3.getEnumType(StreamType) },
    { no: 3, name: "time_stamp", kind: "message", T: Timestamp },
    {
      no: 4,
      name: "node",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "participant_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "track_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "score",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    { no: 10, name: "streams", kind: "message", T: AnalyticsStream, repeated: true },
    {
      no: 11,
      name: "mime",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 12,
      name: "min_score",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    },
    {
      no: 13,
      name: "median_score",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    }
  ]
);
const AnalyticsStats = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AnalyticsStats",
  () => [
    { no: 1, name: "stats", kind: "message", T: AnalyticsStat, repeated: true }
  ]
);
const AnalyticsClientMeta = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AnalyticsClientMeta",
  () => [
    {
      no: 1,
      name: "region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "node",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "client_addr",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "client_connect_time",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 5,
      name: "connection_type",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 6, name: "reconnect_reason", kind: "enum", T: proto3.getEnumType(ReconnectReason) },
    { no: 7, name: "geo_hash", kind: "scalar", T: 9, opt: true },
    { no: 8, name: "country", kind: "scalar", T: 9, opt: true },
    { no: 9, name: "isp_asn", kind: "scalar", T: 13, opt: true }
  ]
);
const AnalyticsEvent = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AnalyticsEvent",
  () => [
    {
      no: 25,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 1, name: "type", kind: "enum", T: proto3.getEnumType(AnalyticsEventType) },
    { no: 2, name: "timestamp", kind: "message", T: Timestamp },
    {
      no: 3,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "room", kind: "message", T: Room },
    {
      no: 5,
      name: "participant_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 6, name: "participant", kind: "message", T: ParticipantInfo },
    {
      no: 7,
      name: "track_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 8, name: "track", kind: "message", T: TrackInfo },
    {
      no: 10,
      name: "analytics_key",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 11, name: "client_info", kind: "message", T: ClientInfo },
    { no: 12, name: "client_meta", kind: "message", T: AnalyticsClientMeta },
    {
      no: 13,
      name: "egress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 19,
      name: "ingress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 14, name: "max_subscribed_video_quality", kind: "enum", T: proto3.getEnumType(VideoQuality) },
    { no: 15, name: "publisher", kind: "message", T: ParticipantInfo },
    {
      no: 16,
      name: "mime",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 17, name: "egress", kind: "message", T: EgressInfo },
    { no: 18, name: "ingress", kind: "message", T: IngressInfo },
    {
      no: 20,
      name: "error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 21, name: "rtp_stats", kind: "message", T: RTPStats },
    {
      no: 22,
      name: "video_layer",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 24,
      name: "node_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 26,
      name: "sip_call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 27, name: "sip_call", kind: "message", T: SIPCallInfo },
    {
      no: 28,
      name: "sip_trunk_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 29, name: "sip_inbound_trunk", kind: "message", T: SIPInboundTrunkInfo },
    { no: 30, name: "sip_outbound_trunk", kind: "message", T: SIPOutboundTrunkInfo },
    {
      no: 31,
      name: "sip_dispatch_rule_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 32, name: "sip_dispatch_rule", kind: "message", T: SIPDispatchRuleInfo },
    { no: 36, name: "sip_transfer", kind: "message", T: SIPTransferInfo },
    { no: 33, name: "report", kind: "message", T: ReportInfo },
    { no: 34, name: "api_call", kind: "message", T: APICallInfo },
    { no: 35, name: "webhook", kind: "message", T: WebhookInfo },
    { no: 37, name: "room_end_reason", kind: "enum", T: proto3.getEnumType(RoomEndReason) }
  ]
);
const AnalyticsEvents = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AnalyticsEvents",
  () => [
    { no: 1, name: "events", kind: "message", T: AnalyticsEvent, repeated: true }
  ]
);
const AnalyticsRoomParticipant = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AnalyticsRoomParticipant",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "state", kind: "enum", T: proto3.getEnumType(ParticipantInfo_State) },
    { no: 5, name: "joined_at", kind: "message", T: Timestamp }
  ]
);
const AnalyticsRoom = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AnalyticsRoom",
  () => [
    {
      no: 1,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "created_at", kind: "message", T: Timestamp },
    { no: 4, name: "participants", kind: "message", T: AnalyticsRoomParticipant, repeated: true }
  ]
);
const AnalyticsNodeRooms = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AnalyticsNodeRooms",
  () => [
    {
      no: 1,
      name: "node_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "sequence_number",
      kind: "scalar",
      T: 4
      /* ScalarType.UINT64 */
    },
    { no: 3, name: "timestamp", kind: "message", T: Timestamp },
    { no: 4, name: "rooms", kind: "message", T: AnalyticsRoom, repeated: true }
  ]
);
const ReportInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ReportInfo",
  () => [
    { no: 1, name: "feature_usage", kind: "message", T: FeatureUsageInfo, oneof: "message" }
  ]
);
const TimeRange = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TimeRange",
  () => [
    { no: 1, name: "started_at", kind: "message", T: Timestamp },
    { no: 2, name: "ended_at", kind: "message", T: Timestamp }
  ]
);
const FeatureUsageInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.FeatureUsageInfo",
  () => [
    { no: 1, name: "feature", kind: "enum", T: proto3.getEnumType(FeatureUsageInfo_Feature) },
    {
      no: 2,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "participant_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "track_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 8, name: "time_ranges", kind: "message", T: TimeRange, repeated: true },
    { no: 9, name: "feature_info", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } }
  ]
);
const FeatureUsageInfo_Feature = /* @__PURE__ */ proto3.makeEnum(
  "livekit.FeatureUsageInfo.Feature",
  [
    { no: 0, name: "KRISP_NOISE_CANCELLATION" },
    { no: 1, name: "KRISP_BACKGROUND_VOICE_CANCELLATION" },
    { no: 2, name: "AIC_AUDIO_ENHANCEMENT" },
    { no: 3, name: "KRISP_VIVA" }
  ]
);
const APICallRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.APICallRequest",
  () => [
    { no: 1, name: "create_room_request", kind: "message", T: CreateRoomRequest, oneof: "message" },
    { no: 2, name: "list_rooms_request", kind: "message", T: ListRoomsRequest, oneof: "message" },
    { no: 3, name: "delete_room_request", kind: "message", T: DeleteRoomRequest, oneof: "message" },
    { no: 4, name: "list_participants_request", kind: "message", T: ListParticipantsRequest, oneof: "message" },
    { no: 5, name: "room_participant_identity", kind: "message", T: RoomParticipantIdentity, oneof: "message" },
    { no: 6, name: "mute_room_track_request", kind: "message", T: MuteRoomTrackRequest, oneof: "message" },
    { no: 7, name: "update_participant_request", kind: "message", T: UpdateParticipantRequest, oneof: "message" },
    { no: 8, name: "update_subscriptions_request", kind: "message", T: UpdateSubscriptionsRequest, oneof: "message" },
    { no: 9, name: "send_data_request", kind: "message", T: SendDataRequest, oneof: "message" },
    { no: 10, name: "update_room_metadata_request", kind: "message", T: UpdateRoomMetadataRequest, oneof: "message" }
  ]
);
const APICallInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.APICallInfo",
  () => [
    {
      no: 1,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "request", kind: "message", T: APICallRequest },
    {
      no: 3,
      name: "service",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "method",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "node_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "status",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 7,
      name: "twirp_error_code",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "twirp_error_message",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 10,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 11,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 12,
      name: "participant_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 13,
      name: "track_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 14, name: "started_at", kind: "message", T: Timestamp },
    {
      no: 15,
      name: "duration_ns",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    }
  ]
);
const WebhookInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.WebhookInfo",
  () => [
    {
      no: 1,
      name: "event_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "event",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "project_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "room_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "participant_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "track_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "egress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 10,
      name: "ingress_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 11, name: "created_at", kind: "message", T: Timestamp },
    { no: 12, name: "queued_at", kind: "message", T: Timestamp },
    {
      no: 13,
      name: "queue_duration_ns",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    { no: 14, name: "sent_at", kind: "message", T: Timestamp },
    {
      no: 15,
      name: "send_duration_ns",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 16,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 17,
      name: "num_dropped",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 18,
      name: "is_dropped",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 19,
      name: "service_status",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 20,
      name: "service_error_code",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 21,
      name: "service_error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 22,
      name: "send_error",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 23,
      name: "http_status_code",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    }
  ]
);

const ConnectorType = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ConnectorType",
  [
    { no: 0, name: "Unspecified" },
    { no: 1, name: "WhatsApp" },
    { no: 2, name: "Twilio" }
  ]
);

const ConnectTwilioCallRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ConnectTwilioCallRequest",
  () => [
    { no: 1, name: "twilio_call_direction", kind: "enum", T: proto3.getEnumType(ConnectTwilioCallRequest_TwilioCallDirection) },
    {
      no: 2,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "agents", kind: "message", T: RoomAgentDispatch, repeated: true },
    {
      no: 4,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "participant_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 6,
      name: "participant_metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 7, name: "participant_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 8,
      name: "destination_country",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ConnectTwilioCallRequest_TwilioCallDirection = /* @__PURE__ */ proto3.makeEnum(
  "livekit.ConnectTwilioCallRequest.TwilioCallDirection",
  [
    { no: 0, name: "TWILIO_CALL_DIRECTION_INBOUND", localName: "INBOUND" },
    { no: 1, name: "TWILIO_CALL_DIRECTION_OUTBOUND", localName: "OUTBOUND" }
  ]
);
const ConnectTwilioCallResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ConnectTwilioCallResponse",
  () => [
    {
      no: 1,
      name: "connect_url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);

const SignalTarget = /* @__PURE__ */ proto3.makeEnum(
  "livekit.SignalTarget",
  [
    { no: 0, name: "PUBLISHER" },
    { no: 1, name: "SUBSCRIBER" }
  ]
);
const StreamState = /* @__PURE__ */ proto3.makeEnum(
  "livekit.StreamState",
  [
    { no: 0, name: "ACTIVE" },
    { no: 1, name: "PAUSED" }
  ]
);
const CandidateProtocol = /* @__PURE__ */ proto3.makeEnum(
  "livekit.CandidateProtocol",
  [
    { no: 0, name: "UDP" },
    { no: 1, name: "TCP" },
    { no: 2, name: "TLS" }
  ]
);
const SignalRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SignalRequest",
  () => [
    { no: 1, name: "offer", kind: "message", T: SessionDescription, oneof: "message" },
    { no: 2, name: "answer", kind: "message", T: SessionDescription, oneof: "message" },
    { no: 3, name: "trickle", kind: "message", T: TrickleRequest, oneof: "message" },
    { no: 4, name: "add_track", kind: "message", T: AddTrackRequest, oneof: "message" },
    { no: 5, name: "mute", kind: "message", T: MuteTrackRequest, oneof: "message" },
    { no: 6, name: "subscription", kind: "message", T: UpdateSubscription, oneof: "message" },
    { no: 7, name: "track_setting", kind: "message", T: UpdateTrackSettings, oneof: "message" },
    { no: 8, name: "leave", kind: "message", T: LeaveRequest, oneof: "message" },
    { no: 10, name: "update_layers", kind: "message", T: UpdateVideoLayers, oneof: "message" },
    { no: 11, name: "subscription_permission", kind: "message", T: SubscriptionPermission, oneof: "message" },
    { no: 12, name: "sync_state", kind: "message", T: SyncState, oneof: "message" },
    { no: 13, name: "simulate", kind: "message", T: SimulateScenario, oneof: "message" },
    { no: 14, name: "ping", kind: "scalar", T: 3, oneof: "message" },
    { no: 15, name: "update_metadata", kind: "message", T: UpdateParticipantMetadata, oneof: "message" },
    { no: 16, name: "ping_req", kind: "message", T: Ping, oneof: "message" },
    { no: 17, name: "update_audio_track", kind: "message", T: UpdateLocalAudioTrack, oneof: "message" },
    { no: 18, name: "update_video_track", kind: "message", T: UpdateLocalVideoTrack, oneof: "message" },
    { no: 19, name: "publish_data_track_request", kind: "message", T: PublishDataTrackRequest, oneof: "message" },
    { no: 20, name: "unpublish_data_track_request", kind: "message", T: UnpublishDataTrackRequest, oneof: "message" },
    { no: 21, name: "update_data_subscription", kind: "message", T: UpdateDataSubscription, oneof: "message" },
    { no: 22, name: "store_data_blob_request", kind: "message", T: StoreDataBlobRequest, oneof: "message" },
    { no: 23, name: "get_data_blob_request", kind: "message", T: GetDataBlobRequest, oneof: "message" }
  ]
);
const SignalResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SignalResponse",
  () => [
    { no: 1, name: "join", kind: "message", T: JoinResponse, oneof: "message" },
    { no: 2, name: "answer", kind: "message", T: SessionDescription, oneof: "message" },
    { no: 3, name: "offer", kind: "message", T: SessionDescription, oneof: "message" },
    { no: 4, name: "trickle", kind: "message", T: TrickleRequest, oneof: "message" },
    { no: 5, name: "update", kind: "message", T: ParticipantUpdate, oneof: "message" },
    { no: 6, name: "track_published", kind: "message", T: TrackPublishedResponse, oneof: "message" },
    { no: 8, name: "leave", kind: "message", T: LeaveRequest, oneof: "message" },
    { no: 9, name: "mute", kind: "message", T: MuteTrackRequest, oneof: "message" },
    { no: 10, name: "speakers_changed", kind: "message", T: SpeakersChanged, oneof: "message" },
    { no: 11, name: "room_update", kind: "message", T: RoomUpdate, oneof: "message" },
    { no: 12, name: "connection_quality", kind: "message", T: ConnectionQualityUpdate, oneof: "message" },
    { no: 13, name: "stream_state_update", kind: "message", T: StreamStateUpdate, oneof: "message" },
    { no: 14, name: "subscribed_quality_update", kind: "message", T: SubscribedQualityUpdate, oneof: "message" },
    { no: 15, name: "subscription_permission_update", kind: "message", T: SubscriptionPermissionUpdate, oneof: "message" },
    { no: 16, name: "refresh_token", kind: "scalar", T: 9, oneof: "message" },
    { no: 17, name: "track_unpublished", kind: "message", T: TrackUnpublishedResponse, oneof: "message" },
    { no: 18, name: "pong", kind: "scalar", T: 3, oneof: "message" },
    { no: 19, name: "reconnect", kind: "message", T: ReconnectResponse, oneof: "message" },
    { no: 20, name: "pong_resp", kind: "message", T: Pong, oneof: "message" },
    { no: 21, name: "subscription_response", kind: "message", T: SubscriptionResponse, oneof: "message" },
    { no: 22, name: "request_response", kind: "message", T: RequestResponse, oneof: "message" },
    { no: 23, name: "track_subscribed", kind: "message", T: TrackSubscribed, oneof: "message" },
    { no: 24, name: "room_moved", kind: "message", T: RoomMovedResponse, oneof: "message" },
    { no: 25, name: "media_sections_requirement", kind: "message", T: MediaSectionsRequirement, oneof: "message" },
    { no: 26, name: "subscribed_audio_codec_update", kind: "message", T: SubscribedAudioCodecUpdate, oneof: "message" },
    { no: 27, name: "publish_data_track_response", kind: "message", T: PublishDataTrackResponse, oneof: "message" },
    { no: 28, name: "unpublish_data_track_response", kind: "message", T: UnpublishDataTrackResponse, oneof: "message" },
    { no: 29, name: "data_track_subscriber_handles", kind: "message", T: DataTrackSubscriberHandles, oneof: "message" },
    { no: 30, name: "store_data_blob_response", kind: "message", T: StoreDataBlobResponse, oneof: "message" },
    { no: 31, name: "get_data_blob_response", kind: "message", T: GetDataBlobResponse, oneof: "message" }
  ]
);
const SimulcastCodec = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulcastCodec",
  () => [
    {
      no: 1,
      name: "codec",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "cid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "layers", kind: "message", T: VideoLayer, repeated: true },
    { no: 5, name: "video_layer_mode", kind: "enum", T: proto3.getEnumType(VideoLayer_Mode) }
  ]
);
const AddTrackRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AddTrackRequest",
  () => [
    {
      no: 1,
      name: "cid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "type", kind: "enum", T: proto3.getEnumType(TrackType) },
    {
      no: 4,
      name: "width",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 5,
      name: "height",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 6,
      name: "muted",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 7,
      name: "disable_dtx",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 8, name: "source", kind: "enum", T: proto3.getEnumType(TrackSource) },
    { no: 9, name: "layers", kind: "message", T: VideoLayer, repeated: true },
    { no: 10, name: "simulcast_codecs", kind: "message", T: SimulcastCodec, repeated: true },
    {
      no: 11,
      name: "sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 12,
      name: "stereo",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 13,
      name: "disable_red",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 14, name: "encryption", kind: "enum", T: proto3.getEnumType(Encryption_Type) },
    {
      no: 15,
      name: "stream",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 16, name: "backup_codec_policy", kind: "enum", T: proto3.getEnumType(BackupCodecPolicy) },
    { no: 17, name: "audio_features", kind: "enum", T: proto3.getEnumType(AudioTrackFeature), repeated: true },
    { no: 18, name: "packet_trailer_features", kind: "enum", T: proto3.getEnumType(PacketTrailerFeature), repeated: true }
  ]
);
const PublishDataTrackRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.PublishDataTrackRequest",
  () => [
    {
      no: 1,
      name: "pub_handle",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "encryption", kind: "enum", T: proto3.getEnumType(Encryption_Type) },
    { no: 4, name: "frame_encoding", kind: "message", T: DataTrackFrameEncoding, opt: true },
    { no: 5, name: "schema", kind: "message", T: DataTrackSchemaId, opt: true }
  ]
);
const PublishDataTrackResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.PublishDataTrackResponse",
  () => [
    { no: 1, name: "info", kind: "message", T: DataTrackInfo }
  ]
);
const UnpublishDataTrackRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UnpublishDataTrackRequest",
  () => [
    {
      no: 1,
      name: "pub_handle",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const UnpublishDataTrackResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UnpublishDataTrackResponse",
  () => [
    { no: 1, name: "info", kind: "message", T: DataTrackInfo }
  ]
);
const DataTrackSubscriberHandles = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataTrackSubscriberHandles",
  () => [
    { no: 1, name: "sub_handles", kind: "map", K: 13, V: { kind: "message", T: DataTrackSubscriberHandles_PublishedDataTrack } }
  ]
);
const DataTrackSubscriberHandles_PublishedDataTrack = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataTrackSubscriberHandles.PublishedDataTrack",
  () => [
    {
      no: 1,
      name: "publisher_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "publisher_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ],
  { localName: "DataTrackSubscriberHandles_PublishedDataTrack" }
);
const TrickleRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TrickleRequest",
  () => [
    {
      no: 1,
      name: "candidateInit",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "target", kind: "enum", T: proto3.getEnumType(SignalTarget) },
    {
      no: 3,
      name: "final",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const MuteTrackRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MuteTrackRequest",
  () => [
    {
      no: 1,
      name: "sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "muted",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const JoinResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.JoinResponse",
  () => [
    { no: 1, name: "room", kind: "message", T: Room },
    { no: 2, name: "participant", kind: "message", T: ParticipantInfo },
    { no: 3, name: "other_participants", kind: "message", T: ParticipantInfo, repeated: true },
    {
      no: 4,
      name: "server_version",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "ice_servers", kind: "message", T: ICEServer, repeated: true },
    {
      no: 6,
      name: "subscriber_primary",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 7,
      name: "alternative_url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 8, name: "client_configuration", kind: "message", T: ClientConfiguration },
    {
      no: 9,
      name: "server_region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 10,
      name: "ping_timeout",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    {
      no: 11,
      name: "ping_interval",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    { no: 12, name: "server_info", kind: "message", T: ServerInfo },
    {
      no: 13,
      name: "sif_trailer",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    },
    { no: 14, name: "enabled_publish_codecs", kind: "message", T: Codec, repeated: true },
    {
      no: 15,
      name: "fast_publish",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const ReconnectResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ReconnectResponse",
  () => [
    { no: 1, name: "ice_servers", kind: "message", T: ICEServer, repeated: true },
    { no: 2, name: "client_configuration", kind: "message", T: ClientConfiguration },
    { no: 3, name: "server_info", kind: "message", T: ServerInfo },
    {
      no: 4,
      name: "last_message_seq",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const TrackPublishedResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TrackPublishedResponse",
  () => [
    {
      no: 1,
      name: "cid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "track", kind: "message", T: TrackInfo }
  ]
);
const TrackUnpublishedResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TrackUnpublishedResponse",
  () => [
    {
      no: 1,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const SessionDescription = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SessionDescription",
  () => [
    {
      no: 1,
      name: "type",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "sdp",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "id",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 4, name: "mid_to_track_id", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } }
  ]
);
const ParticipantUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ParticipantUpdate",
  () => [
    { no: 1, name: "participants", kind: "message", T: ParticipantInfo, repeated: true }
  ]
);
const UpdateSubscription = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateSubscription",
  () => [
    { no: 1, name: "track_sids", kind: "scalar", T: 9, repeated: true },
    {
      no: 2,
      name: "subscribe",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 3, name: "participant_tracks", kind: "message", T: ParticipantTracks, repeated: true }
  ]
);
const UpdateDataSubscription = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateDataSubscription",
  () => [
    { no: 1, name: "updates", kind: "message", T: UpdateDataSubscription_Update, repeated: true }
  ]
);
const UpdateDataSubscription_Update = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateDataSubscription.Update",
  () => [
    {
      no: 1,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "subscribe",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 3, name: "options", kind: "message", T: DataTrackSubscriptionOptions }
  ],
  { localName: "UpdateDataSubscription_Update" }
);
const StoreDataBlobRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.StoreDataBlobRequest",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 2, name: "blob", kind: "message", T: DataBlob }
  ]
);
const StoreDataBlobResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.StoreDataBlobResponse",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 2, name: "key", kind: "message", T: DataBlobKey }
  ]
);
const GetDataBlobRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.GetDataBlobRequest",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 2,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "key", kind: "message", T: DataBlobKey }
  ]
);
const GetDataBlobResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.GetDataBlobResponse",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 2, name: "blob", kind: "message", T: DataBlob }
  ]
);
const UpdateTrackSettings = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateTrackSettings",
  () => [
    { no: 1, name: "track_sids", kind: "scalar", T: 9, repeated: true },
    {
      no: 3,
      name: "disabled",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 4, name: "quality", kind: "enum", T: proto3.getEnumType(VideoQuality) },
    {
      no: 5,
      name: "width",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 6,
      name: "height",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 7,
      name: "fps",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 8,
      name: "priority",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const UpdateLocalAudioTrack = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateLocalAudioTrack",
  () => [
    {
      no: 1,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "features", kind: "enum", T: proto3.getEnumType(AudioTrackFeature), repeated: true }
  ]
);
const UpdateLocalVideoTrack = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateLocalVideoTrack",
  () => [
    {
      no: 1,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "width",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 3,
      name: "height",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const LeaveRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.LeaveRequest",
  () => [
    {
      no: 1,
      name: "can_reconnect",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 2, name: "reason", kind: "enum", T: proto3.getEnumType(DisconnectReason) },
    { no: 3, name: "action", kind: "enum", T: proto3.getEnumType(LeaveRequest_Action) },
    { no: 4, name: "regions", kind: "message", T: RegionSettings }
  ]
);
const LeaveRequest_Action = /* @__PURE__ */ proto3.makeEnum(
  "livekit.LeaveRequest.Action",
  [
    { no: 0, name: "DISCONNECT" },
    { no: 1, name: "RESUME" },
    { no: 2, name: "RECONNECT" }
  ]
);
const UpdateVideoLayers = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateVideoLayers",
  () => [
    {
      no: 1,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "layers", kind: "message", T: VideoLayer, repeated: true }
  ]
);
const UpdateParticipantMetadata = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.UpdateParticipantMetadata",
  () => [
    {
      no: 1,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 4,
      name: "request_id",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const ICEServer = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ICEServer",
  () => [
    { no: 1, name: "urls", kind: "scalar", T: 9, repeated: true },
    {
      no: 2,
      name: "username",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "credential",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const SpeakersChanged = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SpeakersChanged",
  () => [
    { no: 1, name: "speakers", kind: "message", T: SpeakerInfo, repeated: true }
  ]
);
const RoomUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RoomUpdate",
  () => [
    { no: 1, name: "room", kind: "message", T: Room }
  ]
);
const ConnectionQualityInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ConnectionQualityInfo",
  () => [
    {
      no: 1,
      name: "participant_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "quality", kind: "enum", T: proto3.getEnumType(ConnectionQuality) },
    {
      no: 3,
      name: "score",
      kind: "scalar",
      T: 2
      /* ScalarType.FLOAT */
    }
  ]
);
const ConnectionQualityUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ConnectionQualityUpdate",
  () => [
    { no: 1, name: "updates", kind: "message", T: ConnectionQualityInfo, repeated: true }
  ]
);
const StreamStateInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.StreamStateInfo",
  () => [
    {
      no: 1,
      name: "participant_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "state", kind: "enum", T: proto3.getEnumType(StreamState) }
  ]
);
const StreamStateUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.StreamStateUpdate",
  () => [
    { no: 1, name: "stream_states", kind: "message", T: StreamStateInfo, repeated: true }
  ]
);
const SubscribedQuality = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SubscribedQuality",
  () => [
    { no: 1, name: "quality", kind: "enum", T: proto3.getEnumType(VideoQuality) },
    {
      no: 2,
      name: "enabled",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const SubscribedCodec = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SubscribedCodec",
  () => [
    {
      no: 1,
      name: "codec",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "qualities", kind: "message", T: SubscribedQuality, repeated: true }
  ]
);
const SubscribedQualityUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SubscribedQualityUpdate",
  () => [
    {
      no: 1,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "subscribed_qualities", kind: "message", T: SubscribedQuality, repeated: true },
    { no: 3, name: "subscribed_codecs", kind: "message", T: SubscribedCodec, repeated: true }
  ]
);
const SubscribedAudioCodecUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SubscribedAudioCodecUpdate",
  () => [
    {
      no: 1,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "subscribed_audio_codecs", kind: "message", T: SubscribedAudioCodec, repeated: true }
  ]
);
const TrackPermission = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TrackPermission",
  () => [
    {
      no: 1,
      name: "participant_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "all_tracks",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 3, name: "track_sids", kind: "scalar", T: 9, repeated: true },
    {
      no: 4,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const SubscriptionPermission = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SubscriptionPermission",
  () => [
    {
      no: 1,
      name: "all_participants",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 2, name: "track_permissions", kind: "message", T: TrackPermission, repeated: true }
  ]
);
const SubscriptionPermissionUpdate = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SubscriptionPermissionUpdate",
  () => [
    {
      no: 1,
      name: "participant_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "allowed",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const RoomMovedResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RoomMovedResponse",
  () => [
    { no: 1, name: "room", kind: "message", T: Room },
    {
      no: 2,
      name: "token",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "participant", kind: "message", T: ParticipantInfo },
    { no: 4, name: "other_participants", kind: "message", T: ParticipantInfo, repeated: true }
  ]
);
const SyncState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SyncState",
  () => [
    { no: 1, name: "answer", kind: "message", T: SessionDescription },
    { no: 2, name: "subscription", kind: "message", T: UpdateSubscription },
    { no: 3, name: "publish_tracks", kind: "message", T: TrackPublishedResponse, repeated: true },
    { no: 4, name: "data_channels", kind: "message", T: DataChannelInfo, repeated: true },
    { no: 5, name: "offer", kind: "message", T: SessionDescription },
    { no: 6, name: "track_sids_disabled", kind: "scalar", T: 9, repeated: true },
    { no: 7, name: "datachannel_receive_states", kind: "message", T: DataChannelReceiveState, repeated: true },
    { no: 8, name: "publish_data_tracks", kind: "message", T: PublishDataTrackResponse, repeated: true },
    { no: 9, name: "data_subscription", kind: "message", T: UpdateDataSubscription }
  ]
);
const DataChannelReceiveState = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataChannelReceiveState",
  () => [
    {
      no: 1,
      name: "publisher_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "last_seq",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);
const DataChannelInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DataChannelInfo",
  () => [
    {
      no: 1,
      name: "label",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "id",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 3, name: "target", kind: "enum", T: proto3.getEnumType(SignalTarget) }
  ]
);
const SimulateScenario = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SimulateScenario",
  () => [
    { no: 1, name: "speaker_update", kind: "scalar", T: 5, oneof: "scenario" },
    { no: 2, name: "node_failure", kind: "scalar", T: 8, oneof: "scenario" },
    { no: 3, name: "migration", kind: "scalar", T: 8, oneof: "scenario" },
    { no: 4, name: "server_leave", kind: "scalar", T: 8, oneof: "scenario" },
    { no: 5, name: "switch_candidate_protocol", kind: "enum", T: proto3.getEnumType(CandidateProtocol), oneof: "scenario" },
    { no: 6, name: "subscriber_bandwidth", kind: "scalar", T: 3, oneof: "scenario" },
    { no: 7, name: "disconnect_signal_on_resume", kind: "scalar", T: 8, oneof: "scenario" },
    { no: 8, name: "disconnect_signal_on_resume_no_messages", kind: "scalar", T: 8, oneof: "scenario" },
    { no: 9, name: "leave_request_full_reconnect", kind: "scalar", T: 8, oneof: "scenario" }
  ]
);
const Ping = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Ping",
  () => [
    {
      no: 1,
      name: "timestamp",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 2,
      name: "rtt",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    }
  ]
);
const Pong = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.Pong",
  () => [
    {
      no: 1,
      name: "last_ping_timestamp",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 2,
      name: "timestamp",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    }
  ]
);
const RegionSettings = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RegionSettings",
  () => [
    { no: 1, name: "regions", kind: "message", T: RegionInfo, repeated: true }
  ]
);
const RegionInfo = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RegionInfo",
  () => [
    {
      no: 1,
      name: "region",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "distance",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    }
  ]
);
const SubscriptionResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.SubscriptionResponse",
  () => [
    {
      no: 1,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "err", kind: "enum", T: proto3.getEnumType(SubscriptionError) }
  ]
);
const RequestResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.RequestResponse",
  () => [
    {
      no: 1,
      name: "request_id",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    { no: 2, name: "reason", kind: "enum", T: proto3.getEnumType(RequestResponse_Reason) },
    {
      no: 3,
      name: "message",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "trickle", kind: "message", T: TrickleRequest, oneof: "request" },
    { no: 5, name: "add_track", kind: "message", T: AddTrackRequest, oneof: "request" },
    { no: 6, name: "mute", kind: "message", T: MuteTrackRequest, oneof: "request" },
    { no: 7, name: "update_metadata", kind: "message", T: UpdateParticipantMetadata, oneof: "request" },
    { no: 8, name: "update_audio_track", kind: "message", T: UpdateLocalAudioTrack, oneof: "request" },
    { no: 9, name: "update_video_track", kind: "message", T: UpdateLocalVideoTrack, oneof: "request" },
    { no: 10, name: "publish_data_track", kind: "message", T: PublishDataTrackRequest, oneof: "request" },
    { no: 11, name: "unpublish_data_track", kind: "message", T: UnpublishDataTrackRequest, oneof: "request" }
  ]
);
const RequestResponse_Reason = /* @__PURE__ */ proto3.makeEnum(
  "livekit.RequestResponse.Reason",
  [
    { no: 0, name: "OK" },
    { no: 1, name: "NOT_FOUND" },
    { no: 2, name: "NOT_ALLOWED" },
    { no: 3, name: "LIMIT_EXCEEDED" },
    { no: 4, name: "QUEUED" },
    { no: 5, name: "UNSUPPORTED_TYPE" },
    { no: 6, name: "UNCLASSIFIED_ERROR" },
    { no: 7, name: "INVALID_HANDLE" },
    { no: 8, name: "INVALID_NAME" },
    { no: 9, name: "DUPLICATE_HANDLE" },
    { no: 10, name: "DUPLICATE_NAME" },
    { no: 11, name: "INVALID_REQUEST" }
  ]
);
const TrackSubscribed = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TrackSubscribed",
  () => [
    {
      no: 1,
      name: "track_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const ConnectionSettings = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ConnectionSettings",
  () => [
    {
      no: 1,
      name: "auto_subscribe",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    {
      no: 2,
      name: "adaptive_stream",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 3, name: "subscriber_allow_pause", kind: "scalar", T: 8, opt: true },
    {
      no: 4,
      name: "disable_ice_lite",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 5, name: "auto_subscribe_data_track", kind: "scalar", T: 8, opt: true }
  ]
);
const JoinRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.JoinRequest",
  () => [
    { no: 1, name: "client_info", kind: "message", T: ClientInfo },
    { no: 2, name: "connection_settings", kind: "message", T: ConnectionSettings },
    {
      no: 3,
      name: "metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 4, name: "participant_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 5, name: "add_track_requests", kind: "message", T: AddTrackRequest, repeated: true },
    { no: 6, name: "publisher_offer", kind: "message", T: SessionDescription },
    {
      no: 7,
      name: "reconnect",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    },
    { no: 8, name: "reconnect_reason", kind: "enum", T: proto3.getEnumType(ReconnectReason) },
    {
      no: 9,
      name: "participant_sid",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 10, name: "sync_state", kind: "message", T: SyncState }
  ]
);
const WrappedJoinRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.WrappedJoinRequest",
  () => [
    { no: 1, name: "compression", kind: "enum", T: proto3.getEnumType(WrappedJoinRequest_Compression) },
    {
      no: 2,
      name: "join_request",
      kind: "scalar",
      T: 12
      /* ScalarType.BYTES */
    }
  ]
);
const WrappedJoinRequest_Compression = /* @__PURE__ */ proto3.makeEnum(
  "livekit.WrappedJoinRequest.Compression",
  [
    { no: 0, name: "NONE" },
    { no: 1, name: "GZIP" }
  ]
);
const MediaSectionsRequirement = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.MediaSectionsRequirement",
  () => [
    {
      no: 1,
      name: "num_audios",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    },
    {
      no: 2,
      name: "num_videos",
      kind: "scalar",
      T: 13
      /* ScalarType.UINT32 */
    }
  ]
);

const WhatsAppCallDirection = /* @__PURE__ */ proto3.makeEnum(
  "livekit.WhatsAppCallDirection",
  [
    { no: 0, name: "WHATSAPP_CALL_DIRECTION_INBOUND" },
    { no: 2, name: "WHATSAPP_CALL_DIRECTION_OUTBOUND" }
  ]
);
const DialWhatsAppCallRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DialWhatsAppCallRequest",
  () => [
    {
      no: 1,
      name: "whatsapp_phone_number_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "whatsapp_to_phone_number",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "whatsapp_api_key",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 12,
      name: "whatsapp_cloud_api_version",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "whatsapp_biz_opaque_callback_data",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 5,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 6, name: "agents", kind: "message", T: RoomAgentDispatch, repeated: true },
    {
      no: 7,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 8,
      name: "participant_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "participant_metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 10, name: "participant_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 11,
      name: "destination_country",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 13, name: "ringing_timeout", kind: "message", T: Duration }
  ]
);
const DialWhatsAppCallResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DialWhatsAppCallResponse",
  () => [
    {
      no: 1,
      name: "whatsapp_call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const DisconnectWhatsAppCallRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DisconnectWhatsAppCallRequest",
  () => [
    {
      no: 1,
      name: "whatsapp_call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "whatsapp_api_key",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 3, name: "disconnect_reason", kind: "enum", T: proto3.getEnumType(DisconnectWhatsAppCallRequest_DisconnectReason) }
  ]
);
const DisconnectWhatsAppCallRequest_DisconnectReason = /* @__PURE__ */ proto3.makeEnum(
  "livekit.DisconnectWhatsAppCallRequest.DisconnectReason",
  [
    { no: 0, name: "BUSINESS_INITIATED" },
    { no: 1, name: "USER_INITIATED" }
  ]
);
const DisconnectWhatsAppCallResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.DisconnectWhatsAppCallResponse",
  []
);
const ConnectWhatsAppCallRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ConnectWhatsAppCallRequest",
  () => [
    {
      no: 1,
      name: "whatsapp_call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "sdp", kind: "message", T: SessionDescription },
    {
      no: 3,
      name: "wait_until_answered",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const ConnectWhatsAppCallResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.ConnectWhatsAppCallResponse",
  []
);
const AcceptWhatsAppCallRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AcceptWhatsAppCallRequest",
  () => [
    {
      no: 1,
      name: "whatsapp_phone_number_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "whatsapp_api_key",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 13,
      name: "whatsapp_cloud_api_version",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 3,
      name: "whatsapp_call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 4,
      name: "whatsapp_biz_opaque_callback_data",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 5, name: "sdp", kind: "message", T: SessionDescription },
    {
      no: 6,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 7, name: "agents", kind: "message", T: RoomAgentDispatch, repeated: true },
    {
      no: 8,
      name: "participant_identity",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 9,
      name: "participant_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 10,
      name: "participant_metadata",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 11, name: "participant_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    {
      no: 12,
      name: "destination_country",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 14, name: "ringing_timeout", kind: "message", T: Duration },
    {
      no: 15,
      name: "wait_until_answered",
      kind: "scalar",
      T: 8
      /* ScalarType.BOOL */
    }
  ]
);
const AcceptWhatsAppCallResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.AcceptWhatsAppCallResponse",
  () => [
    {
      no: 1,
      name: "room_name",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);
const WhatsAppCall = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.WhatsAppCall",
  () => [
    {
      no: 1,
      name: "whatsapp_call_id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "direction", kind: "enum", T: proto3.getEnumType(WhatsAppCallDirection) }
  ]
);

const TokenSourceRequest = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TokenSourceRequest",
  () => [
    { no: 1, name: "room_name", kind: "scalar", T: 9, opt: true },
    { no: 2, name: "participant_name", kind: "scalar", T: 9, opt: true },
    { no: 3, name: "participant_identity", kind: "scalar", T: 9, opt: true },
    { no: 4, name: "participant_metadata", kind: "scalar", T: 9, opt: true },
    { no: 5, name: "participant_attributes", kind: "map", K: 9, V: {
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    } },
    { no: 6, name: "room_config", kind: "message", T: RoomConfiguration, opt: true }
  ]
);
const TokenSourceResponse = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.TokenSourceResponse",
  () => [
    {
      no: 1,
      name: "server_url",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 2,
      name: "participant_token",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    }
  ]
);

const WebhookEvent = /* @__PURE__ */ proto3.makeMessageType(
  "livekit.WebhookEvent",
  () => [
    {
      no: 1,
      name: "event",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    { no: 2, name: "room", kind: "message", T: Room },
    { no: 3, name: "participant", kind: "message", T: ParticipantInfo },
    { no: 9, name: "egress_info", kind: "message", T: EgressInfo },
    { no: 10, name: "ingress_info", kind: "message", T: IngressInfo },
    { no: 8, name: "track", kind: "message", T: TrackInfo },
    { no: 12, name: "job", kind: "message", T: Job },
    {
      no: 6,
      name: "id",
      kind: "scalar",
      T: 9
      /* ScalarType.STRING */
    },
    {
      no: 7,
      name: "created_at",
      kind: "scalar",
      T: 3
      /* ScalarType.INT64 */
    },
    {
      no: 11,
      name: "num_dropped",
      kind: "scalar",
      T: 5
      /* ScalarType.INT32 */
    },
    { no: 13, name: "room_end_reason", kind: "enum", T: proto3.getEnumType(RoomEndReason) }
  ]
);

const version = "1.51.0";

export { APICallInfo, APICallRequest, AcceptWhatsAppCallRequest, AcceptWhatsAppCallResponse, ActiveSpeakerUpdate, AddTrackRequest, livekit_agent_dev_pb as AgentDev, AgentDispatch, AgentDispatchState, livekit_agent_inference_pb as AgentInference, livekit_agent_session_pb as AgentSession, livekit_agent_text_pb as AgentText, AliOSSUpload, AnalyticsClientMeta, AnalyticsEvent, AnalyticsEventType, AnalyticsEvents, AnalyticsNodeRooms, AnalyticsRoom, AnalyticsRoomParticipant, AnalyticsStat, AnalyticsStats, AnalyticsStream, AnalyticsVideoLayer, AudioChannel, AudioCodec, AudioConfig, AudioMixing, AudioRoute, AudioTrackFeature, AutoParticipantEgress, AutoTrackEgress, AvailabilityRequest, AvailabilityResponse, AzureBlobUpload, BackupCodecPolicy, CandidateProtocol, ChatMessage, ClientConfigSetting, ClientConfiguration, ClientInfo, ClientInfo_Capability, ClientInfo_SDK, Codec, ConnectTwilioCallRequest, ConnectTwilioCallRequest_TwilioCallDirection, ConnectTwilioCallResponse, ConnectWhatsAppCallRequest, ConnectWhatsAppCallResponse, ConnectionQuality, ConnectionQualityInfo, ConnectionQualityUpdate, ConnectionSettings, ConnectorType, CreateAgentDispatchRequest, CreateIngressRequest, CreateRoomRequest, CreateSIPDispatchRuleRequest, CreateSIPInboundTrunkRequest, CreateSIPOutboundTrunkRequest, CreateSIPParticipantRequest, CreateSIPTrunkRequest, DataBlob, DataBlobKey, DataChannelInfo, DataChannelReceiveState, DataConfig, DataPacket, DataPacket_Kind, DataSelector, DataStream, DataStream_ByteHeader, DataStream_Chunk, DataStream_CompressionType, DataStream_Header, DataStream_OperationType, DataStream_TextHeader, DataStream_Trailer, DataTrackExtensionID, DataTrackExtensionParticipantSid, DataTrackFrameEncoding, DataTrackFrameEncoding_WellKnownFrameEncoding, DataTrackInfo, DataTrackSchemaEncoding, DataTrackSchemaEncoding_WellKnownSchemaEncoding, DataTrackSchemaId, DataTrackSubscriberHandles, DataTrackSubscriberHandles_PublishedDataTrack, DataTrackSubscriptionOptions, DeleteAgentDispatchRequest, DeleteIngressRequest, DeleteRoomRequest, DeleteRoomResponse, DeleteSIPDispatchRuleRequest, DeleteSIPTrunkRequest, Destination, DialWhatsAppCallRequest, DialWhatsAppCallResponse, DirectFileOutput, DisabledCodecs, DisconnectReason, DisconnectWhatsAppCallRequest, DisconnectWhatsAppCallRequest_DisconnectReason, DisconnectWhatsAppCallResponse, EgressInfo, EgressSourceType, EgressStatus, EncodedFileOutput, EncodedFileType, EncodingOptions, EncodingOptionsPreset, EncryptedPacket, EncryptedPacketPayload, Encryption, Encryption_Type, EventMetric, ExportReplayRequest, FeatureUsageInfo, FeatureUsageInfo_Feature, FileInfo, FileOutput, FilterParams, ForwardParticipantRequest, ForwardParticipantResponse, GCPUpload, GetDataBlobRequest, GetDataBlobResponse, GetSIPInboundTrunkRequest, GetSIPInboundTrunkResponse, GetSIPOutboundTrunkRequest, GetSIPOutboundTrunkResponse, ICEServer, ImageCodec, ImageFileSuffix, ImageOutput, ImagesInfo, IngressAudioEncodingOptions, IngressAudioEncodingPreset, IngressAudioOptions, IngressInfo, IngressInput, IngressState, IngressState_Status, IngressVideoEncodingOptions, IngressVideoEncodingPreset, IngressVideoOptions, InputAudioState, InputVideoState, Job, JobAssignment, JobRestartPolicy, JobState, JobStatus, JobTermination, JobType, JoinRequest, JoinResponse, LeaveRequest, LeaveRequest_Action, ListAgentDispatchRequest, ListAgentDispatchResponse, ListEgressRequest, ListEgressResponse, ListIngressRequest, ListIngressResponse, ListParticipantsRequest, ListParticipantsResponse, ListRoomsRequest, ListRoomsResponse, ListSIPDispatchRuleRequest, ListSIPDispatchRuleResponse, ListSIPInboundTrunkRequest, ListSIPInboundTrunkResponse, ListSIPOutboundTrunkRequest, ListSIPOutboundTrunkResponse, ListSIPTrunkRequest, ListSIPTrunkResponse, ListUpdate, MediaSectionsRequirement, MediaSource, MetricLabel, MetricSample, MetricsBatch, MetricsRecordingHeader, MigrateJobRequest, MoveParticipantRequest, MoveParticipantResponse, MuteRoomTrackRequest, MuteRoomTrackResponse, MuteTrackRequest, Output, PacketTrailerFeature, Pagination, ParticipantEgressRequest, ParticipantInfo, ParticipantInfo_Kind, ParticipantInfo_KindDetail, ParticipantInfo_State, ParticipantPermission, ParticipantTracks, ParticipantUpdate, ParticipantVideo, PerformRpcRequest, PerformRpcResponse, Ping, PlayoutDelay, Pong, ProviderInfo, ProviderType, ProxyConfig, PublishDataTrackRequest, PublishDataTrackResponse, RTCPSenderReportState, RTPDrift, RTPForwarderState, RTPMungerState, RTPStats, ReconnectReason, ReconnectResponse, RegionInfo, RegionSettings, RegisterWorkerRequest, RegisterWorkerResponse, RemoveParticipantResponse, ReportInfo, RequestResponse, RequestResponse_Reason, Room, RoomAgent, RoomAgentDispatch, RoomCompositeEgressRequest, RoomConfiguration, RoomEgress, RoomEndReason, RoomMovedResponse, RoomParticipantIdentity, RoomUpdate, RpcAck, RpcError, RpcRequest, RpcResponse, S3Upload, SIPCallDirection, SIPCallInfo, SIPCallStatus, SIPCodec, SIPDispatchRule, SIPDispatchRuleCallee, SIPDispatchRuleDirect, SIPDispatchRuleIndividual, SIPDispatchRuleInfo, SIPDispatchRuleUpdate, SIPFeature, SIPHeaderOptions, SIPInboundTrunkInfo, SIPInboundTrunkUpdate, SIPMediaConfig, SIPMediaEncryption, SIPNamedDest, SIPOutboundConfig, SIPOutboundTrunkInfo, SIPOutboundTrunkUpdate, SIPParticipantInfo, SIPRequestDest, SIPStatus, SIPStatusCode, SIPTransferInfo, SIPTransferReason, SIPTransferStatus, SIPTransport, SIPTrunkInfo, SIPTrunkInfo_TrunkKind, SIPUri, Scenario, ScenarioGroup, Scenario_CreateFromSession, Scenario_CreateFromSession_Request, Scenario_CreateFromSession_Response, SegmentedFileOutput, SegmentedFileProtocol, SegmentedFileSuffix, SegmentsInfo, SendDataRequest, SendDataResponse, ServerInfo, ServerInfo_Edition, ServerMessage, SessionDescription, SignalRequest, SignalResponse, SignalTarget, SimulateJobRequest, SimulateScenario, SimulationDispatch, SimulationMode, SimulationRun, SimulationRunSummary, SimulationRunSummary_Issue, SimulationRun_Cancel, SimulationRun_Cancel_Request, SimulationRun_Cancel_Response, SimulationRun_ConfirmSourceUpload, SimulationRun_ConfirmSourceUpload_Request, SimulationRun_ConfirmSourceUpload_Response, SimulationRun_Counts, SimulationRun_Counts_Bucket, SimulationRun_Counts_Request, SimulationRun_Counts_Response, SimulationRun_Create, SimulationRun_Create_Request, SimulationRun_Create_Response, SimulationRun_Get, SimulationRun_Get_Request, SimulationRun_Get_Response, SimulationRun_Job, SimulationRun_JobMetrics, SimulationRun_JobMetrics_Conversation, SimulationRun_JobMetrics_LLM, SimulationRun_JobMetrics_STT, SimulationRun_JobMetrics_TTS, SimulationRun_JobMetrics_Turn, SimulationRun_Job_Status, SimulationRun_Job_Usage, SimulationRun_List, SimulationRun_List_Request, SimulationRun_List_Response, SimulationRun_RunMetrics, SimulationRun_Status, SimulationRun_Usage, SimulcastCodec, SimulcastCodecInfo, SipDTMF, SpeakerInfo, SpeakersChanged, StartEgressRequest, StopEgressRequest, StorageConfig, StoreDataBlobRequest, StoreDataBlobResponse, StreamInfo, StreamInfoList, StreamInfo_Status, StreamOutput, StreamProtocol, StreamState, StreamStateInfo, StreamStateUpdate, StreamType, SubscribedAudioCodec, SubscribedAudioCodecUpdate, SubscribedCodec, SubscribedQuality, SubscribedQualityUpdate, SubscriptionError, SubscriptionPermission, SubscriptionPermissionUpdate, SubscriptionResponse, SyncState, TemplateSource, TimeRange, TimeSeriesMetric, TimedVersion, TokenPagination, TokenSourceRequest, TokenSourceResponse, TrackCompositeEgressRequest, TrackEgressRequest, TrackInfo, TrackPermission, TrackPublishedResponse, TrackSource, TrackSubscribed, TrackType, TrackUnpublishedResponse, Transcription, TranscriptionSegment, TransferSIPParticipantRequest, TransferSIPParticipantResponse, TrickleRequest, UnpublishDataTrackRequest, UnpublishDataTrackResponse, UpdateDataSubscription, UpdateDataSubscription_Update, UpdateIngressRequest, UpdateJobStatus, UpdateLayoutRequest, UpdateLocalAudioTrack, UpdateLocalVideoTrack, UpdateParticipantMetadata, UpdateParticipantRequest, UpdateRoomMetadataRequest, UpdateSIPDispatchRuleRequest, UpdateSIPInboundTrunkRequest, UpdateSIPOutboundTrunkRequest, UpdateStreamRequest, UpdateSubscription, UpdateSubscriptionsRequest, UpdateSubscriptionsResponse, UpdateTrackSettings, UpdateVideoLayers, UpdateWorkerStatus, UserPacket, VP8MungerState, VideoCodec, VideoConfiguration, VideoLayer, VideoLayer_Mode, VideoQuality, WebEgressRequest, WebSource, WebhookConfig, WebhookEvent, WebhookInfo, WhatsAppCall, WhatsAppCallDirection, WorkerMessage, WorkerPing, WorkerPong, WorkerStatus, WrappedJoinRequest, WrappedJoinRequest_Compression, version };
//# sourceMappingURL=index.mjs.map
