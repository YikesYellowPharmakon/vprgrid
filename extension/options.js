const baseEl = document.getElementById("base");
const syncEl = document.getElementById("sync");
const savedEl = document.getElementById("saved");

const DEFAULT_BASE = "http://127.0.0.1:8080";

chrome.storage.local.get(["appBase", "syncCode"]).then((st) => {
  baseEl.value = st.appBase || DEFAULT_BASE;
  syncEl.value = st.syncCode || "";
});

document.getElementById("save").addEventListener("click", async () => {
  const syncCode = syncEl.value.trim();
  if (syncCode) {
    try {
      const parsed = JSON.parse(syncCode);
      if (!parsed || !Array.isArray(parsed.entries)) throw new Error("bad");
    } catch {
      savedEl.textContent = "同步码不是有效 JSON,未保存";
      savedEl.style.opacity = "1";
      setTimeout(() => (savedEl.style.opacity = "0"), 2500);
      return;
    }
  }
  await chrome.storage.local.set({
    appBase: (baseEl.value.trim() || DEFAULT_BASE).replace(/\/+$/, ""),
    syncCode,
  });
  savedEl.textContent = "已保存";
  savedEl.style.opacity = "1";
  setTimeout(() => (savedEl.style.opacity = "0"), 2000);
});
