export function freezeCamera(video) {
  if (!video || typeof video.pause !== "function") return false;
  video.pause();
  return true;
}

export function getPrimaryCameraAction({ sourceMode, hasResult }) {
  return sourceMode === "camera" && hasResult ? "resume" : "measure";
}

export function isPrimaryCameraActionDisabled({ action, faceReady, busy, cooldown }) {
  if (busy) return true;
  if (action === "resume") return false;
  return !faceReady || cooldown > 0;
}

export async function resumeCamera(video) {
  if (!video?.srcObject || typeof video.play !== "function") return false;

  try {
    await video.play();
    return true;
  } catch {
    return false;
  }
}
