function safeFilename(value) {
  return String(value || "toledo-organizer.json")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "toledo-organizer.json";
}

function jsonFilename(value) {
  const name = safeFilename(value).replace(/\.json$/i, "").replace(/^\.+/, "") || "toledo-organizer";
  return `${name}.json`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "TOLEDO_ORGANIZER_DOWNLOAD_JSON") return false;
  if (sender?.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "Niet toegestaan." });
    return false;
  }

  try {
    const filename = jsonFilename(message.filename);
    const json = typeof message.json === "string" ? message.json : JSON.stringify(message.data ?? null, null, 2);
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;

    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: false,
        conflictAction: "uniquify"
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ ok: true, downloadId });
      }
    );
  } catch (error) {
    sendResponse({ ok: false, error: error?.message || String(error) });
  }

  return true;
});
