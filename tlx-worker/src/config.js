// In-memory app config — loaded from DB on startup, updated in realtime by admin.
// Import this object anywhere to read current settings without DB round-trips.
export const config = {
  voiceEnabled: true,  // DB ghi đè khi khởi động
  fptSttApiKey: null,  // DB ghi đè khi khởi động; fallback sang env FPT_STT_API_KEY
  parseMode: "regex",  // "regex" | "both" | "ai"
  groqApiKey: null,    // Groq API key (ưu tiên đầu)
  geminiApiKey: null,  // Gemini API key (fallback)
};
